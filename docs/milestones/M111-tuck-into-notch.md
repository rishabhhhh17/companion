# M111: Tuck Flowflow into the notch

Status: plan written and built 16 Nov 2026, review findings fixed the same day. Not committed. Nothing was spent on a real model: fixtures and stand ins only. Every suite passes, but the drag out of the notch (`untuck_drag` and the moves that follow it), the glow on the real notch, and the line after a tuck while the pointer is still over the notch are **still unproven on a real Mac** until a person tries them (the [verify] list below).

## The founder's words

16 Nov 2026: "When I put Flowflow in the notch, it should just disappear, and it should just dock up there. Some people, if they don't want Flowflow to be always on their screen, they can just put it up there."

Also 16 Nov 2026, a bug: "when you dock Squibby, it feels like the bubbles beside it don't go."

This is a direct founder request; no other approval is needed. It amends F18 (docking), F32 (the peek out) and the M96 notch record.

## What it does

1. **Dragging over the notch.** While the person drags Flowflow and the pointer comes over the notch (on a Mac with no notch, the same top centre pill the island uses), the notch shows it will take it: it grows the M96 row out of the notch with a soft lavender glow and the small line **Let go to tuck Flowflow in**, and Flowflow shrinks a little toward it. Moving away undoes both at once.
2. **Letting go there tucks it.** Flowflow shrinks up into the notch on a short spring (240 ms; with Reduce Motion or Less motion a plain 150 ms fade), then its window is ordered out. The choice is saved in `dock.json` as `tucked`, and shown in Settings as **Where Flowflow lives**: On the screen edge (the usual) or In the notch (`character.lives`, store `dock`).
3. **While tucked.** No character window on any display, no roaming, no Come to what it is about trips, no peeking past the edge. Flowflow shows only inside the notch (the hover row and the small chat already draw its face), and the notch still lights for news as M96 does. The peek out from the notch side (M90) follows its own setting, unchanged. Stop everything, the mic light, the capture light and Hidden from screen sharing work exactly as before: none of them reads `tucked`.
4. **Getting it back, three ways.** Drag the face out of the hovered or opened notch onto the screen: it lands where let go, snapped to an edge by the usual rules. A **Bring Flowflow out** icon button with a tooltip beside Settings in the small chat. The Settings choice. Brought out by the button or Settings, it comes back to the edge and place it last had.
5. **Remembered** across restarts and display changes. A display change never brings a tucked Flowflow back by itself.
6. **Safety net.** Tucking needs the notch (`island.show` on). Turning the notch off while tucked brings Flowflow back to its place for good (`docking::notch_turned` clears `tucked`), so it can never vanish entirely and turning the notch on again later never hides it by surprise. A `dock.json` that says tucked while the notch is off is cleared the same way at the next placing. With the notch off, Settings refuses In the notch (`settings::lives_with`) and dims the row with "Turn on Show in the notch to use this"; Settings shows In the notch only when it is true (`settings::lives_value`).
7. **Where it went.** Right after a tuck the notch grows the same row for 2.4 s with "Squibby is in the notch. Point here to see it." (no glow), so a tuck by accident never looks like it vanished. Pointing at the notch ends it at once. The face in the hover row has the tooltip the chat's face has.
8. **Settings while tucked.** The choice reads On an edge or In the notch (side by side words stay at 12 letters or fewer, so not "On the screen edge"). In the notch, Screen edge, Going into the edge, At rest, Position along that edge and Same place on every display are dimmed with "Not used while Squibby is in the notch".

## The bubbles beside it

Everything drawn beside the character, found by reading the shell and the pages:

