# GLASS: the glass look and the menu bar popover

Status: the founder picked it on 19 Nov 2026, after the look lab (directions A, B and C): "I think the liquid glass looks so very good. Also, the menu bar, I think you need to change it and make it better." That pick is the approval for this plan, including the one change to the locked look named below. Built 19 and 20 Nov 2026, reviewed, fixed. Not committed. Nothing is spent: no model call, no key, no account. Fixtures and stand in pages only. The AppKit parts are [verify] items for a real Mac (below).

## The one change to the locked look

Since 17 Nov 2026 the look is locked to the one from before M112 (coloured place tiles, the lavender notch chat with its dotted grid, the blue send and Fix buttons, the lavender notch pills). The founder's 19 Nov pick lifts that lock for this milestone only, and only this far:

- New tokens, all named `--mat-*`, in the GLASS block of `app/src/ui/tokens.css`: a neutral dark glass tint, its inks, raised steps, hairlines, the popover's size and corners. No existing colour token changes its value.
- Under Glass, the role tokens (`--bg`, `--surface-*`, `--fg-*`, `--line`, `--edge`, `--focus`) point at the `--mat-*` tokens, in one rule on `:root[data-theme="black"][data-material="glass"]`.
- Before (look.material `classic`) is exactly the look from before. Every glass rule in `app/src/ui/glass.css` hangs off `[data-material="glass"]`.
- The notch, the notch chat, the pills, the send and Fix buttons, the meaning colours and the characters are unchanged in both.

Nothing else in the look moves. A later change to colour, theme or tint still needs the founder.

## What the person gets

- **Glass, the usual.** Home is a dark glass that lets the desktop show through (macOS's own blur under the page, `NSVisualEffectView`), black at the top where it grows out of the notch. The places (Now, Learn, History, Memory) are tabs in the middle of the top, under a one line greeting from real state ("Evening. Nothing needs you.", "Evening. 1 question is waiting for you.", "Evening. Working: make the button blue."). Close, Settings and Stop sit in the top right corner. In the wide Home the side keeps the recent work.
- **Before, one choice away.** Settings, Look, Material: Glass or Before. Before is the black look with the coloured tiles.
- **A real menu bar popover.** A left click on the menu bar icon opens a small glass panel under it: what Squibby is doing now (a press goes straight to a waiting question, to the changes to review, or to the work running), the project with a switch, the last check, Check my project, Check before going live and Open Squibby (with no project: Choose a project, and nothing that needs one), the plan while payments are on, Settings, Stop everything with its keys, and Quit. A right click keeps the short native menu. The icon is a template image in the menu bar's own ink, with a small dot when something needs you.

## Rules kept

- Rule 9: the popover is a non activating panel that never becomes key; Home's top takes no focus on its own.
- Rule 11: Stop everything is in the popover, with its keys, and does what the menu's Stop does.
- Rule 13: nothing in the popover sends, pastes or deletes. Each press opens Home with the same arrival the notch's panel uses (`arrival.rs`), so Home does exactly what its own button of that name does.
- Rule 16 and the writing style: plain words, no em dashes, all in `strings.ts`.
- Words match deeds: Check my project and Check before going live use Home's own words (`S.home.main`) for the tools they start (`glass.ts` `trayActionWord`, tested).

## The G rules (the look lab's rulebook, the lines `glass.css` answers)

- G1.1 the desktop shows through by macOS's blur, not CSS `backdrop-filter` on a see through window.
- G1.3 a hairline down the sides and a light top edge on the popover; G1.4 the notch's black at the top melting into the glass; G1.5 one shadow, on the floating layer only; G1.6 and G1.12 rows and cards are steps of glass, never a second glass.
- G1.9 Reduce transparency and Increase contrast: a near solid tint and a stronger edge.
- G2.7 exactly one filled button in the popover.
- G3.1, G3.2 the tabs: a quiet track, the open tab lighter and heavier, never colour alone. G3.4 rows grouped by space. G3.7 rare and destructive things at the foot.
- G5.3 the popover arrives in 200 ms from its icon (scale and fade), at once with Reduce motion; G5.4 opacity only, never animating the blur; G5.5 hover is a fill only; G5.15 no loop while idle.

## Decisions recorded

- **Material may be branched on in code, in one place.** The look choices are data attributes read only by CSS (`lookChoices.test.ts`). Material changes structure (a real tablist with roles, ids and tab order, or the place buttons), which CSS cannot swap, so like Layout it is read in `card.tsx`, once, through `materialOf` (tested). Its colours and surfaces still hang off `data-material`.
- **The shell's window motion.** The popover's panel is placed at once (`setFrame_display`, no animation); the page fades its own content. Home's blur is a view under the page that appears at once when Home has grown, and is hidden at once when Home folds. So the motion test's rule (the island's grow and Home's drop are the only window motion) still holds, and needs no exception.
- **Settings under Glass** keeps the top strip and the tabs above its own sidebar and Back, so a place is one press away from Settings.

## Compared with the best

- **HeyClicky's menu item**: one press from the menu bar to what is waiting. Ours: the top line is that press, and the dot on the icon says something waits before you open it.
- **Coucou**: a notch agent watcher that jumps to the waiting item in one click. Ours does the same from the popover, and keeps the checking (prove, review, undo) Coucou lacks.
- **Wispr Flow**: small, instant, calm. Ours: no timer while shut, no motion but a 200 ms fade, words clamped at two lines with the whole text in the tooltip.
- **macOS's own menu extras (Control Center)**: real vibrancy, a template icon, closes on a click elsewhere. Ours matches all three.

## Tests

- `app/src/glass.test.ts`: the material and its usual, the greeting from real state only, the popover's rows, actions and where its top line goes, the words matching Home's, the two line clamp, contrast over white, grey and black wallpapers, the tabs' keys.
- `app/src/glassEdges.test.ts`: in a real headless browser, tall and wide: Close top right inside the panel after Settings, the tabs centred, Stop in reach on every place while a job runs, the tabs keeping their rectangles, the tabs and Close staying in view while the page scrolls.
- `app/dom/glass.test.tsx`: one Settings button and one Places landmark in the wide Home, each tab controlling the one tabpanel labelled by the open tab, the greeting agreeing with the menu bar, Before keeping its buttons.
- `app/src-tauri/src/traypop.rs`: only the popover's own presses pass, each opens Home on the tool its words name by an arrival `arrival.rs` accepts, placing and sizing under the icon, the icon images, and a change of Material re-syncing Home's blur.
- The DOM suite's `press` helper presses a place's tab when there is no button of that name, so every Home flow test runs under Glass, the usual.

## [verify] on a real Mac

1. Left click the menu bar icon: the popover opens under it, the app in front keeps the keyboard, a click elsewhere closes it. Right click: the short menu.
2. With a question waiting: the icon has its dot; the popover's top line opens Home on Now with the question.
3. Home under Glass: the desktop blurs behind the body once it has grown; the blur's bottom corners match the body's.
4. With Home open, switch Settings, Look, Material between Glass and Before: the blur goes at once under Before and comes back under Glass, with no resize needed.
5. Reduce transparency and Increase contrast on: the near solid tint and the stronger edge.
