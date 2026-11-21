# M107: "Put it in" on the review card

Status: plan approved by the founder on 15 Nov 2026 ("Yes, build it all", for the whole M97 to M109 plan as written). Built 21 Nov 2026, not committed. Nothing is spent: no model call of any kind, no key, no account. Fixtures, the stand in app and temporary folders only.

From "Put it in on the review card" (the 15 Nov plan, Part 2).

## Why (from the plan, sources seen 15 Nov 2026)

- On the review card the fix request offers only Copy for my AI and Show me where to paste (`app/src/reviewCard.tsx` SendBack).
- The Put it in path already exists for hand offs (`app/src-tauri/src/aitools.rs` `put_in_step`, `app/src/handoff.ts`, `pastehere.rs`).
- This is parity, not a win over CodeRabbit. CodeRabbit's Fix with AI pastes without sending in Cursor and Windsurf, and sends by itself in VS Code (Copilot), Claude Code and Codex CLI (docs.coderabbit.ai/ide/fix-with-ai). docs.coderabbit.ai/cli names four agents: Claude Code, Codex, Cursor and Antigravity. Others are unconfirmed, so "six of seven" is wrong.

What the person gets: one tap puts the plain, safe fix request into the chat box of the tool they used. They press send themselves.

## What to build (from the plan)

1. Feed the review's send back text (`sendBackCopy`, already quoted, redacted and injection safe) into the existing `put_in_step`.
2. A "Put it in <tool>" button beside Copy for my AI, for the tool remembered for the project.
3. App tools only: Cursor, VS Code with Copilot, Windsurf, Antigravity, and the Codex app once its app id is proven. Never type into a terminal (Claude Code, Codex CLI, Gemini CLI), because a new line could run the text. Offer Fix it or Copy there instead.
4. Keep the copy fallback.

## Tests first (from the plan)

- Never presses Return (the test already in aitools.rs, extended).
- Terminal tools never get Put it in.
- The text passed is exactly the send back text.

## Rules it must hold

