# Where we stand, 16 Oct 2026

## 1. How much of the hero product is built

Hero: *Stuck while building with AI? Press the key. It finds the problem on your screen, fixes it with you, and shows you why.*

| Part of the hero | State | Proven how |
|---|---|---|
| Press the key, find the problem | Built | Tests, 15 rescue project eval |
| Fix it in small steps with undo | Built | Tests, real Claude checks on the test login |
| Prove it (checks, browser check) | Built | Tests |
| Show you why (Explain) | Built | Tests |
| Point and draw on the screen | Built | Tests only. Never seen on a real screen. |
| Teach step by step (walkthroughs, 12 draft lessons) | Built | Tests only. Lessons are not tried on the real apps. |
| Key kept safe (Keychain narrowed) | Built | Tests. Real Mac check still open. |
| Settings, updater, Delete everything, log export, installer | Built | Tests, headless build |
| Character | A plain orange dot | Waiting for designs |
| Signed, notarized installer | Not possible yet | Apple approval |

Honest score: the engine is about 90 percent built and tested by machine. The part a customer actually sees and feels (the look, the character, the screen drawing on a real Mac) is proven by tests only, so I count it as roughly 50 percent until your hands-on session.

## 2. What I need from you (in this order)

1. **A one hour hands-on session** on your Mac. This turns "tests pass" into "it works". I run it one step per message and record the answers.
2. **Character direction** (see section 5). You supply the art; I wire it in.
3. **Apple Developer approval**, then I can sign and notarize.
4. **Anthropic**: Commercial Terms, and the written reply on plan login.
5. **Update key and a public releases repo** (turns the updater on).
6. **Product name**, privacy policy, terms, billing.
7. Review of the INSTALL.md and PRIVACY.md drafts.

## 3. HeyClicky vs us

| | HeyClicky | Us |
|---|---|---|
| Rings, narration, drawing | Yes | Yes, with a confidence rule and clipped to the right window |
| Step by step with click detection | Yes | Yes |
| 15 step walkthroughs, progress log | Yes | Yes |
| Teaching skills | 89 apps, breadth | 12 draft lessons, depth |
| Find the problem in your project and fix it | No | Yes |
| Snapshots, Undo, Receipt, proof it works | No | Yes |
| Stop everything key | Not known | Yes |
| Bring your own Claude key | Not known | Yes |

Facts about HeyClicky come from the F17 notes. Recheck before saying them in public.

## 4. Coucou and its Mochi (checked 16 Oct from its GitHub page)

Coucou is an open source app (MIT code) that lives in the Mac notch and watches AI coding agents (Claude Code, Codex, Cursor and more). It shows live steps and diffs, lets you approve or deny agent requests from the notch or an iPhone lock screen, has voice dictation, usage pills and a weekly recap. **Mochi** is its animated mascot: it follows the cursor, reacts to agent events, has outfits and sounds, and can leave the notch to live on the desktop.

| | Coucou | Us |
|---|---|---|
| Watches your agents and asks approval | Yes, its main job | Yes (approval cards) |
| Fixes the problem and proves it | No | Yes |
| Teaches you step by step | No | Yes |
| Character with personality | Mochi, strong | Not yet |
| Phone approvals | Yes (iPhone, Android) | No, later |
| Voice dictation into any app | Yes | Prompt help, hold to talk |
| Audience | People who already run agents | People who get stuck |

What to take from it:
- **Do copy the idea:** a character that reacts to what is happening, outfits, a desktop mode. That is what makes people attach.
- **Do not copy the art.** The code is MIT, but Coucou says the name, Mochi, icon and sounds are separately copyrighted. Code ideas are fine to learn from; characters and sounds are not ours to use.
- **Their weakness is our hero:** they watch, we rescue.

## 5. Your water elementals idea

I understand it and I like it. It fits the product.
- **Why it works:** water is "fluid like code". A fish that swims through your folders, follows the flow, and gets cleaner water as the project gets healthier is a natural picture for "finds the problem, fixes it, shows why".
- **Elementals as a ladder:** water first (rescue and teach), then later elements that each unlock a power (for example fire for deploys, earth for tests, air for research). That gives a reason to come back and a clean way to sell new features.
- **Choose a fish:** a pick-your-companion step in the first run, each with a different voice and way of explaining. Fits "selecting your character".
- **Rules to keep:** AGENTS.md says productivity tool, never an AI friend, no affection or streaks. So the fish reacts to the work (clear water when checks pass, murky when they fail), not to your feelings.
- **Risks:** more characters means more art and animation cost. Start with one water creature and four states (idle, working, stuck, done) before a cast.
- **My recommendation:** ship the first friends preview with ONE water creature. Add "choose your fish" only after you see which one testers keep.

I will not draw the character (your standing rule). Tell me the name, the look and the states you want, and I will write the character brief and wire the art in.

## 6. First draft: a Home screen with everything in one place

Today everything lives in one long card. A Home screen would give one place for it all. Basic draft, for you to change:

```
+--------------------------------------------------+
| (fish)  Companion                 [Stop all] [?] |
+--------------------------------------------------+
| STUCK? press  Option+Space      [ Find my problem ]
+--------------------------------------------------+
| Now          | What I did          | Learn       |
| (current     | (recent tasks with  | (lessons    |
|  task, cost) |  proof and Undo)    |  to try)    |
+--------------+---------------------+-------------+
| Memory: what I know about this project   [edit]  |
| Safety: Stop key, spending limit, permissions    |
| Settings: key, voice, updates, beta numbers      |
| Privacy: Delete everything, export log           |
+--------------------------------------------------+
```

Sections map to things that already exist: Now = current task card, What I did = task log and receipts, Learn = lessons, Memory = memory page, Safety/Settings/Privacy = the settings panel. So the draft is mostly re-organizing, not new engine work.

**Recommendation:** before I build it, you pick the layout above or change it (side bar or top tabs, one window or the dock only). I will build the Home screen as soon as you say which, then you judge it in the hands-on session.

## 7. What is left for me to build

Nothing the engine still needs that I can finish alone, apart from the Home screen above (waiting for your layout choice) and the character wiring (waiting for art). Everything else on the list in section 2 is yours.