| Thing | Where it lives | After a drag, a dock, a tuck, a hide, a display change |
|---|---|---|
| The word under it (`dock-label`), the count badge, the thinking glyph, the drop ring | inside the character's own window | moves with it in the same frame (same window) |
| Flowflow's two trailing bubbles (M60 followers) | the live water's canvas | **the bug**: they sat on slow springs (1.6 to 2.2 Hz), so every time the window was moved by a drag, a landing or a peek they hung back where the orb had been. Now while its window moves they move by exactly the orb's own move each frame and swing round to their side on a short ease (about 120 ms, never more than 0.2 world units a frame), so a change of drag direction never jumps them to the other side; a firm landing puts them on the open side at once |
| Home when the notch is off (it opens beside the character) | its own window | closes at once when a drag begins, a tuck, a hide or a display change; placed again with the character after a landing |
| Home dropped from the notch, the peek out, the water ring, the pointer overlay | tied to the notch or the pointer, not the character | unchanged |

The rule is one pure function, `docking::tied_after`, tested.

## Decisions taken while building

- **The tuck zone is the top of the clear zone.** `docking::notch_zone` is 580 by about 310 points (the hover panel at its tallest), far bigger than the notch, so a drop anywhere near the top middle would tuck. The target is the island's own frame, 56 points wider each side, from the top of the display to 56 points under the menu bar (`docking::tuck_zone`), and a test holds it inside `notch_zone`.
- **The line is in the notch, not under Flowflow.** The notch grows the M96 row (330 by 42) for it, so it reads as the notch saying it. The glow is inset, since the island's window is exactly its shape.
- **Dragging out starts a real drag.** The face's page says `untuck_drag`; the shell shows the character centred under the pointer and follows it with the same `docking::Drag` as any drag. Letting go back over the notch tucks it again.

## Tests first (Rust pure functions)

- A let go over the notch gives `Landing::Tuck`; elsewhere the usual edge snap and free place; with the notch off it never tucks.
- The near the notch hint follows the pointer on and off, and is off with the notch off.
- Tucked: no roaming (`roams`), no edge placement (`lives` says Tucked on every display, after a display change too).
- Untuck restores the last edge and place, and the free place.
- Old `dock.json` files read back untucked; a broken `tucked` reads untucked.
- The setting round trip: `character.lives` reads and writes `tucked`.
- The tied bubbles rule.
- Page side: the followers stay beside the orb while its window moves, and a firm landing puts them on the open side in the same frame; the drag out state machine; the tuck motion and its Reduce Motion fade.

## [verify] on a real Mac

