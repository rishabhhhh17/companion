# The third hands on Mac session (plan, 30 Oct 2026, updated 31 Oct for branch m48/launch)

Everything since M29 has passed the automatic tests, but none of it has been seen working on a real Mac yet. This session checks it by eye, one step per message, as sessions 1 and 2 ran. Use a throwaway project folder (a practice project is fine). About 50 minutes. Steps 9, 10 and 14 need a capped test key.

## Before
- Quit and reopen Squibby, so the newest build is running.
- In Settings, Flowflow, check "Tuck into the edge of the screen" is on. An old choice of yours wins over the new default.

## Steps, in order

| # | What to do | What should happen | Built in |
|---|---|---|---|
| 1 | Look at Flowflow on the screen edge for ten seconds | Half tucked into the edge and flattened against it like a drop on glass. Clear water, a soft point that sways, slow waves up its sides | M37, M37d |
| 2 | Move the pointer onto it, then away | It comes out and springs back into shape with a wobble. A few seconds after you leave, it sticks back to the edge | M37d |
| 3 | Drag it into the edge and push, then let go; then drag it to the middle of the screen and let go | Flatter the harder you push, wobbles back. In the middle it stays where you let go. Nothing cuts it off in a box | M37b, M37c, M37d |
| 4 | Sweep the mouse fast across the screen, then stop | The water ring stays on the cursor tip, a little stretch when fast, settles exactly on the tip | M37, M37c |
| 5 | Open Home | Flowflow joins the waterline in a soft curve, not a shape on a line | M37c |
| 6 | Settings, Flowflow page | Silver page, character cards with live water, "Tuck into the edge" row | M34, M35, M37d |
| 7 | Type by voice starts off now (F28). Turn it on in Settings, Keys and voice, and add its key under Other jobs. Then in TextEdit hold that key, say a sentence, let go | Accessibility asked once. Words appear at the cursor. "Typed." at the pointer. Your clipboard is as it was | M36, F28 |
| 8 | The same in a password box (Safari's login page), and in Notes after clicking elsewhere mid sentence | Password box: refused, nothing typed. Clicked elsewhere: "Copied. Press Cmd+V." | M36 |
| 9 | Turn on "Say short answers out loud", ask Show me how something in an app | The ring or arrow draws along with the words, finished by the key part of the line | M38 |
| 10 | On a practice project: Find the problem, Fix, look at the receipt; time it | Broken to proven. Note every wait over five seconds and every word that confused you. This is the launch demo | Magic moment |
| 11 | Press Stop everything halfway through steps 7 and 9 | The words are dropped, nothing is typed; the voice and the drawing stop | Rule 11 |
| 12 | Settings, search "Replay the first run", press Replay | Three screens: hello with Flowflow rising out of the water, Your Claude with the privacy, cost and plan lines, Your project. Back and Skip on each | M49 |
| 13 | On Your project, choose a real project folder of yours that has an install step, and press Check | It says a safety copy is saved first. If packages are missing it asks before installing, with "Don't allow" first. The result is one line; a passing project is never called "proven" | M49 |
| 14 | A Next.js project that uses Google Fonts: Find the problem, then Fix | A "Go online?" card, once for the task. Allow it: the build is checked and the result is proven, not partly proven | Build internet question |
| 15 | Look through Settings, General and Keys and voice | Only four keys set (Fix it, Hold to talk, Prompt help, Stop everything). File conversion, watch routines, Second Look, Draw it and type by voice are off, each with its switch. No Watches fold on Home | F28 launch cut |

## What to tell us after each step
Did it happen? How did it feel: premium, childish, slow, confusing? A screenshot or a short screen recording when something looks wrong.

## Still open after this session
- **Things only the founder can do:**
  - the Apple Developer account (signing, notarizing, auto update)
  - the Google client id
  - the Anthropic message
  - ten real users
- **Battery and GPU use** with the live water on, over an hour.
- **Windows:** before a Windows build, update `zip` (three advisories) through the updater plugin.
