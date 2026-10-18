// Inlines console/data.json into console/app.html → console/index.html (one self-contained page).
import { readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
const d = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));
const sb = new URL("./lab-sandbox.json", import.meta.url);
if (existsSync(sb)) d.sandboxLab = JSON.parse(readFileSync(sb, "utf8"));
// Component inventory from the real Primer fixtures: code (React dist), Figma variables, Storybook stories.
{
  const { readdirSync, statSync } = await import("node:fs");
  const fx = (x) => new URL("../fixtures/" + x, import.meta.url);
  const seg = {};
  for (const f of ["part1", "part2", "part3"]) for (const k of Object.keys(JSON.parse(readFileSync(fx(`primer-web-figma/${f}.json`), "utf8")))) { const s = k.split("/")[0].toLowerCase(); seg[s] = (seg[s] || 0) + 1; }
  const stories = new Set(readdirSync(fx("primer-storybook")).map((f) => f.split(".")[0]));
  const dist = fx("primer-react/package/dist/");
  d.components = readdirSync(dist).filter((n) => /^[A-Z]/.test(n) && statSync(new URL(n, dist)).isDirectory())
    .map((n) => ({ name: n, figma: seg[n.toLowerCase()] || 0, story: stories.has(n) }));
  const cat = new URL("./catalog.json", import.meta.url);
  if (existsSync(cat)) { const C = Object.fromEntries(JSON.parse(readFileSync(cat, "utf8")).map((c) => [c.name, c])); for (const c of d.components) Object.assign(c, { cat: C[c.name] || null }); }
}
const data = JSON.stringify(d).replace(/</g, "\\u003c");
const html = readFileSync(new URL("./app.html", import.meta.url), "utf8").replace("__DATA__", () => data);
writeFileSync(new URL("./index.html", import.meta.url), html);
console.log("console/index.html", (html.length / 1024).toFixed(0) + " KB");
