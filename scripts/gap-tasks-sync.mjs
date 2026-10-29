// Reads the issues the console opened for "Missing somewhere" gaps and writes console/gap-tasks.json, so the console
// shows "Task #N · owner" (or "Not needed") instead of asking again. Also closes a task once the gap is gone.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const REPO = process.env.DS_LAB_REPO ?? "deboramoratalla-lab/ds-lab";
let list = [];
try { list = JSON.parse(execFileSync("gh", ["api", `repos/${REPO}/issues?labels=seamline-gap&state=all&per_page=100`], { encoding: "utf8" })); } catch (e) { console.error("could not read issues:", String(e).slice(0, 120)); }
const team = JSON.parse(readFileSync("console/team.json", "utf8")).people;
const cat = existsSync("console/catalog.json") ? JSON.parse(readFileSync("console/catalog.json", "utf8")) : [];
const tasks = list.map((i) => { const m = i.title.match(/^(Create|Not needed): (\S+) in (Figma|Storybook|Docs)$/); if (!m) return null;
  const owner = team.find((p) => i.body?.includes(`**Owner:** ${p.name}`));
  return { component: m[2], where: m[3], action: m[1] === "Create" ? "create" : "skip", number: i.number, url: i.html_url, state: i.state, owner: owner?.id ?? null }; }).filter(Boolean);
// close a Create task once the component shows up where it was missing (Figma for now: the catalog knows)
for (const t of tasks) if (t.action === "create" && t.state === "open" && t.where === "Figma" && cat.find((c) => c.name === t.component)?.figma) {
  try { execFileSync("gh", ["issue", "close", String(t.number), "-R", REPO, "-c", `${t.component} is in Figma now. Closed by Seamline.`]); t.state = "closed"; } catch {}
}
writeFileSync("console/gap-tasks.json", JSON.stringify({ at: new Date().toISOString(), tasks }, null, 1));
console.log(`${tasks.length} gap tasks`);
