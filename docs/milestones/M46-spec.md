# M46 implementation spec: Quiet by default

Sources: F28, F04, F18, F27, M45 to M49 (M46), and executive review sections F3, M8 to M11, "The notch" and "Flowflow and the pointer". Line numbers come from `/Users/rishabhkapadia17/Developer/companion-wt/m36-type` as read on 30 Oct 2026. Some differ from the review's citations, and this spec uses the tree's numbers.

## 0. Calls this spec makes, and the ones still open

Made here, with the reason:

1. **A new key, `character.lively`.** The existing hero buttons' "Still" means Less motion (`character.motion = less`). F28's Still means "no frames after 3 s without news". The two must not share a name or a key, and Less motion stays its own accessibility control.
2. **Everyone lands on Still, and nothing is migrated.** See section 1.4.
3. **The idle tricks go in all three choices, Lively included.** M46 says "the idle tricks go", and rule 16 and review M10 agree. F28's "Lively: today's motion" is read as sway, eyes on the pointer and the ring always on, without the hops. This is worth one line of confirmation from the founder. It is not a blocker.
4. **"The ring shows while pointing" means the target ring.** While Show me how or Point at the problem has a ring up, the ring at the target is the pointing ring, and the cursor ring steps aside, as it does today (`overlay_busy`). The cursor ring itself shows at rest only in Lively, and in every choice while listening. The reason is that two rings at once compete, and the review says "Show me how puts the ring at the target at once". If the founder reads it the other way, the change is one term in `follow::shown`.
5. **`character.follow` keeps its options and means "what follows in Lively".** `eyes` means eyes only. `drop` means eyes plus the ring. `off` means nothing, and no ring even while listening. The listening ring needs `follow == "drop"`, which is the default.
6. **The unseen results count leaves the notch at rest** and shows only in the hover panel, capped at "9+". F28 says the notch is bare at rest. Proven and failed results still drop by themselves once, so nothing is missed.
7. **Self-grown wings also ignore clicks for their first 600 ms**, the same as self-opened cards. It is cheap and reversible.
8. **The Show me how ring lands at once.** The water flight becomes the opt-in `point.fly`, and success shows no confetti, burst or flight home unless Lively is chosen. Both are in M46 because the ring work and "the old animations go" touch the same files. They can be a separate PR in the stack.

Open for the founder (none blocks coding; a default is given for each):
- If a question arrives during a call, should it drop once the call ends? Default: yes, once, if it still waits.
- Should each new question restart the three amber pulses? Default: yes.
- Should "partly proven" drop by itself? Default: no. Only proven and failed drop.
- Should the character still roam beside a window while it points in Still and Gentle? Roaming is F18 item 2. Default: unchanged, but the ring never waits for the roam.

## 1. The new setting

### 1.1 Registry (`protocol/settings.json`, after line 49 `character.motion`)

```json
{ "key": "character.lively", "section": "home", "kind": "choice", "default": "still", "options": ["still", "gentle", "lively"], "scope": "app", "applies": ["shell", "pages"], "store": "settings", "live": true },
{ "key": "character.restLowPower", "section": "home", "kind": "switch", "default": true, "scope": "app", "applies": ["shell", "pages"], "store": "settings", "live": true },
{ "key": "point.fly", "section": "pointing", "kind": "switch", "default": false, "scope": "app", "applies": ["shell", "pages"], "store": "settings", "live": true },
```

- Add no `from` entry.
- `fun.reactions` (:55) and `character.motion` (:49) keep their keys, defaults and meaning.
- `character.follow` (:59) keeps `drop` as its default. Its meaning narrows, as described in section 0, item 5.
- Regenerate `app/vendor/engine/protocol/settings.json`, which is a copy.

### 1.2 Words (`app/src/strings.ts`)

Settings rows go in the block around :1384 to :1404. No em dashes.

- `"character.lively"`:
  - label: "How lively"
  - help: "Still: it holds still when nothing is happening and moves only when it is working, needs you, has finished, could not fix something, or is listening. Gentle: a slow, small sway at rest. Lively: it sways, its eyes follow your pointer, and the water ring stays on your pointer. With Less motion, or Reduce motion on your Mac, it holds still whatever you pick."
  - options: `{ still: "Still", gentle: "Gentle", lively: "Lively" }`
  - also: `["lively", "motion", "still", "gentle", "sway", "calm", "battery", "animation", "move"]`
- `short["character.lively"]`: "Still unless it has news. Gentle sways a little. Lively follows your pointer."
- `"character.restLowPower"`:
  - label: "Rest in Low Power Mode"
  - help: "On, the character holds still while your Mac is in Low Power Mode. It still shows when it is listening or needs you."
  - also: `["battery", "low power", "energy", "rest"]`
- `"character.follow"` (:1391), new help: "What follows your pointer when How lively is Lively. Its eyes: its eyes and body lean toward your pointer. A water ring: its eyes, plus a small ring of water around your pointer's tip. In Still and Gentle its eyes stay ahead, and the ring shows only while it is listening. No: nothing follows, not even while it listens." Options and the "A water ring" name stay (F27).
- `"point.fly"`:
  - label: "Fly to the place first"
  - help: "On, a drop leaves the character and flies to the place before the ring shows. Off, the ring shows at the place at once."
  - also: `["fly", "drop", "flight", "pointer", "show me how"]`
- `"point.style"` (:1399), new help: "Water: a ring of water at the place. Ring: a plain ring in the ring colour."
- `"character.live"`: drop "with eyes that follow your pointer".
- Hero, Settings (:1558 to :1559):
  - `livelyLabel: "How lively"`
  - `lively: { still: "Still", gentle: "Gentle", lively: "Lively" }`
- First run (:358 to :360):
  - `lively: { still: "Still", gentle: "Gentle", lively: "Lively" }`
  - `livelyLine: { still: "Moves only when it has news", gentle: "A slow sway at rest", lively: "Sways and follows your pointer" }`
