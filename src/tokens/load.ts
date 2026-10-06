// Loads design tokens from the two sides of a design system into one flat shape:
//   name -> normalized value
// Supported inputs:
//   - Figma variables export / W3C DTCG JSON ({ "$value": ... } leaves, or plain values)
//   - CSS files with custom properties (--name: value;)

import { readFileSync } from "node:fs";

export type TokenMap = Map<string, string>;

/** Normalize a token name so "color.primary.500", "color-primary-500" and "--color-primary-500" match. */
export function normalizeName(name: string): string {
  return name
    .replace(/^--/, "")
    .replace(/[./_\s]+/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** Normalize a value so "#FFF", "#ffffff" and "rgb(255, 255, 255)" compare equal; "16px" vs "1rem" too. */
export function normalizeValue(raw: unknown): string {
  let v = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  // #rgb -> #rrggbb
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) v = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  // rgb()/rgba() with full alpha -> hex
  const rgb = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(1|1\.0+))?\)$/);
  if (rgb) v = "#" + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
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
      if (k.startsWith("$")) continue; // $type, $description...
      flattenJson(v, [...prefix, k], out);
    }
  } else if (prefix.length) {
    out.set(normalizeName(prefix.join("-")), normalizeValue(obj));
  }
  return out;
}

export function parseCss(css: string): TokenMap {
  const out: TokenMap = new Map();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.set(normalizeName(m[1]), normalizeValue(m[2]));
  return out;
}

export function loadTokens(path: string): TokenMap {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".css") ? parseCss(text) : flattenJson(JSON.parse(text));
}
