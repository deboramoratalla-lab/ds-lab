# DS Lab

Everyone wants to sync their design system. Nobody knows what works. DS Lab measures it.

DS Lab runs several Figma ↔ code sync strategies in parallel on **your** design system, replays the same real changes against each one, and tells you which strategy holds up. After you adopt it, it keeps measuring whether it actually works.

Built for the Nebius × NVIDIA Global AI Hackathon (Coding and Agentic Engineering track). Work in progress.

## Status

- [x] Token drift engine (design tokens vs code tokens)
- [ ] Rendered-screen comparison (Playwright)
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

## License

MIT
