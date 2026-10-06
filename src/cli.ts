#!/usr/bin/env node
import { loadTokens } from "./tokens/load.js";
import { compareTokens } from "./tokens/drift.js";

import { auditScreen } from "./render/audit.js";
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { serveDir } from "./render/serve.js";

const [cmd, designPath, codePath, ...flags] = process.argv.slice(2);

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
