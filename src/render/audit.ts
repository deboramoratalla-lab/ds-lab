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

export interface OffSystem {
  selector: string;
  property: string;
  value: string;
  /** closest token by value, when one is near */
  suggestion?: string;
}

export interface AuditReport {
  url: string;
  checked: number;
  onSystem: number;
  coverage: number; // 0..1
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
    const samples: { selector: string; property: string; value: string }[] = await page.evaluate(`(() => {
      const props = ${JSON.stringify(props)};
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
          out.push({ selector, property: p, value: cs.getPropertyValue(p) });
        }
      }
      return out;
    })()`);

    let checked = 0;
    const offSystem: OffSystem[] = [];
    const seen = new Set<string>();
    for (const s of samples) {
      const value = normalizeValue(s.value);
      if (NEUTRAL.has(value)) continue;
      // line-height is often a computed product of font-size × ratio, not a token itself
      if (s.property === "line-height") continue;
      checked++;
      const cat = categoryOf(s.property);
      if (allowedBy[cat].has(value)) continue;
      const key = `${s.selector}|${s.property}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offSystem.push({ ...s, value, suggestion: nearestToken(value, byCategory[cat]) });
    }
    const onSystem = checked - offSystem.length;
    return { url, checked, onSystem, coverage: checked ? onSystem / checked : 1, offSystem };
  } finally {
    await browser.close();
  }
}
