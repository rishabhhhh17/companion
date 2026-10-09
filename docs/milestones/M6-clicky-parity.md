# M6 and friends: the "see it, hear it, point at it" parts. Plan for approval

**Status:** waiting for the founder's approval. No code until approved. **Written:** 9 Oct 2026. **Source:** technical doc sections 12 (characters), 14 (Show me how), 15 (voice), 18 (M2, M6, M8, M9 rows); product doc section 4; decisions T12 (capture and snapped pointer), T13 (voice on the device), F04 (characters), F07 and F11 (never watch, never steal focus), F15 (order). **Why now:** on 9 Oct 2026 the founder asked to finish every feature before moving on, so Companion is as good to use as the best "talk to your screen" product, not just a strong builder.

## What "on par with Clicky" means here, in use

1. **Hold a key and talk.** It listens while you hold, shows what it heard, and answers. No typing needed.
2. **It looks at your screen only when you ask**, with a visible light first, and answers *about what is on your screen*.
3. **A pointer flies to the exact button** and rings it, step by step, and moves on when you click it. This is the part that must feel magic: fast (about 2.5 seconds from key to pointer) and accurate (it lands on the right thing at least 8 times in 10).
4. **A character that feels alive** and is pleasant to have in the corner all day, without using battery or attention.
5. **It speaks back** if you turn that on.
6. **A calm first run** that gets you from install to a first win in about five minutes.

## What gets built, in this order (riskiest first)

**Step 1. Spike (e): can it aim? (2 to 3 working days, needs you for two permission clicks)**
- Take screenshots of real apps (System Settings and public web pages in Chrome), ask Claude where specific buttons are, and score the answers against the real button positions that macOS knows (the accessibility tree). This needs no labelling by hand, so it also grows into the 100 screenshot test later.
- Measure: hit rate before and after "snapping" the answer to the nearest real button, and time per answer, on a Retina screen and an external display if you have one.
- Settle the open question: does Claude Code keep the screenshots it is sent on disk? If yes, you choose between (a) API key users send the image straight to Anthropic, bypassing Claude Code, or (b) wait for a no disk mode. Plan login users may not get Show me how until then. This is your decision, with my recommendation.
- **If it passes** (80% or better, median under 2.5 s) I build step 2 as designed. **If it fails** I come back with a smaller version (it highlights a region and lists what to try) before building more.

**Step 2. Show me how (M6) (about 2 weeks)**
Hotkey, light first, one capture with Companion and password managers left out of the picture, secrets blacked out on the device, Claude picks the target, the Mac snaps it to the real button, the pointer flies there with a ring and a short caption, then the walkthrough continues when you click it. The overlay never takes focus and ignores clicks. Plus the 100 screenshot test run before it ships.

**Step 3. Voice (about 1 week)**
Hold to talk, transcribed on your Mac (nothing but text leaves it), shown in the ask box before it sends. First use downloads a speech model once (about 140 MB). Optional spoken replies using the Mac's own voices. Works alongside Wispr Flow and Mac dictation. Microphone permission is asked the first time only.

**Step 4. Characters (about 1 week)**
All five characters with their own personalities, every state, reduced motion, light on battery. **Your choice below.**

**Step 5. First run and questionnaire (about 4 working days)**
Connect Claude (key or plan), pick a project folder, the optional five question questionnaire (each answer visibly changes how Companion behaves), explain each permission just before it is needed, and finish with a first working task.

**Step 6. Distribution (M9) (about 1 week, after Apple approves your developer account)**
Signed and notarized installer, automatic updates, a check for missing tools (Node, Command Line Tools), crash and log export that stays on your Mac unless you send it.

## How we will know it worked

Automatic checks as always (tests first for the risky parts: redaction before sending, the indicator before any capture, the overlay never taking focus, the coordinate maths for several screens, voice never recording outside the held key, permissions asked only at first use). Real checks with the test login at small cost. Then a hands on session with you per step, one step at a time in chat, because only you can click and speak.

## What I need from you

1. **Approve this plan,** or tell me what to change.
2. **Characters, your choice:**
   - **A (my recommendation): drawn and animated in code.** Five distinct abstract characters, smooth motion, ready now, easy to tune with you, and swappable later. No outside tool or cost.
   - **B: Rive animation files.** The most polished route, but someone has to draw them in Rive's editor (a designer, or you), and the editor needs a paid seat to remove its splash screen. I cannot author those files by code alone.
3. **For step 1:** two permission clicks (Screen Recording and Accessibility) for the test tool, and that I may use the test plan login for a few dozen small image questions (a few dollars at most, I will report the total).
4. **Later, for step 3:** OK to download the speech model (about 140 MB) once.
5. **For step 6:** Apple has to approve your developer enrollment. Nothing for you to do but wait.

## Time

About **6 to 7 weeks** in total, mostly on my own. You are needed for approvals, the permission clicks, and one short guided session per step.

## Risks and plan B

- **Aim is not accurate enough.** Step 1 tells us before we spend two weeks. Plan B is the smaller region-highlight version, or snapping plus a short list of candidates you tap.
- **macOS asks again for screen recording about monthly.** That is Apple's rule; the first run explains it.
- **The screenshot disk question goes against us.** Then API key users get Show me how first, and plan users when a no disk mode exists.
- **A character that looks flat.** Choice B above, or a designer for the final art; the code approach is built so art can be swapped without redoing the logic.

## Approval

Say **approved** (and A or B for the characters), and I will start with step 1.
