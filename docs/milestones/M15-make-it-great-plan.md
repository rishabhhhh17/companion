# M15: Make it great

**Approved 27 Oct 2026:** the founder chose "all four waves" and "pricing later". The two questions on leading with proof and on the recorded first run with 3 setup steps were left unanswered; the plan's recommendation is followed for both and the founder can overrule either.

Written 27 Oct 2026, after four reviews of the whole product (why a person would use it, does it work, does it look and feel great, the market). The founder asked for "a thorough improvement pass on everything", a fun YC style company, and an answer to "why would a consumer use this".

## Why a person uses Squibby

**Who:** someone who built something with Lovable, Bolt, Cursor or Claude. It worked yesterday. Today it shows a white screen, or "Build step failed", or a button does nothing. Asking the AI again made it worse and burned credits. They say "fix loop", "going in circles", "90% done".

**The wow:** "It found the exact broken line, fixed it, proved it works, and I can undo it with one click. It cost 3 cents."

**Why us and not the others:**
- The builders' own fix buttons work on one platform and never prove the fix.
- HeyClicky (now also in the notch, with agents, $20 a month) guides and acts, but never proves or undoes.
- About ten notch apps show coding agents' progress, for developers only, and fix nothing.
- A human cleanup firm charges about $297 for a two day diagnosis.
- Nobody we found does find, fix, prove and undo, across tools, for non engineers.

**The line:** "Your AI built it. Squibby finishes it, and proves it works." For short clips: "Fixed. Proven. Undoable."

The notch and Flowflow are how it feels, not why it wins: HeyClicky and the notch apps already own "a cute thing in the notch". We lead with proof and undo, and let Flowflow make it fun.

## What is wrong today (the honest version)

1. **A new person never reaches the wow.** Nothing opens at launch (just a black notch). Setup is 8 steps, and step 2 sends them off to make an Anthropic account, add credit and paste a key (likely 5 to 15 minutes) before they have seen anything work. The practice fix lives under a small Learn icon, not on the main screen. Every practice needs Node, so on a Mac without it the wow is a greyed out button.
2. **Proof is a word, not something you see.** A small tick line. No red to green, no picture of the working app.
3. **Some buttons do nothing.** The Explain chip and the mic button only show a key hint. In the Settings window, "Walk me through it" and "Open the practice list" just open Home. Start with an empty box does nothing. A bad key is only found on the first task.
4. **Squibby's own machinery leaks into the screen:** "could not handle agent.start: git add failed...", "(exit code 1)", "The engine is not running", a sentence meant for the model ("Please fix the real problem instead of weakening the check").
5. **It looks almost premium, with dev tool tells:** stock web spinners in the notch, Flowflow cut off by a hard edge when it peeks, five identical grey buttons in Home's top row, a key hint line at the bottom, a loud grey ring on the ask box, about seven font sizes, nine corner sizes and ten animation timings that do not match.

Already fixed since the first Mac session (checked in code): stale errors on the fix side, the empty .claude folder, "nothing selected" message, the 8x cost estimate, engine words in labels, Undo in What I did, approvals in the log, "hook" jargon, the opaque square behind Flowflow, hotkey choice, the Show me key listening at once, "Answer" for plain questions.

## The plan, in four waves (in this order)

### Wave 1: the first five minutes (the biggest win)
1. **Home opens by itself on the very first launch**, with Flowflow peeking in from the edge toward it.
2. **See it work before anything is asked.** Step one is a short recorded fix of the sample sign up page, on the main screen: the broken page, the exact line, the fix, the check going red to green, a picture of the working page, Undo. It spends nothing and needs no key or Node. It says plainly that it is a recording ("This is a recorded run. Next, your own project.").
3. **Setup goes from 8 steps to 3:** see it work, connect (with a "Get a key" guide in 3 short steps), pick a folder. The questionnaire, groups and permissions are asked the first time each feature is used (permissions already work this way).
4. **The key is tested when it is saved**, with one tiny request (a fraction of a cent, said on screen): "Key works" or "Anthropic said no, here is why".
5. **The practice runs on the main screen** (Now), in big type: Problem, Fix, Proof, Undo.
6. **Proof you can see**, on every fix: the failing check in red, then green, with the screenshot of the working app beside it.
7. **Drop a project folder on Flowflow: "Fix this project"** (find the problem), not just "zip".
8. **The chips under the ask box lead with the edge:** "Find the problem" and "Is it safe to go live?". Draw it and Look up move under More.

### Wave 2: nothing broken, no jargon
1. Explain chip: explains text pasted in the box; otherwise a hint you can close.
2. The mic button becomes "How to talk" with the keys shown (a click may not open the microphone, rule 5).
3. Settings window: "Walk me through it" starts that walkthrough in Home; "Open the practice list" opens Learn.
4. Start with an empty box: focuses the box and says "Type what you want done first."
5. One plain sentence for every failure from Squibby's own machinery, with the detail kept in the log: undo point, helper start, checks, server start, folder picking, key saving.
6. "The engine" becomes "Squibby" in about 10 strings.
7. The check panel shows a plain summary and the file and line; the raw output goes behind "Details".
8. Explain an error checks the error still applies ("This looks already fixed") with a new eval case.
9. A test that fails if any user facing text from the runner contains machine words (exit code, git, stderr, agent.start, hook, engine).

### Wave 3: premium and fun
1. **One design scale:** 6 font sizes, 5 corner sizes, a 4 point spacing scale, 4 durations and one spring, used everywhere (today about 7, 9 and 10 different values).
2. **The notch:** Flowflow fades out of the black instead of being cut; hand made marks (a thin round arc for working, one breathing dot for thinking, no grey).
3. **Home:** the folder name and a status dot on the left of the top bar, smaller buttons on the right; no dead space above the headline; a calm ask box (soft border, glow on focus); the answer card that sits on something; no key hint line; Stop is the one bright button while working.
4. **Three moments of delight:** the notch gives a small celebratory bounce when a fix is proven; Undo spins back and says "Put back as it was"; Home unrolls out of the notch and rolls back up when closed.
5. **Flowflow drawn live** (the physics branch, with the squash cap) merged in, on in the preview first; on by default only after it is seen on a real Mac.
6. The picture fallback states lose their web style rings and badges.

### Wave 4: the story
1. The welcome says one thing: "Your AI built it. Squibby finishes it, and proves it works." (today it lists five things).
2. A 30 second demo script for a clip (a broken Lovable export: white screen, one tap, the line, about 12 cents, green check with a picture, receipt with Undo), in `docs/outreach/`. No website work.
3. A second hands on Mac session, guided step by step, to see waves 1 to 3 for real.

## Decisions only the founder can make
1. **Lead with proof and undo, not the notch**, and the line "Your AI built it. Squibby finishes it, and proves it works." Yes or a different line?
2. **The recorded first run** (spends nothing, clearly labelled as a recording). Yes?
3. **Setup cut to 3 steps** (questionnaire, groups and permissions asked later). Yes?
4. **Node:** for now the recorded run avoids it. Later, bundle a small Node with the app (makes the download noticeably bigger, very roughly 100 MB, size and licences to be checked) or keep asking people to install it?
5. **Pricing** stays as it is in the product doc for now. The research suggests: free finds the problem, paid (about $12 to $15 a month, or $99 a year) fixes and proves, under HeyClicky's $20 because users also pay Claude. Change it now, or later?

## How I will work
- Waves in order, tests first for the risky parts (the first run state, the key check, the plain error mapping), the full suite before each wave is called done, the app built and opened after each wave.
- One branch per wave from `m15/fun`, nothing merged without the founder.
- Plain words, no em dashes, names from the strings file.
