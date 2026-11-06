# M73: fluid

Status: plan written and built on m48/launch (6 Nov 2026), not committed. The founder's checks on a real Mac are still open (the end of this file).

## Why

The founder, 6 Nov 2026: "make sure the design is compatible with all the YC companies. My aim is to be in YC, and I need it to be very good and very fluid. I need it to be something unique."

The look is fixed (M71: one black look, colour only as meaning, one structure). M73 changes how it feels, not how it looks: what answers a press, how things arrive and leave, and the few moments that sell the product in a demo. Source: `docs/design/2026-11-06-yc-design-search/design-search.md` (15 improvements, 3 signature moments, a do not list).

## Rules this milestone keeps

- M66: only opacity and transform move (clip-path for a reveal, a colour may fade). Every enter has a shorter exit. Reduce motion and Less motion keep a 120 ms plain fade and nothing else (style.css already does this for every element, so every new motion below is covered by it). A design search idea that breaks an M66 rule is built only if measured in the harness and recorded here.
- The founder for M73: words never scale. Enters that carry words rise and fade; they never grow from a smaller size. (A press on a button still goes to .97, as it does today.)
- Rule 9: panels never take focus. Home's keys work only after the person clicked into Home (Home is key only then).
- F28: no new global hotkeys. Every key below is inside Home's own page.
- Haptics only through haptic.rs and its one setting (`island.haptics`, off by default).
- M71's lint and the do not list: no glow, gradient, blur, confetti, sparkle, praise.
- Strings only in strings.ts, colours only in tokens.css, motion only on the motion tokens (tokens.css, motionTokens.ts and motion.rs agree, tested).

## The 15 improvements

