// Collects everything the console shows from REAL runs: certification, the 5 breaks,
// the agent's repair (with Nemotron calls), the person's decision, the benchmark (Tavily),
// and the stored strategy-lab run. Writes console/data.json.

import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { certifyPrimer, sharedTokens, type PrimerCertifyInput } from "../certify-primer.js";
import { BREAKS, makeWorkspace, primerInput } from "../demo/breaks.js";
import { repair, resolveItem, AUTO_APPLY } from "../demo/repair.js";
import { reopen } from "../lab/component-lab.js";
import { buttonOptionResearch } from "../research/option-research.js";
import { extractComponent } from "../migrate/component.js";
import { loadTokens, normalizeName } from "../tokens/load.js";
import { usage } from "../llm/nebius.js";

const sum = (cs: { passed: number; total: number }[]) => cs.reduce((a, c) => ({ passed: a.passed + c.passed, total: a.total + c.total }), { passed: 0, total: 0 });
const slim = (r: ReturnType<typeof certifyPrimer>) => ({ checks: r.checks.map((c) => ({ ...c, issues: c.issues.slice(0, 40) })), warnings: r.warnings, ok: r.ok, ...sum(r.checks) });

const base = primerInput();
const certified = certifyPrimer(base);
const baselineShared = sharedTokens(base);

const ws = makeWorkspace("out/broken");
for (const b of BREAKS) b.apply(ws.w);
const broken = certifyPrimer({ ...ws.input, baselineShared });

const t0 = Date.now();
const r = await repair(ws.w, ws.input, base, baselineShared, Object.assign({}, ...BREAKS.map((b) => b.notes ?? {})),
  { research: buttonOptionResearch(ws.input.buttonCss) });
const repairMs = Date.now() - t0;
const repaired = certifyPrimer({ ...ws.input, baselineShared, renames: r.renames });
const calls = Object.fromEntries(Object.entries(usage).map(([m, u]) => [m, { ...u }]));

// the person's answers: approve every review/proposal, and keep Figma or code on each conflict
const decide = r.items.find((i) => i.kind === "decide");
const tok = decide?.token ?? "";
const decisions: Record<string, Record<string, ReturnType<typeof slim>>> = { [tok]: {} };
for (const side of ["figma", "code"] as const) {
  const dir = `out/decide-${side}`;
  cpSync("out/broken", dir, { recursive: true });
  const input = JSON.parse(JSON.stringify(ws.input).replaceAll("out/broken", dir)) as PrimerCertifyInput;
  const w = reopen(dir).w;
  const renames = { ...r.renames };
  for (const item of r.items) {
    if (item.kind === "decide") resolveItem(w, input, item, side);
    else { resolveItem(w, input, item, "approve"); if (item.change?.type === "rename") renames[item.change.from!] = item.change.to!; }
  }
  decisions[tok][side] = slim(certifyPrimer({ ...input, baselineShared, renames }));
}
const bench = (r.items.find((i) => i.kind === "proposal")?.research as any) ?? null;

const lab = JSON.parse(readFileSync("fixtures/lab-run.json", "utf8"));
const figmaVars = Object.keys(Object.assign({}, ...readdirSync(base.figmaTokens).map((x) => JSON.parse(readFileSync(`${base.figmaTokens}/${x}`, "utf8"))))).length;
const pkg = (p: string) => JSON.parse(readFileSync(p, "utf8")).version;

writeFileSync("console/data.json", JSON.stringify({
  generatedAt: new Date().toISOString(),
  system: { name: "Primer Web", theme: "light", component: "Button" },
  sources: [
    { id: "figma", name: "Figma", detail: "Primer Web (Community), duplicated and aligned", count: figmaVars, unit: "variables" },
    { id: "code", name: "Code", detail: `@primer/primitives ${pkg("fixtures/package/package.json")} · @primer/react ${pkg("fixtures/primer-react/package/package.json")}`, count: loadTokens(base.codeTokens).size, unit: "tokens" },
    { id: "storybook", name: "Storybook", detail: "primer/react Button stories (main)", count: base.stories.length, unit: "story files" },
    { id: "docs", name: "Docs", detail: "@primer/react generated/components.json (primer.style)", count: 1, unit: "component" },
  ],
  certified: slim(certified),
  breaks: BREAKS.map((b) => ({ id: b.id, who: b.who, title: b.title, notes: b.notes ?? {} })),
  broken: slim(broken),
  repair: { actions: r.actions, items: r.items, pending: r.pending, pendingTokens: tok ? [tok] : [], renames: r.renames, ms: repairMs, calls, journal: r.journal.map((e) => ({ id: e.id, at: e.at, what: e.what, files: Object.keys(e.files).length, undo: e.inverse ? "token" : "files" })), autoApply: AUTO_APPLY },
  repaired: slim(repaired),
  decisions,
  benchmark: bench,
  lab: { script: lab.script, runs: lab.runs.map((x: any) => ({ strategy: x.strategy, breaksAt: x.breaksAt ?? null, ms: x.ms,
    steps: x.steps.map((s: any) => ({ event: s.event, keptNow: s.keptNow, syncRate: s.syncRate, silentOverwrites: s.silentOverwrites.length, pendingHuman: s.pendingHuman.length })) })), usage: lab.usage },
}, null, 1));
console.log("console/data.json written", { repairMs, queue: r.items.map((i) => i.kind), repaired: sum(repaired.checks), final: sum(decisions[tok].code.checks) });
