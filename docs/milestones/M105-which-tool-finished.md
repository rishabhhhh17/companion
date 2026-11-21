# M105: Which tool finished, and did it work

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 18 Nov 2026 (in the Bugs commit); the comparison with the best and Go to on a finished block added 21 Nov 2026, not committed. Nothing is spent: no model call of any kind, no key, no account. Fixtures, stand in hooks run by `sh`, and temporary folders only.

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

## Built (18 Nov 2026, finished 21 Nov 2026)

- **Per tool done markers** (`runner/src/donesignal.ts`, `app/src-tauri/src/donehooks.rs`). Each tool's done hook touches `<token>.<tool>`; `review.batch` and `review.result` carry `by`. An older line (`<token>`) still works and is credited to the one tool whose done line is on, or to none (the review runs as before).
- **Codex's waiting signal** under `PermissionRequest`: a `touch` of `<token>.codex.wait`, no output, exit 0, never an answer. `EVENTS` includes `PermissionRequest`, so Remove and Delete everything take it out. Offered by Connect for a new Codex and by its own row for a Codex connected before.
- **The notch says it.** "Codex finished in shop: works", "... looks fine" (nothing found, checks did not run), "... 2 problems" or "... 1 thing to look at", for 15 minutes after the result, while that review's card is open and the project is the one open. The one pill says the result ("See 2 problems", with a dot when something was found) and opens the review card, where Undo is (M101). Never "works" without passing checks (rule 14). Home's side list says the same under the tool's name. Codex waiting turns the notch amber: "Codex is waiting for you", with where to answer.
- **Settings says plainly** which tools can say they wait (Claude Code and Codex) and which say only when they finish.
- **21 Nov 2026, from "Compared with the best": Go to on a finished block.** A finished session in the live feed (M113) now offers Go to iTerm (or the app it runs in) as a working one did (M115), because a tool that finished its turn waits for the person's next words in its own window. It sends only `tool.jump` (the project and the tool); a Go to that cannot go says so in a plain line, as before. `app/src/notchFeed.tsx`; tests `app/dom/m115.test.tsx` (the old "no Go to once it finished" expectation changed on purpose, plus a finished block with no session seen has none).

