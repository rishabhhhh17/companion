# M71: Black with colour, and one structure for every screen

Status: approved by the founder, 5 Nov 2026: "I don't want to have more complications with the flipping design. It needs to be done well. Just make it simple, good, and useful, with a little bit of fun here and there, and immersive. That's it. I don't want to do this again and again." So: one look, built once, checked against the mock and on the real Mac before it is called done.

## Why

The founder, 5 Nov 2026, looking at Home opened from the notch in their own look (Friendly, Vivid, Deep): "the notch looks so bad", "these colors don't look good, it feels so random", "I need it to be black with accents of different color", "look at how well structured fanout.sh is, why can't we get a good structure on our tool".

What is wrong today, seen in the founder's screenshots:
1. A patchwork. Home grows out of the notch as a black shape, and then each theme paints its own colours inside it: navy panels, a grey sidebar, purple cards, a blue water band. The black frame and the blocks inside it do not match. This happens in every look, not only the founder's.
2. Too many knobs make the colours. Thirteen look settings (style, theme, water, colour, gloss, light, corners, icons, stamps, density, character, layout, size) multiply into combinations nobody designed. Places also tint themselves by "element" (data-element), so each page gets its own background.
3. No shared structure. Each page is laid out its own way: a hero here, cards inside cards there, a list somewhere else.
4. Wrong or missing words: "NEEDS YOU" on a practice that is only waiting; key symbols with no words; a large empty gap in the middle of Now.

## What fanout.sh does that we will copy (ideas only, no code)

- One neutral base, and colour that belongs to a category. Every track has its own colour, all at the same softness, so many colours read as one family, not random.
- One template, repeated. Every section is the same shape: a small eyebrow, a bold heading, then items that all have the same parts (a picture or tile, a title, three short lines, a small line of facts, one action).
- Strong type hierarchy: one big tight headline, plain body text, small mono facts.
- Lots of space, one column of content, few places in the top bar.

## The colour system

Pure black like the notch. Colour never paints a surface; it marks meaning.

Surfaces, only three:
| Token | Value | Use |
|---|---|---|
| `--surface-0` | #000000 | Home, the hover panel, the notch |
| `--surface-1` | #121214 | cards and grouped lists |
| `--surface-2` | #1A1A1D | a raised item, hover, secondary buttons, chips |
| `--edge` | rgba(255,255,255,.09) | hairlines between rows, the panel edge |

Words: `--fg` #F5F5F7, `--fg-2` #A1A1A8 (7:1 on surface-1), `--fg-3` #6E6E73 for marks only, never for words.

