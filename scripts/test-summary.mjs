// Runs the unit tests and writes console/tests.json, so the console shows the real count instead of a typed number.
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
const files = readdirSync("test").filter((f) => f.endsWith(".test.ts")).map((f) => `test/${f}`);
const r = spawnSync(process.execPath, ["--test", "--import", "tsx", "--test-reporter=tap", ...files], { encoding: "utf8", env: { ...process.env, MUTATION_OUT: process.env.MUTATION_OUT || "/tmp/mutation-test.json" } });
const n = (k) => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)`, "m")) || [])[1] || 0);
const out = { at: new Date().toISOString(), pass: n("pass"), fail: n("fail"), total: n("tests") };
writeFileSync("console/tests.json", JSON.stringify(out, null, 1));
console.log(`tests: ${out.pass}/${out.total} pass`);
process.exit(out.fail ? 1 : 0);
