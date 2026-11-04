# M68, the Visor

On 4 Nov 2026 the founder picked option B, "Visor", from the characters lab (`workflows/review-2026-11-04/characters-lab.html`). It becomes the character that goes with Instrument. A glass orb with a dark band across the middle and light behind the band. Its personality is in the lights and in small moves only: no mouth, no bubbles, no water, no new art beyond this.

The glass orb (M65) and the friendly character stay as choices. The coloured ring outside the orb stays exactly as M65 built it.

## What is there at HEAD (checked)

- `lookfeel.ts characterOf(style, character)` gives `"orb" | "friendly"`. Match under Instrument is the orb.
- `characters.ts ringOf` and `ringFor(state, waiting)` give the ring: stop, needs, proven, working, or none. `chromeLook.ts miniShows`, `dockShows`, `orbMotion` and `dockWords` choose orb or friendly for the small places.
- `ui/parts.tsx Orb` is a `<span class="ui-orb" data-ring>` around an `<img>` of `orbArt.ts glassOrbSvg(water)`. The ring is a steady CSS outline in a meaning colour. **It does not sweep.** The lab's working ring sweeps (a 60 on 200 dash turning in 1.4 s), but the task also says the ring stays as M65 built it, so M68 keeps the steady ring. Adding the sweep is a separate one line choice for the founder.
- States (`model.ts CharacterState`): off, idle, listening, thinking, working, checking, needsYou, done, error. `lookState` already draws a done that is not proven as idle, so done always means proven here.
- Voice level: the shell reads a peak level (`voice_mac.rs level()`, 0 to 1, a number only) and sends it every 40 ms while the keys are held, as `follow-voice`, **to the follow window only** (`main.rs` around line 4613). The dock, Home (card window) and the notch never get it. `follow.ts voiceEnvelope` already smooths it (fast up, gentle down).
- Motion tokens exist (M66, `motionTokens.ts`, `ui/tokens.css`). `ui/motionLint.test.ts` wants every time and curve in a stylesheet to be a token, and only transform and opacity to move.

## Which component draws it

- New art file `app/src/visorArt.ts`: the lab's geometry and the lab's `#glass` gradient stops, as data (the art exception, like `orbArt.ts`). No other colours there.
- New part `Visor` in `ui/parts.tsx`, beside `Orb`. Same outer `<span class="ui-orb" data-ring>` so the M65 ring is untouched. Inside, an inline SVG (not an `<img>`, so each light can move by CSS): the glass circle, the band, and one group per pose. Each gradient id comes from `useId`, so several visors on one page never clash (the notch panel shows one per job).
- Its CSS in `ui/parts.css`, its colours and timings as tokens in `ui/tokens.css`: `--visor-band` rgba(6,10,24,.78), `--visor-light` #9CC8FF, `--visor-glow` rgba(130,190,255,.9), and the amber and red lights from the existing ring tokens (`--ring-needs`, `--ring-stop`) so they always match the ring.
- A pure function `visorPose(state, ring)` in `characters.ts`, from the same ring the orb shows. So the lights and the ring always agree (a question waiting gives amber lights even while it works).
- SVG and CSS only, transform and opacity only. Never WebGL, so it costs nothing to show and never freezes on open.

## Geometry (lab units, viewBox trimmed to the glass: 12 12 76 76)

| Part | Lab value |
|---|---|
| Glass | circle at 50,50, r 38, fill the lab's `#glass`: radial, cx 36%, cy 30%, r 75%, stops #E6F0FF at 0, #8DB6FF at .18, #2F64D6 at .55, #0F2558 at 1 |
| Band | rect x 20, y 40, 60 by 18, rx 9, `--visor-band` |
| Rest lights | two rects 8 by 6, rx 3, at x 36 and x 56, y 46 |
| Scan bar | rect x 40, y 47, 20 by 4, rx 2 |
| Needs you lights | two rects 9 by 10, rx 4.5, at x 35 and x 56, y 44 |
| Smile | path `M36 46 q14 9 28 0`, stroke 3.2, round caps, no fill |
| Light glow | drop shadow 0 0 3 in `--visor-glow`, static, never animated |

The glass is the lab's fixed blue. It does not follow the water choice in M68 (the calm colour rule: one blue accent).

## State to pose

| State (ring) | Pose | Motion |
|---|---|---|
| idle (none) | two small rest lights | blink every 4.6 s; now and then a glance |
| off (none) | band with no light | none |
| thinking, working, checking (working) | one scan bar | scans side to side |
| listening (working) | small level meter in the band | follows the voice level, or a gentle pulse |
| needsYou, or anything with something waiting (needs) | two taller amber lights | a slight lean |
| error (stop) | the two rest lights in red | none (no blink) |
| done, proven (proven) | the light curves into a smile | one small hop, once |

## Motion values (from the lab, as tokens)

