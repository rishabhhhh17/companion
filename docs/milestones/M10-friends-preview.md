# M10: Friends preview, "stuck? press the key". Plan for approval

**Status:** waiting for the founder's approval. **Written:** 10 Oct 2026. **Source:** the founder's feature plan (Companion Feature Plan.xlsx, 10 Oct 2026), the market research (`docs/research/2026-10-10-market-research.md`), the mentor session, and the launch readiness table. **Decision:** the founder chose on 10 Oct 2026 to launch the rescue tutor (hero) with HeyClicky style "show me on screen" features that point at the person's own project, not at generic app buttons.

## The hero, in one line
"Stuck while building with AI? Press the key. It finds the problem on your screen, fixes it with you, and shows you why."

## What is already built (reused, not rebuilt)
Rescue, Drive, the fix loop breaker, the proof ladder, Explain, undo and snapshots, Prompt help, memory, Where was I, voice (hold to talk), Make it live (stand in only), the dock and cards, and the Show me how engine (one capture with secrets covered, snap to the real element, arrow and ring overlay; 48 of 48 on rendered pages, 41 of 44 on real sites, about 2.6 s).

## What gets built, in order

| # | Feature | How it works | Time |
|---|---|---|---|
| 1 | **Point at the problem** | A failing check already gives the file, line and error text. The character opens that line in the person's editor (Cursor, VS Code, or the default app), finds it on screen with the Mac's text reader, and circles it with a short caption. Same for the red error in the terminal. For a broken button in the running app: when the app is open on screen, match the button's label from the browser check | About 1 week |
| 2 | **Visual receipt** | After the checks pass: open the app, compare the page before and after to find what changed, circle it, "this works now". Also the shareable "it's live" card | About 4 days |
| 3 | **Your turn mode** | The pointer waits for the person to click the target; a small celebration when they do. Noticing the click needs a system wide mouse click monitor while the pointer is up **[verify on the founder's Mac that macOS asks no permission for mouse clicks]**; if it does, fall back to a "Done" button. Never reads keys (rule 8) | About 4 days |
| 4 | **Reactions and celebration** | Small reactions while working; a celebration when proof passes or it goes live. Can be switched off (the beta tests fun with it on for half the group) | Part of 5 |
| 5 | **One real character** | Every state (idle, listening, looking, working, needs you, stuck, done), reduced motion, light on battery. Drawn in code unless the founder brings a designer | About 1 week |
| 6 | **Open a Lovable, Bolt or Replit project** | From an exported folder or a GitHub clone; recognise the common stacks | 2 to 3 days |
| 7 | **"Why did it ignore my rule?"** | Plain words check of the project's rules files (shadowed AGENTS.md, files too long, conflicts) and one tap to make a rule hard | 2 days |
| 8 | **Beta measurement** | Counts only, on the device, shared only if the person agrees: opens without a notification, fixes that passed proof, projects shipped, shares; the fun layer on or off | 2 to 3 days |

**After the beta (as in the founder's sheet):** Draw it for me, Show me how for builder tools, Prompt help with a visual diff.
**Skipped on purpose:** general app tutorials, dictation everywhere, proactive popups.

## How we will know it worked
- Tests first for: finding a file and line on screen from an error, the before and after page diff, the click inside the target, the measurement never holding project text or screen content.
- A real Claude run of the whole loop on broken sample projects (a Vite app, a static page, a Supabase app): stuck → pointed at the right line → fixed → proof passes → receipt circles the change.
- An aim test for "point at the problem" on real editors and terminals, recorded like the earlier one.
- The hands on session with the founder (Screen Recording, microphone, clicks, Vercel), then 5 friends, then the 50 person beta.

## What I need from the founder
1. Say **approved** (or change the list or the order).
2. The hands on session when items 1 to 3 are ready.
3. A name that is not "Companion" before the beta.
4. Optional: a designer for the character art.

## Time
About 3 to 4 weeks of building, plus the sessions with the founder.
