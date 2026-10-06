// Compares design tokens (source of design intent, e.g. Figma) with code tokens
// and reports drift. This is the first metric of the lab.

import type { TokenMap } from "./load.js";

export type DriftKind = "missing-in-code" | "missing-in-design" | "value-mismatch";

export interface DriftItem {
  kind: DriftKind;
  name: string;
  design?: string;
  code?: string;
}

export interface DriftReport {
  items: DriftItem[];
  total: number; // tokens seen on either side
  inSync: number;
  /** 0..1, share of tokens that exist on both sides with the same value */
  syncRate: number;
}

export function compareTokens(design: TokenMap, code: TokenMap): DriftReport {
  const items: DriftItem[] = [];
  const names = new Set([...design.keys(), ...code.keys()]);
  let inSync = 0;
  for (const name of [...names].sort()) {
    const d = design.get(name);
    const c = code.get(name);
    if (d === undefined) items.push({ kind: "missing-in-design", name, code: c });
    else if (c === undefined) items.push({ kind: "missing-in-code", name, design: d });
    else if (d !== c) items.push({ kind: "value-mismatch", name, design: d, code: c });
    else inSync++;
  }
  return { items, total: names.size, inSync, syncRate: names.size ? inSync / names.size : 1 };
}
