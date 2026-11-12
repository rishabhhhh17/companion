# M82: Connect your AI tools, and hand Squibby the job

Status: the founder said "do it", 12 Nov 2026, to week 1 of the plan: make Squibby feel like HeyClicky for AI tools. Vision: the friendly layer between people and every AI. You say what you want; Squibby gets your AI to do it, shows what happened in plain words, proves it worked, and undoes it if it did not.

## Part 1: Connect your AI tools (one tap each)

What the person gets:
- A "Your AI tools" screen, reached from the first run (after Pick a project), from Now (a row while no tool is connected), and from Settings, Fixing (the existing rows stay below it).
- Squibby lists the AI tools it finds on this Mac, and only those: Claude Code, Codex, Cursor, VS Code (with Copilot), Antigravity, Gemini CLI, Windsurf. Each row: the tool's name, a plain line ("Saves a copy before it runs a destructive command, and starts a review when it is done"), and one button: Connect. A connected tool shows Connected and a quiet Disconnect.
- Connect adds both hooks for that tool (the done signal and the saved copy; for Claude Code also the waiting signal) in this project, after the same card as today, shown once for the tool: the file and the exact lines. One yes adds both. Disconnect removes both.
- Tools not found are listed under "Not on this Mac" folded away, so nothing is offered that cannot work.

How Squibby finds them (read only, on opening the screen, never in the background, never reading any file's contents):
- Apps by bundle id through NSWorkspace (the app check that exists in shell_tools.rs): Cursor, VS Code, Antigravity, Windsurf, Codex app if present.
- Command line tools by looking for the program on the usual paths (the person's PATH as the login shell gives it, plus ~/.local/bin, /opt/homebrew/bin, /usr/local/bin, ~/.npm-global/bin): claude, codex, gemini, agy (Antigravity CLI), devin. Only "is there a program with that name", never running it.
- Claude Code also counts as found when the project already has a .claude folder; Codex when .codex is there, and so on for each tool's project folder.
- [verify] the bundle ids of Antigravity and the Codex app on a real Mac; keep them in one list.

## Part 2: Hand Squibby the job

What the person gets:
- In the ask box on Now (typed, or hold to talk), a new choice beside the current ones: "Have my AI do it". The ask box remembers the tool last used for this project.
- Squibby turns the words into a clear prompt with prompt help (the same rewrite the Prompt help feature uses, shown as a diff the person can edit), naming the project's house rules from memory.
- Then, by the tool picked:
  - Claude Code (Squibby's own engine): Squibby runs the job itself through the existing task path (agent.start), with its usual safety, snapshot first, and proof. Nothing new in the engine.
  - Any other tool (Cursor, Codex, VS Code, Antigravity, Gemini CLI, Windsurf): a card "Ready for Cursor" with the prompt, and two buttons: "Put it in Cursor" and "Copy". Put it in Cursor brings that app to the front and pastes the prompt into its chat box through the same paste back Prompt help and Type by voice use (Accessibility, the clipboard put back after, a password box refused). Squibby never presses Return: the person sends it. If the box cannot be found, the prompt is copied and Show me where to paste rings the box.
  - Then the card says "Waiting for Cursor to finish". When the tool's done signal arrives (M80, M81), the review runs at once and the card becomes the usual review: Ready, Check these N things, or Not safe yet, with Fix it, Copy for my AI and Undo. Without a connected done signal, it waits for the files to be quiet as today, and says so.
- Stop everything ends the wait.

Rules kept: nothing is sent or pasted without a tap (rule 13), the light is on whenever Squibby reads the app in front or pastes (rule 5), Accessibility is asked the first time Put it in is used (rule 8), panels never take focus except the deliberate bring to front on Put it in (rule 9), no model is called before the person asks.

## Tests first

- Finding tools: pure function from (installed bundle ids, programs found, project folders) to the list, each tool once, "not on this Mac" for the rest; never reads file contents (pinned).
- Connect adds exactly that tool's hooks, Disconnect removes them, a file that is not plain JSON is refused for both.
- Hand off: the card's states (writing the prompt, ready for a tool, put in, waiting, reviewed), Claude Code goes to agent.start, other tools never send a task to the engine, the paste never presses Return (pinned in the Rust side), a missing box falls back to Copy and Show me where to paste, Stop ends the wait.
- Click through DOM tests for the Your AI tools screen and the hand off card.

## Built (12 Nov 2026)

Part 1, Connect your AI tools: **built.**
- The one list: `protocol/aitools.json` (tools, bundle ids, program names, project folders, program folders), read by the shell (`app/src-tauri/src/aitools.rs`) and the pages (`app/src/aiTools.ts`).
- Finding: `ai_tools_find` (shell_tools.rs), only from Home, only when the screen opens. Installed apps through `editor_installed` (NSWorkspace), program files by name (metadata only: a file with an execute bit) in the app's PATH and the list's folders, and the project's tool folders. Pinned: no program is run and no file is read.
- The screen: `app/src/aiToolsScreen.tsx`, in Settings, Fixing (Your AI tools, above the rows of each hook), in the first run (a fold after Pick a project), and on Now (one row while no tool is connected, setting `aiTools.nowRow`).
- Connect: one card with every file and line still to add; its one yes sends the existing `donesignal.add` per hook in order (Claude Code: done, guard, waiting; the others: done, guard). Nothing is written before the yes. Disconnect sends one `donesignal.remove` per hook that is on. A file that is not plain JSON offers neither, and says why. No protocol change.

Part 2, Hand Squibby the job: **built.**
- Have my AI do it, in the ask box. The card's states are one pure reducer (`app/src/handoff.ts`): writing the prompt, ready for a tool, put in, waiting for the tool, reviewed, stopped.
- The clear prompt is Prompt help's own rewrite (`assist.prompt`), sent by the shell (`handoff_prompt`) for the project open in Home only, so its house rules come along and a page never names a folder (the rule in runner.rs that a page never sends `assist.prompt` stands). It is shown with what changed and can be edited. Without it (Prompt help off, Claude out of reach, setting `handoff.improve` off) the person's own words are used, and the card says so.
- Claude Code: Run it, through the usual task (`agent.start`). Any other tool never sends the engine a task (tested over every press).
- Put it in <tool> (`handoff_put_in`): the light first, Accessibility asked the first time, the tool's app brought to the front, the keyboard given to the box the app labels as its chat box (`ax::focus_box`), then Type by voice's paste (`dictate::insert_at_cursor`: clipboard saved and put back, password box refused). Never Return (pinned in aitools.rs). A guessed box is never typed into. Anything else copies the prompt, says why, and offers Show me where to paste. Copy is always there; a tool with no app on this Mac offers Copy only.
- Waiting: says whether the review starts at the done signal or after the quiet time. A review batch for the project ends it (the usual review card takes over). Stop everything ends it (page: `app.stop_everything`; shell: the Stop count is checked before the tool is brought forward and right before the paste).

Not built, on purpose: the person's login shell PATH (it would mean running their shell); the hand off card also asks the shell which tools are on the Mac as it opens (on the press, never in the background), so Put it in is offered only for an app that is there.

[verify] on a real Mac (also in technical_research.md section 20, item 28):
- [verify] the bundle ids of Antigravity and the Codex app.
- [verify] the usual program folders find claude, codex, gemini, agy and devin as people install them.
- [verify] `.agent` is Antigravity's project folder, and `.vscode` a fair sign of VS Code.
- [verify] setting AXFocused gives the chat box the keyboard in Cursor, VS Code, Windsurf, Antigravity and the Codex app.
- [verify] each app's chat box carries the words pastehere.rs looks for (only a confirmed box is typed into).
