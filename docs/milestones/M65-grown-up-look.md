# M65, a grown up look

On 4 Nov 2026 the founder said the look is "too childish". He was shown a lab of three grown up looks and look A, Instrument, was chosen: like Raycast or Linear. A graphite page, hairlines, the Mac's own font, 13 point body words, a 17 point semibold headline, small corners, 28 point rectangle buttons, a short status line with a dot, and a small faceless glass orb with a thin ring whose colour says the state. Colour only where it means something. Friendly, the look from before, stays as a choice (memory: customizable everything).

This plan was written after the work, from what was built, so the milestone has one place that says what is done. Built items are ticked.

## Settings (step 1)

- [x] `look.style`: instrument (the usual) or friendly. A store from before M65 loads as instrument. Registry, strings, Look page, settings registry test.
- [x] `look.character`: match the look, glass orb, or friendly. The face, the bubbles and the water scene are friendly only.
- [x] Tokens for Instrument in `ui/tokens.css` for every theme (Graphite, Black, White, Deep), with contrast tests (4.5 to 1 for words, 3 to 1 for controls) in `instrument.test.ts`, `lookChoices.test.ts` and `a11y.test.ts`.
- [x] Parts: buttons, fields, tags, file rows, status line with its dot, footer line, segmented choices, the orb with its ring (`ui/parts.css`, `ui/parts.tsx`).

## Surfaces (step 2)

- [x] Home tall and wide, and the first run: status line, smaller headline, orb at the top right with no water, quiet ask field, footer line (`ui/home.css`, `homeHero.ts`).
- [x] Review and change cards: a changed file is a row with its tag and counts (`changeRows.ts`, `changesCard.tsx`).
- [x] History and Memory rows, Settings' list and rows, toasts, menus, confirm steps.
- [x] The dock character, the notch's wing and panel, the practice panel: the faceless orb under Instrument (`chromeLook.ts`, `ui/chrome.css`). The notch stays black.

## Fixes after three critics (step 4)

- [x] The orb has its own quiet body: one radial gradient (the lab's five stops for Ocean, the same steps from each water's deep colour), a shade at its foot, a fine dark rim. No rim ring, crescent, sparkles or big glint (`orbArt.ts glassOrbSvg`, `ORB_STOPS`).
- [x] Ring: 2 points, 2 points out from the orb; working is the focus colour (the accent's light step on dark pages, its deep step on White). A question waiting turns it amber (`characters.ts ringFor`).
- [x] Flat cards: no tinted glow, halo, wash or breathing rim in Instrument; neutral shadows.
- [x] Ask box: neutral edge at rest and in focus (Home focuses it on every open), brighter on hover and in focus.
- [x] Review: a stop says Fix this first in red (status line, ring, side list mark); the headline names the problem; shorter, non repeating words; passed checks under a stop are a plain chip; Keep it anyway on a stop; a copy icon.
- [x] Result card: what changed, then Undo; no fade over the card; the tall footer line comes last.
- [x] One title size; card titles at the card size; switcher and back arrow on the left edge; one selected style in both side lists; dividers inset on both sides; History mark and note aligned.
- [x] The notch's question card fits its panel; History's file names use the code font (both looks).
- [x] Dock: the word under the orb says Needs you while something waits; the count is amber.

## Not done, and why

- The notch's question copy ("Install something?", the raw command): the words come from the runner's safety rule, not the look. A plainer title and a Details disclosure belong in a runner change of their own.
- "Done" and "Something went wrong" under the dock character were not renamed to "Proven" and "Not fixed yet": a task that ended with no proof is not proven (rule 14), and a crash is not a failed check.
- "Undo is ready" stays in the footer line: the founder's lab look names it as part of that line.
- History's "Review" mark is a label, not a button, so it was not given a button's size.

## Tests

`cd app && bun run test` and `bun run typecheck`; `cd runner && bun test test/settings-registry.test.ts test/protocol.test.ts`. Page shots are made from the built pages with a stand in shell, in Graphite and White, plus one Friendly shot.
