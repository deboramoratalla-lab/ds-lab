// Vercel function: "Send answers" → runs the apply-decisions workflow, which pushes the lead's answers to the open ds-sync PR.
const ok = (s) => /^[\w.,=|-]{1,400}$/.test(s);
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const TOKEN = process.env.GH_DISPATCH_TOKEN, REPO = process.env.GITHUB_REPO || "deboramoratalla-lab/ds-lab";
  if (!TOKEN) return res.status(503).json({ error: "Sending answers is not configured on this server." });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const decide = String(b.decide || ""), approve = String(b.approve || ""), override = String(b.override || ""), reason = String(b.reason || "").trim();
  if (override && (!ok(override) || !/^[\w\s.,;:'()\/-]{3,200}$/.test(reason))) return res.status(400).json({ error: "an override needs a reason (3–200 plain characters)" });
  if ((decide && !ok(decide)) || (approve && !ok(approve)) || (!decide && !approve && !override)) return res.status(400).json({ error: "nothing valid to apply" });
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/apply-decisions.yml/dispatches`, {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json", "user-agent": "seamline" },
    body: JSON.stringify({ ref: "main", inputs: { decide, approve, override, reason: override ? reason : "" } }) });
  if (r.status !== 204) return res.status(502).json({ error: `GitHub said ${r.status}` });
  res.status(202).json({ ok: true, runs: `https://github.com/${REPO}/actions/workflows/apply-decisions.yml` });
}
