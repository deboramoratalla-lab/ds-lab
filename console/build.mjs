// Inlines console/data.json into console/app.html → console/index.html (one self-contained page).
import { readFileSync, writeFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
const d = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));
const sb = new URL("./lab-sandbox.json", import.meta.url);
if (existsSync(sb)) d.sandboxLab = JSON.parse(readFileSync(sb, "utf8"));
// Component inventory from the real Primer fixtures: code (React dist), Figma variables, Storybook stories.
{
  const { statSync } = await import("node:fs");
  const fx = (x) => new URL("../fixtures/" + x, import.meta.url);
  const seg = {};
  for (const f of ["part1", "part2", "part3"]) for (const k of Object.keys(JSON.parse(readFileSync(fx(`primer-web-figma/${f}.json`), "utf8")))) { const s = k.split("/")[0].toLowerCase(); seg[s] = (seg[s] || 0) + 1; }
  const stories = new Set(readdirSync(fx("primer-storybook")).map((f) => f.split(".")[0]));
  const dist = fx("primer-react/package/dist/");
  d.components = readdirSync(dist).filter((n) => /^[A-Z]/.test(n) && statSync(new URL(n, dist)).isDirectory())
    .map((n) => ({ name: n, figma: seg[n.toLowerCase()] || 0, story: stories.has(n) }));
  const cat = new URL("./catalog.json", import.meta.url);
  if (existsSync(cat)) { const C = Object.fromEntries(JSON.parse(readFileSync(cat, "utf8")).map((c) => [c.name, c])); for (const c of d.components) Object.assign(c, { cat: C[c.name] || null }); }
  const tri = new URL("./catalog-triage.json", import.meta.url);
  if (existsSync(tri)) { const T = JSON.parse(readFileSync(tri, "utf8")); d.triage = { at: T.at, ms: T.ms }; for (const c of d.components) if (T.items[c.name]?.fix) c.triage = T.items[c.name]; }
}
{ const sc = new URL("./screens.json", import.meta.url); if (existsSync(sc)) d.screens = JSON.parse(readFileSync(sc, "utf8")); const mu = new URL("./mutation.json", import.meta.url); if (existsSync(mu) && d.screens) d.screens.mutation = JSON.parse(readFileSync(mu, "utf8")); }
{ const sbd = new URL("../fixtures/primer-storybook/", import.meta.url); if (existsSync(sbd)) { const n = readdirSync(sbd).filter((f) => f.endsWith(".stories.tsx")).length; const sb = d.sources.find((x) => x.id === "storybook"); if (sb && n) Object.assign(sb, { count: n, unit: "story files", detail: "@primer/react 38.40.1 stories, every component" }); } }
for (const [k, f] of [["team", "./team.json"], ["gapTasks", "./gap-tasks.json"], ["sideBias", "./side-bias.json"], ["tests", "./tests.json"]]) { const u = new URL(f, import.meta.url); if (existsSync(u)) d[k] = JSON.parse(readFileSync(u, "utf8")); }
const data = JSON.stringify(d).replace(/</g, "\\u003c");
let html = readFileSync(new URL("./app.html", import.meta.url), "utf8").replace("__DATA__", () => data);
// the 3-tier tokens exported from the Figma library load last, so every console colour resolves through them
const tok = readFileSync(new URL("./tokens.css", import.meta.url), "utf8"), at = html.lastIndexOf("</style>");
html = html.slice(0, at) + "\n" + tok + html.slice(at);
writeFileSync(new URL("./index.html", import.meta.url), html);
console.log("console/index.html", (html.length / 1024).toFixed(0) + " KB");

// README "Numbers from the last run": written from the same data as the console, so the two never disagree.
{ const rp = new URL("../README.md", import.meta.url); if (existsSync(rp)) { const md = readFileSync(rp, "utf8"), a = "<!-- numbers:start -->", b = "<!-- numbers:end -->";
  if (md.includes(a) && md.includes(b)) { const S = d.screens, M = S?.mutation, T = d.tests, B = d.sideBias, pk = (L) => L.filter((x) => !x.startsWith("ask-a-human")).length;
    const rows = [
      `Run of ${d.generatedAt.slice(0, 16).replace("T", " ")} UTC${d.pr?.url ? ` · [PR #${d.pr.url.split("/").pop()}](${d.pr.url})` : ""}`,
      `- Button: ${d.repaired.passed.toLocaleString("en")} of ${d.repaired.total.toLocaleString("en")} values in sync; ${d.broken.total - d.broken.passed} went out of sync this run, the agent fixed ${d.repaired.passed - d.broken.passed}, ${d.repaired.total - d.repaired.passed} wait on ${d.repair.items.length} decisions.`,
      `- Components: ${(d.components || []).length}, ${(d.components || []).filter((c) => c.story).length} with Storybook stories, ${(d.components || []).filter((c) => !c.cat?.figma).length} with no Figma set.`,
      S && `- Screens: ${S.findings.length} problems in ${S.screens.length} GitHub screens · planted breaks ${S.test.planted.filter((p) => p.found).length}/${S.test.planted.length} · blind test ${S.blind.breaks.filter((x) => x.found).length}/${S.blind.breaks.length}, ${S.blind.falseAlarms.length} false alarms${M ? ` · mutations ${M.caught}/${M.tried}, ${M.noise} noise` : ""}.`,
      B && `- Side-bias test: Ultra picked a side ${pk(B.cases.original)}/${B.runs} times, ${pk(B.cases.swapped)}/${B.runs} with the sides swapped.`,
      T && `- Unit tests: ${T.pass}/${T.total} pass.`,
      `- Nemotron calls: ${Object.values(d.repair.calls).reduce((x, u) => x + u.calls, 0)} · auto-apply at ≥ ${Math.round(d.repair.autoApply * 100)}%.`,
    ].filter(Boolean).join("\n");
    writeFileSync(rp, md.slice(0, md.indexOf(a) + a.length) + "\n" + rows + "\n" + md.slice(md.indexOf(b))); } } }
