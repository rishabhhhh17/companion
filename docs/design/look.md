# The look (rules for every screen and every character)

Written after the first hands on Mac session (26 Oct 2026), where the founder said the app looked bad, the card was complicated, replies were in a small box, and Flowflow was "a photo in a square box". These are the rules the real app follows now. They are not a brand: no colour, font or shape has been chosen. The founder has not picked a visual direction, so the app is calm, neutral and simple, and the motion carries the personality. Everything here is in `app/src/style.css` as tokens, `app/src/skins.ts` and `app/src/flow/`.

## 1. Black and white base

- The chrome is black and white and follows the Mac's own light and dark. Light: white page, near black words. Dark: black page, near white words. The greys are neutral (no hue at all). `skins.test.ts` checks the tokens are grey.
- Never blue, never orange, never one colour everywhere. The old orange accent is gone from the stylesheet (`look` tests and `skins.test.ts` check).
- Three semantic colours stay, only as small marks: green for checked, amber for waiting for your yes, red for a refusal. Never a coloured box or a coloured edge. A waiting job gets a small amber dot before its headline, a tab that needs you gets a dot, nothing more.
- The one filled button is black on white (or white on black). It is the one thing to do next.
- System font only (`-apple-system, "SF Pro Text"`). No new fonts, no web fonts, nothing from the network.

## 2. A character is a skin

- A skin is one entry in `app/src/skins.ts`: its id, its folder of poses, its one cool hue and the numbers of its motion.
- Flowflow (water): its own motion and one cool hue (a blue), only on or around the character: the glow ring while it listens or when a file is over it, and the droplets.
- The chrome never reads a skin. Home, the island, Settings, the first run and the pointer do not import `skins.ts` (Home's Flowflow comes through `characters.ts` and `flow/`, as the dock's does). The glow rules take the hue from `--skin-glow`, set on the character's button only.
- A new character is a folder of poses (same size, see through, premultiplied), a skin entry and its motion numbers. Nothing else changes.

## 3. Everything lives in the notch island, one thing at a time

- The island and Home are black like the notch. Home is one black panel that hangs from the notch (27 Oct 2026, after the founder found the side list "complicated" and asked for fun, like the notch apps): square at the top, a 30 point radius at the bottom, black with white words in both Mac themes (its own tokens, `:root.home-page` in `style.css`). Its window and panel paint nothing (main.rs), so only the shape shows, with a hairline edge.
- The island (27 Oct 2026, the founder: "it does not always have to show Ready there", "this needs to be fun"):
  - Idle it is the bare notch (or a small 72 point pill, or the thin line), with no words ever. "Ready" is gone from the strings.
  - The pointer resting on it: Flowflow (the peek pose) pops down from under the notch edge with a spring overshoot, a wobble and now and then a blink, and tucks back up when the pointer leaves. One line under it only when there is something real to say (not connected, an update, the engine stopped, a failing watch).
  - While something happens: wings, 40 points each side of the notch, in the menu bar row only (`island.rs` `WING`). Left, a tiny Flowflow in the state's pose, swimming. Right, one live mark: dots (thinking), a spinning arc (working, looking), bars (listening, the microphone's light), a pulsing amber dot (needs you), a green tick that draws itself (done; the wings tuck back after 4 s), a red dot (error, failing watch).
  - The pointer on the wings: one line below them, 300 points wide, cut with an ellipsis.
  - Motion: the window changes size at once and the page springs its black shape inside it (`islandSpring.ts`, about 0.35 s, one small overshoot); getting smaller, the window waits 320 ms for the shape to tuck back. With reduced motion or Less motion everything is simply there. The island's name for VoiceOver always says the state in words.
