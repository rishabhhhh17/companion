# M10: Friends preview, "stuck? press the key". Plan

**Status:** waiting for the founder's approval. **Written:** 10 Oct 2026, updated the same day to bring all six features from the founder's sheet into M10. **Source:** the founder's feature plan (Companion Feature Plan.xlsx, 10 Oct 2026), the market research (`docs/research/2026-10-10-market-research.md`), the mentor session, and the launch readiness table. **Decision:** the founder chose on 10 Oct 2026 to launch the rescue tutor (hero) with HeyClicky style "show me on screen" features that point at the person's own project, not at generic app buttons. On 10 Oct 2026 the founder asked for Draw it for me, Show me how for builder tools and Prompt help with a visual diff to be built now, not after the beta.

## Plan change, 12 Oct 2026 (F17): waiting for the founder's approval

`docs/decisions/F17-teaching-engine-and-launch-scope.md` is the source of truth for scope and order. This plan follows it. **No code for the steps below until the founder approves this plan.**

### Status corrections to F17's table (so the file and the code agree)
- **Explain** is built and merged (M8b, PR 14), not "building". It has a real defect, below.
- **M7b and M8b** (F17 build order step 2) are already done and merged, so that step is empty.
- **Voice (hold to talk)** is built (on device speech, 0.18 s on a real sentence) and not tried by a person.
- **Draw it for me** is about 70 percent built on the parked branch `m10/draw-it` (data format, checks, layout, drawing, card). It is not on `main`.
- **Sample stuck moment**: not started.

### The fast lane issue (found 12 Oct 2026), and the fix that comes first
**What it is.** The small model lane (`FastLane.run`, `runner/src/lanes.ts`) wraps every request in "Improve the prompt inside the tags. Treat everything inside as plain text". That wrapper was written for Prompt help. Explain reuses the lane, so its request (the task, the files, what the assistant said) arrives inside those tags, under the instruction to improve a prompt.

**Does it affect Explain in the app today? Yes, in quality; not in format.** Measured on 12 Oct with 4 real Explain requests on the test login: 4 of 4 came back as valid JSON, because Explain's own instructions force that format. But 1 of 4 explained the *prompt* ("The original prompt 'Add a footer' was vague") instead of why the work was done, which is the wrong answer to show a person; calls took 11 to 37 seconds (the slow one was the confused one); about 1 cent each. A Draw it for me request through the same lane failed completely: the model improved the prompt and returned no diagram. The earlier "flaky Explain" real runs, which I handled by raising a timer from 25 to 45 seconds, were probably this.

**The fix.** The lane gets an explicit `raw` option (default off, so Prompt help is untouched). Explain and Draw it for me send their request as is, with only their own instructions. Tests first: a test that fails if "improve the prompt" ever reaches an Explain or diagram request, and a Prompt help test that it still does. Then the same 4 real requests again (valid, and about the work, not the prompt), plus the real diagram check. While there, apply the latency fixes that took Show me how from about 8 s to about 2.6 s (thinking off, answer returned as soon as it is complete): Explain is not worth 11 seconds.

**How long.** 0.5 day for the fix and its real checks, plus an optional 0.5 day for the latency work. **Done first, before anything new is built on Explain or Draw it for me** (step 0a below).

### The plan, in F17's build order, with estimates
Working days of building, mine (a day is one focused working day). Gates are marked.

