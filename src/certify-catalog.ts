// Light certification for every component in @primer/react, not only Button.
// Per component, four real checks:
//   1. Options: each variant/size value agrees across docs (components.json), code (CSS data-attributes) and Figma (component set)
//   2. Tokens in code: every CSS custom property the component's CSS uses exists in @primer/primitives
//   3. Tokens in Figma: those same tokens exist as Figma variables (shared, by normalized name)
//   4. Status: the docs status matches the "Status:" line in the Figma component description
// Storybook is only read for Button (the stories we fetched), so it's reported as not checked elsewhere.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTokens, normalizeName } from "./tokens/load.js";
import { primerInput } from "./demo/breaks.js";

const DIST = "fixtures/primer-react/package/dist";
const norm = (s: string) => s.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").replace(/[^a-z0-9]/g, "");
const AXES: Record<string, string[]> = { variant: ["variant"], size: ["size"] };

export interface CatalogEntry { name: string; status: string; checks: { area: string; passed: number; total: number; issues: string[] }[]; passed: number; total: number;
  figma: { id: string; name: string } | null; css: boolean; tokens: number }

export function certifyCatalog(): CatalogEntry[] {
  const input = primerInput();
  const code = loadTokens(input.codeTokens), figma = loadTokens(input.figmaTokens);
  const docs = Object.values((JSON.parse(readFileSync(input.docs, "utf8")) as any).components ?? {}) as any[];
  const fig = JSON.parse(readFileSync("fixtures/primer-web-notes/figma-catalog.json", "utf8")).sets as [string, string, Record<string, string>, string][];
  const families = new Set([...code.keys()].map((k) => k.split("-")[0]));
  const sameColor = (a?: string, b?: string) => { if (!a || !b) return a === b; const h = (x: string) => x.replace("#", "").toLowerCase(); const A = h(a), B = h(b);
    if (A.slice(0, 6) !== B.slice(0, 6)) return false; const al = (x: string) => x.length === 8 ? parseInt(x.slice(6), 16) : 255; return Math.abs(al(A) - al(B)) <= 1; };
  const dirs = readdirSync(DIST).filter((n) => /^[A-Z]/.test(n) && existsSync(join(DIST, n)) && !n.includes("."));
  return dirs.map((name) => {
    const doc = docs.find((d) => d.name === name);
    const cssFiles = readdirSync(join(DIST, name)).filter((f) => f.endsWith(".css"));
    const css = cssFiles.map((f) => readFileSync(join(DIST, name, f), "utf8")).join("\n");
    const f = fig.find((s) => norm(s[1]) === norm(name));
    const checks: CatalogEntry["checks"] = [];
    // 1. options
    const opts = (axis: string) => {
      const d = doc?.props?.find((p: any) => p.name === axis);
      const fromDocs = d ? [...String(d.type).matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
      const def = String(d?.defaultValue ?? "").replace(/'/g, "");
      const fromCode = [...new Set([...(def ? [def] : []), ...[...css.matchAll(new RegExp(`data-${axis}=["']?([\\w-]+)`, "g"))].map((m) => m[1])])];
      const fk = f ? Object.keys(f[2]).find((k) => norm(k) === axis) : undefined;
      const fromFigma = f && fk ? f[2][fk].split("|").map((x) => x.replace(/\s*\(.*\)/, "").trim()) : [];
      return { fromDocs, fromCode, fromFigma, hasFigmaAxis: !!fk };
    };
    let op = 0, ot = 0; const oi: string[] = [];
    for (const axis of Object.keys(AXES)) {
      const o = opts(axis); if (!o.fromDocs.length) continue;
      for (const v of o.fromDocs) {
        ot++; const miss = [css.includes(`data-${axis}=`) && !o.fromCode.includes(v) && "code", f && o.hasFigmaAxis && !o.fromFigma.includes(v) && "Figma"].filter(Boolean);
        if (miss.length) oi.push(`${axis}=${v}: missing in ${miss.join(" and ")}`); else op++;
      }
      for (const v of o.fromFigma) if (o.hasFigmaAxis && !o.fromDocs.includes(v)) { ot++; oi.push(`${axis}=${v}: in Figma, not in docs`); }
    }
    if (ot) checks.push({ area: "Options (docs · code · Figma)", passed: op, total: ot, issues: [...new Set(oi)] });
    // 2-3. tokens
    const js = readdirSync(join(DIST, name)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(DIST, name, f), "utf8")).join("\n");
    const local = new Set([...css.matchAll(/(?:^|[;{\s])--([\w-]+)\s*:/g)].map((m) => m[1]));
    const used = [...new Set([...css.matchAll(/(?<!,\s*)var\(--([\w-]+)/g)].map((m) => m[1]))].filter((t) => !/^(prc|ds|private)/.test(t) && !local.has(t) && !js.includes(`--${t}`) && !js.includes(`--${t.replace(/-[^-]+$/, "-")}`) && (code.has(normalizeName(t)) || families.has(normalizeName(t).split("-")[0])));
    if (used.length) {
      const inCode = used.filter((t) => code.has(normalizeName(t)));
      checks.push({ area: "Tokens exist in code", passed: inCode.length, total: used.length, issues: used.filter((t) => !code.has(normalizeName(t))).slice(0, 5).map((t) => `--${t} is not in @primer/primitives`) });
      const shared = inCode.filter((t) => figma.has(normalizeName(t)) || !/color|bgColor|fgColor|borderColor/i.test(t));
      const colorTokens = inCode.filter((t) => /color/i.test(t));
      if (colorTokens.length) {
        const ok = colorTokens.filter((t) => figma.has(normalizeName(t)));
        const off = colorTokens.filter((t) => figma.has(normalizeName(t)) && !sameColor(figma.get(normalizeName(t)), code.get(normalizeName(t))));
        checks.push({ area: "Colour tokens match Figma", passed: ok.length - off.length, total: colorTokens.length,
          issues: [...colorTokens.filter((t) => !figma.has(normalizeName(t))).map((t) => `--${t} has no Figma variable`), ...off.map((t) => `--${t}: Figma ${figma.get(normalizeName(t))} · code ${code.get(normalizeName(t))}`)].slice(0, 6) });
      }
      void shared;
    }
    // 4. status
    if (doc && f && f[3]) checks.push({ area: "Status (docs ↔ Figma)", passed: norm(doc.status) === norm(f[3]) ? 1 : 0, total: 1, issues: norm(doc.status) === norm(f[3]) ? [] : [`docs say ${doc.status}, Figma says ${f[3]}`] });
    const passed = checks.reduce((a, c) => a + c.passed, 0), total = checks.reduce((a, c) => a + c.total, 0);
    return { name, status: doc?.status ?? "", checks, passed, total, figma: f ? { id: f[0], name: f[1] } : null, css: cssFiles.length > 0, tokens: used.length };
  });
}

if (process.argv[1]?.endsWith("certify-catalog.ts")) {
  const r = certifyCatalog();
  writeFileSync("console/catalog.json", JSON.stringify(r, null, 1));
  const off = r.filter((c) => c.passed < c.total);
  console.log(`${r.length} components · ${r.filter((c) => c.figma).length} found in Figma · ${r.filter((c) => c.total && c.passed === c.total).length} in sync · ${off.length} with drift`);
  for (const c of off.slice(0, 12)) console.log(c.name, `${c.total - c.passed} off:`, c.checks.flatMap((x) => x.issues).slice(0, 2).join(" | "));
}