Colours, one job each (Apple's dark mode colours, made to sit together on black):
| Colour | Value | Job |
|---|---|---|
| Blue | #0A84FF | actions, the main button, Now, the ask box's send |
| Purple | #BF5AF2 | Learn, practices, lessons |
| Orange | #FF9F0A | History, and "take a look" (changes to review) |
| Pink | #FF375F | Memory |
| Green | #30D158 | proven, passed, a working project |
| Red | #FF453A | a real problem: a failed check, a key in the code |
| Teal | #64D2FF | voice and listening, info |
| Grey | #8E8E93 | Settings, neutral rows |

Each colour has three forms, made in tokens.css only:
- solid: tiles, dots, the main button;
- soft: the colour at 18% on black, for the place you are on and for tags;
- text: the colour mixed with white, for small words on black (4.5 to 1 checked in a test).

Rules (a lint checks them): no gradient anywhere except the character's own art; no glow or halo; colour never fills a surface bigger than a tile, a tag, a button or a featured card tint; no card inside a card.

The one exception, from fanout: a featured card (the practice at the top of Learn, the result at the top of Now) may take a very dark tint of its colour (about 12% on surface-1), so it reads as that colour's card without becoming a coloured block.

## One structure for every screen

Every place is built from the same five parts, in this order:

1. The bar: the project chip (its dot is the project's state colour: green working, orange changed, red failing, grey not checked), one line of context, and close.
2. The places: Now, Learn, History, Memory, each with its own colour tile (blue, purple, orange, pink). Settings is a gear on the right of the bar, grey.
3. The lead: one status tag in its meaning colour, one headline (22 pt, tight), one line under it, then one main button and at most one quiet button. The character sits to the right of the lead, never over words.
4. The list: a grouped list (the Mac's own Settings style): rows with a colour tile, a title, one line, and one fact or action on the right. Never more than one list per screen. An empty list says what will appear there and offers one action.
5. The ask box, pinned at the bottom of Now only.

Each place:
| Place | Lead | List |
|---|---|---|
| Now | the one thing that matters now (a result, a problem, changes to review, a practice ready, or "Ready when you are") | Since then: up to three rows (last check, changes to review, a problem), each with its action |
| Learn | the next practice, as a featured card in purple | all practices, each with its own tile colour, time and one line |
| History | "What Squibby did", with a count | one row per task: tile by result (green proven, red failed, grey stopped, orange undone), when, files changed |
| Memory | "What Squibby knows about this project" | one row per note with its source; Forget on the right |
| Settings | the Mac's Settings layout: a side list with grey and coloured tiles per section, rows on the right | rows with one control each |

The hover panel uses the same parts in small: the greeting and project, one fact with its colour dot, and up to three buttons, each with its colour tile.

## What happens to the look settings

The look becomes: Colour (Colourful, the usual; or Calm, which keeps the same structure with blue as the only colour), Character (Visor, Orb, Water), Layout (Wide, Tall), and Text size.

Theme, Water, Gloss, Light, Corners, Icons, Stamps and Style leave the Look page. Their stored values still load and are ignored, so nothing saved breaks (rule: a stored setting always loads). The Friendly style's water room (the sea, waves and glows) is retired; the water character stays as a Character choice. White and the other themes are retired for Home, because Home is the notch grown down and the notch is black.

This changes earlier records: F27 and the M51, M65 and M69 look choices, and the "customizable everything" note. The founder asked for it on 5 Nov 2026; recorded as an update in docs/decisions.

## How it is built

Tests first for the logic:
- `app/src/meaning.ts` (new, pure): turns every state into its meaning (state, result kind, practice, review, problem) and its colour name. Every tag, dot and tile reads from it, so the same news always has the same colour. Tests: each state maps to one meaning; no state is unmapped.
- Contrast tests: each colour's text form on surface-0 and surface-1 at 4.5 to 1; solid tiles with white marks at 3 to 1.
- Style lint (ui/styleLint.test.ts): no gradient outside the character art files; no `[data-element]` colour rules; no card inside a card; no colour value outside tokens.css.
- Settings: the retired keys still load; the Look page shows only the four.

Then the parts, in `app/src/ui/parts.tsx` and `parts.css`:
- `Tile` (colour, icon), `Tag` (meaning), `Group` and `Row` (the grouped list), `Lead` (tag, headline, line, buttons, character slot), `EmptyRow`. Every page is made from these, so the structure is the same everywhere.

Then the pages, one at a time, each checked with screenshots against the mock (docs/design/2026-11-05-black-with-colour/): Now, the hover panel, Learn, History, Memory, Settings, and the first run.

Then the clean up: remove the data-element tints, the sea and the glows from tokens.css, look.css and style.css; remove the retired knobs from settingsPages.ts; fix the practice's tag ("Practice ready", purple, not NEEDS YOU), the bare key symbols (words, or hidden in tall), the empty gap in Now (the list fills it), and the corners (always round at the bottom).

Cost: one builder on Opus for the parts and the logic, Sonnet for the page by page screenshots and checks.

## Done means

- Screenshots of Now, the hover panel, Learn, History, Memory and Settings, wide and tall, match the mock's structure and colours.
- Every suite green; the contrast, meaning and style lint tests pass.
- The founder's own Mac: open Home from the notch, walk the five places, and say it looks right.