- No side list and no title bar. The top row has small round buttons only: What I did, Learn, Memory (each opens inside Home with a back arrow and its name), the gear (Settings in its own window; inside Home until the app has that window) and Close. The open one is filled white; a place that waits for you has a small amber dot.
- Now: Flowflow on the left, large and moving (`homeCharacter.tsx`, the dock's own pose for each state), and beside it the job in big words (22 points) with one short line under it (`homeHero.ts`). Under them, across the width, one ask box (16 points, "Ask anything or describe the problem") with the mic and the one filled button inside it, then three quick actions as a drawing and a word: Find the problem, Explain an error, Show me. The other ways to ask and the options stay behind "More ways to ask".
- A result (an answer, a receipt, research, a rescue, an explanation, Second Look, a question waiting for you) is a big card below, on a slightly lighter black, with 16 to 17 point words, ticks for what was checked and the cost.
- Undo and Stop are small pills at the bottom, only when they can act: Undo after a task that changed files, Stop while something works (with the key that stops everything beside it).
- The folder and the watches are one quiet line at the foot of Now.
- Home is 640 points wide (680 with Large, island.rs `HomeSize`) and as tall as what it shows, from 300. Large stops at 680 so the character, 160 plus its margin, still fits beside Home on a 1024 wide display (720 failed that check).
- It springs down out of the notch at each opening (scale from the top centre and a fade, 320 ms), and its contents follow a beat later. None with Reduce motion or Less motion.

## 4. Replies are read, not squinted at

- A reply (an answer, a result, an explanation) is 16 px at the usual size, line height 1.5, in a line of about 45 to 70 characters (`.answer`, `max-width: 68ch`). Never in a small box.
- A job has no box: room and a hairline between two jobs. The receipt is one block: what changed, a tick for what was checked, then what it cost and how many files in three small facts.

## 5. Type and space as tokens (`style.css`, `:root`)

Type is in rem, so the text size choice in Settings reaches every word. At the usual 14 px root:

| Token | Size | Used for |
|---|---|---|
| `--t-caption` | 12 | tiny facts, the pill under the character, a word in the ring |
| `--t-small` | 13 | muted notes, the folder line, the summary of a quiet section |
| `--t-body` | 15 | every line, every button |
| `--t-answer` | 16 | a reply, the ask box |
| `--t-title` | 19 | a headline (`h2`) |

Space: `--space-1` to `--space-6` are 4, 8, 12, 16, 24, 32 px. Radius: `--radius` 10, `--radius-pill` for pills and the main button. Targets: a button is at least 32 points high; a target on the drop ring is 44 points.

## 6. Motion principles

- Spring physics, not eased tweens, for the body: the character is a damped spring. Underdamped (it overshoots once and settles), never jelly that never stops. Numbers in the skin; tests in `app/src/flow/physics.test.ts`.
- Ease out for everything the interface does (`--ease: cubic-bezier(.2, .8, .2, 1)`), 150 to 300 ms (`--dur-fast` 150, `--dur` 220, `--dur-slow` 300). The liquid dissolve between poses is about half a second because it is the character, not a control.
- Interruptible: a new pose during a dissolve waits and only the newest is kept; a touch during a wobble adds to it; nothing blocks a click.
- Quiet when still: breathing is drawn at 30 frames a second, a touch or a drag at 60, nothing at all with less motion once the picture is drawn. The loop stops while the window is hidden.
- Reduced motion (the Mac's, or `character.motion` Less motion, through `motion.ts`): no wobble, no squash, no ripple, no droplets, no dissolve, only a quick plain crossfade. Every stylesheet rule that moves stops with it. The lights that show first (listening, looking at the screen) stay.
- The water must be water: breathing and wobble when idle, jelly lag when dragged or travelling, a squash and a ripple on a click, a dissolve between poses, a soft shimmer, droplets and ripples on a big moment (done).

## 7. What a person can always count on

- Plain words. A productivity tool, never an AI friend (rule 16): no affection, no streaks, no mood.
- Every control is reachable by the keyboard and has a name VoiceOver reads. Colours meet WCAG AA in light and dark (`a11y.test.ts` computes each pair from the tokens).
- The character is see through and floats on the desktop; what it says sits in a small blurred pill that reads on any wallpaper.

## 8. Settings window

- Settings also opens in its own normal Mac window, the way notch apps (NotchNook, Alcove) keep their settings out of the notch. It has a title bar with the product's name and "Settings", close and minimise, is 760 by 560 points, can be resized down to 640 by 460, and follows the Mac's light and dark through the same tokens.
- The same layout as Settings in Home: the side list of Settings' sections on the left (the open one has a fill and a bar), one section at a time on the right, search across everything, grouped rows and real switches. The rules are the same ones in `style.css` (`.side-item`, `.group`, `.setting`, the switches); only the window's grid is its own (`.settings-window`).
- It is the one window that takes the keyboard when it opens, because the person asked for it. There is only ever one: asking again brings it forward. Home and the island open it (`app/src/openSettings.ts`, the shell's `open_settings_window`); nothing opens it by itself.

## 9. Peeking

- With "Rest past the edge of the screen" on (the usual), the character waits mostly out of sight: about three quarters of its body is past the edge it lives on, and at least 10 points of it always show, so the sliver can be pointed at and clicked.
- It peeks about half way in, with a small spring and a lean toward the screen, when something happens: a task starts, finishes or fails, a check runs. It comes all the way in when the pointer reaches it or its sliver, and goes back out a few seconds after the pointer leaves. While something needs the person it stays fully in view until answered.
- The light shows first (rule 5): before it listens or looks at the screen it is fully in view, at once, with no motion.
- Every few minutes while nothing happens it may take a short curious peek ("Take a curious peek now and then", on), never more often than every 3 minutes, never with Reduce motion or Less motion, never during a presentation or a call. With Reduce motion or Less motion every move is a jump.
- It never hides over the menu bar, the notch or the Dock, and never onto another display: on an edge where that would happen (the top, under the menu bar; an edge with the Dock; an edge next to another display) it simply stays in view.
- The geometry and the timing are `app/src-tauri/src/peek.rs` (tested); the page only gets the pose as data (`data-peek`, `data-peek-edge`).

## What is not decided

The founder has not chosen a visual direction. When one is chosen it goes into the tokens and the skin, not into the logic. Until then: neutral, calm, simple.
