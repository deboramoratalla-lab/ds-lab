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
  console.log(`Sync rate: ${(report.syncRate * 100).toFixed(1)}% (${report.inSync}/${report.total})`);
  for (const i of report.items) {
    const detail = i.kind === "value-mismatch" ? `design ${i.design} · code ${i.code}` : "";
    console.log(`  ${i.kind.padEnd(18)} ${i.name} ${detail}`);
  }
}
process.exit(report.items.length ? 2 : 0);
