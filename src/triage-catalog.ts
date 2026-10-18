// Nemotron Ultra triages the drift found in the other components (everything but Button, which the agent repairs):
// for each component with issues, which side should change and the one-line fix. One call per component, in parallel.
// Writes console/catalog-triage.json. Suggestions only: they are shown to the lead, never applied.
import { readFileSync, writeFileSync } from "node:fs";
import { chat, parseJson, usage } from "./llm/nebius.js";

const cat = JSON.parse(readFileSync("console/catalog.json", "utf8")) as any[];
const todo = cat.filter((c) => c.name !== "Button" && c.passed < c.total);
const SYSTEM = `You triage drift in GitHub's Primer design system between docs (primer.style components.json), code (@primer/react CSS) and Figma (Primer Web).
Rules: docs and code ship to users, so they usually win over Figma; a misspelling is fixed where it is misspelled; status (alpha/beta/deprecated) is owned by docs.
Never invent commits, files or facts that are not in the issues. If the issues are ambiguous, say what to check and use a low confidence.
Answer JSON: {"fix":"one short sentence, imperative, naming the side to change","side":"figma"|"code"|"docs","confidence":0..1}`;
const out: Record<string, unknown> = {};
const t0 = Date.now();
await Promise.all(todo.map(async (c) => {
  const issues = c.checks.flatMap((x: any) => x.issues.map((i: string) => `${x.area}: ${i}`)).slice(0, 8).join("\n");
  try {
    const r = parseJson<{ fix: string; side: string; confidence: number }>(await chat({ role: "ultra", json: true, maxTokens: 400, system: SYSTEM, user: `Component: ${c.name} (docs status: ${c.status || "none"})\nIssues:\n${issues}` }));
    out[c.name] = { ...r, confidence: Number(r.confidence) };
  } catch (e) { out[c.name] = { error: String(e).slice(0, 120) }; }
}));
writeFileSync("console/catalog-triage.json", JSON.stringify({ at: new Date().toISOString(), ms: Date.now() - t0, usage, items: out }, null, 1));
console.log(`${todo.length} components triaged in ${((Date.now() - t0) / 1000).toFixed(1)} s`, Object.entries(out).map(([k, v]: any) => `${k}: ${v.fix ?? v.error}`).join("\n"));
