import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { flattenJson } from "../src/tokens/load.ts";
import { migrateTokens } from "../src/migrate/tokens.ts";

const source = flattenJson({
  color: { fg: { $value: "#1f2328" }, overlay: { $value: "rgba(0,0,0,0.5)" } },
  ansi: { black: { $value: "#000", bright: { $value: "#333" } } }, // token that is also a group
  radius: { md: { $value: 6 } },
  font: { stack: { $value: "Inter, sans-serif" } },
});

for (const [format, ext] of [["dtcg", "json"], ["figma", "json"], ["css", "css"], ["tailwind", "css"]] as const) {
  test(`round-trips through ${format}`, () => {
    const out = join(mkdtempSync(join(tmpdir(), "dsl-")), `t.${ext}`);
    const r = migrateTokens(source, format, out);
    assert.equal(r.ok, true, JSON.stringify(r.verification.items));
  });
}
