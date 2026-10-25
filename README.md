# Seamline

**Keeps Figma, code, Storybook and docs in sync for a design system, and only asks a person when it should.**

**Live demo:** https://seamline-five.vercel.app

Seamline certifies a design system across its four sources, lets NVIDIA Nemotron models on Nebius Token Factory repair the drift they are sure about, sends everything else to the design-system lead, and opens a real GitHub pull request whose `ds-sync` check stays red until those decisions are made.

It runs on GitHub's real [Primer](https://primer.style) system: `@primer/primitives`, `@primer/react`, the Primer Web Figma file and Primer's Storybook stories.

> Formerly DS Lab. The repo, the CLI (`ds-lab`) and the `ds-sync` check keep their names.

## The problem

Design systems drift in five ways, whatever the component: one side changes a value, a token is renamed, someone ships a hotfix, a new option appears on one side, or both sides change the same thing. Today's sync tools pick a winner ("Figma first" or "code first") and silently overwrite the other side's work. Seamline treats each kind of change differently.

| Kind of change | Who handles it | What happens |
|---|---|---|
| One side changes a value | Nemotron Ultra reads the commit and ticket | Applied if ≥ 85% sure, otherwise asks |
| A token is renamed | Nemotron Nano pairs old and new names | Applied or confirmed by a person |
| An urgent hotfix | Nemotron Ultra + the WCAG contrast check | Applied to the other side |
| A new option on one side | Nemotron Super researches it with Tavily | Proposed, never created alone |
| Both sides change the same thing | The lead | Always a person's call |

Guardrails: auto-apply only at ≥ 85% confidence, every change is journaled and can be undone, three rejections of one kind pause auto-apply for it, and `ds-sync` re-certifies every PR.

## What's in the repo

- **Agent** (`src/demo/repair.ts`): certify → repair → escalate, with an undo journal and a trust ledger.
- **Certification** (`src/certify-primer.ts`): shared tokens, links kept since last certification, Button properties by value, options in docs/code/Figma/Storybook, docs in Figma, WCAG AA text contrast.
- **All 74 components** (`src/certify-catalog.ts`, `src/triage-catalog.ts`): options, tokens and status checked across docs, code and the real Figma file; Nemotron Ultra suggests one fix per drifting component.
- **Meaning review** (`src/review-screens.ts`): Nemotron Super reads each screen (labels, icons, variants, nearby text) three times and keeps the issues most reads agree on.
- **Screens** (`src/certify-screens.ts`): five GitHub screens (pull requests, PR, merge box, settings, danger zone) built from Primer Web instances in the Figma file. Seamline counts where each component is used and finds what breaks there: detached instances, colours set by hand, options code doesn't ship, text below AA contrast, tokens code doesn't have, components resized by hand.
- **Pull request + CI** (`ds-lab pr`, `.github/workflows/ds-sync.yml`): pushes the agent's workspace, opens the PR, and the check fails until the lead answers.
- **Benchmark** (`lab/run_sandboxes.py`): the same five changes synced four ways, each strategy in its own Token Factory Sandbox forked from one checkpoint.
- **Console** (`console/`): one HTML page for the lead (Overview, Activity, Decisions, Report, Sources, How it works), role views for designers and engineers.
- **Server** (`server/server.mjs`, `Dockerfile`): serves the console (ready for Nebius Serverless Endpoints) and turns "Send answers" into a real GitHub Actions run.

## How Nebius and NVIDIA are used

