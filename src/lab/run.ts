// Runs every strategy against the same change script, in parallel, and scores each step.
//
// Runner: today every strategy runs in-process on its own copy of the state. With Token Factory
// Sandboxes the same loop runs each strategy in its own sandbox branch, forked from one shared
// checkpoint, with a checkpoint after every step (so any step can be replayed or inspected).

import { clone, type LabEvent, type State, type Strategy, type StepResult, type StrategyRun } from "./types.js";
import { syncRate } from "./strategies.js";

export async function runStrategy(strategy: Strategy, start: State, script: LabEvent[]): Promise<StrategyRun> {
  const started = Date.now();
  let state = clone(start);
  let base = clone(start);
  const steps: StepResult[] = [];
  const silent: string[] = [], pending: string[] = [];
  let breaksAt: string | undefined;

  for (let i = 0; i < script.length; i++) {
    const ev = script[i];
    ev.apply(state);
    const before = clone(state);
    const { state: synced, decisions } = await strategy.sync(state, base, ev.notes);
    state = synced;
    base = clone(state);

    if (ev.conflict) {
      const decided = decisions.some((d) => d.how !== "auto");
      const d = state.design.get("border-radius-medium"), c = state.code.get("border-radius-medium");
      if (!decided && d === c) silent.push(`${ev.id}: ${before.design.get("border-radius-medium") === d ? "code's" : "Figma's"} value overwritten without a decision`);
      for (const x of decisions) if (x.how === "ask-a-human") pending.push(`${x.token}: ${x.detail}`);
    }
    // every change so far must still hold: a later sync can undo an earlier one
    const lost = script.slice(0, i + 1).filter((e) => !e.conflict && !e.kept(state)).map((e) => e.id);
    // a conflict is handled when someone (agent or person) decided; agreeing by overwrite is not
    const conflictHandled = !ev.conflict || decisions.some((d) => d.how !== "auto");
    if (!breaksAt && (lost.length || silent.length)) breaksAt = ev.id;
    steps.push({
      event: ev.id, syncRate: syncRate(state),
      keptNow: ev.conflict ? conflictHandled : ev.kept(state),
      keptSoFar: script.slice(0, i + 1).filter((e) => (e.conflict ? e === ev ? conflictHandled : steps.find((x) => x.event === e.id)?.keptNow : e.kept(state))).length,
      lostSoFar: lost, silentOverwrites: [...silent], pendingHuman: [...pending], decisions,
    });
  }
  return { strategy: strategy.id, steps, breaksAt, ms: Date.now() - started };
}

export async function runLab(strategies: Strategy[], start: State, script: LabEvent[]): Promise<StrategyRun[]> {
  return Promise.all(strategies.map((s) => runStrategy(s, start, script)));
}
