# F17: Teaching engine, works anywhere, and launch scope (12 Oct 2026)

**Status:** source of truth. It amends F16 (10 Oct) and replaces the launch priorities in F15 (8 Oct). Where this file disagrees with older docs about scope or order, this file wins. All earlier rules and technical decisions (T01 to T15, F01 to F14) still stand unless this file says otherwise.

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
| Sample stuck moment | A guided practice run in the first run so everyone sees the hero in minute one | To build (not started) |

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
