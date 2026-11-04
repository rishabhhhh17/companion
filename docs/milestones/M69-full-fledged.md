# M69, a full fledged product

Status: steps 1 to 3 built (4 Nov 2026). See "Built in step 3" at the end for what the step 3 review fixed, what it did not take and why.

The founder, 4 Nov 2026: "make this a full fledged product, look at everything, understand everything, then make sure this looks very good and very fun to use and easy to understand", and "look at YC companies' products and websites, they're so much better".

The target is the YC benchmark spec and its three mockups, now in the repo at `docs/design/2026-11-04-yc-benchmark/`. Match the mockups closely in both Instrument themes: White (light, `look.theme = paper`) and Graphite (dark). The mockups are light; Graphite gets the same structure with its own tokens. Friendly gets the same layout too (see "Both looks").

## Corrections that win over the spec

1. **F29: Squibby pays and picks the model.** Nobody pastes a key or signs in to an AI provider. The first run is Welcome, then Pick a project (or practice), then the hands on demo. No "Connect Claude" step, no key guide, no "Add your key" in the setup checklist, and no cost in cents anywhere a customer looks (review card, working line, practice lines, first run). The key code stays only as a developer tool (F29 allows it behind a switch), under Settings, Account, Show all options.
2. **Honest words (M57).** Squibby cannot tell another tool's edits from the person's own. Never "Lovable changed 3 files" or "changed by Lovable". Write "3 files changed" or "Changed outside Squibby". "Lovable project" in the top bar is fine only when `project.report.origin` detected it from the folder.
3. **No new default keys.** F28's four stay the only defaults: Fix it (Control Option Command F), Hold to talk (Option Space), Prompt help, Stop everything. The spec's "Press Option Space anywhere" is wrong for us: Option Space is Hold to talk. The top bar and the notch hello show the Fix it key in use (`keys.using.problem`, via `keyHint`), and nothing when it is unbound. Cmd+Enter is never global. The return mark on a page button (Check it again, Fix it) shows only while that page has focus and no text field holds Return. The notch panel never takes the keyboard (rule 9), so its buttons carry no key hints: no "Keep ↵", no "Undo ⌘Z".
4. **Keep it anyway never silences a stop for a key in code or open data.** `runner/src/review/look.ts STOP_KINDS` and `review.ts silenceOffered` stay as they are; a test pins it.
5. **Rule 16.** A productivity tool, never an AI friend. Uppercase eyebrows only as the spec's short status tags (LAST CHECK PASSED, PROVEN, FIX THIS FIRST, THEN, FINE, LAST FIX, SINCE THEN). No praise, no "Welcome back".
6. **Friendly keeps working and looks at least as good.** The new layout and screens apply to both styles. Only colours and the character differ. The founder's own choice today is Friendly + Vivid + Deep, so it is shot next to Instrument at every step.
7. **The Visor keeps the founder's colours** (M68, the blue glass orb). The spec's pearl white orb is not adopted.

## Spec points not adopted, or waiting on the founder

