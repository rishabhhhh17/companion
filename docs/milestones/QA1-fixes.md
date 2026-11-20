# QA1. Fix what the functionality check found

A read only functionality check of the real app on 19 Nov 2026 found 10 bad and 16 minor problems. This milestone fixes every one that is still real. Each fix has a test that failed first, then passed. Each was also checked in the page harness (Chromium, 2x) where a page shows it.

Three items were only about M113 work that was not committed yet. M113 is committed (1de12aa) and its suites were green before this milestone started (pages 4427 + 237, runner 6055), so they are closed with no change.

## What was fixed, and the test that holds it

| # | Was | Now | Test (failed first) |
|---|---|---|---|
| 1 (bad) | Home or the chat opened by a click on the notch did not take Esc or typing until a second click inside. | A click on the notch's row, or on the hello under it, is the person choosing Squibby, so that Home takes the keys as it opens, as the ask key always did. Pointing, a pill in the panel and every open Squibby makes by itself still never take them (rule 9). | `island.rs` `a_click_on_the_notch_or_its_hello_gives_home_the_keys_and_nothing_else_does` |
| 2 (minor) | On a news peek, a click on the headline opened the small chat; the line under it did nothing. | With news in the row, the headline and the line under it open Home on that news, as the notch's own row does. The plain hello still opens the chat. Layout only: the headline's button covers the line (notch.css), same look. | `qa1.test.ts` rowPressOpens, `dom/qa1.test.tsx` notch's news; Chromium: a point on the line is the headline's button |
| 3, 14, 26 (minor) | Red suites from uncommitted M113 work. | Closed: M113 is committed and green. | Baseline runs (see Suites) |
| 4 (bad) | Two quick sends both went out; the second one's words could be lost. | A send the engine has not answered yet holds the next one, as work does: one task starts, the first ask stays in the thread, the second words stay in the field with the busy line. Send is greyed while the first one starts. | `qa1.test.ts` askRoute starting, `dom/qa1.test.tsx` second quick send |
| 5 (bad) | The chat never showed the AI's answer, and every result threw it open into full Home. | The AI's own last words show as Squibby's bubble under the ask, also before its History row arrives. An answer that changed nothing, did nothing that cannot be undone and asks nothing back stays in the chat. Work that changed files still opens Home on its receipt, with Undo and proof, and its bubble keeps what the checks found (rule 14). | `qa1.test.ts` chat answer, `dom/qa1.test.tsx` question's answer |
| 6 (bad) | A draft typed in the chat was lost on Close. | Words in the chat's field move into Home's own box when the chat goes, and are kept as the draft (askbox.ts rules: never off the record, never a key). The next chat has them. | `dom/qa1.test.tsx` draft survives Close |
| 7 (minor) | The busy line stayed after Stop and could show above the newest ask. | It goes once nothing works, and comes after the newest ask, never above it. | `qa1.test.ts` order and askHintNow, `dom/qa1.test.tsx` busy line goes |
| 8 (minor) | Hold to talk from the chat threw it open into Home and left it big. | Listening, writing the words down and the words heard stay in the chat, which says it listens. A model to download, a blocked microphone or silence still open Home, where their buttons are. | `qa1.test.ts` talking, `dom/qa1.test.tsx` hold to talk |
| 9 (minor) | Explain an error with an empty box said to add a shortcut. | With no explain shortcut it says "Paste an error in the box and press Explain an error." With one, it names it. | `qa1.test.ts` explainBoxHint, `dom/qa1.test.tsx` Explain |
| 10 (minor) | Esc with More ways to ask open closed all of Home. | Esc closes the popover first; Esc again closes Home. | `dom/qa1.test.tsx` Esc with More ways; Chromium: open false, close_card 0 |
| 11 (minor) | Stop everything during chat work called home_expand. | Its own notice never throws the chat open, and for two seconds after it nothing opens the chat by itself; the chat folds away. | `dom/qa1.test.tsx` Stop everything |
| 12 (minor) | Tab from Send landed on the page behind. | Tab goes round the chat's controls (Send back to the top row; Shift Tab the other way). | `qa1.test.ts` chatFocusNext, `dom/qa1.test.tsx` Tab; Chromium: focus on Settings, inside the chat |
| 13 (minor) | With fixing off the chat still sent an ask and showed Working. | Nothing is sent. The words stay and the chat says why. Founder decision F29 (nobody adds a key) stands, so the words never ask for a key, unlike the check's expected line. | `qa1.test.ts` fixOff, `dom/qa1.test.tsx` fixing off (chat) |
| 15 (bad) | A fix from the review card was named by the internal request, cut mid sentence. | The engine names it "Fix what the review found" (labels.ts), and older rows read the same on the page (itemLook.ts taskName). | `runner/test/qa1-fixes.test.ts` name, `qa1.test.ts` taskName and the shared fixture |
| 16 (bad) | A change in the 1.5 s after Squibby's own work was never reviewed, and Review now said nothing changed. | In that moment only late events for files the engine's work touched are its own; any other file counts at once, in the next batch and in Review now. | `runner/test/qa1-fixes.test.ts` batcher (3 tests) |
| 17 (bad) | test.js, tests.js, spec.js and test.py at the root were not tests. | A file named only test, tests or spec (JavaScript, TypeScript or Python), at the root or in a folder, is a test, so removed assertions are flagged. latest.js, contest.py and the like are not. | `runner/test/qa1-fixes.test.ts` TEST_FILE (3 tests) |
| 18 (minor) | The week's Undo count did not count Put these files back on a review. | It does, once per review, for its own project only. | `runner/test/qa1-fixes.test.ts` week's Undo count |
| 19 (minor) | The dev demo printed a denied command as done, and the ask ended "..". | "Not run: git push origin main", one full stop. | `runner/test/qa1-fixes.test.ts` dev demo |
| 20 (bad) | Memory Edit: Return saved but the editor opened again. | Return is used up by the save, so it never presses the Edit button the keys move back to. Saved once, row plain again. | `dom/qa1.test.tsx` Memory Return; Chromium: editor closed, 1 edit |
| 21 (bad) | Bring the fix back was missing after an Undo from History or Now. | `tasks.list` names the Undo's safety copy on an undone row while the store keeps it (`undoSafety`, protocol and fixture `eqa1u`). History's row and Now's last fix offer Bring back, ask first, then restore it. The list is asked again when an Undo or a Bring back ends. | `runner/test/qa1-fixes.test.ts` History can bring back, `qa1.test.ts` bringBackOffer, nowRows and fixture, `dom/qa1.test.tsx` History and Now |
| 22 (bad) | With fixing off, Home sent a typed task and showed Stop. | Nothing is sent, no Stop shows, and the line under the box says why; the words stay. | `dom/qa1.test.tsx` fixing off (Home) |
| 23 (minor) | The status pill could sit under the project chip in the wide Home. | Could not be made to happen in the harness at 6 sizes with and without the notch's row, before or after these fixes (pill 90 to 110, chip 44 to 74, nothing scrolled); the check's own clicks may have scrolled the page. Guarded: the wide Home's scroll padding now keeps anything scrolled into view below the sticky project row (wide.css). [verify] on the Mac. | Harness measurements (shots `a23*`) |
| 24 (minor) | After Bring the fix back the card still said "Put back as it was" and "Put back: 1 file". | Once the fix is back the result reads as changed again ("Changed 1 file"), and the put back line goes. | `dom/qa1.test.tsx` result after Bring back |
| 25 (minor) | A failed task offered "Bring the fix back" and then "The fix is back". | A task whose checks did not pass offers "Bring the changes back" and then says "The changes are back". | `qa1.test.ts` verdict words, `dom/qa1.test.tsx` changes back |

