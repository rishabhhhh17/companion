# Design search for Squibby: fluid, premium, unique, inside the one black look

Date: 6 Nov 2026. Read only research on `m48-launch`. Nothing in the repo was edited.
Stays inside M71 (pure black, colour only as meaning, one structure per screen). No new themes or looks are proposed.

## How to read this

- "From source" means the number is in the page I read. "Our value" means I chose it to fit Squibby, using the source as the idea.
- Squibby already has a strong motion base: the spring table in `app/src/islandSpring.ts` (HOVER 0.38/0.8, OPEN_W 0.36/0.82, OPEN_H 0.42/0.84 after 60 ms, CLOSE 0.45/1.0, WORK 0.3/0.85, written as response/damping), and tokens `--dur-1 120ms`, `--dur-2 200ms`, `--dur-3 240ms`, exits 100/140/180 ms. This file does not replace that. It adds what is missing around it. Springs below use the same "response / damping" form; k = (2 pi / response)^2 and c = 4 pi x damping / response, as `fromResponse` does.
- Things I could not confirm from a primary page (so treated as ideas only): Superhuman's "100 ms" rule (only podcasts and blogs), exact Dynamic Island spring numbers (Apple does not publish them), Sonner's licence (page did not say; check the repo before relying on it), Linear's exact numbers (the redesign post gives method, not values), Warp and Cron/Notion Calendar (searches returned nothing useful).

## What the references actually teach (short)

| Reference | The lesson that transfers | URL |
|---|---|---|
| Emil Kowalski, 7 practical animation tips | Press `scale(.97)`; never animate from `scale(0)` (start at .9 or more, he uses .93); ease-out for enter and exit with a custom curve; under 300 ms (180 ms felt better than 400 ms); `transform-origin` set from where the thing came from; `blur(2px)` on a crossfade when it feels off; skip the delay and animation for the second tooltip | https://emilkowal.ski/ui/7-practical-animation-tips |
| Emil Kowalski, magic of clip-path | Reveal and tab highlights by clipping, not scaling. `inset()` reveals; a duplicated "active" tab list clipped to the active tab, with rounded `inset(... round 17px)` | https://emilkowal.ski/ui/the-magic-of-clip-path |
| Emil Kowalski, Vaul drawer | `cubic-bezier(.32,.72,0,1)` at 500 ms matches the iOS sheet; momentum and flick instead of distance; ignore extra touches; 100 ms guard after reaching the top | https://emilkowal.ski/ui/building-a-drawer-component |
| Emil Kowalski, Sonner toast | Stack: offset 14 px x index, scale down 0.05 x index; use CSS transitions (not keyframes) so a change retargets mid flight; 4 s timer that pauses on hover and when the window is hidden; swipe dismiss at velocity above 0.11 (px per ms) | https://emilkowal.ski/ui/building-a-toast-component |
| cmdk (MIT) | Items become active on pointer enter; arrow keys loop; Escape or Backspace on empty goes back one page; empty state can say the user's own query; async "loading" item | https://github.com/pacocoursey/cmdk |
| Raycast "A fresh look and feel" and developer docs | One bottom action bar: left = current title and toast, right = actions with keycaps; toasts live inside the window; compact mode; a fixed small set of components (List, Detail, Form) all driven by actions with shortcuts; "fast, simple, delightful" | https://raycast.com/blog/a-fresh-look-and-feel and https://developers.raycast.com/api-reference/user-interface |
| Linear, how we redesigned the UI | Colour generated from three inputs (base, accent, contrast) in a perceptually even space (LCH), so equal lightness looks equal across hues; a contrast variable; display type differs from body type; cut scope, ship fast, dogfood behind a flag | https://linear.app/now/how-we-redesigned-the-linear-ui |
| Granola (secondary sources) | Cut half the UI; two screen onboarding (sign in, microphone) so value arrives in the next meeting; rows like Apple Notes, not tiles; progress shown inside the note | https://builtformars.com/company/granola (and our own 30 Oct reference pass) |
| Dia / The Browser Company (secondary) | Arc was too different to adopt; Dia's first goal is "switch on a Tuesday morning with no learning curve". Lesson: be unique in the moments, familiar in the structure. M71's "Mac Settings style" list is exactly that | https://www.thurrott.com/cloud/web-browsers/322287/the-browser-company-explains-its-vision-for-dia |
| Notch apps (NotchNook, Alcove, MewNotch) | Hover = small expand; click or swipe down = full panel; configurable hover delay; drag a file onto the notch; live activities (AirPods, volume) as short wings. All of them are utilities (music, shelf, HUDs). None of them is about outcomes | https://github.com/monuk7735/mew-notch , https://www.imore.com/apps/mac-apps/this-dollar25-app-gives-my-macbook-pro-a-dynamic-island-and-it-was-worth-every-penny |
| Rewind / Limitless (secondary) | A status light so nearby people know it is recording; on device privacy as the pitch. Rewind's screen layer is reported discontinued, a warning about passive capture. Squibby's "visible indicator first" rule is the right side of this | https://bestofai.com/article/a16z-backed-rewind-pivots-to-build-ai-powered-pendant-to-record-your-conversations-techcrunch |

