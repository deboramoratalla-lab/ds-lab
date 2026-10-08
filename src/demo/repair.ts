// The agent repairs a broken system back to certified.
// Nano pairs renames, Ultra judges one-sided value changes using what people wrote (commits,
// Figma notes), rules do the mechanical fixes. Three gates keep people in charge:
//   1. Confidence: model calls below AUTO_APPLY go to a review queue instead of being applied.
//   2. Both sides changed: a person decides, whatever the model thinks.
//   3. New options (a size, a variant): researched and proposed, created only after approval.
// Every applied change is journaled with the files' previous content, so it can be reverted.
// If a model call fails, the item goes to a person; the rest of the run continues.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { loadTokens, normalizeName } from "../tokens/load.js";
import { compareTokens } from "../tokens/drift.js";
import { extractComponent } from "../migrate/component.js";
import { loadPrimerDoc, propOptions } from "../docs/primer.js";
import { matchRenamed } from "../agents/matcher.js";
import { resolveConflicts } from "../agents/resolver.js";
import type { PrimerCertifyInput } from "../certify-primer.js";
import type { Workspace } from "./breaks.js";

export const AUTO_APPLY = 0.85;

export interface Action { id: string; who: "nano" | "ultra" | "rule"; what: string; side: "Figma" | "code" | "Storybook" | "person"; notify?: string; confidence?: number }

export type ItemKind = "review" | "decide" | "proposal";
export interface Item {
  id: string; kind: ItemKind; who: "nano" | "ultra" | "rule"; title: string; why: string;
  confidence?: number; token?: string; figma?: string; code?: string; lean?: string;
  impact?: string[]; people?: { figma?: string; code?: string };
  /** what approving does (review / proposal) */
  change?: { type: "set-figma" | "set-code" | "rename" | "create-option"; token?: string; value?: string; from?: string; to?: string; axis?: string; option?: string };
  research?: unknown; failed?: boolean;
}

export interface JournalEntry { id: string; at: string; what: string; files: Record<string, string>; inverse?: Item["change"] }

// ---------- journal (undo) ----------
const tracked = (input: PrimerCertifyInput) => [
  ...readdirSync(input.figmaTokens).filter((f) => f.endsWith(".json")).map((f) => `${input.figmaTokens}/${f}`),
  ...input.codeTokens.split(",").filter((p) => p.endsWith("commits.css")), input.buttonSnapshot, input.buttonCss, ...input.stories,
];
function journalPath(input: PrimerCertifyInput) { return `${input.figmaTokens.replace(/\/figma$/, "")}/journal.json`; }
export function readJournal(input: PrimerCertifyInput): JournalEntry[] {
  const p = journalPath(input); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
}
function track(input: PrimerCertifyInput, id: string, what: string, fn: () => void, inverse?: Item["change"]) {
  const files = tracked(input), before = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));
  fn();
  const changed = Object.fromEntries(files.filter((f) => readFileSync(f, "utf8") !== before[f]).map((f) => [f, before[f]]));
  const j = readJournal(input); j.push({ id, at: new Date().toISOString(), what, files: changed, inverse });
  writeFileSync(journalPath(input), JSON.stringify(j, null, 1));
}
/** Undo one applied change: restores the files it touched to their previous content. */
export function revert(w: Workspace, input: PrimerCertifyInput, id: string) {
  const j = readJournal(input), i = j.findIndex((x) => x.id === id), e = j[i];
  if (!e) throw new Error(`nothing to revert for ${id}`);
  if (e.inverse) {
    // token-level undo: put the previous value back, leave every later change alone
    applyToken(w, input, e.inverse);
  } else {
    const later = j.slice(i + 1).filter((x) => Object.keys(x.files).some((f) => f in e.files));
    if (later.length) throw new Error(`can't revert ${id}: ${later.map((x) => x.id).join(", ")} changed the same files after it. Revert those first.`);
    for (const [f, content] of Object.entries(e.files)) writeFileSync(f, content);
  }
  writeFileSync(journalPath(input), JSON.stringify(j.filter((x) => x.id !== id), null, 1));
  return e;
}

