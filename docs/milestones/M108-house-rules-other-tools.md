# M108: House rules at session start in Codex, Gemini CLI and Antigravity

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 21 Nov 2026, not committed. Nothing is spent: no model call of any kind, no key, no account. Fixtures, the stand in app and temporary folders only.

From "M108. House rules at session start in Codex, Gemini CLI and Antigravity" (the 15 Nov plan, Part 2), and the review note `beat-1115/review-house-rules-other-tools.md`.

## Why (from the plan, sources seen 15 Nov 2026)

- Squibby's lab: with the start block, rules were kept 36 of 36 times. Without it, a decision was broken in 5 of 6 tries (`docs/status/2026-11-11-memory-lab.md`). That was Claude Code only.
- Codex now documents SessionStart with startup, clear and compact sources, and plain output becomes context (learn.chatgpt.com/docs/hooks). So the `donesignal.ts` comment saying other tools' start contracts are missing is wrong for Codex.
- This keeps the F30 promise (a companion to every AI coding tool). It does not beat HeyClicky: HeyClicky 1.1.3 re-reads notes only inside its own jobs (heyclicky.com/changelog, 6 Nov entry).

What the person gets: their project's house rules reach Codex at the start of each session and after it compacts. They reach Gemini CLI and Antigravity at session start.

## What to build (from the plan)

1. Add `start` to `TOOL_HOOKS.codex` with the matcher `startup|clear|compact`, reusing Claude Code's print command. The person trusts it in Codex's `/hooks`.
2. Gemini CLI: SessionStart `additionalContext` (startup, resume, clear; no compact) (geminicli.com/docs/hooks/reference).
3. Antigravity: SessionStart `injectSteps` (antigravity.google/docs/hooks).
4. Each one only after its own real Mac check: built now, every claim waits for the check ([verify] below).
5. No per turn hooks by default. They re-send about 700 tokens every turn and were never tested. At most, a Settings choice that is off by default.
6. Park Cursor, Copilot and Windsurf, marked unconfirmed (Cursor's sessionStart is fire and forget with nothing after compaction; Copilot does not say what sessionStart's output does; for Windsurf no source confirms hook output reaches the model).
7. Update the `donesignal.ts` comment and `technical_research.md`.

## Tests first (from the plan)

- The hook prints exactly the start block, byte for byte.
- It is 30 lines at most.
- It never reads chat.
- Remove takes it out.
- It is listed on the yes card.

## Rules it must hold

Rule 15 (visible, with its source, forgettable), rule 18 (each tool checked on a real Mac before a claim), rules 5 and 6 (the hook prints a file and reads nothing of the chat), rule 10 (no git).

## How it works (built)

