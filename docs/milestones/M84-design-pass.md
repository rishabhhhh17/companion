# M84: the notch and Home, minimal but detailed

The founder, 13 Nov 2026, on the real app, with a screenshot of the M83 hover panel on a project not checked yet, with no Home opened since launch: "I hope the notch will be changed." The panel said "Hi there · Squibby practice signup page", "Not checked yet", Settings and Open, then an empty 22 point row (a blank gap), then Ask and Check my project. A lot of black and little said. Before that: "if I just hover my cursor over the notch it looks very basic", and "minimal but detailed", with the YC bar of Linear, Raycast, Arc and Things.

The why and the exact cases come from the checked research of 13 Nov 2026, now in `docs/research/2026-11-13-*.md` (start with `2026-11-13-research-synthesis.md`). Feature 1 of its ranked list is this milestone: a hover that shows "waiting on you" for each agent in each hooked tool, and the latest review as a small card with its proof result and a one tap Undo. HeyClicky's hover peek (one small card per agent, `2026-11-13-competitors.md` section on HeyClicky, 24 Sep 2026) and its sidebar for every agent (30 Oct 2026) are the patterns; never its code or its look.

## The root cause, and the fix

The M83 panel kept a fixed 22 point facts row so that "nothing moves", and the facts in it had nothing to say for a project never checked, and the AI tools fact only came after Home had asked the engine once. So the first hover after launch always had an empty row.

The fix (`app/src/notchPeek.ts`, tested in `app/src/m84Peek.test.ts` and `app/dom/hoverPanel.test.tsx`):
- The panel is made of rows, and each row it lists says something. No row is ever kept empty, in any state.
- The panel asks the engine for the project's AI tools itself (`donesignal.show`, read only) the first time it opens for a project. Until the answer comes (a few milliseconds), the row says "Checking your AI tools". With no tool connected, it is the one Connect your AI tools action.
- A project not checked yet still shows real things: the AI tools (or Connect), the practice offer, what changed since you last looked when that is known, and the key to press.

## Critique of every place, and the change list

**Hover panel.** Before: a greeting, one fact, two buttons and a blank row; nothing about the AI tools the product exists to watch; no sense of what was last checked. Changes, all built:
1. Flowflow's live face beside the greeting, in the state it is in.
2. One small card per AI tool (two letter mark, name, what it is doing now): Claude Code "Waiting on you" first, in orange (its waiting hook), else "Connected, watching" or "Half connected". At most three, then "+N more". Each opens Home: waiting on Now, the rest on Your AI tools.
3. The latest review as a small card: what it was, when, its proof result (Checks passed in green, Checks failed in red, Not checked in grey), and Undo when Home can undo it. Undo only opens Home on its own confirm step (`{ do: "undo" }`); nothing is undone from the notch. A review of another tool's changes has See it instead (its saved copies are in History).
4. When nothing was reviewed yet, the next useful thing as a card: changes waiting, files changed since the last check, the practice offer, or that nothing is new.
5. A thin progress line under the head while a job works (its four steps as a share of the width, on the work card's own run line).
6. The key to press at the foot ("Press ⌃⌥⌘F when stuck", or the Stop keys while a job works), from the person's own keys. With three buttons the keys stand alone; the words stay in the tooltip and for VoiceOver.
7. The rows arrive one after another on the motion tokens (`--seq-peek-row`), and with Reduce motion they simply appear.
8. Four rows (222 points); without a project or an engine to ask, three (168 points). Never a reserved empty row.

**Now.** Before: a good lead and status strip, then empty room down to the ask box. Changes: a calm timeline of today under the list (reviewed, caught, fixed, undone; each with its clock time and its meaning's tile, newest first, at most six). Empty, it says what will appear and offers one action: Connect your AI tools while none is, else See all history.

**Home's side list.** Before: the places and the recent work. Changes: a slim AI tools section under the places, one row per tool with its mark, name and what it is doing now (HeyClicky's pattern of a sidebar for every agent); one Connect row while none is.

**Learn.** Already a strong list with numbered practices and times. No change; it is the reference for how rows look.

**History.** Rows are clear and the week summary is useful. The long explainer line at the top is the heaviest text on any place; left for a writing pass so this milestone stays on the notch.

**Memory.** Shows "Looking up what I know" until the engine answers. Its empty state already says what will appear; no change.

**Settings.** The sections and rows are consistent with the M71 structure. No change.

**The first run.** Strong already (the key, the three promises, the live demo). No change.

**The ask box.** Already holds the project token, chips, Have my AI do it and the key line. No change.

**One system.** Every new part uses the M71 black look and its one structure: tiles and dots from `meaning.ts`, the type scale (`--t-*`) and spacing (`--space-*`) tokens, one icon set (one new drawing, `plug`, in the same 1.5 point line), and only the motion tokens (`--dur-*`, `--loop-*`, the new `--loop-progress` and `--seq-peek-row`). New sizes are tokens in `ui/tokens.css` (`--peek-face`, `--peek-mark`, `--peek-line`, `--today-time`). Every word is in `strings.ts` (`S.m84`).

## Tests

- `app/src/m84Peek.test.ts`: the founder's exact case; every state of the quick and job layouts has rows that each say something; heights pinned against the shell's limits; the tool cards (waiting only for Claude Code, only in this project, at most three and a count); the latest review (proof, colour, when, Undo only where Home offers it and only as an arrival); the next useful thing and that every place it opens is one Home accepts; the timeline of today; no words or colours in `notchPeek.ts`.
- `app/dom/hoverPanel.test.tsx`: the panel asks for the AI tools once on its first open and not while hidden; the tool cards and Connect only open Home; a project never checked has no empty row; the review card's Undo only opens Home on its confirm step.
- `app/dom/m84Home.test.tsx`: Now's timeline (empty state with its one action, and real rows) and the side list of AI tools.
- **Old expectations changed on purpose:**
  - `m83Notch.test.ts` and `notchQuick.test.ts`: the layout height is now 222 (four rows), the M83 facts row with its fixed empty slot is gone, and every press goes through the one helper that opens Home.
  - `notchQuick.test.ts`: the panel draws the character twice (the opt in hello, and now the face in the head).
  - `meaning.test.ts`: a new fact kind, `waiting` (Claude Code waits on you), in the question colour.
  - `hoverPanel.test.tsx`: the panel now sends one read only message, `donesignal.show`, on its first open; presses still send nothing.

## [verify] on a real Mac

These are also in `docs/research/technical_research.md` section 20, item 29.
- The island's `donesignal.show` reaches the engine on the first hover after launch, and the cards appear within a moment.
- The 222 point panel fits under the notch on the smallest notched MacBook at More Space, and on a display without a notch.
- Flowflow's face in the panel adds no idle cost while the panel is closed.
- The two letter marks read clearly at every text size.

## Not built, on purpose

- "Done and reviewed" per tool. The done marker is one file per project, so a review cannot yet be credited to one tool. Giving each tool its own marker changes the hook lines already in people's projects; it needs its own plan.
- "Waiting on you" for the six other tools: they have no waiting hook (`runner/src/donesignal.ts` `TOOL_HOOKS`).
- A thumbnail replay in the review card (research feature 6): later.

## Shots

Taken with the pages served from `app/dist` and a stand in for the app, headless Chromium at 2x, in the session's scratch folder (not committed): `m84shots/before/` and `m84shots/after-final/`, eleven hover states and nine places of Home, each wide (960 by 640) and tall (688 by 940), with contact sheets `sheet-hover-before.png`, `sheet-hover-final.png` and `sheet-home-final.png`.
