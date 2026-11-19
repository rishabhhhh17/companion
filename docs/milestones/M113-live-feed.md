# M113: The live feed in the notch

Status: the founder said yes on 17 Nov 2026 ("Yes, okay, add that"), for the "match Coucou" part of the plan (M113 to M115), with "we should do exactly what they do" about Coucou's AI coding features. Built 19 Nov 2026. Not committed. Nothing is spent: no model call of any kind, no key, no account, no deploy. Fixtures, the real hook commands run by `sh`, and temporary folders only. Real tools on a real Mac are [verify] items below, with a ready script, and are in the real Mac guide (`docs/milestones/M109-real-mac-guide.md`).

From the plan (`beat-1115/plan.md`, "Added 17 Nov 2026: match Coucou"): match everything Coucou does for AI coding, then keep the checking (explain, prove, catch, undo) that it lacks. Copy features only: never Coucou's name, its character, its sounds or its look. Squibby keeps its approved look (the one from before M112, restored 17 Nov 2026: coloured place tiles, the lavender notch chat with its dotted grid, the blue send and Fix buttons, the lavender notch pills). No colour, theme, icon set or tint changes here.

## What the person gets

While an AI tool works, pointing at the notch shows, under the usual row, a calm list of what that tool is doing right now:

- the file it edited, with how many lines it added and took away (`app.tsx  +12 −3`);
- the command it ran, in a short form with anything secret taken out (`npm test`).

One block per session, newest line on top, several sessions one under the other (Claude Code in `shop`, Codex in `site`). A file edited again moves to the top with its counts added up, so the list stays short. When the tool says it is done, its block says Finished for a minute, then goes. A press on a line opens the review card in Home (the existing diff, with its Undo). The same list shows at the top of the small chat out of the notch. Nothing is kept: the list lives in memory, and History keeps what it already kept.

## How Coucou does the same job (read in its MIT code, `NotchBuddy/Sources/App/HookServer.swift`)

- It installs hooks at the user level (`~/.claude/settings.json`, `~/.codex/hooks.json`, `~/.gemini/settings.json` and others) for every event: SessionStart, PreToolUse, PostToolUse, Stop and more. One script forwards each event to its app.
- PreToolUse becomes a step label ("Runs · npm test", "Edits · app.tsx"); PostToolUse of Claude Code's Edit, MultiEdit and Write becomes a diff with `+N −M` (`buildFileDiff`, a line diff of `old_string` and `new_string`). Codex's `apply_patch` gets a step with the first file name, but no counts.
- Each session has its own steps; Stop shows "finished" for a moment, then the session goes idle.

What we do differently, on purpose:

- **Per project, after a yes.** Squibby adds its lines only to the project's own hook file, only after the card that shows the exact lines (rule 13). Coucou writes the person's user wide settings.
- **Only what the feed needs leaves the tool.** The feed hook copies the tool's note into Squibby's own folder and exits at once; the engine reads only the file's path and counts the lines, then removes the note as it reads it. The text of the edit is never kept, sent to the pages or written to the log.
- **Counts for every tool that edits through a hook**, Codex's `apply_patch` included (Coucou counts only Claude Code's).
- **Tools with no hooks still show something**: in a project with Antigravity or Windsurf connected, the folder watcher (the review's own, M52) names the files that changed, without counts, and says Seen, not Working.

## What to build

1. **A feed hook per tool** (`feed`, `runner/src/donesignal.ts`), added like every other hook: a row in Settings and a part of Connect, after the one yes. Its command copies its input to Squibby's guard folder as `<token>.<pid>.<tool>.feed`, never waits and always exits 0 (the tool's own "go on"); with Squibby closed it exits at once and writes nothing.
   - Claude Code: `PostToolUse` on `Edit|Write|MultiEdit|NotebookEdit` (`.claude/settings.local.json`).
   - Codex: `PostToolUse` on `apply_patch|Edit|Write` (`.codex/hooks.json`) [verify].
   - Cursor: `afterFileEdit` (`.cursor/hooks.json`, with `file_path` and `edits`).
   - The VS Code agent (GitHub Copilot): `PostToolUse` (`.github/hooks/companion.json`; it sees every tool, and only edit tools are read) [verify].
   - Gemini CLI: `AfterTool` on `write_file|replace` (`.gemini/settings.json`, named `companion-feed`).
   - Antigravity and Windsurf: no documented after edit event we trust yet, so the folder watcher covers them ([verify]).
   - A tool connected before M113 still counts as connected; its Settings row offers the live feed (an optional hook, like Codex's waiting signal in M105).
2. **The feed in the engine** (`runner/src/livefeed.ts`): each tool's note becomes edit lines (path from the project down, lines added, lines taken away); each guard request (M77, M80) becomes a run line (the redacted short command, 60 characters). One session per project, tool and the tool's own session id (hashed, never shown). Collapsing, order, a done marker, an idle timeout, Stop everything and a cap on sessions and lines, all with a clock that tests control. Said as `feed.update` at most every 200 ms.
3. **The folder watcher** for tools with no hooks: the review's watcher (`review/batcher.ts`) tells the feed each path it counts (never the engine's own work); the feed shows it only when no hook told it about that project in the last 15 seconds.
4. **The pages**: `feed.update` in the model (cleared by Stop everything), the words in `app/src/notchFeed.ts`, drawn by `app/src/notchFeed.tsx` under the hover row and at the top of the small chat. A setting, `notch.liveFeed` (on), turns it off.
5. **Protocol**: `feed.update` with fixtures for Rust and TypeScript; `feed` in `HOOK_KINDS`; the Rust clean up (`donehooks.rs` `EVENTS`) takes out `PostToolUse`, `afterFileEdit` and `AfterTool` entries that are Squibby's.

