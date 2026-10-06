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
      : i.kind === "structural" ? `one value in code, ${i.parts!.length} variables in design`
      : "";
    console.log(`  ${i.kind.padEnd(18)} ${i.name} ${detail}`);
  }
}
process.exit(report.items.length ? 2 : 0);
