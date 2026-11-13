# M83: a notch that says more, Now minimal but detailed, reactions, and flight

The founder, 12 Nov 2026, with screenshots: "the notch looks a bit basic, it can be wider and give some more info, and make sure everything that I am saying actually works. Also Flowflow looks good but it only has one reaction." Then Home's Now: "make it really nice, it needs to be minimal but detailed." Then: Flowflow moves in arcs and swoops.

## What changed

**Part A, the notch's hover panel** (`app/src/notchQuick.ts`, `app/src/islandPanel.tsx`, `app/src/ui/notch.css`, `app/src/style.css`, `app/src-tauri/src/island.rs`, `app/src-tauri/src/docking.rs`)
- Width 400 to 560 (`PANEL_W`, about 1.4 times). The character's clear zone grows to match: `NOTCH_CLEAR` goes from 420 to 580 wide.
- A row of up to three short facts under the head (`notchFacts`):
  - the job's step and time;
  - the last check and when ("Checked 2:14 pm, working" green, "Check failed 2:14 pm" red, "Passed 2:14 pm, changed since" orange);
  - files changed and waiting for a review (orange);
  - the AI tools connected (blue), or "No AI tool connected" (no colour);
  - what was caught this week.
- Facts follow three rules:
  - A fact with no data is left out.
  - A fact the head already says is not repeated.
  - Each press only opens Home (`island_go`): the review, Settings at Your AI tools, or Now.
- The panel never asks the engine for the tools. It listens for the `donesignal.state` Home asks for.
- The fixed height goes from 96 to 128 (`LAYOUT_H`, `notch.css`, still inside `PANEL_MAX`). The facts row keeps its 22 px even when empty, so nothing moves.
- The job's time moves from the job row into its fact.

**Part C, Home's Now** (`app/src/card.tsx`, `app/src/statusStrip.tsx`, `app/src/ui/black.css`, `app/src/handoffCard.tsx`)
- **Status strip under the lead** (`homeFacts`): up to four tiles, each a caption over a short value with its meaning's dot. Each tile opens its place.
  - It shows at rest, over a result, and beside the review card. Beside the review card it leaves the changes out, because the card already says them.
  - It leaves "No AI tool connected" to the Connect your AI tools row, and what was caught to the list when the list's row is there.
- **The practice lead's words:** the main button says Start the practice (it was Check my project), the line under it says the same, and Skip says Skip the practice.
- **The Fix it key line** moved from the bar's corner to the ask box's foot, on the right of More ways to ask.
- **One rhythm:** the lead's words no longer keep the old waterline's room under them.
- **Flowflow resting low in the corner is on purpose.** A soft hairline at its waterline makes it read as peeking over an edge, never as a cut shape.
- A hand off waiting for the person's tool makes the character watch.

**Part B, reactions** (`app/src/moods.ts`, `app/src/useMood.ts`, `app/src/flowflow/*`, `app/src/characters.ts`, `app/src/ui/parts.tsx`, `app/src/ui/parts.css`, `app/src/homeCharacter.tsx`, `app/src/dock.tsx`, `app/src/island.tsx`, `app/src/flowflowMini.tsx`, `app/src/model.ts` with one additive `stopped` count)
- At rest the eyes are soft, open and round. The happy closed arcs are now a reaction.
- The reactions, each from a real event only:
  - proud: a proven fix, checks passing, a practice fixed;
  - worried: Not safe yet, or a key caught;
  - relieved: an Undo done;
  - watching: Claude Code waiting, or a hand off waiting;
  - hello: the pointer comes to rest on the character or the notch;
  - sleepy: ten minutes with no activity.
- Stop everything calms any reaction.
- The Visor and the orb show the same reactions in their own art.
- With Reduce Motion, each reaction is a still look.

**Part D, flight** (`app/src/flight.ts`, `app/src/dockFlight.ts`, `app/src-tauri/src/roam.rs`, `shell_roam.rs`, `shell_dock.rs`)
- Every trip follows the shell's lifted quadratic arc, and the body follows it too: it stretches and leans along its direction, grows a little at mid flight, and lands with a squash and settle.
- Picking a new edge or corner now flies there.
- With Reduce Motion a trip is a fade.

## Tests
- `app/src/m83Notch.test.ts`:
  - clock words;
  - each fact and its colour;
  - no fact without data;
  - no repeat of the head;
  - at most three facts, and Home's four;
  - every fact only opens Home;
  - the width and height pinned in TypeScript, CSS and Rust;
  - the clear zone holds the panel.
- `app/dom/hoverPanel.test.tsx`: the facts row in the real panel. The panel sends nothing to the engine, and presses open the review and Your AI tools.
- `app/src/m83Reactions.test.ts`:
  - a table of real events to their reactions, and each returns to rest;
  - nothing changes without an event, except sleepy after ten minutes;
  - every state has a look in every character style;
  - Reduce Motion.
- `app/src/flight.test.ts`: the path is curved and ends on the target, the lean follows the direction, and Reduce Motion is a fade.
- **Old expectations changed on purpose:**
  - `notchQuick.test.ts`: the height may now be up to 128, for three rows.
  - `system.test.ts`: the Fix it key is no longer in the bar; it is in the ask foot.
  - `roam.rs`: one spot beside a window now goes below the wider notch zone (313.5).
  - Part B and D pins: see the agent reports in the change.

## [verify] on a real Mac
- The 560 wide panel on the smallest notched MacBook (1280 points at More Space) and on a display without a notch. Nothing under it is covered in a way that matters.
- `donesignal.state` from Home reaches the island window, so the tools fact appears after Home has shown Now once.
- The clock words follow the Mac's 12 or 24 hour choice. Today they always use the 12 hour clock, so the 24 hour setting needs a look.
- The resting hairline sits right under the live drop at every text size and in both layouts.
- Sleepy starts after ten quiet minutes, which needs nothing the engine sends on a timer to change the model. The middle-of-screen gaze is right in the dock, Home and the notch.
- The flight's page clock stays with the shell's trip, also when the pointer pauses a trip. The Reduce Motion and Less motion fades look right.
