import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenJson, parseCss, normalizeValue } from "../src/tokens/load.ts";
import { compareTokens } from "../src/tokens/drift.ts";

test("normalizes equivalent values", () => {
  assert.equal(normalizeValue("#FFF"), "#ffffff");
  assert.equal(normalizeValue("rgb(255, 255, 255)"), "#ffffff");
  assert.equal(normalizeValue("1rem"), "16px");
  assert.equal(normalizeValue(16), "16px");
});

test("separates structural differences from real drift", () => {
  const design = flattenJson({
    shadow: { sm: { blur: { $value: 2 }, color: { $value: "#000" }, "offset-y": { $value: 1 } } },
    color: { fg: { $value: "#111" }, bg: { $value: "#fff" } },
  });
  const code = parseCss(`--shadow-sm: 0 1px 2px #000; --color-fg: #111; --color-bg: #eee;`);
  const r = compareTokens(design, code);
  assert.equal(r.counts.structural, 1);
  assert.equal(r.counts["missing-in-code"], 0);
  assert.equal(r.counts["value-mismatch"], 1);
  assert.equal(r.realSyncRate, 1 / 2);
});

test("detects all three kinds of drift", () => {
  const design = flattenJson({
    color: { primary: { $value: "#0055FF" }, surface: { $value: "#fff" } },
    space: { "4": { $value: 16 } },
    radius: { md: { $value: 8 } },
  });
  const code = parseCss(`
    :root {
      --color-primary: #0055ff;
      --color-surface: #fafafa;
      --space-4: 1rem;
      --shadow-sm: 0 1px 2px black;
    }`);
  const r = compareTokens(design, code);
  assert.equal(r.inSync, 2); // primary, space-4
  assert.deepEqual(
    r.items.map((i) => `${i.kind}:${i.name}`),
    ["value-mismatch:color-surface", "missing-in-code:radius-md", "missing-in-design:shadow-sm"],
  );
});
