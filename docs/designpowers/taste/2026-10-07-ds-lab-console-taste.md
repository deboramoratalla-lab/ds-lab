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
