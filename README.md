# DS Lab

Everyone wants to sync their design system. Nobody knows what works. DS Lab measures it.

DS Lab runs several Figma ↔ code sync strategies in parallel on **your** design system, replays the same real changes against each one, and tells you which strategy holds up. After you adopt it, it keeps measuring whether it actually works.

Built for the Nebius × NVIDIA Global AI Hackathon (Coding and Agentic Engineering track). Work in progress.

## Status

- [x] Token drift engine (design tokens vs code tokens)
- [x] Rendered-screen audit (Playwright): token coverage on what users actually see
- [ ] Strategy lab on Token Factory Sandboxes (forked runs)
- [ ] Nemotron agents: Nano (matching), Super (building screens), Ultra (conflict resolution, recommendation)
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

## License

MIT
