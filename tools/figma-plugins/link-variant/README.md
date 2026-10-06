# DS Lab Figma dev plugin: Button link variant

Runs inside Figma desktop (uses the designer's local fonts, which the cloud Plugin API runtime doesn't have).
Import with Plugins > Development > Import plugin from manifest. Idempotent: creates missing `variant=link`
variants from `invisible`, moves loose ones into the set, binds label text to `fgColor/link`
(disabled state keeps its own color), and records its result in `figma.root` shared plugin data
(`dslab` / `result`) so the agent can read it back.
