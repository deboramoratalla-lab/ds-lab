// Meaning review: rules can't tell that a Delete button with an "open elsewhere" icon, or a danger button that says
// "Save changes", is wrong. Two steps:
//   1. Nemotron Super reads each screen RUNS times (temperature 0) and proposes issues. Every proposal is a candidate.
//   2. Nemotron Ultra checks each candidate on its own, with the element's row and its neighbours, and confirms or rejects it.
// Reported only if Super proposed it in most reads AND Ultra confirms it. Rejected candidates are kept in the output so the call can be audited.
import { readFileSync, writeFileSync } from "node:fs";
import { chat, parseJson, usage, MODELS } from "./llm/nebius.js";

const inv = JSON.parse(readFileSync("fixtures/primer-web-notes/screens-inventory.json", "utf8"));
const RUNS = Number(process.env.RUNS ?? 3);
const PRIMER = `Context about Primer and GitHub screens:
- For list-like components (NavList, SegmentedControl, TabNav, Pagination, ActionList) the label is all their items joined, which is normal.
- A ToggleSwitch shows its state ("On"/"Off") next to it; the setting's name is the row text, not the switch label.
- In a GitHub settings "Danger zone" every action uses the danger variant on purpose (visibility, archive, delete).
- A button in a row should name the action that row describes. The primary button is the main action of a form, never Cancel.
- Octicons: link-external = opens another page, trash = delete, alert = warning, git-merge = merged, issue-opened = open issue.`;

const PROPOSE = `You review product screens built with GitHub's Primer design system. You get one screen as a list of component instances: id, component, variant props, visible label, icons inside it, the text of the row it sits in, and the labels of sibling components.
Flag only clear meaning problems a design-system reviewer would block: a label that contradicts its row or its variant, an icon whose meaning contradicts the action, a variant that contradicts the action.
${PRIMER}
Don't flag placeholder text, layout or colour. Most screens have no problems.
Answer JSON: {"issues":[{"id":"<instance id>","component":"<name>","problem":"<one short sentence>","fix":"<one short sentence>"}]}`;

const VERIFY = `You are the second reviewer. Another model flagged one element of a GitHub screen built with Primer. Decide if the problem is real: would a design-system lead block this in review?
${PRIMER}
Be strict: reject vague, stylistic or speculative claims, and claims that contradict the context above.
Answer JSON: {"real":true|false,"why":"<one short sentence>"}`;

const el = (i: any) => ({ id: i.id, component: i.set, props: i.props, label: i.label, icons: i.icons, row: i.row ?? i.ctx, siblings: i.siblings ?? "" });
const t0 = Date.now(); const cand = new Map<string, any>();
for (const s of inv.screens) {
  const els = s.instances.filter((i: any) => i.page && !/^[a-z_]/.test(i.set)).map(el);
  for (let run = 0; run < RUNS; run++) {
    const out = await chat({ role: "super", system: PROPOSE, user: `Screen: ${s.name}\n${JSON.stringify(els)}`, json: true, think: true, temperature: 0, maxTokens: 6000 });
    let r: any = {}; try { r = parseJson(out); } catch { continue; }
    for (const x of r.issues ?? []) { const e = els.find((y: any) => y.id === x.id); if (!e) continue; const k = `${s.name}|${x.id}`; const c = cand.get(k); if (c) c.votes++; else cand.set(k, { ...x, screen: s.name, element: e, votes: 1 }); }
  }
}
const issues: any[] = [], rejected: any[] = [];
for (const c of cand.values()) {
  const out = await chat({ role: "ultra", system: VERIFY, user: `Screen: ${c.screen}\nElement: ${JSON.stringify(c.element)}\nClaim: ${c.problem}`, json: true, temperature: 0, maxTokens: 400 });
  let v: any = {}; try { v = parseJson(out); } catch { v = { real: false, why: "no answer" }; }
  const { element, ...rest } = c;
  (v.real && c.votes > RUNS / 2 ? issues : rejected).push({ ...rest, verdict: v.why, ultra: !!v.real });
}
const sup = usage[MODELS.super], ult = usage[MODELS.ultra];
writeFileSync("console/screens-review.json", JSON.stringify({ at: new Date().toISOString(), models: { propose: MODELS.super, verify: MODELS.ultra }, runs: RUNS, ms: Date.now() - t0, calls: { super: sup?.calls, ultra: ult?.calls }, issues, rejected }, null, 1));
console.log(`${issues.length} confirmed · ${rejected.length} rejected · super ${sup?.calls} calls, ultra ${ult?.calls} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const x of issues) console.log(`✓ ${x.votes}/${RUNS}`, x.screen, x.component, x.id, "·", x.problem, "→", x.verdict);
for (const x of rejected) console.log(`✗ ${x.votes}/${RUNS}`, x.screen, x.component, x.id, "·", x.problem, "→", x.verdict);
