# Launch post drafts (building in public)

> **Note (22 Oct 2026, from `docs/research/2026-10-22-reality-check.md`):** proof, Undo and "fixes it" are no longer unique; Lovable, Replit, v0 and Claude Code all do versions of them now. Describe them, never claim them as what sets us apart. Lead with understanding (the why, Your turn) and working across tools. "The app has no server of its own" is true only on the own key route; it stops being true if managed usage (F22) is switched on.


Drafted 20 Oct 2026. These are drafts for the founder to send by hand. Nothing is posted, scheduled or sent by any agent. Post only what is true on the day: each line marked **[check on the day]** depends on something that must be confirmed first.

## Ground rules for all three

- Say "Companion, the working name". The name will change.
- Say what it is: a Mac app that helps when you are stuck while building with AI. Do not call it a companion, a friend or an assistant. (New York and California AI companion laws exclude productivity tools; the research says avoid the word.)
- Say "early build", "Apple Silicon", "you bring your own Claude key". Say it is not signed by Apple yet if that is still true **[check on the day]**.
- No numbers that do not exist: no users, no waitlist size, no revenue, no stars, no percent faster. Only numbers from the repo: 15 broken test projects, 5 practice projects, 12 draft lessons, 150 disguised commands tried against the safety rules. (All from CHANGELOG.md and the status notes.)
- No claims about other products beyond what is in the research. Do not name HeyClicky, Coucou or Google in the launch posts. If a reader asks, answer plainly: "different focus; I have not tested theirs" (per the market research, HeyClicky comparisons are inferred, not tested).
- Do not post the ring or the on screen drawing as working until the hands on session confirms it on a real screen.
- Reply to every comment honestly, including "it did not work for me". Ask for the project type and the macOS version.

---

## 1. X thread (building in public)

**Post 1 (hook)**
I am building a Mac app for one moment: you are building something with AI, it breaks, and the AI says "fixed" when it is not.

Press one key. It finds the problem, fixes it with you in small steps, proves the fix, and tells you why. Early build. A thread:

**Post 2 (the problem, with a source)**
Why this: the Stack Overflow 2025 survey found the top frustration with AI code is "almost right, but not quite" (66%). 45% say fixing AI code takes longer than they expected.

People do not mostly want to learn to code. They want to get unstuck.

**Post 3 (what the key does)**
You hold Control, Option, Command and press F. It runs your project's own checks, finds the failing line, and names the cause in two sentences.

It looks at your screen only when you press, with a light on first, and keeps nothing it saw.

[Attach: real screen recording of the signup practice, 15 seconds. **[check on the day]**]

**Post 4 (proof)**
"Done" has to be shown. It runs your checks, then opens your page in a hidden browser and takes a before and after picture of your app.

If it could not check something, the receipt says "partly checked", not "done".

[Attach: real receipt screenshot.]

**Post 5 (undo)**
Before each step it saves a copy of your files. Undo puts them back. It never touches your git history.

One more key stops everything: the task, the screen look and the microphone.

**Post 6 (what it is not)**
What it is not yet:
- Mac only, Apple Silicon.
- Not signed by Apple yet **[check on the day]**.
- The character is a plain dot. Real art is coming.
- Undo does not cover files your project ignores.
- Best on common web projects. Odd setups will fail sometimes, and it says so.

**Post 7 (your Claude)**
You bring your own Claude key. I do not sell or resell Claude, and the app has no server of its own. What it sends to Claude goes from your Mac to Anthropic under your account.

I am writing down every case of what it reads and where it goes, row by row, and will link it.

**Post 8 (practice)**
There are five small practice projects, each broken one way on purpose (a Join button that fails, a missing setting, a link to a missing page, a renamed file, a database table anyone can read). The app copies one into your home folder so you can see the whole loop before you use it on your own project.

**Post 9 (ask)**
If you are building with AI and get stuck, I would like you to try it and tell me where it fails. Early access here: [link] **[check on the day]**

I am posting what works and what breaks as I go.

**Notes for the founder**
- Post 3 and 4 need real recordings. Do not post the thread without them.
- The Stack Overflow figures come from the market research (section 1). Link the source in a reply.
- Do not add "launching soon", "thousands", "trusted by".

---

## 2. Product Hunt

Product Hunt is a public launch. Do it only when the installer is signed and a download works, not before. It is a different promise from a friends preview.

**Name:** Companion (working name; use the final name at launch)

**Tagline options (60 characters or fewer)**
1. "Press a key when your AI project breaks. Fixed and proven." (58)
2. "Get unstuck while building with AI, and know it works" (53)
3. "Find it, fix it, prove it, undo it. For AI builders on Mac" (59)

Recommended: option 2.

**Short description (260 characters or fewer)**
A Mac app for when your AI project breaks. Press a key: it finds the problem, fixes it in small steps you can undo, proves the fix with your project's own checks, and tells you why. You bring your own Claude key. Early build.

**First comment (from the maker)**

