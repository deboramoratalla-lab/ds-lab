// Seamline console server: serves the console and turns "Send answers" into a real GitHub Actions run
// (apply-decisions.yml), which pushes the decisions to the open ds-sync PR and re-runs the ds-sync check.
// Runs on Nebius Serverless Endpoints (see .github/workflows/deploy-nebius.yml). No dependencies.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT || 8000);
const REPO = process.env.GITHUB_REPO || "deboramoratalla-lab/ds-lab";
const TOKEN = process.env.GH_DISPATCH_TOKEN || "";
const html = readFileSync(new URL("../console/index.html", import.meta.url));

const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const ok = (s) => /^[\w.,=|-]{1,400}$/.test(s);

createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) return send(res, 200, html, "text/html; charset=utf-8");
  if (req.method === "GET" && req.url === "/api/health") return send(res, 200, { ok: true, decisions: !!TOKEN, repo: REPO });
  if (req.method === "POST" && req.url === "/api/decide") {
    if (!TOKEN) return send(res, 503, { error: "Sending answers is not configured on this server." });
    let raw = ""; for await (const c of req) { raw += c; if (raw.length > 4000) return send(res, 413, { error: "too large" }); }
    let b; try { b = JSON.parse(raw); } catch { return send(res, 400, { error: "bad json" }); }
    const decide = String(b.decide || ""), approve = String(b.approve || "");
    if ((decide && !ok(decide)) || (approve && !ok(approve)) || (!decide && !approve)) return send(res, 400, { error: "nothing valid to apply" });
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/apply-decisions.yml/dispatches`, {
      method: "POST", headers: { authorization: `Bearer ${TOKEN}`, accept: "application/vnd.github+json", "user-agent": "seamline" },
      body: JSON.stringify({ ref: "main", inputs: { decide, approve } }) });
    if (r.status !== 204) return send(res, 502, { error: `GitHub said ${r.status}` });
    return send(res, 202, { ok: true, runs: `https://github.com/${REPO}/actions/workflows/apply-decisions.yml` });
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`Seamline console on :${PORT}`));