| # | Idea | Build or skip | Why |
|---|---|---|---|
| 1 | Press and release on everything tappable | **Build** | Buttons already press (`.btn`, `--press` .97). Missing: the places, list rows, a row's action, the ask box's chips, the notch panel's buttons. Rows press to `--press-row` (.985). |
| 2 | Enter from where it came from | **Build, without scale** | List rows rise 6 px and fade in on `--dur-2` and `--ease-out`, 24 ms apart for the first four rows, the rest with row four (under 100 ms in all). No `scale(.96)`: the founder's "words never scale". The design search's curve `cubic-bezier(.32,.72,0,1)` is not added: `--ease-out` (.23,1,.32,1) is the same strong ease out, and one fewer curve keeps the system small. Menus and popovers already grow from their button (`transform-origin` set). |
| 3 | Notch hover with intent | **Build part** | Built: once the panel has shown, coming back within 1.5 s opens it at once (the "second tooltip" rule), in island.rs `Hover`. Kept: the 300 ms rest before the first open. macOS tells us only when the pointer enters and leaves the island's window, never its speed, so a 90 ms rest would open on every slow pass along the menu bar (a 185 pt notch crossed at 700 pt a second is 264 ms; island.rs pins this). The person can already set 0.1 s in Settings (`island.openDelay`). The safe zone already exists: the notch and its panel are one window and one shape, so moving down to a button never leaves it. |
| 4 | Home open by clipping | **Build part** | Built: inside Home's content, the lead arrives first and the list 40 ms after it (opacity and transform only). Skipped: the clip-path reveal tied to the shape's height. M70 already rejected it (a clip-path transition repaints the whole of Home every frame) and the content never runs ahead of the shape today (`--seq-notch-content-at`). Frame times for the open and close are measured below. |
| 5 | Places: one sliding highlight | **Build** | Wide Home (the usual): one highlight behind the side list's places moves by `translateY` on `--ease-spring` (`MOTION_SPRING`, no overshoot) and fades its colour from one place's soft colour to the next. The places are all one height, so only transform moves. Tall Home: the row of places has a second copy in the "on" style, clipped to the place you are on (`clip-path: inset(... round)`), which slides to the next. Measured below (it is a small strip, not the whole page). The content's 12 px sideways slide is skipped: the places already arrive with their own rise (`--slide-place`) and two motions at once break "one thing moves at a time". |
| 6 | Lead crossfade | **Build, without blur or scale** | The headline and its line keep the old words for their exit: the old fade out in 120 ms on the exit curve while the new rise in 4 px over 200 ms, in the same place, so nothing blinks. Tags fade their colour over 200 ms. Skipped: `blur(2px)` (M66 forbids animating a blur) and `scale(.97)` (words never scale). Already there: `text-wrap: balance` and `pretty`, `tabular-nums` on changing numbers. |
| 7 | Action bar and toasts inside Home | **Build part** | Built: a toast in Home sits inside Home's black shape, at the foot of the page (never over the desktop below it); it pauses while the pointer is on it (already) and while the window is hidden; a toast with no action goes after 4 s, one with Undo after 10 s. Skipped: the 32 px action bar with keycaps. It would be a sixth part on every place, and M71 fixed the structure at five. Skipped: stacking (one toast at a time; a new one replaces the old). |
| 8 | Ask box as a command palette | **Build** | Inside today's ask box, no new key. As you type, a short list under it: first "Ask Squibby" with your words (what Return did before, so nothing changes unless you move), then matching actions (Check my project, Review changes, Undo last change, Check before going live, Learn, History, Memory, Settings) and your own past asks. Arrows move the highlight and loop; Return runs it; Escape clears the words, a second Escape closes Home as before. Pure ranking in `palette.ts`, tested first. Actions that change files still ask first, exactly as from their own buttons. Skipped: the spinner row (the lead already shows Working at once). |
| 9 | One keyboard model in Home | **Build part** | Built, only once Home has the keyboard (after a click, rule 9): Command 1 to 4 for Now, Learn, History, Memory; Command comma for Settings (already there); Up and Down move between the rows of the one list; Escape steps back (ask words, then Home). Skipped: Option held to show every key, and a second highlight sliding between rows (the focus ring is the highlight; two would compete). |
| 10 | Fix it progress in place | **Build part** | Already there: the step under way of four, the run list from the engine's real states, each file as it changes, time so far, Stop. Built: a 2 px blue line under the step count that grows only when a real step ends (the step number from runList.ts, never a timer); "Worked for 14 s" on the finished result, from the engine's own start and end times, never guessed. |
| 11 | The proven moment | **Build** | Already there: the tick draws itself (`ui-mtag-tick`), the notch's wings cheer once. Built: the trackpad taps once when a fix is proven (haptic.rs, the same `island.haptics` switch, off by default; its words now say both), the project's dot fades to green over 200 ms. Skipped: counting the checks up. The lead does not show a count of checks, and adding one only to animate it is noise. No sound. |
| 12 | Review card receipt first, Undo that stays | **Build part** | Already there: the result's verdict, the files changed with their marks, the before and after pictures, Keep (blue) and Undo. Built: after Keep, a toast "Kept" with Undo for 10 s. Its Undo opens History with that task's Undo question under its row. Changed from the search: Undo still asks first (rule 13 and M70: Undo asks first), so there is no instant Undo. |
| 13 | Type and density | **Build** | Mostly there (lead 22, tag 11/14 uppercase, row line 12/16, rows 52, tiles 28). Changed: a row's title 13/18 weight 600 (was 15), the lead's headline on 26 (was 27), the list's corners 14 (was 16), a row tile's corners 7 (was 8). Tokens only. |
| 14 | Colours from one recipe, a contrast control | **Build part** | Skipped: the oklch rewrite and a Contrast setting (M71 fixed the look and its knobs; the hex values are measured in system.test.ts). Built: when macOS asks for more contrast (Increase contrast), hairlines and the faint marks get stronger by themselves (`prefers-contrast: more`). That is accessibility, not a look. |
| 15 | Empty states that invite | **Build** | An empty list shows one example row at 40 percent, exactly what will appear ("Fixed the sign up button, Proven · 2 files changed", a picture only, hidden from VoiceOver: the empty row under it says it in words), then the sentence and the one action it already has. History and Learn first; Memory already has its example line. The first run's two screen idea is the first run as it is (M72), not reopened here. |

## The three signature moments