- First run follow (:364 to :366): remove `followLabel`, `follow` and `followLine` with the follow step (section 1.3). "It watches your pointer" goes.
- `island.showWork`: label "Show results under the notch".
  - short (:307): "A proven fix or a failure drops from the notch for a moment."
  - help (:1375): "When a fix is proven, or fails, its card drops from the notch for a few seconds, then tucks back. Off, the notch only shows its marks."
- `calls.quiet` help: append "The notch does not open by itself during a call either, and the character holds still."

### 1.3 Where it shows

- `app/src/settingsPages.ts:14`: add `character.lively` and `character.restLowPower` to the character (Flowflow) page, next to `character.follow`.
- `app/src/settingsPage.tsx:992 to :1012` (CompanionHero):
  - Change the buttons to Still, Gentle and Lively. They read and write `character.lively` only.
  - The hero's live Flowflow takes the chosen mode, so pressing a button shows it at once. A press counts as news, so it moves and then follows its own rule.
- `app/src/settingsLevel.ts:5 to :6`: rewrite the comment. `fun.reactions` and `character.motion` stay under Advanced, reachable and found by search. The hero no longer covers them. M47 decides their final place.
- `app/src/lookfeel.ts:38 to :44`:
  - Delete `Lively`, `livelyOf` and `livelySettings`.
  - Add `export type Liveliness = "still" | "gentle" | "lively"` and `livelinessOf(v: unknown): Liveliness`, which returns `v` when valid, else `"still"`.
- First run:
  - `app/src/onboarding.ts:36`: write `["character.lively", y.lively]` instead of `fun.reactions`. Type `lively: Liveliness | null`.
  - `onboarding.tsx:35, :165`: three buttons, pressed default `still`.
  - Remove the follow step (`onboarding.tsx` around :139 and :243, and the step list entry). `Yours.follow` stays optional and null, so `yoursSettings` still compiles and writes nothing for it.
  - M49 rebuilds the first run.

### 1.4 Migration: everyone lands on Still

- **What happens:** every existing install reads `character.lively` as its default, `still`. Nothing is written and no `from` mapping is added.
- **Why it cannot be told apart:**
  - `settings.rs:445` removes a value equal to its usual one (`if same(&n, &d.default) { map.remove(key) }`).
  - Today's Lively is `fun.reactions = true`, which is the default. The first run's Lively button also writes `true`, so that key is removed too.
  - So "chose Lively" and "never touched it" are the same bytes on disk. A migration could only guess, and the guess would turn motion on for people who never asked for it.
- **Calm:** a person who turned Lively off (`fun.reactions = false`) lands on Still. Still keeps the promise Calm made ("Moves only when it has news"), and Calm never kept that promise (review M10).
- **Less motion:** a person on `character.motion = less` lands on Still and keeps Less motion, which still wins (section 2.6).
- **Lively by default:** a person who left Lively on lands on Still too. Pick Lively again in Settings, on the Flowflow page, to get today's motion back.
- **Why this is right:**
  - F28 names Still "the usual".
  - F04's budget is a founder promise that today's defaults break (review F3).
  - Changing back is one click, on the page F28 names.
- **CHANGELOG:** the M46 entry says this in plain words: "Flowflow now holds still when nothing is happening. To have it sway and follow your pointer again, pick Lively in Settings, Flowflow."
- **Not done:** no popup or notice in the app. A notice for a quieter default would itself be noise.

## 2. What each choice does

### 2.1 What counts as news

News is any of these:
- A state change from the app.
- A touch, drag, press or peek on the character.
- `arrive` or `push` (the person moved it).
- `give` or `catch` (pointing).
- Listening.
- A hero button press.
- `setLiveliness`.
- Leaving rest.

These are not news: `gaze()` (a shell pointer event) and `onMove` (a pointer move in the dock window), except in Lively.

### 2.2 Summary table

| | Still (default) | Gentle | Lively |
|---|---|---|---|
| Frame loop at rest | Parks: nothing scheduled after 3 s without news | Capped at `GENTLE_INTERVAL` 1/12 s [verify the budget] | Today's rule (every refresh while idle and lively) |
| Frame loop for news | Full rate for touch, drag, press and listening. 1/30 s for working, thinking and checking. Parks again 3 s after the last news once the state allows it (2.4) | Same as Still, then back to the cap | Today's rule |
| Sway, float, breath, shader waves | Sway factor eases to 0 within 3 s. The parked frame is the clean drop | Factor about 0.4, phase rate about 0.5x | Factor 1, today's rate |
| Idle tricks | None | None | None |
| Eyes on the pointer (gaze) | Ignored. Eyes ahead, turning only when it needs you (out toward the screen) or points (at the target, existing give and catch) | Same as Still | Today's (M20), if `follow != off` |
| Wander glances (face.ts) | Off at rest | Off | Today's |
| Blinks | Only while frames run. It parks only with the eyes open | Today's, at the capped rate | Today's |
| Droplets | None (look.droplets times 0) | None | Today's, colour fixed (2.5) |
| Gaze thread (shell) | Parked | Parked | Runs at 50 ms if `follow != off`, not resting, not hidden |
| Cursor ring | Only while listening and `follow == drop` | Same as Still | Always while `follow == drop`, plus while listening |
| Ring thread (shell) | Parked unless the ring is shown | Same as Still | 8 ms ticks while shown |
| Success burst, confetti, flight home, `give` poke sound | None, unless `point.fly` (flight only) | None, unless `point.fly` | If `fun.reactions` is also on |

### 2.3 Constants (`app/src/flowflow/controller.ts:23 to :25`)

