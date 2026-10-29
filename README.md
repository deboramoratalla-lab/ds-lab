# Seamline

**Keeps Figma, code, Storybook and docs in sync for a design system, and only asks a person when it should.**

**Live demo:** https://seamline-five.vercel.app

Seamline certifies a design system across its four sources, lets NVIDIA Nemotron models on Nebius Token Factory repair the drift they are sure about, sends everything else to the design-system lead, and opens a real GitHub pull request whose `ds-sync` check stays red until those decisions are made.

It runs on GitHub's real [Primer](https://primer.style) system: `@primer/primitives`, `@primer/react`, the Primer Web Figma file and Primer's Storybook stories.

> Formerly DS Lab. The repo, the CLI (`ds-lab`) and the `ds-sync` check keep their names.

## Numbers from the last run

<!-- numbers:start -->
Run of 2026-10-29 13:14 UTC · [PR #19](https://github.com/deboramoratalla-lab/ds-lab/pull/19)
- Button: 1,556 of 1,564 values in sync; 16 went out of sync this run, the agent fixed 8, 8 wait on 3 decisions.
- Components: 74, 71 with Storybook stories, 31 with no Figma set.
- Screens: 38 problems in 6 GitHub screens · planted breaks 12/12 · blind test 6/6, 0 false alarms · mutations 343/343, 0 noise.
- Side-bias test: Ultra picked a side 0/5 times, 0/5 with the sides swapped.
- Unit tests: 18/18 pass.
- Nemotron calls: 6 · auto-apply at ≥ 85%.
<!-- numbers:end -->

## The problem

Design systems drift in five ways, whatever the component: one side changes a value, a token is renamed, someone ships a hotfix, a new option appears on one side, or both sides change the same thing. Today's sync tools pick a winner ("Figma first" or "code first") and silently overwrite the other side's work. Seamline treats each kind of change differently.

| Kind of change | Who handles it | What happens |
|---|---|---|
| One side changes a value | Nemotron Ultra reads the commit and ticket | Applied if ≥ 85% sure, otherwise asks |
| A token is renamed | Nemotron Nano pairs old and new names | Applied or confirmed by a person |
| An urgent hotfix | Nemotron Ultra + the WCAG contrast check | Applied to the other side |
| A new option on one side | Nemotron Super researches it with Tavily | Proposed, never created alone |
| Both sides change the same thing | The lead | Always a person's call |

Guardrails: auto-apply only at ≥ 85% confidence, every change is logged and can be undone, three rejections of one kind pause auto-apply for it, and `ds-sync` re-certifies every PR.

## What's in the repo

- **Agent** (`src/demo/repair.ts`): certify → repair → escalate, with an undo journal and a trust ledger.
- **Certification** (`src/certify-primer.ts`): shared tokens, links kept since last certification, Button properties by value, options in docs/code/Figma/Storybook, docs in Figma, WCAG AA text contrast.
- **All 74 components** (`src/certify-catalog.ts`, `src/triage-catalog.ts`): options, tokens and status checked across docs, code and the real Figma file; Nemotron Ultra suggests one fix per drifting component.
- **Meaning review** (`src/review-screens.ts`): Nemotron Super reads each screen three times (labels, icons, variants, row text) and proposes issues; Nemotron Ultra confirms or rejects each one. Only issues proposed in most reads and confirmed by Ultra are reported.
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

## Side-bias test

`NODE_USE_ENV_PROXY=1 npx tsx scripts/eval/side-bias.ts` asks Nemotron Ultra the same Figma-vs-code conflict 5 times, then 5 more with the sides swapped, then 5 with no argument on either side. Result (29 Oct): it picked neither side in all 15, so it doesn't tilt towards designers or engineers, but its stored lean ("Figma", from one earlier run) isn't stable. The console now shows that lean as a hint with this result next to it, never pre-selected. Results: `console/side-bias.json`.

## Limitations (honest list)

- An override ("Override with a reason") lets the whole ds-sync check pass for 7 days, not just the overridden value.
- Model confidence is the model's own estimate, not calibrated.

- **Deepest checks are on Button.** It gets about 1,560 checks (1,564 in the 29 Oct run) (properties by value, Storybook stories, WCAG contrast). The other 73 components get lighter checks: options, tokens, colour tokens vs Figma, status. 31 of 74 have no Figma set, so they're checked against docs and code only: 17 have nothing to draw (utilities, layout, wrappers), 5 are deprecated, 2 exist in Figma under other names (Skeleton is split into SkeletonAvatar and SkeletonText; ConfirmationDialog is built on Dialog) and 7 are a real gap that the console lists under Decisions → Missing, where each one becomes a GitHub issue for a designer.
- **Storybook:** Button gets the deep story checks; for the other components Seamline reads Primer's own stories (same version, 71 components have them) and checks that every non-default option in the docs appears in a story. It doesn't render the stories.
- **Nano is for mechanical work only.** In triage tests it invented a commit, so judgment always goes to Ultra, and anything below 85% confidence goes to a person.
- **Figma is read, not written.** The agent writes its fixes to the repo and the PR; applying them back into the Figma file is still manual.
- **Nebius Serverless is ready, not live.** The workflow and image exist, but our credits cover Token Factory only, so the demo runs on Vercel with the same server.
- **Screens are read from an export.** The screen inventory is exported from Figma with the plugin API and checked in the repo; there's no live Figma connection in CI. Contrast is checked in all 9 Primer colour modes. Meaning (labels, icons, variants) is proposed by Nemotron Super and confirmed by Nemotron Ultra; it was stable across two runs on our 3 planted meaning breaks, which is a small set. The test screens use Inter for edited labels because the plugin sandbox can't load SF Pro.
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

**Blind test** (`fixtures/primer-web-notes/screens-blind.json`). After round 9 we froze the rules and the prompt and built a new screen, "New issue", with 6 new breaks (a Label border set by hand, a 2.85:1 caption, a primary button that says "Cancel", a 10px gap, a detached Label, a form background set by hand that only breaks in dark mode) and 6 decoys that look suspicious but are correct (an invisible small Button at its real 28px, a success InlineMessage, an attention Label...).

- New screen: **6 of 6 found, 0 false alarms** on the decoys.
- Same run, old screens: the model vote dropped B13 ("Save changes" on the Archive row, 1 of 3 reads) and kept 2 false alarms (two ToggleSwitches whose "On" it read as a vague label). Rules found everything they found before.

**Fixing the meaning review** (round 10). Three changes: temperature 0 so reads repeat; each element now gets the text of its own row and its sibling components instead of the whole screen (the Archive button used to see every row of the Danger zone); and a second model checks each candidate: Nemotron Super proposes, Nemotron Ultra confirms or rejects, and an issue is reported only if Super proposed it in most of 3 reads **and** Ultra confirms it.
- Two full runs back to back, all 6 screens: the same 3 issues both times (B12, B13 and the blind N3), each proposed in 3 of 3 reads and confirmed by Ultra; 0 false alarms. Ultra rejected the candidates that weren't real (e.g. "Merge pull request doesn't match the checks text").
- Still not a guarantee: 3 planted meaning breaks is a small set, which is why these findings go to a person and are never auto-applied.

It also found problems we didn't plant:
- From the library: StateLabel's `variant=pull request` and `size=normal` exist in Figma but not in docs; SegmentedControl's `size=medium` is missing in code.
- In our own screens: we built the PR page with TabNav, which Primer's docs mark deprecated (use UnderlineNav).
- In Primer itself, in the dark dimmed mode: `fgColor/accent` and `fgColor/link` on `bgColor/default` are 4.33:1 and `fgColor/danger` is 4.02:1, just under AA.
- Knock-on effects in dark mode: the hand-set "Danger zone" heading (1.20:1) and the row filled with a token code lacks (1.15:1).

## End-to-end test (28 Oct 2026)

The whole loop on the real repo, no hand edits in between: agent run → pull request → ds-sync red → the lead's answers → ds-sync green.

| Time (UTC) | What happened | Proof |
|---|---|---|
| 20:16 | `agent-run` started by hand (same job as the daily one): certify, Nemotron repairs, open the PR | [run](https://github.com/deboramoratalla-lab/ds-lab/actions/runs/40761756541) |
| 20:19 | PR #15 opened by the agent with 2 items waiting on a person | [PR #15](https://github.com/deboramoratalla-lab/ds-lab/pull/15) |
| 20:19 | ds-sync **fails**, as it should while decisions are open | [run](https://github.com/deboramoratalla-lab/ds-lab/actions/runs/40762192440) |
| 20:20 | `apply-decisions` with the lead's answers (invisible button text: keep code; approve the rest), the same call "Send answers" makes | [run](https://github.com/deboramoratalla-lab/ds-lab/actions/runs/40762351719) |
| 20:20 | Commit "apply the design system lead's decisions" lands on the PR; ds-sync **passes** | [run](https://github.com/deboramoratalla-lab/ds-lab/actions/runs/40762412932) |

**Recorded run (29 Oct, 08:26 UTC, PR #16).** Same loop, recorded in the browser, this time answering in the live demo: "Keep code" on the conflict, "Create it" on the new option, then **Send answers to the PR** on seamline-five.vercel.app, which called the Vercel endpoint and started [apply-decisions](https://github.com/deboramoratalla-lab/ds-lab/actions/runs/40842849155). The PR's commits show the agent's commit at ✗ 2/3 checks and the "apply the design system lead's decisions" commit at ✓ 3/3, with no manual step on GitHub. [PR #16](https://github.com/deboramoratalla-lab/ds-lab/pull/16)

**What the test found.** The first try (PR #14) showed that since the agent started opening PRs on its own, GitHub had been holding every ds-sync run on them as "action required" (runs opened by `GITHUB_TOKEN` need approval), so the check never actually ran on PRs #4–#13. Fixed: after opening the PR or applying answers, the workflow approves the held run and starts ds-sync on the branch itself. PR #15 above ran with the fix and needed no manual step.

## Mutation test (`src/mutation-screens.ts`)

Planted breaks are few and we chose them. So the rules are also tested with random ones: the script takes the real inventory of the six GitHub screens, applies **one** random break to a fresh copy (a text colour unbound, a colour set by hand on a component, text made too light, an off-scale gap, a component resized, detached, swapped for a deprecated one or for one that isn't in the library, a token code doesn't ship), re-runs the checks and asks two questions: did a finding of the right kind appear on the node we broke, and did anything appear anywhere else?

- Seed 7, 40 per kind: **343 of 343 caught, 0 knock-on false alarms.** Seed 42, 60 per kind: 521 of 521, 0.
- The first run was 333 of 343. The 10 misses were a real bug: to ignore the icons left inside a detached Button we skipped any component whose Figma id was within 10 of the detached frame's, which also hid three real Buttons on the "New issue" screen. We now read which components actually sit inside a detached frame from Figma. The Button usage count went from 8 to 9 as a result.
- What it doesn't cover: meaning (labels, icons) is model-based and tested with the planted and blind sets above; and two breaks at once on the same node aren't generated.

`npm test` runs a small version (seed 11, 6 per kind) on every push.

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
