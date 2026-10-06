// Extracts a component spec from its compiled CSS: base styles plus one set of overrides per
// value of each variant attribute (e.g. data-variant, data-size). Each style keeps the token it
// is bound to, so the spec can be rebuilt elsewhere (Figma, another framework) with the SAME
// tokens instead of copied numbers.

import { readFileSync } from "node:fs";
import { normalizeName } from "../tokens/load.js";

export interface StyleValue {
  /** token the value comes from, normalized, when written as var(--token, fallback) */
  token?: string;
  /** literal value, or the fallback after the token */
  value: string;
}
export type StyleBlock = Record<string, StyleValue>;

export interface ComponentSpec {
  name: string;
  source: string;
  base: StyleBlock;
  /** attribute → value → overrides, e.g. variant → primary → {background-color: ...} */
  axes: Record<string, Record<string, StyleBlock>>;
}

function parseDeclarations(body: string): StyleBlock {
  const out: StyleBlock = {};
  let depth = 0, cur = "";
  const decls: string[] = [];
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) { decls.push(cur); cur = ""; } else cur += ch;
  }
  decls.push(cur);
  for (const d of decls) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const prop = d.slice(0, i).trim();
    const raw = d.slice(i + 1).replace(/!important/, "").trim();
    const m = raw.match(/^var\(\s*--([\w-]+)\s*(?:,\s*(.+))?\)$/);
    out[prop] = m ? { token: normalizeName(m[1]), value: (m[2] ?? "").trim() } : { value: raw };
  }
  return out;
}

/**
 * @param baseClass  the component's root class prefix, e.g. "prc-Button-ButtonBase"
 * @param attributes data attributes that define variant axes, e.g. ["data-variant", "data-size"]
 */
export function extractComponent(name: string, cssPath: string, baseClass: string, attributes: string[]): ComponentSpec {
  const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const spec: ComponentSpec = { name, source: cssPath, base: {}, axes: {} };
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css))) {
    const selector = m[1].trim();
    if (!selector.startsWith("." + baseClass)) continue;
    const rest = selector.replace(/^\.[\w-]+/, "");
    if (rest === "") { Object.assign(spec.base, parseDeclarations(m[2])); continue; }
    // only the plain state of one axis: ":where([data-variant=primary])" and nothing else
    const axis = rest.match(/^:where\(\[([\w-]+)=["']?([\w-]+)["']?\]\)$/);
    if (axis && attributes.includes(axis[1])) {
      const key = axis[1].replace(/^data-/, "");
      ((spec.axes[key] ??= {})[axis[2]] ??= {});
      Object.assign(spec.axes[key][axis[2]], parseDeclarations(m[2]));
    }
  }
  return spec;
}

// ---------- verification ----------

/** The token each design property should be bound to, per variant/size, resolved from the code spec. */
export type Bindings = Record<string, Record<string, string | null>>;

const tokenIn = (sv?: StyleValue): string | null => {
  if (!sv) return null;
  if (sv.token) return sv.token;
  const m = sv.value.match(/var\(--([\w-]+)/); // shorthand like "0 var(--x)"
  return m ? normalizeName(m[1]) : null;
};

export function expectedBindings(spec: ComponentSpec, variants: string[], sizes: string[]): Bindings {
  const out: Bindings = {};
  for (const variant of variants)
    for (const size of sizes) {
      const s = { ...spec.base, ...(spec.axes.size?.[size] ?? {}), ...(spec.axes.variant?.[variant] ?? {}) };
      const bg = s["background-color"];
      out[`variant=${variant}, size=${size}`] = {
        height: tokenIn(s.height), padX: tokenIn(s.padding), gap: tokenIn(s.gap), radius: tokenIn(s["border-radius"]),
        bg: bg && bg.value !== "transparent" ? tokenIn(bg) : null,
        border: tokenIn(s["border-color"]), fg: tokenIn(s.color), font: tokenIn(s["font-size"]),
      };
    }
  return out;
}

export function verifyBindings(expected: Bindings, actual: Bindings) {
  const diffs: { variant: string; property: string; expected: string | null; actual: string | null }[] = [];
  let checked = 0;
  for (const [variant, props] of Object.entries(expected))
    for (const [property, exp] of Object.entries(props)) {
      checked++;
      const act = actual[variant]?.[property] ?? null;
      if (act !== exp) diffs.push({ variant, property, expected: exp, actual: act });
    }
  return { checked, diffs, ok: diffs.length === 0 };
}