Also in `docs/research/technical_research.md` section 20.
- Drag events keep reaching the island's and Home's windows after the pointer leaves them, so a drag out of the notch follows all the way (macOS sends a drag to the window it began in).
- The inset lavender glow shows on the real notch row (the camera housing has no pixels).
- The tracking area on the island does not open Home while a drag passes over it.
- Listening and looking still show their mark in the notch while Flowflow is tucked (the island's own marks, M46).
- After a let go over the notch, the pointer is already on it: whether the tracking area then reports it inside (which ends the line after a tuck at once and opens the usual row) or waits for the next move.

## Built

- **Rust (pure, tested):** `docking.rs` `tuck_zone`, `over_tuck`, `Drag::set_tuck` and `over_notch`, `Landing::Tuck`, `Prefs::tucked` and `untuck`, `lives`, `tucked_in`, `roams`, `tuck_ms`, `tied_after`; `island.rs` `take_look`; `settings.rs` `character.lives`.
- **Shell:** `shell_dock.rs` (the hint during a drag, the tuck on the let go, `untuck` and `untuck_drag`, `lives_set`, `dock_front`, `tied_close`), `apply_dock` keeps a tucked character's window out, `peek_apply` and the trips stop while tucked, the island grows the take row (`place_island`, `tell_island` sends `take`), `island_hover_settle` opens nothing during a drag, turning the notch off brings it back.
- **Pages:** `app/src/tuck.ts` (the shell's words, the drag out state machine, `useTuck`, `useDragOut`), `dock.tsx` and `ui/tuck.css` (shrink toward, into and out of the notch; a fade with Reduce Motion), `island.tsx` (the take row and the glow, `ui/notch.css`), `islandPanel.tsx` and `notchChat.tsx` (drag the face out; Bring out button with the `bringOut` icon), Settings row `character.lives` on the Character page.
- **The bubbles bug:** `particles.ts` `Followers.carry` (`CARRY_EASE_S`, `CARRY_SPEED`) and `engine.ts` (`CARRY_AFTER_S`): carried by the orb's own move every frame while its window moves and for 0.45 s after a move or a landing, swinging to their side on a short ease. The first version placed them at their aim each frame, which jumped them across the orb when the drag turned (1.22 world units in one frame; the review). Reproduced first: the new tests measured the bubbles 1.69 world units (about 100 points) behind where they belong during a drag, and 0.32 after a landing; both are 0 now.
- **Words:** the founder said "Flowflow", but M72 item 7 keeps that name out of every word a user reads, so the line uses the character's own name: "Let go to tuck Squibby in", "Bring Squibby out", Settings "Where the character lives".

## Tests

- `docking.rs` `m111_tests` (8), `island.rs` `m111_tests` (1), `settings.rs` (1): the let go over the notch tucks and elsewhere snaps as before, the hint on and off, tucked stops roaming and edge placement on every display, untuck restores the place, old `dock.json` files read untucked, the setting round trip, the tied bubbles rule, the take row inside the clear zone.
- `app/src/tuck.test.ts` (8) and `app/src/flowflow/engine.test.ts` (3 new), `runner/test/settings-registry.test.ts` (`character.lives`).
- **Review fixes:** `docking.rs` notch turned off clears the tuck; `settings.rs` Settings never says In the notch while the notch is off, and refuses it then; `island.rs` the line after a tuck, and a let go touches the notch's hover only after a drag from or over it (and places the island again); `tuck.test.ts` the out timer never clears the take look (`tuckStep`), and only a click within 300 ms of a let go is swallowed (`swallowClick`, the next press forgets it); `engine.test.ts` no bubble swings more than 0.25 world units round the orb in a frame of a swinging drag, and in a steady drag they settle and move with the orb exactly; `settingsPages.test.ts` the choice's words and the dimmed rows.
- **Changed on purpose in the review:** the bubbles test "they sit beside the orb in the same frame" (gap to the aim under 1e-9) is replaced by the no jump and settle tests above, since sitting exactly at the aim was what made them jump. The setting test now goes through `lives_with` and `lives_value` instead of `dock_with` and `dock_value`.
- **Old expectations changed on purpose:** `homeset.rs` (the dock setting path names `lives_set`), `motion.test.ts` (one more at once move of the character's window: the drag out), `settingsPages.test.ts` (the new row leads the Character page's place group), `protocol/groups.json` (two new commands). `ui/styleLint.test.ts` now also lints `tuck.css`.

## Shots

Served from `app/dist` with a stand in for the app, headless Chromium at 2x, in the session scratch folder `m111shots/out/` (not committed): `1a-take-notch` (the row and the line with the glow), `1b-take-character` and `1c-character-before` (shrunk toward the notch), `2a-tucked-rest`, `2b-tucked-hover`, `3a-chat-bring-out`, `3b-chat-bring-out-hover`, `3c-chat-not-tucked`, `2c-tucked-said` (the line after a tuck), `4a-settings-edge`, `4b-settings-notch` (the edge rows dimmed with why), `4c-settings-notch-off` (the choice dimmed: turn on the notch first), and `6-bubbles-before-after` (drawn from the real engine: the springs before M111, the first fix that jumped, and now). The old `5-drag-out` shot was dropped: the pages cannot show the character's window under the pointer, so it showed only the hover row again; the drag out's page side is covered by `tuck.test.ts`. The real app was built and opened and launches with the character in its place; a drag onto the real notch needs a person's pointer and is a [verify] item.
