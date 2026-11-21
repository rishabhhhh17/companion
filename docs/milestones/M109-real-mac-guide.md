# M109: the real Mac guide

The one place for the checks that only a real Mac, real AI tools and the founder's own accounts can settle. Each milestone's own doc keeps its full [verify] list, and `docs/research/technical_research.md` section 20 keeps the record; this guide is the order to run them in, one step per message, with a ready script where there is one. Run every step in a throwaway practice folder the script makes, never in a real project. No step pays for anything.

How each step is recorded: the tool and its version, the date, PASS or FAIL, and what was seen. Results go in `docs/status/` as a dated RESULTS file, and the matching milestone doc and section 20 item are updated (AGENTS.md rule 18).

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
