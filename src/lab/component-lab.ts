// The lab on the real system: the same 5 changes (demo/break-script.md) applied to certified
// Primer Web, then each sync strategy reconciles. Runs locally or inside a Token Factory Sandbox
// (one fork per strategy from the same "broken" checkpoint). Prints one JSON result.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { certifyPrimer, sharedTokens, type PrimerCertifyInput } from "../certify-primer.js";
import { BREAKS, makeWorkspace, primerInput, type Workspace } from "../demo/breaks.js";
import { repair } from "../demo/repair.js";
import { loadTokens, normalizeName } from "../tokens/load.js";
import { compareTokens } from "../tokens/drift.js";
import { usage } from "../llm/nebius.js";

export type StrategyId = "manual" | "figma-first" | "code-first" | "agent";
export const STRATEGIES: { id: StrategyId; name: string; description: string }[] = [
  { id: "manual", name: "Manual", description: "Each side edits on its own; nobody syncs until someone notices." },
  { id: "figma-first", name: "Figma first", description: "Figma variables are exported and regenerate the code. Code-only changes are overwritten." },
  { id: "code-first", name: "Code first", description: "Code tokens are pushed into Figma variables. Figma-only changes are overwritten; components aren't touched." },
  { id: "agent", name: "DS Lab agent", description: "Merges from the last certification: Nano pairs renames, Ultra judges one-sided changes, rules fix bindings and variants, a person decides when both sides changed." },
];

