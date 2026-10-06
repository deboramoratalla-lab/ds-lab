// Documentation as part of the system: generated from the component spec (never from memory),
// written where designers work (Figma), and checked for drift like tokens are.

import { chat, parseJson } from "../llm/nebius.js";
import type { ComponentSpec } from "../migrate/component.js";
import { normalizeName } from "../tokens/load.js";

export interface ComponentDoc {
  summary: string;
  whenToUse: string[];
  whenNotToUse: string[];
  variants: Record<string, string>;
  sizes: Record<string, string>;
  tokens: string[];
}

const SYSTEM = `You write design system documentation for a component, for designers and engineers.
Use ONLY the facts in the spec given (variants, sizes, tokens). Do not invent props, states or behaviour.
Plain, short sentences. Answer JSON:
{"summary":"<1 sentence>","whenToUse":["..."],"whenNotToUse":["..."],
 "variants":{"<variant>":"<when to pick it, 1 sentence>"},"sizes":{"<size>":"<1 sentence>"}}`;

/** Super writes the prose; the facts (which variants, sizes and tokens exist) come from the spec. */
export async function writeDoc(spec: ComponentSpec, variants: string[], sizes: string[]): Promise<ComponentDoc> {
  const tokens = new Set<string>();
  const collect = (b: Record<string, { token?: string; value: string }>) => {
    for (const v of Object.values(b)) {
      if (v.token) tokens.add(v.token);
      for (const m of v.value.matchAll(/var\(--([\w-]+)/g)) tokens.add(normalizeName(m[1]));
    }
  };
  collect(spec.base);
  for (const axis of Object.values(spec.axes)) for (const b of Object.values(axis)) collect(b);

  const facts = { component: spec.name, variants, sizes, styles: { base: spec.base, ...spec.axes } };
  let doc: Omit<ComponentDoc, "tokens"> | undefined;
  for (let attempt = 0; attempt < 2 && !doc; attempt++) {
    const out = await chat({ role: "super", system: SYSTEM, user: JSON.stringify(facts), json: true, maxTokens: 2500 });
    try {
      const d = parseJson<Omit<ComponentDoc, "tokens">>(out);
      if (d.summary && Array.isArray(d.whenToUse) && Array.isArray(d.whenNotToUse) && d.variants && d.sizes) doc = d;
    } catch { /* malformed: retry */ }
  }
  if (!doc) throw new Error("Super did not return a valid doc after 2 attempts");
  // Keep only what the spec actually has, whatever the model returned.
  const pick = (o: Record<string, string>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? ""]));
  return { ...doc, variants: pick(doc.variants, variants), sizes: pick(doc.sizes, sizes), tokens: [...tokens].sort() };
}

/** Doc drift: variants/sizes that exist but aren't documented, and documented ones that no longer exist. */
export function docDrift(documentedText: string, variants: string[], sizes: string[]) {
  const text = documentedText.toLowerCase();
  const undocumented = [...variants, ...sizes].filter((n) => !new RegExp(`\\b${n}\\b`).test(text));
  const mentioned = [...text.matchAll(/\b(variant|size)[:=]\s*([a-z-]+)/g)].map((m) => m[2]);
  const stale = mentioned.filter((n) => ![...variants, ...sizes].includes(n));
  const total = variants.length + sizes.length;
  return { undocumented, stale, coverage: total ? (total - undocumented.length) / total : 1 };
}

export function docToMarkdown(name: string, d: ComponentDoc): string {
  return [
    `# ${name}`, d.summary, "",
    "## When to use", ...d.whenToUse.map((x) => `- ${x}`), "",
    "## When not to use", ...d.whenNotToUse.map((x) => `- ${x}`), "",
    "## Variants", ...Object.entries(d.variants).map(([k, v]) => `- variant=${k}: ${v}`), "",
    "## Sizes", ...Object.entries(d.sizes).map(([k, v]) => `- size=${k}: ${v}`), "",
    "## Tokens", ...d.tokens.map((t) => `- ${t}`),
  ].join("\n");
}
