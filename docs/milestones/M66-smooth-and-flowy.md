# M66: smooth and flowy

Status: plan, waiting for the founder's yes. Sits on top of M65 (the Instrument look). It changes how things move, their shape and when they appear. It does not change colours, type or layout.

Merged on 4 Nov 2026 from two drafts (the motion plan and the notch plan), after re-reading the code at HEAD (M65, 3f2ace6).

## Why

The founder, 4 Nov 2026: "look at how HeyClicky is, how their flow is so smooth and not buggy, but ours looks so buggy and bad... I need everything to be very flowy and fun to use", and "not just the product, the notch and how the Home screen looks coming down from the notch and everything like that".

HeyClicky is not smooth because of fancy animation. It keeps four habits:

1. It answers your key press in the same frame, before any work starts.
2. Nothing pops in or blinks out. Things stay on screen and fade.
3. Only one thing moves at a time, on one clock.
4. It never shows an empty box waiting to fill.

Squibby breaks all four today. Home opens with two motions fighting (a native drop and a page slide), its window snaps to new heights while the content slides, the island's spring is clipped flat by its window, and the dock character's box jumps when it starts work.

"Fun" means responsive, alive and satisfying: instant acknowledgement, calm settling motion, and one small rewarding moment when a check is proven. Never childish decoration, no confetti, no praise (rule 16).

## What M65 already changed (checked at HEAD)

- **The half second freezes on History, the island wings and the question row are gone in the default look.** Under Instrument the small characters are the orb picture, not live WebGL (`chromeLook.ts miniShows`). The fix stays, but only for Friendly, and moves to Tier 2 (fix 12).
- **The `pose="idle"` bug the motion draft named no longer exists.** The calls are `FlowMini state=...`; nothing passes an invalid pose. Dropped.
- **Instrument already has calmer timings** (150, 250, 250 ms) and a spring curve that never passes 1 (`tokens.css`, the `data-style="instrument"` block). Part 1 folds this into one table for both looks, so both move alike.
- Still true at HEAD, so kept: the island spring is k 560, c 31 (damping 0.65) and clipped by its window; Home's native drop (`home_drop`, `OPEN_SECS` 0.18) runs beside the page's `home-spring`; the peek curve has a 1.45 control point; the dock label joins the layout; trips sleep 16 ms on a thread; the ring lead fix runs only on first show; `.hero` transitions `--char`; `.home[data-element]` transitions eleven colour variables over a raw 280 ms; `--ease-exit` is the same curve as `--ease-out`.

## Checked against the decisions

