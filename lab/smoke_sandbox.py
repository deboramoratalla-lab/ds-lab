"""Smoke test: create a sandbox, make a checkpoint, fork it twice."""
import asyncio, os
from contree_sdk import Contree

async def main():
    sdk = Contree(token=os.environ["NEBIUS_API_KEY"])
    image = await sdk.images.use("ubuntu:latest")
    base = await image.run(shell="echo token=6px > /ds.txt && cat /ds.txt", disposable=False)
    print("base", base.uuid, base.stdout.strip())
    a, b = await asyncio.gather(
        base.run(shell="sed -i s/6px/5px/ /ds.txt && cat /ds.txt", disposable=False),
        base.run(shell="sed -i s/6px/8px/ /ds.txt && cat /ds.txt", disposable=False),
    )
    print("branch A", a.uuid, a.stdout.strip())
    print("branch B", b.uuid, b.stdout.strip())
    again = await base.run(shell="cat /ds.txt")
    print("base untouched:", again.stdout.strip())

asyncio.run(main())