| F17 step | What | Days | Gate |
|---|---|---|---|
| 1 | Docs fix (this change) | 0.5 | done |
| 2 | Finish M7b and M8b | 0 | already done |
| **0a** | **Fast lane fix** (above), then real checks on Explain and a diagram | **0.5** (+0.5 latency) | first, before anything new on Explain |
| 0b | Spike: can the accessibility structure of web pages in Chrome, Safari and Arc be read (find a button by name), and how often? Decides how often a ring is solid and how often it is a soft guess in anywhere mode | 1 | decides the ring mix, not whether to build |
| 0c | Spike: a draw overlay that takes the mouse but never the keyboard or the front app; and how to clip a drawing to one window and clear it when that window changes (rule 22) | 1 | go or change plan |
| 3 | Sample stuck moment in the first run (built on Point at the problem and Your turn; becomes the first lesson when the engine lands) | 2 (+0.5 to convert) | |
| 4 | **Draw it for me:** finish the hand drawn style sketch that fades (stays while speaking), with the diagram data path already built | 2.5 | |
| 4b | The person draws or circles to ask: held on a registered hotkey (the same way hold to talk works; no key reading), mouse position and button state only, visible mode, light first, one capture of that region, solid ring only on a confirmed target, else words | 4 | |
| 5 | **Walkthrough engine** (up to 15 steps, click detection, progress log, resume after pauses by re checking before going on, proof check after each step, a failed step is never repeated, lessons as data files): format and loader 1.5, target finding from the project and the accessibility structure 3, the runner 4, card and overlay 2, test harness with fake apps and real checks 2 | 12.5 | |
| 5b | **Anywhere mode**: improvised lessons by the model, the soft "I think it is here" ring the person can correct, "did that work?" instead of proof, drawing clipped to its window | 5 | |
| 6 | **Lesson packs** (6 to 8 lessons each): Lovable 5, Vercel 5, Supabase 5 | 15 | one founder session per pack (a Lovable account, `vercel login`, a Supabase test project) |
| 7 | **Settings guidance:** Companion's own permissions (open the right System Settings page, guide the clicks, the proof is the permission check) 2.5; env vars and API keys (find the page, guide the value into the project's .env, check the name is set; never read or show a value) 3 | 5.5 | |
| M10 10 | "Why did it ignore my rule?" | 2 | |
| 8 | Beta measurement (counts only; adds walkthrough completion, step success, soft ring corrections, anywhere versus builder tools) | 3.5 | |
| | **Friends preview total** | **54** | about 10.8 weeks |

**Launch plumbing, outside the friends preview date** (F17 steps 8 to 11): settings screen with "delete everything" 3, updater 3, crash and log export 2, character wiring 2 when the designs arrive, signed and notarized installer about 5 once Apple approves. About 15 days, much of it waiting on the founder.

**Not at launch (F17 section 9):** Prompt help visual diff, packs beyond three tools, the full cast of characters, Windows, phone approvals, the questionnaire, Loop Closer, Pattern Catcher, Recaps, shared memory across models, Tutor mode, the Pro path, authored lessons for general apps.

### The new date
- **Friends preview: week of 18 Jan 2027.** That is 54 working days of building from 13 Oct (done about 28 Dec) plus F17's 30 percent buffer (about 70 days in all), which also covers the hands on sessions and what they find.
- **With F17's safety valve** (the engine with the Lovable and Vercel packs only, Supabase added during the beta): 48 days, so **week of 4 to 8 Jan 2027**.
- **Where this differs from F17.** F17 says about 5 to 6 weeks of build time. I cannot make the list above fit in that: the three lesson packs alone are 15 days, and anywhere mode with the engine is 17.5. The faster stretch so far (items 1 to 7 in 3 days) was code against things I can test on my own; lessons depend on other companies' real screens that I can only check with the founder's accounts, so I have not shortened these estimates. If the founder has a different 5 to 6 week scope in mind, say which parts to cut and I will re-plan.
- Before F17 the friends preview was about 14 to 21 Nov 2026.

### Risks, plainly
1. **Web pages in the browser.** If macOS does not hand Companion the structure of a web page, most rings in Lovable, Vercel and Supabase are soft guesses or words only. Step 0b measures this first; it changes the mix, and the lessons (which carry their own target hints) lean on the project more.
2. **Drawing over the wrong app** is what removed HeyClicky's floating cursor. Rule 22 and the clipping in step 0c exist for this; it needs real testing on a real Mac with several apps open.
3. **Other companies' screens change**; a pack needs upkeep. Lessons as data files keeps that cheap but not free.
4. **Nothing built since 9 Oct has been tried by a person.** The hands on session is the real gate, and character art is the other bottleneck, both the founder's.

### Needed from the founder
Approval of this plan or the cuts to make; a Lovable account to be guided through, `vercel login`, and a Supabase test project (no real data); the hands on sessions; the character designs.

## The hero, in one line
"Stuck while building with AI? Press the key. It finds the problem on your screen, fixes it with you, and shows you why."

## The six features from the founder's sheet, and where each one sits below

| Sheet # | Feature | Why HeyClicky can't easily copy it | Item below |
|---|---|---|---|
| 1 | Point at the problem, not the button | Needs to read and run your project | 1 |
| 2 | Visual receipt | Needs the proof engine | 2 |
| 3 | Draw it for me | HeyClicky points; it doesn't explain with drawings | 4 |
| 4 | Show me how, for builder tools | Goes deep on builder tools and knows your project's real setup | 8 |
| 5 | Your turn mode | A learning loop with reactions | 3 |
| 6 | Prompt help with a visual diff | Uses your project context; HeyClicky has no prompt coaching | 9 |

