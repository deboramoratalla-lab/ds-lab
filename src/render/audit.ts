// Renders a screen in a real browser and checks every computed style value
// against the design system's tokens. Any value that no token produces is
// "off-system": a hardcoded color, spacing, size or radius.
//
// This is the token coverage metric of the lab, measured on what users see,
// not on what the source code claims.

import { chromium } from "playwright";
import { normalizeValue, type TokenMap } from "../tokens/load.js";

const PROPS = {
  color: ["color", "background-color", "border-top-color"],
  spacing: ["padding-top", "padding-right", "padding-bottom", "padding-left", "row-gap", "column-gap"],
  type: ["font-size", "line-height"],
  radius: ["border-top-left-radius"],
} as const;

interface Sample {
  selector: string;
  property: string;
  value: string;
  /** the declaration as written in CSS, e.g. "var(--base-size-16)" or "13px" */
  authored?: string;
}

export interface OffSystem {
  selector: string;
  property: string;
  value: string;
  authored: string;
  /** closest token by value, when one is near */
  suggestion?: string;
}

export interface AuditReport {
  url: string;
  /** style values that were authored on the element itself */
  checked: number;
  onSystem: number;
  coverage: number; // 0..1
  /** written as var(--token) or calc() with tokens */
  viaToken: number;
  /** written by hand but equal to a token value (on-system visually, fragile) */
  literalMatchingToken: number;
  offSystem: OffSystem[];
}

/** Values that are always fine and say nothing about the system. */
const NEUTRAL = new Set(["0px", "normal", "#00000000", "auto"]);

function hexToRgb(h: string): [number, number, number] | null {
  const m = h.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function nearestToken(value: string, tokens: TokenMap): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  const rgb = hexToRgb(value);
  const px = parseFloat(value);
  for (const [name, v] of tokens) {
    let dist = Infinity;
    if (rgb) {
      const t = hexToRgb(v);
      if (t) dist = Math.hypot(rgb[0] - t[0], rgb[1] - t[1], rgb[2] - t[2]);
    } else if (value.endsWith("px") && v.endsWith("px")) {
      dist = Math.abs(px - parseFloat(v)) * 10;
    }
    if (dist < bestDist) [bestDist, best] = [dist, name];
  }
  return bestDist < 40 ? best : undefined;
}

/** Which tokens may legitimately produce a value for each kind of property. */
const CATEGORY: Record<keyof typeof PROPS, RegExp> = {
  color: /color|bg|fg|border-?color|shadow-.*color|ansi/,
  spacing: /^(base-size|control-.*(padding|gap|inset)|stack-(gap|padding)|overlay-padding|space|spacing)/,
  type: /^(base-text-size|text-.*-size|font-size)/,
  radius: /^(border-radius|base-border-radius|radius)/,
};

function categoryOf(property: string): keyof typeof PROPS {
  return (Object.keys(PROPS) as (keyof typeof PROPS)[]).find((k) =>
    (PROPS[k] as readonly string[]).includes(property),
  )!;
}

