#!/usr/bin/env node
import { loadTokens } from "./tokens/load.js";
import { compareTokens } from "./tokens/drift.js";

const [cmd, designPath, codePath, ...flags] = process.argv.slice(2);

if (cmd !== "drift" || !designPath || !codePath) {
  console.log("Usage: ds-lab drift <design-tokens.json> <code-tokens.css|json> [--json]");
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
