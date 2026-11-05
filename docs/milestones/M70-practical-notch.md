# M70, a practical notch

The founder, 4 Nov 2026, after seeing M68's wings and hello: "the notch is still weird. I don't want Squibby to be there always, and I don't need a small little bubble type to be there. The notch should be more practical and more to use, just like HeyClicky's notch. When you first hover over it, a small text or some normal things come, and then when you go to the settings, everything else comes. I want that. Just fix it, and also make it better."

So the notch has three steps, all one black shape:

1. **At rest** it is the bare hardware notch.
2. **On hover** it grows into a small, useful panel: a short greeting, one fact, three quick actions, a gear and an Open control.
3. **Going further** (Open, the gear, or an action that needs room) the same shape grows on into the full Home.

Status: built (steps 1 to 4, 5 Nov 2026) on m48/launch, not committed. The founder's checks on a real Mac and the [verify] items below are still open. Step 4 changed some of the plan: see "Step 4: what the review of the shots changed" at the end, which wins where the two differ.

## What HeyClicky does (ideas and numbers only)

From its public changelog. v1.0.52 (24 Sep) made hover open a quick peek instead of the full Home. Picking something in the peek, or Expand Home, opens the full view. Moving away tucks the peek back, and the peek can be turned off in Settings. Their resting notch is bare apart from an unread badge. They publish no sizes or timings, and neither do NotchNook, MewNotch or Alcove. So the numbers here are our own M66 numbers: open at 300 ms, a 6 by 2 pt nudge at once, and the M66 springs.

## What is there at HEAD (d78d5b5, checked)

- `island.wings` and `island.hello` are on by default (`protocol/settings.json`). On a real notch the resting wings show the Visor lights and one short word, and the hello opens the panel for 3 s on start, wake or return (`notchHello.ts`).
- `island.pointOpens` is `home` by default, so resting on the notch for 300 ms opens the **full Home**. The small panel (`islandPanel.tsx`, 400 wide, 56 to 240 tall) shows only with `status`, and then only one live thing. It has no greeting, no actions, no gear and no Open control.
- The instant hover nudge is drawn by Home's window (`home-hover`, `homeShape.ts NUDGE_W/H`), not by the island page.
- Home always grows from the bare notch or the wings (`grown_from`), never from the panel.
- Stop everything folds Home (`home_stop_now`) but leaves the island's hover and panel alone.
- Home arrivals exist for Settings, Learn, Check my project (`{do:'find'}`), Check before going live (`{do:'shipCheck'}`), Undo (`{do:'undo'}`, asks first) and a setting. There is none for the ask box or for review.

## 1. At rest

The bare notch. No wings, no Visor lights, no word, no bubble, no hello.

- `island.wings` default becomes **false**. A stored `true` still loads, and then the M68 rest wings and live wings come back exactly as they are today (Visor lights, word, step word).
- `island.hello` default becomes **false**. A stored `true` still loads and works as today (`helloGate`, `quiet_now`, at most once an hour). The wake tick and the back timer run only while the switch is on.
- The pill (no notch) and the edge line show nothing at rest, as today.

**While something is live** (with `island.wings` off) the notch shows one small mark and nothing more:

| What is live | What shows | Why |
|---|---|---|
| A job working or checking | the existing `islandWings` mark (the arc) in a right wing at `WING` (40 pt); the left wing is plain black | the person can tell work is going on without hovering |
| A question waiting | the amber dot | it needs the person |
| A result just proven | the tick, for 4 s, then rest | the existing 4 s rule |
| A failure | the red mark, until hovered or seen in Home | the existing rule |
| Listening | the bars, as today | rule 5: the microphone indicator must always be visible |
| Looking at the screen | the look mark, as today | rule 5: the screen indicator must always be visible |

No Visor lights (the founder: Squibby is not there always), no step word and no 4 segment line. Both wings stay at `WING`, the smallest the code allows, so the shape stays centred on the camera. On the pill the mark sits inside the pill, as F18 already says; the edge line grows into the pill for it.

