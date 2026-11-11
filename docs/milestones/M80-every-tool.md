# M80: The safety net in every AI tool

Status: asked for by the founder, 11 Nov 2026: make the safety net work with Codex and Cursor, "also with antigravity and vs code even with xcode".

## What the person gets

In Settings, Fixing, under "When your AI tool says it is done", each tool now has two rows, each after its own yes:
- **Done signal:** the review starts the moment the tool finishes, not after the files are quiet.
- **Save a copy before a destructive command:** before the tool runs a reset, a delete of files or a database drop, Squibby saves a copy. The command always runs as the tool decided. Undo in History puts the files back.

| Tool | File in the project | Events |
|---|---|---|
| Claude Code (also the VS Code Claude extension) | `.claude/settings.local.json` | as before (M75, M77, M78) |
| Codex | `.codex/hooks.json` | Stop, PreToolUse on Bash (new) |
| Cursor | `.cursor/hooks.json` | stop, beforeShellExecution |
| VS Code agent (GitHub Copilot) | `.github/hooks/companion.json` | Stop, PreToolUse |
| Antigravity | `.agents/hooks.json` (named `companion-done`, `companion-guard`) | Stop, PreToolUse on run_command |

Xcode 26.3 runs Claude Agent and Codex. Squibby does not write Xcode's own settings. Whether those agents read the project's Claude Code and Codex files is checked on the real Mac before Squibby claims it.

## The rules it keeps

- Nothing is written before the yes; the card shows the exact file and lines. Remove takes out only Squibby's lines, and the files and folders it made once they are empty. Delete everything does the same (donehooks.rs).
- A closed or slow Squibby never blocks any tool. Each hook ends with its tool's own "go on": exit 0 (Claude Code, Codex, VS Code), exit 1 (Cursor, which fails open on it), `{"decision":"allow"}` (Antigravity). Squibby never answers "approve" for the person: their tool's own approvals stay as they are.
- Only the shell command and its folder are read; nothing is kept but a short redacted form in the History row's name.
- The review never counts these hook files as the person's change.

## Tests

- runner/test/m80-every-tool.test.ts: each tool's file and shape, each hook's ending run for real with sh, the request shapes, Remove.
- app/src/m80.test.ts: the rows and cards name the right tool.
- app/src-tauri/src/donehooks.rs: Delete everything takes out only Squibby's lines in the new files and the folders it made.

## [verify] on the real Mac (technical_research.md section 20, item 27)

1. Cursor: a destructive command in Cursor's agent makes a History row; no hook error shows.
2. VS Code agent: the same, with agent hooks on.
3. Antigravity: the same; check the IDE runs hooks at all.
4. Xcode: whether its Claude Agent and Codex fire the project's hooks.
5. Codex: the guard runs after trusting it in /hooks.