## Tests first

- Each tool's note maps to the right lines: Claude Code Edit, MultiEdit, Write and NotebookEdit (and its `structuredPatch` when there), Codex `apply_patch` with several files, Cursor `afterFileEdit`, the VS Code agent, Gemini CLI `write_file` and `replace`; anything else is nothing.
- The line counts (a line diff, not a guess), with the cap for a huge note.
- The redaction: a command with a key in it is said without the key; a path outside the project is only its name.
- The ticker: newest first, a file edited again collapses with its counts added, the same command twice counts twice in one line, at most 4 lines a session, at most 3 sessions, a done session says Finished and goes after a minute, an idle one goes after 3 minutes, a new turn after done starts clean, Stop everything empties it.
- Many sessions: two Claude Code sessions in one project and Codex in another stay apart.
- The hook: its command, run by `sh`, writes the note and exits 0 at once; with Squibby closed it writes nothing; Remove and Delete everything take it out; the guard folder's reader takes `.feed` and removes it as it reads.
- The folder watcher fills in only when no hook spoke.
- The pages: the rows' words, `+N −M` said in words for VoiceOver, the press opens the review card, Reduce Motion, the setting.

## Rules it must hold

Rules 5 and 6 (only the person's own AI tool's hook, after their yes; nothing of the screen or other apps), 9 (the notch never takes the keys; a press only opens Home), 10 (nothing runs git or writes the person's git), 13 (a yes card before any line is written), 15 and 16 (plain words, nothing stored), 17 (tests first), 18 ([verify] below).

## Built

All of "What to build" above, plus what the comparison below found (19 Nov 2026):

- **The feed hook** for Claude Code, Codex, Cursor, the VS Code agent and Gemini CLI (`runner/src/donesignal.ts` `feed`, `FEED_MATCHER`, `feedCommand`, `feedEntryFor`), offered in Connect and as its own row in Settings, Your AI tools, after the card that shows the exact lines. Remove and Delete everything take it out (`app/src-tauri/src/donehooks.rs` `EVENTS` has `PostToolUse`, `afterFileEdit` and `AfterTool`).
- **The guard folder reads `.feed` notes** (`runner/src/guard.ts`): handed to the feed, removed as read, never answered; a note over 4 MB is read only at its start for the tool and the file's name (`feedHead`).
- **The feed** (`runner/src/livefeed.ts`): per tool mapping, a real line diff for the counts, Claude Code's own `structuredPatch` when it is there, Codex `apply_patch` with every file and its counts, the redacted short command for runs, collapsing, order, Finished for a minute, an idle timeout of 3 minutes, Stop everything, at most 3 sessions of 4 lines, at most one update every 200 ms. The review's watcher fills in for tools with no hooks (`review/batcher.ts` `onPath`), only when no hook spoke for that project in 15 seconds.
- **Protocol**: `feed.update` with fixtures for Rust and TypeScript (`protocol/index.ts`, `protocol/fixtures/events.jsonl`); only project relative paths, counts and short commands pass.
- **The pages**: the feed under the hover row (`app/src/islandPanel.tsx`, `app/src/notchFeed.tsx`, `app/src/ui/notch.css`) and at the top of the small chat (`app/src/notchChat.tsx`, `app/src/ui/black.css`); the panel grows to hold it inside the notch's room (`island.rs`). Every row says its meaning in words for VoiceOver, has its full path as its tooltip, rises in with one short move (a fade with Reduce Motion), and shows the notch's own ink ring from the keys. The setting `notch.liveFeed` (on) turns it all off.
- **A press goes where that line's change really is** (found in the comparison, built here): the press carries only its session's key (`{ do: "feed", key }`, checked in `app/src-tauri/src/arrival.rs` and `app/src/home.ts`). Home shows that work's review when it is in; while the tool still works and only an older review is there, it says "Claude Code is still working. The review of these changes shows here when it finishes." instead of showing the old one; a line from another project says which project to open (`notchFeed.ts` `feedPress`).
- **Worst case data** (break-ui): counts grouped by thousands (`+12,345`), drawn and said; the folder gives way entirely before the file's name is cut; a long project name and a long command end in an ellipsis with the whole line as the tooltip.
- **Tests**: `runner/test/m113-live-feed.test.ts` (28), `app/src/m113.test.ts` (18), `app/dom/m113.test.tsx` (9), `app/dom/m113Off.test.tsx` (1), and the Rust tests in `donehooks.rs`, `island.rs` and `arrival.rs`. Changed on purpose: `runner/test/m80-every-tool.test.ts`, `m82-connect.test.ts`, `m77-guard.test.ts` and `m105-which-tool.test.ts` (the feed is one more hook in Connect and Settings), `m90-toolbusy.test.ts` (the done signal and Stop everything also reach the feed), `app/src/m82.test.ts` and `m105.test.ts` (the same), `runner/test/settings-registry.test.ts` (the new setting).
- **Shots** (2x, headless Chromium with a stand in for the app): one, two and three sessions, long words, hover, Reduce Motion, nothing live, the small chat, Settings' feed rows, worst case in the notch and in the chat, the keyboard ring, and Home after a press while the tool works and on another project's line.

## [verify] on a real Mac

Each in a practice folder made by `scripts/m113-capture-hooks.sh <tool>`, then `scripts/m113-capture-hooks.sh check <folder>` (no model is paid for by the script; the tool's own run is the founder's). In the real Mac guide (`docs/milestones/M109-real-mac-guide.md`) and in `docs/research/technical_research.md` section 20, item 53.

- (a) Claude Code hands `PostToolUse` for Edit, Write and MultiEdit with `tool_input` and `tool_response.structuredPatch`. [verify]
- (b) Codex hands its edits to `PostToolUse` as `apply_patch` with the patch in `tool_input.command`, accepts the matcher `apply_patch|Edit|Write`, and is fine with exit 0 and no output. [verify]
- (c) Cursor's `afterFileEdit` has `file_path` and `edits` with `old_string` and `new_string`. [verify]
- (d) The tool names the VS Code agent uses for an edit and a new file (`replace_string_in_file` and `create_file` assumed). [verify]
- (e) Gemini CLI's `AfterTool` matcher `write_file|replace` matches and its input has `file_path`. [verify]
- (f) Antigravity and Windsurf: the folder watcher lists the file, marked seen, within a few seconds. [verify]
- (g) A line shows within about a second of the edit; a press while the tool works says when the review comes, and after it finishes opens that work's review; nothing is left in the guard folder or the log. [verify]

## Compared with the best

Against Coucou (the notch agent watcher, its MIT code read for this job), HeyClicky (the notch companion) and CodeRabbit (clear findings, one click fixes). Copied what works; never their names, characters, sounds or look.

**Where we match.** Coucou's core of this job: each session's edits with `+N −M`, the commands it runs, several sessions at once, Finished for a moment after Stop, all inside the notch's hover. Steps to see it: zero (point at the notch), the same as Coucou and HeyClicky's hover peek. Speed: a line within one update (at most 200 ms after the hook's note lands), like Coucou's socket. Motion: one short rise for a new line, rows already there stay still, a fade with Reduce Motion.

**Where we are better.**
- Counts for every tool that edits through a hook, Codex's `apply_patch` included, and a real line diff (Coucou counts only Claude Code's tools; Codex gets a file name and no counts).
- Antigravity and Windsurf still show (the folder watcher), honestly marked Seen, and only when one is connected, so the person's own saves never pass as a tool's work.
- Nothing of the edit is kept: Coucou holds each diff's text in memory to draw it; we keep only names and counts, remove the note as we read it, and take secrets out of commands.
- Per project and after a yes that shows the exact lines; Coucou writes the person's user wide settings for every event.
- A press leads to a review with Undo (CodeRabbit's "finding, then one click fix" shape), and never to an older review by mistake: while the tool still works, Home says when the review comes; on another project's line it says which project to open.
- Every line is said in words for VoiceOver, has its full path as a tooltip, and shows a ring from the keys; Coucou's step list draws counts in colour only.
- A file edited again collapses into one line with its counts added, so the list stays a glance (Coucou appends a step per edit).

**Gaps closed in this milestone.** The press landing on an older review (now `feedPress`, tested in pages, Home and Rust); huge counts reading as codes (grouped); the file's name cut before its folder (the folder now gives way first); no keyboard ring on a notch line (now the notch's own ink).

**Gaps left, and where they go.**
- Coucou opens the edit's own diff inside the notch at once; we open Home's review, which exists only after the tool finishes or goes quiet. Showing a diff mid work would mean keeping the edit's text, which this milestone chose not to; revisit with the founder if people ask for it.
- Coucou marks a failed tool call (`PostToolUseFailure`) and reads "Tests" apart from "Runs"; a failed command line belongs with M114's hook work (one more hook event, one more yes card).
- Coucou also lists reads and searches; left out on purpose, to keep the list calm (edits and commands only).
- Jumping to the session's terminal or editor window is M115.
- Coucou shows the edit's diff right inside the notch; we show the line under the press and the review in Home once it is in (the first gap above).

## Review fixes (19 Nov 2026)

The M113 review found nine things. Each is fixed, with the test written first where it is logic.

1. **A Finished line no longer says "still working".** `feedPress` has a new outcome, `settling` (state done, no review card yet: the review's settle time). Its words: "Claude Code finished. Its review starts in a moment." (`S.m113.settling`). Test changed on purpose: `feedPress(done, no card)` is now `settling`, not `later`.
2. **A press whose session went never lands on an older review.** Home says "That work has finished. Its review is on Now or in History." (or only the first sentence with reviews off) and never scrolls to whatever review is there (`card.tsx`, `S.m113.gone`; dom test with a scroll spy, checked to fail on the old code).
3. **The folder watcher no longer passes the person's own saves as a tool's work, and never doubles a hooked tool.** `LiveFeed.folder` shows a path only in a project with a hook-less tool connected (`HOOKLESS_TOOLS`: Antigravity, Windsurf, their done or guard line on; asked through `DoneSignals.plan`, kept 5 s so it is not read per path), holds each path `FEED_FOLDER_HOLD_MS` (1.5 s) and drops it if a hook spoke for the project meanwhile. A folder block says Seen, never Working. Tests: nothing shown with no such tool, the race (watcher first, the hook's note 1 s later: one Claude Code block, no Changes block), the hold on its own timer, Stop everything drops what is held, the check is not asked per path. Test changed on purpose: the old folder test now runs with a hook-less tool connected and lets the hold pass.
4. **A feed note never sits in the data folder.** The guard looks the folder over every 2 s while it runs and after each note taken (`HookGuard.rescanFeed`): any `.feed` is read and removed at once, a `.feed.tmp` older than 5 s is removed unread, nothing else is touched. Test: a watcher that never fires, the note is still taken and removed, and an old `.tmp` goes.
5. **Tools connected before M113 get the feed in one press.** In Your AI tools, a connected tool whose feed row is off has a Show edits live button that opens the feed's own yes card (`aiTools.ts feedOffRow`, `aiToolsScreen.tsx`); only its yes sends the add. The setting's help now names that place. Unit and dom tests.
6. **Another project's line has one button.** Home says "These changes are in site." with Open site, which switches the project through the existing `use_project` (the person's tap), then reads the same press again there. Dom test. Test changed on purpose: the old words ("Open site in Squibby to review them") are gone.
7. **A press with nothing to open yet stays in the notch.** For `later` and `settling`, the notch (and the small chat) draws a short line under the block pressed ("The review shows when Claude Code finishes.", `pressLine`, `.lf-said`, role status, gone after 5 s); Home does not open. Dom tests. Tests changed on purpose: the two older press tests now have this work's review waiting, so the press still opens Home. The in-notch diff stays a gap (above).
8. **ECC skills, checked in the diff.** ecc_applied: ecc-tdd-workflow (every logic fix began as a failing test; the "gone" test was run against the old code and failed); ecc-react-patterns (the notch line is local state with its timer cleaned up in an effect; the re-read after Open site is an effect on the project, not a timer); ecc-frontend-a11y (the notch line and the Open site notice are role status; the Show edits live button has a full name, "Show Claude Code's edits live in the notch"; the yes card returns focus to its button); ecc-motion-foundations and ecc-motion-patterns (the notch line fades in with the notch's own row duration, a fade only, so Reduce Motion needs nothing more); ecc-react-performance (the hook-less check is kept 5 s instead of read per path; nothing new re-renders the notch on a timer but the one line); ecc-verification-loop (all suites below). break-ui worst case was shot on the Settings feed row, the Your AI tools row, the notch line and Home's notices with a very long project name.
9. **A long file's name keeps its extension.** `fileParts` splits stem and extension; the stem is cut with an ellipsis, the extension never (`.lf-stem`, `.lf-ext`). Tested with the shot 1d name.
