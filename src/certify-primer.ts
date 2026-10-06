// Certifies the real Primer Web Figma file against GitHub's code (light theme).
// Same four checks as the baseline, but compares resolved VALUES, because the real file binds
// some properties to different (equivalent) tokens than the code does. Those are reported as
// warnings: they look identical today and would split apart if one of the tokens changed.

import { readFileSync } from "node:fs";
import { loadTokens, normalizeName, type TokenMap } from "./tokens/load.js";
import { compareTokens } from "./tokens/drift.js";
import { extractComponent } from "./migrate/component.js";
import { loadPrimerDoc, propOptions, fourWayDrift, storybookAxes } from "./docs/primer.js";
import type { Check } from "./certify.js";

export interface PrimerCertifyInput {
  figmaTokens: string;      // folder with the exported Figma variables (light)
  codeTokens: string;       // comma-separated CSS files/folders
  buttonSnapshot: string;   // Figma Button bindings + options + description
  buttonCss: string;        // @primer/react ButtonBase CSS
  docs: string;             // @primer/react generated/components.json
  exceptions: Record<string, string>; // token -> why it's accepted as different
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
  const four = fourWayDrift(doc, codeAxes, snap.options, storybookAxes(doc, ["variant", "size"]));
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

  return { checks, warnings, ok: checks.every((c) => c.passed === c.total) };
}
