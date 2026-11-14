# M88: Your numbers, a shareable receipt, and spoken status

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was spent on a real model, nothing was sent, no real save dialog opened and nothing was said out loud: fixtures and stand ins only, temporary folders only.

The why comes from the checked research of 13 Nov 2026 (`synthesis.md` first). Section 5, item 1: real users and numbers are the biggest gap for YC, reported "the way Agent FM and Plover did: weekly users, paying users, reviews done, undos used, fixes that passed checks". Feature 8 (section 3): a shareable "what my AI did" receipt, which answers "how do you get users?" (`yc-companies.md`: Spacesheep's shareable agent output, HeyClicky's growth through short video). Feature 9: spoken status ("your fix passed its checks", "Cursor is waiting on you"); Agent FM reported 410 engineers, 60+ paying and 1.2 hours a day of audio updates. The plan for (a) is `M84-86-plans.md` section M85.

## (a) Your numbers

A **Your numbers** row in History, under This week. On its press only, the pages ask for the week (`week.show`, M79) and the AI tools state (`donesignal.show`), and show this week's counts for the open project, from the person's own task log on this Mac: changes reviewed and their files, what was caught by kind (keys, weakened checks, dones that were not done, risky packages), fixes proven, Undos used, copies saved before destructive commands and those used, jobs handed to Squibby, AI tools connected and days used. A count the engine did not send says "Not counted"; nothing is made up.

- **Engine:** `TaskLog.usage` (`runner/src/tasklog.ts`) counts `jobs` (tasks Squibby ran, never a saved copy or an ask) and `days` (days on this Mac's clock with any row) for the same seven days. `week.show` sends them inside `week.summary` (`WeekView.jobs`, `WeekView.days`, optional, checked as whole counts, days at most 8). The M79 fixtures `m79e2` and `m79e3` now carry them; the runner, the pages and the shell read them.
- **Send these numbers** shows the exact JSON first (`yourNumbers.ts numbersJson`: counts and dates only, keys in a fixed order, no project name, file name, decision or word from a review). Only **Open a mail draft** hands it to the shell (`numbers_mail`), which checks it again (`numbersmail.rs check_json`: only the known keys, whole counts, two days) and opens a draft in the person's own mail app through a `mailto:` link, every part percent encoded. The person sends it, or not. **Copy the numbers** is there too.
- **The address** lives in one config spot, `app/src/numbers.json`, read by the pages and built into the shell. It is empty until the founder sets one, so the draft opens with an empty To line. The send panel says which: "Goes to" the address, or that no address is set yet. The range is said in words (7 Nov to 14 Nov), as This week says it; the days as numbers are only in the JSON.
- **Setting** `numbers.yours` (on) in Settings, Privacy, More options (beside the beta numbers): off hides the row.
- "Jobs handed to Squibby" counts Squibby's own runs (Have my AI do it with Claude Code goes through them). A prompt put into Cursor or another tool is not logged anywhere, so it is not counted.

## (b) Share what my AI did

From a task's row in History (open it, then **Share what my AI did**) or from This week, the pages make one self contained web page (`app/src/shareReceipt.ts`): the plain words summary, the proof result in words with its meaning colour, the proof picture when Home's receipt is that task's (the hidden browser's picture of the app being built, never the screen), and counts. A preview shows first, and it is the very string that is saved, shown in a frame that runs nothing (`sandbox="allow-same-origin"` with no scripts, so its height can be read), so the preview and the file can never differ; **Save as a file** opens the Mac's own save dialog (`save_receipt`). No server, no upload.

- **Redaction** (`shareLine`): keys hidden with the runner's own redact and a line that still looks like a key left out (the go live report's `cleanLine`); the project's folder said as its name; every word that is a path (a slash, a home folder, a drive) hidden; file names are never listed (a count only); This week's decisions and house rules are left out (they are words). Paths side by side are said as one hidden mark.
- **Each count said once:** the week's file has its sentences, then a table of only the counts they do not say (jobs handed, AI tools connected when known, days used). The app's This week does not ask for the tools, so its file has no tools row.
- **The page:** styles inside it, the picture inside it as a JPEG, a content policy of `default-src 'none'; style-src 'unsafe-inline'; img-src data:`, every word escaped, colours read from `ui/tokens.css` (`--report-*`) on Save.
- **The shell checks it again** (`receiptfile.rs`): a web page that starts as one; no script, frame, link, form, svg, base, media, `href`, `srcset`, `@import`, `url(` or `javascript:`; `file:`, `http:` and `https:` only where they work as a scheme (followed by `//`, or right after a quote, `=`, `(` or a backtick), so plain words like "Fix the profile: avatar" are fine; only the page's own meta lines; no event handler; at most one picture and only a JPEG or PNG inside the page; no folder of this Mac; 8 MB at most. The page itself is never logged. A page the shell refuses gets its own words (`S.m88.share.notAllowed`), not the ones for a folder that could not be written. The shared fixture `protocol/fixtures/m88-receipt.html` is exactly what the page makes, and the Rust check passes it.

## (c) Payments, still switched off (F31)

