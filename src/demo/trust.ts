// Escalation rule from the persona: after 3 rejections in a row of the same kind of change,
// the agent stops applying that kind alone and sends it to a person. Approving one resets the streak.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export const STREAK_LIMIT = 3;
const file = () => process.env.DS_LAB_TRUST ?? "state/trust.json";
type Trust = Record<string, number>;
const read = (): Trust => (existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : {});
const write = (t: Trust) => { mkdirSync(dirname(file()), { recursive: true }); writeFileSync(file(), JSON.stringify(t, null, 1)); };
export const kindOf = (who: string, type?: string) => `${who}:${type ?? "none"}`;
export function recordAnswer(kind: string, answer: "approve" | "reject") { const t = read(); t[kind] = answer === "reject" ? (t[kind] ?? 0) + 1 : 0; write(t); return t[kind]; }
export function paused(kind: string) { return (read()[kind] ?? 0) >= STREAK_LIMIT; }
export const LABEL: Record<string, string> = { "nano:rename": "renames", "ultra:set-figma": "Figma value updates", "ultra:set-code": "code value updates" };
