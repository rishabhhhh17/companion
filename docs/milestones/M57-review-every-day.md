# M57: review every change, every day (plan, 4 Nov 2026)

Decisions: F30 (a companion to every AI coding tool), F29 (Squibby pays and picks the model). Builds on M52 (`docs/milestones/M52-review-every-change.md`). The founder said "build" on 4 Nov 2026 after the demand report. That report says the one gap nobody fills is a plain words review of what changed, with proof and undo, for a non engineer whose project matters. It also says the review stays on Ask by default, and that the cost of a review is not measured yet.

Scope, from the roadmap of 4 Nov: must fix 8 and 27, features 1 to 7, UI 12. Must fix 25 and 26 were done in M56 (`sendback.ts` quotes every line from the change; review snapshots keep a salted hash of `.env`, never a copy). Must fix 18, the first real run of the review's words, is not in this plan: it spends money and waits for the founder's go.

## Rules this plan keeps (the skeptic's corrections)

- **Honest words.** Squibby cannot tell another tool's edits from the person's own. Cards say "the other tool" or "changed", never "your AI did" or "your AI fixed". This also fixes two lines already shipped:
  - `strings.ts` `heroLine` ("from your AI tool") becomes "Changed since your last check: 12 files."
  - The `review.mode` label "Review changes your AI makes" becomes "Review changes to your project".
- **The watcher is proven before features lean on it** (rule 18). Step 1 below comes first. Features 4, 5 and 6 react to the watcher's batches, so they wait for it.
- **Ask stays the usual** for `review.mode`. Nothing here makes a review run by itself.
- **The instant key warning is its own setting.** It changes M52's "nothing runs until asked", so it is a separate switch with a plain help line, and it starts off until the founder says yes.
- **Strictness never silences a Stop** for a key in code or data open to everyone, and "Don't flag this kind here again" is never offered on those.
- **No real model spending.** Anything that needs a model is built and tested with stand ins and listed below as waiting.
- **No cost claims.** No line says "Squibby pays" or "costs nothing under F29". Every model call counts against the day's limit, as it does today (`spending.ts`). Who pays follows the engine decision, not this milestone.
- **Beta numbers stay opt in.** The new counts join the existing counters behind `numbers.on` (off by default), never words or paths.

## Steps, in order

### 1. Prove the watcher on this Mac (rule 18, before features 4 to 6)
A scripted check in `spikes/` on a real Mac, with no model:
- many small saves with short gaps;
- save by writing a new file and renaming it over the old one, as editors do;
- one burst that rewrites 1000 files or more;
- a long pause between saves, longer than the quiet time;
- the folder closed and reopened.

It records whether every path arrives and how long a batch takes. The results go in `docs/research/technical_research.md` and M52's [verify] list. Runs with the real tools (Claude Code, Codex, Cursor) need the founder's hands and stay [verify] until then.

### 2. Must fix 27: snapshots stop rereading the whole project
`checkpoints.ts` `snapshotNow` starts each snapshot from a fresh temporary index (`stage` runs `read-tree`), so git reads and hashes every file again. The "changed since" ask already keeps its own index (`index-since`).
- Keep one snapshot index per project and copy it as the starting index.
- Turn on `core.untrackedCache` in the shadow store's own config.
- When nothing changed, give back the previous version instead of making a new one.
- Tests first: a second unchanged snapshot makes no new ref; a changed file after a reused index is still caught; Undo to a reused version still works.

### 3. Must fix 8: changes made while Squibby was closed
`service.ts` `startWatching` takes a fresh starting point (`LABEL_START`) each time, so an evening of edits disappears into it.
- Before that, find the project's newest earlier version in the shadow store and compare it with the new one.
- If files differ, show them as one Ask first batch called "Changed while Squibby was closed". No automatic run, no scripts.
- Tests first: a program test like the scratch run (a key written while closed is in that batch, not "Nothing has changed"); no earlier version means no batch; the person's `.git` is unchanged.
- This does not need the watcher, so it can go before step 1 ends.

### 4. Feature 1: review history and beta numbers
- Every closed review becomes one row in the task log: when, project, files (names only), rating, what it touches, checks, what the person did, and the summary with secrets already hidden. No file text.
- History shows these rows with their own mark.
- A retention limit: `review.keepDays` (usual 90). Delete everything also removes them.
- New opt in counters in `metrics.ts`: batches, reviews run, each rating, Fix it, Send back, Looks fine, Where was I opened, and the day's limit reached.

### 5. Feature 2: a security look a beginner understands
- Reuse Ship's checks on the changed files only: tables without row level security in migrations (`ship/rls.ts` `analyzeMigrations`) and keys that would reach the browser (`ship/scan.ts` `scanFiles`).
- A hit is a Stop that names the file and line, in plain words ("this table can be read by anyone").
- Reading the live database stays on the person's press, as today. No model.
- Not here: "a page that should need a sign in does not". That is a research problem, not a week.