## GitHub repos: ideas only, licence first

| Repo | Licence | Use |
|---|---|---|
| TheBoredTeam/boring.notch | GPL-3.0 | Ideas only. Never copy code. Features worth noting: hover expands, file shelf with AirDrop, HUD replacement. https://github.com/TheBoredTeam/boring.notch |
| monuk7735/mew-notch (MewNotch) | GPL-3.0 | Ideas only. Configurable hover delay, notch vs floating island, per display settings. https://github.com/monuk7735/mew-notch |
| MrKai77/DynamicNotchKit | MIT | Idea: automatic `.floating` style on Macs without a notch (we need this for non notch Macs). Code may be read and, if ever needed, used with its notice. https://github.com/MrKai77/DynamicNotchKit |
| Lakr233/NotchDrop | MIT | Idea: drag a file onto the notch, files kept one day. Basis for signature moment C. https://github.com/Lakr233/NotchDrop |
| pacocoursey/cmdk | MIT | Ask box behaviour (item 8). https://github.com/pacocoursey/cmdk |
| emilkowalski/vaul | MIT (repo now unmaintained) | Sheet feel and the curve in item 4. https://github.com/emilkowalski/vaul |
| emilkowalski/sonner | not stated on the page I read; check LICENSE | In window toasts (item 7). https://sonner.emilkowal.ski |
| Radix, shadcn, Motion | MIT (known, not re-read here) | Not needed in a Tauri page that already has its own tokens; Motion's `visualDuration` + `bounce` spring form is a handy way to think (https://motion.dev/docs/react-transitions): bounce 0 = critically damped, negative = overdamped. |

---

# (a) The 15 improvements

Effort: S = under half a day, M = one to two days, L = three days or more.

### 1. Press and release feel on everything tappable
- Value: on press `scale(.97)` in `--dur-1` (120 ms) ease-out; release back in `--dur-2` (200 ms). Rows press to `scale(.985)` (they are wider, .97 looks too big). Background steps to `--surface-2`, never a colour change.
- Reference: Emil, 7 tips. https://emilkowal.ski/ui/7-practical-animation-tips
- Applies: every button, row, tile, chip in notch hover, Home, lists, review card, settings.
- Effort: S. (`.back` already has press and release tokens; make it one shared class.)