| Moment | Build or skip | Why |
|---|---|---|
| A. The notch catches the fix | **Built from its parts** | It is items 3, 6, 10, 11 and 12 in a row: hover open, the ask, Fixing with real steps and the growing line, the tick, the tap and the dot turning green, Keep with Undo. Nothing new on top. To be checked as one take on the real Mac. |
| B. Undo as rewind | **Build part** | Already there: Undo asks, puts the safety copy back, the row turns orange "Undone", and Bring the fix back offers the redo. Built: the tag fades from green to orange (item 6) instead of switching. Skipped: files sliding away one by one (the History row shows a count, not a file list, and adding a list to animate it breaks one list per screen); Command Z (Undo always asks first, and a key that asks is a confirm dialog by another name). |
| C. Drop a folder on the notch | **Exists, noted** | Dropping on the notch already lights it (F19, `data-drop="over"`) and opens its choices in Home, with "Fix this project" for a folder (`drop_open_project`), which picks the folder and checks it. Not built: the words "Drop to bring in my-shop" in the notch while dragging. The island's window is only the notch's size at rest and growing it during a drag is native window work, so it waits for the real Mac. |

## Files

- `app/src/ui/tokens.css`, `app/src/motionTokens.ts`: `--stagger-row` 24 ms, `--rise-row` 6 px, `--stagger-list` 40 ms (STAGGER_ROW_MS, STAGGER_LIST_MS, tested equal). The type tokens of item 13. `prefers-contrast: more`.
- `app/src/ui/parts.css`, `app/src/ui/parts.tsx`: presses (1), row enters (2), the side list's highlight (5), Swap (6), the toast in Home (7), the ghost row (15).
- `app/src/ui/partsLogic.ts`: the stagger and the highlight's place, pure.
- `app/src/palette.ts` (new): the ask box's list, pure. `app/src/card.tsx`: the palette, Home's keys, the toasts, Worked for, the step line.
- `app/src/homeKeys.ts` (new): what a key does in Home, pure.
- `app/src/homeSide.tsx`, `app/src/ui/homeShape.css`, `app/src/ui/homeNow.css`, `app/src/ui/black.css`, `app/src/ui/fix.css`.
- `app/src/island.tsx` (tells the shell a fix was proven), `app/src-tauri/src/island.rs` (the quick reopen), `app/src-tauri/src/haptic.rs` and `main.rs` (the tap on proven).
- `app/src/strings.ts`: every new word.

## Tests (first)

- `motionTokens.test.ts`: the new tokens equal in tokens.css and motionTokens.ts.
- `ui/motionLint.test.ts` stays green (only opacity, transform, clip-path and colours move). New `m73Fluid.test.ts`: every tappable part presses; rows enter with no scale; the stagger stops at row four; the highlight moves only by transform; Swap keeps the old words for the exit and none under reduced motion; the toast in Home sits inside it; the empty row's example is hidden from VoiceOver.
- `palette.test.ts`: the ask row is always first; matches rank by the start of a word; past asks deduplicated; at most six rows; arrows loop; nothing for empty words.
- `homeKeys.test.ts`: Command 1 to 4, Escape steps back, no key works while composing, none with Control or Option.
- island.rs: the quick reopen within 1.5 s, and not after; a pass still never opens it.
- haptic.rs: taps once as a fix is proven, only with the switch on; never again for the same result.

## Results (6 Nov 2026)

### What changed from the plan while building

- **Swap timing.** The first strip showed the old and new headlines reading over each other for about 80 ms. The old words now leave on `--dur-exit-menu` (100 ms, linear) and the new start 40 ms later (`--stagger-list`), so they overlap only while the old are mostly gone.
- **The side list had two highlights.** black.css gives the open place its own soft fill with a stronger selector than parts.css, so the place lit at once while the sliding highlight was still on its way. With the slide on, the open place's own fill (and its hover) is clear: one highlight.
- **The tall row's highlight was measured from the wrong frame.** It now measures against the row itself, and puts itself in place without motion when the row changes size (a font arriving, Stop showing).
- **Lint lists grew by name, with reasons.** styleLint's fills list takes `.side-glide` (the open place's soft fill, as `.sb-item[data-c]` was) and `.run-line` (2 points tall); a11y's fixed heights list takes `.job .run-line` (it holds no words).
- **Undo keeps asking first.** The design search wanted no confirm for Undo; rule 13 and M70 say Undo asks first, so Kept's Undo opens History with that fix's question.

### Frame times (rAF gaps, ms; headless Chromium at 60 Hz, five opens and five closes each, 2x scale)

