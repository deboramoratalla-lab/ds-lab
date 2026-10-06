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
