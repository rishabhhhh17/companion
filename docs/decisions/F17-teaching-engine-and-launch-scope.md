# F17: Teaching engine, works anywhere, and launch scope (12 Oct 2026)

**Status:** source of truth (amended by F18 on 17 Oct 2026: home in the notch, the character from anywhere, two key hold to talk, no general assistant features at launch). It amends F16 (10 Oct) and replaces the launch priorities in F15 (8 Oct). Where this file disagrees with older docs about scope or order, this file wins. All earlier rules and technical decisions (T01 to T15, F01 to F14) still stand unless this file says otherwise.

**Suggested record:** save as `docs/decisions/F17-teaching-engine-and-launch-scope.md`, link it from `AGENTS.md`, and mark F15 and F16 as "amended by F17".

---

> **Corrections and cuts of 12 Oct 2026** (by Claude Code on the founder's instruction; the founder's text is otherwise untouched): the status cells in section 3 and the build order in section 6 now match the code; and the founder cut, for the friends preview, "draw or circle to ask" (after the beta), the Supabase lesson pack (added during the beta), the "why did it ignore my rule" check (dropped), and settings guidance beyond Companion's own permissions. See the M10 plan for the estimates and dates.

## 1. What changed since F16

1. **Draw it for me is back in the friends preview.** F16 had it "after beta". The founder wants it now.
2. **A full guided teaching engine is in scope** (HeyClicky style "show me and teach me"), with more on top: proof checks after each step and lessons built from the user's own project.
3. **The engine works on any app on screen**, not only in Claude Code, Cursor and other builder tools. The pitch and the deepest lessons stay in the builder niche.
4. **Item sizes were re-estimated.** The friends preview moves from about 3 to 4 weeks to about 5 to 6 weeks of build time, plus time for character art and the founder's hands on testing.

Everything else in F16 is unchanged: the hero, the fun hypothesis, the beta plan, the rules.

## 2. Hero and positioning (unchanged)

> Stuck while building with AI? Press the key. Your companion finds the problem on your screen, fixes it with you, and shows you why.

* The website and first run sell only the hero.
* "Works on any app on screen" appears in the feature list, never in the headline.
* We do not try to win on breadth against HeyClicky. We win on depth: only we can fix the problem, prove it, and show you why.

## 3. Launch feature list (final for the friends preview)

### 3.1 Hero

| Feature | What it does | Status |
|---|---|---|
| Rescue | Reads the project, names the cause in two sentences | Built |
| Drive | Fixes in small steps, snapshot before each one | Built |
| Fix loop breaker | Stops after three failed tries and changes approach | Built |
| Proof | Build, tests, browser check; never says done without it | Built |
| Explain | Two short lines of "why" after each fix | Built (M8b, PR 14). A defect found 12 Oct (it was asked to "improve the prompt") was fixed the same day (PR 38): 4 of 4 real answers about the work, 5 to 7 s |

### 3.2 Show me and teach me

| Feature | What it does | Status |
|---|---|---|
| Point at the problem | Rings the failing line, terminal error or broken element | Built |
| Visual receipt | After proof passes, rings what changed, says "this works now" | Built |
| Your turn mode | Points, waits for the user's click, then celebrates; "just do it" button always there | Built |
| **Draw it for me** | Hand drawn style sketch explaining why something broke, then fades. The user can also draw or circle something to ask about it (**cut 12 Oct: after the beta**) | **In progress**: about 70% built on the parked branch `m10/draw-it` (data format, checks, layout, drawing, card); the "draw or circle to ask" part moved to after the beta (12 Oct cut) |
| **Walkthrough engine** | Up to 15 steps, click detection, progress log, resume after pauses, proof check after each step, never repeats a step that just failed | To build |
| **Lesson packs** | Ready made lessons as data files: Lovable, Vercel, Supabase first | To build |
| **Settings guidance** | Walks the user to the exact permission, env var or API key | To build |
| **Works on any app** | Pointing, drawing and walkthroughs on any app on screen, best effort | To build (same engine) |
| Sample stuck moment | A guided practice run in the first run so everyone sees the hero in minute one | Built, tested with no model (19 Oct 2026): five practices in one catalog, offered right after Connect in the first run and listed on Learn; real Claude runs of the new four and a person trying them are still owed |

### 3.3 Fun layer