const figmaKeys = (input: PrimerCertifyInput) =>
  Object.keys(Object.assign({}, ...readdirSync(input.figmaTokens).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${input.figmaTokens}/${f}`, "utf8")))));

/** Step 1: certified system + the 5 changes, in `dir`. */
export function prepare(dir: string) {
  const ws = makeWorkspace(dir);
  for (const b of BREAKS) b.apply(ws.w);
  return ws;
}

/** Reopen an existing workspace (e.g. a sandbox fork) without resetting it. */
export function reopen(dir: string): { w: Workspace; input: PrimerCertifyInput } {
  const base = primerInput();
  const input: PrimerCertifyInput = { ...base, figmaTokens: `${dir}/figma`, codeTokens: `${base.codeTokens},${dir}/commits.css`,
    buttonSnapshot: `${dir}/button-snapshot.json`, buttonCss: `${dir}/ButtonBase.css`, docs: `${dir}/components.json`,
    stories: base.stories.map((f) => `${dir}/${f.split("/").pop()}`) };
  const json = (f: string, edit: (x: any) => void) => { const x = JSON.parse(readFileSync(f, "utf8")); edit(x); writeFileSync(f, JSON.stringify(x)); };
  const app = (f: string, s: string) => writeFileSync(f, readFileSync(f, "utf8") + s);
  const w: Workspace = {
    dir,
    figma(edit) {
      const parts = readdirSync(input.figmaTokens).filter((f) => f.endsWith(".json")).map((f) => `${input.figmaTokens}/${f}`);
      const all: Record<string, unknown> = {}, owner = new Map<string, string>();
      for (const p of parts) for (const [k, v] of Object.entries(JSON.parse(readFileSync(p, "utf8")))) { all[k] = v; owner.set(k, p); }
      edit(all);
      const out = new Map(parts.map((p) => [p, {} as Record<string, unknown>]));
      for (const [k, v] of Object.entries(all)) out.get(owner.get(k) ?? parts[parts.length - 1])![k] = v;
      for (const [p, x] of out) writeFileSync(p, JSON.stringify(x));
    },
    snapshot: (edit) => json(input.buttonSnapshot, edit),
    codeOverride: (css) => app(`${dir}/commits.css`, `:root {\n${css}\n}\n`),
    buttonCss: (css) => app(input.buttonCss, css),
    docs: (edit) => json(input.docs, edit),
    story: (src) => app(`${dir}/Button.features.stories.tsx`, src),
  };
  return { w, input };
}

/** Step 2: one strategy reconciles the workspace. */
export async function runStrategy(id: StrategyId, dir: string) {
  const { w, input } = reopen(dir);
  const base = primerInput();
  const baselineShared = sharedTokens(base);
  const notes = Object.assign({}, ...BREAKS.map((b) => b.notes ?? {}));
  const t0 = Date.now();
  let pending: string[] = [], renames: Record<string, string> = {}, actions: unknown[] = [], items: any[] = [];
  const figma = loadTokens(input.figmaTokens), code = loadTokens(input.codeTokens);
  const drift = compareTokens(figma, code);
  const fk = (t: string) => figmaKeys(input).find((k) => normalizeName(k) === t);

  if (id === "figma-first") {
    // export Figma → regenerate code: Figma values win, new Figma names appear in code, code-only work disappears
    const lines = drift.items.filter((x) => x.kind === "value-mismatch").map((x) => `  --${fk(x.name)!.replace(/\//g, "-")}: ${x.design};`);
    for (const x of drift.items.filter((x) => x.kind === "missing-in-code" && !loadTokens(base.figmaTokens).has(x.name)))
      lines.push(`  --${fk(x.name)!.replace(/\//g, "-")}: ${x.design};`);
    if (lines.length) w.codeOverride(lines.join("\n"));
    // the component is generated from Figma, which has no xsmall: the code's new size is dropped
    writeFileSync(input.buttonCss, readFileSync(base.buttonCss, "utf8"));
    writeFileSync(input.docs, readFileSync(base.docs, "utf8"));
    actions = [`${lines.length} code tokens overwritten or added from Figma`, "Button CSS regenerated from Figma (xsmall dropped)"];
  } else if (id === "code-first") {
    // push code → Figma variables: code values win; a Figma-side rename is undone; components untouched
    w.figma((v) => {
      for (const x of drift.items.filter((x) => x.kind === "value-mismatch")) v[fk(x.name)!] = x.code;
      for (const k of baselineShared) if (!figma.has(k) && code.has(k)) {
        const orig = figmaKeys({ ...input, figmaTokens: base.figmaTokens }).find((n) => normalizeName(n) === k);
        if (orig) v[orig] = code.get(k);
      }
    });
    actions = ["Figma variables overwritten from code", "renamed Figma variable re-created under its old name"];
  } else if (id === "agent") {
    const r = await repair(w, input, base, baselineShared, notes);
    pending = r.pending; renames = r.renames; actions = r.actions; items = r.items;
  }

  const report = certifyPrimer({ ...input, baselineShared, renames });
  const f2 = loadTokens(input.figmaTokens), c2 = loadTokens(input.codeTokens);
  const snap = JSON.parse(readFileSync(input.buttonSnapshot, "utf8"));
  const stories = input.stories.map((f) => readFileSync(f, "utf8")).join("\n");
  const both = (t: string, v: string) => f2.get(t) === v && c2.get(t) === v;
  const dangerBound = ["small", "medium", "large"].every((s) => snap.bindings[`variant=danger, size=${s}`]?.bg === "button/danger/bgColor/rest");
  const inv = "button-invisible-fg-color-rest";
  const kept = {
    silent: both("button-danger-bg-color-rest", "#ffebe9") && dangerBound,
    // kept = applied, or held in the queue for a person without losing either side's work
    rename: (f2.has("control-medium-gap-inline") && c2.has("control-medium-gap-inline")) || items.some((i) => i.change?.type === "rename"),
    hotfix: both("button-primary-bg-color-hover", "#1a7f37"),
    xsmall: (!!snap.bindings["variant=default, size=xsmall"] && /size="xsmall"/.test(stories) && /data-size=xsmall/.test(readFileSync(input.buttonCss, "utf8")))
      || (items.some((i) => i.kind === "proposal" && i.change?.option === "xsmall") && /data-size=xsmall/.test(readFileSync(input.buttonCss, "utf8"))),
    // a conflict is handled well only if nobody's change was overwritten without a person deciding
    conflict: pending.some((p) => p.startsWith(inv)),
  };
  const overwrote = f2.get(inv) === c2.get(inv) && !pending.length
    ? (f2.get(inv) === "#0969da" ? "engineer's change overwritten" : f2.get(inv) === "#59636e" ? "designer's change overwritten" : "") : "";
  const sum = report.checks.reduce((a, c) => ({ p: a.p + c.passed, t: a.t + c.total }), { p: 0, t: 0 });
  return {
    strategy: id, ms: Date.now() - t0, kept, keptCount: Object.values(kept).filter(Boolean).length,
    checks: report.checks.map((c) => ({ area: c.area, passed: c.passed, total: c.total, issues: c.issues.slice(0, 5) })),
    passed: sum.p, total: sum.t, pending, overwrote, actions, queue: items.map((i) => ({ id: i.id, kind: i.kind, title: i.title })),
    calls: Object.fromEntries(Object.entries(usage).map(([m, u]) => [m, u.calls])),
  };
}

// CLI: node lab.mjs prepare <dir> | node lab.mjs run <strategy> <dir>
const [, , cmd, a, b] = process.argv;
if (cmd === "prepare") { prepare(a); console.log(JSON.stringify({ prepared: a, broken: certifyPrimer({ ...reopen(a).input, baselineShared: sharedTokens(primerInput()) }).checks.map((c) => [c.area, c.passed, c.total]) })); }
if (cmd === "run") console.log(JSON.stringify(await runStrategy(a as StrategyId, b)));
