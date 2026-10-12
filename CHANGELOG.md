# Changelog

What changed, in plain words. Newest first. Written so it can be posted while building in public.

## The plan changes: teaching on any app: 12 Oct 2026

- **Decided (F17):** Draw it for me is back in the friends preview, and Companion gets a guided teaching engine (up to 15 steps, click detection, a progress log, resume after pauses, a proof check after each step) that works on any app on screen, with ready made lessons for Lovable, Vercel and Supabase and guidance for settings, env vars and keys. A solid ring goes only where Companion has confirmed the target; a guess gets a soft ring and is called a guess; low confidence is words only. The plan and the new friends preview date are in the M10 plan, waiting for approval.
- **Found:** the small model Explain uses was being told to "improve the prompt", so one explanation in four was about the prompt, not the work, and answers took 11 to 37 seconds. The fix comes first.

## The source files now say what the product is: 12 Oct 2026

- The project's rules file (`AGENTS.md`) described the first idea (five characters helping with everything). It now states the launch hero, "stuck while building with AI? press the key", and what is out for now. A new decision record (F16) holds that choice and the parked list. The rules about the screen and your clicks now describe exactly what the new features do. A refreshed launch readiness table (12 Oct) shows what is built, what is still to do (six items) and, honestly, that none of the new features has been tried by a person yet.

## Open your Lovable, Bolt or Replit project: 12 Oct 2026

- **About this project.** When you open a folder, Companion says in one line where it came from and what it is, for example "A Lovable project: Vite + React, with Supabase and Tailwind." It knows Lovable, Bolt and Replit exports, Next.js, Angular, Vue, Node servers, Python and plain pages.
- **Install packages** when a project's packages are not there yet (common right after an export). Only when you press the button; Stop everything ends it.
- **Settings it needs:** the names of settings the project reads that are not set on this Mac, the ones your page itself needs first. Names only, never a value.
- **Plain warnings** for things that trip people up: a package.json renamed to package.json.bak, a workspace with the app one folder down, settings that live in Replit's .replit file and need a .env file here.
- **Open from a link.** Paste a GitHub, GitLab or Bitbucket link, choose where it goes, and Companion copies it into a new folder there and opens it. Public projects only; a private one gets a plain sentence on what to do instead. It never copies into a folder that is already there.
- Lovable exports often carry two lock files; Companion now uses npm for them (the one that is kept up to date), and it never picks a package manager this Mac does not have.
- Checked on nine real public exports (three Lovable, three Bolt, four Replit, read only), and a real copy from GitHub.

## Reactions and celebrations: 11 Oct 2026

- **The character reacts as work moves.** A small nod when a check passes (one nod for a run of them, not five), a short wince when one fails, a cheer when a preview is ready, when you click the right thing, or when the before and after picture is in.
- **Two moments get a real celebration:** finished work that passed its checks (a task, or a whole plan, not every step of it), and your site going live. The character jumps and confetti bursts from it, once, for about a second and a half. It never covers a pointer that is still showing you something.
- Reactions are spaced out so they never feel twitchy, and they follow your Mac's reduce motion setting (no movement, no confetti; the character just glows green).
- **One switch turns it all off:** "Reactions and celebrations" on the memory page. Half of the beta group will have it off, to see whether it helps.
- No cheering words: the words stay as plain as before ("Done", "It is live").

## Your turn: 11 Oct 2026

- **The ring now waits for you.** When Companion points at a button, it stays there until you click it yourself. Click the right thing and the ring turns green with a tick and a small burst of dots (just the tick if your Mac is set to reduce motion). Click somewhere else and it says "Not quite. Click inside the ring." In a walkthrough, the next step follows on its own.
- **Do it for me** is always one button away. Companion presses it for you through Accessibility (macOS asks the first time). It presses only a plain button, link or tab that has words on it, never anything that sends, pays, deletes, publishes or answers a question (an "OK" in a dialog, for example), and the button is checked again at the moment of pressing.
- **No new permission to notice your click.** While the ring is up, and only then, Companion reads where the mouse is and whether a button is down, which any app may do. It never reads your keys or your screen for this. Checked on a real Mac with a test app that had no permissions at all.

## "This works now", with a picture: 10 Oct 2026