```ts
const IDLE_INTERVAL = 1 / 20, SLEEP_INTERVAL = 1 / 15, RESUME_GAP_MS = 500;   // kept for Lively's existing paths
export const PARK = -1;                  // no rAF, no timer
export const GENTLE_INTERVAL = 1 / 12;   // [verify] against F04 on a real Mac
export const WORK_INTERVAL = 1 / 30;     // working, thinking, checking in Still and Gentle; notch wing in every mode
export const NO_NEWS_MS = 3000;
```

### 2.4 Frame loop rules (`controller.ts`)

**`interval()` (:111 to :116)**

```
if mode === "lively": return today's rule unchanged (lastPointer stays for Lively only)
if resting && state !== listening: return PARK
if parkable(): return PARK
if state in {working} (thinking, checking map here): return WORK_INTERVAL
if state is idle or sleeping (and not yet parkable): return mode === "gentle" ? GENTLE_INTERVAL : 0
otherwise (touch, listening, following, interacting, success flash): return 0
```

**`parkable()`** is true when every one of these holds:
- mode is `still`, or mode is `gentle` and state is not idle or sleeping (Gentle never parks at idle; it runs at the cap).
- `performance.now() - lastNews >= NO_NEWS_MS`.
- The state is `idle`, `sleeping`, `error` (not fixed, held flat and dull), or `needsYou` with its three pulses finished.
- There is no flash under way.
- `engine.body.settled` is true.
- The press spring is settled.
- `droplets.alive === 0` and `ripples.alive === 0`.
- `!engine.face.blinking`.
- The sway factor is 0. This matters only in Still at idle.

Working, listening, following and interacting never park.

**`loop` (:118 to :135)**: when `interval() === PARK`:
1. Render one frame from `engine.update(acc)`. Its sway factor is already 0.
2. Call `stop()`.
3. Return with nothing scheduled.

The existing `RESUME_GAP_MS` guard keeps the long gap from being simulated on wake.

**Wake**: every news entry point sets `lastNews = performance.now()` and calls `resumeOrPause()`.

**Rename**: `lastPointer` (:36, :69, :74, :78 to :83, :158 to :168) becomes `lastNews` at these call sites:
- `touch` (:69, :74)
- `push` and `arrive` (:79, :80)
- `press` (:83)
- `onDown`
- `give` and `catch`
- `setState`
- `setListening`

`gaze()` (:78) and `onMove` (:158 to :168):
- In Lively, they behave as today and set `lastPointer`.
- Otherwise they return at once: no `engine.gaze`, no timestamp, no resume.

**`setLively` (:84)** becomes:

```ts
setLiveliness(m: Liveliness): void { this.engine.mode = m; this.lastNews = performance.now(); this.resumeOrPause(); }
setResting(r: boolean): void { this.resting = r; if (r && this.engine.behavior.state !== "curious") { this.stop(); this.still(); } else this.resumeOrPause(); }
```

**`active()` (:101)**: add `&& !(this.resting && state !== listening)`. Listening always runs, because rule 5's light must never be stilled.

### 2.5 Engine, physics, face, behaviour, shaders, renderer

**`engine.ts:27 to :35, :68 to :73, :161, :176 to :230`**
- Delete `HOP_EVERY`, `IDLE_ACTS`, `IdleAct`, `ACT_S`, `ACT_WEIGHT`, `hopIn`, `hopT`, `act`, `idleDone`, `pickAct`, `playAct`, `idleLife()` and its call in `update()`.
- Replace `lively = false` (:69) with `mode: Liveliness = "still"`.
- Line :179's `quiet` goes with `idleLife`.

**`engine.ts:153 to :174, :250 to :256` (sway)**
- Add `sway` (eased toward a target at about 1/s) and `swayTime` (advanced by `dt * rate`).
- Targets:
  - Still at idle or sleeping: 0.
  - Still in other states: 1. The news motions use their own looks.
  - Gentle: 0.4 at rate 0.5.
  - Lively: 1 at rate 1.
- `Snapshot` gains `sway` and `swayTime`.
- `snapshot.float = floatAmp * sway * sin(swayTime * 0.9)`.
- Within 3 s of no news, Still's factor reaches 0. Use an ease that hits 0 exactly, such as a linear clamp over 2.5 s, not an exponential.

**`engine.ts:94 to :108` (pointer, gaze)**: no-op unless `mode === "lively"`.

**`physics.ts:79, :114, :148, :156, :162 to :167`**
- `engine.update` calls `setBreath(look.breathAmp * sway, look.breathRate)`.
- `settled` must also require `|pose.breath| < eps` when the breath amplitude is 0, so a parked frame is truly at rest.

**`face.ts:41 to :49`**
- Expose `get blinking(): boolean`.
- Wander glances run only when the mode is Lively.

**`behavior.ts`**
- Add a `needsYou` state to `BEHAVIOR_STATES` and `LOOKS`: amber core, eyes forward, `gazeGain` 0.
- `fromApp` maps `needsYou` to `needsYou`, not `curious` (:52 to :53). Listening stays `curious`.
- Needs you pulses three times (about 1.2 s each), then holds steady. Expose `pulsesDone`.
- Idle `floatAmp` and `breathAmp` (:31 to :39) keep Lively's values and are scaled by the sway factor.

**`shaders.ts:23 to :25, :49 to :55`**
- Add `uniform float uSway;`.
- Multiply the point sway (:50), the side waves (:54) and the base spread (:55) by `calmed * uSway`.
- Drive their phase from a new `uSwayTime` uniform, not `uTime`. `uTime` stays for news motion.

**`renderer.ts`**
- (:98) Set `uSway = s.sway` and `uSwayTime = s.swayTime`.
- (:62, :70) Wrap both droplet colours in `asWritten()` to match the body (:53, :69).
- (:77) In Gentle, cap the pixel ratio at 2 [verify].

### 2.6 What always wins

- **Less motion (`character.motion = less`) and macOS Reduce motion.** The controller's `reduced` path (`active()` false, `still()` frames) is unchanged and overrides every choice.
- **The ring under Reduce motion or Less motion** stays still, as F27 says.
- **Rest (section 3).**

