# Seamline

**Keeps Figma, code, Storybook and docs in sync for a design system, and only asks a person when it should.**

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
- **Nebius Serverless Endpoints** (ready, not live): `.github/workflows/deploy-nebius.yml` deploys the console and the "Send answers" endpoint once a Nebius AI Cloud project exists. The hackathon credits cover Token Factory only, so the public demo is hosted elsewhere.
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
