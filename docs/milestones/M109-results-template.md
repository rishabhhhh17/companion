# M109 results: <tool>, <date>

The RESULTS template for one tool's guided session (`docs/milestones/M109-real-mac-guide.md`). `sh scripts/m109-session.sh results <data folder>` writes a filled copy into `docs/status/` from the recorded answers, so this file is only for reading. Made by `runner/src/realmac.ts` `template()`; a test keeps the two the same.

The seven tools: Claude Code, Codex, Cursor, VS Code agent (Copilot), Gemini CLI, Windsurf, Antigravity.

Tool: <tool>, version <version>
Date: <date>
Where: a throwaway practice folder made by `scripts/m109-session.sh`, never a real project. No step paid for anything.
Verdict: Proven, Failed or Not finished. Only a tool whose core steps all passed is claimed. For a tool that fails, the review starts once the folder is quiet.

| Step | What was checked | Which tools | Result | What was seen |
|---|---|---|---|---|
| version | The tool and its version | all seven | PASS, FAIL, SKIP or not run | |
| watch | Squibby's practice guard is running | all seven | PASS, FAIL, SKIP or not run | |
| open | The tool opens the practice folder with Squibby's lines | all seven | PASS, FAIL, SKIP or not run | |
| mcp | Claude Code's /mcp lists no MCP servers (no claude.ai connectors loaded) | Claude Code | PASS, FAIL, SKIP or not run | |
| hooks | Claude Code's /hooks lists only Squibby's done and guard lines | Claude Code | PASS, FAIL, SKIP or not run | |
| done | The done hook touched its marker, named for this tool (M105) | all seven | PASS, FAIL, SKIP or not run | |
| guard | The guard made a saved copy and still let the command run | all seven | PASS, FAIL, SKIP or not run | |
| live | A live key: the tool asked first where it can, or ran as documented | all seven | PASS, FAIL, SKIP or not run | |
| logins | Saved logins (M103): asked first where the tool can, noted where it cannot | all seven | PASS, FAIL, SKIP or not run | |
| block | The practice guard started again with Block | Codex, Gemini CLI, Windsurf | PASS, FAIL, SKIP or not run | |
| blocked | With Block, the read of saved logins was stopped | Codex, Gemini CLI, Windsurf | PASS, FAIL, SKIP or not run | |
| start | House rules at session start (M108) (extra) | Codex, Gemini CLI, Antigravity | PASS, FAIL, SKIP or not run | |
| putin | Put it in on the review card (M107) (extra) | Cursor, VS Code agent (Copilot), Windsurf, Antigravity | PASS, FAIL, SKIP or not run | |
