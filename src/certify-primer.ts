// Certifies the real Primer Web Figma file against GitHub's code (light theme).
// Same four checks as the baseline, but compares resolved VALUES, because the real file binds
// some properties to different (equivalent) tokens than the code does. Those are reported as
// warnings: they look identical today and would split apart if one of the tokens changed.

import { readFileSync } from "node:fs";
import { loadTokens, normalizeName, type TokenMap } from "./tokens/load.js";
import { compareTokens } from "./tokens/drift.js";
import { extractComponent } from "./migrate/component.js";
import { loadPrimerDoc, propOptions, fourWayDrift, storybookFromFiles } from "./docs/primer.js";
import type { Check } from "./certify.js";

export interface PrimerCertifyInput {
  figmaTokens: string;      // folder with the exported Figma variables (light)
  codeTokens: string;       // comma-separated CSS files/folders
  buttonSnapshot: string;   // Figma Button bindings + options + description
  buttonCss: string;        // @primer/react ButtonBase CSS
  docs: string;             // @primer/react generated/components.json
  stories: string[];        // real Storybook files from primer/react (Button*.stories.tsx)
  exceptions: Record<string, string>; // token -> why it's accepted as different
  /** tokens shared by both sides at the last certification; one disappearing from a side is a broken link */
  baselineShared?: string[];
  /** renames agreed since then: old name -> new name (a link is kept if the new name exists on both sides) */
  renames?: Record<string, string>;
}

export function sharedTokens(i: PrimerCertifyInput): string[] {
  const d = compareTokens(loadTokens(i.figmaTokens), loadTokens(i.codeTokens));
  const off = new Set(d.items.filter((x) => x.kind !== "value-mismatch").map((x) => x.name));
  const code = loadTokens(i.codeTokens);
  return [...loadTokens(i.figmaTokens).keys()].filter((k) => code.has(k) && !off.has(k));
}

const isTransparent = (v?: string) => !v || v === "transparent" || /^#[0-9a-f]{6}00$/.test(v);
const pxEq = (a?: string, b?: string) => a !== undefined && b !== undefined && parseFloat(a) === parseFloat(b);