## Old expectations changed on purpose

Each is marked "Changed on purpose (QA1)" in its test.

- `bugbash-pages-fix.test.ts`: submit now passes `starting` and `fixOff` to askRoute.
- `nodeadbuttons.test.ts`: Explain with an empty box uses `explainBoxHint(keys)`.
- `m96Notch.test.ts`: listening no longer opens the chat out; the one focus call in notchChat.tsx is the Tab loop.
- `runner/test/review-batcher.test.ts`: in the grace after Squibby's own work, a late event counts as its own only for a file that work touched (the test's late event is now on that file).
- `island.rs` tests: unchanged literals still hold; the new test holds the click open taking the keys.

## Built and [verify]

Built: everything above, with the suites green (see the final report). [verify] on a real Mac, added to technical_research.md section 20 item 54:

- (a) A click on the notch, and on the hello under it, opens Home or the chat with Esc and typing working at once, and no other app loses its window order beyond what any click on Squibby does.
- (b) The click area of the news headline covers the quiet line in the real window size.
- (c) Within one second after Put these files back, a change to another file in a practice project is reviewed.
- (d) The status pill never sits under the project chip in the wide Home after a result.

## Compared with the best

Notes: `beat-1115/heyclicky.md`, `coderabbit.md`, `orchestrators.md`, and the M112 notes.

- **Where we match.** HeyClicky's notch chat answers in the chat; ours now does too, and keeps a plain answer there instead of throwing the window open. HeyClicky folds a chat on a click away and keeps the words; our draft now survives Close. Escape takes control back in HeyClicky's drive mode; Esc now closes the popover first and then Home, and a click on the notch gives the keys at once, as a click on HeyClicky's notch does. CodeRabbit names a fix task by what it fixes; ours is "Fix what the review found".
- **Where we are better.** CodeRabbit says a finding that disappears "isn't confirmed as fixed"; we prove a fix by its checks, and Bring back is now one press from History or Now after any Undo, with words that never call a failed change a fix. Coucou watches agents but has no undo at all. A second quick Return is held with the words kept, where a chat that sends both loses the first answer.
- **Gaps.** (1) HeyClicky streams its answer as it comes; ours shows the AI's last words when the task ends. Streaming needs the engine to send partial text, a protocol change for its own milestone. (2) A question typed in the chat still runs as an ordinary checked task (with a safety copy and Undo), as it does in Home; a read only "answer only" mode is a runner and protocol change and is listed for the build queue. (3) HeyClicky shows captions when the chat folds mid answer; not in scope here.

