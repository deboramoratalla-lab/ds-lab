import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { certify } from "../src/certify.ts";

const input = (dir: string) => ({
  figmaSnapshot: `${dir}/figma/snapshot.json`, codeTokens: `${dir}/code/tokens.css`, componentCss: `${dir}/code/button.css`,
  baseClass: "ds-Button", docs: `${dir}/docs/components.json`, stories: `${dir}/stories/button.stories.js`, component: "Button",
});

test("baseline is certified 100% in sync", () => {
  assert.equal(certify(input("baseline")).ok, true);
});

test("a hotfix in code breaks certification", () => {
  const dir = mkdtempSync(join(tmpdir(), "dsl-"));
  cpSync("baseline", dir, { recursive: true });
  const css = readFileSync(`${dir}/code/tokens.css`, "utf8").replace("--button-danger-fg-color-rest: #d1242f", "--button-danger-fg-color-rest: #c21c2c");
  writeFileSync(`${dir}/code/tokens.css`, css);
  const r = certify(input(dir));
  assert.equal(r.ok, false);
  assert.match(r.checks[0].issues.join(" "), /button-danger-fg-color-rest/);
});