### 2.7 Every live Flowflow takes the mode

- `app/src/flowflow/view.tsx`: add a `liveliness: Liveliness` prop. It calls `setLiveliness` on change.
- Callers:
  - `dock.tsx:70 to :76`: read `character.lively`, drop `livelyOf`. The `gaze` listener forwards events only when the mode is Lively.
  - `settingsPage.tsx:1002` (hero)
  - `onboarding.tsx:139, :243`
  - `firstLook.tsx:40`
  - `flowflowMini.tsx:28` and `island.tsx:188` (notch wing). The wing uses `WORK_INTERVAL` while working in every mode and parks when the wing hides.
- `homeCharacter.tsx` loses its only caller (section 4).

## 3. Rest: Low Power Mode, calls and presenting, full screen, tucked away

**Shell (`app/src-tauri/src/main.rs`)**
- Add `fn rest_now() -> bool`. It is true when either of these holds:
  - `(setting("calls.quiet") && quiet())`
  - `(setting("character.restLowPower") && low_power())`
- `low_power()` reads `NSProcessInfo::processInfo().isLowPowerModeEnabled()` through `objc2-foundation` 0.3. Which Cargo feature exposes it is [verify]; likely `NSProcessInfo`.
- Full screen needs nothing new: with `character.overFullScreen` off, Companion already hides (`companion_hidden()`), and hidden counts as rest for the threads.
- Rule 7: only the front app's id and the power state are read, never content.
- On the existing 500 ms `tick` (:4002 to :4040), compute `rest_now()`. On a change, store `REST: AtomicBool` and emit `flowflow-rest { rest }` to the dock, island and Home windows (the Settings hero lives in Home). Also call `gaze_wake()` and `follow_wake()`.

**Pages**
- On `flowflow-rest`, call `setResting(rest)`.
- `dock.tsx:166 to :172` (peek listener): pose `hidden` calls `setResting(true)`. `peek` or `in` calls `setResting(false)`, unless the shell rest is also on.

**Listening during rest**: the loop runs (rule 5). Needs you during rest shows one still frame with the amber held, with no pulses.

## 4. Removals

**Idle tricks**: `engine.ts`, as in section 2.5.

**Old CSS on the live drawing** (`app/src/style.css`)
- :51 to :57, :61 to :66: scope `.character[data-motion]` breathe, swirl, busy, scan, glow and droop to `.character:not([data-live])`, so they apply to pictures only.
- :463 to :466: delete the `[data-flow]` guard.
- :294 to :302: reactions nod, wince, cheer and party. Delete them for `[data-live]`; scope the rest to pictures.
- :306 to :310: roam surface, travel and settle. Scope them to `:not([data-live])`.
- :420 to :428: peek. Delete `rotate: ∓7deg`. The face stays parallel to the edge, and the engine's surface flattening draws the stick. Keep the translate only if it is needed for position, otherwise delete it too.
- :459 to :460: delete pose `tilt` and `pose-glow` for live.
- `dock.tsx:220`:
  - Set `data-live="on"` when `liveOn && !liveFailed`, as `homeCharacter.tsx:47` does.
  - Emit `data-motion` only on the pictures path.
  - `motionFor` (`model.ts:1088 to :1099`) then serves pictures only.

**Hidden Home Flowflow**
- `card.tsx:1532 to :1533`: remove `<Waterline/>` and `<HomeCharacter m={m}/>`.
- `style.css:1063 to :1064`: remove the `display:none` rule.
- `homeCharacter.tsx`: delete it if nothing else imports it.
- M46 lists this removal. M48's one column Home decides whether a visible one returns. F27 lists Home as a live place, so the CHANGELOG says it is gone for now.

**Hero mapping**: `lookfeel.ts` `livelyOf` and `livelySettings`.

**Notch sun and margin**: section 5.1.

**Show me how decoration by default**: section 6.4.

