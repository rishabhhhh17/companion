# M114: Approve and answer from the notch

Status: the founder said yes on 17 Nov 2026 ("Yes, okay, add that"), for the "match Coucou" part of the plan (M113 to M115). Plan written 20 Nov 2026, before any code. Not committed. Nothing is spent: no model call of any kind, no key, no account, no deploy. Fixtures, the real hook commands run by `sh`, and temporary folders only. Real tools on a real Mac are [verify] items below, with a ready script, and are in the real Mac guide (`docs/milestones/M109-real-mac-guide.md`).

From the plan (`beat-1115/plan.md`, "M114: Approve and answer from the notch"): Claude Code permission requests (its PermissionRequest hook) show Allow, Deny and Always in the notch; AskUserQuestion choices show in the notch (single or multi select). Codex gets Allow and Deny through its own hook. "Answer in the tool instead" always works. Squibby never answers for the person (rule 13: a tap every time); a closed or slow Squibby never blocks a tool (it fails open to the tool's own prompt); "Always" writes only the tool's own allow rule, shown first. Copy features only: never Coucou's name, its character, its sounds or its look. The approved look stays (the one from before M112): no colour, theme, icon set or tint changes; new parts reuse the notch's own tokens and buttons.

## What the person gets

When Claude Code or Codex stops to ask permission, the notch opens by itself (as it does for Squibby's own questions) with one card:

- what the tool wants, in plain words: "Claude Code wants to run a command" and the short, redacted command (`npm test`), or "wants to edit a file" and the file's name, or "wants to open a web page" and its site;
- **Allow** and **Deny**; for Claude Code also **Always allow**, which first shows the exact rule it will write (`Bash(npm test:*)`) and writes it only into Claude Code's own project settings, through Claude Code itself;
- **Answer in Claude Code** (or Codex), which hands the question back to the tool's own prompt at once.

When Claude Code asks the person a question (its AskUserQuestion tool), the notch shows the question with its choices as buttons. One choice answers at once; with several allowed, the person picks and presses Send. Several questions show one at a time (1 of 3). Answer in Claude Code works here too.

If the person does nothing, the card goes after the wait set in Settings (60 seconds by default) and the tool asks in its own window as it always does. If the person answers in the tool, the card goes within a second. Stop everything takes every card away and hands each question back to its tool. Nothing is answered without a press.

## How Coucou does the same job (read in its MIT code, `NotchBuddy/Sources/App/HookServer.swift`, `docs/INTEGRATIONS.md`)

- A user wide hook on `PermissionRequest` runs its relay, which holds a socket open to the app for up to about 118 seconds and prints the hook's decision: `hookSpecificOutput.decision.behavior` allow or deny; for Always it hands back every one of Claude Code's `permission_suggestions` as `updatedPermissions`.
- AskUserQuestion (Claude Code 2.1.85 and later) arrives as `PreToolUse` with `matcher: "AskUserQuestion"`; the answer is `permissionDecision: "allow"` with `updatedInput: { questions, answers }`.
- With the app closed or no answer in time, the relay prints nothing and the tool asks in its terminal. If the person answers in the terminal, the card clears "at the next event of the session".
- Codex and Copilot get no Always (their hooks have no rule to write).

What we do differently, on purpose:

- **Per project, after a yes that shows the exact lines** (rule 13), like every other hook of ours. Coucou writes the person's user wide settings.
- **Always shows its rule first and writes only that rule.** Only an `addRules` suggestion with `behavior: "allow"` passes, and always to `localSettings` (the project's own `.claude/settings.local.json`, through Claude Code). Mode changes, new folders and every other suggestion are dropped. Coucou hands every suggestion back unseen.
- **A card answered in the tool goes within a second**, because the engine checks the waiting hook is still alive (its process id is in the request's name). Coucou waits for the session's next event.
- **A Squibby that quits mid wait lets go at once**: the hook checks the engine is alive every tenth of a second and stops waiting the moment it is gone.
- **Nothing is kept**: the request is removed from Squibby's folder as it is read; the question and its choices live in memory only while the card shows; no History row, no log line.

## What to build

1. **Two hook kinds** (`runner/src/donesignal.ts`), added like every other hook: a row in Settings and a part of Connect, after the one yes.
   - `approve`: `PermissionRequest` for Claude Code (`.claude/settings.local.json`) and Codex (`.codex/hooks.json`, beside its waiting signal).
   - `answer`: `PreToolUse` with matcher `AskUserQuestion`, Claude Code only (beside the guard, which keeps `Bash|Read`).
   - Their command checks the engine is alive, copies the request to Squibby's guard folder as `<token>.<pid>.<tool>.perm` or `.question`, waits for the answer file (at most 125 seconds, stopping early the moment the engine is gone), prints the answer file if it has anything in it, and always exits 0. With Squibby closed it writes nothing and exits 0 at once. A trap removes its files if the tool ends it.
   - A tool connected before M114 still counts as connected; its Settings rows offer both.
   - Two of Squibby's hooks may now sit under one event (Codex's waiting and approve under `PermissionRequest`; Claude Code's guard and answer under `PreToolUse`), so adding, checking and removing one kind never touches the other.
2. **The asks in the engine** (`runner/src/toolask.ts`): each request becomes one ask (the tool, the project, what it wants in short redacted words, the rule Always would write, or the questions and their choices). Said as `toolask.request`; answered only by the person's `toolask.answer`; ended by the wait, by the hook going away (answered in the tool), by the tool's done signal and by Stop everything, each said as `toolask.resolved`. The reply printed by the hook is built only from the fixed shapes in this file.
3. **Protocol**: `toolask.request` and `toolask.resolved` events, the `toolask.answer` command (page allowed, never gated, names no folder), `approve` and `answer` in `HOOK_KINDS`, fixtures for Rust and TypeScript.
4. **The pages**: the asks in the model (cleared by Stop everything), the words in `app/src/notchAsk.ts`, drawn in the notch's question list (`islandPanel.tsx`) with the notch's own buttons. The notch opens by itself for one as it does for Squibby's own questions (`island.openForQuestions`).
5. **A setting**, `notch.askWait` (30 seconds, 1 minute or 2 minutes; 1 minute by default): how long a card waits before the tool asks in its own window.

## Tests first

- The hook reply shapes per tool: Claude Code allow, deny, Always (only the allow rule, to `localSettings`), plan approval (with its input), a question's answers (single, several, several questions); Codex allow and deny and never Always; anything else prints nothing.
- The fail open path: the real hook command run by `sh` with Squibby closed exits 0 at once with no output; with the engine gone mid wait it stops within a second; with an empty answer it prints nothing.
- The timeout: the ask ends after the wait with an empty answer, and is said as expired.
- Always: shown first, refused when the request has no allow rule, never a mode change or a folder.
- Answered in the tool: the hook's process gone ends the card.
- Stop everything ends every ask with an empty answer (never a deny).
- Hooks: two of ours under one event stay apart; Remove takes out only its own.
- The pages: the words, the buttons and what each sends, the notch opening by itself, Reduce Motion, VoiceOver names, worst case words.

## Rules it must hold

Rules 5 and 6 (only the person's own AI tool's hook, after their yes), 9 (the notch never takes the keys; every press here is a click), 11 (Stop everything ends every ask), 12 (safety stays in the tool's own permission system: Squibby only relays the person's tap), 13 (a yes card before any line is written, a tap for every answer, never a deny or allow by itself), 15 and 16 (plain words, nothing stored), 17 (tests first), 18 ([verify] below).

## Built (20 Nov 2026)

All of "What to build" above, plus what the comparison and break-ui found:

- **Two hook kinds** (`runner/src/donesignal.ts` `approve` and `answer`, `askCommand`, `askEntryFor`, `ASK_HOOK_EXT`, `ASK_WAIT_TENTHS` 125 seconds, `ASK_TIMEOUT_S` 130 seconds), offered in Connect and as their own rows in Settings, Fixing, after the card that shows the exact lines; Connect's card adds one line that the tool waits a moment for a press and Squibby never answers alone. Squibby's kinds under one event are told apart by what their command hands over (`kindOf`), so add, check and Remove touch only their own; Delete everything takes both out (`donehooks.rs` `EVENTS` already had `PermissionRequest` and `PreToolUse`).
- **The guard folder** reads `.perm` and `.question` (`runner/src/guard.ts`), removes each as it reads it, and hands it to the asks with the hook's process id; with no asks wired, an unknown project or no tool in the name, it answers empty at once. The look over the folder every 2 s (M113) also takes a request whose watch event never came.
- **The asks** (`runner/src/toolask.ts`): `parseAsk` (a command, a file, a read, a site, a plan, any other tool, or 1 to 4 questions of 2 to 6 choices), `alwaysRuleOf` (one allow rule only, shown exactly as written, never with a secret, never a mode or a folder), `replyFor` (the fixed shapes per tool; Codex has no Always and no questions), and `ToolAsks`: at most 8 waiting, ended by the wait (`notch.askWait`), the hook's process going (answered in the tool, checked every half second), the tool's done signal, Stop everything (an empty answer, never a deny) and the engine closing.
- **Protocol**: `toolask.request`, `toolask.resolved`, `toolask.answer` (page allowed, never gated, names no folder, in the core Stop tool of `groups.json` so no group switch can block an answer), `approve` and `answer` in `HOOK_KINDS`, fixtures `m114c1` to `m114c6` and `m114e1` to `m114e6`, checked by the runner, the pages and Rust (never replayed to a late page, never a log line, only the card's keys).
- **The pages**: `app/src/notchAsk.ts` (words, the question steps), `app/src/notchAsk.tsx` (the card), in the notch's question list (`islandPanel.tsx`), which opens by itself for an ask as for Squibby's own question (`island.tsx`, `island.openForQuestions`). One card at a time with "1 more waiting". A press waits the notch's ARM_MS like every question there. Stop everything and the engine going take every card away.
- **Setting** `notch.askWait` (30 seconds, 1 minute, 2 minutes; 1 minute), in General, Notch.
- **Worst case (break-ui)**, shot at 2x: the longest command and rule the protocol lets through wrap inside the card; a long project name wraps; a 300 character question is cut at three lines with the whole question as its tooltip and in what VoiceOver hears; six choices with Japanese and emoji wrap as chips; a long tool name wraps in code type. Fixed from the shots: Answer in the tool moved into the card's empty top right column (a long question had pushed it out of the notch's room, and the hover panel's list scrolled by 5 px), the dot sits beside the title's first line, and rows that span the card now reach its right edge.
- **Tests**: `runner/test/m114-approve.test.ts` (36), `app/src/m114.test.ts` (16), `app/dom/m114.test.tsx` (8), Rust `runner.rs` `m114_a_tools_ask_is_answered_from_a_page_names_no_folder_and_is_never_replayed_or_logged` and `donehooks.rs` `m114_the_approve_and_answer_lines_go_and_the_persons_own_permission_and_pre_tool_hooks_stay`. Changed on purpose, only the expectation the new kinds move: `runner/test/m77-guard.test.ts` (the Settings rows list), `m80-every-tool.test.ts` and `m105-which-tool.test.ts` (Codex's hooks), `m90-toolbusy.test.ts` (the done signal and Stop everything also reach the asks), `m82-connect.test.ts` (Connect through the engine adds the new hooks, and still never the start block), `settings-registry.test.ts` (the new setting), `app/src/m82.test.ts` and `m105.test.ts` (Connect's hooks), `island.test.ts` (the notch opens for an ask too) and `islandPanel.test.ts` (an ask is first seen like a card).
- **Shots** (2x, headless Chromium with a stand in for the app): `scratchpad/m114shots/out/` 1a to 1e (a permission opened by itself, under the hover row, Codex, a plan, two waiting), 2a to 2c (a question, the several pick step, Reduce Motion), 3a to 3e (worst case permission, question and tool; the keyboard ring; hover on Allow), 4 (Settings rows).

## [verify] on a real Mac

Each in a practice folder made by `scripts/m114-capture-asks.sh <claude|codex> <watch|allow|deny|always|answer>`, then `scripts/m114-capture-asks.sh check <folder>` (no model is paid for by the script; the tool's own run is the founder's). In the real Mac guide and in `docs/research/technical_research.md` section 20, item 55.

- (a) Claude Code's `PermissionRequest` input has `tool_name`, `tool_input` and `permission_suggestions` with an `addRules` allow rule for a Bash command. [verify]
- (b) Whether Claude Code shows its own permission prompt while the hook waits (so Answer in Claude Code in the terminal works at once), and that answering there ends the hook (the card goes within a second). [verify]
- (c) Claude Code honours `decision.behavior` allow, deny (the message reaches Claude) and allow with `updatedPermissions` (the rule lands in `.claude/settings.local.json`); the Coucou notes mention a report that deny was once ignored. [verify]
- (d) An `ExitPlanMode` allow with `updatedInput` starts the plan. [verify]
- (e) AskUserQuestion arrives at `PreToolUse` with matcher `AskUserQuestion` (Claude Code 2.1.85 or later), and `permissionDecision: "allow"` with `updatedInput.answers` answers it; several picks joined with ", " are read as several (newer versions may take a list). Also: whether AskUserQuestion fires `PermissionRequest` too when both the answer and the approve hooks are on (the engine already hands that copy back at once while the question card waits or for 5 seconds after it ends, so it never shows twice or doubles the wait). [verify]
- (f) Codex runs a project `PermissionRequest` hook once trusted with `/hooks`, its input names the command the same way, it honours `decision.behavior` allow and deny, and an empty output leaves its own prompt. With Codex's automatic reviewer on, whether the hook holds it up (Coucou skips its card then by reading Codex's own session file, which Squibby does not read). [verify]
- (g) In Squibby on the practice folder: the notch opens by itself with the card within about a second of the request; each press works; with the wait at 30 seconds and no press, the tool asks itself after 30 seconds; Stop everything hands it back at once; nothing is left in the guard folder or the log. [verify]

## Compared with the best

Against Coucou (the notch agent watcher, its MIT code read for this job), HeyClicky (the notch companion: Allow once, Always allow, Not now) and CodeRabbit (clear findings, one click fixes). Copied what works; never their names, characters, sounds or look.

**Where we match.** Coucou's core of this job: Allow, Deny and Always for Claude Code's permission requests, Allow and Deny for Codex, Claude Code's questions with single and several picks one question at a time with a counter, Answer in the tool on every card, and a closed or slow app that never blocks the tool. Steps: one press to answer (the same as Coucou and HeyClicky); a question with several picks is picks plus Send. Speed: the card shows as soon as the hook hands over its request (a file in Squibby's own folder, the same path the guard has used since M77), and a press is written back at once.

**Where we are better.**
- Always shows the exact rule before the press and writes only that one allow rule, to the project's own local settings; Coucou hands back every suggestion Claude Code made, unseen (which can include a mode change or a new folder).
- A card answered in the terminal goes within a second (the hook's process is watched); Coucou waits for the session's next event.
- A Squibby that quits mid wait lets the tool go at once; Coucou's relay holds its socket until its own timeout.
- Per project, after a yes card that shows the exact lines; Coucou writes the person's user wide settings.
- Stop everything hands every question back to its tool, never a deny.
- Nothing kept: the request is removed as it is read and its words live in memory only while the card shows.
- Every card and choice has a VoiceOver name, a press waits a short moment after the card appears so a resting pointer cannot answer by accident, and the wait is a setting.

**Gaps closed in this milestone.** A long question pushing Answer in the tool out of the notch (moved to the card's corner), the dot drifting beside a long title, rows stopping short of the card's edge, a "2 minutes" choice that was really 110 seconds (now 120, with the hook waiting 125).

**Gaps left, and where they go.**
- Coucou's "Other..." free text answer to a question: typing needs the keys, which the notch never takes (rule 9). Answer in Claude Code covers it; the small chat could take it later if people ask.
- Coucou's plan card offers Auto mode or Manual (a mode change); left out on purpose: Squibby never changes the tool's permission mode.
- Coucou's Y and N keys on the open card: the notch never takes the keys (rule 9).
- Cursor, the VS Code agent, Antigravity, Gemini CLI and Windsurf: their hooks can ask or block but have no documented answer the person gives from outside; Coucou answers Copilot CLI and Antigravity. With M115's wider tool list.
- Coucou skips Codex's card when Codex's automatic reviewer handles it, by reading Codex's own session file; Squibby never reads a tool's transcript, so this waits on (f).
- The cards show in the notch only, not in the small chat or Home; if the notch is off the tool asks in its own window after the wait.
- The phone (Lock Screen approvals) stays after launch, as the plan says.

## Skills applied (ECC and the UI skills)

- ecc-tdd-workflow: `runner/test/m114-approve.test.ts` and `app/src/m114.test.ts` were written first and run red (the modules did not exist) before any code.
- ecc-verification-loop: every suite, both type checks, the build, clippy and a diff review before reporting (counts below in the report).
- ecc-react-patterns: a question card's steps live in the card's own state, keyed by the ask, so a new ask starts clean; the card list is derived during render, never copied in an effect.
- ecc-react-performance: the asks are filtered during render with the panel's existing clock; no new timer or re-render loop in the notch.
- ecc-frontend-a11y: every card is a named group, each choice says its description, several pick choices carry `aria-pressed`, Answer in the tool has a full name and the notch's own focus ring.
- ecc-motion-foundations and ecc-motion-patterns: a new question fades in with the notch's own row duration (a fade only, so Reduce Motion needs nothing more); nothing animates layout.
- ecc-rust-patterns: the Rust checks use `Option` combinators and borrow the fixture text, no new `unwrap` outside tests.
- break-ui: the worst case shots moved Answer in the tool into the card's corner, top aligned the dot and clamped a long question with its full text kept (Built, above).
