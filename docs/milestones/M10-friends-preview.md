# M10: Friends preview, "stuck? press the key". Plan for approval

**Status:** waiting for the founder's approval. **Written:** 10 Oct 2026, updated the same day to bring all six features from the founder's sheet into M10. **Source:** the founder's feature plan (Companion Feature Plan.xlsx, 10 Oct 2026), the market research (`docs/research/2026-10-10-market-research.md`), the mentor session, and the launch readiness table. **Decision:** the founder chose on 10 Oct 2026 to launch the rescue tutor (hero) with HeyClicky style "show me on screen" features that point at the person's own project, not at generic app buttons. On 10 Oct 2026 the founder asked for Draw it for me, Show me how for builder tools and Prompt help with a visual diff to be built now, not after the beta.

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

## What gets built, in order

| # | Feature | How it works | Time |
|---|---|---|---|
| 1 | **Point at the problem** | A failing check already gives the file, line and error text. The character opens that line in the person's editor (Cursor, VS Code, or the default app), finds it on screen with the Mac's text reader, and circles it with a short caption. Same for the red error in the terminal. For a broken button in the running app: when the app is open on screen, match the button's label from the browser check | About 1 week |
| 2 | **Visual receipt** | After the checks pass: open the app, compare the page before and after to find what changed, circle it, "this works now". Also the shareable "it's live" card | About 4 days |
| 3 | **Your turn mode** | The pointer waits for the person to click the target; a small celebration when they do. Noticing the click needs a system wide mouse click monitor while the pointer is up **[verify on the founder's Mac that macOS asks no permission for mouse clicks]**; if it does, fall back to a "Done" button. Never reads keys (rule 8) | About 4 days |
| 4 | **Draw it for me** | Ask "why did this break?" (typed or spoken). Companion reads the project and the failing check, and the model answers with a small diagram as data (boxes and arrows, at most 6 boxes, for example page → API → database, with the broken link marked), never as free drawing. The overlay draws it in plain shapes beside the problem, with one line under it, then fades after a few seconds or on Esc. Built from the project, so it needs no new screen capture. Pairs with the two line "why" | About 4 days |
| 5 | **Reactions and celebration** | Small reactions while working; a celebration when proof passes or it goes live. Can be switched off (the beta tests fun with it on for half the group) | Part of 6 |
| 6 | **One real character** | Every state (idle, listening, looking, working, needs you, stuck, done, drawing), reduced motion, light on battery. Drawn in code unless the founder brings a designer | About 1 week |
| 6b | **A sample stuck moment in the first run** (added 11 Oct 2026, founder's competitor notes) | A small broken sample app ships with Companion. The first run ends with it: press the key, the ring lands on the cause, your turn, the fix, proof passes, "this works now", a celebration. A person who is not stuck in week one still sees the whole loop. The same app is the demo set for the 30 second video (the founder records it in the hands on session) | 2 days |
| 7 | **Open a Lovable, Bolt or Replit project** | From an exported folder or a GitHub clone; recognise the common stacks | 2 to 3 days |
| 8 | **Show me how, for builder tools** | Walkthroughs only for Lovable, Supabase, Vercel, Claude Code, Cursor and GitHub, driven by the project's real state. Example: the ship gate finds a public Supabase table, so "your table is public, click here to lock it" and the pointer walks the Supabase dashboard step by step (one capture per step while the walkthrough is visibly on, rule 5). Each tool gets a short checked playbook of where things live, so the pointer is not guessing. Companion never logs in, clicks or types for the person in these sites; it only points. An aim test on each tool's real pages, recorded like the earlier one | About 1.5 weeks |
| 9 | **Prompt help with a visual diff** | On the Prompt help hotkey, before you send a prompt in Claude, Lovable, Cursor or Claude Code, the vague parts are underlined right on the text box (for example "make it better", "fix the bug" with no page named), each with the suggested wording; accept all or one by one, then paste back as today. The suggestions use the project memory (stack, page names, house rules). Finding where each word sits on screen uses the Mac's accessibility text ranges **[verify they work in Chrome and the Electron apps; if not, fall back to the diff card we already have]**. Only on the hotkey, never while typing (rule 5) | About 4 days |
| 10 | **"Why did it ignore my rule?"** | Plain words check of the project's rules files (shadowed AGENTS.md, files too long, conflicts) and one tap to make a rule hard | 2 days |
| 11 | **Beta measurement** | Counts only, on the device, shared only if the person agrees: opens without a notification, fixes that passed proof, projects shipped, shares, diagrams opened, walkthroughs finished, prompt suggestions accepted; the fun layer on or off | 2 to 3 days |

**Skipped on purpose:** general app tutorials (Show me how stays limited to the six builder tools), dictation everywhere, proactive popups.

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
