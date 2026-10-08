#!/usr/bin/env node
import { loadTokens } from "./tokens/load.js";
import { compareTokens } from "./tokens/drift.js";

import { auditScreen } from "./render/audit.js";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { serveDir } from "./render/serve.js";

import { readFileSync, writeFileSync } from "node:fs";
import { extractComponent } from "./migrate/component.js";
import { writeDoc, docToMarkdown, docDrift } from "./agents/docs.js";
import { loadPrimerDoc, fourWayDrift, storybookAxes } from "./docs/primer.js";
import { STRATEGIES } from "./lab/strategies.js";
import { PRIMER_SCRIPT } from "./lab/script.js";
import { runLab } from "./lab/run.js";
import { certify } from "./certify.js";
import { benchmark } from "./research/benchmark.js";
import { certifyPrimer, sharedTokens } from "./certify-primer.js";
import { BREAKS, makeWorkspace, closeWorkspace, primerInput } from "./demo/breaks.js";
import { repair, resolveItem, revert } from "./demo/repair.js";
import { buttonOptionResearch } from "./research/option-research.js";
import { readdirSync } from "node:fs";
import { normalizeName } from "./tokens/load.js";
import { matchRenamed } from "./agents/matcher.js";
import { resolveConflicts } from "./agents/resolver.js";
import { usage } from "./llm/nebius.js";
import { migrateTokens, type Format } from "./migrate/tokens.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const [cmd, designPath, codePath, ...flags] = process.argv.slice(2);

/** Token descriptions from Figma variable exports, used as evidence by the resolver. */
function figmaDescriptions(paths: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of paths.split(",")) {
    if (!p.endsWith(".json") || !existsSync(p)) continue;
    const json = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(json)) for (const v of json) if (v.description) out.set(normalizeName(v.name), v.description);
  }
  return out;
}

if (cmd === "migrate" && designPath && codePath) {
  // ds-lab migrate <source-tokens> <dtcg|figma|css|tailwind> [--out file]
  const format = codePath as Format;
  const outIdx = flags.indexOf("--out");
  const ext = format === "dtcg" || format === "figma" ? "json" : "css";
  const out = outIdx >= 0 ? flags[outIdx + 1] : `tokens.${format}.${ext}`;
  const r = migrateTokens(loadTokens(designPath), format, out);
  console.log(`Migrated ${r.tokens} tokens → ${format} (${out})`);
  console.log(r.ok
    ? `Verified: read back and compared with the source, 100% in sync.`
    : `NOT verified: ${r.verification.items.length} differences after migration`);
  for (const i of r.verification.items.slice(0, 10)) console.log(`  ${i.kind} ${i.name} ${i.design ?? ""} → ${i.code ?? ""}`);
  process.exit(r.ok ? 0 : 2);
}

if (cmd === "benchmark") {
  // ds-lab benchmark [option]   research a new Button size against other public systems + WCAG (Tavily + Nemotron Super)
  // reads the option from the broken workspace's CSS (run `break xsmall` first)
  const option = designPath ?? "xsmall";
  const spec = extractComponent("Button", "out/broken/ButtonBase.css", "prc-Button-ButtonBase", ["data-variant", "data-size"]);
  const st = spec.axes.size?.[option];
  if (!st) { console.log(`size="${option}" not found in out/broken/ButtonBase.css — run \`ds-lab break xsmall\` first`); process.exit(1); }
  const px = (v?: string) => { const f = v?.match(/([\d.]+)rem\)?$/)?.[1]; return f ? `${parseFloat(f) * 16}px` : v ?? "—"; };
  const ours = { height: px(st.height?.value), paddingInline: px(st.padding?.value), gap: px(st.gap?.value), fontSize: px(st["font-size"]?.value) };
  console.log(`Proposal: Button size="${option}" ${JSON.stringify(ours)}\n`);
  const base = extractComponent("Button", "out/broken/ButtonBase.css", "prc-Button-ButtonBase", ["data-variant", "data-size"]);
  const scale: Record<string, string> = { medium: px(base.base.height?.value) };
  for (const [k, v] of Object.entries(base.axes.size ?? {})) if (k !== option) scale[k] = px(v.height?.value);
  const r = await benchmark({ component: "Button", axis: "size", option, ours, scale });
  for (const f of r.findings) console.log(`· ${f.system.padEnd(18)} ${f.summary}\n    ${f.values.join(", ")}  — ${f.url}`);
  if (r.standard) console.log(`· ${r.standard.system.padEnd(18)} ${r.standard.summary}\n    ${r.standard.values.join(", ")}  — ${r.standard.url}`);
  console.log(`\n${r.verdict === "consistent" ? "✓" : r.verdict === "review" ? "?" : "✗"} ${r.verdict}: ${r.recommendation}`);
  console.log(`\n${r.searches} Tavily searches · ${Object.values(usage).reduce((a, u) => a + u.calls, 0)} Nemotron Super call(s)${r.dropped ? ` · ${r.dropped} uncited finding(s) dropped` : ""}`);
  process.exit(0);
}

