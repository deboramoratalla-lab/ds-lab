// Screen checks: where library components are used in real flows, and what breaks there.
// Reads an inventory of the "Seamline · Test flows" page in the Primer Web Figma file (instances, overrides,
// bound variables, text colours), exported with the Figma plugin API, and checks it against code and the catalog.
import { readFileSync, writeFileSync } from "node:fs";
import { loadTokens, normalizeName } from "./tokens/load.js";
import { primerInput } from "./demo/breaks.js";
import type { CatalogEntry } from "./certify-catalog.js";

type Kind = "detached" | "hardcoded" | "variant" | "contrast" | "token" | "resized";
export interface ScreenFinding { kind: Kind; screen: string; node: string; component?: string; msg: string; fix: string; count?: number; screens?: string[]; inherited?: boolean }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export function certifyScreens(catalog: CatalogEntry[]) {
  const inv = JSON.parse(readFileSync("fixtures/primer-web-notes/screens-inventory.json", "utf8"));
  const sets = (JSON.parse(readFileSync("fixtures/primer-web-notes/figma-catalog.json", "utf8")).sets as [string, string][]).map((s) => s[1]);
  const code = loadTokens(primerInput().codeTokens);
  const findings: ScreenFinding[] = [];
  const usage: Record<string, { count: number; screens: string[] }> = {};
  const byName = (n: string) => catalog.find((c) => norm(c.name) === norm(n));
  for (const s of inv.screens) {
    const detachedIds = new Set<string>();
    // 1. detached: a plain frame carrying a library component's name
    for (const f of s.frames) if (!f.id.startsWith("I") && sets.some((n) => n === f.name) && f.children > 0) {
      detachedIds.add(f.id);
      findings.push({ kind: "detached", screen: s.name, node: f.id, component: f.name, msg: `${f.name} is detached from the library`, fix: `Swap it back to a ${f.name} instance so library updates reach it` });
    }
    const insideDetached = (id: string) => s.frames.some((f: any) => detachedIds.has(f.id)) && s.instances.find((i: any) => i.id === id) && Number(id.split(":")[1]) > Math.min(...[...detachedIds].map((d) => Number(d.split(":")[1]))) && Number(id.split(":")[1]) < Math.min(...[...detachedIds].map((d) => Number(d.split(":")[1]))) + 10;
    for (const i of s.instances) {
      if (insideDetached(i.id)) continue; // icons and counters left over inside a detached frame
      const name = byName(i.set)?.name ?? i.set;
      (usage[name] ??= { count: 0, screens: [] }).count++;
      if (!usage[name].screens.includes(s.name)) usage[name].screens.push(s.name);
      // 3. variant that docs or code don't have
      const entry = byName(i.set);
      for (const [axis, val] of Object.entries(i.props as Record<string, string>)) {
        const issue = entry?.checks.flatMap((c) => c.issues).find((x) => x.startsWith(`${axis}=${val}:`) && /not in docs|missing in code/.test(x));
        if (!issue) continue;
        const prev = findings.find((f) => f.kind === "variant" && f.component === name && f.msg.includes(`${axis}=${val},`));
        if (prev) { prev.count = (prev.count ?? 1) + 1; if (!prev.screens!.includes(s.name)) prev.screens!.push(s.name); continue; }
        findings.push({ kind: "variant", screen: s.name, screens: [s.name], count: 1, node: i.id, component: name, msg: `${name} uses ${axis}=${val}, ${issue.split(": ")[1]}`, fix: `Use a ${axis} that ships in code, or add ${val} to code and docs first`, inherited: true });
      }
    }
    // 2. hand-set colour where the component binds a token
    for (const o of s.overrides) findings.push({ kind: "hardcoded", screen: s.name, node: o.node, component: byName(o.set)?.name ?? o.set, msg: `${o.set} colour set to ${o.now} by hand instead of ${o.was}`, fix: `Reset the override so it uses ${o.was} again` });
    // 4. text contrast (WCAG AA). Disabled controls are exempt.
    for (const t of s.texts) {
      const inst = s.instances.find((i: any) => t.id.startsWith(`I${i.id};`));
      if (inst?.props?.state === "disabled") continue;
      const r = contrast(t.fg, t.bg), large = t.size >= 18 || (t.bold && t.size >= 14), need = large ? 3 : 4.5;
      if (r < need) findings.push({ kind: "contrast", screen: s.name, node: t.id, msg: `“${t.text}” is ${r.toFixed(2)}:1 on ${t.bg}, needs ${need}:1`, fix: t.fgVar ? `Pick a text token with more contrast than ${t.fgVar}` : `Use fgColor/muted (or darker) instead of ${t.fg}` });
    }
    // 2b. text coloured by hand outside components (even when it looks right)
    const tokenFor: Record<string, string> = {}; for (const t of s.texts) if (t.fgVar && !t.fgVar.includes("/fgColor/") ) tokenFor[t.fg] ??= t.fgVar;
    for (const t of s.texts) if (!t.fgVar && !t.id.startsWith("I") && !findings.some((f) => f.node === t.id)) {
      const tok = tokenFor[t.fg];
      findings.push({ kind: "hardcoded", screen: s.name, node: t.id, msg: `“${t.text}” uses ${t.fg} by hand${tok ? `, the same value as ${tok}` : ""}`, fix: tok ? `Bind it to ${tok} so theme and dark mode reach it` : "Bind it to a text token" });
    }
    // 6. a component stretched or squeezed by hand instead of using a size option
    for (const i of s.instances) if (i.h && i.mh && Math.abs(i.h - i.mh) > 1 && i.hug !== "FILL" && !insideDetached(i.id)) {
      const name = byName(i.set)?.name ?? i.set;
      findings.push({ kind: "resized", screen: s.name, node: i.id, component: name, msg: `${name} is ${i.h}px tall; its ${i.props.size ?? "default"} size is ${i.mh}px`, fix: `Use a size option${i.props.size ? ` (e.g. size=small)` : ""} instead of resizing it` });
    }
    // 5. a Figma variable that code doesn't ship
    const seen = new Set<string>();
    for (const b of s.bound) {
      if (seen.has(b.var)) continue; seen.add(b.var);
      if (!code.has(normalizeName(b.var.replace(/\//g, "-")))) findings.push({ kind: "token", screen: s.name, node: b.node, msg: `${b.var} isn't in @primer/primitives`, fix: `Use a token code ships, or add ${b.var} to primitives` });
    }
  }
  return { screens: inv.screens.map((s: any) => ({ id: s.id, name: s.name, instances: s.instances.length })), usage, findings, source: inv.source, pageId: inv.pageId };
}

if (process.argv[1]?.endsWith("certify-screens.ts")) {
  const catalog = JSON.parse(readFileSync("console/catalog.json", "utf8"));
  const r = certifyScreens(catalog.components ?? catalog);
  const planted = JSON.parse(readFileSync("fixtures/primer-web-notes/screens-planted.json", "utf8")).breaks as any[];
  const hit = planted.map((p) => ({ ...p, found: r.findings.some((f) => f.kind === p.kind && (f.node === p.node || f.node.startsWith(`I${p.node};`))) }));
  const extra = r.findings.filter((f) => !planted.some((p) => p.kind === f.kind && (f.node === p.node || f.node.startsWith(`I${p.node};`))));
  writeFileSync("console/screens.json", JSON.stringify({ ...r, test: { planted: hit, extra } }, null, 1));
  console.log(`found ${hit.filter((h) => h.found).length}/${planted.length} planted · ${extra.length} other findings`);
  for (const h of hit) console.log(h.found ? "✓" : "✗", h.id, h.what);
  for (const e of extra) console.log("+", e.kind, e.screen, "·", e.msg, e.count ? `(${e.count} instances)` : "");
}
