// Certifies that a design system is in sync across Figma, code, Storybook and docs.
// Every check is deterministic: no model calls. The agents act on what this reports.

import { readFileSync } from "node:fs";
import { flattenJson, loadTokens } from "./tokens/load.js";
import { compareTokens } from "./tokens/drift.js";
import { extractComponent, expectedBindings, verifyBindings } from "./migrate/component.js";
import { loadPrimerDoc, propOptions, fourWayDrift } from "./docs/primer.js";

export interface CertifyInput {
  figmaSnapshot: string;      // baseline/figma/snapshot.json
  codeTokens: string;         // baseline/code/tokens.css
  componentCss: string;       // baseline/code/button.css
  baseClass: string;          // ds-Button
  docs: string;               // baseline/docs/components.json
  stories: string;            // baseline/stories/button.stories.js
  component: string;          // Button
}

export interface Check { area: string; passed: number; total: number; issues: string[] }

/** Variant/size options that have a story, read from a CSF file (default args + each story's args). */
export function storyOptions(csf: string, axes: string[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = Object.fromEntries(axes.map((a) => [a, new Set<string>()]));
  const defaults = csf.match(/export default\s*\{[\s\S]*?args:\s*\{([^}]*)\}/)?.[1] ?? "";
  const val = (block: string, axis: string) => block.match(new RegExp(`${axis}:\\s*["']([\\w-]+)["']`))?.[1];
  for (const m of csf.matchAll(/export const \w+\s*=\s*\{\s*args:\s*\{([^}]*)\}/g))
    for (const axis of axes) { const v = val(m[1], axis) ?? val(defaults, axis); if (v) out[axis].add(v); }
  return Object.fromEntries(Object.entries(out).map(([k, s]) => [k, [...s]]));
}

export function certify(i: CertifyInput): { checks: Check[]; ok: boolean } {
  const snap = JSON.parse(readFileSync(i.figmaSnapshot, "utf8"));
  const doc = loadPrimerDoc(i.docs, i.component);
  const axes = ["variant", "size"];
  const checks: Check[] = [];

  // 1. Tokens: Figma variables vs code
  const tokens = compareTokens(flattenJson(snap.tokens), loadTokens(i.codeTokens));
  checks.push({ area: "Tokens (Figma ↔ code)", passed: tokens.inSync, total: tokens.total,
    issues: tokens.items.map((x) => `${x.kind} ${x.name}${x.design || x.code ? ` (Figma ${x.design ?? "—"} · code ${x.code ?? "—"})` : ""}`) });

  // 2. Component: every Figma property bound to the token the code uses
  const spec = extractComponent(i.component, i.componentCss, i.baseClass, axes.map((a) => `data-${a}`));
  const variants = propOptions(doc, "variant"), sizes = propOptions(doc, "size");
  const b = verifyBindings(expectedBindings(spec, variants, sizes), snap.bindings);
  checks.push({ area: "Component bindings (Figma ↔ code)", passed: b.checked - b.diffs.length, total: b.checked,
    issues: b.diffs.map((d) => `${d.variant} ${d.property}: Figma ${d.actual ?? "—"} · code ${d.expected ?? "—"}`) });

  // 3. Options in all four places
  const code = Object.fromEntries(axes.map((a) => {
    const def = doc.props.find((p) => p.name === a)?.defaultValue?.replace(/'/g, "");
    return [a, [...new Set([...(def ? [def] : []), ...Object.keys(spec.axes[a] ?? {})])]];
  }));
  const four = fourWayDrift(doc, code, snap.options, storyOptions(readFileSync(i.stories, "utf8"), axes));
  checks.push({ area: "Options (docs · code · Figma · Storybook)", passed: four.inSync, total: four.total,
    issues: four.gaps.map((g) => `${g.axis}=${g.option}: missing in ${[!g.inDocs && "docs", !g.inCode && "code", !g.inFigma && "Figma", !g.inStorybook && "Storybook"].filter(Boolean).join(", ")}`) });

  // 4. Docs in Figma say what the docs say
  const desc: string = snap.description ?? "";
  const facts = [
    [`status ${doc.status}`, new RegExp(`status:\\s*${doc.status}`, "i").test(desc)],
    [`accessibility reviewed ${doc.a11yReviewed}`, !doc.a11yReviewed || desc.includes(doc.a11yReviewed)],
    ...[...variants, ...sizes].map((o) => [`mentions ${o}`, new RegExp(`\\b${o}\\b`).test(desc)]),
  ] as [string, boolean][];
  checks.push({ area: "Docs in Figma (description ↔ docs)", passed: facts.filter((f) => f[1]).length, total: facts.length,
    issues: facts.filter((f) => !f[1]).map((f) => `Figma description doesn't say: ${f[0]}`) });

  return { checks, ok: checks.every((c) => c.passed === c.total) };
}
