// The sync strategies the lab compares. Each takes the current state of both sides (after a
// change) and the last synced state, and returns the reconciled state.

import { clone, type State, type Strategy, type Decision } from "./types.js";
import type { TokenMap } from "../tokens/load.js";
import { compareTokens } from "../tokens/drift.js";
import { matchRenamed } from "../agents/matcher.js";
import { resolveConflicts } from "../agents/resolver.js";

/** One-way pipeline (what most token build setups do): target takes the source's values and
 *  additions; target-only tokens are left alone; deletions in the source don't propagate. */
function oneWay(from: TokenMap, to: TokenMap): TokenMap {
  const out = new Map(to);
  for (const [k, v] of from) out.set(k, v);
  return out;
}

export const manual: Strategy = {
  id: "manual",
  name: "No sync (status quo)",
  description: "Each side is edited on its own; someone syncs by hand later.",
  async sync(s) { return { state: clone(s), decisions: [] }; },
};

export const figmaFirst: Strategy = {
  id: "figma-first",
  name: "Figma is the source of truth",
  description: "Tokens are exported from Figma and regenerate the code on every change.",
  async sync(s) { return { state: { design: new Map(s.design), code: oneWay(s.design, s.code) }, decisions: [] }; },
};

export const codeFirst: Strategy = {
  id: "code-first",
  name: "Code is the source of truth",
  description: "Tokens live in the repo and are pushed to Figma variables on every change.",
  async sync(s) { return { state: { design: oneWay(s.code, s.design), code: new Map(s.code) }, decisions: [] }; },
};

/**
 * Three-way merge against the last synced state, with Nemotron for the judgment calls:
 * a change on one side propagates to the other (including deletions), renames are detected by
 * Nano, and tokens changed differently on both sides go to Ultra, which may hand them to a person.
 */
export const agent: Strategy = {
  id: "agent",
  name: "DS Lab agent (3-way merge + Nemotron)",
  description: "Propagates changes from either side, detects renames, resolves conflicts or asks a person.",
  async sync(s, base, notes) {
    const out = clone(s);
    const decisions: Decision[] = [];
    const names = new Set([...s.design.keys(), ...s.code.keys(), ...base.design.keys(), ...base.code.keys()]);

    // renames: removed on one side + added on that same side with the same value
    const renamed = new Map<string, string>(); // old -> new
    for (const side of ["design", "code"] as const) {
      const removed = [...base[side].keys()].filter((k) => !s[side].has(k));
      const added = [...s[side].keys()].filter((k) => !base[side].has(k));
      if (!removed.length || !added.length) continue;
      const items = [
        ...added.map((name) => ({ kind: "missing-in-code" as const, name, design: s[side].get(name) })),
        ...removed.map((name) => ({ kind: "missing-in-design" as const, name, code: base[side].get(name) })),
      ];
      for (const m of await matchRenamed(items)) if (m.sameValue && m.confidence >= 0.7) {
        renamed.set(m.code, m.design);
        decisions.push({ token: m.code, how: "agent", detail: `${side} renamed ${m.code} → ${m.design} (Nano, ${Math.round(m.confidence * 100)}%)` });
      }
    }
    for (const [oldName, newName] of renamed) {
      for (const side of ["design", "code"] as const) {
        const v = out[side].get(oldName) ?? out[side].get(newName);
        out[side].delete(oldName);
        if (v !== undefined) out[side].set(newName, v);
      }
      names.delete(oldName);
    }

    const conflicts: { kind: "value-mismatch"; name: string; design: string; code: string }[] = [];
    for (const k of names) {
      if (renamed.has(k)) continue;
      const b = base.design.get(k) ?? base.code.get(k);
      const d = out.design.get(k), c = out.code.get(k);
      const dChanged = d !== base.design.get(k), cChanged = c !== base.code.get(k);
      if (d === c) continue;
      if (dChanged && !cChanged) { d === undefined ? out.code.delete(k) : out.code.set(k, d); decisions.push({ token: k, how: "auto", detail: "designer change propagated to code" }); }
      else if (cChanged && !dChanged) { c === undefined ? out.design.delete(k) : out.design.set(k, c); decisions.push({ token: k, how: "auto", detail: "engineer change propagated to Figma" }); }
      else if (dChanged && cChanged && d !== undefined && c !== undefined) conflicts.push({ kind: "value-mismatch", name: k, design: d, code: c });
      void b;
    }

    for (const r of await resolveConflicts(conflicts, { notes })) {
      if (r.verdict === "design-is-right") out.code.set(r.name, r.design);
      else if (r.verdict === "code-is-right") out.design.set(r.name, r.code);
      decisions.push({ token: r.name, how: r.verdict === "ask-a-human" ? "ask-a-human" : "agent", detail: `${r.verdict}: ${r.why}` });
    }
    return { state: out, decisions };
  },
};

export const STRATEGIES = [manual, figmaFirst, codeFirst, agent];

export const syncRate = (s: State) => compareTokens(s.design, s.code).realSyncRate;