// ---------- helpers ----------
function figmaKeys(input: PrimerCertifyInput) {
  return Object.keys(Object.assign({}, ...readdirSync(input.figmaTokens).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${input.figmaTokens}/${f}`, "utf8")))));
}
const toCssName = (figmaPath: string) => figmaPath.replace(/\//g, "-");
const tok = (sv?: { token?: string; value: string }) => sv?.token ?? sv?.value.match(/var\(--([\w-]+)/)?.[1];

/** Where a token is used: Figma Button bindings and the Button CSS. Shown on decisions. */
function impactOf(input: PrimerCertifyInput, token: string): string[] {
  const snap = JSON.parse(readFileSync(input.buttonSnapshot, "utf8"));
  const inFigma = Object.entries<any>(snap.bindings).filter(([, b]) => Object.values(b).some((v) => typeof v === "string" && normalizeName(v) === token)).map(([k]) => k);
  const variants = [...new Set(inFigma.map((k) => k.match(/variant=(\w+)/)?.[1]))];
  const css = readFileSync(input.buttonCss, "utf8");
  const inCode = [...css.matchAll(/where\(\[data-variant=(\w+)\]\)[^{]*\{[^}]*/g)].filter((m) => normalizeName(m[0]).includes(token)).map((m) => m[1]);
  return [
    inFigma.length ? `Figma: Button ${variants.join(", ")} (${inFigma.length} variants)` : "Figma: not used by Button",
    inCode.length ? `Code: Button ${[...new Set(inCode)].join(", ")}` : "Code: not used by Button. Changing it here won't show on screen",
  ];
}

function bindingProps(): [string, (st: any) => string | undefined][] {
  return [
    ["padX", (st) => tok(st.padding)], ["gap", (st) => tok(st.gap)], ["radius", (st) => tok(st["border-radius"])],
    ["bg", (st) => tok(st["background-color"])], ["border", (st) => (st.border?.value === "unset" ? undefined : tok(st["border-color"]))],
    ["fg", (st) => tok(st.color)], ["font", (st) => (st["font-size"]?.value === "inherit" ? undefined : tok(st["font-size"]))],
  ];
}

// ---------- applying a change (used by the agent, and when a person approves) ----------
function applyToken(w: Workspace, input: PrimerCertifyInput, change: NonNullable<Item["change"]>) {
  const fk = (t: string) => figmaKeys(input).find((k) => normalizeName(k) === t);
  if (change.type === "set-figma") { const k = fk(change.token!)!; w.figma((v) => { v[k] = change.value; }); }
  if (change.type === "set-code") w.codeOverride(`  --${toCssName(fk(change.token!) ?? change.token!)}: ${change.value};`);
}

export function applyChange(w: Workspace, input: PrimerCertifyInput, id: string, change: NonNullable<Item["change"]>, what: string) {
  const fk = (t: string) => figmaKeys(input).find((k) => normalizeName(k) === t);
  const prev = change.type === "set-figma" ? loadTokens(input.figmaTokens).get(change.token!) : change.type === "set-code" ? loadTokens(input.codeTokens).get(change.token!) : undefined;
  const inverse = prev !== undefined ? { type: change.type, token: change.token, value: prev } as Item["change"] : undefined;
  track(input, id, what, () => {
    if (change.type === "set-figma" || change.type === "set-code") applyToken(w, input, change);
    if (change.type === "rename") { const code = loadTokens(input.codeTokens); w.codeOverride(`  --${toCssName(fk(change.to!) ?? change.to!)}: ${code.get(change.from!)};`); }
    if (change.type === "create-option") createOption(w, input, change.axis!, change.option!);
  }, inverse);
}

function createOption(w: Workspace, input: PrimerCertifyInput, axis: string, option: string) {
  const code = loadTokens(input.codeTokens);
  const fk = (t: string) => figmaKeys(input).find((k) => normalizeName(k) === t);
  const doc = loadPrimerDoc(input.docs, "Button");
  const spec = extractComponent("Button", input.buttonCss, "prc-Button-ButtonBase", ["data-variant", "data-size"]);
  w.snapshot((snap) => {
    for (const v of propOptions(doc, "variant")) {
      const key = `variant=${v}, ${axis}=${option}`;
      if (snap.bindings[key]) continue;
      const st = { ...spec.base, ...(spec.axes[axis]?.[option] ?? {}), ...(spec.axes.variant?.[v] ?? {}) };
      const b: any = { height: null, heightPx: v === "link" ? null : parseFloat(code.get(normalizeName(tok(st.height) ?? "")) ?? "") || null };
      for (const [p, f] of bindingProps()) { const t = f(st); b[p] = t ? fk(normalizeName(t)) ?? null : null; }
      snap.bindings[key] = b;
    }
    if (!snap.options[axis].includes(option)) snap.options[axis].push(option);
  });
  w.story(`\nexport const ${axis[0].toUpperCase() + axis.slice(1)}${option[0].toUpperCase() + option.slice(1)} = () => <Button ${axis}="${option}">Button</Button>\n`);
}

// ---------- the agent ----------
export interface RepairOptions {
  /** research a new option before proposing it (Tavily + Super). Optional: proposals still go out without it. */
  research?: (axis: string, option: string) => Promise<unknown>;
}

export async function repair(w: Workspace, input: PrimerCertifyInput, baseline: PrimerCertifyInput, baselineShared: string[], notes: Record<string, string>, opts: RepairOptions = {}) {
  const baseFigma = loadTokens(baseline.figmaTokens), baseCode = loadTokens(baseline.codeTokens);
  const actions: Action[] = [];
  const items: Item[] = [];
  const renames: Record<string, string> = {};
  let n = 0;
  const nextId = (p: string) => `${p}-${++n}`;

  // 1. Renames (Nano)
  let figma = loadTokens(input.figmaTokens), code = loadTokens(input.codeTokens);
  const lost = baselineShared.filter((k) => !figma.has(k) || !code.has(k));
  if (lost.length) {
    const lostSet = new Set(lost);
    const candidates = compareTokens(figma, code).items.filter((x) =>
      lostSet.has(x.name) || (x.kind === "missing-in-code" && !baseFigma.has(x.name)) || (x.kind === "missing-in-design" && !baseCode.has(x.name)));
    let matches: Awaited<ReturnType<typeof matchRenamed>> = [];
    try { matches = await matchRenamed(candidates); }
    catch (e) {
      for (const k of lost) items.push({ id: nextId("review"), kind: "review", who: "nano", failed: true, token: k,
        title: `${k} disappeared from ${figma.has(k) ? "code" : "Figma"}`, why: `Nemotron Nano didn't answer (${String(e).slice(0, 80)}). Check whether it was renamed or deleted.` });
    }
    for (const m of matches) {
      const [from, to] = lostSet.has(m.code) ? [m.code, m.design] : [m.design, m.code];
      const change = { type: "rename" as const, from, to };
      if (m.confidence >= AUTO_APPLY) {
        renames[from] = to;
        const id = nextId("rename");
        applyChange(w, input, id, change, `rename ${from} → ${to}`);
        actions.push({ id, who: "nano", side: "code", confidence: m.confidence, notify: "engineers",
          what: `rename ${from} → ${to} adopted in code, old name kept as deprecated alias (confidence ${m.confidence})` });
      } else {
        items.push({ id: nextId("review"), kind: "review", who: "nano", confidence: m.confidence, token: from, change,
          title: `Was ${from} renamed to ${to}?`, why: `Nemotron Nano paired them with confidence ${m.confidence}, below ${AUTO_APPLY}.` });
      }
    }
  }

  // 2. Value conflicts (Ultra)
  figma = loadTokens(input.figmaTokens); code = loadTokens(input.codeTokens);
  const conflicts = compareTokens(figma, code).items.filter((x) => x.kind === "value-mismatch" && !input.exceptions[x.name]);
  for (const r of await resolveConflicts(conflicts, { notes })) {
    const bothChanged = baseFigma.get(r.name) !== r.design && baseCode.get(r.name) !== r.code;
    const [figmaNote, codeNote] = (notes[r.name] ?? "").split(/ Code change by an engineer, /);
    if (bothChanged) {
      const lean = r.verdict === "ask-a-human" ? "" : r.verdict === "design-is-right" ? "Figma" : "code";
      items.push({ id: nextId("decide"), kind: "decide", who: "ultra", token: r.name, figma: r.design, code: r.code, lean,
        title: `${r.name}: both sides changed it`, why: r.why, confidence: r.confidence, impact: impactOf(input, r.name),
        people: { figma: figmaNote?.replace(/^Figma change by a designer, version note: /, ""), code: codeNote?.replace(/^commit message: /, "") } });
      actions.push({ id: items[items.length - 1].id, who: "ultra", side: "person", what: `${r.name}: both sides changed it → a person decides${lean ? ` (Ultra leans ${lean})` : ""}` });
      continue;
    }
    const failed = /model unavailable/i.test(r.why);
    const change = r.verdict === "code-is-right" ? { type: "set-figma" as const, token: r.name, value: r.code }
      : r.verdict === "design-is-right" ? { type: "set-code" as const, token: r.name, value: r.design } : undefined;
    const label = r.verdict === "code-is-right" ? `code is right → Figma ${r.design} → ${r.code}` : `design is right → code ${r.code} → ${r.design}`;
    if (change && !failed && r.confidence >= AUTO_APPLY) {
      const id = nextId("value");
      applyChange(w, input, id, change, `${r.name}: ${label}`);
      actions.push({ id, who: "ultra", side: change.type === "set-figma" ? "Figma" : "code", confidence: r.confidence,
        notify: change.type === "set-figma" ? "designers" : "engineers", what: `${r.name}: ${label}. ${r.why}` });
    } else {
      items.push({ id: nextId("review"), kind: "review", who: "ultra", token: r.name, figma: r.design, code: r.code, change, failed,
        confidence: r.confidence, impact: impactOf(input, r.name),
        title: change ? `${r.name}: ${label}?` : `${r.name}: Figma ${r.design} vs code ${r.code}`,
        why: failed ? r.why : `${r.why} (confidence ${r.confidence}, below ${AUTO_APPLY})` });
    }
  }

  // 3. Bindings that point at a token with a different value than the one code uses (rule)
  figma = loadTokens(input.figmaTokens); code = loadTokens(input.codeTokens);
  const doc = loadPrimerDoc(input.docs, "Button");
  const spec = extractComponent("Button", input.buttonCss, "prc-Button-ButtonBase", ["data-variant", "data-size"]);
  const fk = (t: string) => figmaKeys(input).find((k) => normalizeName(k) === t);
  let rebound = 0;
  const bindId = nextId("bind");
  track(input, bindId, "re-bind Button variants to code's tokens", () => w.snapshot((snap) => {
    for (const v of propOptions(doc, "variant")) for (const s of propOptions(doc, "size")) {
      const key = `variant=${v}, size=${s}`, b = snap.bindings[key];
      if (!b) continue;
      const st = { ...spec.base, ...(spec.axes.size?.[s] ?? {}), ...(spec.axes.variant?.[v] ?? {}) };
      for (const [p, f] of bindingProps()) {
        const t = f(st), cur = b[p];
        if (!t || !cur) continue;
        const want = fk(normalizeName(t));
        if (want && normalizeName(cur) !== normalizeName(t) && figma.get(normalizeName(cur)) !== code.get(normalizeName(t))) { b[p] = want; rebound++; }
      }
    }
  }));
  if (rebound) actions.push({ id: bindId, who: "rule", side: "Figma", notify: "designers", what: `${rebound} Button bindings pointed at a token with a different value than code's → re-bound to the token the code uses` });

  // 4. New options in code/docs that Figma or Storybook don't have: research, then propose (never auto-create)
  const snap = JSON.parse(readFileSync(input.buttonSnapshot, "utf8"));
  for (const opt of propOptions(doc, "size").filter((s) => !snap.options.size.includes(s))) {
    let research: unknown = null;
    if (opts.research) { try { research = await opts.research("size", opt); } catch (e) { research = { error: String(e).slice(0, 120) }; } }
    items.push({ id: nextId("proposal"), kind: "proposal", who: "rule", change: { type: "create-option", axis: "size", option: opt },
      title: `New size="${opt}" in code and docs`, research,
      why: `It's missing in Figma and Storybook. Approving creates ${propOptions(doc, "variant").length} Figma variants bound to the code's tokens and a story.` });
  }

  const pending = items.filter((i) => i.kind === "decide").map((i) => `${i.token}: Figma ${i.figma} vs code ${i.code}, both changed since last certification. ${i.lean ? `Ultra leans ${i.lean}` : "no recommendation"}: ${i.why}`);
  return { actions, items, pending, renames, journal: readJournal(input) };
}

/** A person's answer to a queued item. */
export function resolveItem(w: Workspace, input: PrimerCertifyInput, item: Item, answer: "approve" | "reject" | "figma" | "code") {
  if (item.kind === "decide") {
    const value = answer === "figma" ? item.figma! : item.code!;
    applyChange(w, input, item.id, { type: answer === "figma" ? "set-code" : "set-figma", token: item.token, value }, `person kept ${answer} for ${item.token}`);
    return;
  }
  if (answer === "approve" && item.change) applyChange(w, input, item.id, item.change, item.title);
}