- **Blink:** 4.6 s loop, scaleY 1 to 0.1 at 96%, back at 100% (lab keyframes 93, 96, 100). Origin the centre of the lights. Built (step 3): three blinks, then still; a glance or coming back to rest arms three more.
- **Glance:** the lights move 3 units toward the new thing and 1 up, on `--ease-loop`: 0.6 s there, 1.2 s held, 0.6 s back (the lab's 6 s glance cut to one go). It fires on a new card or question: in Home toward the card it leans to (`leanTo`, M55) or the ask box while typing (`askId`); on the dock toward the side its card opens. Only with Reactions on (`character.reacts`), at most once every 8 s.
- **Scan:** translateX from -14 to 14 units, 1.3 s each way, ease in out, alternate, looping.
- **Level meter:** three short bars in the band, scaleY from the level (3 to 13 px at Home size, M66's meter numbers). Until a level reaches the page it is a gentle pulse: scaleY 0.4 to 1, 1.2 s each way on `--ease-loop`. The page never reads audio.
- **Lean:** rotate -5 degrees and up 1 unit at the middle of a 2.6 s move, around 50,90. Built (step 3): it plays twice on arriving at needs you, then holds upright. It turns the whole part (`.ui-visor`), so the ring leans with the glass as in the lab.
- **Hop:** once on entering done, 840 ms (the lab's last 30% of 2.8 s): up 4 units with scale 1.02 by 0.98, down with 0.98 by 1.02, then still. Never looped in the app. Only with Reactions on. Built (step 3): the whole part hops (up 5.3% of its size, squashing on its foot), so the ring rides along.
- **How lively (`character.lively`):** Still: no blink, no glance. Gentle: blink. Lively: blink and glance. The scan, meter, lean and hop say the state, so they follow motion settings only.
- **Rest** (`useRest`: a call, Low Power Mode) and `still` (a panel not on screen): every loop paused on its pose.
- **Reduce motion and Less motion:** no scan, meter, blink, glance, lean or hop. Only the still pose per state (the scan bar sits in the middle, the meter bars at half).

## Where it shows, and at what size

| Place | Code | Size |
|---|---|---|
| Home hero | `homeCharacter.tsx` (card window) | `--orb` 40 px |
| Settings Look hero | `settingsPage.tsx` via `HomeCharacter` | 40 px |
| First run | `onboarding.tsx` and `firstLook.tsx` via `HomeCharacter` | 40 px |
| Dock on the screen edge | `dock.tsx` | `--orb-edge` 56 px |
| Notch panel, one per job | `islandPanel.tsx` via `FlowMini` | `--orb-panel` 24 px, full orb, blink and scan, no glance or hop |
| Notch wing | `island.tsx` via `FlowMini` | the band alone, new token `--visor-notch` 34 px wide (10 px tall; 20 px read as a dash at shot review): lights and the scan only |
| Practice peek on a card | `card.tsx`, `practicePanel.tsx` via `FlowMini` | `--orb` 40 px |
| About icon in Settings | `settingsPage.tsx` via `FlowMini still` | still pose |

Toasts show no character today; M68 adds none. The How lively tiles keep their friendly pictures (`pose` prop), as today.

## The setting

- `look.character` options become match, visor, orb, friendly (`protocol/settings.json`, default still match).
- `characterOf`: visor and orb picked stay as picked; match under Instrument is visor, under Friendly is friendly. `CharacterLook` becomes `"visor" | "orb" | "friendly"`. A stored `orb` still loads as the orb. A store from before M65 (no style, no character) now shows the visor, the new usual.
- `chromeLook.ts`: `miniShows` and `dockShows` return `visor`; `orbMotion` and `dockWords` treat visor like the orb (no cartoon moves, Needs you words). CSS rules that say `[data-character="orb"]` (7 of them) take visor too.
- Strings (`strings.ts`): option "Visor"; the Look summary and the help say what it is in plain words ("A glass orb with a band of light. The light blinks, scans while it works, turns amber when it needs you and smiles when a fix is proven."). `settingsPages.ts` keeps `look.character` where it is.

## Voice level

M68 ships the gentle pulse, because no level reaches the dock, Home or the notch. A small later change in the shell can send the same `follow-voice` number to those windows too (same 40 ms, only while the keys are held, a number only), and the meter then uses `voiceEnvelope`. That is left out so M68 does not touch Rust.

## Tests to write first

1. `characterOf`: match plus instrument is visor; visor, orb, friendly picked stay; odd values and an empty store give visor; friendly style gives friendly.
2. `visorPose`: every state and every ring to its pose, as the table; waiting more than zero gives amber lights; error is red; done is the smile; off is dark.
3. Geometry pinned to the lab numbers above, and every light inside the band.
4. Settings: registry options in `protocol/settings.json`, strings option words, `instrument.test.ts` and `homeInstrument.test.ts` updated, runner `settings-registry.test.ts`, protocol tests.
5. `miniShows`, `dockShows`, `orbMotion`, `dockWords` with visor.
6. CSS: every visor time is a token, only transform and opacity move, the glow is never animated, reduced motion and Less motion stop every visor loop, the hop has no `infinite` (motion lint).
7. Colours: none outside `ui/tokens.css` and `visorArt.ts`; amber and red lights use the ring tokens.
8. No WebGL import in the visor path; the visor mounts no canvas.
9. Shots at 2x: Home, dock, notch wing, notch panel and first run in rest, working, listening, needs you, error and proven; plus reduced motion.

## Step 2b, the notch has presence

The founder, 4 Nov 2026: "there is still no notch like how HeyClicky has, like hey Rishabh or something, that is still a bummer". At rest the island was exactly the hardware notch, so the product looked absent.

**What was built (pages only, no Rust change).**

- `notchHello.ts` holds every decision, tested first in `notchHello.test.ts`: `restWings` (what the wings show at rest), `helloDue` (when the hello may show), `helloFact` and `helloLine` (its words), `wokeAfter` (a wake, from a timer that fired a minute or more late), `cleanName` and `lastHelloFrom`.
- **Wings at rest.** On a real notch only (a pill or the edge line stays as it was, so no menu titles are covered), with `island.wings` on (the usual), the page tells the app the wings are out (`island_alert` `on`), so the window is the notch plus a wing each side (island.rs Alert, within WING to WING_MAX) and the black shape grows into it on the notch springs. Left: the Visor's band, its lights blinking, glancing once toward a new word. Right: one short count ("3 changes", the review card waiting) or the green tick while the project's last check is proven and unchanged; nothing when there is nothing. Work, a question, listening, looking at the screen and a fresh result keep the live wings (`home.ts islandWings`) exactly as before. The right wing is measured, so it is as wide as its word needs.
- **The hello.** On start (after the settings are ready plus 1.5 s), on a wake, and on coming back after more than an hour with the page hidden, the page asks the app for the panel under the wings (`ask`) for 3 s, and the panel shows the character and one line: "Hey <name>" (or "Hi there") and at most one fact: questions waiting, then changes to review, then a problem the last check found, then "Everything checked is fine". At most once an hour (the time is kept in the island page's own storage, a number only). Only on a real notch (never the pill or the edge line). Never with `island.hello` off, never while the island page is hidden, never over Home, never over a question or a result that already has the panel, and never while the shell's presentation check says a call app is in front (`quiet_now`, rule 7, asked at that moment; an unanswered check counts as quiet). That check sees only which app is in front, so a screen share from a call app behind another app is not noticed; Hide from screen sharing (`sharing.hide`) is what keeps the panel out of the shared picture, and the help says so. One try at a time (`helloGate`): the time of a decided hello is kept in memory at once, and written to storage once the panel has opened. The wake tick is skipped while the page is hidden (WebKit slows hidden timers), and its clock restarts on coming back. The app itself also never opens that panel while quiet or hidden (island.rs `mode`). No sound, no focus (rule 9).
- **The name.** `you.name` (text, empty, at most 24, scope app, Account page "You" group) and an optional "What should I call you?" field on the first run's Make it yours. Settings' label is "Your name", since Settings' labels carry no pronoun (the spec, 3.11). The Mac's account name is never read.
- `island.wings` and `island.hello` are switches, on by default, in More options, Notch. The hidden `panel.showHello` is unchanged.

**Change to an earlier rule, flagged for the founder.** F28 (4.3) said the notch shows no greeting. The founder's own request on 4 Nov asks for one, so the old big hello and its buttons stay gone and the short 3 second hello is the one greeting. `islandPanel.test.ts` says so.

**[verify] on a real Mac.**

- That the island page reports `document.hidden` while the screen is locked or asleep (WebKit's occlusion state), so "back after an hour" fires. If it does not, only a start and a wake say hello; a shell signal (screen unlocked) would be the fix.
- That a system sleep shows as a late timer in the island page (it should: timers stop while the Mac sleeps).
- How the wings at rest sit beside menu bar icons on a 14 inch MacBook Pro with many status items.

## Step 3, fixes after the review (built)

- [x] The lean and the hop move the whole part, ring and all, not the glass inside a still ring (`ui/parts.css`, tokens `--visor-lean-origin: 50% 90%`, `--visor-hop-up: -5.3%`, `--visor-hop-origin`). The animation end is heard on the span. Of the two suggested lean fixes, the one that turns the whole part about the foot (the lab's own 50,90) was taken; turning the glass alone about its centre would have kept the ring still and no longer matched the lab.
- [x] The lean plays twice on arriving at needs you, then holds still.
- [x] The blink plays three times, then rests until a glance or a return to rest arms it again.
- [x] The notch's resting band smiles beside the green tick (`notchHello.ts restWingState`). Its green outline shows too, matching the live wings, which always draw the state's ring.
- [x] Listening shows the state's ring on Home too (`characters.ts homeRingShown`), and the friendly character's listening halo is turned off for the orb and the Visor (`ui/chrome.css`; `style.css` stays free of the character choice).
- [x] Home says Working once: the line under the headline hides when the headline or the status line already says it (`homeHero.ts heroLineSaid`).
- Checked in a headless browser (shots `m68-shots/final-*.png`): the ring rides with the hop and the lean in the frame strips, the blink stops after about 14 s at rest, the lean ends upright after two goes, 20 quick state changes keep 24 nodes, no page errors.
