# Taste Profile: DS Lab Console

## Emotional target
Calm control. The design-system lead opens it and knows in two seconds whether the system is healthy and whether anything needs them. Nothing shouts unless it needs a person.

## References
| Reference | Borrow | Avoid |
|---|---|---|
| Apple (macOS System Settings, Health, Apple.com product pages) | Large titles, grouped inset lists, hairline separators, segmented controls, one ring for one number, translucent sidebar, system font | Skeuomorphic gloss, marketing-page heroes inside a tool |
| Sequence dashboard (user's ref) | Sidebar + top bar shell, status first | Heavy colored banner, many bordered cards |

## Aesthetic principles
1. **Neutral first, colour on purpose.** 90% greys and white; purple only on things you can act on, cyan only on progress, red/amber only on what's wrong. _Test: cover the coloured elements — are they exactly the actionable or stateful ones?_
2. **One number, big.** Each view leads with one figure set large; everything else is quiet. _Test: is there a single obvious first read?_
3. **Group, don't box.** Related rows live in one rounded group separated by hairlines, not in separate bordered cards. _Test: count borders; most should be gone._
4. **Type does the hierarchy.** System font, few weights, tight negative tracking on large sizes, secondary text in grey. _Test: works in greyscale._

## Craft standards
- Font: system stack (SF Pro on Apple devices).
- Radius: 10 controls, 14 groups, 999 pills.
- Separators: 0.5–1px hairlines at low contrast, inset from the left edge.
- Shadows: none in content; materials (blur) only on the sidebar.
- Whitespace: generous; 32px between sections.
- Motion: short ease-out (200ms), ring fills on state change; respects reduced motion.

## Palette (from the user's alias palette)
Navy = text and dark mode ground. Purple = actions/selection. Cyan = progress (darkest shade for text on white). Semantic red/amber separate.

Quality level: production for the hackathon demo.

## Update 2026-10-16 (user direction)
- Less "fake": real app chrome (breadcrumb, search, sync status, one avatar next to the greeting).
- Not too much gradient; no "AI-looking" circular diagrams. Straight or purposeful curves only.
- References: shadcn tabs (icon + label + count badge), Framer connection globe (arcs with travelling pulses) without the globe.
- Steps must read as a story: a playable 4-stage pipeline with outcome metrics, colour per stage, motion that explains (progress, pulses), not decorates.
- Technical feel: mono for figures, IDs and small labels.

## Recalibration 2026-10-16 (asked directly)
- Reference: **Vercel** (black/white, Geist + Geist Mono, hairline borders, grid backgrounds, status dots, deployment-style step logs).
- Feeling: **power and technology**: agents working, an engine running.
- Protagonist: **the agent at work**: the live flow/map is the centrepiece.
- Anti-reference: **generic template dashboard** (rows of KPI cards).
- Principles: one canvas, not cards; say each thing once; numbers live inside sentences and logs; colour only for status; motion shows work being done.

## Persona-led direction 2026-10-16 (replaces Vercel/Apple copies)
Persona: design-system lead who lives in Figma and GitHub, opens the console when notified or before a release.
- Show the real thing: every decision draws the component with each value (Primer Button on a dotted stage, like a Figma frame).
- Workbench look: neutral canvas, 1px borders, Inter + JetBrains Mono; colour belongs to tokens and components; one accent of our own (purple).
- Order: what needs me (with previews) → the agent at work → what it changed (before/after) → checks.