## The review of this milestone, and what changed after it

A review of QA1 found six things. Each is fixed; the logic ones with a test that failed first.

| Review finding | Now | Test (failed first) |
|---|---|---|
| Bring back was offered on any undone row, even with later Squibby work after it, and on every row one Undo marked. The press restores the whole project as it was before that Undo, so later work would be silently taken back. | Bring back is offered only while that Undo is the newest change: no later row changed files (or may have: an unknown count), and nothing is working on the project. When one Undo took back several tasks, only the newest of them offers it. Held twice: on the page (`history.ts bringBackOffer(items, row)`, History and Now) and by the engine (`tasks.list` names `undoSafety` only then). | `qa1.test.ts` later task, running task, one Undo for two tasks; `runner/test/qa1-fixes.test.ts` "once a later task changed files" and "one Undo that took back two tasks" |
| Rule 5: while hold to talk listens from the chat, the chat's mic looked as at rest, and only a plain bubble said Listening. | While the microphone is open the chat carries `data-talking` and its mic is lit with Home's own listening token (`--ring-working`, icon and a ring the width of the focus ring), also when the field has the keys. Its name says "Listening. Let go of the keys to stop." It shows even if the keys changed meanwhile. No new colour, no motion. | `dom/qa1.test.tsx` "while it listens, the chat's mic is lit"; Chromium shots `c4*` |
| The ECC skills applied could not be matched to the diff. | Written below, one line per skill with the change it drove. | |
| The worst case was run only on four shots, and the news cover under the headline was never tried with long, CJK or no hint, or Stop as the pill. | Run on c3, c4, c5, c6, h1b, h3, h5, a23 and five news peeks (long Latin, CJK, CJK with no hint, no hint, Stop). The cover never reached the pill (cover ends at 76, pill starts at 88, and the pill's own centre is the pill in every case). Hardened anyway: the cover is there only when there is a hint line, and the pill and Open Home always sit above it (notch.css). | `qa1.test.ts` the cover rule; Chromium shots `n1-news-*` |
| With fixing off, Send stayed bright though it can never send, and the line under the box nearly repeated the headline and read as if a check were running. | Send is greyed in Home and in the chat (the existing disabled look) and says why in its name. Return still answers with the line under the box, now "Fixing is not switched on for this Mac yet, so this was not sent. Your words are kept. You can still check your project." | `dom/qa1.test.tsx` both Sends greyed; `qa1.test.ts` the words |
| Rule 14: the chat could show the AI's own claim ("Fixed, all tests pass") as the whole result, for a task that ended on an error or a limit, or whose proof failed. | The chat's line for the task that just ended is built from the receipt's own end, limit and why (said as the History status its row will carry, so the words do not change when the row arrives), never a hard coded done. The proof's line follows the AI's words unless it is a plain answer: ended done, nothing changed, checks not failed and no claim of passing checks. Such a result opens out to the receipt (`resultStaysInChat`). | `qa1.test.ts` "the chat never shows the AI's claim with no proof line" (4 tests); Chromium shot `c6*` opens Home |

Changed on purpose after the review, each marked in its test: `qa1.test.ts` "an answer that changed nothing stays in the chat" and "before its History row arrives" now give the receipt `end: "done"`, because a receipt that does not say how it ended is never read as done (M45). The `bringBackOffer` calls in `qa1.test.ts` pass the list with the row, as the function now needs it.

Added to [verify] item 54: (e) with the chat the only surface, the chat's mic is lit before the microphone opens.

## ECC skills applied

`ecc_applied`:
- **ecc-tdd-workflow**: every logic fix above and in the first table started as a failing test (RED seen, then GREEN): `bringBackOffer` newest rule (6 failing, then green), the engine's `tasks.list` rule (2 failing), the chat's proof line (3 failing), the fixing off words and both greyed Sends, the lit mic.
- **ecc-frontend-a11y**: the chat's Tab loop (`notchChat.ts chatFocusNext`, `notchChat.tsx tabRound`), Esc closing More ways to ask before Home (`card.tsx`, the `details.more[open]` check), Memory's Return saving once and Esc handing focus back (`card.tsx` memory editor), the lit mic's name while listening (`notchChat.tsx` aria-label `micListening`), and the greyed Send keeping why in its name (`aria-label` and `title`, Home and chat).
- **ecc-motion-foundations**: the lit mic adds no motion (a static colour and ring), so Reduce Motion has nothing to turn off; no other motion was added in the review.
- **ecc-verification-loop**: build, typecheck, every suite, clippy, and a diff review before the report; the worst case shots read back at 2x.

Other skills (ecc-react-performance, ecc-motion-patterns, ecc-frontend-design-direction, ecc-rust-patterns, ecc-react-patterns) drove no hunk in these changes, so they are not claimed.
