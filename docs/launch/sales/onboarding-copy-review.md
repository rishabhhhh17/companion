# First run copy review

Reviewed 20 Oct 2026. Source: the `ob*` strings in `app/src/strings.ts` (lines 153 to 177 and 455 to 461). `strings.ts` was **not edited**. Each item gives the exact current line, the problem, and a suggested line. Suggested lines follow the house style: plain words, short sentences, no em dashes.

The goal of the first run is: one honest promise, one clear connection step, a fast first win (a practice project), and no claim that is stronger than the code.

Priority: **A** fix before anyone outside the friends group sees it (wrong or misleading), **B** worth changing (sells poorly or unclear), **C** polish.

---

## 1. obWelcome1 (priority B)

**Current**
> Companion helps you finish what you start with AI: it builds and checks your project, helps you write better prompts anywhere, and shows you where to click. Stuck in any app, like a spreadsheet, a document or a settings window? Press the stuck key and it finds the problem on your screen with you.

**Problem:** It lists four things before the one thing the site sells. F17 says the first run sells only the hero, and "works on any app" belongs in the feature list, not the opening. "Helps you finish what you start" is a promise it cannot prove. The second sentence reads as the main point but is buried.

**Suggested**
> Stuck while building with AI? Press the key. Companion finds the problem, fixes it with you in small steps you can undo, proves it works, and tells you why.
>
> It also helps in other apps, like a spreadsheet or a settings window.

---

## 2. obWelcome2 (priority A)

**Current**
> You bring your own Claude. Everything stays on your Mac, and nothing watches your screen unless you ask.

**Problem:** "Everything stays on your Mac" is not true. What you ask, parts of your project and screen pictures go to Claude (Anthropic) under your key, and Vercel hears from you when you go live (docs/alpha/PRIVACY.md). This is a trust line, so it must be exact. The second half is true and strong.

**Suggested**
> You bring your own Claude, and you pay Anthropic directly for what you use. Companion has no server of its own. It looks at your screen or listens only when you press a key, with a light on first.

---

## 3. obStart (priority C)

**Current:** `Get started`

Fine. Keep.

---

## 4. obConnectTitle (priority C)

**Current:** `Connect your Claude`

Fine. Keep.

---

## 5. obKeyHelp (priority A)

**Current**
> Paste your Anthropic API key. It is saved in your Mac's Keychain and is only ever used to talk to Claude. You can get one at console.anthropic.com.

**Problem:** A beginner does not know what an API key is, that it costs money, or that a Claude chat subscription does not give one. The first run is where people drop out. It also does not say that using Companion costs them anything. "Only ever used to talk to Claude" is true and good. Do not say "never leaves your Mac" (the key goes to Anthropic with each request).

**Suggested**
> Companion uses your own Anthropic account. Make a key at console.anthropic.com, add a little credit, and paste the key here. You pay Anthropic directly for what you use, and Companion shows the cost on each receipt. Your key is kept in your Mac's Keychain and is only used to talk to Claude.

(Check the cost line is true in the build: the receipt shows cost, and a daily limit exists per the verdict note.)

---

## 6. obKeyLabel and obKeySave (priority C)

**Current:** `Anthropic API key` and `Save key`

Fine. Keep.

---

## 7. obPlanLater (priority B)

**Current**
> Signing in with a Claude plan comes later.

**Problem:** "Comes later" is a promise. The plan sign in is behind a switch that stays off until Anthropic confirms in writing (AGENTS.md rule 3), and it may not come at all. A user with a Pro plan will read this as "wait and it will work".

**Suggested**
> Signing in with a Claude plan is not available yet.

---

## 8. obFolderTitle (priority C)

**Current:** `Pick your project folder`

Fine. Keep.

---

## 9. obFolderHelp (priority A)

**Current**
> Companion works in one folder at a time, the one you choose. It never looks anywhere else.

**Problem:** "It never looks anywhere else" is stronger than the facts. Companion can look at your screen when you press a key, can read text you selected in other apps when you press the error key, and asks before reading outside the folder rather than never doing so (CHANGELOG: reading outside the project "asks first"). A sharp reader will notice the screen look.

**Suggested**
> Companion works in one folder at a time, the one you choose. It does not change files outside it, and it asks before reading anything outside it.

(Confirm with the safety layer that "asks before reading" matches current behaviour for files outside the project, including in Rescue and Plan runs, where the changelog says "ask" becomes "no".) Simpler and safer option: "Companion works in one folder at a time, the one you choose. It keeps its work inside that folder."

---

## 10. obQuestionsTitle and obQuestionsHelp (priority C)

**Current:** `A few quick choices (optional)` and `Each answer says what it changes. You can change any of them later.`

Fine. Keep.

---

## 11. obSkip, obContinue, obBack, obFinish (priority C)

Fine. Keep.

---

## 12. obPermTitle (priority B)

**Current:** `What Companion may ask for, and when`

**Suggested:** `Permissions: asked only when needed`

Reason: shorter, and states the promise (not at install) in the heading.

---

## 13. obPerm1 (priority B)

**Current**
> Accessibility: only the first time you use Prompt help, ask about an error or press Do it for me, so it can read the box you are typing in or the text you selected, or press the button for you.

**Problem:** One 40 word sentence with three features and two jobs. Users will skim it and some will think it reads everything they type. It must say that it does not read keys.

