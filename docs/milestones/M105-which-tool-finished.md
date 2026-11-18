# M105: Which tool finished, and did it work

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 18 Nov 2026. Not committed. Nothing is spent: no model call of any kind, no key, no account. Fixtures, stand in hooks run by `sh`, and temporary folders only.

From "Which tool finished, and did it work" (the 15 Nov plan, Part 2). It is the cut down version of "one notch line for every agent".

## Why (from the plan, sources seen 15 Nov 2026)

- Claude Code's agent view covers only Claude (code.claude.com/docs/en/agent-view.md). Codex threads and the Cursor Agents Window each cover only their own agent.
- The notch monitors show status only. AgentPeek covers 7 tools, sessions and permissions, and keeps data local, with no review, proof or undo (producthunt.com/products/agentpeek/launches).
- So status for many tools is not an edge. "Finished, checked, with Undo" is.

What the person gets: the notch line names the tool and the result: "Codex finished in shop: works", or "Codex finished in shop: 2 problems", with the review card (and its Undo, M101) one press away. Codex can also say "Codex is waiting for you".

## What to build (from the plan)

1. One done marker per tool, as `docs/milestones/M84-design-pass.md` asks. It needs its own migration plan, because it changes hook lines already in people's projects (`runner/src/donesignal.ts` `TOOL_HOOKS`, `app/src-tauri/src/donehooks.rs`). The plan is below.
2. A Codex waiting signal through its PermissionRequest hook, which "runs when Codex is about to ask for approval" (learn.chatgpt.com/docs/hooks). The hook prints nothing, exits 0 and never answers the approval. PermissionRequest is added to `EVENTS` (`donehooks.rs`) so Remove and Delete everything clean it up.
3. Gemini CLI's Notification event only after a real Mac check shows it fires on approvals. Today that is unconfirmed (geminicli.com/docs/hooks/), so it is not built.
4. Cursor, Copilot (the VS Code agent), Antigravity and Windsurf: done and checked only. Settings says plainly that their waiting signal is not available.
5. No "working" state and no session list. The notch stays one line with the most urgent fact (M93 minimal); each tool's own state is in Home's side list.

Copy: "every connected tool", never "every agent".

## Tests first (from the plan)

- Per tool markers credit the right tool.
- Migrating old hook lines keeps the review working.
- Remove takes out PermissionRequest.
- The Codex hook output is empty with exit 0.
- The hook never reads its input.

## Rules it must hold

Rules 5, 9 and 16. Hooks only touch an empty token file. Nothing here runs git or writes the person's git (rule 10).

## The migration plan for the done lines

- **New lines.** A done hook now touches `<data>/done/<token>.<tool>` (for example `...done/0123...4567.codex`) instead of `<data>/done/<token>`. The token stays one per project, so every other hook (the guard, Claude Code's waiting and start hooks) is unchanged.
- **Old lines keep working.** A marker with no tool on its name is still taken. It is credited to the one tool whose done line is on in that project; when more than one is on, it is credited to no tool and the review runs exactly as before (it just cannot say which tool finished).
- **Nothing is rewritten without a yes.** An old line shows in Settings as older than today's, with Update (the M85 path). Update shows the card with today's exact line, and only its yes writes it. Remove and Delete everything take out old and new lines alike (both are a `touch` of Squibby's own `done` folder).
- **Codex's waiting line is new and optional.** A Codex already connected stays connected; the waiting row in Settings (and Connect for a new Codex) offers it.
