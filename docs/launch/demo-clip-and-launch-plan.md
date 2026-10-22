# The demo clip and the launch plan

Written 22 Oct 2026, for the founder to film and post by hand. Nothing here is posted by the app or by me.

## What worked, and why we copy the format and not the product
The reel the founder sent (a Mac app called Sentient OS) is a very short vertical clip: a few one word captions in a thin serif (asked, prices, process, command, review, context) over close ups of a real Mac, then one line in the caption, "free", and an invite code. It got questions in the comments, not praise: does it need a paid plan, does it work offline, how is it different from ChatGPT. So a clip like this makes people curious enough to ask. Our job is to have the answers ready (below). We copy the format only. Its code is AGPL, and we do not copy code (`docs/research/2026-10-22-sentient-os.md`).

## The one story to film: red to green, with Undo, and why
The hero in one clip, on the shipped practice project (so no real person's work is on screen). About 20 to 25 seconds, vertical (9:16), screen recorded on the Mac, no voice over needed.

| Time | On screen | Caption (one or two words, thin serif) |
|---|---|---|
| 0 to 3 s | A page with a button that does nothing. Cursor clicks it. Nothing happens. | stuck |
| 3 to 6 s | The hotkey is pressed (Control, Option, Command and F). The character on the screen edge lights first, then a ring appears on the broken line in the editor. | find |
| 6 to 12 s | The card shows one plain sentence about the broken button. Press yes. Two small steps scroll by. | fix |
| 12 to 16 s | The browser check runs and goes green. A short line: "checked". | proof |
| 16 to 20 s | The "why" shows: two short lines and one question. | why |
| 20 to 23 s | Undo. The page goes back to broken, one click. | undo |
| 23 to 25 s | The character, then the name. | Squibby |

Rules for filming:
- Use the practice project, a throwaway folder, and the capped test key. Never show a key, an email or a real project. Hide the Dock and any notifications first.
- Film it for real, in one go, with the real app. Do not speed up the model's work: if a step is slow, cut to the result and say nothing false. If it fails on camera, that is a second clip: "it said it could not fix it, and showed why".
- Show the lights. The character lighting before anything is looked at is the privacy promise, and people notice it.
- Keep the sound off or use quiet music with no words. No claims in the caption beyond what is on screen.

Two more clips to film after the first, one each:
1. **Look at this** (the guide): hold the key, ask "where do I click to turn on screen recording", the ring points at the right control. Caption: ask / point.
2. **Second Look**: select an AI answer with a wrong sum in it, press the key, it shows the real total. Caption: check.

## What to say in the post (the caption), in plain words
"I built a Mac app for people who build with AI and get stuck. Press a key: it finds the problem, fixes it with you, checks it really works, and explains why. One click to undo. Free to try. Squibby." Then a link. No numbers in the caption until the "did they learn" test has real results.

## The questions the comments will ask, and true answers today
- **Does it need a paid plan?** It works with your own Anthropic API key (pay as you go, a few cents a fix on our test projects). Signing in with a Claude plan is not offered: Anthropic support said on 23 Oct 2026 that integrations must use an API key. Do not promise a free plan: the company paying for fixes needs a written agreement with Anthropic, which we have asked for and do not have.
- **Does it work offline?** No. It needs the internet to reach Claude. The screen, microphone and other apps are only touched when you press a key, and nothing about your screen is saved.
- **How is it different from ChatGPT's app or Claude Code itself?** It is for people who are not engineers: it finds the problem for you, checks that the fix really worked (not just "done"), gives you one click Undo, and explains why in two lines, so you learn. It also works across the tools you already use (Lovable, Bolt, Replit, Cursor).
- **Is it open source?** No. Say so plainly. Do not copy that claim from other apps.
- **Windows?** Mac first, Windows next.

## An invite code, like the reel
The reel gave out invite codes, which makes a free app feel scarce and lets the maker see who comes from where. **We have no invite code system and no sign up page yet.** Options, smallest first: (a) a plain form and a short list you email by hand; (b) codes checked by the app against a list on a small server. Do (a) first. Do not build (b) until there is a reason. The domain (getsquibby.com) is bought; no site is built, by the founder's choice for now.

## A launch order that fits a solo founder
1. **Mac session, then fix what it finds.** Nothing is filmed from the real app until the real app has been used by you for an hour.
2. **Film the hero clip** (this page). Post it on Reels, TikTok and X on the same day, with the caption above.
3. **Ten people, not a crowd.** Give the app to about ten builders who are really stuck (Lovable, Bolt, Replit users). Watch the first run with them, without helping. This is also the "did they learn" test (`docs/launch/did-they-learn-test.md`), and its result is the first number worth putting in a caption.
4. **Then the second and third clips,** one a week.
5. **A reply to every comment question for the first week.** The answers above are the script.

## What would change this plan
- Anthropic says yes to company paid use: then "free to try" and a plan price can be promised, and the fix can run without a key.
- The Mac session finds a launch crash or a confusing first run: fix it before filming.
- Ten people do not come back after the first stuck moment: the hero is not enough on its own; reread `docs/research/2026-10-22-reality-check.md` before spending on reach.
