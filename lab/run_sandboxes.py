"""Run the strategy lab on Nebius Token Factory Sandboxes.

1. Import node:22-slim, upload the bundled lab + the certified Primer fixtures.
2. Run `prepare` once: certified system + the 5 changes -> a saved checkpoint ("broken").
3. Fork that checkpoint 4 times, in parallel: one sandbox per strategy, same starting state.
Writes console/lab-sandbox.json.
"""
import asyncio, glob, json, os, time
from contree_sdk import Contree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = "fixtures/package/dist/css"
PATTERNS = [f"{D}/functional/themes/light.css", f"{D}/functional/size/**/*", f"{D}/functional/typography/**/*", f"{D}/base/**/*",
            "fixtures/primer-web-figma/*.json", "fixtures/primer-web-notes/button-snapshot.json", "fixtures/primer-storybook/*",
            "fixtures/primer-react/package/generated/components.json", "fixtures/primer-react/package/dist/Button/ButtonBase-*.css"]
STRATEGIES = ["manual", "figma-first", "code-first", "agent"]

async def main():
    sdk = Contree()
    files = {"/work/lab.mjs": os.path.join(ROOT, "out/sandbox/lab.mjs")}
    for p in PATTERNS:
        for f in glob.glob(os.path.join(ROOT, p), recursive=True):
            if os.path.isfile(f): files["/work/" + os.path.relpath(f, ROOT)] = f
    t0 = time.time()
    node = await sdk.images.oci("docker.io/library/node:22-slim", timeout=600)
    image = await node.apply_files(files=files)
    env = {k: os.environ[k] for k in ["NEBIUS_API_KEY"]}
    broken = await image.run(shell="node lab.mjs prepare out/w", cwd="/work", disposable=False, env=env, timeout=300)
    if broken.exit_code: raise SystemExit(broken.stderr)
    prepared = json.loads(broken.stdout.strip().splitlines()[-1])
    print("checkpoint", broken.uuid, prepared["broken"])

    async def fork(s):
        t = time.time()
        r = await broken.run(shell=f"node lab.mjs run {s} out/w", cwd="/work", disposable=False, env=env, timeout=600)
        out = json.loads(r.stdout.strip().splitlines()[-1]) if r.exit_code == 0 else {"strategy": s, "error": r.stderr[-800:]}
        out["sandbox"] = str(r.uuid); out["wall_s"] = round(time.time() - t, 1)
        print(s, out.get("keptCount"), out.get("passed"), "/", out.get("total"), out["wall_s"], "s", r.uuid)
        return out

    runs = await asyncio.gather(*(fork(s) for s in STRATEGIES))
    result = {"ranAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "where": "Nebius Token Factory Sandboxes", "image": "node:22-slim",
              "checkpoint": str(broken.uuid), "broken": prepared["broken"], "files": len(files), "total_s": round(time.time() - t0, 1), "runs": runs}
    with open(os.path.join(ROOT, "console/lab-sandbox.json"), "w") as f: json.dump(result, f, indent=1)
    print("total", result["total_s"], "s")

asyncio.run(main())
