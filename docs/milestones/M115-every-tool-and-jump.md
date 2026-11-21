# M115: Every tool we can reach, and jump to its terminal

Status: the founder said yes on 17 Nov 2026 ("Yes, okay, add that"), for the "match Coucou" part of the plan (M113 to M115). Plan written 20 Nov 2026, before any code. Not committed. Nothing is spent: no model call of any kind, no key, no account, no deploy. Fixtures, the real hook commands run by `sh`, and temporary folders only. Real tools on a real Mac are [verify] items below, with a ready script, and are in the real Mac guide (`docs/milestones/M109-real-mac-guide.md`).

From the plan (`beat-1115/plan.md`, "M115: Every tool we can reach, and jump to its terminal"): add Copilot CLI, OpenCode, Amp, Claude Desktop, Cline, Zed, Kiro, JetBrains (Junie and the AI Assistant) and Xcode's agents, each with the done signal and the saved copy where the tool has hooks, and folder watching where it does not. An open, documented hook tag so any tool can plug in. Jump to the exact terminal or editor window of the session that needs you. The connected tools list in Settings shows each tool and what it supports, in plain words. Each tool's real behaviour is a [verify] item for M109's real Mac session. Browser builders (Lovable, Bolt, Replit, v0) stay out: their files are not on the Mac. Copy features only: never Coucou's name, its character, its sounds or its look. The approved look stays (the one from before M112): no colour, theme, icon set or tint changes; new parts reuse existing tokens and buttons.

## What the person gets

- **Your AI tools lists every tool Squibby can reach**, each with one plain line of what it does with it: "Starts a review when it is done and saves a copy before a destructive command", "Starts a review when it is done", "Shows its changes live; it has no hooks to tell Squibby more", or "Runs Claude Code: connecting Claude Code here covers it too". Connect and Disconnect work the same for each, after the one card that shows every file and line.
- **New tools.** Copilot CLI (done signal and saved copy, through its own hook file), OpenCode, Amp, Cline and Kiro (done signal, through a small file of Squibby's own in the tool's own folder), Zed, Junie, the JetBrains AI Assistant and Xcode (their changes show live from the folder; nothing is written in the project). Claude Desktop runs Claude Code, so Claude Code's connection covers it.
- **Any other tool.** One line any tool can run when it finishes (`touch` of an empty file in Squibby's own folder), shown with a Copy button in Your AI tools and written up in `docs/any-tool-hook.md`. A review starts the moment it runs.
- **Go to the session.** A card in the notch (a permission request or a question) and a working session in the live feed (and, from M105 on 21 Nov 2026, a finished one) get a "Go to iTerm" (or Terminal, Visual Studio Code, Cursor, Claude, and so on) button. One press brings that app to the front, and for Terminal and iTerm the exact tab of that session. It is the app the session really runs in, found from the tool's own process, never guessed.

## How Coucou does the same job (read in its MIT code: `docs/AGENTS.md`, `docs/INTEGRATIONS.md`, `ClaudeHost.swift`, `TerminalTarget.swift`, `HookServer.swift`)

- One user wide relay (`nb-hook --agent <name> <Event>`) that every tool's hook calls; the app keeps a pill per agent. Copilot CLI hooks in `~/.copilot/hooks/coucou.json` (camelCase events, `bash` entries); OpenCode a JS plugin in `~/.config/opencode/plugins/`; Amp a TypeScript plugin in `~/.config/amp/plugins/`; Gemini CLI and Antigravity user wide settings; Claude Desktop sessions told apart by `CLAUDE_CODE_ENTRYPOINT=claude-desktop`.
- Any tool can plug in by calling the relay with `--agent <name>` (a documented tag, `^[a-z0-9-]{1,24}$`).
- "Open terminal" brings the session's app to the front from the hook's `__CFBundleIdentifier` or `TERM_PROGRAM`, else the first known terminal that runs. It opens the app, not the tab.

What we do differently, on purpose:

- **Per project, after a yes that shows the exact lines** (rule 13), like every other hook of ours. Coucou writes the person's user wide settings for every tool.
- **The exact tab**, not only the app: Squibby reads the session's terminal (its tty) and its app from the tool's own process, at the moment its hook runs, and asks Terminal or iTerm to select that tab. The first press asks the Mac's Automation question (rule 8: asked on first use); a setting turns tab finding off, and then only the app comes to the front and nothing is asked.
- **Nothing the tool says is read** to find the session: only process ids, the terminal's name and the app's path (`/bin/ps`), never the hook's input, never an environment variable of the person's.
- **A tool with no hooks still shows its work**: the folder watcher fills the live feed for Zed, Junie, the AI Assistant and Xcode once the person turns it on for the project, with nothing written there.

## What to build

1. **The tools** (`runner/src/donesignal.ts`, one list everywhere: `protocol/aitools.json`, `protocol/index.ts`, `app/src/doneSignal.ts`, Rust `donehooks.rs` and `aitools.rs`):
   - `copilotcli`: `.github/hooks/companion-cli.json` (version 1, camelCase events, `bash` entries with `timeoutSec`): done on `agentStop`, the guard on `preToolUse` (it can block a read of saved logins when the person chose Block; it cannot ask).
   - Own files, written whole and removed whole, only when they are Squibby's (their first line says so and they name Squibby's done folder): `opencode` `.opencode/plugins/companion.js` (on `session.idle`), `amp` `.amp/plugins/companion.ts` (on `agent.end`), `cline` `.clinerules/hooks/TaskComplete` (an executable script), `kiro` `.kiro/hooks/companion-done.kiro.hook` (`agentStop`, `runCommand`). Each only touches the tool's marker and reads nothing. A file of the person's own with that name is never touched: the row says so and nothing is written.
   - `watch`, a new kind for `zed`, `junie`, `jetbrains` and `xcode`: nothing is written in the project; Squibby's own index remembers the yes, and the live feed fills in from the folder for that project.
   - `any`: the open tag. No row; `donesignal.anyLine` hands the page the project's one line (`/usr/bin/touch -- '<data>/done/<token>.any'`), and a marker with `.any` starts the review like every other tool's.
   - Claude Desktop is in the list with `via: "claude"`: it shows Claude Code's state and its Connect connects Claude Code.