| Feature | Status |
|---|---|
| One real character with all states | Parked, waiting for the founder's designs |
| Reactions and celebration | Built |
| Voice (hold to talk) | Built (on device speech, 0.18 s on a real sentence). Never tried by a person: needs the microphone permission and the model download in the hands on session |
| Dock and cards (Stop, Undo, Receipt) | Built |

### 3.4 Ships quietly

Undo and snapshots, Stop everything, Prompt help, memory and "What I know about you", Where was I, Make it live and rollback, Research, open Lovable, Bolt and Replit projects.

### 3.5 Launch plumbing (needed to launch, not features)

* Signed and notarized installer (M9), blocked on Apple approval
* Updater
* Settings screen
* Privacy page with "delete everything"
* Crash and log export
* Local, opt in beta measurement (events only, never content)
* Website, terms, privacy policy, billing if charging (founder's own list)

## 4. Teaching engine spec

### 4.1 Two modes, one engine

| | Anywhere on screen | Builder tools and the project |
|---|---|---|
| Works on | Any app | Lovable, Vercel, Supabase, then Cursor, Claude Code, GitHub, plus the user's own code |
| Finds the target using | The app's accessibility structure when it exists, otherwise reading the screenshot | The project, the error and the proof run |
| Ring style | Solid ring when confirmed. Soft "I think it's here" ring when it is a guess. The user can correct it | Solid ring |
| Did the step work? | Asks the user ("did that work?") | Checks itself with proof |
| Lessons | Improvised by the model | Authored packs |

### 4.2 Targeting and confidence rule (new)

1. Ring or draw a solid mark only on a target confirmed from the project or the app's accessibility structure.
2. If the target is a guess from the screenshot, use the soft ring and say it is a guess.
3. If confidence is low, do not draw. Say in words where to look and how to find it.
4. Never draw over the wrong app. Drawing is clipped to the window it was confirmed in, and clears if that window changes or loses focus.
5. HeyClicky removed its floating agent cursor on 24 Sep 2026 for drawing over the wrong app. We must avoid the same failure.

### 4.3 Draw it for me

* Hand drawn look, not machine perfect.
* Drawings fade on their own. They stay while the companion is speaking.
* The user can hold a key and draw or circle on screen to ask about something. This reads only mouse position and button state. It never reads keys.
* Drawing is an overlay. It never takes focus or blocks clicks.

### 4.4 Walkthrough engine

* Up to 15 steps per walkthrough, with the goal and progress kept across pauses.
* Click detection moves to the next step. Mouse position and button state only.
* A running progress log of what was done. It never repeats a step that just failed.
* After each step in builder tool lessons, a proof check confirms the real result (the env var exists, the deploy is live, the error is gone). In anywhere mode it asks the user.
* A "just do it" button and a Stop button are always visible. Stop everything covers every walkthrough.
* Lessons are plain data files (step text, target hints, proof check), not code, so new tools can be added without a new release.

### 4.5 Lesson packs

* Friends preview: Lovable and Vercel. **Supabase is added during the beta (cut 12 Oct).**
* During beta: Cursor, Claude Code, GitHub, then Bolt and Replit.
* We do not chase 89 apps. Quality in few tools beats breadth.
* Safety valve: if time runs short, ship the engine with Lovable and Vercel only.

### 4.6 Settings guidance

* **Friends preview (cut 12 Oct): our own permissions only** (Screen Recording, Accessibility, Microphone). The settings beginners get lost in (env vars, API keys, deploy settings) come after.
* Never ask the user to paste a secret into chat. Point them to where it is stored.

## 5. Rules

All of these still apply. Additions are marked **new**.

1. Never watch the screen in the background. Look only when the user presses the key, with the light on before any capture.
2. Never steal keyboard focus.
3. Never write to the user's git history.
4. Ask before anything destructive, anything outside the project folder, and every deploy.
5. Never say done without proof.
6. No flattery and no unprompted suggestions.
7. Never use `bypassPermissions` in the product.
8. No API keys in the repo or in chat.
9. Nothing captured is written to disk. Receipt pictures are of the hidden browser, never the user's screen.
10. Noticing a click or a drawing gesture reads only mouse position and button state. It never reads keys and never asks for an extra permission. **New:** state this explicitly in the wording of rules 1 and 5 in AGENTS.md.
11. **New:** the targeting and confidence rule in section 4.2.
12. **New:** do not claim on the website that "only one provider sees your screen" until it is verified against the code and the actual data flow.

## 6. Build order for the friends preview

1. Docs fix (small change, first): see section 8.
2. Finish M7b and M8b. **Done (both merged before 12 Oct).**
3. Sample stuck moment in the first run.
4. Draw it for me.
5. Walkthrough engine, including anywhere mode and the soft ring.
6. Lesson packs: Lovable, Vercel, Supabase.
7. Settings guidance.
8. Beta measurement, then settings screen with "delete everything".
9. Character art and states (when the founder delivers designs).
10. Voice (if not already built), updater, crash and log export.
11. Signed, notarized installer (M9), with an early spike once Apple approves.
12. Founder's hands on session on a real Mac: Screen Recording, microphone, real Cursor, real Vercel.

**Timeline:** about 5 to 6 weeks of build time, plus a 30% buffer. The hands on session and the character art are the real bottlenecks. Each step gets a plan for the founder to approve before code.

## 7. Beta plan (from F16, plus new metrics)

* About 50 testers for 6 to 8 weeks. Two groups of about 25: character versus plain panel.
* F16 metrics: week 1, 4 and 6 retention, sessions opened by the user, hero uses per week, proof pass rate, Sean Ellis "very disappointed" score (report as a range of about plus or minus 13 points).
* **New metrics:** walkthrough completion rate, step success rate, how often the soft ring was corrected, share of use in anywhere mode versus builder tools.
* Interview questions are unchanged from F16.

## 8. Docs that must change

| File | Change |
|---|---|
| `AGENTS.md` | Replace the product paragraph (it still describes five characters and four general jobs) with the F16 hero and this file. Add the wording from rule 10 to rules 1 and 5. Link F17 |
| F15 and F16 decision records | Mark "amended by F17" |
| M10 plan | Re-list items to match section 3 and section 6. Move only these out of scope: Prompt help visual diff, packs beyond three tools |
| Launch readiness table | Replace the 9 Oct version with a current one. Re-score after the hands on session |
| Milestones doc | Match section 6 |
| Feature plan spreadsheet | Update statuses and When columns |

## 9. Not at launch

Prompt help visual diff, lesson packs beyond three tools, full cast of characters and skins, Windows, phone approvals, onboarding questionnaire, Loop Closer, Pattern Catcher, Recaps, shared memory across models, Tutor mode, Pro path, authored lessons for general apps (Photoshop, Excel). Proactive popups stay skipped.

## 10. Founder's open items

1. **Character designs.** Biggest blocker for the fun layer.
2. **Hands on session** on a real Mac once Claude Code gives the checklist.
3. Decide whether the in memory drive satisfies rule 5 (the T12 decision record).
4. Product name that is not "Companion".
5. Mania link from the mentor.
6. Apple Developer approval, API key in Keychain, Anthropic written reply on plan logins.
7. Confirm the hero wording with the mentor.
8. Recruit about 50 testers.

## 11. Anthropic terms note (unchanged)

Anthropic's docs say Claude Free, Pro and Max subscription logins must not be used in third party apps, including through the Agent SDK. The API key stays the default sign in. Plan login stays behind the remote switch until Anthropic confirms in writing.

## 12. Source for the competitor facts

HeyClicky changelog, https://www.heyclicky.com/changelog (v1.0.21 rings and narration, v1.0.25 drawing, v1.0.26 step by step with click detection, v1.0.28 teaching skills for 89 apps, v1.0.48 walkthroughs up to 15 steps, v1.0.52 floating cursor removed "for now", v1.0.53 progress log). HeyClicky review by The Rundown, https://www.therundown.ai/tools/clicky (pointing can pick the wrong control; screen content goes to several third party providers). Competitor claims should be rechecked before they are used in public.

## 13. Settled in the build: the practice library (19 Oct 2026)

Build details for section 3.2's sample stuck moment, not new founder decisions; the founder can change any of them. Built and
tested with no model (`runner/test/practice-e2e.test.ts`, `app/src/practice.test.ts`, `practice.rs`); no real Claude run of
the new four and no person has tried any of them yet (`docs/milestones/M11-real-run-checklist.md`, "The practice library").

- **One catalog.** `app/sample/practices.json` lists the five practices for the shell, the pages, the engine's tests and the
  rescue eval (it replaces `evals/rescue-projects/practice.json`): order, folder, the failure Find must show, how it is
  fixed and proven, the files its house rule protects, whether it needs Node, its cap, and about how long and how much.
  The words are in `strings.ts` (`S.practices`).
- **Order and titles (the founder approves them, they are product copy):** 1 A Join button that fails (signup), 2 A setting
  only you can add (setting, free, no Claude), 3 A link to a missing page (route), 4 A file that was renamed (import), 5 A
  database table anyone can read (open table). Times and costs are estimates until measured.
- **Each copy** is a new folder in the home folder named after its practice ("Companion practice signup page", a number
  added only when the name is taken, including by the undo history an old copy left), never over anything, never git.
  Into it the shell writes `.companion/rules.txt` with one "never edit" rule per protected file (the check), so a fix
  cannot pass by changing the check (rule 12). Its first line says Companion added it.
- **The fix** is one shipped request (`runner/src/fixfound.ts`, which the coding eval now measures too) as a normal task on
  the record, on a $0.60 cap and the usual model, naming its practice; the engine echoes the practice id on the task's
  checkpoint and receipt, and only that receipt finishes the practice. Done needs the checks to pass and the protected file
  untouched. In a practice copy whose problem was found, Point at the problem's own Fix it on Now starts that same practice
  fix (`practice.ts` `pointFixRoute`), so the two panels never offer two different fixes for one problem. **Founder
  decision owed:** whether Point at the problem's own Fix it should use the same small fix for one located line on a
  person's own project. Built as the setting `point.fixWith` ("Fix it after Point at the problem"), usual value Look deeper
  first (Rescue, as before), the other One small checked fix.
- **The open table** is found by the check before going live (the ship gates, the files only, no database touched), not
  by the key, so Point at the problem still never reports an open table on a person's own project (that would need the
  founder's OK). Its done means the next check shows no open table in the files; the words say the live database is checked
  once it is connected. The database check now says where each open table is made (`ship/rls.ts` `places`).
- **Where it shows.** The practice panel stays on Learn (F18) and now carries the result, Undo, Explain, Show me where and
  Why? Draw it, so nothing points at a card on another tab. **Founder OK owed** for a one line coach strip on Now while a
  practice runs; not built.
- **The list on Learn**, above the lessons: each practice's title, what it teaches, about how long, the cost, Needs Node when
  Node is missing, and a plain state (not started, in progress, done), with Start, Continue, Start over and Remove my copy.
  It never brings Learn forward by itself. Settings keeps Open the practice list and Move all my practice copies to the
  Trash; Delete everything can also move them to the Trash, only when that line is ticked.
- **Kept on this Mac:** `practice.json` in Companion's own folder (the copy's path and the days each practice was started,
  found and done; nothing from its files), checked when read like `keys.json`, removed by Delete everything (T14).
