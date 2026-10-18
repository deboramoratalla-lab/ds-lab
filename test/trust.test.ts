import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
process.env.DS_LAB_TRUST = mkdtempSync("/tmp/trust-") + "/t.json";
const { recordAnswer, paused, kindOf } = await import("../src/demo/trust.ts");
test("three rejections in a row pause auto-apply; one approval resets", () => {
  const k = kindOf("ultra", "set-figma");
  recordAnswer(k, "reject"); recordAnswer(k, "reject"); assert.equal(paused(k), false);
  recordAnswer(k, "reject"); assert.equal(paused(k), true);
  recordAnswer(k, "approve"); assert.equal(paused(k), false);
});