Hi, I am [name], and I built this.

I kept watching people build with Lovable, Cursor, Replit and Claude Code get stuck in the same place: something breaks, they ask the AI for a fix, it says fixed, and it is not. So I built a tool for that moment, not for everything.

What it does today:
- You press a key. It runs your project's own checks, finds the failing line, and names the cause in two sentences.
- It fixes the problem in small steps, in the one folder you pick. It saves a copy of your files before each step, and Undo puts them back. It never touches your git history.
- It proves the fix: your checks first, then a hidden browser opens your page and takes a before and after picture. If it could not check something, it says "partly checked", not "done".
- It tells you why in two lines.
- It can point at where to click for settings and builder tool steps, and you can also drop a file on it to convert it on your Mac.

How it works with Claude: you bring your own key, and you pay Anthropic directly. I do not sell or resell Claude. The app has no server of its own. Your screen and microphone are touched only when you press a key, with a light on first.

What is not done: it is Mac only (Apple Silicon, macOS 14 or newer, tried on macOS 27), the character is a plain dot while the art is made, lessons for builder tools are drafts I have tested but few people have tried on the real apps **[check on the day]**, and it will fail on odd project layouts. Undo does not cover files your project ignores.

What I would like to know: what project were you stuck on, and did it find the right line? Please tell me where it breaks.

Pricing: **[founder decides; see pricing-options.md. Say the true thing on the day, such as "free during the early build" only if that is the plan.]**

Thank you for trying it.

**Maker tips**
- Reply to every comment within a few hours on launch day.
- Do not ask for upvotes. Do not offer anything for votes.
- Do not post screenshots that are mock ups.
- Gallery images: (1) the card with the cause, (2) the receipt with before and after, (3) the privacy table, (4) Undo, (5) the practice projects list. All real.

---

## 3. Show HN

Hacker News readers are technical and sceptical about hype, and will check what runs on their machine. Lead with the engineering and the limits. Also check the Show HN rules: a Show HN should be something people can try. If the app is not downloadable without a request, say so and consider waiting.

**Title options**
1. Show HN: A Mac app that finds, fixes and proves bugs for people building with AI
2. Show HN: Companion, a rescue tool for stuck AI-built projects (Mac, bring your own Claude key)

Recommended: option 2. Do not put the word "AI companion" in the title.

**Post text**

I built a Mac app for the moment an AI-built project breaks and the AI keeps saying it is fixed.

You press a key. It runs your project's own checks, finds the failing line, and explains the cause in two sentences. If you allow it, it also looks at your screen once (a light turns on first) to find the error. It fixes in small steps, takes a snapshot before each one, and a fix is only called done when your checks pass and a headless browser has loaded your page. If it could not check, the receipt says "partly checked".

How it is built, and what I tried to get right:
- It drives Anthropic's Claude Code binary through the Agent SDK, pinned to an exact version, unmodified. You bring your own API key, kept in the Keychain and kept out of the environment of commands the agent runs. I do not sell or route Claude usage, and there is no server of my own.
- Safety is in hooks, deny rules and a macOS sandbox, not in prompts. I threw 150 disguised commands at the rules (quoting tricks, wrappers, encoded scripts piped to a shell, `~` and `$HOME`) and closed the holes it found, including one that could take a screenshot of the screen. That is testing, not a guarantee, and project scripts you approve still run unsandboxed.
- Undo uses a shadow snapshot repository, so it never touches your git. Known gap: files your project ignores are not covered.
- The screen and the microphone are used only on a hotkey with a visible light first. Pictures are held in memory and not written to disk by Companion; Claude Code keeps a copy of a received picture in its temp folder, which Companion points at a RAM drive and erases after each answer.
- Fifteen small broken projects (missing bracket, undefined name, bad import, a failing test, TypeScript errors) check that the locator finds the exact file and line from real tool output, with no model call. All pass.

What is not done:
- Mac only (Apple Silicon, macOS 14+), not yet notarized **[check on the day]**.
- Pointing and drawing on screen, the lessons and voice have only been tested by machine, not on enough real screens **[update after the hands on session]**.
- It is best on common web projects and fails on odd layouts and huge repos.
- No Windows or Intel yet.

I would like to hear: what is the first project it fails on? And is it OK that it calls a result "partly checked" when a check cannot run?

Link: [site] [source or docs link if public; do not link private repos]

**Notes**
- Be ready for: "Why not just use Claude Code directly?" Honest answer: for someone comfortable in a terminal, you may not need this; it is aimed at people who got stuck and do not read diffs, and adds proof, undo and on screen help.
- Be ready for: "Why closed source?" Decide before posting. Do not claim open source if it is not.
- Be ready for: "Claude Code binary redistribution" or terms questions. The legal checklist lists Anthropic's Commercial Terms and written confirmation on plan login as not done; answer: it uses the API key route only for now. Do not speculate about Anthropic's position.
- Do not ask for upvotes, do not share the link to get votes, and do not post it from multiple accounts.
