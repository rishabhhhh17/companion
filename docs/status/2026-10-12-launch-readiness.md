# Launch readiness, 12 Oct 2026

Refreshes `2026-10-09-launch-readiness.md` (which still holds the full table for everything built before M10). Same columns: **Built** = code exists and tests pass (runner 1287, Rust shell 197 plus 2 ignored, pages 208, all passing). **Real Claude** = also checked with a real Claude run on the test login. **Person tried** = the founder used it on a real Mac. **Confidence** = how sure I am it works on other people's Macs today. Nothing in this table has been tried by a person yet.

## M10, the friends preview (12 items; hero in `docs/decisions/F16-rescue-tutor-is-the-launch-hero.md`)

| # | Part | Built | Real check | Person tried | Confidence | Left or weak |
|---|---|---|---|---|---|---|
| 1 | Point at the problem (Ctrl+Opt+Cmd+F) | Yes | 280 of 280 drawn editor screens, 0 wrong places, about 1.3 s; real tool output (TypeScript, Vite, Vitest, ESLint, Node, Bun, Python) | No | Medium | Real Cursor link, real screen read and Screen Recording untried |
| 2 | Visual receipt and it's live card | Yes | Real Claude run passed, picture 0.8 s after the receipt; Vite and React by hand | No | Medium | Next.js and other kinds of project; the card against a real Vercel deploy |
| 3 | Your turn and Do it for me | Yes | Click detection verified on this Mac with a no permission test app | No | Medium | The whole loop in the built app; Do it for me on real sites |
| 4 | Draw it for me | **About 70 percent, on the parked branch `m10/draw-it`** | A real diagram request failed because of the fast lane issue (see the M10 plan) | n/a | n/a | Fast lane fix first, then the hand drawn style and the draw or circle to ask part |
| 5 | Reactions and celebration | Yes | n/a | No | Medium | How it looks and feels |
| 6 | One real character | **Parked** | n/a | n/a | n/a | The founder is supplying the designs |
| 6b | Sample stuck moment in the first run (also the demo set) | No | n/a | n/a | n/a | About 2 days |
| 7 | Open a Lovable, Bolt or Replit project | Yes | Nine real public exports read (read only) and a real copy from GitHub | No | Medium-high | Installing and running a real export end to end |
| 8 | Walkthrough engine, anywhere mode, lesson packs, settings guidance (F17) | No | n/a | n/a | n/a | About 40 working days; needs the founder's accounts and sessions |
| 9 | Prompt help with a visual diff | Moved out of the friends preview (F17) | n/a | n/a | n/a | After the beta |
| 10 | "Why did it ignore my rule?" | No | n/a | n/a | n/a | About 2 days |
| 11 | Beta measurement | No | n/a | n/a | n/a | About 2 to 3 days |

**Explain (M8b)** is built and has a defect found 12 Oct: it is asked to improve a prompt, so its answer can be about the prompt (1 of 4 real runs). Fix first, 0.5 day. **Remaining in the plan (updated by F17, see the M10 plan):** six items (4, 6b, 8, 9, 10, 11), about 3 weeks of the plan's own estimate, less in calendar time at the pace of items 1 to 7 (3 days for about 3 weeks of estimate). The real gate is the hands on session.

## Overall (same three measures as 9 Oct)

| Measure | 9 Oct | 12 Oct | Why |
|---|---|---|---|
| Features written and tested by machine | about 85% | about 85% | The denominator grew with the new plan (12 more items); about 5 of those are done |
| Also tried by a person on a real Mac | about 40% | about 25% | New features are all untried; nothing tried since 9 Oct |
| Ready to hand to a stranger | about 50% | about 45% | Same launch gaps, now measured against a bigger product |

These are judgement calls, not measurements; the second row moves only when the hands on session happens.

## Launch gaps outside M10

Settings screen, privacy page with delete everything, crash and log export, acknowledgements page, the updater (mine). Website, billing, Apple enrolment, privacy policy, terms, where feedback goes, Anthropic's written word on plan sign in (the founder's).

## Still open with the founder

Whether the in memory drive satisfies rule 5 (T12); a product name that is not "Companion"; the Mania link; a Supabase test project and a second hands on session for items 8 and 9; the character designs.

## What changed in the source files today

`AGENTS.md` (product paragraph, the job table, rules 5 and 8 now say what the new code does), new `F16` decision record, this table.
