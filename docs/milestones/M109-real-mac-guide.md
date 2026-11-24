# M109: the real Mac guide

The one place for the checks that only a real Mac, real AI tools and the founder's own accounts can settle. Each milestone's own doc keeps its full [verify] list, and `docs/research/technical_research.md` section 20 keeps the record; this guide is the order to run them in, one step per message, with a ready script where there is one. Run every step in a throwaway practice folder the script makes, never in a real project. No step pays for anything.

How each step is recorded: the tool and its version, the date, PASS or FAIL, and what was seen. Results go in `docs/status/` as a dated RESULTS file, and the matching milestone doc and section 20 item are updated (AGENTS.md rule 18).

## M109 plan: prove the safety net in all seven tools on a real Mac

**Founder's yes:** 15 Nov 2026, "Yes, build it all", for the whole M97 to M109 plan as written (`beat-1115/plan.md`, section M109).

**Why.** Squibby names seven tools (Claude Code, Codex, Cursor, the VS Code agent, Gemini CLI, Windsurf, Antigravity) and has proven none of them on a real Mac. The done and guard hooks were tested only with fixtures. This lead is Squibby's whole story, so it must be real (rule 18).

**What the person gets.** Every tool Squibby names has been seen working, and only those are claimed.

**What is built now (no founder needed).**
1. One guided session per tool, one step per message: one thing to do in the tool, at most one line to paste, what you should see, and one yes or no question. The person guiding runs the check after each answer and records it, so the founder never edits a file.
2. A practice folder per tool made with Squibby's own code (`DoneSignals`), with the done and guard lines exactly as Squibby writes them, and a stand in guard that runs Squibby's real `HookGuard` with a real shadow store in a throwaway data folder outside the practice folder (as the app's own data folder is).
3. A result recorder: each answer is kept with the date, the tool's version and what was seen (notes pass through the key redaction), and a RESULTS file in `docs/status/` is written from it, with one machine readable line so a summary of all seven can be made from the files alone.
4. The RESULTS template, made by the same code, so it can never drift from the steps.
5. A summary that lists, per tool, proven, failed or not run, and names only the proven tools as ones that may be claimed.

**What waits for the founder.** The sessions themselves, on his own account in each tool. No tool is claimed as proven by this milestone. As of 24 Nov 2026 no tool has been run on a real Mac by a person yet; the commit titled "Prove the safety net in all seven tools on a real Mac" built the guide and the checks only. The Claude Code session follows the CLAUDE.md test rules: the SDK's bundled binary, explicit `--setting-sources` and `--strict-mcp-config`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, never `bypassPermissions`, and `CLAUDE_CONFIG_DIR` left unset for his real login.

**Not included** (from the plan): changing `review.mode` from "ask" (the founder's product call), and an in app "proven with" list (it would go stale with every tool update). Changing the app's words for a tool that fails waits for the results: the fallback is that the review starts once the folder is quiet.

**Rules it must hold.** The CLAUDE.md test rules and rule 18. Never read credential files: the login step reads a practice `.env` the script wrote, holding no real key. No model is called by any script, nothing is sent anywhere, git is never run in a project (the shadow store is its own folder), and every folder is a throwaway one.

### Built (21 Nov 2026)

- `runner/src/realmac.ts`: the seven tools, each tool's steps (`stepsFor`), the recorder (`record`, `nextStep`), the verdict, the check (`gather`, `judge`), the practice guard (`practiceGuard`), the RESULTS file (`resultsMarkdown`, `parseResult`), the summary and the template.
- `runner/scripts/m109-session.ts` and `scripts/m109-session.sh`: setup, watch, next, check, record, results, summary, template.
- `docs/milestones/M109-results-template.md`: the RESULTS template, made by `template()`; a test keeps them the same.
- Tests: `runner/test/m109-real-mac.test.ts` (43 tests). The real done and guard commands Squibby writes are run with `sh` against the practice guard for all seven tools, each fed its own documented hook input (Claude Code and Codex `Bash`, Claude Code `Read`, Cursor `beforeShellExecution`, the VS Code agent `run_in_terminal` and `read_file`, Gemini CLI `run_shell_command` and `read_file`, Windsurf `exec`, Antigravity `run_command` and `view_file`), with the saved logins input taken from the step's own words, and the test checks each input gets past the tool's own matcher. Each gives a PASS from the check for watch, done, guard, live, logins and, for Codex, Gemini CLI and Windsurf, blocked.
- Review fixes (22 Nov 2026): the saved logins steps ask Cursor, Windsurf and Codex to "Run this command exactly: cat .env", because their guards see only the shell (Cursor's `beforeReadFile` is not used, Windsurf's matcher is `exec`, Codex's is `Bash`); the others keep "Show me what is in .env", which their read tool matchers see. The login words allow for the full path the tool may show. Claude Code has two more core steps after it opens: `/mcp` lists no servers and `/hooks` lists only Squibby's done and guard lines (the CLAUDE.md test rule; `--setting-sources` alone does not stop claude.ai connectors). A RESULTS file whose written verdict does not match its own steps is not believed by the summary. Every row of the events log goes through the same redaction. The script's temporary folders carry no product name (rule 21).
- Skills used (ECC): `ecc-tdd-workflow` (each fix began as a failing test: the seven tool loop failed for Codex, Cursor and Windsurf on the step's own words, the tampered RESULTS file was believed, the Claude Code steps lacked `/mcp` and `/hooks`, the summary and script names failed; the log redaction test passed before the fix too, as upstream already redacts, and now guards against upstream changes) and `ecc-verification-loop` (type check, the whole runner suite, a diff review and a key grep before reporting). `break-ui` does not apply: M109 adds no screens.
- The recorder never rounds up: for a step the check can see (watch, done, guard, live, logins, blocked), a PASS the check does not agree with is refused, and the check's words are kept beside the founder's.

### How to run one tool's session (the person guiding does this; the founder only acts in the tool)

1. `sh scripts/m109-session.sh <claude|codex|cursor|copilot|gemini|windsurf|antigravity>` makes a practice folder (`hello.txt`, a `build` folder, a `.env` holding only `PRACTICE_ONLY=not-a-real-key`) with the tool's done and guard lines, and a data folder outside it. It prints step 1.
2. Send the founder one step per message: what to do, the one line to paste if there is one, what he should see, and the question. `sh scripts/m109-session.sh next <data>` prints it.
3. After his answer, run `sh scripts/m109-session.sh check <data>`, then `record <data> <step> pass|fail|skip <what he saw>`. A PASS the check does not agree with is refused.
4. At the end, `results <data>` writes `docs/status/<date>-m109-<tool>.md`, and `summary` lists all seven with the ones that may be claimed. Update the matching milestone doc and section 20 item 60 (rule 18), then delete both folders.

The steps, per tool: version; start the practice guard (`watch`); open the folder in the tool; the done signal (change `world` to `there`); the safety copy (`rm -rf build`); a live key (`STRIPE_SECRET_KEY=practice-only true`, a command that does nothing); saved logins (show `.env`). Where the tool can ask (Claude Code, Cursor, the VS Code agent, Antigravity) the last two expect the tool to ask first with Squibby's reason; where it cannot (Codex, Gemini CLI, Windsurf) they expect it to run as documented, and two more steps start the practice guard with Block and expect the `.env` read to be stopped. Where the tool's guard sees only its shell (Cursor, Windsurf, Codex) the saved logins steps ask it to run `cat .env`; the others are asked to show what is in `.env`. Claude Code also has `/mcp` (no servers listed) and `/hooks` (only Squibby's two lines) right after it opens. Extras that run in their own sections below: M108 start (Codex, Gemini CLI, Antigravity) and M107 Put it in (Cursor, the VS Code agent, Windsurf, Antigravity). Claude Code runs as the SDK's bundled binary with `--setting-sources project,local --strict-mcp-config`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, on the founder's own login.

### [verify] (section 20 item 60)

1. Each of the seven sessions, on the founder's own account: the done marker, the saved copy with the command still running, the live key ask or run as documented, the saved logins ask, note or block. Record the tool and its version.
2. That the bundled Claude Code takes `--setting-sources project,local` and `--strict-mcp-config` interactively and still reads the practice folder's `.claude/settings.local.json`.
3. That Codex in its default sandbox may write to the data folder outside the practice folder (the app's own data folder is outside every project too). If not, note it: it is the same question for the real app.
4. Claim only the tools whose RESULTS say Proven. For one that fails, the words say plainly that the review starts once the folder is quiet.

### Compared with the best

How the others prove that the tools they name work:
- **CodeRabbit** lists Claude Code, Codex, Cursor, Gemini CLI, Copilot, Antigravity and "35+ agents" for its agent review, and says itself that a finding that disappears "isn't confirmed as fixed" (docs.coderabbit.ai, seen 15 Nov 2026). It shows no per tool proof.
- **Coucou** (MIT) installs its hooks user wide in every tool it finds, in one step. Our notes on it (orchestrators.md, the M112 notes) found no record of which tool was checked on which version; unconfirmed.
- **HeyClicky** watches no tool's changes at all: no review, proof or undo (heyclicky.com, seen 15 Nov 2026).

Where we match: one step per tool to start (the script makes the folder and writes the lines, as Coucou's one step install does). Where we are better: every tool named is backed by a dated RESULTS file with its version and what was seen, the check refuses a PASS it cannot see, and the summary claims only proven tools. Nobody else publishes that. The gap: a session takes the founder about ten minutes per tool (eight to ten steps), where the others claim support with no session at all. That is the price of a true claim and stays. Closed in this milestone: the check runs itself after each answer, so the founder never reads a log or types a result. Left for later: the M115 tools (Copilot CLI, OpenCode, Amp, Cline, Kiro, and the watch tools Zed, JetBrains and Xcode) are not in this check or its summary; they have their own real Mac steps in the M115 section below, and the summary says so. Also left for later: a re-run when a tool updates (the RESULTS file names the version, so a newer version is plainly not yet proven), and an in app "proven with" list, which the plan dropped.

## M108: house rules at session start in Codex, Gemini CLI and Antigravity

Script: `scripts/m108-check-start.sh <codex|gemini|antigravity>` makes a new practice folder with a `hello.txt` and that tool's start line, and a separate throwaway data folder outside it that holds the one decided note with a practice word (PLUM-7) and the start file, all with Squibby's own code. The word is in no file of the practice folder (the script removes the note file it made there once the start file is written, and checks with `grep -r PLUM-7` before you start the tool), so a tool that searches the folder cannot find it. `scripts/m108-check-start.sh show <folder> <data folder>` prints exactly what the hook hands the tool. Record the tool and its version, PASS or FAIL.

1. **Codex**: trust the new line with `/hooks`, start a new session, ask "What is the practice word in your notes? Do not read any file." PASS: it says PLUM-7. Then `/compact` and ask again, then `/clear` and ask again.
2. **Gemini CLI**: say yes when it asks to trust the project's settings, then ask the same. PASS: PLUM-7. Then quit and resume the session (`gemini --resume`) and note whether the notes now show twice.
3. **Antigravity**: open the folder, check Customizations lists `companion-start`, start a new conversation and ask the same. If it does not know the word, change the start file to the string form (`{"injectSteps":[{"systemMessage":"..."}]}`) by hand and try once more; note which form worked.
4. **A small Codex lab** before any claim that Codex keeps the rules: the 11 Nov memory lab's reversed decision task, six runs with the line and six without. Founder's own Codex account.

## M107: Put it in on the review card

No script: Squibby itself does it. Make an empty practice folder with a `hello.txt` (never a real project), open it in Squibby and in the tool, and connect the tool's done signal in Your AI tools. Record the tool and its version, PASS or FAIL.

1. **Cursor, VS Code with Copilot, Windsurf, Antigravity**, one at a time: ask the tool to write `const key = "sk_live_1234567890abcdef"` into `hello.txt`, let it finish, and on the review card press Put it in <tool>. The light shows first; the first time macOS asks for Accessibility (the text is copied then). Then: the tool comes to the front, the fix request is in its chat box, Return was not pressed, and what was on the clipboard before is back.
2. **Antigravity's chat box words**: if step 1 said Squibby could not find the chat box, note the box's placeholder text, so it can be added to `pastehere.rs` `chat_words`.
3. **A terminal tool**: let Claude Code (or Codex CLI) make the change instead. The card shows Copy for my AI and Fix it, never Put it in.
4. **The commit box**: in VS Code (then Cursor), close the chat panel and open Source Control, so its Message box is showing. Press Put it in <tool>. The fix request is copied, never typed into the commit message box, and the card says it could not find the chat box. Press it once more after it worked in step 1: nothing is typed a second time.
5. **Codex app**: with the Codex app open, note its app id (`osascript -e 'id of app "Codex"'`) and its chat box placeholder. Codex gets Put it in only after this.

## M115: every tool we can reach, and Go to

Script: `scripts/m115-check-tools.sh <copilotcli|opencode|amp|cline|kiro>` makes a practice folder with a `hello.txt` and writes that tool's done line (Copilot CLI also its guard) exactly as Squibby does, with a throwaway data folder inside the practice folder. `scripts/m115-check-tools.sh check <folder>` says which tools touched their done marker. `scripts/m115-check-tools.sh where` prints the app and tab Go to would find for the terminal it runs in; `scripts/m115-check-tools.sh go` waits 3 seconds (switch to another app), then runs Go to's own commands. Record the tool and its version, PASS or FAIL.

1. **Copilot CLI**: ask it to change `world` to `there`. check names `copilotcli`. Then open the same folder in VS Code with the Copilot agent and ask again: note whether the VS Code agent also ran Copilot CLI's file (check would name `copilotcli` with no CLI open).
2. **OpenCode, Amp, Cline, Kiro**: one folder each, the same ask. check names the tool once per finished task. Note anything the tool asked before loading the file.
3. **Go to from Terminal and iTerm**: in a second tab run `where` (expect the app and `exact tab: yes`), then `go`, switch to another tab within 3 seconds: the first time the Mac asks about Automation; with yes the tab comes back, with no only the app comes forward. Also `go notab`.
4. **Other terminals and editors**: `where` and `go` in Ghostty, Warp, kitty or WezTerm (the app comes forward) and in VS Code's and Cursor's own terminal (that window comes forward).
5. **In Squibby itself**: connect Claude Code on a practice folder, ask for a command so a permission card shows: it says Answer in iTerm (or your terminal); one press hands it back and that tab comes forward. While it edits, the live feed's block says Go to iTerm.
6. **Watch tools**: connect Zed (or Xcode) for the practice folder, edit in it: the notch's live feed lists the files as seen in the folder, credited to Zed.

## M114: approve and answer from the notch

Script: `scripts/m114-capture-asks.sh <claude|codex> <mode>` makes a practice folder with a `hello.txt` and writes one capture hook (PermissionRequest, and for Claude Code also AskUserQuestion) into that folder's own hook file. The mode stands in for a press: `watch` prints nothing (the tool asks as usual), `allow`, `deny`, `always` (Claude Code's first suggested allow rule) or `answer` (the first choice of each question). `scripts/m114-capture-asks.sh check <folder>` prints, for each request, its keys and what the notch's card would show. Record the tool and its version, the mode, PASS or FAIL.

1. **Claude Code, watch**: ask it to run `echo hi > hi.txt`. Its own prompt shows; check prints a card "wants to run a command" with the command and an Always rule. Note whether the prompt showed while the hook was still running.
2. **Claude Code, allow, deny, always**: one folder each. allow: the command runs with no prompt. deny: Claude is told no and says so. always: it runs and `.claude/settings.local.json` gains exactly that rule, nothing else.
3. **Claude Code, answer**: ask "ask me which colour to use with your question tool". It goes on with the first choice. Try a question with several picks too and note how the answer reads.
4. **Claude Code, plan**: in plan mode, ask for a small plan; with allow it starts.
5. **Codex, watch then allow and deny**: trust the hook with `/hooks`, approvals on request. Note the input's keys, and whether allow and deny are honoured. Also once with the automatic reviewer on: does the hook hold Codex up?
6. **In Squibby itself**, on the practice folder: turn on the notch answer rows (Fixing, Your AI tools), ask for a command. The notch opens with the card within about a second; Allow, Don't allow, Always allow and Answer in Claude Code each work; answering in the terminal takes the card away within a second; with the wait at 30 seconds and no press, Claude Code asks itself; Stop everything hands it back at once.
7. **Nothing kept**: the guard folder holds no `.perm` or `.question` file afterwards, and the event log holds no line about the asks.

## M113: the live feed in the notch

Script: `scripts/m113-capture-hooks.sh <tool>` (claude, codex, cursor, copilot or gemini) makes a practice folder with a `hello.txt`, writes one capture hook into that folder's own hook file, and says what to ask the tool. `scripts/m113-capture-hooks.sh check <folder>` then prints, for each note the tool handed over, its event, tool name and keys, and what the notch would show (never the edit's text). PASS means at least one edit line would show with the right file and counts.

1. **Claude Code** (`claude`): ask it to change `world` to `there` in `hello.txt` and to add `notes.md`. Expect `hello.txt +1 −1` and `notes.md +N`. Also check `tool_response.structuredPatch` is in the keys.
2. **Codex** (`codex`): trust the hook with `/hooks`, ask the same. Expect `tool apply_patch` and the two files. If nothing is captured, change the matcher to `"*"` and record which tool name Codex uses.
3. **Cursor** (`cursor`): ask the Agent the same. Expect event `afterFileEdit` with `file_path` and `edits`.
4. **The VS Code agent** (`copilot`): ask the Copilot agent the same. Record the tool names it uses for an edit and a new file (expected `replace_string_in_file` and `create_file`, or others to add).
5. **Gemini CLI** (`gemini`): ask the same. Expect `write_file` or `replace`.
6. **Antigravity and Windsurf**: no feed hook. With Squibby open on the practice folder, ask for the same edit and check the notch lists `hello.txt` marked "seen" within a few seconds (the folder watcher).
7. **In Squibby itself**, on the practice folder: Connect the tool (or Set up its live feed row), ask for an edit, point at the notch. The line shows within about a second of the edit; a press while the tool still works opens Home with "still working, the review shows here when it finishes"; a press after it finishes opens that work's review with Undo; Stop everything empties it; after the tool says it is done, the block says Finished and goes about a minute later.
8. **Nothing kept**: after step 7, Squibby's guard folder (`~/Library/Application Support/Companion/runner/guard`) holds no `.feed` file, and the event log holds no feed line.