**Suggested**
> Accessibility: asked the first time you use Prompt help, explain an error, or Do it for me. It lets Companion read the text box you are in or the text you selected, and press a button for you. It never reads what you type.

(Check: "never reads what you type" is the AGENTS.md rule 8 position, no key events. Prompt help reads the box contents when you press the key, so "never reads what you type" could be challenged. Better and exact: "It reads only when you press the key, and never records your keystrokes.")

---

## 14. obPerm2 (priority B)

**Current**
> Screen Recording: only the first time Companion needs to look at your screen, with a light on first: Show me, a lesson's step, Point at the problem circling what it found, or the same key looking at a problem in another app.

**Problem:** A long sentence with a colon list. "Show me" and "Point at the problem" are feature names the user has not met. The strongest line, "a light on first", is mid sentence.

**Suggested**
> Screen Recording: asked the first time Companion needs to look at your screen. A light comes on first, it looks once, and it does not save the picture.

(The picture is held in memory and not written to disk by Companion; the privacy note adds that Claude Code keeps a temporary copy that Companion erases. "Does not save the picture" is accurate for Companion, but to be careful use "Companion does not save the picture".)

---

## 15. obPerm3 (priority C)

**Current**
> Microphone: only the first time you hold the talk keys. macOS also asks about screen recording again about once a month; that is Apple's rule.

**Problem:** Mixes two things. The monthly prompt is useful to know but belongs under Screen Recording. Voice has never been tried by a person on a real Mac, so keep it low key.

**Suggested**
> Microphone: asked the first time you hold the talk keys. It listens only while you hold them.
>
> (Move the monthly note to the Screen Recording line:) macOS asks about Screen Recording again about once a month. That is Apple's rule.

---

## 16. obPermNone (priority C)

**Current:** `Nothing is asked now.`

**Suggested:** `Nothing is asked now. Companion will ask when a feature needs it.`

---

## 17. obFirstTitle (priority B)

**Current:** `Try something`

**Problem:** Vague. This is the first win and the hero. Name it.

**Suggested:** `See it fix something`

---

## 18. obMacTitle (priority C)

**Current:** `Your Mac`

**Problem:** Unclear what it is for without seeing the page. If it is the checks for Node, Git and Apple's developer tools, say it.

**Suggested:** `Does your Mac have what it needs?` (check what this step shows before adopting)

---

## 19. obPracticeTitle (priority C)

**Current:** `See it work first`

Good. Keep.

---

## 20. obPracticeHelp (priority B)

**Current**
> Companion will copy a small project with one thing wrong on purpose into a new folder in your home folder. You will see how Companion finds a problem, fixes it and proves the fix, so you know what to do the next time you are really stuck.

**Problem:** Accurate and clear. It misses two things a nervous user wants to know: it costs a little of their Claude credit for most practices, and it does not touch their own projects. The last clause is a bit long.

**Suggested**
> Companion copies a small project with one thing wrong on purpose into a new folder in your home folder. Your own projects are not touched. You will see it find the problem, fix it and prove the fix. Most practices use a little of your Claude credit, and the button shows an estimate.

(The estimate is stated as an estimate in the app until a real run measures it; the catalog says times and costs are estimates.)

---

## 21. obPractice (priority C)

**Current:** `Try it: ${title} (${time.toLowerCase()}, ${cost.toLowerCase()})`

Fine in form. Make sure `cost` always reads as an estimate, for example "about 20 cents" and not "20 cents", until a real run measures it.

---

## 22. obPracticePick, obPracticeSkip, obPracticeLater (priority C)

**Current**
- `Pick another practice`
- `Skip, I will use my own project`
- `The practice projects are on the Learn tab whenever you want them.`

All fine. Keep.

---

## 23. obOrOwn (priority B)

**Current:** `Or start with something of your own:`

**Problem:** "Something" is vague and sells poorly: the hero is not "start something", it is "get unstuck".

**Suggested:** `Or use it on your own project when you get stuck:`

---

## 24. Practice copy in S.practices (read for tone, not part of ob*)

**Current (signup)** `foundMore`:
> Companion ran the project's own checks. The ring is on the check that fails: it shows what goes wrong, and the line to change is somewhere else. Nothing was changed yet.

Good plain wording. One risk: "The ring is on the check that fails" promises a ring. The ring on a real screen has not been seen by a person. If the ring is missing on a user's Mac, this line is false. Suggest: "Companion ran the project's own checks and marks the check that fails." Keep if the hands on session confirms the ring.

---

## Summary of what matters most

1. **obWelcome2** says everything stays on your Mac. It does not. Fix before any outside user.
2. **obFolderHelp** says it never looks anywhere else. Soften or make exact.
3. **obKeyHelp** does not tell a beginner that it costs money or that a chat subscription is not a key.
4. **obPlanLater** is a promise the founder has not been able to make.
5. **obWelcome1** and **obFirstTitle** under sell the hero.
6. **obPerm1** to **obPerm3** are accurate but dense; split them and keep the light, the single look and "not saved".

## Things the first run should say once and not repeat

- "You bring your own Claude" (stated once, with the cost).
- "A light comes on first" (stated once, in the permission lines).
- "Stop everything" key, shown on the last step: the stop key is Control, Option, Command and X. This is not in the `ob*` strings today. Suggest adding a final line: `To stop everything at any time, press Control, Option, Command and X, or use the Companion icon in the menu bar.` (Check the keys shown match Settings if the user has changed them.)