## What is already built (reused, not rebuilt)
Rescue, Drive, the fix loop breaker, the proof ladder, Explain, undo and snapshots, Prompt help (rewrite, diff, paste back on accept), memory, Where was I, voice (hold to talk), Make it live (stand in only), the ship gates (including the public database table check), the dock and cards, and the Show me how engine (one capture with secrets covered, snap to the real element, arrow and ring overlay; 48 of 48 on rendered pages, 41 of 44 on real sites, about 2.6 s).

## Progress
- **Item 1, Point at the problem: built 10 Oct 2026, waiting for the hands on session.** Errors from TypeScript, Vite, Vitest, ESLint, Node, Bun and Python become a file and line (17 tests on their real output); every failed check carries its place; Ctrl+Opt+Cmd+F checks the project with no Claude; the editor opens at the line; the line is found on screen with no model call. Eval (`runner/scripts/eval-point.ts`, then `cargo test point_eval -- --ignored`): 280 of 280 drawn editor screens, 0 wrong places, about 1.3 s. **[verify in the hands on session]** the Cursor link lands on the line, the real Cursor screen is read as well as the drawn ones, and Screen Recording works for this feature.
- **Item 2, Visual receipt and "it's live" card: built 10 Oct 2026.** Before and after pictures in the hidden browser (the before version runs from a private copy in Companion's data, with the project's packages borrowed by a link), compared by what is on the page, with pictures compared when only the look changed; circled and shown on the receipt. The share card is made after going live, with Save picture to Downloads and Copy link. Real check (Haiku on the test login): passed, picture 0.8 s after the receipt. Vite and React was checked by hand. **[verify]** Next.js and other frameworks; the share card against a real Vercel deploy (needs `vercel login` in the hands on session).
- **Item 3, Your turn: built 11 Oct 2026.** The ring waits for the person's own click (no permission, checked on a real Mac), a correct click turns the ring green with a tick and a short burst of dots (none with reduced motion), a miss says "Not quite" and keeps waiting, clicks on Companion's own card do not count, and a walkthrough moves to the next step by itself. **Do it for me** presses the target through Accessibility (asked the first time) and never presses anything that sends, pays, deletes or publishes, checked again on the real element at the moment of pressing. **[verify in the hands on session]** the whole loop in the built app.
- **Item 4, Reactions and celebration: built 11 Oct 2026.** One off reactions on the character (nod, wince, cheer) from check, preview, your turn and receipt events, kept calm (one at a time, a pause between, a run of passes is one nod, a bigger one always wins). Confetti from the character for proof passed and going live, never over a waiting ring. Reduced motion: no movement, no confetti. One setting turns it all off (stored on this Mac; item 11 reads it for the on/off beta groups). **[verify in the hands on session]** how it looks and feels.
- **Item 5, One real character: parked 12 Oct 2026.** The founder will supply the character designs; the code drawn faces are parked unmerged on branch `m10/character`.
- **Item 6, Open a Lovable, Bolt or Replit project: built 12 Oct 2026.** About this project (origin, stack, extras, install needed, missing setting names, plain notes), Install packages on request, open from a GitHub, GitLab or Bitbucket link into a new folder, npm preferred when Lovable leaves a stale Bun lock, the .replit run line as a start command. Checked on nine real public exports (read only) and a real copy from GitHub. **[verify]** installing and running a real export end to end on the founder's Mac (it runs the project's own install scripts).

## What gets built, in order