`island.showStep` keeps its meaning (the step word and line in the wings) but only matters with `island.wings` on, and Settings shows it under that switch. The step itself moves into the hover panel's job row, where it always shows.

## 2. On hover: the small panel

Timing is M66's: the shape nudges 6 by 2 pt at once, the panel grows at 300 ms (`island.openDelay`), the words come in once the shape is there (`--seq-island-panel-at`), and leaving folds it on the close spring after `island.closeDelay`. It never takes focus (rule 9).

- `island.pointOpens` default becomes **`status`**, and `status` now means this small panel. `home` stays as a choice ("Home right away") for anyone who wants it. A stored `home` keeps today's behaviour.
- `island.peekOnHover` off still means hovering opens nothing.

### Size

400 pt wide (`PANEL_W`, unchanged, inside the 360 to 420 target). A fixed height per layout, so facts changing never move anything; only a change of layout (say a question arriving) resizes, on the WORK spring.

| Layout | Rows | Height |
|---|---|---|
| Quick | greeting row, fact row, actions row | 132 pt |
| Job | greeting row, job row (name, time, step line, Stop), actions row | 132 pt |
| Question | greeting row, then today's question card | today's card height |
| Result | greeting row, then today's mini receipt (Keep, Undo, See proof) | today's card height |

All stay inside `PANEL_MIN` and `PANEL_MAX` (56 to 240) and the character's clear zone test (island.rs). The numbers are a starting point; shots and the founder's check settle them, and the tests pin whatever is chosen.

### Rows

- **Greeting row.** Left: "Hey <you.name>" or "Hi there" (`helloLine`, `cleanName`). Right: a Settings gear and an Open chevron. No character here (the founder: no Squibby always).
- **Fact row.** One plain line from real state, chosen in this order: questions waiting, changes to review ("my-shop: 3 changes to review"), a problem the last check found, the last check ("Last check passed 2 h ago"), then "Ready when you are". Built on `helloFact` and `notchStatusLine`, which already exist.
- **Job row** (replaces the fact row while a job runs). The job's name, time so far, the 4 segment step line, and Stop with its key hint.
- **Actions row.** Up to three buttons, chosen by `quickActions(m)`.

### The action chooser

A new pure function `quickActions(m): QuickAction[]` in `app/src/notchQuick.ts`, tested first. Each action keeps a fixed slot order (Ask first, then the rest in the order below) so buttons never swap places when state changes. It returns at most three. The gear and Open are always there and are not counted.

