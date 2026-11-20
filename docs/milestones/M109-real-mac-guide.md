# M109: the real Mac guide

The one place for the checks that only a real Mac, real AI tools and the founder's own accounts can settle. Each milestone's own doc keeps its full [verify] list, and `docs/research/technical_research.md` section 20 keeps the record; this guide is the order to run them in, one step per message, with a ready script where there is one. Run every step in a throwaway practice folder the script makes, never in a real project. No step pays for anything.

How each step is recorded: the tool and its version, the date, PASS or FAIL, and what was seen. Results go in `docs/status/` as a dated RESULTS file, and the matching milestone doc and section 20 item are updated (AGENTS.md rule 18).

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