- **Start over and Remove my copy** move a copy to the Trash after a tap (NSFileManager, already in `objc2-foundation`, no
  new dependency), only a copy Companion made and recorded, directly in the home folder, never a link, never one the person
  made with the same name, never the open project while something works on it (a task, a check, or a lesson that is open;
  `practice.ts` `workingOn`). A refused Trash leaves the copy as it is. Start, Continue and Start over also wait while
  something works, since each opens another folder.
  Companion's undo history for a removed copy stays in its own folder until Delete everything: the engine may hold it open,
  and a fresh copy never reuses that name, so it never shows the old history (the build plan said to remove it; this is the
  safer of the two and the confirm says so).
- **The first run** offers the practice right after Connect (minute one), with Pick another and Skip. Taking it ends the first
  run there: the folder, the questions and the key hints are not shown on that path (the practice opens its own folder,
  Back to my project asks for the person's own, the answers stay at their usual values and nothing is added to the profile,
  and permissions are asked when first used anyway). The founder judges this order in the hands on session.
- **After a practice:** Next names the next one not done, and Back to my project returns to the folder used before (else the
  newest folder of the person's own, else the folder chooser).
- **The Vercel lesson** is left out of Learn only in a practice copy, which is never on Vercel; on a person's own project it
  is offered as before (most Vercel projects deploy from GitHub with no vercel.json, so a file check would hide it).
- **Beta numbers** count `practice_started`, `practice_found` and `practice_done`, with no names or paths (off unless the
  person turns them on).
- **Left out:** a failed deploy practice (no real one can be made without a Vercel account and a real failed deploy; a fake
  log would teach a screen that never looks like that), streaks, badges or praise (rule 16), choosing where copies go, and a
  practice before Connect.
