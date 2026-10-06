// Loads design tokens from the two sides of a design system into one flat shape:
//   name -> normalized value
// Supported inputs:
//   - Figma variables export / W3C DTCG JSON ({ "$value": ... } leaves, or plain values)
//   - CSS files with custom properties (--name: value;)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type TokenMap = Map<string, string>;

/** Normalize a token name so "color.primary.500", "color-primary-500" and "--color-primary-500" match. */
export function normalizeName(name: string): string {
  return name
    .replace(/^--/, "")
    .replace(/[./_\s\\]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** Normalize a value so "#FFF", "#ffffff" and "rgb(255, 255, 255)" compare equal; "16px" vs "1rem" too. */
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** Figma variables export colors as { r, g, b, a } in 0..1. */
function figmaColor(c: { r: number; g: number; b: number; a?: number }): string {
  const a = c.a ?? 1;
  return "#" + [c.r, c.g, c.b].map((x) => hex2(x * 255)).join("") + (a < 1 ? hex2(a * 255) : "");
}

export function normalizeValue(raw: unknown): string {
  if (raw && typeof raw === "object" && "r" in (raw as object)) return figmaColor(raw as any);
  let v = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  // #rgb -> #rrggbb
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) v = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  // #rrggbbff -> #rrggbb
  if (/^#[0-9a-f]{6}ff$/.test(v)) v = v.slice(0, 7);
  // rgb()/rgba() -> hex (alpha kept only when < 1)
  const rgb = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : parseFloat(rgb[4]);
    v = "#" + rgb.slice(1, 4).map((n) => hex2(Number(n))).join("") + (a < 1 ? hex2(a * 255) : "");
  }
  // rem -> px (16px base)
  const rem = v.match(/^(-?\d*\.?\d+)rem$/);
  if (rem) v = `${parseFloat(rem[1]) * 16}px`;
  // bare numbers from Figma (spacing, radius) -> px
  if (/^-?\d*\.?\d+$/.test(v)) v = `${parseFloat(v)}px`;
  return v;
}

/** Flatten nested token JSON. A leaf is either { $value } / { value } or a primitive. */
export function flattenJson(obj: unknown, prefix: string[] = [], out: TokenMap = new Map()): TokenMap {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    if ("$value" in o || "value" in o) {
      out.set(normalizeName(prefix.join("-")), normalizeValue(o.$value ?? o.value));
      return out;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === "$root") { flattenJson(v, prefix, out); continue; } // token that is also a group
      if (k.startsWith("$")) continue; // $type, $description...
      flattenJson(v, [...prefix, k], out);
    }
  } else if (prefix.length) {
    out.set(normalizeName(prefix.join("-")), normalizeValue(obj));
  }
  return out;
}

/** Parse CSS custom properties, resolving var(--x) references to their final values. */
export function parseCss(css: string): TokenMap {
  const raw = new Map<string, string>();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  // Keyed by the exact property name: aliases like `carriage-return` vs `carriageReturn`
  // must not overwrite each other before references are resolved.
  while ((m = re.exec(css))) raw.set(m[1], m[2].trim());

  const resolve = (value: string, depth = 0): string =>
    depth > 20
      ? value
      : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, ref, fallback) => {
          const target = raw.get(ref);
          return target !== undefined ? resolve(target, depth + 1) : (fallback ?? _);
        });

  const out: TokenMap = new Map();
  for (const [name, value] of raw) out.set(normalizeName(name), normalizeValue(resolve(value)));
  return out;
}

/** Figma variables export: [{ name: "fgColor/default", value: {r,g,b,a} | number, type }] */
export function parseFigmaVariables(list: Array<{ name: string; value: unknown }>): TokenMap {
  const out: TokenMap = new Map();
  for (const v of list) out.set(normalizeName(v.name), normalizeValue(v.value));
  return out;
}

function listFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { recursive: true, encoding: "utf8" })
    .map((f) => join(path, f))
    .filter((f) => /\.(css|json)$/.test(f) && statSync(f).isFile())
    .sort();
}

/**
 * Load tokens from one or more files or folders (comma-separated).
 * CSS files are concatenated first so var() references across files resolve.
 */
export function loadTokens(paths: string): TokenMap {
  const files = paths.split(",").flatMap(listFiles);
  const css = files.filter((f) => f.endsWith(".css"));
  const out: TokenMap = css.length ? parseCss(css.map((f) => readFileSync(f, "utf8")).join("\n")) : new Map();
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    const json = JSON.parse(readFileSync(f, "utf8"));
    const map = Array.isArray(json) ? parseFigmaVariables(json) : flattenJson(json);
    for (const [k, v] of map) out.set(k, v);
  }
  return out;
}
