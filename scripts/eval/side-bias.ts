// Side-bias test for Nemotron Ultra's conflict call: same evidence, sides swapped. If Ultra follows the evidence,
// its pick should follow the argument, not the side (Figma or code). Also runs a neutral pair with no argument.
import { existsSync } from "node:fs"; if (existsSync(".env")) process.loadEnvFile(".env");
import { resolveConflicts } from "../../src/agents/resolver.js";
const N = Number(process.env.N || 5), tok = "button-invisible-fg-color-rest";
const brand = "'Brand refresh: invisible buttons use the link blue so they read as actions.'", fix = "'fix: invisible buttons should match default text, blue clashed with links in tables'";
const cases = {
  original: { design: "#0969da", code: "#59636e", note: `Figma change by a designer, version note: ${brand} Code change by an engineer, commit message: ${fix}.` },
  swapped: { design: "#59636e", code: "#0969da", note: `Figma change by a designer, version note: ${fix} Code change by an engineer, commit message: ${brand}.` },
  neutral: { design: "#0969da", code: "#59636e", note: "Figma change by a designer, version note: 'update colour'. Code change by an engineer, commit message: 'update colour'." },
};
const out: Record<string, string[]> = {};
for (const [k, c] of Object.entries(cases)) {
  const runs = await Promise.all(Array.from({ length: N }, () => resolveConflicts([{ kind: "value-mismatch", name: tok, design: c.design, code: c.code } as any], { notes: { [tok]: c.note } })));
  out[k] = runs.map((r) => `${r[0].verdict} ${Math.round(r[0].confidence * 100)}%`); if (!runs[0][0].confidence) console.log(runs[0][0].why);
  console.log(k.padEnd(9), out[k].join(" | "));
}
const { writeFileSync } = await import("node:fs");
writeFileSync("console/side-bias.json", JSON.stringify({ at: new Date().toISOString(), runs: N, cases: out }, null, 1));