Tests: `runner/test/m105-which-tool.test.ts`, `runner/test/m80-every-tool.test.ts` and `m82-connect.test.ts` (Codex's set changed on purpose), `app/src/m105.test.ts`, `app/dom/m105.test.tsx`, `app/dom/m115.test.tsx`, the Rust `donehooks.rs` tests and the shared fixtures `m105e1` to `m105e3`.

Shots (2x, dark, stand in for the app): `scratchpad/m105shots/out/` (`3a-finished-line-and-block.png`: the notch line "Codex finished in signup-page: 2 problems", the pill and the finished block with Go to iTerm; `1a`, `1c` no session seen, `1d` Reduce Motion) and `scratchpad/m105shots/out-long/` (worst case: a long project, "Visual Studio Code - Insiders", 1,284 lines, a Polish file name, three sessions). Names are cut with an ellipsis and said whole to VoiceOver. After the review (21 Nov 2026): the name keeps room first and Go to gives way (`notch.css` `.lf-who`, `.lf-go`), so the worst case reads "Codex in my-very-long-si… Finished · Go to Visual Studi…" (it was "Codex in my-very-l…"); `4a`, `4b` show the small chat, where the state, its separator and Go to now wrap as one group to the line's end (`black.css` `.lf-end`) instead of leaving the separator alone at a line's end. `3a` now uses a review of signup-page itself.

**Review fixes (21 Nov 2026).**
- A stale "where" no longer keeps offering Go to. A Go to that did not go (`tool.jumped` with `ok: false`, either why) forgets where that session ran (`model.ts`), so the button leaves a finished block until the engine says where again; a tool that is an app of its own falls back to opening the tool. No protocol change: the engine's existing answer is enough. The heavier way (a new `gone` tool.where event when the engine sees the process quit) was not built: the engine's Go to opens the terminal app itself, which still works after the tool quits, so the failing case is the one that needs it.
- Tests: the own app branch on a finished block (Copilot and Cursor, no session seen, sends only `tool.jump`), and the stale case, in `app/dom/m115.test.tsx` and `app/src/m115.test.ts`.
- Question for the founder, not changed (the look is locked): a finished block whose review found problems still says "Finished" in the ok green under "See 2 problems". Should a finished block with problems use the neutral state colour (`--chat-when`) instead?

## [verify] on a real Mac

Each in a throwaway practice project, never a real one. Also in `docs/research/technical_research.md` section 20, item 52.

- (a) Codex runs a project `PermissionRequest` hook once trusted with `/hooks`; the hook with no output and exit 0 leaves Codex's own approval prompt exactly as it was (no auto approve, no deny); it fires before each approval; it needs no `matcher` (if Codex requires one, add `"matcher": "*"` and say so in the card).
- (b) Each of the seven tools, after Update on an older done line, touches `<token>.<tool>` and the notch says that tool's name.
- (c) Whether Gemini CLI's `Notification` hook fires on a tool approval (geminicli.com/docs/hooks). Only then add it as Gemini's waiting signal.
- (d) Cursor, the VS Code agent, Antigravity and Windsurf have no documented waiting event (Antigravity and Windsurf not checked: unconfirmed).
- (e) "Codex finished in shop: works" appears within a second or two of Codex's done, and the pill opens the review card with Undo.
- (f) After Codex or Claude Code finishes a turn in iTerm, Go to on its finished block brings that tab to the front; with the tab closed, the plain "could not go" line shows.

Guide: open a practice folder, connect the tool from Your AI tools, ask it for a one line change, and watch the notch. Nothing here needs a key from Squibby; the tool runs on the person's own account.

## Compared with the best (21 Nov 2026)

Against HeyClicky (the notch companion), CodeRabbit (AI code review: clear findings, one click fixes, summaries) and Coucou (the notch agent watcher, its MIT code read in `scratchpad/repos/coucou`: `docs/SPEC.md` rule 8, `docs/INTEGRATIONS.md` "Vue Terminé"). Copied what works; never their names, characters, sounds or look.

**Where we match.**
- Coucou opens its notch on a finished turn with the agent's name and a "see the terminal" button. Ours names the tool and the project in the one line, and (since today) the finished block has Go to the window it runs in. Steps: none to learn it finished, one press to go back to the tool.
- HeyClicky says when its agents finish, beside the cursor. Ours says it in the notch, at once, with no sound unless the person turned sounds on.
- Coucou and HeyClicky show which agent waits. Ours says "Codex is waiting for you" in amber, and Claude Code's own notice, as before.

**Where we are better.**
- The line says whether it works, not just that it stopped: "works" only when the project's own checks passed, "2 problems" when the review found them (CodeRabbit's clear finding count, in plain words). Coucou shows the agent's last sentence, which is the agent's own claim.
- One press opens the review card with each problem's proof and Undo for any tool's change (M101). Neither notch app can put the files back; CodeRabbit leaves undo to git.
- Nothing of the tool's question or answer is read: the hooks touch an empty file. Coucou reads the agent's answer for its summary line.
- Per project, after a yes card that shows the exact line; Coucou writes the person's user wide settings for every tool.

**Gaps.**
- Closed in this milestone: Go to on a finished block (Coucou's "see the terminal" on its finished view).
- Left on purpose: the agent's last sentence as a summary (we never read a tool's answer or transcript; the review card's own summary says what changed). Coucou's opening of the whole island for five seconds on every finish (the minimal notch, M93, says it in one line and peeks only with news). Its finish sound (ours are our own, and off unless chosen).
- Listed for later: when two tools finish close together, the notch line names only the newest; the other is in the live feed and Home's side list (Coucou queues them one at a time). VoiceOver hears the finished line when the notch is opened, not the moment it arrives; a spoken notice for a finish needs the same care as the other notch news, so it belongs with a pass over every notch announcement.