- **Nebius Token Factory** serves every model call (OpenAI-compatible API, JSON mode, per-model usage tracking in `src/llm/nebius.ts`).
- **NVIDIA Nemotron 3**, each for what it's good at:
  - **Nano** (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, thinking off): fast, frequent rename pairing.
  - **Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`): judges which side is right from commits and tickets; summarises conflicts without picking a side; triages drift in the other 73 components.
  - **Super** (`nvidia/nemotron-3-super-120b-a12b`): reads Tavily research on other design systems and WCAG, writes the proposal for new options.
- **Token Factory Sandboxes**: one checkpoint with the five changes, forked four times in parallel (one per strategy) for the benchmark.
- **Nebius Serverless Endpoints** (ready, not live): `.github/workflows/deploy-nebius.yml` deploys the console and the "Send answers" endpoint once a Nebius AI Cloud project exists. The hackathon credits cover Token Factory only, so the public demo runs on Vercel (same server image).
- **Tavily**: searches official design-system sites and WCAG before the agent proposes anything new.

## Run it

Requirements: Node 22, `gh` (GitHub CLI) for pull requests, Python 3.11 + `contree-sdk` only for the sandbox benchmark.

```bash
npm install
cp .env.example .env                 # NEBIUS_API_KEY, TAVILY_API_KEY (and FIGMA_FILE_URL for links)
bash fixtures/get-primer.sh          # downloads @primer/primitives and @primer/react

npx tsx src/cli.ts certify-primer    # certify Primer Web (Button): 1,520+ checks
npx tsx src/console/export.ts        # break → agent repair with Nemotron → console/data.json
npx tsx src/certify-catalog.ts       # check all 74 components
npx tsx src/triage-catalog.ts        # Nemotron Ultra suggestions for the ones that drift
node console/build.mjs               # → console/index.html (open it in a browser)