- **A before and after picture on every receipt** where Companion's checks opened your page. The earlier version of your project is copied into a private folder in Companion's own data (your project is not touched), started on its own, and photographed in the hidden browser. The two pages are compared by what they show, so the new thing is circled, not everything it pushed down. A change in colour or size is found by comparing the pictures. The receipt then says "This works now. What changed is circled." These are pictures of the app being built, never of your screen. The newest 200 are kept.
- It happens after the task has finished, so you never wait for it. Stop everything ends it, closing the earlier version and the hidden browser at once. Off the record tasks get no picture. If the earlier version cannot be pictured (too slow, a port in use), the receipt says so and circles nothing, rather than guess.
- **Real check** (Claude on the test login, about 7 cents): asked to add an "Add to cart" button to a sample page, the task passed its checks and the picture arrived 0.8 seconds after the receipt, with the button circled. A Vite and React project works too, with the earlier version starting in about 1.2 seconds. Next.js and other kinds of projects have not been tried yet.
- **The "it's live" card.** When your site goes live, Companion opens the live address once in the hidden browser and makes a 1200 by 630 picture (the size link previews use): your project's name, "is live", the address, the date, and the site itself. **Save picture** puts it in your Downloads folder (it never replaces a file that is there), and **Copy link** copies the address. Nothing is posted anywhere for you.

## Stuck? Press the key: 10 Oct 2026

- **Control, Option, Command and F** checks your project exactly as it is (nothing is changed, Claude is not asked, nothing is spent) and finds where it breaks. If the project's packages are not installed yet, it says so instead of installing them. Your editor (Cursor, VS Code or Windsurf, whichever you are in) opens at the failing line, and the character flies there and circles it with the error in one plain sentence. It works the same for a red error in your terminal, and for a button that breaks your page. **Fix it with me** then starts a rescue.
- A failed check during any task now remembers its place too, so **Show me where** points at it later.
- Finding the line uses your Mac's own text reader on a picture that stays in memory (a second one a moment later if your editor was still opening). No picture is sent anywhere for this. Stop everything, or closing the card, stops it before it looks.
- It reads the errors of TypeScript, Vite, Vitest, ESLint, Node, Bun and Python (tested on their real output), and it only ever points at files inside your project: never at the tools' own files, never through a link that leads outside the folder.
- **How well it finds the line** (on 280 realistic editor screens in dark, light and Cursor styles, three fonts and four sizes, scored against where the line really is): 280 of 280 in the right place, none in the wrong place. For very short lines like `}` it circles "around here" by the line number. The error in the terminal was found 280 of 280 times. About 1.3 seconds to read the screen. These are drawn editor screens; trying it in the real Cursor on your Mac is part of the next hands on session.

## Hotkeys for Show me how: 9 Oct 2026

- **Control, Option, Command and S** opens the box ready for a question about your screen. Type it and press Enter, or hold the talk keys and say it. Nothing is captured until the question is sent. The character now looks different when it is listening, looking at your screen, working out your words, or pointing.

## Real websites, and a check of your Mac: 9 Oct 2026

- **Aim on real, busy sites** (GitHub, Hacker News, Wikipedia, python.org, Vercel, Stripe, Supabase, npm; 44 questions): 41 right, and the 3 it declined were hidden "Skip to content" links that are not on screen, which is the right answer. About 2.6 seconds each. Costs about 30 cents per run of the test.
- **Your Mac check** in the first run: Node (and whether it is new enough to install packages while Companion works), Git, the page checker and the Vercel tool, each with a plain sentence and what to do. Nothing is installed or changed by the check.

## Screenshots never touch your disk: 9 Oct 2026

- A real check found that Claude Code saves a copy of every picture it is sent (as a file in its temporary folder, and inside its saved conversation). For Show me how that would have put a picture of your screen on your SSD. Fixed: the conversation is not saved, and the temporary folder is a small drive that lives in memory only, erased after each answer and removed when idle. If it cannot be made, nothing is sent. A repeat of the real check found no copy on disk. Founder to confirm this reading of the promise (see T12).

## See, hear and point; a first run: 9 Oct 2026

**The "talk to your screen" parts are built. They are tested everywhere a test can reach; what needs your Mac's permission has not been tried by a person yet.**

