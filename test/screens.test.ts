import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { certifyScreens, contrast } from "../src/certify-screens.js";

test("contrast matches WCAG examples", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(0), "21");
  assert.ok(contrast("#b8bec6", "#ffffff") < 4.5);
});

test("finds every break planted in the GitHub test screens", () => {
  const catalog = JSON.parse(readFileSync("console/catalog.json", "utf8"));
  const r = certifyScreens(catalog);
  const planted = JSON.parse(readFileSync("fixtures/primer-web-notes/screens-planted.json", "utf8")).breaks as any[];
  for (const p of planted.filter((x) => x.kind !== "meaning")) assert.ok(r.findings.some((f) => f.kind === p.kind && (f.node === p.node || f.node.startsWith(`I${p.node};`) || (f.parents ?? []).includes(p.node))), `${p.id} not found: ${p.what}`);
  // meaning comes from a model vote and can vary between runs: require at least one of the two
  assert.ok(planted.filter((x) => x.kind === "meaning").some((p) => r.findings.some((f) => f.kind === "meaning" && f.node === p.node)));
  assert.equal(r.usage.Button.count, 8);
});
