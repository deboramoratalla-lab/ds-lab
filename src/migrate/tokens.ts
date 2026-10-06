// Migrates tokens between formats. Every migration is verified by reading the
// output back with the same loader and running the drift engine against the source:
// a migration only counts as done at 100% real sync.
//
// Formats: W3C DTCG JSON, Figma variables JSON, CSS custom properties, Tailwind v4 (@theme CSS).

import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTokens, type TokenMap } from "../tokens/load.js";
import { compareTokens, type DriftReport } from "../tokens/drift.js";

export type Format = "dtcg" | "figma" | "css" | "tailwind";

type TokenType = "color" | "dimension" | "string";
const typeOf = (v: string): TokenType =>
  /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v) ? "color" : /^-?\d*\.?\d+px$/.test(v) ? "dimension" : "string";

// ---------- writers ----------

function toDtcg(tokens: TokenMap): string {
  const root: Record<string, any> = {};
  for (const [name, value] of tokens) {
    const path = name.split("-");
    let node = root;
    for (const seg of path.slice(0, -1)) {
      // a segment can be both a leaf and a group ("radius" and "radius-md"): keep the leaf under "$root"
      if (node[seg]?.$value !== undefined) node[seg] = { $root: node[seg] };
      node = node[seg] ??= {};
    }
    const leaf = { $type: typeOf(value), $value: value };
    const last = path.at(-1)!;
    if (node[last] && node[last].$value === undefined) node[last].$root = leaf;
    else node[last] = leaf;
  }
  return JSON.stringify(root, null, 2);
}

function toFigma(tokens: TokenMap): string {
  const vars = [...tokens].map(([name, value]) => {
    const type = typeOf(value);
    const v =
      type === "color"
        ? (() => {
            const n = (i: number) => parseInt(value.slice(i, i + 2), 16) / 255;
            return { r: n(1), g: n(3), b: n(5), a: value.length === 9 ? n(7) : 1 };
          })()
        : type === "dimension" ? parseFloat(value) : value;
    return { name: name.split("-").join("/"), value: v, type: type === "color" ? "COLOR" : type === "dimension" ? "FLOAT" : "STRING" };
  });
  return JSON.stringify(vars, null, 2);
}

const toCss = (tokens: TokenMap) =>
  `:root {\n${[...tokens].map(([n, v]) => `  --${n}: ${v};`).join("\n")}\n}\n`;

/** Tailwind v4 reads design tokens from CSS custom properties in an @theme block, by namespace. */
function tailwindName(name: string, value: string): string {
  const t = typeOf(value);
  if (t === "color") return `color-${name}`;
  if (/radius/.test(name)) return `radius-${name.replace(/^(border-)?radius-?/, "") || "default"}`;
  if (/(text|font)-.*size|^base-text-size/.test(name) && t === "dimension") return `text-${name}`;
  if (t === "dimension") return `spacing-${name}`;
  return name; // non-themeable values stay as plain variables
}

function toTailwind(tokens: TokenMap): { css: string; names: Map<string, string> } {
  const names = new Map<string, string>();
  const lines: string[] = [];
  for (const [n, v] of tokens) {
    const tw = tailwindName(n, v);
    names.set(tw, n);
    lines.push(`  --${tw}: ${v};`);
  }
  return { css: `@import "tailwindcss";\n\n@theme {\n${lines.join("\n")}\n}\n`, names };
}

// ---------- migrate + verify ----------

export interface MigrationResult {
  format: Format;
  out: string;
  tokens: number;
  /** drift between source and the migrated output, read back from disk */
  verification: DriftReport;
  ok: boolean;
}

export function migrateTokens(source: TokenMap, format: Format, out: string): MigrationResult {
  let rename: Map<string, string> | undefined;
  let text: string;
  if (format === "dtcg") text = toDtcg(source);
  else if (format === "figma") text = toFigma(source);
  else if (format === "css") text = toCss(source);
  else {
    const tw = toTailwind(source);
    text = tw.css;
    rename = tw.names;
  }
  writeFileSync(out, text);

  // Read back through a file with the extension the loader understands.
  let readBack = loadTokens(out.endsWith(".css") || out.endsWith(".json") ? out : copyAs(out, format));
  if (rename) readBack = new Map([...readBack].map(([k, v]) => [rename!.get(k) ?? k, v]));
  const verification = compareTokens(source, readBack);
  return { format, out, tokens: source.size, verification, ok: verification.items.length === 0 };
}

function copyAs(path: string, format: Format): string {
  const ext = format === "dtcg" || format === "figma" ? ".json" : ".css";
  const tmp = join(mkdtempSync(join(tmpdir(), "ds-lab-")), "out" + ext);
  writeFileSync(tmp, readFileSync(path));
  return tmp;
}