if (cmd === "repair") {
  // ds-lab repair [id,id|all] [--decide token=figma|code] [--approve all|id,id] [--revert id]
  const ids = !designPath || designPath === "all" ? BREAKS.map((b) => b.id) : designPath.split(",");
  const ws = makeWorkspace("out/broken");
  const chosen = BREAKS.filter((b) => ids.includes(b.id));
  for (const b of chosen) { console.log(`✂  ${b.id}: ${b.title}`); b.apply(ws.w); }
  const baselineShared = sharedTokens(primerInput());
  const before = certifyPrimer({ ...ws.input, baselineShared });
  console.log(`\nBroken: ${before.checks.filter((c) => c.passed !== c.total).length} of ${before.checks.length} checks fail\n`);
  const t0 = Date.now();
  const r = await repair(ws.w, ws.input, primerInput(), baselineShared, Object.assign({}, ...chosen.map((b) => b.notes ?? {})),
    { research: buttonOptionResearch(ws.input.buttonCss) });
  for (const a of r.actions.filter((a) => a.side !== "person"))
    console.log(`${{ nano: "Nano ", ultra: "Ultra", rule: "rule " }[a.who]} → ${a.side.padEnd(9)} ${a.what}${a.notify ? `  [notify ${a.notify}]` : ""}  (${a.id})`);
  console.log(`\nQueue for a person (${r.items.length}):`);
  for (const i of r.items) console.log(`  · [${i.kind}] ${i.id} ${i.title}${i.impact ? `\n      ${i.impact.join(" · ")}` : ""}`);

  const argv = process.argv.slice(2), flag = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const answered = new Set<string>();
  for (const d of flag("--decide")?.split(",") ?? []) {
    const [token, side] = d.split("="), item = r.items.find((i) => i.kind === "decide" && i.token === token);
    if (item) { resolveItem(ws.w, ws.input, item, side as "figma" | "code"); answered.add(item.id); console.log(`person → kept ${side} for ${token}`); }
  }
  const approve = flag("--approve");
  for (const item of r.items.filter((i) => i.kind !== "decide" && (approve === "all" || approve?.split(",").includes(i.id)))) {
    resolveItem(ws.w, ws.input, item, "approve"); answered.add(item.id); console.log(`person → approved ${item.id}: ${item.title}`);
    if (item.change?.type === "rename") r.renames[item.change.from!] = item.change.to!;
  }
  const rv = flag("--revert");
  if (rv) { const e = revert(ws.w, ws.input, rv); console.log(`reverted ${rv}: ${e.what} (${Object.keys(e.files).length} files restored)`); }

  const after = certifyPrimer({ ...ws.input, baselineShared, renames: r.renames });
  console.log();
  for (const c of after.checks) {
    console.log(`${c.passed === c.total ? "✓" : "✗"} ${c.area.padEnd(50)} ${c.passed}/${c.total}`);
    for (const x of c.issues.slice(0, 6)) console.log(`    ${x}`);
  }
  const open = r.items.filter((i) => !answered.has(i.id)).length;
  console.log(after.ok ? "\nCertified again: 100%." : `\nNot certified yet${open ? `: ${open} item(s) waiting for a person` : ""}.`);
  const calls = Object.entries(usage).map(([m, u]) => `${u.calls}× ${m.split("/").pop()}`).join(", ");
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s · ${calls}`);
  process.exit(after.ok ? 0 : 2);
}

if (cmd === "certify-primer" || cmd === "break") {
  // ds-lab certify-primer            certify the aligned Primer Web file
  // ds-lab break [id,id|all]         apply the demo breaks to a copy, then certify
  let input = primerInput();
  if (cmd === "break") {
    const ids = !designPath || designPath === "all" ? BREAKS.map((b) => b.id) : designPath.split(",");
    const ws = makeWorkspace("out/broken");
    for (const b of BREAKS.filter((b) => ids.includes(b.id))) { console.log(`✂  ${b.id}: ${b.title}`); b.apply(ws.w); }
    closeWorkspace(ws.w.dir);
    input = { ...ws.input, baselineShared: sharedTokens(primerInput()) };
    console.log();
  }
  const r = certifyPrimer(input);
  for (const c of r.checks) {
    console.log(`${c.passed === c.total ? "✓" : "✗"} ${c.area.padEnd(50)} ${c.passed}/${c.total}`);
    for (const x of c.issues.slice(0, 15)) console.log(`    ${x}`);
  }
  console.log(`\nWarnings (${r.warnings.length}):`);
  for (const w of r.warnings.slice(0, 30)) console.log(`  · ${w}`);
  console.log(r.ok ? "\nCertified: Primer Web (light) is in sync with GitHub's code, within scope." : "\nNot in sync.");
  process.exit(r.ok ? 0 : 2);
}

if (cmd === "certify") {
  // ds-lab certify [baseline dir]
  const dir = designPath ?? "baseline";
  const r = certify({
    figmaSnapshot: `${dir}/figma/snapshot.json`, codeTokens: `${dir}/code/tokens.css`, componentCss: `${dir}/code/button.css`,
    baseClass: "ds-Button", docs: `${dir}/docs/components.json`, stories: `${dir}/stories/button.stories.js`, component: "Button",
  });
  for (const c of r.checks) {
    console.log(`${c.passed === c.total ? "✓" : "✗"} ${c.area.padEnd(44)} ${c.passed}/${c.total}  ${Math.round((c.passed / c.total) * 100)}%`);
    for (const x of c.issues.slice(0, 12)) console.log(`    ${x}`);
  }
  console.log(r.ok ? "\nCertified: Figma, code, Storybook and docs are 100% in sync." : "\nNot in sync.");
  process.exit(r.ok ? 0 : 2);
}

if (cmd === "lab" && designPath && codePath) {
  // ds-lab lab <design-tokens> <code-tokens> [--json out.json]
  const start = { design: loadTokens(designPath), code: loadTokens(codePath) };
  // the lab measures changes, so start from a synced system: only tokens both sides share
  for (const k of [...start.design.keys()]) if (start.code.get(k) !== start.design.get(k)) start.design.delete(k);
  for (const k of [...start.code.keys()]) if (!start.design.has(k)) start.code.delete(k);
  console.log(`Lab: ${STRATEGIES.length} strategies × ${PRIMER_SCRIPT.length} changes on ${start.design.size} shared tokens\n`);
  PRIMER_SCRIPT.forEach((e, i) => console.log(`  ${i + 1}. ${e.title}`));
  const runs = await runLab(STRATEGIES, start, PRIMER_SCRIPT);
  console.log("");
  for (const r of runs) {
    const s = STRATEGIES.find((x) => x.id === r.strategy)!;
    const last = r.steps.at(-1)!;
    console.log(`■ ${s.name}`);
    console.log(`  breaks at: ${r.breaksAt ? `step ${PRIMER_SCRIPT.findIndex((e) => e.id === r.breaksAt) + 1} (${r.breaksAt})` : "never"}`);
    console.log(`  changes handled correctly: ${last.keptSoFar}/${PRIMER_SCRIPT.length} · final sync ${(last.syncRate * 100).toFixed(1)}%`);
    if (last.lostSoFar.length) console.log(`  lost: ${last.lostSoFar.join(", ")}`);
    for (const o of last.silentOverwrites) console.log(`  silent overwrite: ${o}`);
    for (const p of last.pendingHuman) console.log(`  waiting for a person: ${p}`);
    for (const d of r.steps.flatMap((x) => x.decisions).filter((d) => d.how === "agent")) console.log(`  agent decided: ${d.token}: ${d.detail}`);
    console.log(`  per step: ${r.steps.map((x) => `${x.event} ${x.keptNow ? "✓" : "✗"}`).join(" → ")}\n`);
  }
  for (const [m, u] of Object.entries(usage)) console.log(`  ${m.split("/")[1]}: ${u.calls} calls · ${u.prompt + u.completion} tokens`);
  const out = flags[flags.indexOf("--json") + 1];
  if (flags.includes("--json") && out) writeFileSync(out, JSON.stringify({ script: PRIMER_SCRIPT.map(({ id, title, who }) => ({ id, title, who })), runs, usage }, null, 2));
  process.exit(0);
}

if (cmd === "where" && designPath && codePath) {
  // ds-lab where <components.json> <component.css> --name Button --base <class> --figma variant=a,b;size=s,m
  const arg = (f: string) => { const i = flags.indexOf(f); return i >= 0 ? flags[i + 1] : undefined; };
  const name = arg("--name")!;
  const doc = loadPrimerDoc(designPath, name);
  const spec = extractComponent(name, codePath, arg("--base")!, ["data-variant", "data-size"]);
  const axes = ["variant", "size"];
  // the default value has no CSS override of its own, so it lives in the base styles
  const code = Object.fromEntries(axes.map((a) => {
    const def = doc.props.find((p) => p.name === a)?.defaultValue?.replace(/'/g, "");
    return [a, [...new Set([...(def ? [def] : []), ...Object.keys(spec.axes[a] ?? {})])]];
  }));
  const figma = Object.fromEntries((arg("--figma") ?? "").split(";").filter(Boolean).map((s) => {
    const [k, v] = s.split("="); return [k, v.split(",")];
  }));
  const r = fourWayDrift(doc, code, figma, storybookAxes(doc, axes));
  console.log(`${name}: ${r.inSync}/${r.total} options exist in docs, code, Figma and Storybook`);
  console.log(`  ${"option".padEnd(20)} docs  code  figma storybook`);
  for (const i of r.items)
    console.log(`  ${(i.axis + "=" + i.option).padEnd(20)} ${[i.inDocs, i.inCode, i.inFigma, i.inStorybook].map((b) => (b ? "✓" : "✗").padEnd(5)).join(" ")}`);
  process.exit(r.gaps.length ? 2 : 0);
}

if (cmd === "docs" && designPath) {
  // ds-lab docs <component.css> --base <class> --variants a,b --sizes s,m [--existing doc.md] [--out file]
  const arg = (f: string) => { const i = [codePath, ...flags].indexOf(f); return i >= 0 ? [codePath, ...flags][i + 1] : undefined; };
  const variants = arg("--variants")!.split(","), sizes = arg("--sizes")!.split(",");
  const spec = extractComponent(arg("--name") ?? "Component", designPath, arg("--base")!, ["data-variant", "data-size"]);
  const existing = arg("--existing");
  if (existing) {
    const d = docDrift(readFileSync(existing, "utf8"), variants, sizes);
    console.log(`Existing doc coverage: ${Math.round(d.coverage * 100)}% · undocumented: ${d.undocumented.join(", ") || "none"} · stale: ${d.stale.join(", ") || "none"}`);
  }
  const doc = await writeDoc(spec, variants, sizes);
  const md = docToMarkdown(spec.name, doc);
  const out = arg("--out");
  if (out) writeFileSync(out, md); else console.log(md);
  const d = docDrift(md, variants, sizes);
  console.log(`\nGenerated doc coverage: ${Math.round(d.coverage * 100)}%`);
  for (const [m, u] of Object.entries(usage)) console.log(`  ${m.split("/")[1]}: ${u.calls} call · ${u.prompt} in / ${u.completion} out · ${(u.ms / 1000).toFixed(1)}s`);
  process.exit(0);
}

if (cmd === "reconcile" && designPath && codePath) {
  // ds-lab reconcile <design-tokens> <code-tokens>: drift + Nano matching + Ultra conflict resolution
  const report = compareTokens(loadTokens(designPath), loadTokens(codePath));
  console.log(`Drift: ${(report.realSyncRate * 100).toFixed(1)}% in sync · ${report.counts["value-mismatch"]} conflicts · ` +
    `${report.counts["missing-in-code"]} Figma-only · ${report.counts["missing-in-design"]} code-only\n`);

  const matches = await matchRenamed(report.items);
  console.log(`Nano · renamed tokens found: ${matches.length}`);
  for (const m of matches)
    console.log(`  ${m.design}  ↔  ${m.code}  (${Math.round(m.confidence * 100)}%, ${m.sameValue ? "same value" : "DIFFERENT value"})`);

  const resolutions = await resolveConflicts(report.items, { descriptions: figmaDescriptions(designPath) });
  console.log(`\nUltra · conflicts resolved: ${resolutions.length}`);
  for (const r of resolutions) {
    console.log(`  ${r.name}: ${r.verdict} (${Math.round(r.confidence * 100)}%)`);
    console.log(`    why: ${r.why}\n    do:  ${r.action}`);
  }

  console.log("\nModel usage:");
  for (const [m, u] of Object.entries(usage))
    console.log(`  ${m.split("/")[1].padEnd(32)} ${u.calls} calls · ${u.prompt} in / ${u.completion} out tokens · ${(u.ms / u.calls / 1000).toFixed(1)}s avg`);
  if (flags.includes("--json")) console.log(JSON.stringify({ report, matches, resolutions, usage }, null, 2));
  process.exit(0);
}

if (cmd === "audit" && designPath && codePath) {
  // ds-lab audit <tokens> <screen.html|url>
  // Local files are served over HTTP: Chrome won't expose stylesheet rules on file:// pages.
  let server: Awaited<ReturnType<typeof serveDir>> | undefined;
  let url = codePath;
  if (existsSync(codePath)) {
    server = await serveDir(process.cwd());
    url = `${server.origin}/${relative(process.cwd(), codePath).split("\\").join("/")}`;
  }
  const r = await auditScreen(url, loadTokens(designPath));
  server?.close();
  if (flags.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`Token coverage: ${(r.coverage * 100).toFixed(1)}% (${r.onSystem}/${r.checked} authored style values)`);
    console.log(`  via token ${r.viaToken} · hand-written but equal to a token ${r.literalMatchingToken} · off-system ${r.offSystem.length}`);
    for (const o of r.offSystem)
      console.log(`  off-system  ${o.property.padEnd(22)} ${o.authored.padEnd(9)} ${o.selector}${o.suggestion ? `  → try ${o.suggestion}` : ""}`);
  }
  process.exit(r.offSystem.length ? 2 : 0);
}

if (cmd !== "drift" || !designPath || !codePath) {
  console.log("Usage:\n  ds-lab drift <design-tokens> <code-tokens> [--json]\n  ds-lab audit <tokens> <screen.html|url> [--json]");
  process.exit(cmd ? 1 : 0);
}

const report = compareTokens(loadTokens(designPath), loadTokens(codePath));

if (flags.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log(`Real drift sync rate: ${pct(report.realSyncRate)}  (all differences: ${pct(report.syncRate)})`);
  console.log(`In sync ${report.inSync} · ` + Object.entries(report.counts).map(([k, v]) => `${k} ${v}`).join(" · "));
  for (const i of report.items) {
    const detail =
      i.kind === "value-mismatch" ? `design ${i.design} · code ${i.code}`
      : i.kind === "structural" ? (i.parts?.length ? `one value in code, ${i.parts.length} variables in design` : `different unit model: design ${i.design} · code ${i.code}`)
      : "";
    console.log(`  ${i.kind.padEnd(18)} ${i.name} ${detail}`);
  }
}
process.exit(report.items.length ? 2 : 0);