export async function auditScreen(url: string, tokens: TokenMap): Promise<AuditReport> {
  const byCategory = Object.fromEntries(
    Object.entries(CATEGORY).map(([cat, re]) => [cat, new Map([...tokens].filter(([name]) => re.test(name)))]),
  ) as Record<keyof typeof PROPS, TokenMap>;
  const allowedBy = Object.fromEntries(
    Object.entries(byCategory).map(([cat, map]) => [cat, new Set(map.values())]),
  ) as Record<keyof typeof PROPS, Set<string>>;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url);
    const props = Object.values(PROPS).flat();
    // Plain string so the TS toolchain can't inject helpers that don't exist in the page.
    // For each element we also find the AUTHORED declaration behind each value: the last matching
    // rule in source order, inline style winning. (Approximates the cascade: ignores specificity
    // and !important, which is enough to tell "var(--token)" from a hand-written number.)
    const samples: Sample[] = await page.evaluate(`(() => {
      const props = ${JSON.stringify(props)};
      const SHORTHAND = {
        "padding-top": "padding", "padding-right": "padding", "padding-bottom": "padding", "padding-left": "padding",
        "row-gap": "gap", "column-gap": "gap", "background-color": "background",
        "border-top-color": "border-color", "border-top-left-radius": "border-radius", "font-size": "font",
      };
      const SIDE = { "padding-top": 0, "padding-right": 1, "padding-bottom": 2, "padding-left": 3 };
      const splitTop = (v) => { const out = []; let depth = 0, cur = "";
        for (const ch of v.trim()) { if (ch === "(") depth++; if (ch === ")") depth--;
          if (ch === " " && depth === 0) { if (cur) out.push(cur); cur = ""; } else cur += ch; }
        if (cur) out.push(cur); return out; };
      const sideOf = (parts, i) => i === 0 ? parts[0] : i === 1 ? (parts[1] ?? parts[0])
        : i === 2 ? (parts[2] ?? parts[0]) : (parts[3] ?? parts[1] ?? parts[0]);

      const rules = [];
      const collect = (list) => { for (const r of list) {
        if (r.selectorText !== undefined) rules.push(r);
        else if (r.media) { if (matchMedia(r.media.mediaText).matches) collect(r.cssRules); }
        else if (r.cssRules) collect(r.cssRules);
      } };
      for (const s of document.styleSheets) { try { collect(s.cssRules); } catch (e) {} }

      const authored = (el, p) => {
        let found;
        const blocks = rules.filter((r) => { try { return el.matches(r.selectorText); } catch (e) { return false; } })
          .map((r) => r.style).concat([el.style]);
        for (const st of blocks) {
          const v = st.getPropertyValue(p);
          if (v) { found = v; continue; }
          const sh = SHORTHAND[p]; const sv = sh && st.getPropertyValue(sh);
          if (sv) found = p in SIDE ? sideOf(splitTop(sv), SIDE[p]) : sv;
        }
        return found;
      };

      const out = [];
      for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        const hasBorder = parseFloat(cs.borderTopWidth) > 0;
        const cls = [...el.classList].slice(0, 2).map((c) => "." + c).join("");
        const text = (el.textContent || "").trim().slice(0, 20);
        const selector = el.tagName.toLowerCase() + cls + (text ? ' "' + text + '"' : "");
        for (const p of props) {
          if (p === "border-top-color" && !hasBorder) continue;
          out.push({ selector, property: p, value: cs.getPropertyValue(p), authored: authored(el, p) });
        }
      }
      return out;
    })()`);

    let checked = 0;
    const sources = { viaToken: 0, literalMatchingToken: 0 };
    const offSystem: OffSystem[] = [];
    const seen = new Set<string>();
    for (const s of samples) {
      const value = normalizeValue(s.value);
      if (NEUTRAL.has(value)) continue;
      // line-height is often a computed product of font-size × ratio, not a token itself
      if (s.property === "line-height") continue;
      // No declaration on this element: the value is inherited or a browser default.
      // It gets checked on the element where it was authored.
      if (!s.authored || /^(inherit|initial|unset|currentcolor|transparent)$/i.test(s.authored.trim())) continue;
      checked++;
      if (s.authored.includes("var(--")) { sources.viaToken++; continue; } // derived from a token, even via calc()
      const cat = categoryOf(s.property);
      if (allowedBy[cat].has(value)) { sources.literalMatchingToken++; continue; }
      const key = `${s.selector}|${s.property}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offSystem.push({ selector: s.selector, property: s.property, value, authored: s.authored.trim(), suggestion: nearestToken(value, byCategory[cat]) });
    }
    const onSystem = checked - offSystem.length;
    return { url, checked, onSystem, coverage: checked ? onSystem / checked : 1, ...sources, offSystem };
  } finally {
    await browser.close();
  }
}