### 6. Feature 7: how strict
- New setting `review.strictness`: Quiet (only Stop), Normal (usual), Careful (every worth a look shown).
- On a worth a look, "Don't flag this kind here again" saves a line in What I remember with its source. It can be forgotten.
- Never offered on, and never hides, a Stop for a key in code or open data.

### 7. Feature 3: house rules and the project's rule files
- Path rules from `.companion/rules.txt` (`rules.ts`) are checked in code against every changed file. "Never edit X" matched is a Stop that quotes the rule. "Ask before editing X" matched is a worth a look.
- `AGENTS.md`, `CLAUDE.md` and Cursor rule files go to the review's model as quoted data, never as instructions, and the card lists which ones it used. Built and tested with a stand in model only.

### 8. Feature 4: a review that stays current (after step 1)
- When the next batch is reviewed, each open reason is checked again by the rules, with no model.
- A reason that no longer holds is marked "Changed since, this no longer applies". A card with nothing left closes and shows the newer review.
- Automatic waits longer by default: new setting `review.autoQuietSeconds` (usual 60), until a done signal from the other tool exists.

### 9. Feature 5: the instant key warning (after step 1, off until the founder's yes)
- New switch `review.keyWarning`, usual off. Help line: "When a change adds what looks like a key to the code, say so straight away, before you ask for a review. Only that one check runs, on this Mac, with no model."
- When a batch is ready, only the key rule (`rate.ts` `secretsInCode`) runs on the added lines, and the batch event carries the result.
- The card and the existing dot say "A key was written into the code", with Fix this first. No sound, no focus change (rules 9 and 12).
- A sentence on the notch at rest goes past F28's bare notch, so that part is the founder's call too.

### 10. Feature 6: Where was I knows what changed (after step 1)
- `wherewasi.ts` gains the review state: "Since then: 12 files changed. Not reviewed yet." and "Not finished: a review says Fix this first: <reason>". The next step is Review the changes.
- Covers changes made while closed once step 3 is in.
- Written by code, shown on opening after a break, never pushed. No guilt words.

### 11. UI 12: the review setting where people look
- A "Reviews of changes to your project" group on the Fixing page (`settingsPages.ts`): `review.mode` in view; the quiet times, strictness, key warning and keep days under its More. They leave `more.general.watch`.
- Search words: Cursor, Codex, Claude Code, CodeRabbit.

## Settings and events
- New settings: `review.strictness`, `review.keyWarning`, `review.keepDays`, `review.autoQuietSeconds`. Each goes in `protocol/settings.json`, `strings.ts`, `settingsPages.ts` and `runner/test/settings-registry.test.ts`.
- Event changes in `protocol/`, with fixtures both sides parse:
  - `review.batch` gains the key warning result and a "changed while closed" mark;
  - a new event for reasons that no longer hold after a recheck;
  - `where.ready` gains the review lines.

## Tests first (rule 17)
Snapshot reuse and no new ref (27); the while closed batch (8); history rows never holding file text, and the retention limit; open data and browser keys rated Stop from changed files only; strictness never hiding a key or open data Stop; path rule matches; rule files quoted as data; rechecks closing only what no longer holds; the key warning running nothing but the key rule, and nothing at all while its switch is off; Where was I lines with no "your AI".

## Waiting for the founder
- The key warning's usual value and any notch sentence (F28).
- The real run of the review's words (must fix 18), including the rule files input. Until then the cost per review is unmeasured, and Automatic is not promoted anywhere.
- Real tool runs of the watcher (Claude Code, Codex, Cursor) in a hands on session.

## Docs to keep true
Product doc section 10 gets rows for the folder watch and the "while closed" comparison. M52's [verify] list and `technical_research.md` get step 1's results. `CHANGELOG.md` in plain words.

## Size
Very large: six medium items and five small ones. Each step is tested and can stop on its own.

## Status, 4 Nov 2026 (step 2 of the build)
- Built and tested with stand ins, no model run: feature 2 (security look, `runner/src/review/look.ts` `openDataItems` and `keysInPage`, reusing `ship/rls.ts` and `ship/scan.ts`), feature 3 (house rules in code, `houseRuleReasons`; notes for AI tools read by `ruleFilesOf` and quoted to the words as data, listed on the card as `ruleFiles`), feature 4 (rechecks with no model, the `review.recheck` event, `review.autoQuietSeconds` usual 60) and feature 7 (`review.strictness`, the shared `REVIEW_SILENCE_LINES` saved through `memory.add`).
- Tests: `runner/test/review-look.test.ts`, `runner/test/review-every-day.test.ts`, new cases in `runner/test/protocol.test.ts`, `runner/test/settings-registry.test.ts` and `app/src/review.test.ts`; the Rust fixture test knows `review.recheck`.
- A recheck runs when a newer batch is reviewed, as planned. In Ask mode that is when the person asks for the newer review; nothing is read before that.
- Still waiting: the real run of the review's words with the notes as input (must fix 18), so whether a real model keeps to "data, never instructions" is not proven yet.