| State | Actions |
|---|---|
| No project picked | Ask |
| Engine stopped | none (the fact row says so; Open shows Home's notice) |
| A question waiting | none (the question card replaces them) |
| A fresh result | none (the mini receipt replaces them) |
| A job running | Ask |
| Changes to review | Ask, Review changes, Check my project |
| An earlier change can be undone, nothing to review | Ask, Check my project, Undo last change |
| Last check proven and unchanged | Ask, Check my project, Check before going live |
| Anything else with a project | Ask, Check my project |

What each one does. Every one opens Home with an arrival, so today's approval, snapshot and receipt rules apply unchanged; nothing runs from the notch itself.

| Action | Arrival | Notes |
|---|---|---|
| Ask | new `{place:'ask'}` | Home opens with the ask box shown, **not focused** (rule 9). Home takes keys only on a click. |
| Review changes | new `{do:'review'}` | Home opens on the M69 review card. |
| Check my project | `{do:'find'}` | as today |
| Check before going live | `{do:'shipCheck'}` | as today |
| Undo last change | `{do:'undo'}` | as today: Home asks first |
| Gear | `{place:'settings'}` | as today |
| Open | none | Home on Now |

`panel.showButtons` (hidden, on) is honoured: off hides the actions row and keeps the gear and Open. `panel.showHello` (hidden, off) is retired: the new panel never reads it. The key stays in the registry, hidden, so old stores still load.

### Hotkey hints

Only F28's four: Fix it, Hold to talk, Prompt help, Stop everything, and only from `keys.ts keyHint`. In this panel that means Stop on the job row, as today. No other button shows a key.

### Words (all in `strings.ts`)

- `notchHey` "Hey {name}", `notchHi` "Hi there" (existing hello words reused)
- `notchReady` "Ready when you are"
- `quickAsk` "Ask", `quickReview` "Review changes", `quickCheck` "Check my project", `quickShip` "Check before going live", `quickUndo` "Undo last change"
- `notchOpen` "Open Squibby" (the chevron's label and title), `notchSettings` "Settings"
- Settings: `island.pointOpens` options "A small panel first" and "Home right away"

## 3. Going further into Home

Clicking Open, the gear or an action grows the **same** black shape from the panel into Home. Today Home grows from the bare notch, so the panel would vanish while a second shape grows: two shapes, not one.

- `HomeGeom` gets an optional `from` rest rect (width, height, corner radius) when Home opens while the island shows the panel. `homeShape.ts` starts its outline from that rect instead of `collapsed`. island.rs `grown_from` sends it. `shape_rects` keeps matching between island.rs and homeShape.ts, and both tests cover the new start.
- The panel's words leave first (`PANEL_EXIT_MS`), the shape grows on M66's `OPEN_W` then `OPEN_H` 60 ms later, Home's content comes in at `--seq-notch-content-at`. The island stays drawn until Home's shape covers it (`islandHideAtMs`), so there is never a gap or a double edge.
- Leaving the small panel (pointer away) folds it back on the M66 close spring. A Home opened from the panel folds like a Home opened by pointing.

## 4. Better than today

- **Instant hover acknowledgement.** The island page nudges its own shape on the hover signal (6 by 2 pt, `--dur-notch-hover`), instead of waiting for Home's window. The shell sends the hover flag to the island page in the same tick it sends `home-hover`. Target: the first changed frame within about 16 ms of the pointer entering. [verify] on a real Mac whether WebKit in a non activating panel also sees the pointer itself; if it does, CSS `:hover` is the faster path and we use whichever comes first.
- **Content only once the shape is there.** The M66 rule, unchanged.
- **No layout jumps.** Fixed heights per layout, fixed action slots, one line of fact that truncates with an ellipsis.
- **Clicks outside the shape pass through.** Today the Peek frame is a plain rect, so the transparent corners beside the rounded panel may catch clicks. Check it; if they do, use `inside_shape` for Peek as Home does.
- **Stop everything closes it.** The hotkey and the menu path also call `reset_hover`, close the panel, and ignore the hover until the pointer has left once. Tested.
- **Esc** (from HeyClicky v1.0.50) is not added: the panel never has keys, so Esc cannot reach it. Moving away is the close.
- **Looks.** Instrument and Friendly (`data-style`), Graphite and White (the notch keeps Night, `useLook keepNight`). Reduced motion and Less motion fade instead of growing (the `homeShape.css` pattern). Colours only in `ui/tokens.css`; motion only on M66 tokens.
- **Every display.** Macs without a notch and external displays use the pill, and the edge line grows into the pill; all three show the same small panel (`frame_of` Peek already covers all three).

## Settings changes

| Key | Change |
|---|---|
| `island.wings` | default `true` to `false` |
| `island.hello` | default `true` to `false` |
| `island.pointOpens` | default `home` to `status`; option words "A small panel first" and "Home right away" |
| `island.showStep` | unchanged default; shown under `island.wings` and only used with it on |
| `panel.showButtons` | read by the new panel (actions row) |
| `panel.showHello` | retired, kept hidden in the registry |

Each change goes in `protocol/settings.json`, `strings.ts`, `settingsPages.ts` and `runner/test/settings-registry.test.ts`. Existing installs: Settings keeps only values that differ from the usual, so anyone who never touched these switches gets the new defaults, and anyone who turned them on keeps them.

## What F28 says now

The F28 rule "the notch is the bare notch at rest" is back as the usual. Its line "the greeting and the buttons that only open Home leave the notch" changes: the panel has (step 4: fact first, no greeting; the name is used only by the opt in hello) a few buttons that open Home at the right place, because the founder asked for a practical notch like HeyClicky's. The M68 update (wings and hello on by default) is reversed to off by default, switches kept. Recorded in F28 as "Update, 4 Nov 2026 (founder, later)". F18 says the panel is 300 pt under the pointer; it is 400 today and stays 400, so the build adds a dated note to F18 in the same change.

## Tests to write first

1. `quickActions`: every row of the chooser table, at most three, fixed order, Undo only when the receipt offers it, Review only when the count is above zero, nothing during a question or a fresh result.
2. The fact line: each case in order, with and without a project, and the truncation.
3. The greeting: with a name, without, with a name that `cleanName` rejects.
4. Panel layout: each state to its layout and fixed height; heights inside `PANEL_MIN` and `PANEL_MAX`; `PANEL_W` still matches CSS.
5. Rest: with `island.wings` off, nothing at rest; while live, only the mark, at `WING`; listening and look always show. With it on, today's wings exactly (existing `notchHello.test.ts` cases kept under that switch).
6. Hello: off by default; on, it works as today (`notchHello.test.ts`, `launchCut.test.ts` updated).
7. Arrivals: `{place:'ask'}` and `{do:'review'}` in `arrivalFrom` and arrival.rs; Ask never focuses the box.
8. Growing from the panel: `HomeGeom` with `from`; outline starts at the panel rect; island.rs and homeShape.ts `shape_rects` agree.
9. Stop everything: closes the panel, resets the hover, ignores hover until the pointer leaves (Rust test).
10. Click through: a point in the panel's transparent corner is outside the shape.
11. Key hints: only the four jobs' hints appear anywhere in the panel.
12. Settings: registry defaults, strings, pages, runner `settings-registry.test.ts`, protocol tests.
13. CSS: motion lint (tokens only, transform and opacity only), reduced motion and Less motion fade, colours only in tokens.
14. Shots at 2x (Playwright, stub for `window.__TAURI__`): rest, hover quick (with and without a name, with review waiting), job, question, result, pill, Instrument and Friendly, Graphite and White, reduced motion, and the frames of the panel growing into Home.

## The founder's checks on a real Mac (one per message)

1. Start Squibby. Is the notch bare, with nothing beside it?
2. Rest the pointer on the notch. Does it react at once, then open a small panel with one fact and a few buttons?
3. Move the pointer away. Does it fold back quickly and smoothly?
4. Hover again and click Ask. Does the same black shape grow into Home with the ask box there, and does your current app keep the keyboard until you click the box?
5. Hover and click the gear. Does Home open on Settings?
6. Start a fix. Does the notch show only a small mark while it works, and does hovering show the job with Stop?
7. Press Stop everything with the panel open. Does it close?
8. Click just beside the panel's rounded corners. Does the click reach the app behind?
9. On an external display or a Mac without a notch: does the pill open the same small panel?
10. Turn on the wings and the hello in Settings. Do they come back as before?

## Step 4: what the review of the shots changed (5 Nov 2026)

Built and tested (`notchQuick.test.ts`, `homeShape.test.ts`, `islandPanel.test.ts`, `island.test.ts`, `homeGlitches.test.ts`), and shot at 2x in Graphite, White and Friendly (`m70-shots/final-*`).

- **Built: the fact leads, no greeting.** The panel's first row is the one fact, with Settings and Open as words on the right (a sliders icon and a bare chevron meant nothing to a newcomer). The greeting row and "Ready when you are" are gone; a project never checked says "my-shop: not checked yet", as Home's headline does. `quickGreeting` stays only for the opt in hello.
- **Built: two rows, 88 pt.** The quick and job layouts are 88 pt (was 132): the fact row, then the buttons or the running job (its step line, time so far and Stop). A job offers no quick actions. The panel has one column no wider than itself, so a long fact ends in an ellipsis.
- **Built: buttons.** Every action is a real button; Review changes is the main one when offered. After a failed check the Check slot says "Find and fix the problem" (same press, `{ do: "find" }`). With no project, "Pick a project" comes first (plain Open: Home on Now with the folder picker).
- **Built: no character in the panel.** The question and the result use a small amber dot or green tick instead of the orb; only the opt in hello shows the Visor. A proven result's second line is its proof ("Check passed · 1 change"), not the verdict again. A question's second line is the request's own words; "Only this time. You can say no." only when it has none.
- **Built: the row's mark steps aside.** While the panel is open, the live mark in the notch's row is not drawn, except listening and looking at the screen (rule 5).
- **Built: motion.** What the panel shows is latched while it fades out, so its words fade instead of blinking out. The corner follows the shape's height on the same spring (`--open`, `islandSpring.ts openness`) instead of the mode. The panel's words come in when WORK is 92 percent there (160 ms, was 120), so the bottom row is never cut. Home grown from the panel keeps the panel's width in the band while it opens, then eases back once open (no pinch at the neck). The pieces of Home's black shape overlap by a point where both are black, against grey hairlines.
- **Built: the hand off.** While Home grows from the panel, the island holds the panel's shape and words (up to the tuck, 540 ms) and the words fade out just before the island stops drawing (`--seq-island-hide-at`), instead of a blink to the bare notch. Done on the page, with no change to main.rs. [verify] on a real Mac with a 60 fps screen recording of Open and Settings: no frame of the bare notch between the panel and Home.
- **Built: White Home is readable.** In the White look, Home's page has its own light fill inside the black shape, with the shape's round foot.
- **Changed from the review: no early crossfade.** Home's content still arrives at `--seq-notch-content-at` (340 ms). Starting it earlier needs a clip that follows the shape, and a clip-path transition paints every frame, which M66 rules out (only transform and opacity move). The gap is shorter because the island's words now stay until about 240 ms.
- Fixed in step 5: the hit test while Home opens from the panel (below).
- [verify] `@property --open` in the Mac's WebKit (Safari 16.4 and later support it). Without it the corner still follows the size, only with a little more restyling per frame.

## Step 5: last fixes from the review (5 Nov 2026)

- **The small panel lets clicks through beside its round corners.** The island's window is the panel's plain rect. Now each mouse move (the same monitors Home's click through uses, the pointer's position only, never keys) sets the window's click through from the pointer against the shape drawn in it: the frame with its round bottom corners (island.rs `island_corner`: 22 pt on the notch, the card radius on the pill and the line) and `island_pass`. The shape is set the moment the island is placed, so while it tucks back (the window keeps the panel's frame for `closeDelay` plus `RETRACT_MS`) only the notch it tucks into is the island's, and the rest of the old frame lets clicks through. Moving into a clear part counts as leaving the island, and coming back onto the black as entering it, because the tracking area may say nothing while the window lets the pointer through. At rest and with the wings out the window is the shape, as before. Tested (`the_small_panel_lets_clicks_beside_its_round_corners_through`, `the_island_window_follows_the_pointer_against_its_shape_never_keys`).
- **Home grown from the panel takes the black it draws.** While it opens, homeShape.ts draws the band at the panel's 400 pt; the shell now keeps that width in Home's rects (`shape_rects_from`, `HOME_FROM`) until the band has eased halfway back (`FROM_BAND_MS`, 780 ms: the height's 60 ms delay, its 582 ms spring, then the close curve's middle, pinned against tokens.css), then asks again. Tested (`home_grown_from_the_small_panel_keeps_the_panels_band_in_its_hit_test_while_drawn`, and notchQuick.test.ts pins the same band on the page's side).
- **The words match the build.** Settings help for `island.pointOpens`, `island.hello` and `you.name` no longer promise a greeting on hover; the name is used only by the opt in hello. F28 and F18 say fact first, no greeting. The unused `S.notch.label` is gone.
- [verify] on a real Mac: a click just beside the panel's round corners, and in the old panel's strip while it tucks back, reaches the menu bar or the app behind; and the hover still opens and folds as before (a global mouse monitor sees moves over our own non activating panel while another app is in front, as Home's click through already relies on).
