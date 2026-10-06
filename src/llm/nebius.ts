// Thin client for Nebius Token Factory (OpenAI-compatible) with per-model usage tracking.
// Model roles follow the hackathon brief: Nano for fast, frequent calls; Super for building;
// Ultra for the few decisions that need serious reasoning.

export const MODELS = {
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
} as const;
export type Role = keyof typeof MODELS;

const BASE_URL = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1";

export interface Usage { calls: number; prompt: number; completion: number; ms: number }
export const usage: Record<string, Usage> = {};

export interface ChatOptions {
  role: Role;
  system?: string;
  user: string;
  /** Reasoning on/off. Off makes Nano fast and cheap for mechanical tasks. */
  think?: boolean;
  json?: boolean;
  maxTokens?: number;
}

export async function chat(o: ChatOptions): Promise<string> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set (see .env.example)");
  const model = MODELS[o.role];
  const body: Record<string, unknown> = {
    model,
    max_tokens: o.maxTokens ?? (o.think ? 4000 : 1500),
    messages: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: o.user }],
    chat_template_kwargs: { enable_thinking: o.think ?? false },
  };
  if (o.json) body.response_format = { type: "json_object" };

  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    }
    const data: any = await res.json();
    if (!res.ok || data.error) throw new Error(`${model}: ${res.status} ${JSON.stringify(data.error ?? data).slice(0, 300)}`);
    const u = (usage[model] ??= { calls: 0, prompt: 0, completion: 0, ms: 0 });
    u.calls++;
    u.prompt += data.usage?.prompt_tokens ?? 0;
    u.completion += data.usage?.completion_tokens ?? 0;
    u.ms += Date.now() - started;
    return (data.choices?.[0]?.message?.content ?? "").trim();
  }
}

/** Parse a JSON answer, tolerating code fences or text around it. */
export function parseJson<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error(`No JSON in model output: ${text.slice(0, 200)}`);
  return JSON.parse(m[0]) as T;
}
