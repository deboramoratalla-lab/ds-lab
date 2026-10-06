// Uses the design system's OWN documentation as the source, instead of writing docs from scratch.
// For Primer that's generated/components.json, the same data that powers primer.style.
// The lab's job is to keep it in sync with the component everywhere it lives, not to rewrite it.

import { readFileSync } from "node:fs";

export interface OfficialProp { name: string; type: string; defaultValue?: string; description?: string }
export interface OfficialDoc {
  name: string;
  status?: string;
  a11yReviewed?: string;
  importPath?: string;
  props: OfficialProp[];
  stories: { id: string; code: string }[];
}

export function loadPrimerDoc(componentsJson: string, name: string): OfficialDoc {
  const data = JSON.parse(readFileSync(componentsJson, "utf8"));
  const all = Object.values(data.components ?? data) as any[];
  const c = all.find((x) => x.name === name);
  if (!c) throw new Error(`${name} not found in ${componentsJson}`);
  return {
    name: c.name, status: c.status, a11yReviewed: c.a11yReviewed, importPath: c.importPath,
    props: (c.props ?? []).map((p: any) => ({
      name: p.name, type: String(p.type ?? "").replace(/\s*\n\s*/g, " "),
      defaultValue: p.defaultValue || undefined, description: p.description || undefined,
    })),
    stories: c.stories ?? [],
  };
}

/** Options of a union-of-literals prop, e.g. variant: 'default' | 'primary' -> ["default", "primary"]. */
export function propOptions(doc: OfficialDoc, prop: string): string[] {
  const p = doc.props.find((x) => x.name === prop);
  return p ? [...p.type.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}

/**
 * Which options have a Storybook story, read from the stories' JSX (e.g. <Button variant="danger">).
 * A component rendered with no prop counts for that prop's default value.
 */
export function storybookAxes(doc: OfficialDoc, axes: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const axis of axes) {
    const found = new Set<string>();
    const def = doc.props.find((p) => p.name === axis)?.defaultValue?.replace(/'/g, "");
    for (const s of doc.stories) {
      const tags = [...s.code.matchAll(new RegExp(`<${doc.name}\\b[^>]*>`, "g"))].map((m) => m[0]);
      for (const tag of tags) {
        const m = tag.match(new RegExp(`\\b${axis}=["'{]+([\\w-]+)`));
        if (m) found.add(m[1]);
        else if (def) found.add(def);
      }
    }
    out[axis] = [...found];
  }
  return out;
}

export interface DocDriftItem { axis: string; option: string; inDocs: boolean; inCode: boolean; inFigma: boolean; inStorybook: boolean }

/** Compares docs, code, Figma and Storybook, option by option: where each variant/size exists. */
export function fourWayDrift(
  doc: OfficialDoc,
  codeAxes: Record<string, string[]>,
  figmaAxes: Record<string, string[]>,
  storyAxes: Record<string, string[]>,
) {
  const items: DocDriftItem[] = [];
  for (const axis of new Set([...Object.keys(codeAxes), ...Object.keys(figmaAxes)])) {
    const docs = propOptions(doc, axis), code = codeAxes[axis] ?? [], figma = figmaAxes[axis] ?? [], sb = storyAxes[axis] ?? [];
    for (const option of new Set([...docs, ...code, ...figma, ...sb]))
      items.push({ axis, option, inDocs: docs.includes(option), inCode: code.includes(option), inFigma: figma.includes(option), inStorybook: sb.includes(option) });
  }
  const gaps = items.filter((i) => !(i.inDocs && i.inCode && i.inFigma && i.inStorybook));
  return { items, gaps, inSync: items.length - gaps.length, total: items.length };
}
