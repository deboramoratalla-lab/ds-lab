// Nano agent: pairs tokens that exist on both sides under different names
// (renames, typos, a token moved to another group). Deterministic normalization
// already caught case and separator differences; this catches what's left.
// Every proposed pair is then checked by value in code, not trusted blindly.

import { chat, parseJson } from "../llm/nebius.js";
import type { DriftItem } from "../tokens/drift.js";

export interface Match { design: string; code: string; confidence: number; sameValue: boolean }

const SYSTEM = `You match design tokens between Figma and code.
You get two lists of token names that did not match exactly. Pair names that refer to the SAME design decision
(renamed, reordered segments, singular/plural, abbreviations, moved group). Do not pair tokens just because they
are in the same family. Only return pairs you are reasonably sure about.
Answer JSON: {"pairs":[{"design":"<name>","code":"<name>","confidence":0..1}]}`;

export async function matchRenamed(items: DriftItem[], batch = 120): Promise<Match[]> {
  const designOnly = items.filter((i) => i.kind === "missing-in-code");
  const codeOnly = items.filter((i) => i.kind === "missing-in-design");
  if (!designOnly.length || !codeOnly.length) return [];
  const dVal = new Map(designOnly.map((i) => [i.name, i.design]));
  const cVal = new Map(codeOnly.map((i) => [i.name, i.code]));

  const matches: Match[] = [];
  for (let i = 0; i < designOnly.length; i += batch) {
    const out = await chat({
      role: "nano",
      system: SYSTEM,
      json: true,
      user: `Figma only:\n${designOnly.slice(i, i + batch).map((x) => x.name).join("\n")}\n\nCode only:\n${codeOnly.map((x) => x.name).join("\n")}`,
    });
    for (const p of parseJson<{ pairs: { design: string; code: string; confidence: number }[] }>(out).pairs ?? []) {
      if (!dVal.has(p.design) || !cVal.has(p.code)) continue; // hallucinated name
      matches.push({ ...p, sameValue: dVal.get(p.design) === cVal.get(p.code) });
    }
  }
  return matches;
}
