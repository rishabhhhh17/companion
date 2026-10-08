# Changelog

What changed, in plain words. Newest first. Written so it can be posted while building in public.

## Hardening pass: 9 Oct 2026

**Before more features: making what exists hold up on other people's Macs.** No new buttons. Everything below is covered by tests (runner 1018, shell 99, pages 126), and the real Claude run of Build mode passed before the safety changes and needs one more run.

- **The engine can no longer hang the app.** If the engine stops answering it is restarted with growing pauses, a bad line from it cannot stall the app, and "Stop everything" kills a stuck engine instead of waiting for it.
- **Your files are safer.** Undo never follows a link out of your project, huge files and projects inside projects are left out of snapshots instead of breaking them, and only one thing at a time may write to a project.
- **Claude's reach is smaller.** Commands run in a sandbox that blocks writes outside the project and reads of private folders (keys, browser data, mail), and only lets installs reach the usual package sites. Anything that changes your project's own settings (.git, .claude, .companion) is refused. Commands inside `sh -c`, `env`, `xargs` and friends are now looked through.
- **Checks cannot see your keys.** Install, test and start commands get a short list of safe settings instead of everything in your environment. A start command that just finishes (a tool, not a website) is skipped instead of failed, and a stopped check also stops what it started.
- **Fewer false "Done" and false "Not done".** Tests switched off with `|| true`, `--passWithNoTests` or by commenting them out are caught, moved test files are not, and Python and Go tests count. The browser check never sends a write to a server while pressing buttons, always closes its browser, and says "skipped" if it cannot start.
- **Shipping checks read more carefully.** More key shapes (web addresses with passwords, bearer tokens, webhooks, more services), settings files that git does not ignore, files too big to read in the published folder, wide open database rules, renamed tables, and database code that builds tables while it runs.
- **Easier to use.** The character opens from the keyboard and with VoiceOver and says how many things wait for you. Questions that need you come first. Enter and Esc leave Chinese, Japanese and Korean typing alone. Changes in Prompt help can be read without colour. Buttons have unique names. Stronger contrast, a visible focus ring, high contrast and forced colour modes. Text can be selected and copied. "Done" stays about 12 seconds. A stop or an engine restart clears old plans and questions.

## Day 4 (night): 9 Oct 2026

**Ship, part one: the safety checks before anything goes on the internet.**

- **Check before shipping** (new button) runs every gate and says in one sentence whether the project may go on the internet.
- **Secrets:** it looks through your files and the built site for keys, tokens and passwords, including ones every visitor could read (like a secret hidden in a `NEXT_PUBLIC_` setting). A hit blocks shipping and names the file and line, never repeating the secret. Keys that are meant to be public (Stripe publishable keys, Supabase anon keys) are allowed.
- **Database:** for Supabase projects, a table anyone can reach without row level security blocks shipping. It reads your migration files, and checks the live database when connected.
- **Checked on this exact version:** nothing ships unless the project was checked, passed, and has not changed since. A gate that could not run is never counted as a pass. You can confirm a gate you checked yourself (like the live database), but never a blocked one.
- Tried on the real runner: a clean page may ship, a leaked key, a key inside the built site and an unprotected table are all blocked, and an edit after the check blocks it again. The deploy itself comes next.

## Day 4 (later): 9 Oct 2026

**Build mode, checked against real Claude, and four bugs found and fixed.**

- A script now runs the whole Build mode list with real Claude on a throwaway project: a house rule and Undo, Drive (plan, two checked steps, undo one step), take the wheel, Rescue (it found the real bug and fixed it), Research (three cited notes), the daily limit and the second model review. All seven pass.
- Bugs it found that scripted tests could never show: stopping real Claude was reported as a crash, so pausing and the Stop key ended plans in "error" (fixed: a stop is a stop); the daily limit was not counted until a job finished, so a second job could slip through (fixed: spending counts as it happens, including a run that hit its own limit); the second model could not see that a live key had been written into a page, because I hid it too well (fixed: it now sees "[hidden Stripe live key]"), and a leaked key in an ordinary file never triggered a review (fixed: any secret makes a change risky); and the pause took two seconds to show (now about a tenth of a second).
- Also fixed a hang where "Carry on" or Stop could arrive before the plan was ready to hear it.

