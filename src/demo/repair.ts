// The agent repairs a broken system back to certified, deciding who is right for each break.
// Nano pairs renames, Ultra judges value conflicts using what people wrote (commits, Figma notes),
// deterministic code does the mechanical fixes (re-binding, generating variants from the code's CSS).
// Anything Ultra can't settle is left for a person, never guessed.

import { readFileSync, readdirSync } from "node:fs";
import { loadTokens, normalizeName } from "../tokens/load.js";
import { compareTokens } from "../tokens/drift.js";
import { extractComponent } from "../migrate/component.js";
import { loadPrimerDoc, propOptions } from "../docs/primer.js";
import { matchRenamed } from "../agents/matcher.js";
import { resolveConflicts } from "../agents/resolver.js";
import type { PrimerCertifyInput } from "../certify-primer.js";
import type { Workspace } from "./breaks.js";

export interface Action { who: "nano" | "ultra" | "rule"; what: string; side: "Figma" | "code" | "Storybook" | "person" }

export async function repair(w: Workspace, input: PrimerCertifyInput, baseline: PrimerCertifyInput, baselineShared: string[], notes: Record<string, string>) {
  const baseFigma = loadTokens(baseline.figmaTokens), baseCode = loadTokens(baseline.codeTokens);
  const actions: Action[] = [];
  const pending: string[] = [];
  const renames: Record<string, string> = {};
  const figmaKeys = () => Object.keys(Object.assign({}, ...readFileSyncJson(input.figmaTokens)));
  const figmaName = (codeToken: string) => figmaKeys().find((k) => normalizeName(k) === codeToken);

  // 1. Renames: links that existed at the last certification and are now gone on one side (Nano)
  let figma = loadTokens(input.figmaTokens), code = loadTokens(input.codeTokens);
  const lost = baselineShared.filter((k) => !figma.has(k) || !code.has(k));
  if (lost.length) {
    const drift = compareTokens(figma, code);
    const lostSet = new Set(lost);
    const candidates = drift.items.filter((x) =>
      // only what changed since the last certification: the lost names and the names that are new on either side
      lostSet.has(x.name) || (x.kind === "missing-in-code" && !baseFigma.has(x.name)) || (x.kind === "missing-in-design" && !baseCode.has(x.name)));
    for (const m of await matchRenamed(candidates)) {
      const [oldName, newName] = lostSet.has(m.code) ? [m.code, m.design] : [m.design, m.code];
      renames[oldName] = newName;
      // a rename in Figma is adopted in code as a new name, keeping the old one as a deprecated alias
      w.codeOverride(`  --${toCssName(figmaName(newName) ?? newName)}: ${code.get(oldName)};`);
      actions.push({ who: "nano", side: "code", what: `rename ${oldName} → ${newName} adopted in code, old name kept as deprecated alias (confidence ${m.confidence})` });
    }
  }

  // 2. Value conflicts: who is right? (Ultra, with commits and Figma notes as evidence)
  figma = loadTokens(input.figmaTokens); code = loadTokens(input.codeTokens);
  const conflicts = compareTokens(figma, code).items.filter((x) => x.kind === "value-mismatch" && !input.exceptions[x.name]);
  for (const r of await resolveConflicts(conflicts, { notes })) {
    // both sides changed it since the last certification: Ultra can recommend, but a person decides
    const bothChanged = baseFigma.get(r.name) !== r.design && baseCode.get(r.name) !== r.code;
    if (bothChanged) {
      const rec = r.verdict === "ask-a-human" ? "no recommendation" : `Ultra leans ${r.verdict === "design-is-right" ? "Figma" : "code"}`;
      pending.push(`${r.name}: Figma ${r.design} vs code ${r.code}, both changed since last certification. ${rec}: ${r.why}`);
      actions.push({ who: "ultra", side: "person", what: `${r.name}: both sides changed it → a person decides (${rec})` });
    } else if (r.verdict === "code-is-right") {
      const k = figmaName(r.name)!;
      w.figma((v) => { v[k] = r.code; });
      actions.push({ who: "ultra", side: "Figma", what: `${r.name}: code is right → Figma ${r.design} → ${r.code}. ${r.why}` });
    } else if (r.verdict === "design-is-right") {
      w.codeOverride(`  --${toCssName(figmaName(r.name) ?? r.name)}: ${r.design};`);
      actions.push({ who: "ultra", side: "code", what: `${r.name}: design is right → code ${r.code} → ${r.design}. ${r.why}` });
    } else {
      pending.push(`${r.name}: Figma ${r.design} vs code ${r.code}. ${r.why}`);
      actions.push({ who: "ultra", side: "person", what: `${r.name}: needs a person. ${r.why}` });
    }
  }

  // 3. Bindings and missing variants: Figma components must use the token the code uses (rules)
  figma = loadTokens(input.figmaTokens); code = loadTokens(input.codeTokens);
  const doc = loadPrimerDoc(input.docs, "Button");
  const spec = extractComponent("Button", input.buttonCss, "prc-Button-ButtonBase", ["data-variant", "data-size"]);
  const tok = (sv?: { token?: string; value: string }) => sv?.token ?? sv?.value.match(/var\(--([\w-]+)/)?.[1];
  const props: [string, (st: any) => string | undefined][] = [
    ["padX", (st) => tok(st.padding)], ["gap", (st) => tok(st.gap)], ["radius", (st) => tok(st["border-radius"])],
    ["bg", (st) => tok(st["background-color"])], ["border", (st) => (st.border?.value === "unset" ? undefined : tok(st["border-color"]))],
    ["fg", (st) => tok(st.color)], ["font", (st) => (st["font-size"]?.value === "inherit" ? undefined : tok(st["font-size"]))],
  ];
  const sizes = propOptions(doc, "size"), variants = propOptions(doc, "variant");
  let rebound = 0, created = 0;
  w.snapshot((snap) => {
    for (const v of variants) for (const s of sizes) {
      const key = `variant=${v}, size=${s}`;
      const st = { ...spec.base, ...(spec.axes.size?.[s] ?? {}), ...(spec.axes.variant?.[v] ?? {}) };
      if (!snap.bindings[key]) {
        const b: any = { height: null, heightPx: v === "link" ? null : parseFloat(code.get(normalizeName(tok(st.height) ?? "")) ?? "") || null };
        for (const [p, f] of props) { const t = f(st); b[p] = t ? figmaName(normalizeName(t)) ?? null : null; }
        snap.bindings[key] = b; created++;
        continue;
      }
      for (const [p, f] of props) {
        const t = f(st), cur = snap.bindings[key][p];
        if (!t || !cur) continue;
        const want = figmaName(normalizeName(t));
        if (want && normalizeName(cur) !== normalizeName(t) && figma.get(normalizeName(cur)) !== code.get(normalizeName(t))) {
          snap.bindings[key][p] = want; rebound++;
        }
      }
    }
    for (const s of sizes) if (!snap.options.size.includes(s)) snap.options.size.push(s);
  });
  if (rebound) actions.push({ who: "rule", side: "Figma", what: `${rebound} Button bindings pointed at a token with a different value than code's → re-bound to the token the code uses` });
  if (created) actions.push({ who: "rule", side: "Figma", what: `${created} missing Button variants generated from the code's CSS, bound to Figma variables` });

  // 4. Options with no story: add one (rule), so Storybook shows every option the docs promise
  const stories = input.stories.map((f) => readFileSync(f, "utf8")).join("\n");
  for (const s of sizes) if (!new RegExp(`size=["']${s}["']|'${s}'`).test(stories)) {
    w.story(`\nexport const Size${s[0].toUpperCase() + s.slice(1)} = () => <Button size="${s}">Button</Button>\n`);
    actions.push({ who: "rule", side: "Storybook", what: `added a story for size="${s}"` });
  }

  return { actions, pending, renames };
}

function readFileSyncJson(dir: string): Record<string, unknown>[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
}
const toCssName = (figmaPath: string) => figmaPath.replace(/\//g, "-");
