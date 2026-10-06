// Ultra agent: for each token whose value differs between Figma and code, decides which side
// is the source of truth, or that a person must decide. This is the judgment a design system
// team makes by hand today, and the one a sync strategy most often gets wrong.

import { chat, parseJson } from "../llm/nebius.js";
import type { DriftItem } from "../tokens/drift.js";

export type Verdict = "design-is-right" | "code-is-right" | "ask-a-human";

export interface Resolution {
  name: string;
  design: string;
  code: string;
  verdict: Verdict;
  confidence: number;
  why: string;
  /** what to change, on which side */
  action: string;
}

export interface Evidence {
  /** token descriptions, e.g. from the Figma export or docs */
  descriptions?: Map<string, string>;
  /** tokens the code marks as deprecated */
  deprecated?: Set<string>;
  /** where each side's value is used, e.g. "used by 14 components" */
  usage?: Map<string, string>;
  /** what people wrote about the change: Figma notes, commit messages */
  notes?: Record<string, string>;
}

const SYSTEM = `You are a senior design system lead. A token has different values in Figma and in code.
Decide which side holds the intended decision. Use the evidence given: names, descriptions, deprecations,
how values relate to the rest of the scale, platform constraints (fonts, units, OS stacks).
Typical patterns: code font stacks list fallbacks that Figma cannot express; code may lag behind a Figma redesign;
Figma may hold a stale value after an engineering fix. If the evidence does not support a call, say "ask-a-human".
Be concrete and brief.
Answer JSON: {"verdict":"design-is-right"|"code-is-right"|"ask-a-human","confidence":0..1,"why":"<1-2 sentences>","action":"<what to change and where>"}`;

export async function resolveConflicts(items: DriftItem[], ev: Evidence = {}): Promise<Resolution[]> {
  const conflicts = items.filter((i) => i.kind === "value-mismatch");
  return Promise.all(
    conflicts.map(async (c) => {
      const facts = [
        `Token: ${c.name}`,
        `Figma value: ${c.design}`,
        `Code value: ${c.code}`,
        ev.descriptions?.get(c.name) && `Description: ${ev.descriptions.get(c.name)}`,
        ev.deprecated?.has(c.name) && `Code marks this token as deprecated.`,
        ev.usage?.get(c.name) && `Usage: ${ev.usage.get(c.name)}`,
        ev.notes?.[c.name] && `History: ${ev.notes[c.name]}`,
      ].filter(Boolean).join("\n");
      const out = await chat({ role: "ultra", system: SYSTEM, user: facts, json: true, think: true });
      const r = parseJson<Omit<Resolution, "name" | "design" | "code">>(out);
      return { name: c.name, design: c.design!, code: c.code!, ...r };
    }),
  );
}
