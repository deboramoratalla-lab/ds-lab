// Mutation test for the screen rules. Takes the real inventory of the GitHub test screens, applies ONE random break
// at a time to a fresh copy (hundreds of times, seeded so it's repeatable) and checks two things:
//   caught: a new finding of the expected kind appears on the mutated node
//   noise:  any new finding on a node we didn't touch (a false alarm caused by the rules, not by the break)
// Meaning (labels/icons) is model-based and tested separately, so it's off here.
import { readFileSync, writeFileSync } from "node:fs";
import { certifyScreens, contrast } from "./certify-screens.js";

const catalog = JSON.parse(readFileSync("console/catalog.json", "utf8"));
const base = JSON.parse(readFileSync("fixtures/primer-web-notes/screens-inventory.json", "utf8"));
const N = Number(process.env.N ?? 40);
let seed = Number(process.env.SEED ?? 7); const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const clone = () => JSON.parse(JSON.stringify(base));
const key = (f: any) => `${f.kind}|${f.node}|${f.msg}`;
const baseline = new Set(certifyScreens(catalog, clone(), { meaning: false }).findings.map(key));
const flagged = new Set(certifyScreens(catalog, clone(), { meaning: false }).findings.flatMap((f: any) => [f.node, ...(f.parents ?? [])]));
const clean = (xs: any[], id = (x: any) => x.id) => xs.filter((x) => !x.inDetached && !flagged.has(id(x)) && ![...flagged].some((n) => String(id(x)).startsWith(`I${n};`)));
const OFF = [3, 5, 7, 9, 10, 11, 13, 14, 15, 18, 22, 26, 30];
const FIGMA_ONLY = ["diffBlob/addition/bgColor/word", "button/outline/borderColor/selected", "avatar/shadow/color", "diffBlob/deletion/fgColor/num"];

type M = { kind: string; apply: (inv: any) => { screen: string; node: string } | null };
const M: M[] = [
  { kind: "hardcoded", apply: (inv) => { const s = pick(inv.screens) as any; const t = pick(clean(s.texts.filter((t: any) => t.fgVar && !t.id.startsWith("I")))); if (!t) return null; t.fgVar = null; t.fails = []; return { screen: s.name, node: t.id }; } },
  { kind: "contrast", apply: (inv) => { const s = pick(inv.screens) as any; const t = pick(clean(s.texts.filter((t: any) => !t.id.startsWith("I")))); if (!t) return null; const fg = pick(["#b8bec6", "#c9d1d9", "#a0a8b0", "#d0d7de"]); t.fg = fg; t.fgVar = null; const r = contrast(fg, t.bg); t.fails = r < 4.5 ? [["light", +r.toFixed(2), fg, t.bg]] : []; return t.fails.length ? { screen: s.name, node: t.id } : null; } },
  { kind: "spacing", apply: (inv) => { const s = pick(inv.screens) as any; const f = pick(clean(s.frames.filter((f: any) => f.gap != null))); if (!f) return null; f.gap = pick(OFF); return { screen: s.name, node: f.id }; } },
  { kind: "resized", apply: (inv) => { const s = pick(inv.screens) as any; const i = pick(clean(s.instances.filter((i: any) => i.page && i.mh && i.hug !== "FILL"))); if (!i) return null; i.h = i.mh + pick([-8, -4, 4, 6, 10]); return { screen: s.name, node: i.id }; } },
  { kind: "detached", apply: (inv) => { const s = pick(inv.screens) as any; const i = pick(clean(s.instances.filter((i: any) => ["Button", "Label", "StateLabel", "Avatar"].includes(i.set)))); if (!i) return null; s.instances = s.instances.filter((x: any) => x !== i); s.frames.push({ id: i.id, name: i.set, children: 2, pad: [4, 8, 4, 8], gap: 4, fill: null }); return { screen: s.name, node: i.id }; } },
  { kind: "hardcoded", apply: (inv) => { const s = pick(inv.screens) as any; const i = pick(clean(s.instances.filter((i: any) => i.page && !/^[a-z_]/.test(i.set)))); if (!i) return null; s.overrides.push({ instance: i.id, set: i.set, node: i.id, was: "bgColor/default", now: pick(["#fafbfc", "#f6f8fa", "#eaeef2"]) }); return { screen: s.name, node: i.id }; } },
  { kind: "token", apply: (inv) => { const s = pick(inv.screens) as any; const f = pick(clean(s.frames.filter((f: any) => !f.id.startsWith("I")))); if (!f) return null; s.bound.push({ node: f.id, var: pick(FIGMA_ONLY) }); return { screen: s.name, node: f.id }; } },
  { kind: "deprecated", apply: (inv) => { const s = pick(inv.screens) as any; const i = pick(clean(s.instances.filter((i: any) => i.page && !/^[a-z_]/.test(i.set)))); if (!i) return null; i.set = pick(["🛑 Pagehead [DEPRECATED]", "TabNav"]); i.props = {}; return { screen: s.name, node: i.id }; } },
  { kind: "missing", apply: (inv) => { const s = pick(inv.screens) as any; const i = pick(clean(s.instances.filter((i: any) => i.page && !/^[a-z_]/.test(i.set)))); if (!i) return null; i.set = pick(["OldBanner", "Card (v1)", "LegacyHeader"]); i.page = null; i.props = {}; return { screen: s.name, node: i.id }; } },
];

const kinds: Record<string, { tried: number; caught: number; misses: any[] }> = {}; let noise = 0; const noisy: any[] = [];
for (const m of M) for (let k = 0; k < N; k++) {
  const inv = clone(); const at = m.apply(inv); if (!at) continue;
  const R = certifyScreens(catalog, inv, { meaning: false }).findings;
  const fresh = R.filter((f: any) => !baseline.has(key(f)));
  const hit = fresh.some((f: any) => f.kind === m.kind && (f.node === at.node || f.node.startsWith(`I${at.node};`) || (f.parents ?? []).includes(at.node)));
  const other = fresh.filter((f: any) => !(f.node === at.node || f.node.startsWith(`I${at.node};`) || (f.parents ?? []).includes(at.node)));
  const K = (kinds[m.kind] ??= { tried: 0, caught: 0, misses: [] }); K.tried++; if (hit) K.caught++; else K.misses.push(at);
  if (other.length) { noise++; noisy.push({ mutation: m.kind, at, other: other.map((f: any) => `${f.kind}: ${f.msg}`) }); }
}
const tried = Object.values(kinds).reduce((a, k) => a + k.tried, 0), caught = Object.values(kinds).reduce((a, k) => a + k.caught, 0);
writeFileSync("console/mutation.json", JSON.stringify({ at: new Date().toISOString(), seed: Number(process.env.SEED ?? 7), tried, caught, noise, kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { tried: v.tried, caught: v.caught }])), misses: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.misses.slice(0, 5)])), noisy: noisy.slice(0, 10) }, null, 1));
console.log(`${caught}/${tried} mutations caught · ${noise} caused a finding somewhere else`);
for (const [k, v] of Object.entries(kinds)) console.log(`  ${k.padEnd(11)} ${v.caught}/${v.tried}`);
for (const n of noisy.slice(0, 5)) console.log("  noise:", n.mutation, n.at.node, "→", n.other.join("; "));
