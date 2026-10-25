// Meaning review: rules can't tell that a Delete button with an "open elsewhere" icon, or a danger button that says
// "Save changes", is wrong. Nemotron Super reads each screen as a list of elements and flags what doesn't fit.
import { readFileSync, writeFileSync } from "node:fs";
import { chat, parseJson, usage, MODELS } from "./llm/nebius.js";

const inv = JSON.parse(readFileSync("fixtures/primer-web-notes/screens-inventory.json", "utf8"));
const SYSTEM = `You review product screens built with GitHub's Primer design system. You get one screen as a list of component instances: id, component, variant props, visible label, icons inside it, and nearby text.
Flag only clear meaning problems a design-system reviewer would block:
- a label that contradicts its context or its variant (e.g. a danger button whose label isn't destructive, or doesn't match the row it acts on),
- an icon whose meaning contradicts the label or action (Primer Octicons: link-external = opens another page, trash = delete, alert = warning, git-merge = merged...),
- a variant that contradicts the action (e.g. primary for a destructive action).
Context you need: for list-like components (NavList, SegmentedControl, TabNav, Pagination, ActionList) the label is all their items joined, which is normal. In a GitHub settings \"Danger zone\" every action uses the danger variant on purpose (visibility, archive, delete): that is Primer's pattern, not a problem. A button in a row should name the action that row describes.\nDon't flag placeholder text, layout, colour, or anything you're unsure about. Most screens have no problems.
Answer JSON: {"issues":[{"id":"<instance id>","component":"<name>","problem":"<one short sentence>","fix":"<one short sentence>","confidence":0-1}]}`;

// The model doesn't answer the same way twice, so each screen is read RUNS times and only issues
// flagged in most runs are kept (majority vote).
const RUNS = Number(process.env.RUNS ?? 3);
const issues: any[] = []; const t0 = Date.now();
for (const s of inv.screens) for (let run = 0; run < RUNS; run++) {
  const els = s.instances.filter((i: any) => i.page && !/^[a-z_]/.test(i.set)).map((i: any) => ({ id: i.id, component: i.set, props: i.props, label: i.label, icons: i.icons, nearby: i.ctx }));
  const out = await chat({ role: "super", system: SYSTEM, user: `Screen: ${s.name}\n${JSON.stringify(els)}`, json: true, think: process.env.THINK !== "0", maxTokens: process.env.THINK !== "0" ? 6000 : 1500 });
  let r: any = {}; try { r = parseJson(out); } catch { console.error("bad JSON", s.name, out.slice(0, 200)); }
  for (const x of r.issues ?? []) if ((x.confidence ?? 1) >= 0.6 && els.some((e: any) => e.id === x.id)) issues.push({ ...x, screen: s.name });
}
const votes = new Map<string, any>(); for (const x of issues) { const k = `${x.screen}|${x.id}`; const v = votes.get(k); if (v) v.votes++; else votes.set(k, { ...x, votes: 1 }); }
const kept = [...votes.values()].filter((x) => x.votes > RUNS / 2), dropped = [...votes.values()].filter((x) => x.votes <= RUNS / 2);
issues.length = 0; issues.push(...kept);
const m = usage[MODELS.super];
writeFileSync("console/screens-review.json", JSON.stringify({ at: new Date().toISOString(), model: MODELS.super, ms: Date.now() - t0, calls: m?.calls, runs: RUNS, issues, dropped }, null, 1));
console.log(`${issues.length} meaning issues · ${m?.calls} calls · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const x of issues) console.log(`- ${x.votes}/${RUNS}`, x.screen, x.component, x.id, "·", x.problem);
for (const x of dropped) console.log(`  dropped ${x.votes}/${RUNS}`, x.component, x.id, "·", x.problem);