### 2. Enter from where it came from, never from zero
- Value: anything that appears starts at `opacity 0; scale .96; translateY(6px)` and ends at 1 / 1 / 0 in 200 ms with `cubic-bezier(.32,.72,0,1)`. Set `transform-origin: top center` for things that hang from the notch, and the button's own centre for popovers. Exit is 100 to 140 ms, shorter than enter (already your rule). Lists stagger rows by 24 ms, at most 4 rows (so total under 100 ms of delay); anything past row 4 enters with row 4.
- Reference: Emil tips 2, 4, 5; Sonner enters via CSS transition so it can be interrupted. https://emilkowal.ski/ui/building-a-toast-component
- Applies: hover panel rows, Home lists on place change, review card, approvals, chips.
- Effort: S.

### 3. Notch hover with intent, not just proximity
- Value: open the hover panel only after the pointer has dwelled 90 ms inside the notch zone, or immediately if it enters slowly (under about 600 px per second). Fast fly-bys across the menu bar do nothing. Close with a 250 ms grace and a safe zone (the rectangle from notch to panel) so moving toward a button does not close it. Once the panel has shown, a second open within 1.5 s skips the delay (the Emil "second tooltip" rule). Hover spring stays HOVER 0.38/0.8. Users get a Settings control for the delay (0 to 400 ms, default 90), matching "customizable everything" and MewNotch's configurable delay.
- Reference: MewNotch hover delay; NotchNook hover then click; Emil tip 3. https://github.com/monuk7735/mew-notch
- Applies: notch hover. Also fixes NotchNook's reported hangs and accidental opens as a quality bar.
- Effort: M.

### 4. Home open: reveal content by clipping, so words never stretch or scale
- Value: keep the width then height springs you have (OPEN_W 0.36/0.82, OPEN_H 0.42/0.84 after 60 ms). Inside, the content is not scaled: it sits at final size and is revealed by `clip-path: inset(0 0 var(--hidden) 0 round 22px)` tied to the shape's height, so the bottom edge uncovers the lead first, then the list. Content fades in from 40% of the way down (opacity 0 to 1 over 160 ms), lead first, list 40 ms later. The close is the reverse, critically damped (CLOSE), words leave first (you already hold 80 ms).
- Reference: Emil clip-path https://emilkowal.ski/ui/the-magic-of-clip-path ; Vaul curve `cubic-bezier(.32,.72,0,1)` https://emilkowal.ski/ui/building-a-drawer-component (it is also a good CSS fallback if the JS spring is not running: 420 ms).
- Applies: Home open and close.
- Effort: M.

### 5. Places bar: one sliding highlight, not four separate states
- Value: the place you are on has a soft colour pill (colour at 18%, text form for the label). When you switch, the pill does not fade out and in; it moves, on a spring of response 0.26, damping 0.92 (k 584, c 44.5), and the pill's colour crossfades blue to purple over the same time. Technique: draw the bar twice, the second copy in "active" style, clipped to the active item with `inset(0 R 0 L round 10px)`. Content below slides 12 px horizontally in the direction of travel with a 160 ms fade. Tile colours stay solid.
- Reference: Emil clip-path tab technique. https://emilkowal.ski/ui/the-magic-of-clip-path
- Applies: Home places bar, Settings side list, Learn/History filters.
- Effort: M.

### 6. State swaps in the lead crossfade with a tiny blur
- Value: when the lead changes (Working to Proven, Problem to Fixing), old text leaves with `opacity 0; filter blur(2px); scale .97` in 120 ms and the new text enters from `blur(2px); scale .97` in 180 ms. The tag colour changes by colour transition over 200 ms. Height changes ride the same spring as the shape (no jump). `text-wrap: balance` on the headline, `pretty` on the line under it. Numbers use `font-variant-numeric: tabular-nums` and count up over `--dur-count` (300 ms).
- Reference: Emil tip 7. https://emilkowal.ski/ui/7-practical-animation-tips
- Applies: Now lead, project chip dot, hover panel fact line, History counts.
- Effort: S.

