// Opens (or closes as not needed) the GitHub issue for one "Missing somewhere" gap. Runs in the gap-task workflow.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { C, W, A, O, K = "gap", N = "", GITHUB_REPOSITORY: REPO } = process.env;
if (!/^[A-Za-z][\w.-]{0,60}$/.test(C) || !["Figma", "Storybook", "Docs"].includes(W) || !["create", "skip"].includes(A)) throw new Error("invalid input");
const team = JSON.parse(readFileSync("console/team.json", "utf8")).people;
const owner = team.find((p) => p.id === O) ?? team.find((p) => p.areas.includes(W));
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" }).trim();
const label = (n, color, d) => { try { gh("label", "create", n, "--color", color, "--description", d, "-R", REPO); } catch {} };
label("seamline-gap", "6d48c8", "A component missing in Figma, Storybook or docs"); label(`area:${W.toLowerCase()}`, "e39b3c", `Missing in ${W}`); label("not-needed", "8e98b0", "Marked not needed by the design system lead");
const title = K === "fix" ? `${A === "skip" ? "Not needed" : "Fix"}: ${C} in ${W}` : `${A === "skip" ? "Not needed" : "Create"}: ${C} in ${W}`;
const existing = gh("issue", "list", "-R", REPO, "--label", "seamline-gap", "--state", "all", "--search", `"${C} in ${W}" in:title`, "--json", "number,title", "-q", ".[].title");
if (existing.split("\n").some((t) => t === title || (A === "skip" && t.endsWith(`: ${C} in ${W}`) && K === "gap"))) { console.log("already recorded"); process.exit(0); }
let docs = {}; try { docs = JSON.parse(readFileSync("fixtures/primer-react/package/generated/components.json", "utf8")).components ?? {}; } catch {}
const doc = Object.values(docs).find((d) => d.name === C);
const opts = (doc?.props ?? []).filter((p) => /^(variant|size)$/.test(p.name)).map((p) => `- \`${p.name}\`: ${p.type}${p.defaultValue ? ` (default ${p.defaultValue})` : ""}`).join("\n");
const what = K === "fix" ? `**Suggested fix (Nemotron Ultra):** ${N}` : { Figma: `Create a **${C}** component set in the Primer Web Figma file so designers can place it.`, Storybook: `Add stories for **${C}** so engineers can see and test it.`, Docs: `Write the **${C}** page on primer.style so people can find how to use it.` }[W];
const body = A === "skip"
  ? `The design system lead marked **${C}** as not needed in ${W}. Seamline won't ask again.`
  : `${what}\n\n**Owner:** ${owner ? `${owner.name} (${owner.role})` : "unassigned"}\n\n**Options in code**\n${opts || "- (no variant or size props)"}\n\n**Where it lives**\n- Code: https://github.com/primer/react/tree/main/packages/react/src/${C}\n${doc ? `- Docs status: ${doc.status}\n` : ""}\nOpened by Seamline from the console's "Missing somewhere" list. Seamline closes it when ${C} shows up in ${W}.`;
const args = ["issue", "create", "-R", REPO, "--title", title, "--body", body, "--label", "seamline-gap", "--label", `area:${W.toLowerCase()}`];
if (A === "skip") args.push("--label", "not-needed");
if (A === "create" && owner?.github) args.push("--assignee", owner.github);
const url = gh(...args); console.log(url);
if (A === "skip") gh("issue", "close", url, "-R", REPO, "--reason", "not planned");
