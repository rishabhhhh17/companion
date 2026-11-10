# M78: memory that is never lost

Status: plan written 10 Nov 2026 on m48/launch (HEAD 24316dd), then built in the same change. Not committed. The build status of each part is at the end, with what still needs a real Mac.

Sources: `docs/research/2026-11-08-memory-for-ai-tools.md` (sections 3 to 5: plain files stay the truth, a start block of about 30 lines, search on demand with SQLite FTS5, a failed approaches list, a stable block for caching, no token claims before the lab test, "never lost" only after export and restore); `docs/plan/2026-11-08-the-plan.md` (section 4, step 3); M75 and M77 (how a Claude Code hook is added after a yes and removed).

## Rules this milestone keeps

- Rule 15: every line keeps its source and can be forgotten. The profile learns only from explicit signals. Nothing about health, money, relationships, moods or secrets: every line, from every source, restored lines too, goes through `filter.ts`.
- Rules 5 and 6: nothing new is read in the background. The start block and the search read only Squibby's own notes files and the house rules file, never the person's code, transcript or other tools' memory.
- F30, M75, M77: a hook in Claude Code's settings only after the person's yes on the card that shows exactly what is written where, removable with one press, and taken out by Delete everything and by leaving a project.
- Plain files stay the source of truth. The search index is a copy that is rebuilt from the files and can be deleted at any time. No vector database, no cloud, no new dependency (Bun's own `bun:sqlite`, macOS's own `/usr/bin/sqlite3`).
- No word about saving tokens anywhere. That waits for the lab test (plan step 4).
- Strings only in `strings.ts`, the M71 look and parts, plain words, no em dashes. New settings in the four registry files. Protocol changes with fixtures both sides read. Tests first, temporary folders, no real model.

## The Claude Code SessionStart contract (checked 10 Nov 2026, https://code.claude.com/docs/en/hooks)

- `hooks.SessionStart` in `.claude/settings.local.json`, matcher on `source`: `startup`, `resume`, `clear`, `compact`, `fork`. Only `command` and `mcp_tool` hooks.
- Exit 0: "Claude Code adds plain-text stdout as context that Claude can see and act on", "at the start of the conversation, before the first prompt". JSON with `hookSpecificOutput.additionalContext` is the other way; plain text is enough.
- Stdout is capped at 10,000 characters; over that it is saved to a file and only a preview is shown. The block is kept under 6,000.
- Exit 2 shows stderr to the person only; the session goes on. A hook that fails never stops a session.
- Squibby's entry: `{ "matcher": "startup|clear|compact", "hooks": [ { "type": "command", "command": "s='<data>/start'; f=\"$s/<token>.md\"; [ -f \"$f\" ] && /bin/cat -- \"$f\" 2>/dev/null; exit 0", "timeout": 5 } ] }`. It prints a file Squibby wrote earlier, so it works while Squibby is closed, and it reads nothing else.
- `resume` is left out on purpose: a resumed conversation already holds the block, and printing it again would change the start of the conversation. [verify] that a resumed session keeps the block it started with.
- [verify] a hook added while a session is open is picked up only from the next session ("normally picked up automatically by the file watcher" is said of hooks in general).
- [verify] the VS Code Claude extension runs the same project hooks.

## 1. A small local search index

- `runner/src/memory/index.ts` (new, tested first): `NotesIndex` over `bun:sqlite` with an FTS5 table (`porter unicode61`), one file per project in Squibby's data folder (`notes/<token>.db`). `rebuild(project)` reads the notes files and the house rules and writes the whole index again inside one transaction; `search(query, limit)` returns lines with their source and kind, best first (bm25). The query is cut to plain words first, so nothing in it is read as FTS syntax. Deleting the file loses nothing.
- Rebuilt whenever Squibby writes the start block (below).

## 2. The start block for each Claude Code session