| Moment | Before M73 (M72 build): max / p95 | After: max / p95 | Frames of 33 ms or more |
|---|---|---|---|
| Home opening, wide, normal CPU | 18.3 to 19.8 / 18.2 to 18.7 | 18.5 to 18.8 / 18.1 to 18.5 | 0 / 0 |
| Home closing, wide, normal CPU | 18.6 to 19.7 / 18.2 to 18.7 | 18.4 to 18.8 / 18.4 to 18.6 | 0 / 0 |
| Home opening, tall, normal CPU | 18.5 to 19.7 / 18.4 to 18.6 | 18.5 to 21.0 / 17.9 to 18.5 | 0 / 0 |
| Home closing, tall, normal CPU | 18.6 to 19.0 / 18.5 to 18.7 | 18.5 to 19.8 / 18.0 to 18.5 | 0 / 0 |
| Home opening, wide, 4x slower CPU | 18.6 to 20.0 / 18.2 to 18.7 | 18.8 to 23.0 / 18.4 to 18.8 | 0 / 0 |
| Home closing, wide, 4x slower CPU | 18.8 to 21.4 / 18.0 to 18.8 | 18.8 to 20.6 / 18.0 to 18.7 | 0 / 0 |
| Home opening, tall, 4x slower CPU | 18.8 to 22.1 / 18.2 to 19.1 | 18.9 to 20.8 / 18.2 to 18.6 | 0 / 0 |
| Home closing, tall, 4x slower CPU | 18.7 to 21.1 / 18.4 to 18.9 | 18.5 to 21.5 / 18.1 to 18.5 | 0 / 0 |
| Place switch, wide (transform) | 18.2 to 18.7 | 18.3 to 19.1 | 0 / 0 |
| Place switch, tall (clip-path strip) | 18.2 to 18.9 | 18.5 to 18.6 | 0 / 0 |

The headless clock ticks at 16.7 ms with about 2 ms of jitter, so every gap here is one frame; no frame was dropped before or after, at either CPU speed. The clip-path highlight on the tall row (an M66 "measure first" case) costs nothing measurable: it is a strip about 400 by 34 points, not the whole of Home, which is why M70's rejection of a clip on Home does not apply to it. Raw numbers: `scratchpad/m73-shots/frame-times.json` (after) and `scratchpad/m73/base-frames.log` (before). Native window motion is not in the page and needs Instruments on the real Mac.

### Shots and strips

In the session scratchpad, `m73-shots/`: stills (`stills/`: wide and tall at rest, working, proven, Kept with Undo, History empty with its example row, the ask box's list and its lit second row, Reduce motion), strips (`strips/<name>/NNN.png`, a PNG every 16 ms on a clock slowed 20 times) and one contact sheet per strip (`sheet-<name>.png`): notch hover to panel, panel to Home (wide, tall), Home closing (wide, tall), place switch (wide, tall), lead change (rest to working), a Fix it step ending, Fix it to proven, Undo as rewind (History's row green to orange).

Looked at frame by frame: the shape grows with no overshoot past one settle and the content never leads it; the lead arrives at about 352 ms and the list at about 384 ms; the highlights slide and change colour with no second highlight; the tick draws in at about 200 ms after proven; "Worked for 14 s" arrives with the result; no word scales.

### [verify] on the founder's Mac

1. Point at the notch, move away, and come back within a second: does the panel open at once the second time? And a slow pass along the menu bar still opens nothing?
2. Turn on "Tap the trackpad when the notch opens or a fix is proven", keep a finger on the trackpad, run a fix to proven: one tap, once?
3. Switch places in both layouts: one highlight slides, no flash.
4. Type "check" in the ask box: the list shows above the box; Down then Return runs Check my project; Escape clears the words, a second Escape closes Home.
5. Click a row in History, then Up and Down: the keyboard moves row to row. Command 1 to 4 open the places.
6. Keep a proven fix: Kept with Undo for ten seconds; Undo opens History with its question.
7. Instruments, Animation Hitches: 20 opens and 20 closes, no hitch over one frame at 120 Hz.
8. Signature moment A as one take, and C: drag a folder onto the notch (it lights; its choices open in Home).