### 7. A Raycast style action bar, and toasts that live inside Home
- Value: a 32 px strip at the bottom of Home (above the ask box on Now): left, the status or toast as one line in 12 px `--fg-2`; right, up to two actions with keycaps (`⏎ Check it`, `⌘K More`). Keycaps: 11 px SF Mono, 18 px tall, 5 px radius, `--surface-2` fill, `--edge` hairline. A toast replaces the left text (crossfade as item 6), stays 4 s, pauses on hover and while the window is hidden, and offers one action (Undo). If two arrive, stack the older one behind: 14 px offset, scale .95 (from Sonner). Swipe or flick to dismiss above 0.11 px per ms.
- Reference: Raycast action bar https://raycast.com/blog/a-fresh-look-and-feel ; Sonner https://emilkowal.ski/ui/building-a-toast-component
- Applies: Home (all places), review card (Keep / Undo), settings saved confirmation ("Saved" for 1.2 s on the left of the bar).
- Effort: M. (You already have keycaps in M40; this gives them a fixed home.)

### 8. The ask box behaves like a command palette
- Value: as you type, the list under it shows matching actions and past asks ranked; the first is highlighted. Highlight moves on pointer enter and with arrow keys; arrows loop. Return runs the highlighted item; Escape clears, a second Escape closes the box; Backspace on empty goes back one step. Empty result says your words: `Nothing called "login page". Ask Squibby to do it?` with one button. While the engine thinks, show one pending row (spinner arc 12 px, 1.5 px stroke, 0.8 s linear) so there is never a silent gap. Send button is blue only when there is text.
- Reference: cmdk (MIT) https://github.com/pacocoursey/cmdk ; Raycast `isLoading` on top level components https://developers.raycast.com/api-reference/user-interface
- Applies: Now ask box, Learn search, hover panel buttons.
- Effort: M.

### 9. One keyboard model for the whole of Home
- Value: `⌘1` to `⌘4` places, `⌘,` Settings, `⌘K` actions for the selected row, `↑ ↓` move one highlight, `⏎` primary, `Esc` steps back one level (ask box, then detail, then close Home), `⌥` held reveals keycaps on every row (so the screen is clean by default). One highlight slides between rows on a spring (response 0.22, damping 0.9: k 816, c 51.4). Focus ring: 2 px `#0A84FF`, 2 px offset, shown for keyboard use only. The global stop hotkey keeps working everywhere and is always printed in the bar.
- Reference: Raycast shortcuts on every action; cmdk. https://developers.raycast.com/api-reference/user-interface
- Applies: Home lists, review card, settings. Respects rule 9 (no focus stealing) because it applies only once Home has been opened.
- Effort: M.

### 10. Fix it progress shown in place, in plain words, with time
- Value: the lead becomes the progress. Tag "Fixing" (blue, soft). Headline in present tense, one line ("Fixing the login button"). Under it a 2 px line in blue that grows with real steps only (never a fake fill). Steps listed as rows below: done = green tick drawn in 240 ms (`stroke-dashoffset`), current = 12 px blue arc, waiting = grey dot. A finished step's row collapses to one line after 600 ms. After it ends: "Worked for 14 s" in `--fg-2` (once the engine sends real time; never guess). Stop is always one tap, red text form, in the bar.
- Reference: Granola progress in place and Linear "Worked for 10 sec" (from the 30 Oct reference pass, `docs/design/2026-10-30-reference-pass.md`); Raycast `isLoading`.
- Applies: Fix it progress, hover panel (same thing in small: dot, one line, Stop).
- Effort: M.

### 11. The proven moment: small, physical, quiet
- Value: sequence in 700 ms. (0 ms) tick draws in the green tile, 320 ms ease-out; (0 ms) the notch wings widen a little and settle on HOVER (you have the cheer); (120 ms) the count of checks counts up 0 to N over 300 ms; (200 ms) the lead swaps (item 6) to the green tag "Proven"; (200 ms) a trackpad haptic tick (`NSHapticFeedbackManager` level change, once, can be turned off in Settings); optional 90 ms soft click sound, off by default. No glow, no confetti, no sparkle (M71 forbids glow).
- Reference: Alcove/NotchNook style short live activity wings https://www.imore.com/apps/mac-apps/this-dollar25-app-gives-my-macbook-pro-a-dynamic-island-and-it-was-worth-every-penny ; Emil "under 300 ms" https://emilkowal.ski/ui/7-practical-animation-tips
- Applies: proven moment, project chip dot (turns green with the same 200 ms colour transition).
- Effort: M (haptics need a Rust call and a Settings switch).