export function certifyPrimer(i: PrimerCertifyInput): { checks: Check[]; warnings: string[]; ok: boolean } {
  const figma = loadTokens(i.figmaTokens);
  const code = loadTokens(i.codeTokens);
  const checks: Check[] = [];
  const warnings: string[] = [];

  // 1. Tokens shared by both sides (Figma-only and code-only tokens are out of scope, reported as counts)
  const drift = compareTokens(figma, code);
  const conflicts = drift.items.filter((x) => x.kind === "value-mismatch");
  const real = conflicts.filter((x) => !i.exceptions[x.name]);
  const shared = drift.inSync + conflicts.length;
  checks.push({ area: "Shared tokens (Figma ↔ code, light)", passed: shared - real.length, total: shared,
    issues: real.map((x) => `${x.name}: Figma ${x.design} · code ${x.code}`) });
  for (const x of conflicts.filter((x) => i.exceptions[x.name])) warnings.push(`accepted exception ${x.name}: ${i.exceptions[x.name]}`);
  if (i.baselineShared) {
    const here = (k: string) => figma.has(k) && code.has(k);
    const lost = i.baselineShared.filter((k) => !here(k) && !(i.renames?.[k] && here(i.renames[k])));
    checks.push({ area: "Links kept since last certification", passed: i.baselineShared.length - lost.length, total: i.baselineShared.length,
      issues: lost.map((k) => `${k}: now missing in ${!figma.has(k) ? "Figma" : "code"}`) });
  }
  warnings.push(`out of scope: ${drift.counts["missing-in-code"]} Figma-only and ${drift.counts["missing-in-design"]} code-only tokens; ${drift.counts.structural} modelled differently (composite shadows, px vs ratio line-heights)`);

  // 2. Button: every property resolves to the same value as the token the code uses
  const snap = JSON.parse(readFileSync(i.buttonSnapshot, "utf8"));
  const doc = loadPrimerDoc(i.docs, "Button");
  const spec = extractComponent("Button", i.buttonCss, "prc-Button-ButtonBase", ["data-variant", "data-size"]);
  const variants = propOptions(doc, "variant"), sizes = propOptions(doc, "size");
  const val = (map: TokenMap, name: string | null | undefined) => (name ? map.get(normalizeName(name)) : undefined);
  const tokenOf = (sv?: { token?: string; value: string }) => sv?.token ?? sv?.value.match(/var\(--([\w-]+)/)?.[1];
  let passed = 0, total = 0;
  const issues: string[] = [];
  for (const v of variants) for (const s of sizes) {
    const key = `variant=${v}, size=${s}`;
    const fig = snap.bindings[key];
    if (!fig) { issues.push(`${key}: missing in Figma`); total++; continue; }
    const st = { ...spec.base, ...(spec.axes.size?.[s] ?? {}), ...(spec.axes.variant?.[v] ?? {}) };
    const pairs: [string, string | null, string | undefined, string | undefined][] = [
      ["padding-inline", fig.padX, tokenOf(st.padding), st.padding?.value],
      ["gap", fig.gap, tokenOf(st.gap), st.gap?.value],
      ["radius", fig.radius, tokenOf(st["border-radius"]), st["border-radius"]?.value],
      ["background", fig.bg, tokenOf(st["background-color"]), st["background-color"]?.value],
      // `border: unset` on a variant removes the border entirely, whatever the base border-color says
      st.border?.value === "unset" ? ["border", fig.border, undefined, "transparent"] : ["border", fig.border, tokenOf(st["border-color"]), st["border-color"]?.value],
      ["text color", fig.fg, tokenOf(st.color), st.color?.value],
      ["font size", fig.font, tokenOf(st["font-size"]), st["font-size"]?.value],
    ];
    for (const [prop, figTok, codeTok, codeLiteral] of pairs) {
      if (prop === "font size" && codeLiteral === "inherit") continue; // link inherits font size in code
      total++;
      const fv = val(figma, figTok), cv = codeTok ? val(code, codeTok) : codeLiteral;
      const ok = fv === cv || (isTransparent(fv) && isTransparent(cv)) || (fv === undefined && (cv === "0" || cv === undefined)) || pxEq(fv, cv);
      if (!ok) { issues.push(`${key} ${prop}: Figma ${figTok ?? "—"} (${fv ?? "none"}) · code ${codeTok ?? codeLiteral ?? "—"} (${cv ?? "none"})`); continue; }
      passed++;
      if (figTok && codeTok && normalizeName(figTok) !== normalizeName(codeTok))
        warnings.push(`${key} ${prop}: same value, different token (Figma ${figTok} · code ${codeTok})`);
    }
    if (fig.heightPx !== null) {
      total++;
      const ch = val(code, tokenOf(st.height));
      if (pxEq(String(fig.heightPx), ch)) passed++; else issues.push(`${key} height: Figma ${fig.heightPx}px · code ${ch}`);
    }
  }
  checks.push({ area: "Button properties (Figma ↔ code, by value)", passed, total, issues });

  // 3. Options in all four places
  const codeAxes = Object.fromEntries(["variant", "size"].map((a) => {
    const def = doc.props.find((p) => p.name === a)?.defaultValue?.replace(/'/g, "");
    return [a, [...new Set([...(def ? [def] : []), ...Object.keys(spec.axes[a] ?? {})])]];
  }));
  const four = fourWayDrift(doc, codeAxes, snap.options, storybookFromFiles(i.stories, "Button", ["variant", "size"]));
  checks.push({ area: "Button options (docs · code · Figma · Storybook)", passed: four.inSync, total: four.total,
    issues: four.gaps.map((g) => `${g.axis}=${g.option}: missing in ${[!g.inDocs && "docs", !g.inCode && "code", !g.inFigma && "Figma", !g.inStorybook && "Storybook"].filter(Boolean).join(", ")}`) });

  // 4. Figma description says what the docs say (React section)
  const react = (snap.description as string).split(/Rails/)[0];
  const facts: [string, boolean][] = [
    [`status ${doc.status}`, new RegExp(`Status:\\s*${doc.status}`, "i").test(react)],
    [`accessibility reviewed ${doc.a11yReviewed}`, !doc.a11yReviewed || react.includes(doc.a11yReviewed)],
  ];
  checks.push({ area: "Button docs in Figma (React status ↔ docs)", passed: facts.filter((f) => f[1]).length, total: facts.length,
    issues: facts.filter((f) => !f[1]).map((f) => `Figma description doesn't say: ${f[0]}`) });

  // 5. Text contrast per variant (WCAG 2.2 AA, 4.5:1), checked on both sides: a value can match and still be unreadable
  const canvas = val(code, "bgColor-default") ?? "#ffffff";
  let cp = 0;
  const cIssues: string[] = [];
  for (const v of variants) {
    const fig = snap.bindings[`variant=${v}, size=${sizes.includes("medium") ? "medium" : sizes[0]}`];
    const st = { ...spec.base, ...(spec.axes.variant?.[v] ?? {}) };
    const side = (fg?: string, bg?: string) => (fg ? contrast(fg, bg && !isTransparent(bg) ? bg : canvas, canvas) : null);
    const f = fig ? side(val(figma, fig.fg), val(figma, fig.bg)) : null;
    const cFg = tokenOf(st.color), cBg = tokenOf(st["background-color"]);
    const c = side(cFg ? val(code, cFg) : st.color?.value, cBg ? val(code, cBg) : st["background-color"]?.value);
    if (f === null && c === null) { cIssues.push(`variant=${v} text: colours not resolved`); continue; }
    const low = [f !== null && f < 4.5 && `Figma ${f.toFixed(1)}:1`, c !== null && c < 4.5 && `code ${c.toFixed(1)}:1`].filter(Boolean);
    if (low.length) cIssues.push(`variant=${v} text: ${low.join(" · ")} (needs 4.5:1)`); else cp++;
  }
  checks.push({ area: "Button text contrast (WCAG AA, Figma and code)", passed: cp, total: variants.length, issues: cIssues });

  return { checks, warnings, ok: checks.every((c) => c.passed === c.total) };
}

// WCAG relative luminance contrast; colours with alpha are composited over the page background first.
function rgba(c: string): [number, number, number, number] | null {
  c = c.trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map((x) => x + x).join(""); const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]; }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}
function contrast(fg: string, bg: string, page: string): number | null {
  const P = rgba(page) ?? [255, 255, 255, 1];
  const over = (c: [number, number, number, number], u: number[]) => [0, 1, 2].map((i) => c[i] * c[3] + u[i] * (1 - c[3]));
  const b0 = rgba(bg), f0 = rgba(fg); if (!b0 || !f0) return null;
  const b = over(b0, P), f = over(f0, b);
  const L = (x: number[]) => { const [r, g, bl] = x.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [a, z] = [L(f), L(b)].sort((x, y) => y - x);
  return (a + 0.05) / (z + 0.05);
}
