// Collects everything the console shows from REAL runs: certification, the 5 breaks,
// the agent's repair (with Nemotron calls), the person's decision, the benchmark (Tavily),
// and the stored strategy-lab run. Writes console/data.json.

import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { certifyPrimer, sharedTokens, type PrimerCertifyInput } from "../certify-primer.js";
import { BREAKS, makeWorkspace, primerInput } from "../demo/breaks.js";
import { repair } from "../demo/repair.js";
import { benchmark } from "../research/benchmark.js";
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
const r = await repair(ws.w, ws.input, base, baselineShared, Object.assign({}, ...BREAKS.map((b) => b.notes ?? {})));
const repairMs = Date.now() - t0;
const repaired = certifyPrimer({ ...ws.input, baselineShared, renames: r.renames });
const calls = Object.fromEntries(Object.entries(usage).map(([m, u]) => [m, { ...u }]));

// the person's decision on each pending conflict, computed for both choices
const figmaKey = (input: PrimerCertifyInput, tok: string) =>
  Object.keys(Object.assign({}, ...readdirSync(input.figmaTokens).map((x) => JSON.parse(readFileSync(`${input.figmaTokens}/${x}`, "utf8"))))).find((k) => normalizeName(k) === tok)!;
const pendingTokens = r.pending.map((p) => p.split(":")[0]);
const decisions: Record<string, Record<string, ReturnType<typeof slim>>> = {};
for (const tok of pendingTokens) {
  decisions[tok] = {};
  for (const side of ["figma", "code"]) {
    const dir = `out/decide-${side}`;
    cpSync("out/broken", dir, { recursive: true });
    const input = JSON.parse(JSON.stringify(ws.input).replaceAll("out/broken", dir)) as PrimerCertifyInput;
    const f = loadTokens(input.figmaTokens), c = loadTokens(input.codeTokens), fk = figmaKey(input, tok);
    if (side === "figma") writeFileSync(`${dir}/commits.css`, readFileSync(`${dir}/commits.css`, "utf8") + `:root {\n  --${fk.replace(/\//g, "-")}: ${f.get(tok)};\n}\n`);
    else for (const p of readdirSync(input.figmaTokens)) {
      const path = `${input.figmaTokens}/${p}`, x = JSON.parse(readFileSync(path, "utf8"));
      if (fk in x) { x[fk] = c.get(tok); writeFileSync(path, JSON.stringify(x)); }
    }
    decisions[tok][side] = slim(certifyPrimer({ ...input, baselineShared, renames: r.renames }));
  }
}

// benchmark for the new option (Tavily + Super)
const spec = extractComponent("Button", ws.input.buttonCss, "prc-Button-ButtonBase", ["data-variant", "data-size"]);
const px = (v?: string) => { const f = v?.match(/([\d.]+)rem\)?$/)?.[1]; return f ? `${parseFloat(f) * 16}px` : v ?? "—"; };
const st = spec.axes.size.xsmall;
const scale: Record<string, string> = { medium: px(spec.base.height?.value) };
for (const [k, v] of Object.entries(spec.axes.size ?? {})) if (k !== "xsmall") scale[k] = px(v.height?.value);
let bench: unknown = null;
try {
  bench = await benchmark({ component: "Button", axis: "size", option: "xsmall", scale,
    ours: { height: px(st.height?.value), paddingInline: px(st.padding?.value), gap: px(st.gap?.value), fontSize: px(st["font-size"]?.value) } });
} catch (e) { bench = { error: String(e) }; }

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
  repair: { actions: r.actions, pending: r.pending, pendingTokens, renames: r.renames, ms: repairMs, calls },
  repaired: slim(repaired),
  decisions,
  benchmark: bench,
  lab: { script: lab.script, runs: lab.runs.map((x: any) => ({ strategy: x.strategy, breaksAt: x.breaksAt ?? null, ms: x.ms,
    steps: x.steps.map((s: any) => ({ event: s.event, keptNow: s.keptNow, syncRate: s.syncRate, silentOverwrites: s.silentOverwrites.length, pendingHuman: s.pendingHuman.length })) })), usage: lab.usage },
}, null, 1));
console.log("console/data.json written", { repairMs, pending: r.pending.length, repaired: sum(repaired.checks) });