### 12. Review card: receipt first, one decision, undo that stays
- Value: card on `--surface-1`, a 12 percent orange tint only if it is the featured lead. Order: one plain sentence of what changed; "Changed 3 files" with the + / dot / minus marks you already have; a proof thumbnail (16:10, radius 10) when a screenshot exists; then `Keep` (blue) and `Undo` (quiet). After Keep, the card collapses to a one line History row over 240 ms and the bar toast says `Kept. Undo` with the Undo live for 10 s. After Undo, the row flips to the orange "Undone" tag with `Redo`. Never a confirm dialog for Undo, because it is itself reversible.
- Reference: Linear agent receipt card (30 Oct pass); Sonner action toast https://sonner.emilkowal.ski ; the Cursor accept/reject idea (https://forum.cursor.com/t/centralized-review-panel-for-ai-generated-changes/144947 shows users ask for Accept all, Reject all, Mark as reviewed)
- Applies: review card, History rows.
- Effort: M.

### 13. Type and density that read as a real product
- Value (SF Pro only, no extra font): Lead headline 22/26, weight 600, tracking -0.02em. Row title 13/18, weight 600, -0.005em. Row line 12/16, weight 400, `--fg-2`. Tag 11/14, weight 600, +0.06em uppercase. Facts in SF Mono 12/16. Body 14/20. Row height 52 px with a 28 px tile at radius 7 (22 percent of side, Apple's icon ratio), list radius 14, card inset 8 so inner radius is outer minus padding (concentric corners). Home padding 16. Two tone headline stays: first part `--fg`, second part `--fg-2`.
- Reference: Linear (Inter Display for headings, Inter for body) https://linear.app/now/how-we-redesigned-the-linear-ui ; Geist as the example of a paired sans and mono https://vercel.com/geist/font ; your own 4 Nov spec.
- Applies: Now lead, every list, settings.
- Effort: S.

### 14. Make the colours from one recipe, add a contrast control
- Value: define each of the 8 colours once in `oklch()` at near equal lightness (about 0.72 for the solid, 0.80 for the text form, soft = solid at 18% on black), and derive solid, soft, text with `color-mix(in oklch, ...)`. Keep the hex values from M71 as the check values in the contrast test. Add a Settings control "Contrast: Normal, High": High moves `--edge` from .09 to .16 alpha, `--fg-3` from #6E6E73 to #8A8A90, and text forms 10 percent lighter. Reduce Transparency and Increase Contrast from macOS also switch it on.
- Reference: Linear's LCH method with a contrast variable https://linear.app/now/how-we-redesigned-the-linear-ui
- Applies: tokens.css, Settings (Look page, with the existing four knobs; this is accessibility, not a new look).
- Effort: S to M.

### 15. Empty states that invite, and a first run in two screens
- Value: empty list = three parts: a ghost row at 40 percent opacity showing exactly what will appear ("Fixed the login button, proven, 2 files"), one plain sentence ("Nothing yet. Every fix appears here with its proof."), one action. Rows never say "No data". First run is two screens (Granola's lesson): (1) choose or drop your project folder, (2) the notch shows the first check running on it. No account, no tour, no permissions at install (rule 8). Target: first green or first real finding within 90 s of opening, and the first run ends in the same Home the user will use daily.
- Reference: Granola two screen onboarding https://builtformars.com/company/granola ; cmdk empty state saying the query https://github.com/pacocoursey/cmdk ; Dia "switch on a Tuesday morning" https://www.thurrott.com/cloud/web-browsers/322287/the-browser-company-explains-its-vision-for-dia
- Applies: History, Memory, Learn empty states, first run.
- Effort: M.

---

# (b) Three signature moments for a YC demo

All three obey the rules: no passive watching, no glow, no gradients, black with colour as meaning, plain words.

### A. "The notch catches the fix" (about 14 seconds, shows the whole product)
1. 0.0 s. The founder's pointer touches the notch. After a 90 ms dwell it breathes open on the hover spring into a small black panel: `my-shop` with a green dot, "Checked fine 2 hours ago", three buttons with colour tiles.
2. 1.5 s. They type into the ask box: "the checkout button does nothing". The first ranked row appears with the first keystroke; Return.
3. 2.0 s. The panel grows into the lead without a jump: blue tag "Fixing", headline "Fixing the checkout button", the project dot turns orange. A 2 px blue line starts under the headline.
4. 2.0 to 11 s. Steps tick in plain words ("Found the button", "Changed 1 file", "Opened your shop to try it"). Each tick draws in 240 ms; the line grows only when a real step ends. The notch's wings stay small and show one blue dot, so the user can close Home and keep working.
5. 11.0 s. A real browser check passes. The notch wings widen once on the cheer spring, the trackpad gives one soft tick, the tile draws a green tick, the count goes 0 to 3 checks in 300 ms, the dot turns green. Headline: "Checkout works. Proven just now."
6. 12.5 s. A card slides in beneath: "Changed 1 file" and a thumbnail of the real page. Buttons: Keep, Undo. The bar says "Worked for 11 s".
7. 14 s. They press Keep. The card collapses into a History row. Home closes with the critically damped spring; the notch shows a single quiet green dot.
Why it is unique: the viewer sees a non engineer ask in plain words and get proof, not a transcript, in the one place already on screen.

### B. "Undo as rewind" (about 6 seconds, shows the trust layer)
1. 0.0 s. History is open with today's fix at the top (green tag, "3 files changed").
2. 0.5 s. The user hits `⌘Z` (or taps Undo). The row's keycap flashes the pressed state (scale .97).
3. 0.6 to 1.4 s. The three changed files in the row slide away in reverse order, 40 ms apart, each marked "restored". The shadow snapshot is named: "Back to how it was at 2:14 pm".
4. 1.4 s. Tag crossfades green to orange: "Undone". The project dot turns orange. Bar toast: "Undone. Redo" with a 10 s timer.
5. 3.0 s. They press `⌘⇧Z`. Everything runs forward again: orange to green, files return in order. The viewer sees that nothing is ever lost and git was never touched (rule 10).
Why it is unique: every AI coding demo shows "do"; none show a safe, instant, two way "undo" with plain words. It sells the trust layer in 6 seconds.

### C. "Drop a folder on the notch" (about 20 seconds, the first run)
1. 0.0 s. A fresh install. The user drags their project folder from Finder toward the notch. As the drag enters the zone, the notch opens a drop target on the hover spring: a black rounded rectangle with the words "Drop to bring in my-shop" and a folder tile in blue. (Idea from NotchDrop, MIT. Drag-over is a user action, so it is allowed; nothing is watched.)
2. 1.5 s. They let go. The folder name settles in; the panel grows into the lead: blue tag "Looking", "Getting to know my-shop".
3. 2 to 14 s. Three real steps tick: "Found a shop built with Next", "Ran its checks", "Opened it in a browser".
4. 14 s. Result lead, in whichever colour is true: green "Working. Proven just now" or orange "Take a look: 2 things to fix" with the first one as a row and `Fix it` blue.
5. 18 s. A second screen of onboarding is only the Settings basics (key or sign in), after the user has already seen value.
Why it is unique: onboarding is a single gesture, and the first screen the user sees is the real product, using the notch as the front door, not a tour.

---

# What none of them do (where Squibby can own the space)

1. Notch apps (NotchNook, Alcove, MewNotch, boring.notch) show media, calendars, files. Nobody uses the notch for outcomes. Squibby's notch is a live activity for work being done, ending in a verdict.
2. Linear, Cursor, Warp, Raycast serve engineers. Their language is code. Squibby's four-word verdicts (Proven, Take a look, Problem, Undone) with one colour each are readable by a non engineer in one glance.
3. "Proof" as the home of the UI. Most AI tools end with a chat transcript; Squibby ends with green or not green, and says what was checked.
4. Undo that is visible and fast, with a named snapshot and no git (a rewind, moment B).
5. Visible privacy as a feature: the "indicator lit first" rule can be shown on screen as a brief coloured teal dot when the mic or a capture is about to start. Rewind's story (https://bestofai.com/article/a16z-backed-rewind-pivots-to-build-ai-powered-pendant-to-record-your-conversations-techcrunch) is a reminder why this matters to a YC audience.
6. One structure that never changes (M71) with one colour per meaning: a user learns it once. This is the opposite of Arc's lesson (too different to adopt) while still being memorable.

---

# (c) Do not list

1. No glow, halo, gradient, glass blur, or neon on surfaces. M71 forbids it and "AI gradient" is the most generic look in the category.
2. No sparkle icons, magic wands, or "AI" badges on buttons. Name the outcome ("Fix it", "Check again").
3. No confetti, fireworks, bouncing mascots, emoji, streaks, or praise ("Great job!"). AGENTS.md rule 16. The proven moment is a tick, a count, a haptic.
4. No springs with visible wobble on lists or text (overshoot above about 1 percent). Overshoot is for the notch shape only, and close is always critically damped.
5. No animation over 300 ms for a UI response (exception: the notch shape itself, which is a physical object). No stagger longer than 100 ms in total.
6. No fake progress. A bar or line grows only on real steps. No spinners that last past a second without a sentence next to them.
7. No toasts that cover content, and no modal confirm for reversible actions (Undo exists instead).
8. No card inside a card, no more than one list per screen, no more than one primary button per lead (M71).
9. No colour for decoration. If a thing is blue it is an action or Now; orange is "take a look" or History; never "because it looks nice".
10. No skeleton shimmer sweeps across black; use a still ghost row at 40 percent opacity or the 12 px arc.
11. No custom font stack, no second display face. SF Pro and SF Mono feel native; a web font would feel like a website in a window.
12. No stock illustrations, 3D blobs, or "hero" images. The real product (proof thumbnails, file names, exit codes) is the illustration.
13. No tutorial tour, coach marks, or "Welcome to Squibby!" carousel. Teach by doing (moment C).
14. No tooltips on touch targets that already have a visible label, and no delay on the second tooltip.
15. No hover panel that opens on a fly by. Dwell first (item 3).
16. No copying GPL code (boring.notch, MewNotch). Ideas only. Check Sonner's licence before adding it; the in window toast is easy to write ourselves.
17. No marketing words in the UI: "supercharge", "magic", "seamless", "unlock". Plain words (AGENTS.md style: short sentences, no em dashes).
18. No dependence on motion for meaning. Reduce Motion and Less motion turn every item above into a plain 120 ms fade, and the haptic and sound stay optional.

---

## Suggested order (if the founder wants one pass)

1 (S), 2 (S), 6 (S), 13 (S), 14 (S) first: no new logic, big feel change. Then 3, 4, 5 (the notch and Home open). Then 10, 11, 12 (the proof story, which is the demo). Then 7, 8, 9, 15. Moments A to C need items 3, 4, 10, 11, 12 and 15 first.

Sources used: URLs inline above. Pages that did not load or gave no numbers: Superhuman blog (404), Sonner site (404), Apple SwiftUI spring page (summary only), Vaul README (summary only).
