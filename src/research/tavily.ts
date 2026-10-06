// Tavily: web search built for agents. The lab uses it when the repo alone can't settle a question,
// e.g. "is this drift between us, or are we both behind the design system's latest release?"

export interface WebResult { url: string; title: string; content: string }

export async function search(query: string, o: { max?: number; domains?: string[]; exclude?: string[]; depth?: "basic" | "advanced" } = {}): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY missing (.env)");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: o.max ?? 5, include_domains: o.domains, exclude_domains: o.exclude, search_depth: o.depth ?? "basic", include_raw_content: false }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const d: any = await res.json();
  return (d.results ?? []).map((r: any) => ({ url: r.url, title: r.title, content: r.content }));
}
