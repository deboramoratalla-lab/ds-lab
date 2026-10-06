// "Is it out of date?" Before blaming Figma or code for a drift, check whether the versions we
// certified against are still the latest published ones. Tavily finds the sources,
// Nemotron Nano reads them and extracts the latest version, citing where it saw it.

import { readFileSync } from "node:fs";
import { search, type WebResult } from "./tavily.js";
import { chat, parseJson } from "../llm/nebius.js";

export interface Freshness { pkg: string; local: string; latest?: string; source?: string; behind: boolean; staleSource: boolean; note: string }

const semver = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
export const isBehind = (local: string, latest: string) => {
  const a = semver(local), b = semver(latest);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

export async function checkFreshness(pkg: string, packageJson: string, repo: string): Promise<Freshness> {
  const local = JSON.parse(readFileSync(packageJson, "utf8")).version as string;
  const results: WebResult[] = await search(`${pkg} latest release version`, { max: 5, domains: ["github.com", "npmjs.com"] });
  const sources = results.filter((r) => r.url.includes(repo) || r.url.includes(`npmjs.com/package/${pkg}`));
  const text = sources.map((r, i) => `[${i}] ${r.url}\n${r.content.slice(0, 1500)}`).join("\n\n");
  const out = parseJson<{ latest: string | null; source: number | null; note: string }>(await chat({
    role: "nano", think: false, json: true,
    system: "You read release pages and extract version numbers. Only report a version that literally appears in the text. Never guess.",
    user: `Package: ${pkg}\nWhat is the most recent published version of this package according to these sources? ` +
      `Ignore versions of other packages. Return JSON {"latest": "x.y.z" | null, "source": index | null, "note": "one short sentence"}.\n\n${text}`,
  }));
  const latest = out.latest && /^\d+\.\d+\.\d+$/.test(out.latest) && text.includes(out.latest) ? out.latest : undefined;
  return {
    pkg, local, latest, source: latest && out.source !== null ? sources[out.source]?.url : undefined,
    behind: latest ? isBehind(local, latest) : false,
    // the web says an older version is "latest" than the one we already have: that page is a stale snapshot
    staleSource: latest ? isBehind(latest, local) : false,
    note: !latest ? "No version found in the sources; can't tell."
      : isBehind(latest, local) ? `The source still lists ${latest}, older than ours: that page is out of date, can't confirm we're current.` : out.note,
  };
}