**Ring bubble**
- `app/follow.html:5`: replace the silver gradient and inset highlight with a flat near black card (#141416), white text and a thin line, in the system font.
- Rebuild `app/dist/follow.html`.

## 5. The notch

### 5.1 Rest shape and click area

- `app/src-tauri/src/island.rs:84 to :87`: delete `MARK`.
- `island.rs:154`: `Mode::Rest` returns `r` for every `Kind`, so on a notch the frame is exactly `[fx + n.x, fy, n.w, n.h]`.
- Rewrite the comments at :64 to :69 and :84 to :86. F28 gives the founder's yes to removing the sun, so M16 no longer blocks this.
- The click and hover area follows with no other change:
  - `main.rs:668 to :677` (`add_hover_tracking` over the view)
  - `style.css:353` (`.island-hit`)
- `island.tsx:170 to :182`: delete the `<picture>` sun and its comment. `shapeW` stays `shape.w`.
- `style.css:624 to :630`: delete `.island-sun` and `@keyframes island-sun-in`. Keep `public/brand/sun-lime.svg` only if something else uses it.
- Unseen count:
  - `island.tsx:186`, `style.css:1024`: remove it from the rest shape. Inside the bare notch it would sit under the camera housing, with no pixels.
  - Show it in the hover panel's top line as "N new" with a cap of "9+".
- Pill (no notch) and edge rest are unchanged.

### 5.2 The "looking at your screen" mark (rule 5)

- `app/src/home.ts:205 to :209`: add `WingMark "look"`.
- Add `export function looksAtScreen(m): boolean { return m.showme?.stage === "looking"; }`. That is the stage `main.rs:2303` announces 250 ms before each capture, including each walkthrough step.
- Do not key it on `"checking"`. That state also covers Point at the problem (`model.ts:1288`) and the runner's own checks, which are not captures.
- `islandWings` (:214 to :217) order:
  1. listening
  2. `looksAtScreen` gives `{ state: "checking", mark: "look" }`
  3. everything else, as today
- All other checking keeps `"arc"`.
- `islandLineBase` (:282) and `islandName`: when `looksAtScreen`, the line and the accessible name say "Looking at your screen" (`model.ts:1312` words), ahead of "Working on ...".
- `island.tsx:69 to :76`: add the `look` branch, an SVG circle ring with a filled centre dot. It has no animation: it is a light, not a spinner.
- `style.css`: add `.island-wing .mark[data-mark="look"]`, white, static.
- Add the selector to the a11y NO_WORDS list (`a11y.test.ts:856`).
- Neither quiet nor rest ever hides the listening or look marks.

### 5.3 Self drops

- `app/src/islandPanel.ts:54 to :58`: replace `workPeekKey` with `resultPeekKey(cards)`.
  - The key is built from `${key}|${tone}` of cards whose verdict is proven (`tone === "done"`) or failed.
  - It never uses `sub`.
  - Start, step changes, "partly", "plain" (stopped, not checked), cost and Undo all give `""`.
  - Read M45's verdict function if it has merged, else `JOB_TONE`.
  - Keep the timer, set to 4 s to match `DONE_WINGS_MS`.
- `island.tsx:138 to :152`:
  - Use `resultPeekKey`.
  - Keep the `out &&` guard.
  - `ask = out && ((questionsOpen && approvals) || resultPeek)`.
  - Rewrite the M26 comment.
- Self drops happen for a question (`island.openForQuestions`), a proven result or a failure. Nothing else.

### 5.4 Armed clicks (600 ms)

**`app/src/islandPanel.tsx:46 to :49, :62, :67 to :73`**
- Record `openedAt` when `shown && brief` turns true.
- While `now - openedAt < ARM_MS` (600), ignore every click in the panel: Look first (:62), the `ip-job` buttons (:68), and the Allow and Don't allow buttons (already armed, kept).
- Set `data-armed` on the panel and `cursor: default` until it is armed.

**`island.tsx:185` (`.island-hit`)**
- Ignore clicks for `ARM_MS` after the shape grows by itself, meaning a mode change from rest to `wings` or `wingsPeek` with `shape.hover` false.

### 5.5 Amber pulses three times, then holds

- `style.css:383 to :384`: `island-needsYou-pulse 1.6s ease-in-out 200ms 3 both`. The last keyframe is the solid amber dot.
- Do the same on the character's picture path: `style.css:56` and :459 to :460 with the steady glow from :456, 3 iterations, then hold.
- The live drawing does it in the engine (section 2.5).
- Key the wing mark element on the approvals count, so each new question pulses three more times.
- Reduce motion's removal at :407 stays.
- The static listening glow at :292 is not touched (rule 5).

### 5.6 Quiet while presenting or on a call

- `island.rs:300 to :333`: add `quiet: bool` to `State`, default false. Update the static initializer at `main.rs:435`.
- In `mode()`, the self drop becomes `s.ask && !s.home_open && !s.quiet`.
- While quiet:
  - The wings and marks still show (rule 5 lights, needs you).
  - Hover opening still works, because the person caused it.
- `main.rs:498 to :538` (`place_island`): set `quiet = (calls.quiet && quiet()) || companion_hidden()`, and gate `ISLAND_CHEER` with it.
- `main.rs:4002 to :4040` (`tick`): while `ISLAND_STATE.ask` is true, sample `quiet()`. On a flip, call `place_island(mtm, false, "quiet")`.
- When quiet ends and a question still waits, drop once (open choice, section 0).

### 5.7 Width and font

- `style.css:587`: delete the `[data-brief] { width: 340px }` override, so brief and hover are both 400, matching `PANEL_W` (`island.rs:83`).
- `style.css:918`: plain words under a question use the panel's system font. Monospace stays only inside `<code>`.
- The hover launcher content (`islandPanel.tsx:79 to :92`) is M48. Leave it, and add no new self drop paths that show it.

## 6. The cursor ring, the eyes thread and the Show me how ring

### 6.1 Pure rules (Rust)

**`app/src-tauri/src/gaze.rs:13`**

```rust
pub fn follows(follow: &Value, lively: &Value) -> bool { lively == "lively" && follow != "off" }
```

Null and missing values count as the defaults, `drop` and `still`.

**`app/src-tauri/src/follow.rs:49`**: keep `wanted()` for the choice, and add:

```rust
pub fn shown(lively: &Value, follow: &Value, listening: bool, pointing: bool, quiet: bool, hidden: bool) -> bool {
    if hidden || pointing || follow != "drop" { return false; }   // pointing: the target ring is the ring (section 0, item 4)
    listening || (lively == "lively" && !quiet)
}
pub enum Next { Tick(u64), Park, ParkFor(u64) }
pub fn next(shown: bool, busy_left_ms: Option<u64>, ring_otherwise_wanted: bool) -> Next
```

- `Tick(TICK_MS)` while shown.
- `ParkFor(left)` while pointing would end by timeout and the ring is otherwise wanted.
- `Park` otherwise.

**`gaze.rs`**: add `pub fn next(wanted: bool) -> Next` with the same shape: `Tick(POLL_MS)` or `Park`.

### 6.2 Threads

**Gaze thread (`main.rs:4517 to :4524`, `gaze_tick` :1046 to :1061)**
- Add `GAZE_WANTED: AtomicBool = follows(follow, lively) && !REST && !companion_hidden()`.
- Recompute it in `settings_set` (for `character.follow` and `character.lively`), on rest change, and on hide and show.
- The background thread checks it before `run_on_main_thread`. When it is false, it calls `thread::park()` (no timeout) until `gaze_wake()` unparks it.
- No main thread hop happens in Still or Gentle.

**Follow thread (`main.rs:1063 to :1124`, `follow_loop`)**
- Each pass evaluates `follow::shown(...)` with:
  - `listening_now()`
  - `overlay_busy()`
  - `quiet()`, sampled every 30 ticks and cached in between
  - `companion_hidden()`
  - the cached settings
- Act on `follow::next(...)`:
  - **Hidden, the first time:** order the window out (as at :1077 to :1079), clear `FOLLOW_LIVE`, and emit `follow-hide`. Then call `thread::park()` or `park_timeout`.
  - **Shown:** emit `follow-show` once, then 8 ms ticks.
- Add `fn follow_wake()` (unpark) and call it from:
  - `listening(on)` (:3725)
  - `draw_pointer_with` after `OVERLAY_BUSY_UNTIL` is stored (:2361 to :2364)
  - `hide_overlay` (:2216)
  - `point_cancel`
  - `settings_set` for `character.follow` and `character.lively`
  - hide and show (`HIDDEN_BY_US` and `USER_HID`, around :3760)
  - rest change
- Rule 5: the listening ring is never the only light. `listening(true)` lights the notch or dock first, then wakes the ring.
- Mouse monitors (`main.rs:4471 to :4481`, `follow_to_pointer` :1718 to :1723): keep them, and add a comment that the early return on `!FOLLOW_LIVE` is the whole cost. They read the pointer only, never keys (rule 8).

### 6.3 Ring page (`app/src/follow.ts:36 to :37, :110 to :117`)

- On `follow-hide`, cancel the rAF and the timeout and schedule nothing.
- On `follow-show`, draw one frame and resume.
- In Still and Gentle, the listening ring draws without waves (`uT` frozen) except for the voice level ripple (`follow-voice`, `main.rs:3884 to :3889`).
- Lively keeps the waves.
- Do not rely on WKWebView throttling an ordered out panel [verify].

### 6.4 Show me how: the ring lands at once

- `overlay.ts:175 to :223` (`show()`): unless `point.fly` is on, call `land()` at once: no bud, arc, trail or squash.
- Add `RING_IN_MS = 240` with an ease out and no overshoot (not `settle()`), in `water.ts` next to :11 to :16.
- Keep `SPLIT_MS`, `LAND_MS` and `flightMs` (`pointer.ts:13 to :15`) for the opt-in only.
- `overlay.ts:86 to :112`: in Still and Gentle, a held ring stops its wobble once drawn in, so no frames are drawn while it waits. Lively keeps the wobble.
- `overlay.ts:255 to :323` (celebrate):
  - Default: the ring turns green and the tick draws.
  - The burst, the flight home (`HOME_DELAY_MS` and `HOME_MS`) and the confetti need Lively and `playful()`.
  - The shell stops sending `home` when they are off.
- `main.rs:2383 to :2393` (`draw_pointer_with`): with `point.fly` off, skip the `give` emit, which also skips the drop sound (`dock.tsx:200 to :205`). The ring never waits for `roam_to`.
- `card.tsx:967` and `sequence.ts:10 to :14`: with `point.fly` off, `flyMs` is null. `LEAD_MS * pace` stays as a plain pause between steps.
- Words:
  - `overlay.ts:163` ("Your turn: ", " (around here)") becomes `S.pointer.yourTurn` and `S.pointer.aroundHere` = "Somewhere around here."
  - `overlay.ts:272` ("That's it.") becomes `S.pointer.done`.
  - `pointer.ts:98 to :107` (`guessWords`, `notSureWords`) move to `S.pointer`.
- Fonts:
  - `pointer.ts:39 to :47`: `PLAIN_FONT` becomes `-apple-system, "SF Pro Text", system-ui`. `handwritten` stays as an opt-in.
  - `overlay.html:4, :9`: `.cap` and `.talk` use the system face. The `cubic-bezier(.34,1.56,.64,1) .4s` becomes an ease out over 200 ms.
  - `overlay.ts:332` `HAND` becomes the system face (Draw it, low priority).

## 7. Call sites, in one list

| File:line | Change |
|---|---|
| `protocol/settings.json:49 to :59, :76` | Add `character.lively`, `character.restLowPower`, `point.fly` (1.1) |
| `app/vendor/engine/protocol/settings.json` | Regenerate |
| `app/src/lookfeel.ts:38 to :44` | Retire Lively mapping; add `Liveliness`, `livelinessOf` |
| `app/src/flowflow/controller.ts:23 to :25` | `PARK`, `GENTLE_INTERVAL`, `WORK_INTERVAL`, `NO_NEWS_MS` |
| `controller.ts:36, :69, :74, :78 to :84, :158 to :168` | `lastNews` for news; gaze and onMove are Lively only; `setLiveliness`, `setResting` |
| `controller.ts:101, :103 to :135` | `active()` with resting; `interval()` and `parkable()`; loop parks |
| `app/src/flowflow/engine.ts:27 to :35, :68 to :73, :94 to :108, :153 to :230, :250 to :256` | Delete idle tricks; `mode`; gaze Lively only; `sway` and `swayTime` in Snapshot |
| `app/src/flowflow/physics.ts:79, :114, :148 to :167` | Breath scaled by sway; `settled` includes breath |
| `app/src/flowflow/face.ts:41 to :49` | `blinking` getter; wander Lively only |
| `app/src/flowflow/behavior.ts:7, :31 to :53` | `needsYou` state and look, 3 pulses then hold |
| `app/src/flowflow/shaders.ts:23 to :25, :49 to :55` | `uSway`, `uSwayTime` |
| `app/src/flowflow/renderer.ts:53, :62, :69 to :70, :77, :98` | Uniforms; `asWritten` droplets; Gentle DPR cap |
| `app/src/flowflow/view.tsx` | `liveliness` prop |
| `app/src/dock.tsx:45, :70 to :76, :166 to :172, :200 to :205, :220` | Read the mode; drop gaze unless Lively; rest on tucked; no give poke without fly; `data-live` |
| `app/src/style.css:51 to :66, :294 to :310, :383 to :384, :407, :420 to :428, :456 to :466, :587, :624 to :630, :918, :1024, :1063 to :1064` | Section 4 and section 5 |
| `app/src/card.tsx:967, :1531 to :1533` | `flyMs` null without fly; remove hidden Home Flowflow |
| `app/src/homeCharacter.tsx` | Delete if unused |
| `app/src/settingsPage.tsx:992 to :1012` | Hero buttons Still, Gentle, Lively |
| `app/src/settingsPages.ts:14` | Add `character.lively`, `character.restLowPower` |
| `app/src/settingsLevel.ts:5 to :6` | Comment |
| `app/src/strings.ts:307, :319, :358 to :366, :1375, :1384 to :1404, :1558 to :1559` | Section 1.2; `S.pointer.*` |
| `app/src/onboarding.ts:27 to :39`, `onboarding.tsx:35, :139, :165, :243` | Three choices, default still; follow step removed |
| `app/src/firstLook.tsx:40`, `flowflowMini.tsx:28`, `island.tsx:188` | Pass the mode; wing at `WORK_INTERVAL`, parks when hidden |
| `app/src/home.ts:205 to :217, :282` | `look` mark, `looksAtScreen`, line and name |
| `app/src/island.tsx:69 to :76, :138 to :152, :170 to :186` | Look mark; `resultPeekKey`; sun and count gone; wing arm |
| `app/src/islandPanel.ts:46 to :58`, `islandPanel.tsx:46 to :73` | Result only key; panel armed 600 ms; count with 9+ in hover |
| `app/src/follow.ts:36 to :37, :110 to :117`, `app/follow.html:5`, `app/dist/follow.html` | Show and hide events; flat bubble |
| `app/src/overlay.ts:86 to :112, :163, :175 to :223, :255 to :323, :332`, `app/overlay.html:4, :9` | Section 6.4 |
| `app/src/water.ts:11 to :16`, `pointer.ts:13 to :15, :39 to :47, :98 to :107`, `sequence.ts:10 to :14` | `RING_IN_MS`; fonts; words |
| `app/src-tauri/src/gaze.rs:7, :13, :30 to :62` | `follows(follow, lively)`, `next()`, tests |
| `app/src-tauri/src/follow.rs:11 to :12, :49, :86 to :90, :127 to :139` | `shown()`, `next()`, tests |
| `app/src-tauri/src/island.rs:64 to :69, :83 to :87, :154, :300 to :333, :442 to :450` | Bare notch rest; `quiet` in State |
| `app/src-tauri/src/main.rs:435, :498 to :538, :609 to :619` | Island quiet |
| `main.rs:1046 to :1124` | Gaze gate and park; follow park and wake |
| `main.rs:2216, :2361 to :2393, :3725, :3760` | `follow_wake` calls; no give without fly |
| `main.rs:2702` | `rest_now`, `low_power` beside `quiet` |
| `main.rs:4002 to :4040` | Rest and quiet sampling |
| `main.rs:4471 to :4481, :4517 to :4524` | Comment; gaze thread park |
| `CHANGELOG.md:57` | Correct "Easier on your battery" after measuring (section 10) |

## 8. Tests to write first (rule 17), then run the suite

### Frame loop (`app/src/flowflow/controller.test.ts`)

Use a fake `requestAnimationFrame`, `setTimeout` and `performance.now`, and a stub renderer that counts renders.

1. **Idle budget, Still.**
   - Setup: start idle, mode `still`, no input. Step frames at 60 Hz for 3.0 s.
   - Then: no pending rAF and no pending timer.
   - Advance 60 more seconds: the render count is unchanged.
   - The last snapshot has `sway === 0`, `float === 0`, breath 0, and `blinking === false`.
2. **Wakes on news.**
   - Each of these schedules a rAF: `setState("working")`, `touch`, `press`, `push`, `give`, listening, `setLiveliness`.
   - After 3 s at idle with no news, it parks again.
3. **Gaze is ignored in Still and Gentle.** On a parked controller, `gaze()` and a pointermove schedule nothing and change no eye target.
4. **Gentle.** At idle it never parks, and every scheduled gap is at least `GENTLE_INTERVAL * 1000 - 4` ms. Sway is about 0.4.
5. **Lively** matches today's intervals: a snapshot of `interval()` across the current cases.
6. **Needs you.** It runs through three pulses and parks after they finish plus 3 s. Error parks once settled.
7. **Rest.** `setResting(true)` stops and draws one still frame. Listening during rest keeps running.
8. **Reduced or Less motion.** It never schedules, whatever the mode.

### Engine (`engine.test.ts`)

- Replace :3 and :105 to :139: no idle act of any kind fires over 120 s in any mode.
- Still's sway factor reaches exactly 0 by 3 s.
- `swayTime` rate is 0.5x in Gentle.
- `gaze()` is a no-op unless Lively.

### Behaviour

- `fromApp("needsYou").base === "needsYou"`, and it is not equal to listening's `curious`.

### Source checks (TS)

- `shaders.ts`: the three sway terms multiply `uSway`.
- `style.css`:
  - No `animation` or `rotate` selector matches `.character[data-live]` (guards.test.ts).
  - The peek rule has no `rotate`.
  - The needsYou pulse iteration count is `3` on the island wing and on the character picture path, with no `infinite`.
  - The look mark has no animation.
  - No `.island-sun`.
  - No `[data-brief]` width.

### Settings

- Registry: `character.lively` has default `still` and options in order.
- `livelinessOf` falls back to `still` for null, junk and old values.
- `settingsPages` includes the key.
- Strings have a label, help, short line and all three options, with no em dash (an existing copy test, if present).
- `lookfeel.test.ts` and the motion, look and settingsLevel tests are updated.
- First run: three choices, pressed default `still`, writes `character.lively`, no follow step.

### Notch (TS)

- `islandWings`:
  - showme `looking` always gives `mark: "look"`, even with a question waiting or a task working.
  - point `checking` and the runner's `checking` never give `look`.
  - Listening comes first.
- `resultPeekKey`:
  - Start, steps, cost, partly, plain and Undo all give `""`.
  - Proven and failed give a key.
  - Rewrite `islandPanel.test.ts:123 to :150, :178 to :181` and :64 to :75 (the sun).
- Armed panel: Look first and a result card ignore a click at 599 ms and accept one at 600 ms. The wing does the same after a self-grow.
- Update `island.test.ts:323` (look versus arc) and :452 to :460 (the brief width).
- Add the look mark selector to `a11y.test.ts:856`.

### Rust

- **`gaze::follows`** truth table over lively × follow, including Null. Only `lively` with `eyes` or `drop` is true.
- **`gaze::next(false) == Park`.**
- **`follow::shown`** truth table:
  - Still and Gentle hide the ring at rest.
  - Lively with `drop` shows it.
  - Listening shows it in every mode with `drop`.
  - `eyes` and `off` never show it.
  - Pointing hides it.
  - Hidden always hides it.
  - Quiet hides Lively's rest ring but not the listening ring.
- **`follow::next`**: `Park` when not shown; `ParkFor` while pointing ends by timeout; `Tick(8)` when shown.
- **Thread sleep source assertions** (rewrite `follow.rs:127 to :139`):
  - `follow_loop` calls `follow::shown(` and `follow::next(`.
  - Its hidden branch calls `park` and has no `sleep(` on that path.
  - The gaze thread loads `GAZE_WANTED` before `run_on_main_thread` and parks when it is false.
  - `follow_wake()` appears in `listening(`, `draw_pointer_with`, `hide_overlay`, `point_cancel` and `settings_set`.
  - Keep the no `log()` and sharing type assertions.
- **`rest_now` composition**: make it a pure fn over (calls setting, quiet, low power setting, low power) with a truth table.
- **`island.rs`**:
  - The rest frame equals the notch exactly: `[663.5, 0, 185, 32]` on the 14 inch MacBook Pro and `[771.5, 0, 185, 32]` on the 16 inch.
  - `look().core` equals the frame width at rest. This replaces :442 to :450.
  - The pill and edge rest tests are unchanged.
  - `ask + quiet` gives Alert, wings with no panel.
  - `hover + quiet` still opens.
  - Listening while quiet gives Alert.

### Pointer

- With `point.fly` off, `show()` lands on the first frame with no bud, arc or trail.
- `RING_IN_MS` eases with no overshoot.
- The flight path is still covered with `point.fly` on (`overlayHarness.ts`).
- Update `pointer.test.ts:7, :44` and `overlay.test.ts:23, :28` for the moved words.
- `follow.test.ts:19 to :24`: the page stops scheduling on `follow-hide`.

Gate: `scripts/test-all.sh && merge`, never `;`. Then rebuild and open the app. A new plugin or crate feature (objc2-foundation) can crash launch while tests pass.

## 9. Generated copies to refresh

- `app/vendor/engine/protocol/settings.json`
- `app/dist/follow.html`
- Any other `app/dist` page built from `overlay.html`

## 10. Measure before claiming (rule 18), on a real Mac

These go on the next hands on session list.

- **Still**, default settings, character docked and stuck: after 10 s idle, under 1% average CPU for Companion's processes, and no GPU work. Check with Activity Monitor's CPU and Energy columns and the GPU history window.
- **Gentle**: the same budget at 1/12 s with the DPR capped at 2. If it fails, lower the rate to 1/8 s before shrinking the sway, and record the result in `technical_research.md` (:464) and F28's notes.
- **Lively**: record the number, with no budget claim.
- **[verify] items:**
  - Whether an ordered out or tucked NSPanel webview reports `document.hidden` and keeps timers running. The explicit `setResting` and `follow-hide` do not depend on the answer.
  - Which objc2-foundation feature has `isLowPowerModeEnabled`.
  - That the look mark is on screen before the 250 ms capture delay at `main.rs:2303` ends, with the island visible. If `island.show` is off, the light falls back to the character or card, as today.
- **CHANGELOG**: the M46 entry says what changed in plain words. It corrects the "Easier on your battery" line at :57 only with the measured number.

## 11. Risks, and what not to change

**Do not change**
- **F27's look**: clear glass water, the shape, the capsule eyes and glint, the ring's look and its exact tracking, the press against the edge (`PRESS_SPRING`), stick and peek.
- **The eyes**: the quieter eyes from the review need the founder's yes and are not in M46.
- **Reduce motion and Less motion** beat every liveliness choice. The ring stays still under them.
- **Rule 5**:
  - The visible light comes before any capture.
  - Quiet and rest never hide the listening or look marks.
  - Listening never parks.
  - The listening ring follows the light and never replaces it.
- **Rule 7**: read only the front app id and the power state. Camera and mic checks stay off by their consts.
- **Rule 9**: the island, ring and overlay stay non activating and never become key.
- **F18**: 40 pt wings while something happens, the pill on displays without a notch, 0.4 s hover open, a click opens Home.
- **Hover panel content (M48)** and moving notch settings under More (M47).

**Risks**
- **Still reads as broken** (F28's own revisit trigger). Mitigation: every state change and touch moves it at once, and Settings and the first run say what Still does.
- **A parked frame caught mid blink or mid sway** looks wrong. The park rule requires eyes open, sway 0 and settled.
- **Loss of the unseen count at rest.** Mitigation: results drop once by themselves, and the count shows on hover.
- **Ring hidden while pointing** is a reading of F28. It can be reversed in `follow::shown` with one test change.
- **Line drift**: line numbers come from this tree. Re-anchor each edit by its symbol, not its number.
- **Stacked PRs**: the Show me how part (6.4) can be its own PR, so the liveliness core lands first.