| # | Feature | How it works | Time |
|---|---|---|---|
| 1 | **Point at the problem** | A failing check already gives the file, line and error text. The character opens that line in the person's editor (Cursor, VS Code, or the default app), finds it on screen with the Mac's text reader, and circles it with a short caption. Same for the red error in the terminal. For a broken button in the running app: when the app is open on screen, match the button's label from the browser check | About 1 week |
| 2 | **Visual receipt** | After the checks pass: open the app, compare the page before and after to find what changed, circle it, "this works now". Also the shareable "it's live" card | About 4 days |
| 3 | **Your turn mode** | The pointer waits for the person to click the target; a small celebration when they do. Noticing the click needs a system wide mouse click monitor while the pointer is up **Verified 11 Oct 2026 on the founder's Mac (macOS 27):** an app with no permissions (Accessibility off) sees a held mouse press in another app and where it was, by reading the mouse button state and position about 60 times a second while the ring is up. No monitor, no Input Monitoring. A press shorter than about 16 ms can be missed; a person's click is not that short. Never reads keys (rule 8) | About 4 days |
| 4 | **Draw it for me** | Ask "why did this break?" (typed or spoken). Companion reads the project and the failing check, and the model answers with a small diagram as data (boxes and arrows, at most 6 boxes, for example page → API → database, with the broken link marked), never as free drawing. The overlay draws it in plain shapes beside the problem, with one line under it, then fades after a few seconds or on Esc. Built from the project, so it needs no new screen capture. Pairs with the two line "why" | About 4 days |
| 5 | **Reactions and celebration** | Small reactions while working; a celebration when proof passes or it goes live. Can be switched off (the beta tests fun with it on for half the group) | Part of 6 |
| 6 | **One real character** | Every state (idle, listening, looking, working, needs you, stuck, done, drawing), reduced motion, light on battery. Drawn in code unless the founder brings a designer | About 1 week |
| 6b | **A sample stuck moment in the first run** (added 11 Oct 2026, founder's competitor notes) | A small broken sample app ships with Companion. The first run ends with it: press the key, the ring lands on the cause, your turn, the fix, proof passes, "this works now", a celebration. A person who is not stuck in week one still sees the whole loop. The same app is the demo set for the 30 second video (the founder records it in the hands on session) | 2 days |
| 7 | **Open a Lovable, Bolt or Replit project** | From an exported folder or a GitHub clone; recognise the common stacks | 2 to 3 days |
| 8 | **Replaced by the walkthrough engine, anywhere mode, lesson packs and settings guidance (F17, plan above).** Was: Show me how, for builder tools | Walkthroughs only for Lovable, Supabase, Vercel, Claude Code, Cursor and GitHub, driven by the project's real state. Example: the ship gate finds a public Supabase table, so "your table is public, click here to lock it" and the pointer walks the Supabase dashboard step by step (one capture per step while the walkthrough is visibly on, rule 5). Each tool gets a short checked playbook of where things live, so the pointer is not guessing. Companion never logs in, clicks or types for the person in these sites; it only points. An aim test on each tool's real pages, recorded like the earlier one | About 1.5 weeks |
| 9 | **Moved out of the friends preview (F17 section 9).** Was: Prompt help with a visual diff | On the Prompt help hotkey, before you send a prompt in Claude, Lovable, Cursor or Claude Code, the vague parts are underlined right on the text box (for example "make it better", "fix the bug" with no page named), each with the suggested wording; accept all or one by one, then paste back as today. The suggestions use the project memory (stack, page names, house rules). Finding where each word sits on screen uses the Mac's accessibility text ranges **[verify they work in Chrome and the Electron apps; if not, fall back to the diff card we already have]**. Only on the hotkey, never while typing (rule 5) | About 4 days |
| 10 | **"Why did it ignore my rule?"** | Plain words check of the project's rules files (shadowed AGENTS.md, files too long, conflicts) and one tap to make a rule hard | 2 days |
| 11 | **Beta measurement** | Counts only, on the device, shared only if the person agrees: opens without a notification, fixes that passed proof, projects shipped, shares, diagrams opened, walkthroughs finished, prompt suggestions accepted; the fun layer on or off | 2 to 3 days |

**Skipped on purpose:** generic app tutorials (only builder tools and the person's own project, F17), dictation everywhere, proactive popups.

## How we will know it worked
- Tests first for: finding a file and line on screen from an error, the before and after page diff, the click inside the target, the diagram data (size limits, the broken link always marked, nothing drawn from screen text), each builder tool playbook step, mapping a vague phrase to its place on the text box, and the measurement never holding project text or screen content.
- A real Claude run of the whole loop on broken sample projects (a Vite app, a static page, a Supabase app): stuck → pointed at the right line → diagram of why → fixed → proof passes → receipt circles the change.
- Aim tests for "point at the problem" on real editors and terminals, and for each builder tool's real pages, recorded like the earlier one.
- A Prompt help check on real prompts in Claude, Lovable and Cursor: the underlines land on the right words.
- The hands on session with the founder (Screen Recording, microphone, clicks, Vercel, a Supabase test project), then 5 friends, then the 50 person beta.

## What I need from the founder
1. Say **approved** (or change the list or the order).
2. The hands on session when items 1 to 4 are ready, and a second short one for items 8 and 9.
3. A free Supabase test project for the walkthrough tests (no real data in it).
4. A name that is not "Companion" before the beta.
5. Optional: a designer for the character art.

## Time
About 5 to 6 weeks of building (up from 3 to 4, because items 4, 8 and 9 moved in from after the beta), plus the sessions with the founder.