npx tsx src/cli.ts pr --open         # push the agent's workspace and open the ds-sync PR
npx tsx src/cli.ts pr --decide button-invisible-fg-color-rest=code --approve all   # answer, CI goes green
node server/server.mjs               # console + /api/decide on :8000
npx esbuild src/lab/component-lab.ts --bundle --platform=node --format=esm --outfile=out/sandbox/lab.mjs
python lab/run_sandboxes.py          # the benchmark on Token Factory Sandboxes
npm test
```

### Automation

- `agent-run.yml` runs the whole agent every morning and opens the PR. Add repo secrets `NEBIUS_API_KEY` and `TAVILY_API_KEY`.
- `apply-decisions.yml` applies the lead's answers to the open PR. The console's "Send answers" triggers it through the server.
- `deploy-nebius.yml` builds the image (GHCR) and creates the Nebius Serverless endpoint. Add secrets `NEBIUS_SA_ID`, `NEBIUS_SA_PUBLIC_KEY_ID`, `NEBIUS_SA_PRIVATE_KEY`, `NEBIUS_PROJECT_ID`, optional `GH_DISPATCH_TOKEN` (fine-grained, Actions: write), and variables `NEBIUS_PLATFORM`, `NEBIUS_PRESET` (a CPU platform and preset from your project).

## Limitations (honest list)

- **Deepest checks are on Button.** It gets 1,488 checks (properties by value, Storybook stories, WCAG contrast). The other 73 components get lighter checks: options, tokens, colour tokens vs Figma, status. 14 of 74 aren't checked yet because they aren't in the Primer Web Figma file.
- **Storybook is read for Button only.** For the rest the console shows "Not read".
- **Nano is for mechanical work only.** In triage tests it invented a commit, so judgment always goes to Ultra, and anything below 85% confidence goes to a person.
- **Figma is read, not written.** The agent writes its fixes to the repo and the PR; applying them back into the Figma file is still manual.
- **Nebius Serverless is ready, not live.** The workflow and image exist, but our credits cover Token Factory only, so the demo runs on Vercel with the same server.
- **Screens are read from an export.** The screen inventory is exported from Figma with the plugin API and checked in the repo; there's no live Figma connection in CI. Contrast is checked in all 9 Primer colour modes. Meaning (labels, icons, variants) is read by Nemotron Super with a 3-read majority vote, so it can still miss or invent things; it's 13 of 13 on our planted set, which is small. The test screens use Inter for edited labels because the plugin sandbox can't load SF Pro.
- **One design system.** Everything is tuned on Primer; another system needs its own source adapters.
- **Accessibility:** the agent blocks any fix that breaks WCAG AA text contrast, and the console's own text tokens meet AA in light and dark. It hasn't had a full screen-reader audit.

## Break tests on screens

We planted breaks in the GitHub screens on purpose (`fixtures/primer-web-notes/screens-planted.json`) and ran the checks against them (`test/screens.test.ts`).

| Round | Planted | Found | What changed |
|---|---|---|---|
| 1 | 5 obvious breaks (detached Button, hand-set StateLabel colour, InlineMessage option code lacks, low-contrast text, token code lacks) | 5 of 5 | — |
| 2 | +2 subtle ones: a heading set to the exact hex of `fgColor/default` but unbound, and a Button squeezed to 24px instead of `size=small` | 5 of 7 | Missed both: the colour looked right and no rule compared sizes |
| 3 | same 7 | 7 of 7 | New rules: unbound text colour (and which token has that value), instance height vs its size option |
| 4 | +4 harder ones: a comment box set to white by hand (fine in light, white on white in dark), 13px padding, an instance whose main component was deleted, a deprecated Pagehead | 7 of 11 | Light mode only, no spacing rule, no idea what "deprecated" or "deleted" looks like |
| 5 | same 11 | 11 of 11 | Contrast in dark mode too (resolving Primer's mode variables), spacing vs Primer's scale, components missing from the library, deprecated status from the docs |
| 6 | +2 that need meaning, not rules: the Delete button shows the "opens elsewhere" icon, and the Archive row's danger button says "Save changes" | 11 of 13 | No rule can know what a label or icon means |
| 7 | same 13, Nemotron Super reading each screen (no thinking) | 12 of 13 | Caught the icon, missed the label |
| 8 | same 13, Super with thinking on | 13 of 13, but 3 false alarms in one read, 1 miss in another | The model doesn't answer the same way twice |
| 9 | same 13, Super with thinking, 3 reads per screen, keep what most reads agree on; contrast in all 9 Primer colour modes | 13 of 13, no false alarms | Majority vote; the dropped one-off flags are kept in `console/screens-review.json` |

It also found problems we didn't plant:
- From the library: StateLabel's `variant=pull request` and `size=normal` exist in Figma but not in docs; SegmentedControl's `size=medium` is missing in code.
- In our own screens: we built the PR page with TabNav, which Primer's docs mark deprecated (use UnderlineNav).
- In Primer itself, in the dark dimmed mode: `fgColor/accent` and `fgColor/link` on `bgColor/default` are 4.33:1 and `fgColor/danger` is 4.02:1, just under AA.
- Knock-on effects in dark mode: the hand-set "Danger zone" heading (1.20:1) and the row filled with a token code lacks (1.15:1).

## Built during the hackathon

The project started on 6 October 2026, inside the submission period. Everything here was built for this hackathon: the drift engine, the agent and its guardrails, the Primer certification, the sandbox benchmark, the PR and CI flow, the console, the 74-component check and the Nebius deployment.

## Feedback on Nebius and NVIDIA tools

- **Token Factory** was the easiest part: OpenAI-compatible, JSON mode works, and having Nano, Super and Ultra behind one key made routing by task trivial. Per-request usage in the response made cost tracking per model easy.
- **Nemotron 3 Nano** with thinking off is fast and right for mechanical pairing, but too weak for judgment. In our triage test it invented a commit; Ultra on the same prompt gave grounded answers. Clear guidance on "which tier for which task" in the docs would help.
- **Nemotron 3 Ultra** was the most reliable judge we tried for "which side is right" from commit messages, and it respected "don't pick a side" instructions.
- **Token Factory Sandboxes**: checkpoint once, fork many is exactly what a benchmark needs. A way to diff two sandboxes' file systems directly would save a step.
- **Serverless Endpoints**: deploying from CI needs the service-account profile flow from a different page than the endpoint docs, and the CPU platform/preset names aren't listed next to the endpoint example. One end-to-end "deploy a web app from GitHub Actions" guide would close that gap.

## License

MIT, see [LICENSE](LICENSE).
