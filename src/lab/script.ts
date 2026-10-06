// The change script: realistic edits from designers and engineers, replayed identically
// against every strategy. Each event says what "the change survived" means on both sides.

import type { LabEvent, State } from "./types.js";

const both = (s: State, k: string, v: string | undefined) => s.design.get(k) === v && s.code.get(k) === v;

export const PRIMER_SCRIPT: LabEvent[] = [
  {
    id: "rename", who: "designer",
    title: "Designer renames fgColor/muted → fgColor/subtle in Figma",
    apply(s) { const v = s.design.get("fg-color-muted")!; s.design.delete("fg-color-muted"); s.design.set("fg-color-subtle", v); },
    kept: (s) => both(s, "fg-color-subtle", "#59636e") && !s.design.has("fg-color-muted") && !s.code.has("fg-color-muted"),
  },
  {
    id: "hotfix", who: "engineer",
    title: "Engineer hotfixes the danger button text color in CSS (#d1242f → #c21c2c)",
    apply(s) { s.code.set("button-danger-fg-color-rest", "#c21c2c"); },
    kept: (s) => both(s, "button-danger-fg-color-rest", "#c21c2c"),
  },
  {
    id: "add", who: "designer",
    title: "Designer adds a new token bgColor/highlight in Figma",
    apply(s) { s.design.set("bg-color-highlight", "#fff8c5"); },
    kept: (s) => both(s, "bg-color-highlight", "#fff8c5"),
  },
  {
    id: "delete", who: "engineer",
    title: "Engineer removes the unused borderColor/translucent token from code",
    apply(s) { s.code.delete("border-color-translucent"); },
    kept: (s) => !s.design.has("border-color-translucent") && !s.code.has("border-color-translucent"),
  },
  {
    id: "conflict", who: "both", conflict: true,
    title: "Both change borderRadius/medium the same week: Figma 8px (redesign), code 4px (bug fix)",
    apply(s) { s.design.set("border-radius-medium", "8px"); s.code.set("border-radius-medium", "4px"); },
    notes: {
      "border-radius-medium":
        "Figma change by a designer, version note: 'Softer corners across controls for the 2026 visual refresh, approved in design review.' " +
        "Code change by an engineer, commit message: 'fix: 6px radius clipped the focus ring on small buttons, use 4px until the ring is reworked.'",
    },
    // there is no "right" value without a person: what counts is that the sides agree
    // and that nobody's change was overwritten without a decision
    kept: (s) => s.design.get("border-radius-medium") === s.code.get("border-radius-medium"),
  },
];