Rule 9 (only on the person's tap), rule 8 (Accessibility asked on first use), rule 13 (the person sends), rule 18 (claim each tool only after a real Mac check).

## How it works (built)

- **Which tool.** `app/src/reviewPutIn.ts` `putInTool`. The tool whose done signal said these changes (`r.by`, M105) comes first: the fix goes back to the tool that made the change. When no done signal said who, the tool last picked for this project in Have my AI do it is used. Only four tools can ever be named: Cursor, VS Code with Copilot, Windsurf and Antigravity. When the tool that finished is a terminal tool (Claude Code, Codex, Gemini CLI and the rest), no Put it in is offered, even if another tool was used here before: the fix belongs to the tool that made it, and Copy for my AI and Fix it stay. Codex counts as a terminal tool for now: its done signal cannot tell its app from its command line, so the Codex app waits for its real Mac check. A background job's card (M106) never offers it: the job is Claude Code's.
- **The text.** Exactly what Copy for my AI copies: `sendBackCopy(r)` through the same `copyable` check. Text the Mac side would refuse shows no Put it in.
- **The press.** The shell's own Put it in (`handoff_put_in`, M82): Home only, the light first, Accessibility asked the first time, the tool brought to the front (the one deliberate bring to front), the text typed only into a box the tool itself labels as its chat box, through Type by voice's paste. Return is never pressed. Anything else copies the text and says why in plain words, and Show me where to paste is offered after.
- **What it says.** "It is in Cursor's chat box. Read it, then press Return there to send it." or the reason it was copied instead (`S.review.put`, the same keys as the hand off card's `S.m82.put`, but calling the text the fix request, as the card's help and the setting do). Once it is typed, the button says "It is in Cursor" and does nothing more; a copy instead leaves it live to try again. The line comes after Walk me through it, under every press of the card. History counts it as sent back, as Copy does.
- **Antigravity.** `pastehere.rs` knew no Antigravity window, so its chat box could never be confirmed and Put it in would always copy. Antigravity's two app ids now count as a VS Code style editor, with the same chat box words. VS Code Insiders too. Each is a [verify] item below.
- **Setting.** `review.putIn` (Settings, More, Fixing, on as usual): "Offer Put it in on the review card". Off: only Copy for my AI.

## Compared with the best (21 Nov 2026)

Against HeyClicky (the notch companion), CodeRabbit (AI code review: clear findings, one click fixes, summaries) and Coucou (the notch agent watcher, github.com/Louis-CFM/coucou). Research notes: `beat-1115/heyclicky.md`, `coderabbit.md`, `orchestrators.md`. Copied what works; never their names, characters, sounds or look.

**Where we match.**
- CodeRabbit's Fix with AI in Cursor and Windsurf pastes the prompt and leaves sending to you. Ours does the same in Cursor, VS Code, Windsurf and Antigravity: one press, and the person sends.
- CodeRabbit keeps a clipboard choice. Ours keeps Copy for my AI beside Put it in, and every reason it could not type copies instead.

**Where we are better.**
- Steps: one press from the card that explained the problem, with no tool to pick. The tool that finished is already known (M105). CodeRabbit asks you to pick an agent the first time.
- Safety: ours never types into a terminal and never presses Return, so the text can never run by itself. CodeRabbit sends by itself in Claude Code, Codex CLI and Copilot. Ours never types into a box it only guessed at, and never into a password box.
- Words: the text is the review's own plain request, with keys hidden again. HeyClicky and Coucou have no fix request at all.

**Gaps.**
- Closed here: Antigravity is a tool CodeRabbit names, and our paste code did not know its window. It does now ([verify]).
- Closed here: a fix request for a change Claude Code made could have gone to Cursor, because Cursor was picked last in Have my AI do it. The tool that finished now wins, and a terminal tool gets no Put it in.
- Left: CodeRabbit's "Fix all issues" sends many findings as one prompt; ours already does, as the send back text covers the whole review. CodeRabbit's terminal agents get the prompt sent for them; ours offers Fix it instead, on purpose (rule 13). The Codex app, Kiro, Zed and the JetBrains editors get no Put it in until each one's chat box is checked on a real Mac (M109).

## [verify] items (also in docs/research/technical_research.md section 20)

- (a) On a real Mac with Cursor, VS Code with Copilot, Windsurf and Antigravity each open: a review that found something, Put it in <tool>. The text lands in the tool's chat box, Return is not pressed, the clipboard is put back. Guide: `docs/milestones/M109-real-mac-guide.md`, the Put it in step.
- (b) Antigravity's chat box says one of the VS Code style words ("ask anything", "plan, search, build", "message", "type your task"). If not, add its own words to `pastehere.rs` `chat_words`.
- (c) The Codex app's id (`com.openai.codex`) and its chat box words, before Codex gets Put it in.

## Review fixes (21 Nov 2026)

- **Typed twice.** A second press after "typed" typed the fix request again. Now `putDone` (reviewCard.tsx `useSendBack`) is set on "typed", cleared when the text changes; the button reads `S.review.putInDone(tool)` with a tick and `aria-disabled`, and the press returns early. Tests: `app/dom/m107.test.tsx`, a second and third press after "typed" call `handoff_put_in` once; a press after a copy instead stays live.
- **The commit box.** The editors' chat box words include "message", and Source Control's box says "Message (⌘⏎ to commit on 'main')", so it was confirmed as the chat box. `pastehere.rs` `decide` now drops any box whose label speaks of a commit before confirming or guessing. Test: `m107_review_an_editors_commit_message_box_is_never_taken_for_its_chat_box` (VS Code, Cursor, Windsurf, Antigravity; never guessed at either; with the chat open too, the chat box wins). M109 step 4 checks it on a real Mac.
- **Claims before the check.** The CHANGELOG now says it tries the chat box and copies when it cannot be sure, and that each tool is still being checked on a real Mac. The setting help says "It is made for", not "It works with". All four stay [verify] (a), (b).
- **One word for the text.** `S.review.put` says "the fix request" everywhere on the card; `putInHelp` too. `S.m82.put` keeps "prompt" for the hand off. Test: `reviewPutIn.test.ts`.
- **Where the answer sits.** The status line sat between the action row and Walk me through it. `SendBack` is now a hook (`useSendBack`) that returns the presses and the status apart; both review views render the status after the walk row. The key warning and the practice panel keep `SendBack` as before. Test: `m107.test.tsx`, the line follows `.rv-walk` and is outside `.result-actions`.
- **ECC skills applied.** ecc-tdd-workflow: each fix had a failing test first (RED seen for the double press, the line's place and the commit box). ecc-react-patterns: the shared hook sequence used by three components became one custom hook, `useSendBack`. ecc-frontend-a11y: the done press keeps its place in the tab order with `aria-disabled` and a label that says what happened, and the status line now follows every control it reports on. ecc-rust-patterns: the commit filter is one closure in the candidate chain, no new allocation.
- **break-ui worst case.** Reshot with a long path, line 1204, a Polish summary and VS Code (Copilot), wide and narrow. It found the status line placement above; after the fix the line sits under the walk row and wraps under it at narrow width.
