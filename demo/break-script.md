# Breaking script — Primer Web (certified at 100%)

Starting point: Figma, code, docs and Storybook agree (677 tokens, 114 Button properties, 8 options, 2 doc facts).
Each break is a realistic change, made on one side only. For each one we show who catches it and how it's fixed.

| # | Who changes what | Change | Why it's realistic | What it breaks | Expected fix |
|---|---|---|---|---|---|
| 1 | Code (engineer) | `button-danger-bgColor-rest` goes from `#f6f8fa` to a light red | A product asks for a "more danger" danger button | **Silent.** Figma paints danger/small with `button/default/bgColor/rest`, so in Figma it stays grey. Today's check passes because the two tokens shared a value | Re-bind Figma to `button/danger/bgColor/rest`. The agent decides **design-is-wrong** (the binding, not the color) |
| 2 | Figma (designer) | Renames `control/medium/gap` → `control/medium/gapInline` | Cleanup of variable names | 5 Button variants lose their link to the code's `base-size-8` | Nano pairs the rename. No values change |
| 3 | Code (hotfix) | `button-primary-bgColor-hover` darkened for contrast | Accessibility hotfix pushed straight to production | Figma vs code value mismatch | Ultra reads the commit ("a11y contrast") → **code-is-right**, Figma gets updated |
| 4 | Docs + code | New `size="xsmall"` in code and docs, no Figma variant, no story | A feature lands half-done | 4-way check: missing in Figma and Storybook | The agent creates the 12 Figma variants from the code's CSS and flags the missing story |
| 5 | Both at once | Designer changes `button/invisible/fgColor/rest` to blue (note: "brand refresh"); engineer changes it to grey (commit: "match default") | Real conflict | Same token, two values, two reasons | Ultra → **ask-a-human**, with both reasons side by side |

## Rules for the demo
- Every break is made with a real tool: Figma via plugin, code via a git commit on a branch.
- Every break starts from the same checkpoint (Sandbox fork), so the 4 strategies compete under the same conditions.
- Score: how many of the 5 each strategy detects, repairs correctly, and how many it breaks along the way.

## The hook
Break #1 passes every current check (same value) and only shows up when the code changes. That's the case nobody catches by hand.