2. **Where each session runs** (`runner/src/jump.ts`): every guard folder request carries the hook's process id; at the moment it is read (before it is answered), the engine reads the process table once (`/bin/ps -axo pid=,ppid=,tty=,comm=`, no shell, read again at most every 30 seconds per session, run asynchronously so the hook's answer never waits for it), walks up from the hook to the outermost app (`/Applications/iTerm.app`) and keeps that and the session's terminal (`ttys004`) in memory per project and tool. Said as `tool.where` (the app's name and whether its tab can be found) on each read: when it changes, with every ask, and at most every 30 seconds while the tool works. Nothing is kept or replayed, so a page that opens later shows Go to at that session's next hook (within 30 seconds while it works). Nothing is stored.
3. **Go to** (`tool.jump`): only on the person's press, names no folder or app (the engine already knows them). `/usr/bin/open -a <app>` (with the project folder for an editor, so its window for that folder comes forward), then for Terminal or iTerm with a known tab and `notch.jumpTab` on, one `osascript` that selects the tab with that tty. Every step runs asynchronously (15 seconds for `open`, a minute for the script, which waits while the Mac asks its Automation question), so hooks, asks and the feed go on meanwhile. Said as `tool.jumped` (ok, or a plain reason, which the notch shows for 5 seconds as a status line under that tool's feed block, or in the panel when no block shows it). With no session seen yet, a tool that is an app of its own (`OWN_APP_TOOLS` in `protocol/index.ts`: Cursor, VS Code, Windsurf, Antigravity, Kiro, Zed, Xcode) opens on the project by its bundle id, so its feed block offers Go to at once.
4. **Protocol**: `tool.where`, `tool.jumped` events, `tool.jump` and `donesignal.anyLine` commands, `watch` in `HOOK_KINDS`, the new tool ids, fixtures for Rust and TypeScript.
5. **The pages**: Your AI tools shows every tool's line of what it does, Claude Desktop through Claude Code, the watch rows, and Any other tool with Copy. The notch's ask card and the live feed's working block get Go to, with the notch's own quiet button.
6. **A setting**, `notch.jumpTab` (on): Go to finds the exact tab in Terminal and iTerm (the first press asks the Mac's Automation question); off, only the app comes to the front.

## Tests first

- Each new tool's entry shape, add, check, stale and Remove (Copilot CLI beside the VS Code agent's own file; an own file of the person's never touched; a file of ours with a changed token replaced; Cline's script is executable and its folder removed only when Squibby made it).
- The real hook commands run by `sh`: Copilot CLI's guard exits 0 with no output when Squibby is closed; the own files touch the right marker (OpenCode's and Amp's plugins run under Bun with a fake event).
- The watch kind: nothing written in the project, the yes kept in Squibby's index, the feed's folder fill on only then.
- The open tag: the line names the project's token, a `.any` marker starts the review credited to Another tool.
- Where: the process table walk (Terminal, iTerm, VS Code's terminal, Claude Desktop, tmux with no app, a loop in the table, a dead pid), the tty check, the outermost app.
- Go to: the exact commands (argv, no shell) for each case, the AppleScript only with a valid tty and the setting on, never a path from the page.
- The pages: every tool's line, the watch and via rows, Any other tool's Copy, Go to on the card and the feed, VoiceOver names, worst case names.

## Rules it must hold

Rules 5 and 6 (only the person's own AI tools, after their yes; only process ids and names are read to find a session), 8 (the Automation question only on the first press of Go to, and never with the setting off), 9 (Go to moves the person to their tool only on their press; the notch never takes the keys), 10 (no git), 12 and 13 (no tool is blocked or answered by any of this; a yes card before any line is written), 15 and 16 (plain words, nothing stored), 17 (tests first), 18 ([verify] below), 21 (names in strings.ts).

## Built (20 Nov 2026)

All of "What to build" above:

- **The tools** (`runner/src/donesignal.ts`): `DONE_TOOLS` now 17 (the first seven keep their place), `copilotcli` with `agentStop` and `preToolUse` in `.github/hooks/companion-cli.json` (lines under `bash`, read by `lineOf` so add, check and Remove find them), `OWN_FILE_TOOLS` with `ownFileBody`, `OWN_TAG` and `NOT_OURS` (a file of the person's own is never touched, a link never followed, an older token is stale and replaced on the next yes, Cline's script is executable, the folders Squibby made go with it), the `watch` kind (`watchPlan`, `watching`), and the open tag (`anyLine`, marker `<token>.any`). `protocol/aitools.json` lists every tool with its apps, programs and folders, and Claude Desktop with `via: "claude"`. Delete everything (`donehooks.rs`) takes out Copilot CLI's lines and Squibby's own files.
- **Where each session runs** (`runner/src/jump.ts`): `parsePs`, `whereOf` (outermost app, the first real terminal, never round a loop, null for tmux or a dead pid), `SessionWhere` (one `ps` read at most every 30 seconds per session, always on a permission request or a question, said as `tool.where` when it changes and on every ask; in memory, at most 64). The guard tells it about every request's process before answering (`guard.ts` `seen`).
- **Go to** (`jumpPlan`, `tabScript`, `toolBundleOf`): argv lists only, no shell; an app path must be a `.app` with no `..`; a terminal name must be `ttysNNN` before it goes into a script; editors open on the project; an editor tool with no session seen opens its own app; a terminal tool with none says so (`tool.jumped` why `unknown`).
- **Protocol**: `tool.jump` and `donesignal.anyLine` commands (page allowed, project bound, never gated; Go to sits in the core Stop tool beside `toolask.answer`, so no group switch can block it), `tool.where`, `tool.jumped` and `donesignal.anyLine` events, `watch` in `HOOK_KINDS`, fixtures `m115c1` to `m115c5` and `m115e1` to `m115e5` checked by the runner, the pages and Rust (never replayed, never a log line, the app's name only). `protocol/aitools.json` is now copied into the app with the engine (`app/scripts/stage-engine.sh`, caught by the registry test).
- **The pages**: Your AI tools says one plain line per tool (`supportsLine`), lists Claude Desktop through Claude Code with its own Connect, shows a watch tool's card with no lines (Nothing is written in your project), Settings' watch row and Remove words, and Any other tool (asked only when opened, the whole line in code type, Copy). The notch's ask card: Answer in iTerm hands the ask back and sends Go to in one press (`goTo.ts` `inToolButton`). The live feed's working block: Go to iTerm. Both are the notch's own quiet text buttons, with full VoiceOver names and the notch's focus ring; nothing animates beyond the existing hover colour, so Reduce Motion needs nothing more. Done only tools get an honest card note (`connectDoneOnly`).
- **Setting** `notch.jumpTab` (on), in General, Notch.
- **The Automation question**: `Info.plist` has `NSAppleEventsUsageDescription` (what macOS shows the first time Go to picks a tab) and `Entitlements.plist` has `com.apple.security.automation.apple-events`, so the signed, hardened app may send it. Asked only on that first press (rule 8). [verify] in (g) that the question names Squibby and appears only then.
- **Worst case (break-ui)**, shot at 2x: "Visual Studio Code - Insiders" on the card fits in the corner with the long command and rule wrapping beside it; in the feed, "JetBrains AI Assistant" and "Go to Visual Studio Code - Insiders" are both cut with an ellipsis and keep their whole names as tooltips and for VoiceOver; the open tag's long path wraps inside its box; at 420 px every row keeps its button. Fixed from the shots: the folds of Your AI tools now line up with the rows (their bodies sat flush with the card's edge), the Claude Code row no longer said "shows its edits live" twice, and the chat's Go to wraps instead of clipping (an a11y test caught `overflow: hidden` there).
- **Tests**: `runner/test/m115-every-tool.test.ts` (33), `app/src/m115.test.ts` (12), `app/dom/m115.test.tsx` (6), Rust `donehooks.rs` `m115_copilot_cli_lines_and_squibbys_own_files_go_and_the_persons_own_stay` and `runner.rs` `m115_go_to_names_no_app_or_folder_and_where_a_session_runs_is_only_an_apps_name`. Changed on purpose, only the expectations the new tools move: `m80-every-tool.test.ts` (the first seven tools), `m77-guard.test.ts` (the Settings rows list), `m82-connect.test.ts` (a watch tool has no file), `m103-saved-logins.test.ts` (Copilot CLI can block; only tools with a guard run it), `m105-which-tool.test.ts`, `m75-done-signal.test.ts`, `m113-live-feed.test.ts`, `app/src/m80.test.ts` and `app/src/m105.test.ts` (Zed was their example of an unknown tool; now `lovable`), `app/src/m82.test.ts` (the list and Not on this Mac), `aitools.rs` (the list's ids, and its find test now looks only in its own folder, since this Mac really has a `copilot` program in /opt/homebrew/bin), `donehooks.rs` (the runner's text it checks: Copilot CLI's file in `VERSIONED`, and lines read as `c` before they are checked), `runner.rs` m75 (the open tag is a done signal command too), `machine-words.test.ts` and `names.test.ts` stayed as they were and caught words fixed in the code and in a test path ("hooks" in what a person reads), `settings-registry.test.ts` (the new setting). Also `main.rs` `the_info_file_explains_go_to_and_the_entitlements_allow_it`.
- **Shots** (2x, headless Chromium with a stand in for the app): `scratchpad/m115shots/out/` 1a to 1d (Answer in iTerm, no session seen, worst case, keyboard ring), 2a to 2d (Go to in the feed, worst case, hover, Reduce Motion), 3a to 3d (Your AI tools, Any other tool open, Connect Zed, 420 px wide).

## [verify] on a real Mac

Each with `scripts/m115-check-tools.sh` in a practice folder. In the real Mac guide and in `docs/research/technical_research.md` section 20, item 56. Already seen on the founder's Mac, 20 Nov 2026: the process walk from a hook run by Claude Desktop's Code tab finds `/Applications/Claude.app` (the copy of Claude Code inside Claude's data folder is skipped).

- (a) Copilot CLI runs a project `.github/hooks/*.json` file with `agentStop` and `preToolUse` and `bash` lines, and honours `permissionDecision: "deny"`; whether the VS Code agent, which reads the same folder, also runs `companion-cli.json` (it would then credit Copilot CLI for the VS Code agent's work). [verify]
- (b) OpenCode loads a project plugin from `.opencode/plugins` and fires `session.idle` once per finished turn. [verify]
- (c) Amp loads plugins from a project's `.amp/plugins` (Coucou uses only the user wide folder) and fires `agent.end`. [verify]
- (d) Cline runs `.clinerules/hooks/TaskComplete` once hooks are on, and reads `{"cancel":false}`. [verify]
- (e) Kiro lists and runs a hook with `when.type` `agentStop` and `then.type` `runCommand`. [verify]
- (f) The bundle ids of the OpenCode and Kiro apps and the program names of Amp, Cline and Junie. [verify]
- (g) Go to from Terminal and iTerm selects the exact tab after the Automation question; with no, only the app comes forward; Ghostty, Warp, kitty and WezTerm come forward as apps; VS Code, Cursor and Zed bring the project's window forward; a session in tmux gets no Go to. [verify]
- (h) Whether Xcode's agents and Zed's external agents read the project's own Claude Code and Codex hook files (then their sessions get every Claude Code and Codex feature, and Go to names Xcode or Zed). [verify]

## Compared with the best

Against Coucou (the notch agent watcher, its MIT code read for this job: `docs/AGENTS.md`, `docs/INTEGRATIONS.md`, `ClaudeHost.swift`, `TerminalTarget.swift`), HeyClicky (the notch companion: one notch window with a sidebar of every agent's thread) and CodeRabbit (clear findings, one click fixes). Copied what works; never their names, characters, sounds or look.

**Where we match.** Coucou's tool list for AI coding: Claude Code, Codex, Cursor, Gemini CLI, Antigravity, Copilot CLI, OpenCode, Amp and Claude Desktop, plus a documented way for any tool to plug in. Its "Open terminal": one press from the card. Steps: connecting a tool is one Connect and one yes (Coucou: Install hooks per tool in Settings); Go to is one press.

**Where we are better.**
- One press does two jobs: Answer in iTerm hands the question back and brings that tab forward. Coucou's Reply in terminal and its Open terminal are separate.
- The exact tab in Terminal and iTerm, not only the app; Coucou opens the app.
- The real app, read from the session's own process, so Claude Desktop, VS Code's terminal and Cursor's terminal are named right; Coucou guesses from `TERM_PROGRAM` and a list of known terminals.
- Per project, after a yes card that shows the exact lines or file; Coucou writes every tool's user wide settings. A file of the person's own with Squibby's name is never touched.
- More tools: Cline, Kiro, Zed, Junie, the JetBrains AI Assistant and Xcode, which Coucou does not reach; tools with no hooks still show their changes live from the folder, with nothing written.
- Every tool says in one line what Squibby does with it; Coucou's Settings lists hooks by tool name only.
- And on top, as before: every tool's finish starts a review with proof and Undo, which no notch watcher has.

**Gaps closed in this milestone.** The folds of Your AI tools not lining up with the rows, a doubled "edits live" line, the chat's Go to clipping, and `protocol/aitools.json` missing from the engine inside the app.

**Gaps left, and where they go.**
- Coucou's per agent pill name from `--agent <name>`: the open tag credits "Another tool" only. A named tag (`<token>.any-<name>`) can come later if people ask.
- Coucou's approval cards for Copilot CLI and Antigravity: Copilot CLI's guard can only deny, so Squibby does not show Allow there yet; with M114's ask path, after (a).
- Live feed lines and the waiting signal for the new hook tools (OpenCode's `tool.execute.after`, Copilot CLI's `postToolUse`): their changes show from the folder for now; their own edit events after (a) to (c).
- Go to for a session in tmux or over ssh (no app above it): no button; Coucou opens the first terminal it finds, which may be the wrong one.
- HeyClicky's one window with every agent's thread: Squibby's History and the live feed cover what changed; a per session thread view stays out (rule 16, a productivity tool, not a chat app).
- The phone stays after launch, as the plan says.

## Skills applied (ECC and the UI skills)

- ecc-tdd-workflow: `runner/test/m115-every-tool.test.ts` and `app/src/m115.test.ts` were written first and run red (`jump.ts` and `goTo.ts` did not exist) before any code.
- ecc-verification-loop: every suite, both type checks, the build, clippy and a diff review before reporting.
- ecc-react-patterns: Go to's state is derived during render from the model (`whereFor`), never copied into component state; the open tag's line is fetched in its own hook only when its fold opens, with the listener cleaned up.
- ecc-react-performance: no new subscription in the notch; the one timer is the 5 second line of a Go to that did not go (only while it shows). The engine says `tool.where` at most every 30 seconds per session, and the model keeps the same value, so the feed does not change for it.
- ecc-frontend-a11y: Go to and Answer in iTerm are real buttons with full names ("Go to Claude Code in iTerm"); the feed's head moved out of `aria-hidden` so its button can be reached, while the words beside it stay hidden as before.
- ecc-motion-foundations and ecc-motion-patterns: no new motion; the buttons reuse the hover colour transition (`--dur-hover`), never layout, so Reduce Motion needs nothing more.
- ecc-rust-patterns: the Rust removal borrows the text and uses `is_ok_and` and `Option` combinators, no `unwrap` outside tests.
- break-ui and better-interface: worst case names and paths at 2x and at 420 px (Built, above); hallmark's floor where it fits an existing design (tokens only, focus visible, no `transition: all`).

## Review fixes (M115 review)

- A Go to that did not go is now said: `tool.jumped` with `ok: false` shows its plain line (`jumpLine`) as a status line for 5 seconds, under that tool's feed block, or in the notch's panel when no block shows it (Answer in the tool from a card, whose card is gone by then).
- Go to for a tool with no session seen yet is reachable: a feed block of a tool in `OWN_APP_TOOLS` (shared by the engine and the notch) offers "Go to Zed" before any hook was seen, so the `open -b` path runs. A failed open is said like any other.
- Go to never holds the engine up: `open`, `osascript` and the `ps` read run asynchronously (`runArgv`, `readPs`), tested with a slow stand in that a hook's answer never waits for, and for real with `sleep`.
- A watch row (Zed, Junie, the JetBrains AI Assistant, Xcode) says it shows nothing while reviews are Off for the project or Fix is off, on its row and its Connect card, with where to turn it back on (`watchNote`). The runner test pins that no folder change reaches the feed then.
- Your AI tools' intro and Start reviews sooner's paragraph now say what is true for every tool (a line, a small file of Squibby's own, or nothing for a tool with no hooks).
- Claude Desktop's Connect, with Claude Code not found, carries the card's way back (`ai-connect-claude`), so the keyboard returns to it.
- `SessionWhere.list()` is gone (nothing called it); `tool.where` is said again on each fresh read instead.
- The feed's Go to inherits the head's type (no raw sizes of its own) and sits after a middle dot, so "Working · Go to iTerm" reads as a state and a button. The worst case shot 2b is now a Claude Code session in Visual Studio Code - Insiders, a combination that can really happen.