- **Show me how.** Type what you want to find and press Show me. A light comes on first, then one picture of the screen is taken (Companion's own windows and password managers are left out), card numbers, bank numbers, keys and tokens are blacked out on your Mac before anything is sent, and the picture lives in memory only. Claude names the spot, the Mac snaps it to the real button, and an arrow flies from the character to it with a ring and a short caption. "Next step" repeats it from where you are. If a password box is active, or Screen Recording is not allowed, nothing is captured. Stop everything removes the pointer and drops any picture.
- **How well it aims** (on 48 questions about rendered dashboards, settings pages and deploy pages in light, dark and dense styles, scored against where the buttons really are): 48 of 48 on the spot, and 48 of 48 on the exact button. About 2.6 seconds from question to answer, after making it faster (no thinking, a one line answer, and not waiting for the engine to close). A question that gets no answer in 30 seconds now ends with a message instead of hanging. These pages are cleaner than a real busy screen, so the real number will be lower; a harder set comes next.
- **Hold to talk.** Hold Control, Option, Command and V, talk, let go. Your voice is turned into words on this Mac by a speech model you download once (about 140 MB, checked against its published fingerprint). The microphone is open only while you hold the keys, never past a minute, a quick tap does nothing, and silence is told apart from a blocked microphone. Real check: a spoken sentence came back word for word in under a fifth of a second. The words go into the box; they are sent only if you turned on auto send.
- **A first run.** Welcome, connect your Claude (paste your key into a password box; it goes straight into the Keychain and is never logged or kept on the page), pick your project folder, up to four optional choices that each say what they change, what Companion may ask for and when, and a first task to try.
- A project's description and README are now part of what it knows.

## You choose the project folder: 9 Oct 2026

- A **Change folder** button (and a list of recent folders) on the card. It uses the Mac's own folder chooser, so Companion never takes your keyboard. Companion refuses a folder that is too broad (your whole home folder), a system place, your Library, Companion's own data, or a private settings folder like `.ssh`, and it cannot be fooled by a link that points there. Switching clears the old project's cards, memory and history from the screen.
- **Prompt help now gets the project.** Until now the hotkey never told the engine which folder you were working in, so the project facts and memory never reached it. They do now.

## It now knows what you are building: 9 Oct 2026

- Project memory now includes an "About" line from the project's own description and the first paragraph of its README (with its source). Badges, headings, code and lists are skipped, a README that is a link out of the project is never read, and anything private is refused by the same filter as every other line. Agents and Prompt help start with it, so "a booking page for a dog groomer" is known, not only the tech.

## Explain, Where was I, and putting it online: 9 Oct 2026

**Shared memory part two, and the last piece of Build mode.**

- **Explain:** after a task that changed files, a small "Why I did it" section under the result: two or three plain reasons and, sometimes, one quick multiple choice question. It costs a few extra words, so it says so. You can turn it off in the What I know page. It is not done for plan steps or off the record tasks, and a failure never disturbs the task. Checked with real Claude.
- **Where was I:** when you open Companion after 30 minutes or more away and tasks ran or finished meanwhile, three lines: what you were working on, what ended while you were away, and what waits for you. Written by plain code from Companion's own task history only (no model, so it is free and cannot invent anything). Off the record tasks are not mentioned.
- **Put it online (Vercel):** a button that runs every safety check, puts up a private preview through your own Vercel sign in, opens that preview in the hidden browser to check it works, and only then offers **Make it live**. Making it live asks twice, names the exact preview that was checked, refuses if the project changed since, and promotes that same preview instead of building again. **Roll back** is one more button. Everything that went online is recorded in `.companion/ships.json` in your project.
- Companion never holds a Vercel token. If you are not signed in it says: open Terminal and run `vercel login`. It never starts the login itself. The agent can never run a deploy, promote or rollback on its own.
- Found by the real Claude run and fixed: Companion's own memory notes were being mistaken for you editing a file, which paused plans. Its own writes are now recognised as its own.
- Honest limit: Vercel protects previews with its own login on some plans. If that happens the card says so and asks you to turn that protection off for previews. This part was built and tested against a stand in for Vercel; the real Vercel run waits for you to sign in.

## Shared memory, part one: 9 Oct 2026

**Companion now remembers, and you can see and change all of it.**

- **Project memory** (`.companion/project.md` in your project): what it is built with, how to start and check it, where it deploys, and the goal of a plan you approved. Filled in from your project's files and your approved plans, never a form. Every line says where it came from and when.
- **Your profile** (a private file in Companion's own folder): how you like to work. It learns only from what you say inside Companion ("shorter", "simpler words", "never touch the auth folder", "use Tailwind"). Never from your screen, other apps or your voice.
- **Agents and Prompt help start with it.** What is remembered is added to every task, plan, rescue, research and Prompt help, as background that your request always outranks. Claude Code's own hidden memory stays off.
- **What I know** button: read every line, Edit it, Forget it (it will not be learned again), stop learning for a while, erase a list, or see everything as text. A small note with Undo appears for ten seconds when something new is remembered.
- **Off the record:** a tick box for one task. It reads no memory, writes none, and the history and snapshot name say only "Off the record task".
- **Never remembered, in code:** health, money, relationships, moods, keys and passwords, contact details. Tested with many examples, including sneaky wording. When in doubt it skips the line.
- **A shared `AGENTS.md`** (plus a `CLAUDE.md` that imports it) so Cursor, Codex, Copilot, VS Code, Windsurf, Zed and Claude Code all start from the same project facts and house rules. Project facts only: nothing personal. If you already have these files, Companion asks first, then adds one clearly marked block at the end that you can remove with one button. Forgetting a line removes it there too.
- Checked with real Claude on the test login (about 5 cents): the facts, the preference, the shared files, an off the record task that left no trace, and forgetting a line.
- Next in this milestone: Explain and Where was I.

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
