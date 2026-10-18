// Vercel function: lets the console know whether "Send answers" is wired up.
export default function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.status(200).json({ ok: true, decisions: !!process.env.GH_DISPATCH_TOKEN, repo: process.env.GITHUB_REPO || "deboramoratalla-lab/ds-lab" });
}
