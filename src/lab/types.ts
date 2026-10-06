import type { TokenMap } from "../tokens/load.js";

/** Both sides of the system at one point in time. */
export interface State { design: TokenMap; code: TokenMap }

export const clone = (s: State): State => ({ design: new Map(s.design), code: new Map(s.code) });

/** A real-world change made on one side (or both), plus what "the change survived" means. */
export interface LabEvent {
  id: string;
  title: string;
  who: "designer" | "engineer" | "both";
  apply(s: State): void;
  /** true when the intent of this change holds on BOTH sides */
  kept(s: State): boolean;
  /** both sides edited the same token: whoever wins, someone should have decided */
  conflict?: boolean;
  /** what people wrote when they made the change: Figma notes, commit messages */
  notes?: Record<string, string>;
}

export interface Decision { token: string; how: "auto" | "agent" | "ask-a-human"; detail: string }

export interface Strategy {
  id: string;
  name: string;
  description: string;
  /** brings the two sides together after a change; `base` is the last synced state */
  sync(current: State, base: State, notes?: Record<string, string>): Promise<{ state: State; decisions: Decision[] }>;
}

export interface StepResult {
  event: string;
  syncRate: number;
  /** did THIS step's change survive its own sync */
  keptNow: boolean;
  keptSoFar: number;
  lostSoFar: string[];
  silentOverwrites: string[];
  pendingHuman: string[];
  decisions: Decision[];
}

export interface StrategyRun { strategy: string; steps: StepResult[]; breaksAt?: string; ms: number }
