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

### Re-plan of 12 Oct 2026 (after the founder's cuts), and step 0 results

**Done today:** 0a, the fast lane fix (PR 38: Explain 4 of 4 about the work, 5 to 7 s instead of 11 to 37 s; a real diagram request parses 3 of 3). 0b, the web page structure spike (`spikes/ax-web-structure/RESULTS.md`): readable in a Chromium browser without switching anything on, with names and positions for buttons and links; Safari and Arc not measured. 0c, the mouse taking overlay spike (`spikes/draw-overlay/RESULTS.md`): a panel takes a drag and never the keyboard or the front app; the window under a point is found with no permission, which gives the clipping rule for rule 22.

**Cuts from the founder:** no "draw or circle to ask" (after the beta); no Supabase pack (during the beta); no "why did it ignore my rule" check; settings guidance only for Companion's own permissions.

| F17 step | What | Days | Gate |
|---|---|---|---|
| 0 | Fast lane fix and the two spikes | 2 | **done** |
| 3 | Sample stuck moment in the first run (becomes the first lesson when the engine lands: +0.5) | 2.5 | |
| 4 | Draw it for me: the hand drawn style sketch that fades (stays while speaking), on the diagram data path already built; add the route names the model must see | 2.5 | |
| 5 | Walkthrough engine (format and loader 1.5, target finding 3, runner 4, card and overlay 2, harness and real checks 2) | 12.5 | |
| 5b | Anywhere mode (improvised lessons, the soft ring, "did that work?", drawing clipped to its window) | 5 | |
| 6 | Lesson packs: Lovable 5, Vercel 5 | 10 | a founder session per pack |
| 7 | Settings guidance, Companion's own permissions only | 2.5 | |
| 8 | Beta measurement (counts only; adds walkthrough completion, step success, soft ring corrections, anywhere versus builder tools) | 3.5 | |
| | **Remaining for the friends preview** | **39** | about 7.8 weeks |

**The date for the friends preview**
- **Without buffer: about 7 Dec 2026** (39 working days from 13 Oct).
- **With F17's 30 percent buffer: about 23 Dec 2026** (about 51 working days), which is also where the hands on sessions and what they find go.
- Before the cuts it was week of 18 Jan 2027 (4 to 8 Jan with the safety valve). The cuts save 15 days: 4 (draw or circle) + 5 (Supabase) + 2 (rule check) + 3 (settings guidance beyond permissions) + 1 (0b and 0c came in under their 2.5).

### Friends alpha: 10 to 15 people, with what is already built

**What they would get:** the hero loop as it is today. Press the key (Ctrl+Opt+Cmd+F) and Companion finds the failing line and points at it; fix with Drive or Rescue with proof; the before and after picture; your turn and Do it for me; Explain; undo; memory and where you left off; open a Lovable, Bolt or Replit project; Show me how; Prompt help; hold to talk; the plain dot with reactions. **What they would not get:** Draw it for me, the walkthrough engine, lessons, settings guidance, a character, an updater.

**What it needs from me, with days:**

| Need | Why | Days |
|---|---|---|
| A packaged installer (a signed disk image, scripts for signing and notarizing, a short install note) | Friends cannot build from source | 2 |
| Minimal settings screen with **"delete everything"** (and the existing toggles in one place; no hotkey editing yet) | The privacy promise has to be reversible from inside the app | 3 |
| Crash and log export (a plain text bundle with no project content, one button) | To fix what friends hit without screen sharing every time | 2 |
| The sample stuck moment in the first run | Otherwise a friend who is not stuck that week never sees the hero | 2.5 |
| A one page plain privacy note | What is read, when, and what is never stored | 0.5 |
| **Total** | | **10** |
| Updater (optional for 10 to 15: send new builds by hand; needed before the beta) | | +3 |

**What it needs from the founder:** the hands on session first (Screen Recording, microphone and speech download, a real Cursor, `vercel login`), which nothing since 9 Oct has had; an Apple Developer enrolment for a notarized installer (without it, friends must approve the app in System Settings, which works for 10 to 15 people but is friction); and each friend needs their own Claude API key with a little credit (a real cost and a real hurdle: tell them up front). The character is **not** needed: the plain dot works.

**Earliest date: about Wed 4 Nov 2026.** 10 working days of building from 13 Oct (ready about 26 Oct), the founder's hands on session about 27 to 28 Oct, two days to fix what it finds, then the first friends. It moves day for day if the hands on session or the Apple enrolment is later; if Apple's approval is not through, send the un notarized build and say so.

**Can the launch plumbing run in parallel with the engine work? Yes, in two ways.** In calendar time: the founder's gates (Apple, the hands on session) run beside everything and should start now. In build time: installer scripts, crash export and the updater are self contained (scripts, new modules, little shared code) and can be built by separate agents in their own worktrees while I build the engine; the settings screen and the sample stuck moment share the card and the first run with the engine, so I would do those myself. With that split the alpha date holds and the friends preview date does not move; done one after the other instead, the friends preview moves by about 10 days (to about 6 Jan 2027 with buffer). The cost of parallel work is review time: each agent's change gets the same tests and a review pass before it merges.

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
