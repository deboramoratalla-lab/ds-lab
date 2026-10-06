// Before a new component option lands (e.g. Button size="xsmall"), do the research a design-system
// team does by hand: how do other public systems define it, and what do the standards require?
// Tavily searches only official sources; Nemotron Super compares, using only numbers it can cite.

import { search, type WebResult } from "./tavily.js";
import { chat, parseJson } from "../llm/nebius.js";

export interface Reference { system: string; domains: string[]; exclude?: string[] }

export const REFERENCES: Reference[] = [
  { system: "Primer (GitHub)", domains: ["primer.style"] },
  { system: "Carbon (IBM)", domains: ["carbondesignsystem.com"], exclude: ["v10.carbondesignsystem.com", "v11.carbondesignsystem.com"] },
  { system: "Polaris (Shopify)", domains: ["polaris-react.shopify.com", "polaris.shopify.com"] },
  { system: "Atlassian", domains: ["atlassian.design"] },
  { system: "Material 3", domains: ["m3.material.io"] },
];
export const STANDARDS: Reference = { system: "WCAG 2.2", domains: ["w3.org"] };

export interface Proposal { component: string; axis: string; option: string; ours: Record<string, string>;
  /** the rest of this axis in your own system, read from code: option -> value */
  scale?: Record<string, string> }

export interface Finding { system: string; summary: string; values: string[]; url: string }
export interface Benchmark {
  proposal: Proposal;
  findings: Finding[];
  standard?: Finding;
  verdict: "consistent" | "review" | "against-standard";
  recommendation: string;
  searches: number;
  /** findings the model gave whose numbers weren't in its cited source */
  dropped: number;
}

export async function benchmark(p: Proposal): Promise<Benchmark> {
  const q = `${p.component} ${p.axis} options ${p.axis === "size" ? "height px" : ""}`.trim();
  const [refs, std] = await Promise.all([
    Promise.all(REFERENCES.map(async (r) => ({ r, res: await search(`${r.system} ${q}`, { domains: r.domains, exclude: r.exclude, max: 3, depth: "advanced" }) }))),
    search(p.axis === "size" ? "WCAG 2.2 target size minimum understanding" : `WCAG 2.2 ${p.component} ${p.axis}`, { domains: STANDARDS.domains, max: 2 }),
  ]);
  const sources: { system: string; r: WebResult }[] = [
    ...refs.flatMap(({ r, res }) => res.map((x) => ({ system: r.system, r: x }))),
    ...std.map((x) => ({ system: STANDARDS.system, r: x })),
  ];
  const text = sources.map((s, i) => `[${i}] (${s.system}) ${s.r.url}\n${s.r.content.slice(0, 1800)}`).join("\n\n");

  const out = parseJson<{ findings: { system: string; summary: string; values: string[]; source: number }[]; standard: { summary: string; values: string[]; source: number } | null }>(await chat({
    role: "super", think: true, json: true, maxTokens: 6000,
    system: "You are a design-system researcher. Use ONLY facts that literally appear in the numbered sources, and cite the source index. " +
      "If a system's sources don't state the relevant values, leave it out rather than guess. Never claim a system lacks something: absence in these snippets proves nothing. Values must be copied as written (e.g. '24px', '1.5rem').",
    user: `A team is adding ${p.component} ${p.axis}="${p.option}" with: ${JSON.stringify(p.ours)}.\n` +
      `1) For each design system, how does it define ${p.component} ${p.axis} options (names and ${p.axis === "size" ? "heights" : "values"})?\n` +
      `2) What does the standard require that applies here?\n` +
      `Return JSON {"findings":[{"system","summary","values":[],"source":i}],"standard":{"summary","values":[],"source":i}|null}.\n\n${text}`,
  }));

  let dropped = 0;
  // keep only findings whose values really appear in the cited source
  // every number in a value must appear in the cited source (formats vary: "24px", "24 / 1.5", "24 by 24")
  const cited = (vals: string[], i: number) => !!sources[i] && vals.length > 0 &&
    vals.every((v) => (v.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => sources[i].r.content.includes(n)));
  const findings = out.findings.filter((f) => cited(f.values, f.source) && !/\b(does not|doesn't|no named|lacks)\b/i.test(f.summary))
    .map((f) => ({ system: sources[f.source].system, summary: f.summary, values: f.values, url: sources[f.source].r.url }));
  const standard = out.standard && cited(out.standard.values, out.standard.source)
    ? { system: STANDARDS.system, summary: out.standard.summary, values: out.standard.values, url: sources[out.standard.source].r.url } : undefined;
  dropped = out.findings.length - findings.length;
  // step 2: the verdict sees ONLY the findings that survived the citation check
  const own = p.scale ? { system: "Your system (code)", summary: `Existing ${p.axis} options`, values: Object.entries(p.scale).map(([k, x]) => `${k}: ${x}`), url: "local" } : undefined;
  if (own) findings.unshift(own);
  // fit with the team's own scale, computed rather than left to the model
  let fit = "";
  const n = (x?: string) => parseFloat(x ?? "");
  const mine = n(Object.values(p.ours)[0]), steps = Object.values(p.scale ?? {}).map(n).filter((x) => !isNaN(x)).sort((a, b) => a - b);
  if (!isNaN(mine) && steps.length > 1) {
    const gaps = steps.slice(1).map((x, i) => x - steps[i]);
    const next = steps.find((x) => x > mine), prev = [...steps].reverse().find((x) => x < mine);
    const gap = next !== undefined ? next - mine : mine - (prev ?? mine);
    fit = steps.includes(mine) ? `Same value as an existing option (${mine}px): it duplicates it.`
      : `Sits ${gap}px from the nearest step (${next ?? prev}px); existing steps are ${gaps.join(", ")}px apart, so it ${gap >= Math.min(...gaps) && gap <= Math.max(...gaps) ? "fits" : "does not fit"} the scale.`;
  }
  const v = parseJson<{ verdict: Benchmark["verdict"]; recommendation: string }>(await chat({
    role: "super", think: false, json: true,
    system: "You advise a design-system team. Use only the verified findings given. Don't mention any system that isn't in them.",
    user: `Proposal: ${p.component} ${p.axis}="${p.option}" ${JSON.stringify(p.ours)}\nVerified findings:\n${JSON.stringify({ findings, standard }, null, 1)}\nFit with the team's own scale (computed, trust it): ${fit || "unknown"}\n` +
      `Mention the own-scale fit in the recommendation. ` +
      `Verdict: "consistent" (in line with the references and the standard), "review" (unusual vs the references, or doesn't fit the team's own scale), or "against-standard". ` +
      `Then one or two plain sentences for the team. Return JSON {"verdict","recommendation"}.`,
  }));
  return { proposal: p, findings, dropped, verdict: v.verdict, recommendation: v.recommendation, standard, searches: REFERENCES.length + 1 };
}
