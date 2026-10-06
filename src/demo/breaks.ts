// The demo's breaking script (demo/break-script.md), applied to copies of the certified Primer Web
// fixtures. Each break touches the side a real person would touch: Figma variables/bindings,
// a CSS commit, the docs. Nothing in fixtures/ is modified.

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { PrimerCertifyInput } from "../certify-primer.js";

export interface Break {
  id: string; who: "designer" | "engineer" | "both"; title: string;
  /** what people wrote with the change (Figma note / commit message), read later by the resolver */
  notes?: Record<string, string>;
  apply(w: Workspace): void;
}

export interface Workspace {
  dir: string;
  figma(edit: (vars: Record<string, unknown>) => void): void;
  snapshot(edit: (snap: any) => void): void;
  codeOverride(css: string): void;
  buttonCss(append: string): void;
  docs(edit: (components: any) => void): void;
}

const D = "fixtures/package/dist";
export function primerInput(over: Partial<PrimerCertifyInput> = {}): PrimerCertifyInput {
  return {
    figmaTokens: "fixtures/primer-web-figma",
    codeTokens: `${D}/css/functional/themes/light.css,${D}/css/functional/size,${D}/css/functional/typography,${D}/css/base`,
    buttonSnapshot: "fixtures/primer-web-notes/button-snapshot.json",
    buttonCss: readdirSync("fixtures/primer-react/package/dist/Button").filter((f) => /^ButtonBase-.*\.css$/.test(f)).map((f) => `fixtures/primer-react/package/dist/Button/${f}`)[0],
    docs: "fixtures/primer-react/package/generated/components.json",
    stories: ["fixtures/primer-storybook/Button.stories.tsx", "fixtures/primer-storybook/Button.features.stories.tsx"],
    exceptions: Object.fromEntries(["font-stack-monospace", "font-stack-sans-serif", "font-stack-sans-serif-display", "font-stack-system"]
      .map((t) => [t, "Figma can't express font fallback stacks; the file is built on SF Pro"])),
    ...over,
  };
}

/** Copies the certified state into `dir` and returns the input pointing at the copies. */
export function makeWorkspace(dir: string): { w: Workspace; input: PrimerCertifyInput } {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const base = primerInput();
  cpSync(base.figmaTokens, join(dir, "figma"), { recursive: true });
  cpSync(base.buttonSnapshot, join(dir, "button-snapshot.json"));
  cpSync(base.buttonCss, join(dir, "ButtonBase.css"));
  cpSync(base.docs, join(dir, "components.json"));
  writeFileSync(join(dir, "commits.css"), ":root {\n");
  const json = (f: string, edit: (x: any) => void) => { const x = JSON.parse(readFileSync(f, "utf8")); edit(x); writeFileSync(f, JSON.stringify(x)); };
  const w: Workspace = {
    dir,
    figma(edit) {
      // the export is split in parts; edit them as one map, then write back to the part each key lives in
      const parts = readdirSync(join(dir, "figma")).filter((f) => f.endsWith(".json")).map((f) => join(dir, "figma", f));
      const all: Record<string, unknown> = {}, owner = new Map<string, string>();
      for (const p of parts) for (const [k, v] of Object.entries(JSON.parse(readFileSync(p, "utf8")))) { all[k] = v; owner.set(k, p); }
      edit(all);
      const out = new Map(parts.map((p) => [p, {} as Record<string, unknown>]));
      for (const [k, v] of Object.entries(all)) out.get(owner.get(k) ?? parts[parts.length - 1])![k] = v;
      for (const [p, x] of out) writeFileSync(p, JSON.stringify(x));
    },
    snapshot: (edit) => json(join(dir, "button-snapshot.json"), edit),
    codeOverride: (css) => appendFileSync(join(dir, "commits.css"), css + "\n"),
    buttonCss: (css) => appendFileSync(join(dir, "ButtonBase.css"), css),
    docs: (edit) => json(join(dir, "components.json"), edit),
  };
  const input = primerInput({
    figmaTokens: join(dir, "figma"),
    codeTokens: `${base.codeTokens},${join(dir, "commits.css")}`,
    buttonSnapshot: join(dir, "button-snapshot.json"),
    buttonCss: join(dir, "ButtonBase.css"),
    docs: join(dir, "components.json"),
  });
  return { w, input };
}

export function closeWorkspace(dir: string) { appendFileSync(join(dir, "commits.css"), "}\n"); }

const SEL = ".prc-Button-ButtonBase-9n-Xk";

export const BREAKS: Break[] = [
  {
    id: "silent", who: "engineer",
    title: "Engineer gives the danger button a light red background (code only)",
    notes: { "button-danger-bg-color-rest": "Commit: 'feat: danger buttons get a tinted background so destructive actions stand out (design ticket DS-412)'." },
    apply: (w) => w.codeOverride("  --button-danger-bgColor-rest: #ffebe9;"),
  },
  {
    id: "rename", who: "designer",
    title: "Designer renames control/medium/gap → control/medium/gapInline in Figma",
    apply(w) {
      w.figma((v) => { v["control/medium/gapInline"] = v["control/medium/gap"]; delete v["control/medium/gap"]; });
      // Figma keeps bindings attached through a rename, so the components now point at the new name
      w.snapshot((s) => { for (const b of Object.values<any>(s.bindings)) if (b.gap === "control/medium/gap") b.gap = "control/medium/gapInline"; });
    },
  },
  {
    id: "hotfix", who: "engineer",
    title: "Engineer darkens the primary button hover for contrast (code only)",
    notes: { "button-primary-bg-color-hover": "Commit: 'fix(a11y): primary hover failed 4.5:1 with white text in high-contrast audit, darken to #1a7f37'." },
    apply: (w) => w.codeOverride("  --button-primary-bgColor-hover: #1a7f37;"),
  },
  {
    id: "xsmall", who: "engineer",
    title: "New size=\"xsmall\" ships in code and docs, not in Figma or Storybook",
    apply(w) {
      w.buttonCss(`${SEL}:where([data-size=xsmall]){font-size:var(--text-body-size-small,.75rem);gap:var(--control-xsmall-gap,.25rem);height:var(--control-xsmall-size,1.5rem);padding:0 var(--control-xsmall-paddingInline-condensed,.25rem)}`);
      w.docs((c) => {
        const btn = Object.values<any>(c.components ?? c).find((x) => x.name === "Button");
        const size = btn.props.find((p: any) => p.name === "size");
        size.type = String(size.type).replace("'small'", "'xsmall' | 'small'");
      });
    },
  },
  {
    id: "conflict", who: "both",
    title: "Same week: designer makes invisible button text blue, engineer makes it grey",
    notes: {
      "button-invisible-fg-color-rest":
        "Figma change by a designer, version note: 'Brand refresh: invisible buttons use the link blue so they read as actions.' " +
        "Code change by an engineer, commit message: 'fix: invisible buttons should match default text, blue clashed with links in tables'.",
    },
    apply(w) {
      w.figma((v) => { v["button/invisible/fgColor/rest"] = "#0969da"; });
      w.codeOverride("  --button-invisible-fgColor-rest: #59636e;");
    },
  },
];