- `runner/src/memory/startblock.ts` (new, tested first): `pickNotes` ranks what Claude cannot see in the code: house rules (rules.txt and "Never touch" lines), decisions with their reason ("Decided: ..., because ..."), tried and failed lines (newest first), then the person's own lines (said in Squibby or written by hand) and approved goals. Lines learned from the project's files (package.json, README, deploy files) are left out of the block: Claude can read those itself. They stay in search.
- `startBlock` builds the block: at most 30 lines in all (headings and the search line count), under 6,000 characters, in a fixed order, so the same notes give the same bytes.
- The file `<data>/start/<token>.md` is written when the hook is added, when a project note changes, when a task starts and when the Memory page opens; Claude Code reads it once as a session starts and the block never changes inside that session, so prompt caching keeps working.
- Lines the shared AGENTS.md block already gives Claude Code (when CLAUDE.md imports it) are left out of the start block, so nothing is said twice.
- The hook is a fourth kind, `start`, in `donesignal.ts` (Claude Code only), with the same card, the same Settings group ("Start reviews sooner" on Fixing), the same Remove, and Delete everything and leaving a project take it out (`donehooks.rs` knows `SessionStart` and the start folder's opening).
- The shared AGENTS.md block is capped the same way: the same pick, at most 30 lines, and a last line that says where the rest is (`.companion/project.md`). Facts learned from the code files are no longer copied into AGENTS.md.

## 3. Tried and failed

- When the loop breaker stops a task, or a fix ends not proven, the project gets one line: `Tried and failed: <the ask, short>. The checks still failed on <check>: <first line of the failure>`, source "a fix that was not proven" with the date. Redacted, through the filter, shown in the saved toast with Undo, forgettable. Never for an off the record task, never while learning is paused. Setting `memory.triedAndFailed` (On).

## 4. Search on demand

Choice: a command line, not an MCP server. Why: Squibby's own sessions run with no MCP and strict MCP config (T records), and an MCP server for the person's Claude Code would need another config file (`.mcp.json`, which Claude Code asks about and which is often committed) and a server process to keep alive. A command needs no config write at all: the start block's last line tells Claude the exact command, Claude runs it with its own Bash tool, and Claude Code asks the person the first time as it does for any command. It works while Squibby is closed.

- The command: `/bin/sh '<data>/notes/search.sh' <token> words...`. The script keeps only letters, digits and spaces of the words, and runs macOS's own `/usr/bin/sqlite3 -readonly` on that project's index. Read only, nothing sent anywhere. Tested for real with `sh` here.
- [verify] Claude Code's Bash permission prompt for the command on a real Mac, and whether Claude uses it when it should.

## 5. Export and restore

- Export: one plain text file with both parts (project and profile) and the house rules, each line with its source and date, in the store's own line form, so it reads back exactly. Saved with one tap: Export notes opens the Mac's own save dialog (`save_notes` in the shell, the same checks as the go live report: a plain text file of Squibby's export, 1 MB at most, never through a link).
- Restore: Restore from a file opens the Mac's own open dialog (`open_notes_file`, a plain file of at most 1 MB, never a link), the page shows how many lines it holds and asks first, then `memory.restore` (with `confirm: true`) adds each line that is not there yet through the same filter. Lines the person forgot stay forgotten, and the answer says how many were left out and why. House rules are added back to `rules.txt` only when each one reads as a rule. Nothing is removed by a restore.
- Delete everything still deletes everything: the index and start files are in Squibby's data folder, which goes; the hook goes with the others.

## 6. The Memory page shows the start block

- A new part at the top of the Memory page: "What Claude Code is told at the start", the block exactly as it is printed, line by line with each line's source and Forget (house rules link to Settings, where they are changed). When the hook is not set up, the same part says so and offers Set up in Settings.
- Only once 1 to 5 hold: the page and the export row say "Your notes are never lost: export them any time."

## Protocol

- `HOOK_KINDS` gains `start`. Command `memory.restore { project, text, confirm: true }`. Event `memory.restored { project, added, skipped, forgotten, refused }`. `memory.state` gains `start { text, lines, hook }`. Fixtures in `protocol/fixtures`, read by the runner's suite and the shell's.

## Settings

- `memory.triedAndFailed` (On, memory, runner): keep a line when a fix ends not proven.

## Tests first

- `runner/test/m78-index.test.ts`, `runner/test/m78-startblock.test.ts`, `runner/test/m78-backup.test.ts`, `runner/test/m78-tried.test.ts`, `app/src/m78.test.ts`, `donehooks.rs` (the start entry goes too).

## Checks on a real Mac (the founder's hands, one per message)

1. Set up the start block in a test project. Start a new Claude Code session there and ask "what house rules do you have?". It names them. [verify]
2. Ask Claude "what did we decide about payments?" with a decision saved. It runs Squibby's search command after Claude Code's own question. [verify]
3. Export notes, Delete everything, set up again, Restore from the file: the lines are back with their sources.

## Status, 10 Nov 2026 (built, not committed)

All six parts are built end to end with tests, temporary fixture folders and the stand in model. No real model ran, nothing was spent, and Claude Code itself was not run. The hook command and the search command were run for real with `sh` (and macOS's own `/usr/bin/sqlite3`) in the tests. Nothing anywhere says the notes save tokens.

**1. Search index: built.** `runner/src/memory/notesindex.ts` (FTS5 through `bun:sqlite`, one file per project token in `<data>/notes/`, rebuilt in full into a new file renamed over the old one, 0600). Profile lines are never indexed. Tests: `runner/test/m78-index.test.ts`.

**2. Start block: built.** `runner/src/memory/startblock.ts` (the ranked pick, at most 30 lines and 6,000 characters, fixed order, lines from the code left out, lines AGENTS.md already gives Claude Code left out), `runner/src/memory/sessionstart.ts` (the file `<data>/start/<token>.md` and the index, written only while the hook is set up, removed with it, swept at the engine's start), the `start` hook kind in `donesignal.ts`, the same card and Remove in the "Start reviews sooner" group, `donehooks.rs` (Delete everything and leaving a project take the `SessionStart` entry out). The shared AGENTS.md block now uses the same pick and is capped at 30 lines with a last line pointing at `.companion/project.md`; lines from the code are kept there last, so other tools still get them. Tests: `m78-startblock.test.ts`, `m78-index.test.ts`, `donehooks.rs`, `m77-guard.test.ts` (the Settings rows now end with the start row).
- [verify] Claude Code runs the project's SessionStart hook in the shape written and puts the plain stdout into Claude's context.
- [verify] a resumed session keeps the block it started with (`resume` is not in the matcher), and a hook added during a session counts only from the next one.
- [verify] the VS Code Claude extension runs the same project hook.

**3. Tried and failed: built.** `triedLine` in `startblock.ts`, `AgentRunner.rememberTried` after the receipt (the loop breaker or a fix not proven; never off the record, a practice, after Stop, while paused, or with `memory.triedAndFailed` off). It goes into AGENTS.md only where Squibby's block is already there. Tests: `runner/test/m78-tried.test.ts`.

**4. Search on demand: built, as a command line.** `<data>/notes/search.sh <token> words`, named on the start block's last line. Tested for real: it finds by meaning of the words (porter stemming), is read only, and quotes, semicolons and sqlite dot commands in the words do nothing. No config write was needed.
- [verify] Claude Code's permission prompt for the command, and whether Claude reaches for it on its own.

**5. Export and restore: built.** `runner/src/memory/backup.ts` (the export in the store's own line form, profile and house rules included; restore filters every line again, skips what is there, keeps forgotten lines forgotten, removes nothing, adds rules only when they read as rules), `memory.restore` and `memory.restored` with fixtures, `save_notes` and `open_notes_file` in the shell (`notesfile.rs`: the save and open dialogs, only an export, 1 MB at most, never a link), the Export notes and Restore from a file rows on the Memory page (a restore asks first, saying how many lines the file holds). The old "Show everything as text" box is gone. Delete everything still removes the data folder with the index and start files. Tests: `runner/test/m78-backup.test.ts`, `notesfile.rs`, `app/src/m78.test.ts`.
- [verify] the save and open dialogs on a real Mac (they open on the press, a cancel writes and reads nothing, the plain text filter lets a .txt export be chosen).

**6. The start block on the Memory page: built.** `app/src/memoryStart.ts` and `memoryStart.tsx`: "What Claude Code is told at the start", line by line with source and Forget (with the usual short Undo), house rules with Change (to Settings), Set up in Settings when the hook is off, and the block exactly as printed behind "Show it exactly as Claude sees it". The words "Your notes are never lost: export them any time." are on the Export row only.

Not built: an MCP server for search (a command needs no config and works while Squibby is closed); Codex and Cursor start hooks (their contracts were not checked); a token measurement (the lab test, plan step 4). Squibby's own tasks still get the profile and project notes by word count as before (`memory.recallLength`); moving them to the start block waits for the lab test too.