- **F18 (Home in the notch).** "A resize of Home is never animated" is honoured, and more: Home's native window is set up once at a fixed size and never resized during any motion. Only the shape drawn inside it moves (Part 2, the panel). The window never animates; the page draws.
- **F18, 27 Oct change (wings).** In the menu bar row the island may be the notch plus 40 pt wings each side, and 300 pt wide under the pointer with a line. The notch draft's peek (notch plus 170 pt each side) and its "open width first to Home's width at notch height" both break this, because the app menus and status icons beside the notch must stay clickable. So: in the menu bar row the shape never passes those widths. Home's 380 pt body widens below the menu bar line, joined by the concave shoulders. HeyClicky style islands cover the menu bar when open; we do not, unless the founder says so.
- **F18 (no notch).** The pill stays 120 pt wide at rest inside the menu bar (the draft's 185 pt fake notch would cover menu titles on a 1440 pt MacBook Air, an open F18 concern). It now hangs from the top edge and grows from there, never from a point 2 pt down.
- **F18 (what it may notice).** The draft's 50 ms pointer poll runs only while the pointer is already known inside the island or Home is open, and stops on leave. Position only, no permission, never keys (rule 8). F18's "What it may notice" gets one line saying so.
- **F18 (hover time).** 0.4 s was a build detail the founder can change. It becomes an instant small nudge, then open at 300 ms, keeping the Settings control.
- **F27 and look.md (the character's own body).** Flowflow's own springs (`flow/physics.ts`, `PRESS_SPRING` and its wobble) are the character, not the interface. They keep their numbers. Nothing here touches them.
- **F28 and the 30 Oct review (no bounce).** Going into the edge is a plain ease with no bounce (F28), and Home "unrolls from the notch with a gentle settle and almost no bounce" (the review). The notch springs open with 2 to 3 percent overshoot, inside 24 pt of headroom so it is never clipped. If the founder reads it as bounce (check A3), OPEN_W and OPEN_H go to damping 1.0, one number each. Every close, the edge peek and every other spring never overshoot.
- **Rules.** Panels stay non activating; the ask box takes typing only through today's `makeKeyWindow` path on the person's click (rule 9). Haptics are a new setting, off by default, like sounds. The always ordered in Home panel still obeys Hide from screen sharing, presentation mode and full screen hiding (rule 7, `visibility.rs`), and Stop everything closes it at once (rule 11). Mic and screen only on the hotkey, indicator first (rule 5).

## Part 1: one motion system (everything except the notch shape)

Values live in `app/src/ui/tokens.css`, mirrored in one Rust module (`app/src-tauri/src/motion.rs`, new). A test reads both and fails if they differ. The existing `styleLint.test.ts` grows to fail on raw durations or curves outside tokens.css.

**Curves**

| Token | Value | Used for |
|---|---|---|
| `--ease-out` | cubic-bezier(.23, 1, .32, 1) | every enter, move, land, grow |
| `--ease-exit` | cubic-bezier(.4, 0, 1, 1) | exits only, always short |
| linear | linear | spinners and loops only |

`--ease-enter` and `--ease-move` become aliases of `--ease-out`, then go. Rust gets `ease_out_timing`, a CAMediaTimingFunction with the same four numbers, for every timed window move that is not a spring.

**Durations**

| Token | Value | Used for |
|---|---|---|
| `--dur-1` | 120 ms | press, hover, every exit |
| `--dur-2` | 200 ms | menus, toasts, list rows, the island panel in |
| `--dur-3` | 240 ms | surfaces: sheets, Settings, Home's content arriving |
| `--dur-4` | 320 ms | window trips, the character peeking in |

The M55 named tokens (press, release, hover, enter, exit, move, open, close) become aliases of these four. `--dur-count` and `--dur-flash` stay as listed exceptions. Instrument's own duration overrides are removed so both looks share the table; its overshoot free `--ease-spring` stays, regenerated from the spring below.

**Interface spring.** `MOTION_SPRING = { k: 640, c: 50 }` (damping 0.99): settles within 0.5 pt of a 240 pt move in about 0.33 s and never passes its target. Used by any interface spring that is not the notch shape and not the character's body.

**Rules every surface follows**

- One owner per motion: AppKit or the page, never both.
- Animate only opacity and transform (clip-path for reveals). Never width, height, top, left, radius, shadow, blur or an inherited CSS variable.
- Every enter has an exit at about 60 percent of its time, on `--ease-exit`.
- Keep things mounted and cross-fade by opacity; do not mount on show.
- A new action cancels old motion in the same frame and fades the old over 120 ms. A cancel is never an error.
- Reduce motion and Less motion: no movement (translate, scale, springs), sizes jump, 120 ms linear opacity and colour fades stay.

## Part 2: the notch, one black shape that grows into Home

Today Squibby is two windows: a black notch that springs inside a window cut to its size, and a grey card that fades in 6 pt below. The target: one black (#000) shape that is the notch at rest, widens, drops into Home, and folds back with no bounce.

**Notch springs** (mass 1; k = (2 pi / response) squared, c = 4 pi x damping / response). They replace `ISLAND_SPRING` and `CHEER_SPRING` in `islandSpring.ts` and the Rust constants.

| Name | Used for | Response | Damping | k | c |
|---|---|---|---|---|---|
| HOVER | hover nudge, press, cheer pulse | 0.38 s | 0.80 | 273 | 26.5 |
| OPEN_W | width when opening | 0.36 s | 0.82 | 305 | 28.6 |
| OPEN_H | height when opening, 60 ms after width | 0.42 s | 0.84 | 224 | 25.1 |
| CLOSE | every close and tuck back | 0.45 s | 1.00 | 195 | 27.9 |
| WORK | busy strip and caption line | 0.30 s | 0.85 | 439 | 35.6 |

**Open** (click, or 300 ms of hover):
- Frame 0: input arrives. Shadow fades in on HOVER. Haptic tick only if the new setting is on.
- 0 to 60 ms: width moves on OPEN_W, inside the menu bar row limits above. Shoulders grow 6 to 12, bottom radius 11 to 24, from the same spring progress (never a step).
- From 60 ms: height on OPEN_H, anchored top centre; the body widens to 380 pt below the menu bar line.
- Once the height spring is 98.5 percent there (about 340 ms): Home's content arrives on the one system (opacity, translateY -6 px, scale .97, `--dur-2`, `--ease-out`). Content never leads the shape. **Built, step 5:** at 55 then 80 percent the content's full height frame hung up to 63 px below the body; the frame now has no fill or foot of its own.
- About 500 ms: settled. The ask box takes typing only on the person's click (rule 9).

**Close** (click away, Esc, stop hotkey, pointer leaving a hover opened Home):
- 150 ms grace only for a hover opened Home; a return cancels it.
- Content fades out first, on `--dur-exit-menu` (100 ms), linear. Then width, height, radii and shoulders spring back together on CLOSE, no overshoot. **Built, step 5:** both used to start together, so the content hung below the folding body for about 100 ms.
- A new open during a close starts from the current values and speed, never from the notch rect.

**Hover and peek.** Pointer within the notch plus 6 pt: at once a HOVER nudge (6 pt wider, 2 pt taller) and the shadow. At 300 ms it peeks (if it has something to say, at most 300 pt wide in the menu bar row, status left of the camera, "Open" right, 8 pt clear of the camera) or opens Home. Leaving a peek: 400 ms grace, then CLOSE. After a dismiss, hover does not reopen until the pointer has left once. Hover never swaps a working strip for Home; a click does.

**While working.** The busy strip uses WORK, within the wing widths: orb and state ring left of the camera, two or three words right, nothing over the camera. A caption line grows 18 pt under it. Done is one 4 pt HOVER width pulse inside the headroom. Waiting for approval: "Needs you" and one nudge, no loop.

**Island into Home.** Step 1: Home sits just under the island (levels 26 and 27); its collapsed shape is exactly the island's current shape (rest, peek or strip). On open the island stops drawing on the same frame Home starts; on close the island draws again on the frame Home finishes. No tuck back of the wings while Home drops. **Built, step 5:** Home's collapsed shape is the wings while they show (island.rs `grown_from`, told again when they change), and the island stops drawing once Home's band is 99 percent out (`--seq-island-hide-at`, 240 ms). The peek is not covered: pointing opens Home rather than the peek by default. Step 2, only after step 1 measures smooth: one page draws wings, peek, strip and Home as one shape.

**The panel, and why it stays within F18.**
- Home's panel is created natively (`define_class!` NSPanel subclass, as spike (a) and T01 concluded): Borderless plus NonactivatingPanel (today it is Titled, `main.rs` 218), can become key only for the ask box, never main, `constrainFrameRect` returns the frame unchanged, clear, no window shadow.
- Its frame is Home's widest and tallest (380 by 640) plus 24 pt headroom, centred on the notch. It changes only on a display, setting or Settings change, never during motion and never on content height. `resize_card` becomes a CSS height target on the shape.
- It stays ordered in at alpha 1 with the shape collapsed. Opening is a CSS state change: no orderFront, no stale first frame, no window alpha. Click through: `ignoresMouseEvents` follows "pointer outside the shape", set only when it changes, always on while collapsed.
- The shape is compositor parts only: a top band and a body scaled from top centre, corner and shoulder pieces moved by translate so radii never stretch.
- Springs become CSS `linear()` curves generated from the spring by a pure tested function, with a cubic-bezier fallback under `@supports`. Transitions, so a new target starts from the current value.
- One clock: remove `home_drop`, `DROP`, `OPEN_SECS` and the Rust 200 ms close sleep and orderOut. The page's `transitionend` drives the close. Open and closed state is a React data attribute, not `classList`.
- Why: a native frame animation resizes the web view every step and cannot hold 120 Hz; JS writing width and height relays out every frame. Transform and opacity run on Core Animation at the display's rate.
- Fallback only if the measurements fail: a native CAShapeLayer plus CASpringAnimation behind the web view. It needs `objc2-quartz-core`, a new dependency: ask the founder first.

**Other displays.** No notch: the 120 pt pill hangs from the top edge and grows from it, same springs. No menu bar showing: the 5 pt edge line, Home opens from that top edge. External display with Follow me: a CLOSE fold on the old display and an open on the new one, never a jump; the collapsed panel moves invisibly first. On a screen parameters change: re-read the notch, close Home without motion, rebuild the frame.

**[verify] on a real notched Mac:** the hardware's 11 pt bottom radius by eye; that a Borderless panel gets no system rim; whether a resize can show the old frame shifted; an empty island frame at launch; an always ordered in transparent panel in Mission Control and screen sharing.

## Part 3: fixes, ranked by how much a person would notice

Paths are relative to `app/`. "Harness" is the frame harness (`measure.mjs` in the scratchpad), moved to `evals/motion/`, which records dropped frames and layout shift.

### Tier 1: you notice it every day

1. **Home grows out of the notch as one shape** (Part 2). Removes: two windows 6 pt apart (`island.rs` 265, 429); #111 card with 24 pt corners against a #000 notch; two clocks on open (`main.rs` 1852, `style.css` 140 to 143); `resize_card` cutting the open short; the spring clipped by its window (`island.tsx` 51 to 63); corner radius jumping on a mode change; rAF writing width and height; content clipped mid word on its own 160 ms clock; wings tucking back while Home drops (`main.rs` 1846); the CSS and Rust close timers drifting so a quick reopen blinks (`main.rs` 1972 to 1988); classes wiped by re-renders (`card.tsx` 1078, 1102, 1900). This replaces the motion draft's fixes 3, 4 and 7.
2. **Home shows the right tab on its first frame.** On `closed`, clear the state and reset the tab. The page applies tab and state while collapsed, waits two frames, then opens the shape. Files: `card.tsx` opened and closed listeners, `home.ts`. Proof: a UI test that the tab is set before the open attribute; check A2.
3. **Hover feels dead for 400 ms.** Instant nudge, open or peek at 300 ms (`island.rs` `HOVER_IN_MS`), Settings control kept. Proof: state machine tests; check A1.
4. **Streaming text makes Home wobble.** The streaming text sits in a fixed 4 line box, pinned to the bottom with a top fade. Deltas merge to one dispatch per frame. `useHomeMotion` skips measuring when its structure key (place, shown, card ids) is unchanged. The result grows once when ready. Files: `card.tsx` 2259, `model.ts` 930, `smoothMotion.ts`. Proof: harness on a 200 token stream, no layout shift until ready.
5. **The dock character's box jumps 14 px when it starts or stops.** The label is always absolutely placed under the character and shows by opacity plus scale .96 to 1 on `--dur-2`; the live region stays for VoiceOver. Files: `dock.tsx` 269, `style.css` 41. Proof: harness dock layout shift 0 through idle, working, error, idle.
6. **Trips stutter.** Drive trips from a display link on the main thread (NSView displayLink on macOS 14+, CVDisplayLink otherwise; **[verify]** with the pinned objc2-app-kit). Progress from the link's timestamp, one `setFrameOrigin` per tick, `ROAM_GEN` checked each tick, ease out cubic. Files: `main.rs` 1018 to 1052, `roam.rs`. Proof: a source test that the trip loop never calls `set_frame_moving` or `thread::sleep`; a 120 Hz recording.
7. **Coming in from the edge bounces.** Plain ease out, `IN_SECS` and `OUT_SECS` 0.2; the page gets the times in the `peek` payload instead of the bare 320 and 450 in `dock.tsx` 98 to 99. Files: `peek.rs` 120 to 123. Proof: a test that every control point lies in 0 to 1; check B1.
8. **The water ring trails the cursor on fast sweeps.** `follow_to_pointer` keeps the last position and time and passes the point through `follow::led` (mind the y flip). Only if a recording still shows a trail, move to one click through overlay on the display refresh. Files: `main.rs` 1925, `follow.rs`. Proof: fast sweep recording, ring within one ring width.

### Tier 2: you notice it when it happens

9. **Sheets, menus and toasts blink out.** A `usePresence(open, ms)` hook keeps them mounted with `data-leaving` until the exit ends (sheet 180 ms, scrim 120 ms, menu 100 ms to scale .98, toast 140 ms, all on `--ease-exit`). Files: `ui/parts.tsx`, `ui/parts.css`. Proof: a parts test that the element stays during the exit and goes at once under reduced motion.
10. **The character's size change re-lays out the page every frame.** No transition on `--char`; `.home-char` gets its largest size and changes only a transform scale; delete `@property --char` if unused. Files: `style.css` 76, 87, `ui/tokens.css` 924, `ui/look.css`, `ui/wide.css`, `auditSecondHalf.test.ts`. Proof: no Layout entries in a trace.
11. **Changing room recolours the whole page for 280 ms.** Set the eleven variables at once, cross-fade only the old room layer by opacity. Files: `ui/look.css` 260, `roomLight.tsx`. Proof: no per frame Recalculate Style on Now to Learn.
12. **Friendly only: History, the wings and the question row freeze for over half a second** while a new WebGL character compiles. Use the still picture there; mount the wing character at rest as a hidden still; warm shaders once in an idle callback; `renderer.setSize` returns early when unchanged. Files: `card.tsx` 281, `practicePanel.tsx` 59, `island.tsx` 254, `islandPanel.tsx` 87, `flowflow/renderer.ts` 87. Proof: harness 0 frames over 50 ms under Friendly; a test counts WebGL contexts per page.
13. **New content makes the Now view jump.** A steady minimum height for the hero words, keyed cross-fade (opacity plus 4 px). Files: `card.tsx` 1961 to 1988. Proof: harness, task finishing layout shift under 0.05 (from 0.24).
14. **Settings may not open.** Never reproduced. Log `resize_card` and `place_card` from the gear, Command comma, the menu bar with Home closed, the key blocker and the first run. A Rust test that the Settings frame stays on a 13 inch screen. With the fixed panel, Settings becomes a height target, which removes most of the risk.
15. **Something that needs you is jumped to, not scrolled to.** Smooth scroll (auto under reduced motion) on the waiting card only; on open, set the scroll before the shape opens.
16. **The practice project says "not checked yet".** Check it once on first open and show the real verdict. Files: `card.tsx` 713, 776 to 784, `homeHero.ts`.
17. **The proven check has no landing.** The one rewarding moment: the line between the thread's nodes fills in over 250 ms, the tick draws in, the card gives one soft glow by opacity. No score, no praise. Screenshot sign off first, in the Instrument look.

### Tier 3: polish

18. Unify every timing and curve on Part 1, including Rust (`ease_out_timing` for the edge landing), roam rules and reactions; the arc spinner linear. Proof: the token lint.
19. Rays retime mid run and jump: keep 22 s always, show working by opacity on a second layer (`ui/look.css` 276 to 277).
20. Hover stays lit after Home closes: `pointer-away` on open, cleared on the first pointer move. Do not blur focus.
21. The character and island pop in late at launch: show each from its page's first frame (`page_ready`, 1.5 s fallback), the character slides in on the peek curve, the island grows from the notch.
22. A tab switch leaves new content invisible for 120 ms: the enter starts at 60 ms.
23. A release throws nothing: the edge landing starts at the hand's speed. Free glide stays off by default behind its Settings switch.
24. A part that fails to draw renders nothing for 1.5 s: show a still fallback.
25. Ambient loops (waterline, rays, motes) pause after 20 s with no input; drop backdrop-filter over transparent windows (**[verify]**).
26. The ask box pushes the page as it wraps in the tall layout: reserve two lines.

## Part 4: HeyClicky patterns

**We adopt**

- **Acknowledge the hotkey in one frame.** Rust emits `summoned` and lights the indicator first (rule 5), then opens the mic. Listening glyph under 50 ms from key down; a "getting ready" pulse if the mic takes over 120 ms.
- **Keep every state mounted, cross-fade by opacity.** Idle, listening, thinking, speaking and done stay in the tree; 150 ms in, 250 ms back to idle.
- **A small thinking glyph at the character, never an empty card.** A linear arc, 0.8 to 1 s a turn. The card opens on the first token, growing from the character (scale .96 and opacity, `--dur-2`).
- **Stream text and speak the first sentence early.** Fixed card height while streaming (fix 4). Targets: first text under 1.2 s, first audio under 1.8 s after release.
- **New input cancels old output in the same frame**, fading it over 120 ms, never an error. Build agents keep their own Stop.
- **A live level meter that is never flat.** Level numbers only, about 30 Hz, never audio. Fast attack, 0.72 decay, a small idle pulse, bars 3 to 13 px by scaleY.
- **Short status lines pop in and type on** (under about 40 characters): scale .9 to 1 on `--ease-out`, 30 to 60 ms a character, hold 3 s, fade 400 ms. Instant under reduced motion.
- **The Show me how pointer flies on a curved arc** (lift min(distance x 0.2, 80) px, duration clamp(distance / 800, 0.6 s, 1.4 s), smoothstep, rotation on the tangent), one rAF loop on transform, click through, only from a capture the user started.
- **Hide calmly.** One hide scheduler with three gates (speech done, motion done, not hovered), then 1 s, then a 300 to 400 ms fade. Any summon cancels it.
- **Warm up before the first ask:** the runner, the SDK process, speech connections. Never the mic or screen.
- **Visual restraint:** one accent and one glow token for character, pointer and bubble (already true in M65).

**We refuse**

- **A global key event tap for the hotkey.** It reads every keystroke and needs Input Monitoring (rule 8). Registered shortcuts still give key up for hold to talk.
- **Always on cursor following and capturing every display on every ask** (rules 5 and 9). Capture only on the hotkey, after the indicator, only the display needed, never written to disk.
- **Asking every permission at launch, or activating the app to ask** (rules 8 and 9).
- **Covering the menu bar beside the notch when open** (F18, unless the founder says otherwise).
- **Auto playing music on first run; UI sounds or haptics on by default** (rule 16). If added, a Settings switch, off, only on the user's own actions.
- **Sending transcripts or replies to analytics.** Never.
- **The bouncy spring and the overshooting peek** (F28, the 30 Oct review). Keep the speed, drop the overshoot.

## Part 5: tests and measurements

Tests first (rule 17):
- `islandSpring.test.ts`: constants equal the table; CLOSE never overshoots over 2 s; OPEN_W and OPEN_H overshoot 1 to 4 percent; every spring settles within 0.8 s; the `linear()` generator gives at most 64 stops, starts at 0, ends at 1, and matches the spring within 0.5 percent. `MOTION_SPRING` never passes its target.
- Rust island tests: the collapsed rect equals the notch rect for 14 inch, 16 inch, More Space, no notch and external; the panel frame holds every state plus headroom; the menu bar row never passes the F18 widths; the hit test rect equals the page's target rect; Rust and TS spring constants pinned equal; Home's panel frame never changes on a content height.
- Hit test: a pure `inside(shapeRect, point)` with corners, shoulders and the 6 and 14 pt slack.
- State machine: nudge then open at 300 ms; grace cancels on return; no reopen until the pointer leaves after a dismiss; hover never opens Home over a working strip; an open during a close starts from current values; Stop everything closes at once.
- UI: Home's state is a React data attribute that survives a re-render mid motion; the tab is set before open; flipping state 20 times keeps the node count.
- Lint: tokens.css and `motion.rs` agree; no raw durations or curves in CSS; no control point outside 0 to 1.
- Source tests: no `home_drop`, no `orderFrontRegardless` on open, no `thread::sleep` in the trip loop.

Measurements before and after, on the founder's ProMotion Mac:
- Harness in `evals/motion/`: History open, tab switch (layout shift under 0.02), streaming, dock states.
- Instruments, Animation Hitches, 20 opens and 20 closes: no hitch over one frame, about 8.3 ms frames (120 Hz). If it stays at 16.7 ms, the native shape fallback.
- A QuickTime recording stepped frame by frame: no sideways jump, no flat clipped corner, no seam between island and Home, content never ahead of the shape.
- Activity Monitor, 10 minutes idle with the panel ordered in: WindowServer and Squibby CPU no higher than today.

### Step 4 measurements, 4 Nov 2026 (pages only, headless)

How: the built pages in headless Chromium with a stand in shell, before (HEAD 3f2ace6, built from a temporary worktree) and after (the worktree with steps 1 to 3). Each window at the size the shell makes it: before, Home's own size (wide 688 by 480, tall 640 by 640); after, the fixed panel (wide 736 by 536, tall 728 by 696). rAF frame gaps, layout shift, long animation frames and a CDP trace per moment, at normal CPU and at 4 times slower CPU. Headless runs at 60 Hz, so "over 16.7 ms" is a dropped frame. Native window motion (the old window resize, orderFront, trips) is not in a page and is not measured here: that needs Instruments on the real Mac. Scripts and raw results: the scratchpad's `m66-measure/` (`measure.mjs`, `results-*.json`); frame strips in `m66-shots/`.

Instrument look (the usual), normal CPU. Frames over 16.7 ms and layout shift (CLS), before / after:

| Moment | Over 16.7 ms | CLS wide | CLS tall | Layouts |
|---|---|---|---|---|
| Home opening (first, then warm) | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 2 |
| Home closing | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 2 |
| Island hover panel opening | 0 / 0 | 0.244 / 0.310 | | 29 / 30 |
| Island hover panel closing | 0 / 0 | 0.010 / 0.011 | | 29 / 42 |
| Island wings to question | 0 / 0 | 0.393 / 0.366 | | 31 / 28 |
| A task card and 6 steps | 0 / 0 | 0.022 / 0.048 | 0 / 0 | 12 / 13 |
| An approval card appearing | 0 / 0 | 0.163 / 0.122 | 0.124 / 0.047 | 6 / 5 |
| The approval card leaving | 0 / 0 | 0.122 / 0.093 | 0.124 / 0.094 | 4 / 7 |
| A task finishing (proof, receipt) | 0 / 0 | 0.256 / 0.230 | 0.060 / 0.027 | 10 / 10 |
| A review batch arriving | 0 / 0 | 0.080 / 0.063 | 0.003 / 0.002 | 4 / 3 |
| Streaming text (200 pieces, 12 ms apart) | 0 / 0 | 0.365 / 0.118 | 0.010 / 0.009 | 202 / 41 |
| Typing 60 characters | 0 / 0 | 0.002 / 0.001 | 0 / 0 | 185 / 188 |
| Typing to 3 lines, then clearing | 0 / 0 | 0.003 / 0.003 | 0.025 / 0 | 205 / 209 |
| History opening (first time) | 0 / 0 | 0 / 0 | 0 / 0.0005 | 6 / 8 |
| Tab switches (Learn, Now, History again, Settings) | 0 / 0 | up to 0.128 / up to 0.101 | up to 0.032 / up to 0.024 | 5 to 9 / 7 to 11 |
| The character changing state (5 states) | 0 / 0 | up to 0.089 / 0 | | 1 / 1 |

At 4 times slower CPU the same table holds: no frame over 16.7 ms anywhere, before or after. The pages have room to spare in the Instrument look; the jank the founder sees there comes from native window motion, not from the pages.

Friendly look, normal CPU. Here the pages do freeze, and steps 1 to 3 made part of it worse (fix 12 is not built yet):

| Moment | Before | After |
|---|---|---|
| Home opening, first | no freeze | **one 600 ms freeze** (new) |
| Home opening, warm | no freeze | one 217 ms freeze (new) |
| History opening, first | 567 to 583 ms | 483 to 500 ms |
| History opening, again | 533 to 550 ms | no freeze |
| Island wings growing | one 550 ms freeze | **two freezes, 467 and 450 ms** |
| Island wings to question | 483 ms | 467 ms |

The trace puts every one of these in Commit (433 to 596 ms on the main thread) right after a WebGL character mounts: a new WebGL context and its shaders. Headless Chromium draws WebGL in software, so the real Mac should be faster, but the order of size says fix 12 is needed before this ships, and the new Home opening freeze needs a look (a character mounting, or the shader pool, as Home opens).

Frame strips (a PNG every 16 ms on a fake clock, CSS paused and stepped to the same clock):
- Home opening, after: the band widens from the notch alone for the first 96 ms, then the body drops, 96 to about 300 ms. The width overshoots at most 6 px (0.9 percent) around 304 ms. The content fades in from 240 to 290 ms, behind the shape, never ahead of it. One faint hairline seam (5 of 255, 1 px wide, 16 px tall) between two shape pieces shows in one frame (96 ms) only. Before: the page only faded in, in a rectangle of its own, 16 to 80 ms; the drop was the native window.
- Island hover panel opening (target 360 by 120): before it overshoots to 367 by 125 at 64 ms and settles by about 100 ms; after it never overshoots and settles by about 80 ms.
- Island closing (target 200 by 32): before it dips to 189 by 27 at 64 ms, smaller than the notch, then comes back; after it never goes under and settles by about 190 ms.

What is still open from these numbers:
- Layout shift on cards and tabs is lower but not gone: the approval card (0.12 wide), a task finishing (0.23 wide, the receipt growing `#home-panel-now`), tab switches (up to 0.10, the new panel moving). The target is under 0.02.
- Streaming text: 202 layouts down to 41 and CLS 0.365 down to 0.118, but 14 small shifts remain in the wide layout, from the review card and the amber panel below the stream moving. Fix 4 wants none until ready.
- The island page still lays out every frame while it springs (29 to 42 layouts per open or close), because the spring writes width and height. Fine at 60 Hz here; check at 120 Hz on the real Mac.
- The character's state changes no longer shift the layout (0.089 to 0).

### Step 5 fixes, 4 Nov 2026

A review of the step 4 strips and of the shell's glue found twelve problems. All twelve were real; each has a test that failed first. Built:

1. **Home's content arrived before its shape** (a second dark slab with its own round foot, up to 63 px below the body, 240 to 290 ms). The content's frame has no fill or foot of its own; the content starts once the height is 98.5 percent there (`contentAtMs`, 340 ms) and arrives on `--dur-2`. `homeShape.test.ts` checks the content's bottom is inside the body on every millisecond of its arrival, for both Home sizes.
2. **The content stayed while the shape folded.** It now leaves first (100 ms, linear) and the shape waits that long (`transition-delay: var(--dur-exit-menu)` while closing). `foldMs` and the shell's backstop include the wait.
3. **The island's hover panel faded in ahead of its shape and was cut by it on close.** It now starts once WORK is 80 percent there (`--seq-island-panel-at`, 120 ms), leaves in 100 ms linear, and the shape waits 80 ms before it tucks back (`tuckHoldMs`). `TUCK_MS` and `RETRACT_MS` are 540 (460 plus 80). The panel no longer stays shown while the shape tucks over it.
4. **The island's spring was chosen again every frame,** so a grow switched to CLOSE at its first overshoot. It is chosen once per target (`springFor`); a grow's overshoot is WORK's own (under 0.8 percent).
5. **The wings blinked when Home opened or closed over a running task.** See Island into Home above.
6. **A hairline between the body's middle and its foot.** The foot reaches 1 pt up into the middle with a shadow of the notch's black. Deviation from the review's fix (`top: -1px` and a 25 px strip): that moved the corners' bottom 1 pt up and left a 1 pt step at the strip's ends; the shadow leaves every rect and the bottom edge as they were.
7. **Opening Home again during a fold froze the click through for the session.** The open now clears `HOME_FOLDING`, and the watch compares with what the window really does (`HOME_PASS`), not a value it kept.
8. **A typing key made the whole clear window take the mouse.** The keyboard open now only makes the panel key.
9. **A pointing opened Home stayed "by point" after the person took it over.** A click on the notch or a key while it is up, and any press macOS delivers to Home's window (the native witness), make it the person's.
10. **The pointer leaving folded Home even with an approval waiting.** The shell now asks the page (`home-pointer-left`), which folds only when `closesOnClickAway` says nothing waits; asked once.
11. **A closed Home moved the character's visit** on every `apply_dock`. Only while Home is up.
12. **Launch race: the shape's measures could be lost** and the whole card drawn while closed. The measures count as told only once the page was told, and a closed Home without measures draws nothing.

Tests: `homeShape.test.ts`, `islandSpring.test.ts`, the new `homeGlitches.test.ts` (the shell's glue, read as text) and island.rs `home_grows_from_the_wings_the_island_shows_and_folds_back_into_them`. Items 7 to 12 are glue in main.rs that needs a real Mac; their tests read the code, they do not run it.

Step 5 measurements (the step 4 scripts again, the after build only; the strips' raw frames in `m66-shots/*-fix-after`):
- Home opening: nothing drawn beyond the body on any frame (at most 2 px of antialiasing); before, 63, 49 and 37 px at 240, 256 and 272 ms. The content arrives 352 to about 460 ms. No hairline on any frame before the content shows; before, a faint one on 8 frames by a stricter check than step 4's.
- Home closing: the content is gone by 80 ms, the body starts to fold at about 100 ms, and nothing shows below the body on any frame.
- Island hover panel, in real time (the fake clock of the strips does not hold the page's 80 ms wait): its words fade over 100 ms; the shape holds its size until 95 ms, then tucks. Opening, the words first show at 128 ms, with the shape at 359 by 120 of 360 by 120.
- Frames and layout shift, Instrument look, normal CPU: still no frame over 16.7 ms anywhere. Island hover panel opening CLS 0.310 to 0.088, wings to question 0.366 to 0.001, hover panel closing 0.011 to 0.045 (the shape now shrinks after its words go). Every Home moment unchanged.

**[verify] on the founder's Mac:** that the content's later arrival (340 ms, settled about 540 ms) still feels quick at 120 Hz; the wings staying put as Home opens and closes over a running task; a quick tap on a pointing opened Home keeping it; Home folding on leave only with nothing waiting.

### Step 6 fixes, 4 Nov 2026

A review of step 5 found six problems. Five are fixed, each with a test that failed first; the sixth is a scope question for the founder (below).

1. **Open Home covered the Show me how pointer and our own macOS dialogs.** Home's window is above the menu bar (level 26) so its shape can hang from the notch. The pointer's arrow, ring and caption now draw above it and the island (`island::POINTER_LEVEL`, 28, still under pop up menus). While one of our own dialogs is up (the folder chooser, Open from a link, Delete everything), Home drops to level 3, under the dialog, and comes back after (`island::home_level`, `home_level_now` from `NativeDialog`). Test: island.rs `home_never_covers_the_pointer_or_our_own_dialogs`.
2. **In the tall layout, content was drawn over the desktop while the body glided to a new height.** Once Home is open, a new height or width takes the shape in the same frame as the content's frame, with no glide (homeShape.css, `data-phase="open"`). Only the opening grows. This keeps F18's "a resize of Home is never animated"; recorded in F18's Settled in the build. Test: `homeShape.test.ts`.
3. **A quick click beside Home could be eaten by its clear window and make Home key.** The click through now follows each mouse move at once (the ring's existing pointer monitors, where the pointer is only), not only the 50 ms watch. Home's panel also checks every press against the shape at the moment of the press: one on its clear parts is dropped and the window lets the pointer through from then on. Home may become key only while the pointer is on its shape or a typing key opened it (rule 9). Test: island.rs `a_press_off_homes_shape_is_never_homes`. A press dropped this way does not reach the app behind (it cannot be passed on without posting events, which we never do); the move monitors make that window a few milliseconds at most.
4. **The pointer leaving folded Home whatever the settings said.** It now folds only with "Close Home when I click another app" on, after the close delay (`island.closeDelay`, 0.3 s by default), in the shell and in the page. The setting's help and F18's "What it may notice" say so. Tests: island.rs Leave, `homeGlitches.test.ts`.
5. **Home's body width no longer followed Settings.** The window still holds the widest size; the body is now the width in force (tall Standard 640, 680 with Settings open), so the character keeps clear of exactly what is drawn. With the island off, the window sits at the widest size, so Settings is never squeezed. Opening or closing Settings places Home again (the window keeps its frame; the page hears the new width). Tests: island.rs `homes_window_never_changes_with_its_content_or_with_settings_open`, `with_the_island_off_home_sits_where_it_was_with_headroom_and_only_fades`.

**[verify] on the founder's Mac:** a flick from Home's body to an app menu beside the notch lands first try and the keys stay with that app; the folder chooser and the Delete everything question show over an open Home; a Show me how arrow near the notch shows over Home.

### Also built on this branch, beyond motion: needs the founder's yes before merge

Step 5 also built three things that are not motion and were not in this plan. They change what Home says and does, so they wait for the founder's yes like any feature. If the answer is no or later, they move to their own branch and plan before M66 merges.

- **Result chips** (`app/src/resultChips.ts`): two or three fixed one tap chips at the end of a result card (Explain this, Undo, Fix it, What changed). Undo and Fix it change files, so each asks first and then runs with its safety copy and receipt (rule 13); Fix it starts a new task. Tests: `homeFlow.test.ts`.
- **The size of a change** (`app/src/changeSize.ts`, runner `checkpoints.ts lineCounts`, a protocol Receipt change): "Changed 3 lines in login.js" or "Rewrote the whole of page.html", from the checkpoint diff's own counts, never the model. It reads the shadow store with `git diff-tree --numstat`, read only. Tests: `runner/test/checkpoints-lines.test.ts` (including that counting changes nothing in the shadow store or the project, and the project never gets a git folder), `runner/test/agent-size.test.ts`.
- **A small ask for a big change** (`askWords` on the receipt, the warning in `changeSize.ts`): a plain line when a short ask changed many lines.

## Part 6: hands on checks on the founder's Mac

A guided session, one check per message; I record the answers. Build and open the real app first. "Good" is what is written; anything else is a note, never his failure.

**A. The notch and Home**
1. Hover the notch. Good: it reacts at once with a small grow and a shadow.
2. Keep hovering. Good: after about a third of a second Home opens from the notch, widening first, then dropping, with no blank frame and the right tab.
3. Watch it settle. Good: it reads as a gentle settle, not a bounce.
4. Move away. Good: it folds back into the notch with no bounce.
5. Click the notch quickly ten times. Good: no flash, blink or stuck half open state.
6. Open Home and click an app beside the shape and in the menu bar beside the notch. Good: the click lands, first try.
7. Open Home and type in the ask box. Good: the app you were in stays frontmost.
8. Open Home, go to History, press Esc, press the type hotkey. Good: Now appears at the right height, no flash of History.
9. Switch Now, History, Learn, Settings and back. Good: the bottom edge glides, nothing jumps or is cut off.
10. Ask Prompt help for a long rewrite. Good: the text streams in a steady box; cards below stay put.
11. Open Settings from the gear, Command comma, and the menu bar with Home closed. Good: it opens every time.
12. Press the stop everything hotkey with Home open. Good: it closes and everything stops.

**B. The character**
1. Move to the edge where the character rests. Good: it comes in quickly, no bounce.
2. Start a task. Good: the character does not jump when its label appears.
3. Drag it fast, then flick it at an edge. Good: it follows your hand and lands at the speed you threw it.
4. Turn on the follow ring and sweep fast. Good: the ring stays with the cursor.

**C. Working**
1. Start a task. Good: the busy strip sits beside the camera, nothing over it.
2. Let a question arrive. Good: "Needs you" shows with one nudge, no hitch.
3. Finish a practice check. Good: one clear, satisfying proven moment, nothing childish.

**D. Voice and asks (once built)**
1. Press hold to talk. Good: something changes the instant your fingers land.
2. Ask, then ask again before it finishes. Good: the old answer fades, no error.

**E. Displays and comfort**
1. Plug in an external display, or close the lid with one attached. Good: the pill hangs from the top edge and opens the same way.
2. Switch to a full screen app and back, and set More Space. Good: the shape still lines up with the camera.
3. Turn on Reduce motion and repeat A2 and B1. Good: plain fades, nothing slides or springs.
4. Leave Home open five minutes untouched. Good: nothing keeps moving.

## Order of work

1. Part 1 tokens, `motion.rs` and the lint (small, unblocks everything).
2. Part 2 step 1 with fixes 1 to 3, tests first, then the measurements.
3. Fixes 4 to 8.
4. The adopted HeyClicky patterns, with the voice work.
5. Tier 2, then Tier 3. Part 2 step 2 only after step 1 measures smooth.

Run `scripts/test-all.sh` after each change, then build and open the app: a passing suite does not prove launch. New settings (the haptic switch) go in `protocol/settings.json`, `strings.ts`, `settingsPages.ts` and `runner/test/settings-registry.test.ts`. When built, update `docs/design/look.md` (motion sections 3, 6 and the scale line), F18's "Settled in the build" notes, and `CHANGELOG.md` in plain words.
