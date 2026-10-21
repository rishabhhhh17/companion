# Landing page draft

> **Note (22 Oct 2026, from `docs/research/2026-10-22-reality-check.md`):** proof, Undo and "fixes it" are no longer unique; Lovable, Replit, v0 and Claude Code all do versions of them now. Describe them, never claim them as what sets us apart. Lead with understanding (the why, Your turn) and working across tools. "The app has no server of its own" is true only on the own key route; it stops being true if managed usage (F22) is switched on.


Working name: Companion (every name will change; keep it in one place when this goes into a site).
Drafted 20 Oct 2026 from AGENTS.md, F16 to F20, CHANGELOG.md, the market research, docs/alpha/PRIVACY.md and INSTALL.md.

## How to read the marks

- **[after hands on]** means the line describes something that is built and passes tests, but has never been seen on a real screen by a person (the on screen drawing, the lessons on real apps, voice, the signed installer). Do not publish these lines as plain fact until the founder's hands on session. Until then, either cut them or keep the softer wording given next to them.
- **[recheck]** means a fact about another company that comes from our own research notes. Recheck before saying it in public.
- Every other line is something the code does today and tests cover.

## Headline options (pick one)

1. **Stuck while building with AI? Press the key.** (the founder's hero line, shortened; safest)
2. **When your AI app breaks, find out why, fix it, and know it works.**
3. **The helper for the moment your AI project gets stuck.**

Recommendation: option 1. It is the hero in F16 and F17, and the F17 rule says the site sells only the hero. "Works in any app" stays in the feature list, never in the headline.

Do not use "companion" in the headline or as a category word. Research (market research, section 4) says New York and California laws on AI companions exclude productivity tools, and a product that sounds like a friend can fall inside them. Say "helper" or "tool".

## Subhead

It looks at the problem on your screen, fixes it with you in small steps you can undo, proves the fix worked, and tells you why in two lines. You bring your own Claude. A Mac app.

Short version for a social card: *Press the key. It finds the problem, fixes it with you, proves it works, and shows you why.*

---

## Section 1: The problem

**Heading:** You asked the AI to fix it. It said it was fixed. It was not.

**Copy:**
You are building something with Lovable, Cursor, Replit, Bolt or Claude Code. The first version came fast. Then something broke, and you went round and round. You ask for a fix, it says "fixed", you check, it is still broken. Three hours later you are not sure what the code even does.

You are not bad at this. This is the most common way these projects stall. Stack Overflow's 2025 survey found the top frustration with AI code is that it is "almost right, but not quite" (66%), and 45% say fixing AI code takes longer than expected.

Companion is built for that one moment: you are stuck, and you want it solved and explained, without leaving your project.

**Visual needed:** A real screen recording (no mock up) of a project showing a failing check or an error, with a quick cut of the same question asked three times in a chat. Keep it plain. No stock photos of people at laptops.

**Source note:** the two Stack Overflow numbers are in the market research (section 1). Cite "Stack Overflow Developer Survey 2025" under the copy.

---

## Section 2: The key press

**Heading:** Press the key. It looks for the problem.

**Copy:**
Hold Control, Option and Command, and press F. (You can pick other keys in Settings.)

Companion runs your project's own checks and finds the line that is failing. It names the cause in two sentences. If you allow it, it also looks at your screen, once, with a light on first, to find that line or error and mark it.

Then you choose: have it fix the problem, or be shown where to click and do it yourself. Either way, it stays on your side of the screen.

It does not watch you. It looks at your screen or listens only when you press a key, a light comes on first, and it keeps nothing it saw. [Nothing is kept: the screen look is held in memory only and never written to disk by Companion.]

**Line to keep as is:** "One key stops everything: every task, the screen look and the microphone." (Control, Option, Command and X, also in the menu bar icon.)

**Visual needed:** A short loop: a terminal error, the key chord shown as a key cap graphic, a ring appearing on the failing line. The ring on a real screen is **[after hands on]**. Until then, show the card with the two sentence cause and the failing line instead of a ring.

---

## Section 3: Fix, prove, undo

**Heading:** It fixes it in small steps. It proves it worked. You can take it back.

**Copy:**
**Fix.** Companion works in small steps, in the one folder you chose, and nowhere else. Before each step it saves a safe copy of your files. If three tries in a row fail, it stops and changes its approach instead of looping.

**Prove.** "Done" has to be shown, not said. It runs your project's checks first. If your project has a page, it opens it in a hidden browser on your Mac and takes a picture of your app before and after. If it could not run a check, the receipt says "partly checked", not "done".

**Undo.** Every task gets a receipt: what changed, what proved it, what it cost. Undo puts your files back from the safe copy. It never touches your git history.

**Show you why.** After a fix, you get two short lines: why it broke, and why the fix works.

**Honest limits (put these on the page):**
- Undo does not cover files your project ignores (gitignored).
- It handles common web project problems best. Odd layouts, very large projects and other languages are best effort, and the card says so in plain words instead of guessing.

**Visual needed:** The task card: steps, the proof line, and the Undo and Receipt buttons, on a practice project. Use a real screenshot of the real card. A before and after of the practice project's page is good (the signup page with the Join button that fails, then working).

---

## Section 4: Teaches you on screen, in any app

**Heading:** Show me where to click. In your builder, or any app.

**Copy:**
Sometimes the fix is a setting, not code. Companion can point at the next click and wait for you to make it, then move on. A "just do it" button is always there if you would rather not click. It never presses anything that sends, pays, deletes, publishes or signs out.

It also works in other apps. Stuck in a spreadsheet with a #REF! error, a settings window, an email? The same key looks at that screen once, names the problem in two sentences, and walks you through the fix. In an app that is not a code tool, it says "fixed" only when the error it read is gone, and asks you when it can only guess.

There are 12 short lessons for builder tools, such as installing Claude Code, connecting Lovable to GitHub, adding a setting on Vercel, and getting a project out of Bolt or Replit. **[after hands on]** The lessons are written from the makers' help pages and have not been tried on the real apps yet. Do not list them as working lessons until they are.

**Soft wording until the hands on session:** "Early lessons for common builder steps, written from the tools' own help pages. We are testing them with real people now."

**Visual needed:** A short clip of Your turn mode: a ring on a button, a click, the next ring. **[after hands on]** Until the clip exists on a real screen, show the lesson list and a lesson step card only.

**Do not say:** that it matches HeyClicky on breadth. F17: "We do not try to win on breadth. We win on depth." It has 12 draft lessons, not 89 apps.

---

## Section 5: Drop a file, convert it

**Heading:** Drop a file on it. Get the format you need.

**Copy:**
Drag a picture, a PDF, a document, a sound or a video onto Companion. A ring of choices appears for that file type, such as converting a picture between PNG, JPEG and HEIC, resizing it, merging or splitting PDFs, turning a document into a PDF, or trimming a sound. It runs on your Mac with the tools macOS already has. Nothing is uploaded and nothing is sent to Claude. The result is saved next to the original under a new name. Your original is never replaced.

**Limits to state:** WebP appears only if your Mac can write it. A PDF of words only may not get smaller. A document turned into a PDF does not carry its pictures (a known trade off). Wider video and audio formats are not supported.

**Why it is on the page:** it is a small, useful thing that works without Claude, so it is a good first minute for someone who is not stuck yet. It does not belong in the headline.

**Visual needed:** A real screen recording of dropping a PNG and choosing JPEG. It is built and tested, but the drop on the real screen is **[after hands on]**.

---

## Section 6: Your own Claude, and your privacy

(The brief asked for five sections, with this one folded into the fifth. Keep it as a short closing band under section 5 if the page must stay at five.)

**Heading:** Your Claude. Your Mac. Your say.

**Copy:**
- **You bring your own Claude key.** Companion does not sell Claude, resell it or route it. Your key goes into your Mac's Keychain and is used only to talk to Claude.
- **Nothing watches you.** The screen and the microphone are used only when you press a key, a light comes on first, and Companion never reads what you type.
- **It stays in your folder.** Companion works in one project folder you pick. It does not read your settings or key files (such as .env).
- **It never touches your git.** Undo uses its own safe copies.
- **You can read what it remembers**, edit any line, or forget it. Delete everything is one button.
- **Companion has no server of its own.** What it sends to Claude goes from your Mac to Anthropic under your account. Read the privacy page for every case, row by row.

**Visual needed:** The privacy table as a simple "when, what is read, where it goes" graphic, built from docs/alpha/PRIVACY.md. Link to the full page. **The privacy policy and terms pages do not exist yet (founder's own list, legal checklist item 11). Do not publish this page before they do.**

---

## FAQ (honest answers)

**1. Do I need a Claude account?**
You need a way to pay Anthropic for Claude. Today that is an Anthropic API key from console.anthropic.com, with some credit on it. Signing in with a Claude plan (Pro or Max) is not offered yet: it waits for Anthropic's written answer, and we will not turn it on before then. A Claude chat subscription on its own does not work as a key.

**2. What does it cost me?**
Two parts. Companion itself: the price is not set yet (see pricing-options.md; do not publish a number until the founder decides). Claude: you pay Anthropic directly for what you use, and Companion shows the cost on each receipt and lets you set a daily limit. We do not yet have measured costs for typical fixes. Our own estimate for the practice projects is around 20 cents each, but that is a guess until real runs measure it, so do not quote it as a promise.

**3. What leaves my Mac?**
Only what the feature needs, and only when you press a key. For a fix, the relevant parts of your project and the problem text go to Claude under your key. When you ask about your screen, one picture goes to Claude, with card numbers, bank numbers, keys and tokens that its text reader finds blacked out first, and with your password manager's windows left out. The picture is held in memory and not saved by Companion. File conversions send nothing anywhere. It can also contact Vercel (only if you ask it to go live, through your own Vercel login), and download its speech model, a hidden browser and updates, only when you press the button. The full table is on the privacy page.

**4. Does it work with Cursor, Lovable and Replit?**
It works on the project folder on your Mac, so anything that gives you a folder works: Cursor and Claude Code projects directly, and projects exported or opened from Lovable, Bolt and Replit (it can open a project from a GitHub, GitLab or Bitbucket link). It does not plug into those tools' chat or credits. Pointing at things inside the Lovable or Replit web pages is part of the early lessons, and has not been tried on those real pages yet **[after hands on]**.

**5. What if it breaks my project?**
Before each step, Companion saves a safe copy of your files, and Undo restores them. It will not run commands that delete things outside your project, and it asks before anything risky. It never writes to your git history. Two limits: files your project ignores in git are not covered by Undo and it is an early build, so keep your own backup of anything you cannot lose.

**6. Is it safe? What can the AI run on my Mac?**
The safety is in code, not just in instructions to the AI: rules that block dangerous commands and anything outside your project, a Mac sandbox for commands, and your Claude key kept out of anything the AI runs. It has been attacked in tests with a hundred and fifty disguised commands, and holes found were closed. That is testing, not a guarantee. Project scripts you approve still run on your Mac, so only open projects you trust.

**7. What Macs does it run on?**
Apple Silicon Macs (M1 or newer) with macOS 14 or newer. It has only been tried on macOS 27 so far. No Intel Macs and no Windows yet. You also need Node and Git installed.

**8. Is it a chatbot friend?**
No. It is a tool for getting unstuck. It does not ask how you feel, keep streaks or send nudges. Today its character is a plain dot while the real character art is made.

**9. How is it different from the helpers inside Lovable or Cursor?**
Those help inside their own tool, and the fix loop is the problem. Companion works on your project folder across tools, proves a fix with your own checks, and gives you Undo. We do not claim to know what those tools do beyond what is public, and we do not claim it replaces them. You will still build in them.

**10. Is it ready? Can I install it today?**
It is an early build for a small group of friends. It is not yet signed and notarized by Apple (approval pending), so macOS asks you to press "Open Anyway" once. The look and the on screen drawing have been tested by machine and not yet by many people on real screens. Say so, and ask people to tell us what breaks.

---

## Calls to action

- **Primary (now, while the build is early):** "Ask for early access" (email field, nothing else). Do not offer a download button until the installer is signed and notarized.
- **Secondary:** "See it work on a practice project" (the 60 second video, see demo-video-script.md).
- **Tertiary:** "Read exactly what it sees and sends" (links to the privacy page).
- After launch of the signed installer: "Download for Mac (Apple Silicon)".

Avoid: "Join the waitlist of thousands", "Trusted by", any user count, any review, any "as seen in". None exist.

## Page facts to keep consistent

- The key: hold Control, Option and Command, press F. Talk: hold Option and Space. Stop: Control, Option, Command and X. All can be changed in Settings.
- No claim of a Windows version (parked until later), no phone approvals, no "Plus" features as if they exist.
- No "Powered by Claude Code". "Powered by Claude" is allowed (AGENTS.md rule 4).
