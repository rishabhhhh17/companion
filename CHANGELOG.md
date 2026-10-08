# Changelog

What changed, in plain words. Newest first. Written so it can be posted while building in public.

## Day 3: 9 Oct 2026

**"Done" now has to be earned.**

- After a task changes files, Companion checks the work itself before the character says Done: it builds, runs the tests, starts the project and opens it in a hidden browser.
- If a check fails, the error goes back to Claude to fix, up to two more tries inside the spending limit. If it still fails, the card says Not done and says why in plain words.
- A task that deletes a test to make the tests pass is caught.
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