- Retiring Flowflow (spec 2.5, 2.6, 3.9). Flowflow is Friendly's character (F27) and correction 6 keeps it. Under Instrument it already does not show (M68). The Character page keeps Match, Visor, Glass orb, Friendly.
- Black stops being the usual (spec 1.2). Black is the stored default (`protocol/settings.json look.theme`, the founder's 2 Nov pick). Not changed. **Founder question:** keep Black, or follow the Mac with White and Graphite?
- One main key in onboarding copy (spec 3.9). Kept in spirit: onboarding names only the Fix it key in use, never four chords.
- Removing the Fix it confirm step on the review card. The second tap stays (M52); the reassurance line goes under the buttons as well.
- Sound on Proven (spec 4). Already a setting, off by default (M66). No change.
- **Founder question:** what a customer sees before the managed engine is live, since without a key the engine cannot fix anything. Until then the setup checklist says "Squibby is getting ready on this Mac" with Try again, never "Add your key".

## Already built (do not redo)

- **Spec item 1, the Visor:** done in M68. Seven poses (rest, scan, level, amber with lean, red, smile, dark), all places (Home, dock, notch wing and panel, first run, practice), wings at rest and the hello. Left over, folded into item 8: the reverse sweep on Undo, the closed notch's light track with "2 of 4", and the dock badge as count only.
- **Spec item 7, motion:** mostly done in M66. One curve family and the duration tokens (`ui/tokens.css`, `motionTokens.ts`, `motion.rs`), press scale, transform and opacity only (`ui/motionLint.test.ts`), Reduce Motion. Left over: the key style button edge, the chip flip in sync with the smile, the Keep fold, the Undo toast with a time.
- **Spec item 2, Instrument the usual:** done in M65 (`look.style` usual instrument, flat cards, one accent). Left over: the ink opacity steps of spec 1.2 for White and Graphite, and Friendly's leak (whole pages tinted).

## The build list, ranked (spec section 6, corrected)

Each item: what changes, the files, the data and where it comes from, the tests to write first (rule 17). Both looks, both layouts unless said.

### 1. The Visor everywhere. Done (M68). Leftovers in item 8.

### 2. Instrument tokens and no palette leak

- White and Graphite take spec 1.2: one ink at opacity steps (t1 .92, t2 .62, t3 .42, hair .09, hair2 .14), surface, sunken, one accent, status colours only in pills, hairlines and Visor lights. Graphite's ink is the warm off white of spec 1.2. Black and Deep keep theirs.
- Friendly (spec 1.3, corrected): colour changes only the backdrop, the accent, and the character. Cards, words and controls are Instrument's. Learn and practice stop switching palettes in every style.
- Files: `ui/tokens.css` (only place for colours), `ui/look.css`, `lookfeel.ts`.
- Tests first: `instrument.test.ts` and `a11y.test.ts` contrast (4.5 to 1 words, 3 to 1 controls) for the new steps in White and Graphite; a new lint that no rule under `[data-style="friendly"]` or Learn sets a card, text or control colour; `styleLint.test.ts` unchanged.

### 3. Home at rest is never empty (spec 3.1, 3.2)

- **Hero, two tone:** the outcome in t1, the why in t3, same size. "my-shop checked out fine. / Proven 2 hours ago. 3 files changed since." Pill LAST CHECK PASSED, NEEDS A LOOK or NOT CHECKED YET (only a truly new project). Primary "Check it again", secondary "Where was I?". Visor on the right (96 wide, 64 tall). Never "Not checked yet" beside a proven run.
  - Data: `homeHero.ts lastResult` and `homeStatus` (receipt, task log, history), `sinceCheck` from `tasks.list`, the review batch's `count`.
- **Last fix card:** title, one line why, before and after in small browser frames with the project's address, proof ticks, quiet Undo.
  - Data: the newest done task (`m.history`, `TaskSummary`), its receipt words, and its picture. **New:** the before picture. `receipt.visual` today sends one annotated after image; the runner already takes the before shot (`runner/src/proof/before.ts`, `picture.ts`). Add `before?: string` to `ReceiptVisual`, and `picture?: { before?: string; after: string }` to `TaskSummary` so the card works after a restart. Proof pictures of the app being built may be stored with receipts (rule 5). The address comes from the browser check's URL; no picture means no frames, only ticks.
  - Proof ticks from `proof` and the receipt's rungs (`proofChips.ts`).
- **Since then card:** up to three rows, newest first, each with one quiet action.
  - "3 files changed" (or "Changed outside Squibby") from the review batch (`m.review.count`, `review.batch`), action Look.
  - "Not checked yet" from `sinceCheck.changed`, action Check.
  - "Left off: <task>" from Where was I (`where.ready`). **New:** a structured `leftOff?: { label: string; at: string }` on `WhereReady` (runner `wherewasi.ts`, from the last unfinished task, off the record tasks never named), so the page never parses lines.
- **New person:** Last fix becomes the practice offer ("Practice on a sample project. It can't touch anything real. Takes about a minute." / Start practice). Since then becomes the setup checklist (item 10).
- Tall: one column in the same order, a 4 place tab bar (Now, History, Memory, More; More holds Learn and Settings).
- Files: `card.tsx` (hero and the Now section), new `homeRest.tsx` (Last fix, Since then), new pure `homeRest.ts`, `homeHero.ts`, `ui/home.css`, `ui/wide.css`, `strings.ts`, `protocol/index.ts` (+ fixtures), `runner/src/proof/*`, `runner/src/tasklog.ts`, `runner/src/wherewasi.ts`.
- Tests first: `homeRest.test.ts` (hero words and pill for: proven unchanged, proven then changed, failed, review waiting, new project; never NOT CHECKED YET with a proven run; Since then rows, order, cap of three, honest words, no off the record names); protocol fixtures for `before`, `picture` and `leftOff` in both runner and Rust suites; runner tests that the before picture is stored with the receipt and never a screen capture.

### 4. One layout grammar (spec 3, 3.15)

- Top bar: project picker with a status dot, one context line ("Lovable project · ~/Projects/my-shop" only when detected; else the path), the Fix it key hint on the right (correction 3). The footer line ("Checked just now · Undo is ready") moves into that context line in every look.
- Ask box pinned at the bottom in tall and wide. Settings always last in the nav.
- **Example chips:** three, drawn from the project. Data: `project.report.scripts` and `checks` (for example "Build fails"), the last error explained (`error.explained`, words only), the last failed check's label, and the open review ("What is a key?", "Is my site live?"). Never invented text about the project; when nothing is known, no chips.
- More ways to ask opens downward and pushes content, jobs on top, options under a divider. It never covers the ask box or the hero.
- Files: `card.tsx` (bar, askwrap, `details.more`), `ui/home.css`, `ui/wide.css`, new pure `askChips.ts`, `homeLayout.ts`.
- Tests first: `askChips.test.ts` (sources, at most three, no duplicates, review chips only while a review is open, nothing secret: chips pass `copyable`); `homeLayout.test.ts` (ask last, Settings last, foot in the bar in both styles); `hotkeys.test.ts` stays green and a new test that the bar hint follows `keys.using.problem` and hides when unbound.

### 5. Review card rewrite (spec 3.3)

- 3px top border in the severity colour. Pill "FIX THIS FIRST · 1 OF 2". Two tone headline: the problem, then why it matters ("Your payment key is written into the code. / Anyone who sees the code can copy it and spend your money."). Visor 64 at the top right, amber.
- **The pointed line:** a three line excerpt with the file in the header, the line tinted with a left bar and "← Squibby is pointing here".
  - Data, **new:** `ReviewReason.lines?: { n: number; text: string }[]`, built by the runner from the file at review time, through `runner/src/redact.ts`. A key shows only its known prefix and "…" (for example `sk_live_…`), never any of its secret part; a test pins that no secret body reaches the page. "changed 2 min ago" from the batch time.
  - The why sentence: a fixed sentence per reason kind in `strings.ts` (no model).
- Buttons, one shape: Fix it (primary), Copy for my AI, Keep it anyway; "Why does this matter?" as a quiet link. Reassurance under them, per kind, from `strings.ts`. The Fix it confirm step stays.
- The other findings as one line cards with a pill (THEN, FINE) and one action (Look, See). The file list moves behind See.
- The ask box switches to "Ask about this change", with the pointed line as its token.
- Drop the cost line (F29). Words: never "changed by <tool>" (correction 2).
- Files: `reviewCard.tsx`, `review.ts`, `homeHero.ts reviewLead`, `changesCard.tsx`, `ui/parts.css`, `strings.ts`, `protocol/index.ts`, `runner/src/review/look.ts`, `runner/src/review/words.ts`.
- Tests first: `review.test.ts` (pill count, order of findings, why per kind, honest words); runner review tests for `lines` (three lines, clipped, redacted, absent when the file is gone); a test that Keep it anyway on any STOP_KINDS reason never offers or sends silence (correction 4); protocol fixtures.

### 6. Fix it run list and receipt (spec 3.4)

- **Running:** the card becomes a run list, one row per step, verb first, live status right, tabular numbers ("2 of 4" also in the notch).
  - Data: the task's own label for the work row, then `proof.step` rungs (`label`, `status`, `ms`). `homeHero.ts jobLive` and `jobStep` already hold most of it.
- **Proven:** the run list folds into the receipt in place; the old "Checking the work" card is removed when the result arrives. Title, one line why, before and after (item 3's data), ticks with the command and exit code in mono, "Checked 3 pages in 4 seconds" (sum of rung `ms`, pages from the browser rung), Undo, Replay what Squibby did.
  - **Check at build:** whether `proof.step.detail` carries the exit code; if not, add `exit?: number` to `ProofStep`.
- **Failing:** the failing line pointed at first (as item 5), then Try again and Copy for my AI. Name the rung that actually failed (`ProofResult.steps`, the first failed).
- Files: `card.tsx` (receipt section, `JobLive`, `ProofChips`), `jobLive.tsx`, `proofChips.ts`, `failingLine.tsx`, `failwords.ts`, `ui/parts.css`.
- Tests first: a pure `runList.ts` with `runList.test.ts` (rows from events, verb first, counter, one card at a time, the Checking card gone once a result arrives, the failed rung named); `failwords.test.ts` extended.

### 7. Motion and button leftovers (spec 4, 1.6)

- Key style buttons: a 2px darker bottom edge that drops to 1px with translateY(1px) on press; primary gets the faint inset top line.
- The pill flips CHECKING to PROVEN in the same frame as the Visor smile. Keep folds the receipt into the Last fix card. Undo: the Visor's reverse sweep (a new pose in `characters.ts visorPose`, 300 ms), then the toast "Undone. Your files are back to 2:14 pm." (the time from the checkpoint).
- Files: `ui/parts.css`, `ui/tokens.css`, `characters.ts`, `ui/parts.tsx`, `strings.ts`.
- Tests first: `motionLint.test.ts` covers the new rules; `visor.test.ts` for the rewind pose; reduced motion stops it.

### 8. Notch and dock (spec 3.13, 3.14)

- Closed and working: the Visor's band plus a light track that sweeps, and "2 of 4" (`islandWings`, `home.ts`).
- Proven: the panel drops as a mini receipt: the Visor smiling, title, "Checked in a browser · 4 s", the after picture, Keep (primary), Undo, See proof. No key hints (correction 3). Folds back after 6 s or on Keep.
- Needs you: amber lights, the question and Allow / Don't allow at full contrast (as M23 allows answering there).
- Drop "not checked yet" while a review waits. The dock badge is amber, count only.
- Files: `island.tsx`, `islandPanel.tsx`, `islandPanel.ts`, `home.ts`, `dock.tsx`, `dockStates.ts`, `ui/chrome.css`, `ui/notch.css`.
- Tests first: `islandPanel.test.ts` (mini receipt contents, no key hints, fold time, never over another app's question), `island.test.ts` (the counter), `dockStates.test.ts`.

### 9. First run with content (spec 3.10, corrected by F29)

- Two counted steps: **01 Welcome**, **02 Pick a project** (Willow's chips). Then the hands on demo (the practice), and the notch hello as the last beat.
- Welcome: "Stuck while building with AI? Press the key." with the Fix it key in use, three promise ticks ("Nothing changes without your OK", "Every change can be undone", "Squibby only looks when you press the key. Nothing is saved."), and on the right a 10 second loop of the real flow with a visible Pause. The loop is drawn from the app's own parts, not a video.
- Pick a project: recent folders, "Open a Lovable, Bolt or Replit project", "Practice on a sample project first".
- "Replay the welcome tour" in Settings, General.
- Files: `onboarding.ts` (`STEPS` lose `claude`), `onboarding.tsx`, `firstLook.tsx`, `firstRunAgain.ts`, `notchHello.ts`, `strings.ts`.
- Tests first: `onboarding.test.ts` (steps and counts, no key step, no cost words, practice reachable from both steps, Pause present while the loop plays), `firstRunAgain.test.ts`.

### 10. Copy pass, approvals and the setup checklist (spec 5, 3.11, 3.12)

- Every row of spec 5, corrected: no cost lines, no "Get Claude" or "Add your key", honest change words.
- Approval: "Squibby needs your OK to add a tool.", one sentence of why (the request's `title`, as `approvals.ts` already does), the command behind "Show the command", Allow and Don't allow, "You can undo this." only when `undoable`.
- Setup checklist: one numbered list instead of stacked messages, done steps ticked, the current one open with one button. Steps: Getting ready on this Mac (`blockerOf` engine and Claude Code states), Pick a project, Try the practice. No key step (correction 1).
- Files: `strings.ts`, `approvals.ts`, `card.tsx` approvals block, `homeHero.ts blockerOf`, new pure `setupList.ts`.
- Tests first: `writing.test.ts` grows bans: no "changed by", no "cents", no "your key" in customer strings, no em dashes; `approvals.test.ts`; `setupList.test.ts`.

### 11. Settings trim and finish (spec 3.9)

- About five rows per page; the rest under "Show all options" with no count. Plain label, one line, control on the right. Every behaviour keeps its control (customizable everything).
- About shows the real version and channel from `updates.ts`. Empty groups are hidden. "Second Look" becomes "Check another AI's answer" in user words (the setting key stays). Search ranks title matches first.
- Account: the key moves under Show all options as a developer tool (correction 1).
- Files: `settingsPages.ts`, `settingsPage.tsx`, `settingsSearch.ts`, `strings.ts`.
- Tests first: `settingsPages.test.ts` (rows per page, no counts, no empty group), `settingsSearch.test.ts` (title first), `settings.test.ts` and runner `settings-registry.test.ts` stay green.

### 12. History, Memory and Learn (spec 3.6 to 3.8)

- History: grouped by day, one row per fix with a 48 point before and after thumbnail when proven (item 3's `picture`), pills (PROVEN, UNDONE, COPIED FOR AI), the time right, one action. The Undo order note becomes one caption at the top. Empty: the Visor, "Nothing here yet. Your first fix will show up here with its proof.", Start practice.
- Memory: "About my-shop" and "About you"; each line with its source in t3 (`MemoryLine.source`, `date`); Edit and Forget; "Erase my-shop notes", "Erase notes about you". Empty: one greyed example line with its source.
- Learn: a course path, the first practice open (Find it, Fix it, Prove it), the rest as Next. "Lessons appear when Squibby spots something in your project." Same palette as every page.
- Files: `card.tsx` (`HistoryPanel`, `MemoryList`, the Learn place's lesson list), `history.ts`, `practicePanel.tsx`, `practice.ts`, `strings.ts`.
- Tests first: `history.test.ts` (day groups, pills, caption), `memory.test.ts` (named erase buttons), `lessons.test.ts`.

## Both looks

| Part | Instrument (White, Graphite) | Friendly (Vivid + Deep and others) |
|---|---|---|
| Layout, cards, words, buttons | as the mockups | the same |
| Backdrop | flat page | Friendly's wash |
| Accent | the blue | Friendly's accent |
| Character | the Visor | the friendly character (or what Character says) |

## Shots to compare with the mockups

Built to `scratchpad/m69-dist`, served on 127.0.0.1:5460 with the `window.__TAURI__` stub, Playwright at 2x into `scratchpad/m69-shots/`. For each: White, Graphite, Friendly + Vivid + Deep; wide and tall.

- Home at rest next to `mock-home-rest.png`; new person; review next to `mock-home-review.png`; run list, receipt, failing.
- Notch working and proven, dock states next to `mock-visor-notch.png`.
- First run, setup checklist, approval, History, Memory, Learn, Settings, More ways to ask open.

## Order of work

Items 2, 4 and 3 first (the frame every screen sits in), then 5 and 6, then 8, 9, 10, 7, 11, 12. After each: `cd app && bun run test` and `bun run typecheck`; runner tests touched plus protocol and settings registry; Rust tests if `app/src-tauri` changed. `CHANGELOG.md` in plain words when a person would notice.

## Built in step 3 (the fix pass, 4 Nov 2026)

Built:
- [x] Item 5, the pointed line: `ReviewReason.lines` and `ReviewKeyPlace.lines` (protocol, fixtures `erv10b`), made by `runner/src/review/excerpt.ts` (a key keeps only its prefix, a private key is hidden whole, clipped, checked again) and masked again on the page (`review.ts codeLinesOf`). One drawing for the review card and the failing lead (`codePoint.tsx`); the label moves into the header where the card is narrow.
- [x] Item 5, words: "A secret password (for your payments) is written into the code"; Why does this matter? says why first; NEXT and OK tags; Show and Hide; the checks line in plain words; "Your Fix it shortcut".
- [x] Item 5, the key warning has Fix it, Copy for my AI and Keep it anyway before any review (`review.ts fixAfter`: the review runs, then Fix it's own question). STOP_KINDS untouched; Keep it anyway never silences.
- [x] Item 3, Last fix: outcome title (`homeRest.ts outcomeTitle`), the receipt's first sentence as the why, the before and after pair (`receipt.visual.before`, fixture `e53b`, runner `agent.ts`), the checks that passed; Since then folds away when empty; "Changed since the last check" is no longer a row (the hero's Check it again says it).
- [x] Item 6: the run list lists all four steps from the start; "Changing the code" first; the safety copy line under the title. The proven and failed result heroes (`homeRest.ts resultHero`) at hero size; Keep (`ui.resultKept`), Undo and Replay lead a proven receipt; the failing lead has Try a different fix, Copy for my AI and Undo this change; one Undo button id. The runner marks a change in green.
- [x] Item 10: an approval's question is the page title, Stop moves to the bar; the setup step says the reason; Working while parts download. Memory's erase buttons are buttons; "Stop sharing these notes with my other AI tools". Where was I's source line.
- [x] Item 11: About shows "Squibby 0.9.2" and the channel; the updates line says the daily check starts once updates are set up; Save a log for support is its own row.
- [x] Item 4: the bar's context line drops the check time while the hero says it, and in tall keeps one thing. Buttons in a row are one height (look.css). No fade over work in any look.
- [x] Item 8: the notch's Keep is the accent and its title is the outcome.
- [x] Friendly: no wave band, accent main buttons and send arrow in Home.

Not taken, and why:
- The pearl white Visor and removing its coloured ring: the founder picked the blue glass orb with its ring (M68, correction 7).
- Flowflow replaced by the Visor in Friendly (`lookfeel.ts characterOf`): correction 6 keeps Friendly's own character; only colours and the character differ.
- Key hints on the notch's buttons (Keep ↵, Undo ⌘Z): the notch never takes the keyboard (rule 9, correction 3).
- "⌥ Space anywhere" in the bar: Option Space is Hold to talk; the bar shows the Fix it key (correction 3).
- "Lovable changed 4 files": honest words (correction 2).
- Allow as the primary button on an approval: M45 keeps Allow and Don't allow of equal weight, Don't allow first.
- Removing the top row of the notch shots: it is the notch itself (its wings beside the camera), not a second receipt row.
- Cropping the notch thumbnail to the change: the page does not know where the change is in the picture (only how many). Left for when `receipt.visual` carries the boxes.
- Friendly's navy cards and Learn's violet practice card: theme surfaces (Deep) and the Learn room; not changed in this pass.
