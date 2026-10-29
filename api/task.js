// Vercel function: a "Missing somewhere" answer from the console → runs the gap-task workflow, which opens a GitHub issue
// for the chosen owner (Create) or records the gap as not needed (a closed issue), so it isn't asked again.
const okName = (s) => /^[A-Za-z][\w.-]{0,60}$/.test(s), WHERE = ["Figma", "Storybook", "Docs"];
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const TOKEN = process.env.GH_DISPATCH_TOKEN, REPO = process.env.GITHUB_REPO || "deboramoratalla-lab/ds-lab";
  if (!TOKEN) return res.status(503).json({ error: "Creating tasks is not configured on this server." });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const component = String(b.component || ""), where = String(b.where || ""), action = String(b.action || ""), owner = String(b.owner || "");
  if (!okName(component) || !WHERE.includes(where) || !["create", "skip"].includes(action) || (owner && !/^[a-z]{1,20}$/.test(owner))) return res.status(400).json({ error: "invalid task" });
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/gap-task.yml/dispatches`, {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json", "user-agent": "seamline" },
    body: JSON.stringify({ ref: "main", inputs: { component, where, action, owner } }) });
  if (r.status !== 204) return res.status(502).json({ error: `GitHub said ${r.status}` });
  res.status(202).json({ ok: true, issues: `https://github.com/${REPO}/issues?q=label%3Aseamline-gap` });
}
