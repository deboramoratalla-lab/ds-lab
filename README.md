# DS Lab

Everyone wants to sync their design system. Nobody knows what works. DS Lab measures it.

DS Lab runs several Figma ↔ code sync strategies in parallel on **your** design system, replays the same real changes against each one, and tells you which strategy holds up. After you adopt it, it keeps measuring whether it actually works.

Built for the Nebius × NVIDIA Global AI Hackathon (Coding and Agentic Engineering track). Work in progress.

## Status

- [x] Token drift engine (design tokens vs code tokens)
- [x] Rendered-screen audit (Playwright): token coverage on what users actually see
- [ ] Strategy lab on Token Factory Sandboxes (forked runs)
- [x] Nemotron agents: Nano finds renamed tokens, Ultra resolves Figma ↔ code conflicts
- [x] Token migration between Figma variables, W3C DTCG JSON, CSS and Tailwind v4, verified by read-back
- [x] Component migration sample: Primer Button, code → Figma, 12 variants bound to variables, verified 96/96
- [x] Documentation: the design system's own docs (Primer components.json) synced into Figma, never rewritten
- [x] Storybook: four-way check of every variant and size across docs, code, Figma and Storybook
- [ ] Super builds screens inside the lab
- [ ] Post-adoption tracking with Nebius Serverless Jobs
- [ ] Dashboard

## Try the drift engine

```bash
npm install
npx tsx src/cli.ts drift design-tokens.json tokens.css
```

Accepts Figma variable / W3C DTCG JSON and CSS custom properties. Values are normalized (`#FFF` = `#ffffff` = `rgb(255,255,255)`, `1rem` = `16px`) so only real drift shows up. Exit code is `2` when drift is found, so it works in CI.

## Audit a rendered screen

```bash
npm run primer   # downloads Primer fixtures once
npx tsx src/cli.ts audit <tokens> fixtures/screens/settings.html
```

Opens the screen in Chromium, reads every computed color, spacing, font size and radius, and checks each against tokens of the right category. Off-system values come with the nearest token as a suggestion.

## Migrate tokens

```bash
npx tsx src/cli.ts migrate <source-tokens> dtcg|figma|css|tailwind --out <file>
```

The output is read back with the same loader and compared with the source by the drift engine. A migration only passes at 100% sync, so nothing is lost silently. Primer's 1,164 Figma tokens pass in all four formats.

## Where does each option live?

```bash
npx tsx src/cli.ts where <components.json> <Component.css> --name Button --base prc-Button-ButtonBase \
  --figma "variant=default,primary,danger,invisible;size=small,medium,large"
```

Checks every variant and size against the official docs, the code, Figma and Storybook stories. On Primer's Button: 7/8 in sync; `variant=link` is missing in Figma.

## Reconcile with Nemotron

```bash
cp .env.example .env   # add your Token Factory key
npx tsx src/cli.ts reconcile <design-tokens> <code-tokens>
```

Nemotron 3 Nano pairs tokens that were renamed between Figma and code (thinking off: fast, cheap). Nemotron 3 Ultra decides, for each conflicting value, whether Figma or code holds the intended decision, or that a person must decide, and says what to change. On Primer it calls the font-stack conflicts in favour of code (Figma can't express fallback stacks) and flags one it can't settle for a human.

Behind an HTTPS proxy, run Node with `NODE_USE_ENV_PROXY=1`.

## License

MIT