The founder's choices of 13 Nov 2026, taken from HeyClicky: yearly billing at 20% off (Pro stays $15 a month, so $144 a year), students 50% off their first month, and invite and earn (the friend gets 25% off their first monthly month; the inviter gets 25% of the friend's plan as credit, for up to 12 months). Recorded as `docs/decisions/F31-yearly-students-and-invites.md`.

- `app/src/prices.json`: `proYearly` 144 and an `offers` block. `app/src/plan.ts`: `offersFrom`, `yearlyFrom` and `yearlyAgrees` (the file agrees with itself), `studentFirstMonth`, `friendFirstMonth`, `inviterCredit`, and `offerLines`, shown on Get Pro only while payments are on. Percents only in the words; no dollar amount outside `prices.json`.
- Both switches stay off (`paymentsOn` false in both billing files, the remote switch empty): nothing is charged or shown.
- Two old expectations changed on purpose, because the founder set a yearly price: `app/src/m79.test.ts` (the prices file and `PRICES` now have `proYearly` 144) and `app/src/plan.test.ts` (Get Pro now shows Yearly first, then Monthly; the no yearly case is still tested with a config that has none).
- Not built: how a student is checked and how an invite is tracked and paid at Dodo, and a yearly product id. Both need the founder's Dodo account.

## (d) Spoken status

With voice on (the Voice group and its Speak tool), one short line out loud for the moments the person picks in Settings, Keys and voice, More, Talking (`speak.status`, none picked as usual): **a fix passed its checks** (the task ended done, its proof passed, not put back), **my AI tool is waiting on me** (Claude Code's waiting hook; today the only tool with one), **a review says not safe yet**, and **say Watch what changed as it draws**.

- Every line goes through the existing spoken replies path (`shell_speech.rs speak`): nothing is said during a call (presentation mode, `quiet()`), while hold to talk listens, or into a Mac whose sound is off; the words show on screen while it speaks (`talk.captions`); Stop everything silences it (`speech_off`).
- `app/src/spokenStatus.ts`: the lines are fixed words (`S.m88.status`), each said once by its key; a moment that goes away can be said again when it comes back. Two new moments at once are both said, in order, as one utterance (a new utterance cuts off the one before). Nothing already on Home is said late: not after Stop everything, not when a moment is newly chosen, not when another project opens, and not on the first look after the page opens (`statusStep`, keyed by the project and the chosen moments). A fix already said by Also say out loud is not said twice.
- **The replay, in time with the voice** (`replayView.tsx`, `spokenReplayTimes`): each beat's sentence is said as its mark draws, and the next beat waits until the words have been said at the voice's speed (never sooner than the drawing alone). The sentence shows under the board while it is said. Never for the still picture. Stop everything (and the hold to talk keys) silences the rest of that run.

## Tests

- `runner/test/m88-numbers.test.ts` (4): jobs and days from the task log (tasks only, every day with a row, older rows and other projects left out), `week.show` carrying them with no words, and the protocol refusing a bad count.
- `runner/test/settings-registry.test.ts`: `numbers.yours` and `speak.status` in the registry.
- `app/src/m88.test.ts` (30): the counts and the JSON (counts and dates only; nothing sent without the presses), the config address; the redaction (keys, paths, the folder, decisions), the task and week receipts, the file (self contained, escaped, palette colours only), the shared fixture; the offers (the file, yearly agrees, student, friend, inviter credit, nothing shown with payments off, F31); spoken status (off as usual, each moment, once, quiet after Stop everything, beats waiting for the voice, the speak path's call and listening checks).
- `app/dom/m88.test.tsx` (3) and `app/dom/m88Off.test.tsx` (1): Your numbers clicked through (nothing asked before the press, the JSON before the draft, only Open a mail draft sends), turned off; Share what my AI did from a task and from This week (the preview first, only Save hands the page over, no decisions).
- Rust: `numbersmail.rs` (4), `receiptfile.rs` (7, with words like "profile: avatar"), `runner.rs` (1: the week fixtures carry jobs and days, and the page's numbers pass the shell's check).

## [verify] on a real Mac

- `open` with the `mailto:` link opens a draft in the person's mail app with the subject and JSON body intact, with and without a To address, and what happens with no mail app set up.
- The receipt's save dialog writes the page, and Safari, Chrome and Firefox open the saved file offline with its picture and no request.
- A spoken status line and its caption while the replay draws; each beat waiting for the Mac's voice at every voice speed (the timing uses the M38 estimate, not the voice's own word timings); silence during a call; Stop everything in the middle of a beat.

## Review fixes (14 Nov)

The preview is the saved file itself; colon words are no longer refused; a refusal has its own words; two moments at once are both said; choosing a moment or opening a project says nothing already on Home; Your numbers says who the numbers go to and shows the range in words; the week file says each count once; the hidden mark comes from strings.ts; Your numbers has a neutral grid mark instead of a tick. Three old expectations changed on purpose: `nextStatus` now returns every new line (`say` is a list), the card says them joined (`sayIt(words, false)`), Save sends the one `html` string the preview shows, and the DOM tests read the preview's words from its frame.

## Shots (fixtures only)

Served from `app/dist` with a stand in for `window.__TAURI__`, shot with Playwright at 2x, wide and tall: Your numbers open; Send these numbers with the exact JSON; Share what my AI did from a task (the preview); from This week; and the saved file itself as a browser opens it (a task with its proof picture, and a week), offline, with no request.
