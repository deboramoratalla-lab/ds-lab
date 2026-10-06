// Compares design tokens (source of design intent, e.g. Figma) with code tokens
// and reports drift. This is the first metric of the lab.
//
// Not every difference is drift. Figma and code often MODEL the same decision
// differently: a shadow is one CSS value but five Figma variables
// (shadow-x-blur, shadow-x-color, ...). Those are reported as "structural",
// separate from real drift, so the headline number is honest.

import type { TokenMap } from "./load.js";

export type DriftKind = "missing-in-code" | "missing-in-design" | "value-mismatch" | "structural";

export interface DriftItem {
  kind: DriftKind;
  name: string;
  design?: string;
  code?: string;
  /** structural only: the design-side parts that make up this code token */
  parts?: string[];
}

export interface DriftReport {
  items: DriftItem[];
  /** tokens seen on either side; a structural group counts once */
  total: number;
  inSync: number;
  /** 0..1 over all tokens, structural differences counted as out of sync */
  syncRate: number;
  /** 0..1 excluding structural differences: the real drift number */
  realSyncRate: number;
  counts: Record<DriftKind, number>;
}

export function compareTokens(design: TokenMap, code: TokenMap): DriftReport {
  const raw: DriftItem[] = [];
  let inSync = 0;
  for (const name of [...new Set([...design.keys(), ...code.keys()])].sort()) {
    const d = design.get(name);
    const c = code.get(name);
    if (d === undefined) raw.push({ kind: "missing-in-design", name, code: c });
    else if (c === undefined) raw.push({ kind: "missing-in-code", name, design: d });
    else if (d !== c) raw.push({ kind: "value-mismatch", name, design: d, code: c });
    else inSync++;
  }

  // Composite tokens: a code-only token whose name prefixes several design-only tokens.
  const designOnly = raw.filter((i) => i.kind === "missing-in-code").map((i) => i.name);
  const absorbed = new Set<string>();
  const items: DriftItem[] = [];
  for (const item of raw) {
    if (item.kind === "missing-in-design") {
      const parts = designOnly.filter((n) => n.startsWith(item.name + "-"));
      if (parts.length >= 2) {
        parts.forEach((p) => absorbed.add(p));
        items.push({ kind: "structural", name: item.name, code: item.code, parts });
        continue;
      }
    }
    items.push(item);
  }
  const final = items.filter((i) => !(i.kind === "missing-in-code" && absorbed.has(i.name)));

  const counts = { "missing-in-code": 0, "missing-in-design": 0, "value-mismatch": 0, structural: 0 };
  for (const i of final) counts[i.kind]++;
  const total = inSync + final.length;
  const realTotal = total - counts.structural;
  return {
    items: final,
    total,
    inSync,
    syncRate: total ? inSync / total : 1,
    realSyncRate: realTotal ? inSync / realTotal : 1,
    counts,
  };
}
