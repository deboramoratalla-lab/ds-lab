# Baseline: a design system that is 100% in sync

A subset of GitHub's Primer (25 tokens + Button, 5 variants x 3 sizes), kept identical in four places:

| Place | Where |
|---|---|
| Figma | [DS Lab — Primer Button migration](https://www.figma.com/design/8NpJVVuCcGnZyrmldH6pa5): 25 variables, Button component set bound to them, docs page |
| Code | `code/tokens.css`, `code/button.css` |
| Storybook | `stories/button.stories.js` |
| Docs | `docs/components.json` (subset of @primer/react's official docs) |

`figma/snapshot.json` is read from the Figma file with `figma/snapshot.plugin.js` (Plugin API, read-only).

```bash
npx tsx src/cli.ts certify baseline
```

```
✓ Tokens (Figma ↔ code)                        25/25  100%
✓ Component bindings (Figma ↔ code)            120/120  100%
✓ Options (docs · code · Figma · Storybook)    8/8  100%
✓ Docs in Figma (description ↔ docs)           10/10  100%
```

This is the starting point of the demo: it gets broken on purpose with realistic changes, and DS Lab brings it back here.
