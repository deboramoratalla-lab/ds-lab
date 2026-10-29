// The console derives every number from these files. These checks make sure the files agree with each other,
// so a figure on one page can't contradict another (and ds-sync fails if a run writes inconsistent data).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const j = (f: string) => JSON.parse(readFileSync(`console/${f}`, "utf8"));
const D = j("data.json");

test("Button totals use one denominator before and after the agent", () => {
  assert.equal(D.broken.total, D.repaired.total);
  assert.ok(D.repaired.passed >= D.broken.passed, "the agent never makes things worse");
  for (const c of D.repaired.checks) assert.ok(c.passed <= c.total);
  assert.equal(D.repaired.checks.reduce((x: number, c: any) => x + c.total, 0), D.repaired.total);
  assert.equal(D.repaired.checks.reduce((x: number, c: any) => x + c.passed, 0), D.repaired.passed);
});

test("every change is either fixed by the agent or waiting on a decision", () => {
  const items = D.repair.items, acts = D.repair.actions.filter((a: any) => a.side !== "person");
  assert.ok(D.breaks.length >= 1);
  assert.equal(new Set(items.map((i: any) => i.id)).size, items.length, "decision ids are unique");
  for (const a of acts) if (a.confidence != null) assert.ok(a.confidence >= D.repair.autoApply, `${a.id} applied below the threshold`);
  if (D.repaired.passed < D.repaired.total) assert.ok(items.length > 0, "values still off but nothing for a person to decide");
});

test("screens: counts by kind add up and every planted break is reported", () => {
  if (!existsSync("console/screens.json")) return;
  const S = j("screens.json");
  for (const f of S.findings) assert.ok(f.kind && f.screen && f.msg, "finding has kind, screen and message");
  for (const p of S.test?.planted || []) assert.equal(p.found, true, `${p.id} not found`);
  for (const b of S.blind?.breaks || []) assert.equal(b.found, true, `${b.id} not found`);
  assert.equal((S.blind?.falseAlarms || []).length, 0);
});

test("mutation test: caught never exceeds tried", () => {
  if (!existsSync("console/mutation.json")) return;
  const M = j("mutation.json"); assert.ok(M.caught <= M.tried && M.noise >= 0);
});

test("issues point to known kinds, places and people", () => {
  if (!existsSync("console/gap-tasks.json")) return;
  const people = new Set(j("team.json").people.map((p: any) => p.id));
  for (const t of j("gap-tasks.json").tasks) {
    assert.ok(["gap", "fix", "screen"].includes(t.kind), t.kind);
    assert.ok(["Figma", "Storybook", "Docs"].includes(t.where), t.where);
    if (t.owner) assert.ok(people.has(t.owner), t.owner);
  }
});