## Day 4: 10 Oct 2026

**Prompt help: the thinking is done, the Mac parts come next.**

- The rewrite logic: code, links, commands and pasted errors come back exactly as you wrote them, a rewrite cannot balloon to many times your length, and the card will show a real word by word difference instead of two blocks.
- It knows four kinds of app (a coding agent in a terminal, a chat assistant, an app builder, anything else) and gives each its own kind of help. For terminals the answer is "copied, press Cmd+V".
- Project information is shared only for a folder you granted, only names and short lists (never file contents), with secrets removed.
- It may ask one short question, with quick answers to tap, and you can skip it.
- The safety rules are written and tested: password boxes and password managers are never read, each app asks once (once, always or never), nothing is read until the "reading your text" light is on, nothing is pasted if you moved to another app or box, and no text ever goes into a log.
- A set of 30 rough prompts and a scorer to measure rewrite quality later.

**Prompt help works on a real Mac.** In TextEdit: press the hotkey, a light shows first, the text box is read, a card shows what changed word by word, Use it puts the better version in, and Put my original back undoes it. Along the way we found and fixed three real problems: a freeze when changing hotkeys inside a hotkey, pastes landing in our own card instead of your app, and a simulated Cmd+V that did not land (the app's own Edit > Paste menu does). A free test mode lets this be tried without using any plan.

## Day 3 (night): 9 Oct 2026

**Rescue, Research and a second opinion.**

- **Rescue:** point it at a stuck project. It checks the project exactly as it is, then says in plain words what it is, what works, what is wrong (two sentences) and gives a 3 to 7 step finish plan you can edit and start. It only looks; nothing changes until you approve the plan.
- **Look up (Research):** ask a question and it files notes in your project at `.companion/research/`. Every note carries its web source, and notes without one are thrown away. It can only open public web pages (never this computer or a private network), and it writes no code.
- **A second model reviews risky changes** (packages, secrets files, login, payments, databases, or big changes) before they can be called done. It sees only text with secret looking values hidden, can use no tools, and a review that cannot be completed is shown as a gap, never as a pass. It is off until switched on, because it costs a little more.

## Day 3 (evening): 9 Oct 2026

**Drive got its safety rails.**

- **Fix loop breaker:** if the same failure happens three times in a row, the plan stops and asks: try a different approach, or stop here.
- **House rules:** a short list in `.companion/rules.txt` (for example "never edit pricing.txt", "ask before installing packages"). They are enforced in code, can only make things stricter, and the agent can never change them.
- **Daily limit per project:** the app keeps its own count of what each project spent today and stops new work at the limit.
- **Take the wheel:** the plan pauses within about a second when you change a project file yourself, or bring your editor or terminal to the front. Nothing more runs until you press Carry on, and your changes are kept. It only looks at which app is in front and which files changed, never at what you type.

## Day 3 (later): 9 Oct 2026

**Drive: a plan first, then one checked step at a time.**

- Type a goal and press Plan it. Claude looks around the project (it cannot change anything while planning, enforced in code) and writes a short plan in plain words, at most 12 steps, with a rough cost.
- You can reword or remove steps, then press Start the plan.
- Each step gets its own snapshot and its own checks, so any single step can be undone. If a step fails its checks after two fixes, the plan stops and says how far it got. One spending limit covers the whole plan, and the stop key ends it after the current step.

## Day 3: 9 Oct 2026

**"Done" now has to be earned.**

- After a task changes files, Companion checks the work itself before the character says Done: it builds, runs the tests, starts the project and opens it in a hidden browser.
- If a check fails, the error goes back to Claude to fix, up to two more tries inside the spending limit. If it still fails, the card says Not done and says why in plain words.
- A task that deletes a test to make the tests pass is caught.
- Found by trying it for real: a page whose button called a missing function passed, so the check now presses the page's plain buttons (never risky ones). Claude also "fixed" a failing build by turning it into `echo Build successful`, so weakening a build, test or lint step is now caught too.
- The card shows each check as it runs, says "Fixing a failed check" while Claude retries, "Fixed after 2 tries" when it worked, and "Not done" with the reason when it did not. Past tasks are listed under Recent tasks.
- Tested on small broken projects (a page with a code error, a failing build, a server answering with an error, a deleted test). Each must never reach Done, and each fixed twin must.

## Day 2: 8 Oct 2026

**Fixed the panel problem and set the launch order.**

- Found the cause of the focus bug from day 1: panels made by our chosen library activate the app on any click on the newest macOS. A panel built natively, "don't activate" from the very first moment, stays quiet, even with a web page inside. That is how Companion's panels will be built.
- The founder set the launch priority: agents that do the work come first and are the best part, then prompt help while you code, then shared memory, and the pointing feature last. Logic first, looks later.
- Proved the foundation of Prompt help: from another app, a hotkey reads what you typed and puts a better prompt back, exactly, in about a tenth of a second, and a password box is refused. Worked in TextEdit, the Claude app and claude.ai in a browser. Found and fixed two sneaky bugs along the way.
- Started building the real engine room: the message language, undo that never touches your git, safety rules that no instruction can talk past, and a runner that takes a snapshot, asks before anything risky, stops at its spending limit and hands back a receipt. 134 automatic checks, each proven by breaking the code on purpose. Then tried it with real Claude on a test sign in: it created a file, listed it on the receipt, and when asked to write outside the project, the safety gate said no and nothing was written. Each run cost a few cents of plan allowance.
- New for later: a calm, professional website and onboarding, and a parked Pro idea, a shared memory for people who already run their own agents.

## Day 1: 7 Oct 2026

**Checked the plan against reality before writing any code.**

- First experiment run: a panel on the edge of the screen that must never steal your typing. The approach the research recommended **fails on the newest macOS**: clicking it pulls focus away from the app you're typing in. Caught on day one, with a plan B already built and waiting for a test. This is exactly why we test the scary parts before building on them.

- Fact checked 129 things the plan depends on against today's official docs, library source code and open bug reports. 34 turned out to be out of date or wrong, and every one is now fixed in the docs.
- The biggest catch: the way we planned to package Anthropic's AI engine would have quietly replaced Anthropic's own signature on it, which their terms don't allow. Found in the build tool's source code, before a single line of ours existed.
- Others: ChatGPT's Mac app changed under the hood in July, a macOS change may soon affect apps that touch your clipboard, and a popular voice library has gone quiet. Each now has a plan B.
- Planned the first milestone: seven small experiments that test the scariest technical risks before writing real code. Can a panel float over full screen apps without stealing focus? Can we ship Anthropic's engine without changing its signature? Can we read and paste into other apps' text boxes? Can a pointer land on the right button? Can voice turn into text on your own Mac in under a second?
- Drafted (not sent) a question to Anthropic about using Claude plans inside Companion.
- Had eight independent reviewers check every doc against the research and the founder's rules, and fixed about 100 issues. The most important: as planned, commands the AI runs on your project could have read your Claude API key. Now they can't.
- Made four calls. The first milestone takes about three and a half weeks. Every user, free or paid, gets the real browser check before anything is called done. Companion will never touch your git history, not even to undo; it shows you the exact command or asks first. And we'll test a way to connect Claude that never puts an API key in Companion's hands.

## Day 0: 6 Oct 2026

**The foundation is in. No app yet, on purpose.**

- Wrote down what we're building in one place: a desktop companion with small characters on the edge of your screen that help you finish what you start. It builds and ships your project with proof, sharpens your prompts, shows you where to click, and tells you where you left off.
- Set the rules that never bend. You bring your own Claude, so we never pay for or resell AI usage. It never watches your screen in the background. It never steals your keyboard. It never changes your git history on its own: undo uses its own snapshots, and an agent asks before any git change. One key stops everything. "Done" means proven, not claimed.
- Recorded 27 decisions that are already made (12 from the founder, 15 technical) so we don't argue with ourselves later.
- Mapped every planned feature, from the first alpha to "someday", to the part of the code that will own it. Features that ship later should plug in without anything being rebuilt.