## Status, 4 Nov 2026 (step 3 of the build)
- Built and tested with stand ins, no model run: feature 1 (one row per review that ran in the task log, `tasklog.ts` `addReview`, names of files only and the summary with secrets hidden; what was done with it: `looks_fine`, `sent_back`, `fix`, `no_longer_applies`; `review.keepDays`, a choice of 30, 90, 180 or 365 days, usual 90; the rows live in `tasks.db`, so Delete everything removes them; History draws them as their own list with a Review mark; new opt in counters in `metrics.ts`), feature 5 (the instant key warning, `service.ts` `keyPlaces`: only `secretsInCode` on the added lines when a batch is said; `review.batch` carries `keys`, file and line only; the card, Home's top and the notch's quiet line say "A change wrote what looks like a key into the code" as Fix this first; the shell passes only a count to the island), feature 6 (`wherewasi.ts` review lines from `ReviewService.stateFor`, next step `review`) and UI 12 (a Reviews of changes group leads the Fixing page; quiet times, strictness, key warning and keep days under its More; search words Cursor, Codex, Claude Code, CodeRabbit).
- Protocol: `review.dismiss` gains `how` (looksFine or sentBack), `tasks.list` gains `reviews`, `review.batch` gains `keys`, `where.ready`'s next gains `review`. Fixture lines rv3b, erv10, erv11 and ew8; the Rust island test reads erv10.
- `review.keyWarning` was first shipped **on** by usual. The review of 4 Nov turned it back to the plan: **off** until the founder says yes (see the fix step below).
- The keep days setting is a choice in days rather than a number, so no new unit was needed in the registry.
- Still waiting: the founder's word on the key warning's usual value and the notch line (F28); the real run of the review's words (must fix 18).

## Status, 4 Nov 2026 (step 5 of the build, fixes after the review)
Each fix has a test that failed first. Built and tested with stand ins, no model run.
- **Must fix 8, the batch from while closed:** built. It is frozen from the start (`service.ts` `announce`, `away`), so a later save never grows it, never drops its mark and never makes it run by itself. The later save waits and is its own batch once the card is closed. Review now on it runs the project's checks only when the person asks (`proof`), even in Automatic. Tests: `runner/test/review-closed.test.ts`. Trade off, on purpose: in Automatic, newer changes wait until the card from while closed is closed.
- **Feature 7, who can silence a kind:** built. A silence line counts only when the person pressed for it, as recorded in the engine's own data folder (`runner/src/review/silence.ts`, `review-silenced.json`, in Delete everything's memory group). Hand written lines in `.companion/project.md` silence nothing; forgetting, editing or erasing the line ends it. Tests: `runner/test/review-silence.test.ts`, including one through the real engine program.
- **Feature 7, Quiet:** built. A changed settings or key file and data every signed in account can read are shown at every strictness (`look.ts` `applyStrictness`). Tests: `runner/test/review-look.test.ts`.
- **Honest words in the model's answer:** built. `words.ts` no longer tells the model an AI made the change; it says nobody can know who did. `noCredit` takes out any sentence that says an AI or a named tool made, fixed or broke something, from the summary, the notes and the concern. Tests: `runner/test/review-honest-words.test.ts`. [verify] with the real run of the words (must fix 18): whether a real model still writes such sentences, and how often the filter has to act.
- **Feature 5, key warning:** back to the plan. `review.keyWarning` usual **off**, and the engine runs it only when it is exactly on. Help line, `docs/alpha/PRIVACY.md` and the launch privacy policy say it is off unless turned on. Waiting for the founder's yes.
- **Step 1, the watcher:** the two missing cases are built and pass on this Mac: a pause longer than the quiet time (two batches, each with its own file) and the folder closed and opened again (the first save after opening arrives). A new case drives `ReviewService` with the real `CheckpointStore` and the real folder events: a real batch reaches the snapshot diff, and after a reopen the while closed batch and the next save are both found. The checks live in `runner/test/review-watcher-real.test.ts`, not `spikes/`, so they run with the suite every time on a Mac. [verify] real Claude Code, Codex and Cursor in a hands on session. Seen once while other work loaded this Mac: the older timing cases (50 rewrites, processor time) took minutes and failed, then passed when run again; their timing is sensitive to a busy or sleeping Mac.