- **The hooks.** `runner/src/donesignal.ts`: `start` is now in `TOOL_HOOKS` for Codex, Gemini CLI and Antigravity (`START_TOOLS` is every tool that has it). `startEntryFor` writes each tool's own shape: Codex the same entry as Claude Code (`SessionStart`, matcher `startup|clear|compact`, timeout 5 seconds); Gemini CLI a named `companion-start` with no matcher (its lifecycle matchers are exact strings, so a `startup|clear` matcher would never match; startup, resume and clear all print it) and a 5000 millisecond timeout; Antigravity its own named hook `companion-start` at the top of `.agents/hooks.json`, `SessionStart` holding the command (its docs say the matcher is ignored there). Every one is the same command shape as Claude Code's: it prints one file from Squibby's own `start` folder with `/bin/cat` and ends with 0. It never reads its input, so nothing of the chat is touched (rules 5 and 6).
- **The files.** `runner/src/memory/sessionstart.ts`: one file per form, written only while a tool that prints it has its hook set up here. `<token>.md` is the plain block for Claude Code and Codex. `<token>.gemini.json` is `{"hookSpecificOutput":{"additionalContext":<block>}}`. `<token>.antigravity.json` is `{"injectSteps":[{"systemMessage":{"systemMessage":<block>}}]}` (`startPayload`). An empty block writes no JSON file, so the hook prints nothing. Removing one tool's line keeps another tool's file; the search index goes once no tool has a line (`main.ts` now refreshes on Remove instead of dropping everything). The sweep at the engine's start removes each tool's file by its own hook.
- **What each tool is told.** Claude Code's block is as before. Codex reads AGENTS.md itself, so when only Codex is set up, the lines of Squibby's shared AGENTS.md block are left out (`sharedForCodex`). Gemini CLI reads GEMINI.md unless told otherwise, and Antigravity's reading of AGENTS.md is unconfirmed, so both are handed the full block. All are 30 lines at most (`START_LINES`).
- **The rows and the card.** `app/src/doneSignal.ts` and `S.m108`: a row per tool in Settings, Fixing, Your notes at the start (its own group since the review): "Give Codex my notes as each session starts", with a line that says when (Codex: "and after it sums up a long conversation to make room"). Set up opens the usual yes card with the exact lines and file, the git note, the tool's own trust note (Codex `/hooks`, Gemini CLI's trust question, Antigravity's Customizations) and "This is new for Codex and is still being checked on a real Mac. The Memory page shows exactly what Codex is handed." Remove says "Removed. Gemini CLI is no longer handed your notes here." The start block stays out of Connect, as Claude Code's always has.
- **Delete everything and a project leaving.** The shell's own clean up (`app/src-tauri/src/donehooks.rs`) already took out start lines under `SessionStart` in every tool's file, but it did not know Antigravity's new named hook. `companion-start` is now one of `ANTIGRAVITY_KEYS`, so the Rust side and the runner agree on every key (the M80 cross check reads the runner's source).
- **The Memory page** now says "What your AI tools are told at the start" (and the week page's "Decisions your AI tools are told at the start"), since more than Claude Code can be handed it.
- **Not built, on purpose.** No per turn hook (Gemini CLI's BeforeAgent, Antigravity's PreInvocation, Codex's UserPromptSubmit): each would re-send about 700 tokens every turn and none was tested; the plan allows at most an off by default choice, and nothing asks for it yet. Cursor, the VS Code agent and Windsurf stay parked, unconfirmed. No copy claims the rules are kept by any tool but Claude Code.

## Tests (written first, RED seen)

- `runner/test/m108-start-other-tools.test.ts` (16 tests): the tools that have it and the parked ones; each tool's file and shape; the hook run for real with `/bin/sh` and chat like input prints exactly the block (Codex plain, byte for byte the same file Claude Code prints; Gemini CLI's `additionalContext` and Antigravity's system message equal to the block); 30 lines at most with 60 notes; it never reads chat (no stdin read in the command, the input never printed); empty notes and a missing folder print nothing and exit 0; files follow each tool's hook; Codex keeps the shared file when Claude Code is removed; Gemini CLI gets the shared AGENTS.md lines that Claude Code and Codex read themselves; the sweep; Remove takes out only the start line (the person's own SessionStart line and Squibby's other kinds stay), and a file and folders Squibby made for it alone go; the card shows the exact lines before any yes.
- `app/src/m108.test.ts` (4 tests): each row and card names its tool, shows exactly the lines, has the tool's trust note and the still being checked line, never claims the rules are kept, never says Claude Code for another tool, has no em dash; Remove's words; the start block is not part of Connect.
- `app/src-tauri/src/donehooks.rs` `m108_the_start_lines_of_codex_gemini_and_antigravity_go_and_the_persons_own_stay` (RED first: Antigravity's `companion-start` stayed behind): Codex's, Gemini CLI's and Antigravity's start lines go, the person's own SessionStart hooks stay.
- Expectations changed on purpose (the product changed): `runner/test/m80-every-tool.test.ts` and `m105-which-tool.test.ts` (Codex, Gemini CLI and Antigravity now list `start`), `m78-index.test.ts` (Codex now has a start plan; Cursor still does not), `m77-guard.test.ts` (the Settings rows now include `codex:start`, `antigravity:start`, `gemini:start`), and the Rust M80 cross check (the runner's Antigravity keys now include `companion-start`).

## Compared with the best (21 Nov 2026)

Against HeyClicky (the notch companion), CodeRabbit (AI code review) and Coucou (the notch agent watcher, github.com/Louis-CFM/coucou). Research notes: `beat-1115/heyclicky.md`, `coderabbit.md`, `orchestrators.md`. Copied what works; never their names, characters, sounds or look.

**Where we match.**
- CodeRabbit reads a project's rule files (AGENTS.md, CLAUDE.md, .cursorrules) and keeps learnings you can see at one address. Ours reads the same house rules and notes and shows each line on the Memory page with its source, where it can be forgotten.
- HeyClicky has profile and project notes, and since 1.1.3 its long jobs re-read the goal and rules as they go. Ours hands the same notes at each start, and Codex gets them again after it compacts.

**Where we are better.**
- Reach: HeyClicky's and CodeRabbit's notes stay inside their own agent or review. Ours reach the person's own Claude Code, Codex, Gemini CLI and Antigravity, the tools that write the code. Coucou watches agents but hands them nothing.
- Steps: one Set up per tool, one card with the exact lines, one Remove. Nothing to write in a rules file by hand.
- Clarity: the card shows the exact file and lines before the yes, and the Memory page shows exactly what each tool is handed. HeyClicky does not say whether its memory can be seen or edited (heyclicky.md, unconfirmed).
- Speed and cost: the hook is one `cat` of a small file, no engine needed, and it never re-sends every turn.

**Gaps.**
- Closed here: the Memory page said only Claude Code is told the notes; it now says your AI tools.
- Closed here: a row for another tool read "When a Antigravity session starts"; break-ui caught it and the words now read "When Antigravity starts a session here".
- Left: only Claude Code is proven to keep the rules (the 11 Nov lab). Codex, Gemini CLI and Antigravity wait for the real Mac checks and a small Codex lab (M109). Cursor, the VS Code agent and Windsurf wait for their makers to document a start hook whose output reaches the model. CodeRabbit learns preferences from chat replies; ours learns only from explicit signals inside Squibby (rule 15), on purpose.

## break-ui and the look

- Shot with the stand in app, deviceScaleFactor 2, normal and worst case (a 90 character home path in every line the card shows, a long project folder), wide (960) and narrow (420): the rows, the Codex card, the Gemini CLI card. Found: "a Antigravity" (fixed, tested). Held up: long labels wrap under the title with the button kept right; the exact lines scroll inside the card's code box as every other yes card's do; Set up and Remove keep their place. No colour, token, icon or tint changed; the rows are the existing Settings rows.

### The review (21 Nov 2026)

Four findings, all fixed:

1. **The Memory page did not show what Gemini CLI, Antigravity or Codex alone were handed.** The engine now returns `memory.state.start.forms`, one `{ tool, text }` per tool set up, exactly each tool's file text before its JSON (protocol `StartForm`, fixture `m108e1`, read by the runner, the pages and the Rust shell). The rows are every line any tool set up is handed. The page shows one "Show it exactly as Gemini CLI sees it" per tool (tools handed the same text share one: "Claude Code and Codex"). Tests: `runner/test/m108-start-other-tools.test.ts` (each form equals the tool's file, with AGENTS.md shared lines and CLAUDE.md importing them), `app/src/m108.test.ts`, `app/dom/m108.test.tsx`, Rust `m108_the_start_forms_...`. The card's "The Memory page shows exactly what Gemini CLI is handed" is now true.
2. **The real Mac check could pass without proof.** The data folder is now a separate `mktemp` folder outside the practice folder, passed to `setup` and `show`. The script also found that the project's own note file (`.companion/project.md`) held the word, so once the start file is written that copy is removed from the practice folder; setup takes only a new, empty folder and refuses a data folder inside it; the shell script runs `grep -r PLUM-7` on the practice folder before the person starts the tool. Test: `runner/test/m108-practice-check.test.ts`.
3. **Missing worst case shots.** Added below.
4. **The start rows were hard to find.** They now have their own group on Fixing, Your notes at the start (title and foot line in strings.ts), right after Start reviews sooner, drawn with the same Row parts; Set up in Settings on the Memory page goes there (`START_SETTINGS.hook` is `fixing.start`). The old expectation in `m78.test.ts` that it went to `fixing.done` changed on purpose.

Shots of the review (normal and worst case: a long home path, long rules, decisions and sources), wide (960) and narrow (420): the Your notes at the start group; the Antigravity yes card (its named hook and the Customizations note); the Remove result line; the Memory page start part on (two views, Claude Code and Codex, and Gemini CLI), off and empty; the week page's "Decisions your AI tools are told at the start". Found and fixed: the exact view was an unstyled `pre` whose long lines widened the whole Memory page; it now wraps inside the same inset code box as a yes card's lines (layout only, existing tokens). The Remove line sat flush with the card's edge; a result line at the foot of a card's rows now lines up with the rows' words. No colour, token, icon or tint changed.

## Skills applied

- ecc-tdd-workflow: every behaviour had its failing test first (the runner tests failed on the missing exports and Gemini CLI's AfterAgent event; the Rust test failed on Antigravity's leftover key), then the smallest change to green.
- ecc-verification-loop: build, types, tests and a diff review before the report; the full runner suite found the m77 rows list, and the Rust suite found the shell's clean up missing `companion-start`.
- ecc-react-patterns: no new component or state; the rows and card derive everything from the engine's state in pure functions (`hookLabel`, `doneAsk`, `removedLine`).
- ecc-react-performance: nothing new renders or fetches; the rows come from the one `donesignal.state` the page already asks for.
- ecc-frontend-a11y: the new rows reuse the existing Row and ConfirmStep (labelled, with focus going back to the row's own button on Not now); every row's label names its tool so a screen reader can tell four similar rows apart.
- ecc-motion-foundations and ecc-motion-patterns: no motion added; the card opens as every yes card does, Reduce Motion unchanged.
- ecc-rust-patterns: one constant extended, no new allocation or unwrap outside tests.

## Suites (21 Nov 2026, each run alone, after the review)

- Runner: `bun test` 6194 pass, 3 skip, 0 fail (6197 tests, 300 files); `bunx tsc --noEmit -p .` clean.
- Pages: `bun run test` 4569 pass, 0 fail; `bun run test:dom` 314 pass, 0 fail; `bun run typecheck` clean; `bun --bun vite build` built.
- Rust: `cargo test --quiet` 1432 passed, 0 failed, 8 ignored. Clippy: no new warning (the only one in the files this touches is the old doc list note in `donehooks.rs` line 10, untouched).
- Shots, 2x, from the last build: scratchpad `m108r/out` (normal) and `m108r/out-long` (worst case), wide (960) and narrow (420): the Your notes at the start group, the Antigravity yes card, the Remove result line, the Memory page start part on, off and empty, and the week page heading.

## [verify] items (also in docs/research/technical_research.md section 20, item 59)

- (a) Codex: once the line is trusted in `/hooks`, the practice word is named at startup, after `/compact` and after `/clear`. Script: `scripts/m108-check-start.sh codex`.
- (b) Gemini CLI: `additionalContext` is read from the JSON with no `hookEventName`; whether a resumed session gets the block twice. Script: `scripts/m108-check-start.sh gemini`.
- (c) Antigravity: which injectSteps form (object or string system message) reaches the model. Script: `scripts/m108-check-start.sh antigravity`.
- (d) A small Codex lab, as the 11 Nov memory lab, before any claim that Codex keeps the rules.
- Guide: `docs/milestones/M109-real-mac-guide.md`, M108.
