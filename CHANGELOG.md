# Changelog

What changed, in plain words. Newest first. Written so it can be posted while building in public.

## Risky packages, the week, and payments ready but off: 11 Nov 2026 (in progress)

- **New packages are checked for known problems.** When a change adds a package or moves one to a new version, the review looks up only its name and version on OSV.dev, a free public list of known problems run by Google. Never your code and never your files. A known critical problem is a Must fix, a high one a Should fix, each with the fixed version to move to: "lodash 4.17.20: This package has a known serious problem: GHSA-..., fixed in 4.17.21." Works for npm, Python, Go and Rust package lists. If OSV.dev does not answer, the review says the packages were not checked, never that they are safe. Answers are kept on your Mac for a day. Turn it off in Settings, Fixing, More: Check new packages for known problems.
- **This week, when you ask.** A "This week" row in History opens a plain page for the open project: changes reviewed, what was caught (keys, weakened tests, dones that were not done, risky packages), fixes proven, Undos used, copies saved before destructive commands, and the decisions Claude Code is told at the start. Only from your own history, only when you press it, never a notification. An empty week says so. No streaks, no praise.
- **What we learned about memory.** We tested the start notes on real Claude Code sessions: Claude kept to your house rules and decisions every time, and without them it went against a decision in 5 of 6 tries. It did not make sessions cheaper or faster, so Squibby does not say it does. The notes no longer name the search command, which was never used. The command still works.
- **Payments are built and switched off.** Pro is now $15 a month, and a one time "Is this safe to go live" report for one project is $29, both through Dodo. What Free and Pro include is one list, with limits written as "with limits" until they are measured. Undo and Stop always work, at any limit. Nothing is charged and no checkout shows to anyone: payments need both the build's own switch and a remote switch, and both are off.

## Memory that is never lost: 10 Nov 2026 (in progress)

- **Claude Code gets your notes as each session starts.** In Settings, Fixing, under Start reviews sooner, you can let Squibby hand Claude Code a short block of notes when a session starts in your project: your house rules, decisions with their reason, and fixes that did not work. At most 30 lines, only what your code does not show. It stays the same for the whole session. It is added only after your yes, and Remove takes it out.
- **See exactly what Claude is told.** The top of the Memory page shows the block line by line, each with where it came from and Forget. House rules link to Settings, where you change them.
- **Fixes that did not work are remembered.** When a fix ends without proof, or the loop breaker stops it, Squibby keeps one line: what was tried and the check that still failed. You can forget it, or turn this off in Settings.
- **Claude can search the rest.** Notes that do not fit in the block stay searchable with one command on your Mac. Claude Code asks you the first time Claude runs it. Nothing is sent anywhere. (11 Nov: the block no longer names the command, since a test showed it was never used. The command still works.)
- **Export and restore.** Export notes saves every note, about the project and about you, plus the house rules, in one plain file you keep where you like. Restore from a file puts them back after a yes. Nothing is removed, and lines you asked to forget stay forgotten. Your notes are never lost: export them any time.
- **The shared AGENTS.md block stays small.** It holds at most 30 lines, most useful first. The rest stays in your notes file.

## What the real run found: 10 Nov 2026 (in progress)

We ran Squibby's fixes and reviews on a real model for under a dollar. Fixes worked 8 of 8 times. These are the things it got wrong, now put right.

- **A test loosened to pass is caught.** When a change breaks the code and also swaps an exact check for a loose one ("the total is 13" became "the total is not negative"), or changes the expected answer to match the broken code, the review now says Fix this first, with the file and line, even though the checks passed. Before, it said "Nothing blocks it".
- **The review no longer mistakes its own advice for a claim.** A review that said "run the checks again to confirm they pass" was read as saying the checks pass. Only what the change itself says counts now.
- **Failed checks in plain words.** Instead of the test runner's own output, the review says which check failed, the first test that failed and where: "The tests did not pass. The test file test/price.test.js could not run, because of a problem in price.js, line 3." The output itself is still there, behind Details.
- **Reviews, Explain and Prompt help book their whole cost.** The quick answers were counted before Claude had finished writing, so most of what they cost was missed. Your daily limit now sees the real amount.
- **Undo says what it leaves.** Squibby's notes for other AI tools (AGENTS.md, CLAUDE.md) are memory, not the fix, so Undo leaves them. When they changed during a task, the result and the Undo question now say so.
- **An open database table fix is proven by the database check.** A fix for a table anyone could read is called proven only when the database check passes again on the fixed copy. Otherwise it says it is only partly proven, and why.
- **A result that ends on a question starts at the start of a sentence,** keeping the first sentence, which usually says what went wrong.
- **Started inside another app's sandbox, Squibby says so.** Instead of "Claude could not be reached" and "Try again", it says the checks could not run because of that sandbox, and to open Squibby by itself.

## The safety net: 10 Nov 2026 (in progress)

- **A copy saved the instant before Claude Code runs a destructive command.** In Settings, Fixing, under Start reviews sooner, you can let Claude Code tell Squibby before each shell command in this project. When the command would throw work away (git reset --hard, git checkout or restore on files, git clean, rm -rf inside the project, a database drop or reset), Squibby saves a copy of the project first, then the command runs exactly as Claude Code decided. Nothing is blocked or changed, and if Squibby is closed or slow Claude Code goes on without waiting. History shows "Before Claude ran git reset --hard" with Undo, which puts the files back from Squibby's own copy, never through git. Squibby shows you the exact lines first, adds them only when you say yes, and one press removes them. Delete everything and leaving a project remove them too.
- **"Claude is waiting for you" in the notch.** A second hook, also only after your yes: when Claude Code asks for a permission or waits for you to type, the notch's mark goes amber and the hover panel says Claude is waiting for you in your project, with Claude Code's own short notice under it. It clears when Claude Code moves on, or after 15 minutes (you can pick 5, 15 or 60). The question itself never travels.
- **What the changes did not tell you.** At the top of a review, up to three plain lines: which files changed beyond the usual code (tests, CI and lint config, settings, dependencies), whether the checks were skipped and how many TODO lines were added, and whether the project's own checks are left failing. No extra model call.
- **Weakened tests and checks come first.** A skipped test, a run narrowed to one test, checks removed from a test, a lower coverage threshold, a CI step or script told to pass anyway, or a lint or type rule turned off is now the first thing a review says, as Fix this first, with the file and line. And when the words say the checks pass but the checks did not run here, the review says that too. A task's receipt says the same when its own words claim a pass its proof did not give. You can turn the weakened check rule off in Settings; it is on.
- **A key about to be pushed.** When a review finds a key in the code and the project has a git remote, the finding adds "If this is pushed, the key is public", and Copy for my AI tells the tool to remove it before any commit or push and to rotate it. Squibby runs no git command.
- **What Squibby caught this week.** History shows one line, and Now one row, counting false dones, keys in code, weakened checks, saved copies you went back to, and Undos in the last seven days, from your own rows. It shows only when there is something, and it is never a streak or a score. You can turn it off in Settings.

## Features, batch two: 6 Nov 2026 (in progress)

- **A report you can send a client.** On a proven fix, and on the checks before going live, Share report makes one plain page: "Is this safe to go live?", the answer, what was checked and how it went, what the review found, and what was not checked. It only says Ready when everything passed on this version. Keys and passwords are hidden, and code is left out unless you turn that on. Save it as a web page or a PDF wherever you pick. Nothing is sent anywhere.
- **Show me where to paste.** After Copy for my AI, one press rings the chat box of the AI app in front: Cursor, the Claude app, ChatGPT, or Lovable in a browser. A solid ring means Squibby is sure; a dashed one says it is a guess; otherwise it tells you in words. It looks only when you press, with the light on first, and asks for Accessibility the first time. You paste it yourself. Squibby never types into another app.
- **Walk me through it.** On a review or a fix, go through each changed place one at a time: where it is, what changed and why it matters in two plain lines, Open in my editor, Back and Next, and a one line summary at the end. The words come from the review and the fix, so it costs nothing extra.
- **Delete everything now also takes out the done signal.** The small "done" hook Squibby added to a project's Claude Code or Codex settings goes when you delete everything, or when a project goes to the Trash from Squibby. Only Squibby's own line is taken out.
- **Fixed: Home could stop drawing when the first review card arrived** while a review setting was read out of order. It now reads it the same way every time.

## Features, batch one: 6 Nov 2026 (in progress)

- **Reviews start when your AI tool says it is done.** In Settings, Fixing, you can let Claude Code or Codex tell Squibby the moment it finishes in this project, so the review starts then instead of after a quiet spell. Squibby shows you exactly the lines it would add to that tool's own settings file first, adds them only when you say yes, and one press removes them. The signal carries nothing of what the tool said, only "done in this folder". Without it, reviews start after the quiet time as before.
- **A pause before a task runs away.** When one task has used far more than a usual task in your project, Squibby stops it and asks: Keep going, Stop, or Undo what it did. Nothing more runs while it asks, and Stop everything still stops it. It never shows an amount. You can pick 3 or 5 times a usual task, or turn it off, on the Account page.
- **Your turn to sign in.** When the browser check meets a sign in page, the card says "Your turn: sign in, then tap Continue, or skip this check." Open the sign in page opens a window where you sign in yourself; Continue checks the page behind it. Squibby never types your password or reads what you type. Skipping, or not answering, means the page is not proven.
- **Pages that should need a sign in.** In a project with a sign in, a dashboard, settings, account or admin page that opens without signing in is shown as Worth a look, with what it means and how to fix it.
- **Choices for a vague ask.** Type "make it better" or "fix it" and Squibby shows a few choices from what it knows about your project, such as fixing the check that fails. Nothing runs until you tap one, and typing more words still works.

## Your way: 6 Nov 2026 (in progress)

- **Settings you looked for are easier to find.** How strict reviews are, the instant key warning (still off unless you turn it on) and How many times to try a fix are now on the main Fixing page. A line under Review changes says when a review starts.
- **A warning before the daily limit.** Squibby tells you once a day when a project has used most of today's limit, or half if you pick that. It never shows an amount. The most one task may spend now sits right beside it on Account.
- **Each project can review its own way.** Reviews in this project can follow the usual choice, or be Ask first, Automatic or Off just for that project.
- **Skip folders in reviews.** Add your own folders or files for reviews to skip, such as notes or exported data. Squibby's own list of build and package folders always stays.
- **Choose what counts as a stop.** Changes to sign in or payments can say Fix this first if you want. A key in the code and data open to anyone always do.
- **Reviews without Claude.** What a review may send to Claude: words and checks, or checks only, where nothing about the change leaves your Mac.
- **Files that never go to Claude.** Add your own names or patterns, such as clients or *.contract, on top of the built in .env and key rules, which can never be removed.
- **Safety copies your size.** Pick 1, 2 or 5 GB of room, and how long copies are kept. Starred saves and what Undo needs right now are always kept.
- **Quiet hours for the notch.** Pick hours when the notch shows no dot or line about changes to review. Home still shows everything.
- **A quiet close.** A review that finds nothing can close by itself after a few seconds. History says it closed by itself.
- **Biggest change to read file by file:** 50, 200 or 500 files.
- **Open when you log in.** Off unless you turn it on; Squibby asks first, and you can turn it off here or in System Settings.
- **How long reviews stay in History** is now also shown on the Privacy page.

## Fluid: 6 Nov 2026 (in progress)

- **Everything answers your press.** Places, list rows and their buttons sink a little when you press them, like the buttons already did.
- **Lists arrive, they do not pop.** Rows rise in one after another, all of them within a tenth of a second.
- **One highlight that slides.** Switching between Now, Learn, History and Memory slides one highlight to the new place and fades its colour, in both layouts.
- **Headlines change smoothly.** When Now's headline changes, the old words fade out where they were as the new ones rise in. Tags and dots fade to their new colour, so a fix turning proven goes from blue to green.
- **Home opens in order.** The headline arrives first and the list just after it.
- **The notch remembers you were just there.** Point at it again within a second and a half of it folding and the small panel opens at once.
- **The ask box suggests.** As you type, a short list shows above the box: your question first (Return still asks it), then matching actions such as Check my project, then things you asked before. Arrow keys move, Return runs, Escape clears.
- **Keys inside Home.** Once you click into Home, Command 1 to 4 open the places and the arrow keys move between rows. Nothing new works outside Home.
- **Fixing shows real progress.** A thin blue line under the step count grows only when a real step ends. A finished fix says how long it worked, from the engine's own times.
- **A small proven moment.** If you turned on the trackpad tap, it taps once when your fix is proven.
- **Kept, with Undo.** After Keep, "Kept" stays for ten seconds with Undo, which takes you to that fix in History and asks first, as always.
- **Empty History shows what will come.** A faint example row shows what a fix looks like there.
- **Calmer text.** List rows use a slightly smaller, tighter title, and corners are a touch tighter. Notes with no button go after four seconds and wait while Home is hidden.
- **More contrast when the Mac asks for it.** With Increase contrast on, lines and faint marks get stronger.

## Make it work: 6 Nov 2026 (in progress)

- **Your water character stays.** If you used the Friendly look and never picked a character, Home, the edge of your screen and Settings show the water character again, drawn whole beside the headline. Picking another character still works.
- **Back never loses a problem.** In the first run, Back closes Set up more and keeps the problem it found. Going back further, the project screen offers See the problem instead of checking again.
- **The found problem shows where.** The first run's found screen shows the file, the line and the line itself, under the plain reason.
- **The buttons are always in view.** A review's Fix it, Copy for my AI and Looks fine sit right under its headline. After you stop a fix, Undo what it did is the main button at the top.
- **A failed check says which one.** "The tests failed 2 hours ago" instead of "A check failed". Fix it on a failed check now says Starting the fix at once.
- **Practices answer where you press.** Start says Opening the practice copy right away. The key practice's button on Now says what it does (Let the pretend AI change a file), its card always has Copy for my AI, and a practice that tries again says Trying again (2 of 3) on its own card.
- **One name.** Squibby is the product; the character goes by Squibby too unless you name it. The key is called Check my project everywhere, and the notch's button over a failed check says Fix it, as Home does.
- **One story on who pays.** Settings no longer says anything costs you money: Squibby pays.
- **History is one list.** Reviews sit in the same list as tasks. Opening a task shows Star and Name it right under it, and a starred task shows a filled star.
- **Forget can be undone.** Forget says Forgotten, with Undo for a few seconds, before the note goes for good.
- **Clearer options.** More ways to ask shows all of itself, and each switch has one line on what it does. Stop sharing these notes says what it removes. Odd words in Settings are plain now.
- **Easier with VoiceOver and the keyboard.** Rows say what they do and to what ("Forget: Uses pnpm"), the keyboard comes back to the row after Edit or Start over, and a practice under way can be started over.

## Black, with colour that means something: 5 Nov 2026 (in progress)

- **One look: black like the notch.** Home and the notch's small panel are one black surface now, with no blocks of navy, grey or purple inside it. Colour only marks what something means: blue for Now and actions, purple for Learn and practice, orange for History and changes to look at, pink for Memory, green for proven and red for a real problem.
- **Every place has its colour tile.** Now, Learn, History and Memory each have a small coloured square, like the Mac's own Settings. Settings is a grey gear.
- **Now is one clear column.** A tag, a headline, one line and one main button, with the character beside them. Under it, one list of what happened since, at most three rows, each with its own colour and action. Home is as tall as what it holds, so there is no big empty gap.
- **A practice says Practice ready.** A practice waiting for you is purple and says Practice ready, never Needs you, and it has a button to open it.
- **The key hint has words.** "Press ⌃⌥⌘F when stuck", or it steps aside when there is no room.
- **The notch's small panel matches.** The one fact has a coloured dot, and each button has its colour tile.
- **A small moment when a fix is proven.** The green tick draws itself in and the Visor smiles. Reduce motion shows it already drawn.
- **Fewer look settings.** The Look page keeps Colour (Colourful, or Calm with blue only), Character (Visor, Glass orb or Water), Layout and Text size. Older look choices you saved still load and are simply ignored.
- **Learn, History, Memory and Settings have the same shape.** Each opens with one clear lead, then one list. Learn leads with the next practice on a faint purple card, then every practice with its own coloured number and its time. History shows each task with a tile in the colour of how it ended: green proven, red failed, grey stopped, orange undone. Memory lists each note with where it came from and Forget on the right. Settings has a coloured tile for each section, like the Mac's own.
- **The first run looks like the rest.** The ways to start are one list with coloured tiles, and the welcome fits without scrolling.
- **Said once.** Changes to review no longer repeat how many files changed under the headline, and the headline stays in view when the review card comes in.
- **A practice ready on Now says what it is.** "A Join button that fails, on a practice copy." instead of what the button does.
- **The old rooms are gone.** The coloured light behind Home, the sea and the glows are removed for good.

## Fix it means fix: 5 Nov 2026 (in progress)

- **Fix it fixes the line it found.** When the check finds one line, Fix it now makes one small checked fix of that line, instead of planning first. When nothing specific was found, it still looks deeper first. You can still pick Look deeper first in Settings.
- **Fix it answers at once.** Pressing it says Starting the fix right away, and the problem stays on screen until the work really begins. If the fix cannot start, the problem stays and Squibby says why.
- **You can see how many tries there are.** A fix that fails says Try 2 of 3 (the number comes from the task itself), and the stuck card shows the steps Squibby tries next: try a different approach, look up this exact error (only when Let tasks search the web is on, otherwise it is not shown), then go back to the last working version and plan. The main button is the step the list marks as current, in the same words.
- **Last working.** Squibby remembers the last version of your project whose checks all passed. When a fix is stuck, you can go back to it: Squibby asks first, makes its own safety copy, and then plans the next step from there. History marks it.
- **Star or name a save.** In History, star a save or give it a name. A starred or named save is never cleared away, and it is still there after a restart. It is kept in Squibby's own folder, never in your project or its Git.
- **Undo says what it cannot bring back.** Under every Undo: it puts your files back, but not a database, a live site, emails sent or installed packages.
- **A sign in page is said plainly.** When the browser check meets a sign in page, the result says the page needs a sign in, that Squibby never types passwords, and that what is behind it is not checked. The browser check shows as stopped at the sign in page, not as a tick. A way to sign in yourself and carry on the check is not built yet.
- **After Stop, Undo what it did is ready.** A stopped run that changed files shows Undo what it did as the main button. Nothing is undone until you tap it, and a stopped run never counts as a fix.

## A first run that shows both jobs: 5 Nov 2026 (in progress)

- **The welcome says both jobs.** "I look over every change your AI makes, and fix what breaks."
- **One optional question: which AI do you build with?** Lovable, Bolt, Replit, Cursor, Claude Code or something else, or Skip. It only picks a tip about where Copy for my AI's words go. It stays on this Mac, is never sent, and Settings can forget it.
- **A new first practice: a key written into the code.** Press the button and the practice's pretend AI changes one file, writing a made up payments key into the code, the way AI tools sometimes do. Squibby's review stops it with its own rules, with Copy for my AI and Fix it beside it. Fix it moves the key to .env.local, with a safety copy and Undo. No model, no sign in and no cost. It works only in its own practice copy.
- **Fix it stays in view on the first check.** The optional parts (Make it yours, more tools, how you like things, keys) wait behind one Set up more (optional) link.
- **Small wording fixes.** A cost under a cent says Less than 1 cent, never About less than 1 cent. A passing check is titled Checks pass and names the button that is really there, Look at my screen. More ways to ask shows the first way's line as soon as it opens. A one minute practice says About 1 minute.

## Findings with a fixed shape, and a finish line for going live: 5 Nov 2026 (in progress)

- **Every review says how ready it is, in one line.** Ready, Check these 2 things, or Not safe yet. It is never Ready when something must be fixed, when your checks failed, or when they did not run.
- **Every finding has the same four parts.** Must fix comes first, then Should fix, then Worth a look. Each one says what is wrong, what it means for you, how to fix it, and when it may be fine on purpose. The top finding shows them on the card (the headline, one line of what it means, then how to fix it and, where it can be, when it may be fine); the rest are under Why does this matter. A key in the code is never fine, so that part is left out there, and the button that closes the card says Leave the key in the code instead of Keep it anyway. There is no score.
- **The check before going live ends on one button.** When every check passed, Put it online is the main button, and it uses the check that just passed. A blocked check has its own Fix it, which says Starting the fix at once and keeps the problem on screen until the fix begins.
- **Sign in to Vercel without Terminal.** When you are not signed in, the box says your browser opens Vercel's own sign in page and that Squibby never sees your password. Press Sign in to Vercel, open Vercel's page, sign in there, then press Check again, which runs the check before going live (it does not put anything online). Stop signing in ends a sign in that is still waiting. If that cannot work on your Mac, Show me the steps walks you through it.

## Review fixes for Fix it, the first run and going live: 5 Nov 2026

- **The stuck card says one thing.** "Pick one of the choices just below" replaces a line that pointed at the ask box, the title is not said twice, and the list of next steps matches the buttons. A saved version with no known time no longer shows "(Last working)" in brackets.
- **Fix it works at once, and says so.** After you press it the page says Fixing it (not the raw error), nothing says Needs you, Stop is there, and Close is not offered while the fix starts. The Fix what the check found chip waits too.
- **One count while it works.** A retry shows "Trying again (2 of 3)" and no second "2 of 4". The clock never reads less than the checks already listed, and the line under the title no longer promises an Undo button that is not there yet.
- **Going live and the page agree.** After the check before going live, the page no longer says Not checked yet over a card that says Ready; it says the checks pass, or that it is not ready to go online.
- **A finished practice is one main step.** Next is the main button, Undo is quiet, and Back to my project, Start over, Remove my copy and Close sit under More with a line on what each does. The key practice says Found it once.
- **The first run keeps Continue in view.** Continue and Skip stay at the bottom, the question about which AI you build with is behind one link, and the check button says Look for problems in your project, with a line that it reads your files and runs your tests.
- **History marks are tags.** Last working, Starred and a name are separate tags, Last working says what it is for, and Remove star looks like Star.
- **Going live to Vercel.** Check again after signing in only checks (it no longer starts a preview), Stop signing in ends a waiting sign in, and the old "press Sign in" line is gone once you have pressed it.
- **After Stop, one main button.** Undo what it did is main; Carry on is secondary.

## A practical notch: 5 Nov 2026

- **Squibby stays on until you quit it.** macOS could count Squibby as an app it may close by itself to free memory, because it has no ordinary window; that is now off. Closing a window, a `kill` from a terminal or a problem in Squibby's own code no longer ends it without a word: a problem opens it again once and it tells you, and every ending leaves one plain line in ~/Library/Logs/Squibby/exits.log saying what ended it.
- **The notch looks like the notch again.** Nothing sits beside it while Squibby rests, and there is no hello when you start or wake your Mac. While a job works you see one small mark, and a question shows a small amber dot. Both old looks are still in Settings if you liked them.
- **Rest the pointer on the notch for a small panel.** It leads with one useful thing, such as "my-shop: 3 changes to review" or "my-shop: not checked yet", with Settings and Open beside it, and a few buttons under it: Ask, Review changes, Check my project, Check before going live or Undo last change. After a failed check the button says Find and fix the problem; with no project it offers Pick a project. While a fix runs, the panel shows the fix, its time so far and Stop. No greeting and no character in it.
- **One more click for everything else.** Settings opens Squibby on Settings and Open opens Squibby. Each button opens Squibby at the right place, growing out of the same black shape, with no flash of the bare notch in between. Your app keeps the keyboard until you click into Squibby. Move away and the panel folds back, its words fading out instead of blinking away.
- **Clicks beside the panel reach what is behind it.** A click just past the small panel's round corners, or where the panel was while it folds away, now goes to the menu bar or the app under it. While Squibby grows out of the panel, the black you see beside the notch is Squibby's, and nothing you cannot see takes a click.
- **Settings says what the panel does.** The help for pointing at the notch, the hello and Your name no longer promise a greeting on hover. Your name is used only by the hello, if you turn it on.
- **Smoother and easier to read.** The panel's corners grow and fold with it instead of jumping, its words wait until there is room for them, the mark beside the notch steps aside while the panel says the same thing (the listening and screen marks always stay), and the edges of the black shape no longer show thin grey lines. In the White look, Squibby opened from the notch is now light with dark words instead of dark words on black.
- **Small fixes in Home, Settings and the first run.** The first check now says what could not run and how to fix it, as Home does. Pressing Return while a job works keeps your words in the box and says to wait, instead of sending them and showing an error. Plan it and Look up with an empty box say what to type. Forget everything says Forgotten only once both erases are done, and shows why when one could not be.
- **Fixes from the bug bash.** Stop everything now also stops a Check my project you pressed again while the last one was still ending, so nothing starts after you press it. The receipt offers a command to take back a Git commit only when a plain commit was made on the same branch; a branch switch, a pull, a merge or a rebase is said plainly, with no command that could lose work. A page behind a sign in now counts as "not checked", never as broken, so Squibby never asks Claude to take your sign in out; a page that only answers with a plain error is still reported as broken, and Fix it can take over. Risky database commands, and project scripts or tools that write Git, now ask first and name what they touch, also in a package of a bigger project, and Undo brings back a database file even when the command stepped into its folder first. On a Mac where the safety box for checks does not work, the first run now shows its question instead of waiting unseen. After Squibby's own task and a restart, "Changed while Squibby was closed" lists only the other tool's changes. "Don't flag this kind here again" is no longer offered on a Fix this first card.

## Clearer screens after a fix and a review: 4 Nov 2026

- **No key, no cost.** Squibby pays for the AI it uses, so nothing asks you to connect Claude or add a key: the notch says "Squibby is getting ready on this Mac" instead, and an engine problem says it is on our side. Home, the notch and the practice no longer show what a job cost. Your own Claude key is still there for developers, under Settings, Account, Show all options.
- **The payments warning only when it is true.** "Anyone who sees the code can spend your money" now shows only for a live payments secret on the exact line Squibby points at, not for a public or test key or a key on the line next to it.
- **No made up address on the before and after pictures.** The little browser bar no longer shows your folder's name as if it were a web address.
- **Squibby points at the real code.** When a review finds a secret password in your code, the card shows the line before, the line itself and the line after, with line numbers, instead of just "line 12". The password itself is never shown: only how it starts, such as `sk_live_…`.
- **Plain words for secrets.** "A key is written into the code" now reads "A secret password is written into the code", and for a payments key "Anyone who sees the code can copy it and spend your money". Your Fix it keys are called your Fix it shortcut, so the two are never mixed up.
- **The same buttons for the same problem.** A secret password found before any review now has Fix it, Copy for my AI and Keep it anyway, like a review that found it. Fix it runs the review first and then asks before changing anything. Keep it anyway still never stops Squibby from warning about a password.
- **A proven fix says what got fixed.** "Sign up button fixed. Checked in a browser in 6 seconds." at the top, then Keep and Undo right under it, then the page before and after the fix side by side. Keep closes the result; the fix stays in History and in the Last fix card.
- **A fix that did not work says so once.** "The sign up button is not fixed yet." with the reason under it, then where it stopped, the line, and Try a different fix, Copy for my AI and Undo this change.
- **Only the checks that really run.** While a fix runs, the list shows Changing the code and then Checking the work. Each check (the build, the tests, the browser) appears once Squibby starts it, so a project with no tests never shows a tests step that was never going to happen.
- **The Last fix card tells the story.** Its title is the outcome, it has a one line why, the before and after pictures and the checks that passed. With nothing new since, it takes the whole width instead of an empty Since then card.
- **An approval asks once.** "Squibby needs your OK to add a tool." is the title; Stop moves to the top bar. Allow and Don't allow keep equal weight on purpose.
- **Friendly looks like the rest.** No wave band across the top, main buttons and the send arrow in the accent colour, and nothing fades over a card's buttons in any look.
- **Small fixes:** About shows "Squibby 0.9.2" and its channel; Save a log for support is its own row; the erase buttons in Memory look like buttons; the setup step says what went wrong and what to do; the top bar no longer repeats when it was checked; buttons in a row are all the same height; the change in a proof picture is marked in green.

## Fix it shows its work, and proves it: 4 Nov 2026

- **While it fixes, you see a list of steps.** The change itself in your words, then each check as it runs (Building and checking the code, Running the tests, Opening it in a browser), each with Done, Running or Failed on the right and how long it took. "2 of 4" says how far along it is, the same as the notch. What it is doing right now ("Changing signup.js") sits under the first row.
- **The result takes the list's place.** A proven fix says how it was proven, for example "Checked in a browser in 5 seconds." Under it, each check that ran, with the command it ran and its exit code ("npm run build · exit 0"), and the picture of the page after the fix in a small browser frame. The separate "What was checked" card under a result is gone, so a stale "Checking the work" can never sit next to a finished fix.
- **When a check fails, it leads with what failed.** "It stopped at: running the tests", the reason in one sentence, and the line it points at ("Squibby is pointing here"). Then Try again and Copy for my AI, which copies the step, the reason and the line for your other AI tool.
- **Replay what Squibby did.** A button beside Undo plays the steps of the fix back, one row at a time, from what the app already kept.
- **The notch shows a small receipt.** After a proven fix it drops down with the fix, how it was proven, the picture, and Keep, Undo and See proof. Keep folds it away.
- **No cost line under a result any more.** Squibby pays for the model.

## The Visor, the new character: 4 Nov 2026

- **Meet the Visor.** In the Instrument look the character is now a glass orb with a dark band across it and light behind the band. At rest two small lights blink every few seconds. While it works one bar of light scans side to side. While you hold to talk it shows a small pulsing meter. When it needs you the lights turn amber and it leans in a little. When it stops on something the lights go red. When a fix is proven the light curves into a smile and it gives one small hop.
- **It shows everywhere the orb did:** Home, the character on the edge of the screen, the notch (just the band, with its lights), the questions under the notch, the practice panel and the first run. The ring round it still shows the state.
- **It stays calm when you ask.** With Reduce motion or Less motion it holds a still pose for each state. Set How lively to Still and it stops blinking. It never moves while its window is hidden.
- **The other characters stay.** Settings, Look, Character now offers Match look, Visor, Glass orb and Friendly. If you picked Glass orb before, you keep it.
- **The notch is never empty now.** Small black wings sit beside the notch even when nothing runs. The left one shows the Visor's lights, blinking. The right one shows one short count, such as 3 changes, or a green tick after a proof, and nothing when there is nothing. Settings, General, More options, Notch, Show wings at rest turns them off.
- **A short hello in the notch.** When you start the app, wake your Mac or come back after more than an hour, the notch widens for about 3 seconds: "Hey Sam" and one plain fact, such as "my-shop has 3 changes to review" or "Everything checked is fine". Only on a Mac with a notch, at most once an hour, never while a call app such as Zoom is in front, and never with a sound. It checks only which app is in front, so Hide from screen sharing is what keeps it out of a share. Turn it off with Say hello in the notch.
- **Tell it your name if you like.** The first run's Make it yours screen and Settings, Account, Your name ask what to call you. It is only used for the hello. Leave it empty and the hello says Hi there. The app never reads your Mac's account name.
- **The Visor moves as one piece, and then rests.** When it leans or hops, the coloured ring now moves with it, so it never looks loose inside its own ring. At rest it blinks three times and then holds still until something new happens. When it needs you it leans in twice and then waits upright, so a question that waits for minutes does not keep rocking at the edge of your screen.
- **The notch smiles after a proof.** Beside the green tick, the band's light now curves into the same smile you see on Home.
- **Hold to talk looks the same everywhere.** Home shows the same blue ring as the edge and the notch while you talk, and the soft glow that only the friendly character used is gone from the orb and the Visor.
- **Home says Working once.** The grey line under the Working headline no longer repeats it.

## Smooth and flowy, Home grows out of the notch: 4 Nov 2026

- **Home now grows out of the notch as one black shape.** The notch stretches sideways in the menu bar, then drops down into Home, and Home's words arrive once the shape is mostly there. Closing folds it back into the notch with no bounce. Home is the same black as the notch, with no line or gap where they meet.
- **The notch answers the moment you point at it.** It grows a little at once, and opens Home after about a third of a second (it was 0.4 s; change it in Settings with "Open the notch after pointing at it for").
- **A Home that pointing opened folds away when you move off it,** after the same short wait as the notch's status ("Close it after moving away for"). Once you click into it, it stays until you close it. With "Close Home when I click another app" off, it never folds by itself.
- **Clicks beside Home land where you aimed.** The menu bar and the apps beside Home take their clicks first try, and a click beside Home never takes your typing away from your app.
- **Home never hides what matters.** The Show me how arrow draws over Home, and the folder chooser and the Delete everything question show in front of it.
- **Home changes size in one step.** When a result arrives or Settings opens in the tall Home, Home takes its new size at once, so nothing shows outside it, and Settings gets its full width again.
- **Stop everything closes Home too.**
- **On a Mac without a notch,** the small pill now hangs from the top edge, and Home grows from it the same way.
- **Settings opens at its full size again in the tall Home.** It opened squeezed to the height of the place you came from (about 300 points, with only a sliver of its page showing). Now it takes its own height every time: from the Settings button, Command comma, the menu bar and the notch's Add your key.
- **Moving between Now, History, Memory and Learn is quicker.** The new place starts to appear halfway through the old one leaving, so Home is never empty in between (about 80 ms from the click, it was about 150).
- **The rays of light no longer jump** when a job starts or stops. They keep one slow sway, and while work runs a brighter layer fades in over them.
- **The character on the edge no longer jumps when it starts or stops work.** The word under it fades in and out in its own place, so the character stays put (it used to hop about 14 points).
- **The character comes in from the edge quickly, with no bounce.** Going back out is a little quicker still. Its water splashes as the move ends, not at a guessed time.
- **Trips across the screen are smooth.** When the character goes to the window you are working in, it now moves once per screen refresh, on the screen's own clock, so it no longer stutters on a fast screen.
- **The water ring stays on the cursor when you sweep fast.** Every move now lands a touch ahead of a moving pointer, and settles exactly on it when you stop. Before, this only happened the first time the ring showed.
- **With Friendly picked, History, the notch and the practice panel open without a freeze.** The small live character used to start its drawing as they opened, which froze the screen for about half a second. Now the drawing is prepared in a quiet moment and handed over ready; until then you see its picture.
- **Thinking shows at the character.** A small turning arc sits on its shoulder while it thinks, instead of an empty box waiting for words.
- **The character's pictures fade from one state to the next** instead of swapping in place (with Draw live off).
- **Prompt help no longer makes Home wobble while it writes.** Its words appear a few at a time, whole words only, in a box of four lines that keeps its size, with the oldest words fading out at its top. Home grows once, when the answer is ready.
- **The words at the top of Now no longer jump** while a job works or finishes. They keep room for two lines, and new words fade in instead of popping.
- **A card that needs you scrolls into view gently** instead of jumping there. While Home is opening it is simply in place.
- **A proven fix lands once.** The tick draws in and the card glows softly one time, the first time you see it. In a practice, the line into its last step fills in first. Coming back to it later, it is just there. No score, no praise.
- **A practice copy is checked when you first open it,** so Home and the notch say how it really is, instead of Not checked yet.
- **Each result now says how big the change was,** counted from the files themselves: "Changed 3 lines in login.js", or "Rewrote the whole of index.html, 412 lines". When a short ask changed a lot, it says so plainly, so you know to look before you keep it.
- **Every result ends with two or three quick buttons:** What changed, Explain this, and Fix it after a check that failed. Fix it asks first, and keeps a safety copy that Undo puts back.
- **In the tall Home the ask box keeps room for two lines,** so typing a longer ask no longer pushes the page down.
- **Home opens and closes as one clean shape.** Its words used to show a moment before the black shape had grown under them, as a faint second box below it, and stayed while it folded away. Now the words come once the shape is there and leave first, and only then does Home fold back into the notch. No faint line across Home while it grows, either.
- **The notch's hover line waits for its shape.** The words show once the black has grown under them, and fade before it tucks back, so the edge never cuts through them. The shape's settle is also smoother: it no longer changes speed halfway.
- **With a task running, the notch's wings stay put** as Home opens and closes over them. Home grows out of the wings and folds back into them, instead of the wings vanishing and popping back.
- **A Home you pointed at, then clicked or typed into, stays.** Before, a very quick tap or a key could still let it fold away when the pointer drifted off. And it never folds on its own while a question or an approval waits for you.
- **Clicks beside Home keep landing where you aimed** after you open Home again while it is folding away, or open it with a key.
- **The character no longer flies off** when a setting or a display changes while Home is closed.
- **New: Tap the trackpad when the notch opens.** A light tap you feel when you click or point at the notch. Off unless you turn it on (Settings, More options, under Notch).

## A grown up look, second part: 4 Nov 2026

Three separate reviewers looked at every screen of the new Instrument look. What they found is fixed. With Friendly picked, Home looks as before, apart from two small fixes that help both looks (the last two points).

- **The glass orb is quieter.** It is one deep blue ball lit from the top left, with a soft shade at its foot. The big white shine, the sparkles and the light ring inside its edge are gone. Its state ring is a little thicker and sits a little away from it, and while it works the ring is a lighter blue, so you can see it against the ball.
- **Cards are flat.** No blue glow, halo or tinted wash around a card any more, and no breathing blue edge on the working card. A card is the page's own grey with a thin line round it. Colour is kept for meaning: red stop, amber needs you, green proven.
- **The ask box is calm.** Home puts the cursor in it every time it opens, so its bright blue frame was always on and was the loudest thing on the page. Now its edge is grey, a little brighter on hover and brighter again while you type.
- **A key in the code says so clearly.** The line over the headline says Fix this first in red, the ring and the mark in the list on the left are red too, and the headline names the file: "A key was written into pay.ts". Under it: "4 files changed. One looks risky." It used to say the same sentence two or three times.
- **Clearer review words.** "Review them" is now "Review changes". The line about what a review does is two short sentences: "Review runs your tests and a browser check on a copy. Your files are not touched." Passed tests under a stop no longer show a green tick: the chip says "Tests passed. The key still needs fixing." On a stop, Looks fine is now "Keep it anyway", a quiet text button. Copy for my AI shows a copy drawing, not an arrow. History says "You copied it for an AI tool".
- **A result reads in order.** What changed comes first, then Undo these changes. Nothing fades over the bottom of the card any more; the page scrolls, and a thin line marks where it goes under the ask box. In the tall Home, the line that says when it was checked is now at the very bottom of the page.
- **The same sizes everywhere.** A screen's title is one size, even when a card under it needs you. A card's own title (Fixed and proven) is the card size, not a second page title. The project's name and the Settings back arrow now line up with the page's left edge, and both side lists mark the open place the same way.
- **Small tidy ups.** The working card says "Looking for the problem" before its first step, instead of a second "Working". Lines between rows in a card are inset on both sides. History's review mark is the same size as a task's, and its note lines up with the rows.
- **The character on the edge of your screen agrees with itself.** While a question waits for you, its ring is amber and the word under it says Needs you, never Working. The count on it is amber too.
- **For both looks:** the notch's question card no longer runs off the right side of its panel, and History's file names use the same code font as the rest of Squibby.

## A grown up look, first part: 4 Nov 2026

- **Squibby has a calmer, more grown up look, called Instrument.** Smaller headlines, small corners, rectangle buttons, thin lines between things and colour only where it means something. The main button is a deeper blue with white words. Graphite is now the soft dark grey of the new look.
- **The look from before stays, called Friendly.** Pick it under Settings, Look, Style. It looks exactly as it did.
- **A new Character choice** on the same page: match the look, a small glass orb with no face, or the friendly one with a face and bubbles. This part adds the choice and the orb; Home and the edge of the screen start using the orb in the next part.
- **The light behind Home and the glossy button moved to More options** on the Look page, so the page stays short. Both still work as before.
- **Around Home, the same calm look.** The character on the edge of your screen, in the notch and in the practice panel is now the small glass orb. A thin ring round it shows its state: the accent while it works, amber when it needs you, green when a fix is proven, red when it stopped. Settings' list of pages marks the open page with a plain grey row, and the notch's panel has smaller corners. The notch stays black. With Friendly picked, all of it looks as before.
- **Home and the first run in the new look.** A short status line with a small dot (Working, Needs you, Proven, Not fixed yet) sits over a smaller headline, with one sentence under it. The small glass orb sits at the top right, its ring in the same colour as the status line, with no water under it. The ask box is a quiet field with its keys inside, and a line at the foot of Home says when the project was last checked and when Undo is ready. The tip under the ask box and the extra sentence under a result are gone in this look. The first run shows the same orb, with no rising water. With Friendly picked, Home and the first run look as before.

## Reviews of changes, checked again: 4 Nov 2026

A review of the work above found six places where it fell short. Each now has a test that failed before the fix.

- **Changes from while Squibby was closed stay on their own card.** A save made after opening used to join that card, drop its "while closed" label and, with reviews on Automatic, start a review by itself, with your project's checks. Now the card from while closed never grows. A later save waits and becomes its own card once you close the first one. The card from while closed is never reviewed by itself, and your project's checks run on it only when you ask for them.
- **Only your own press can quiet a kind of problem.** "Don't flag this kind here again" still saves a line in What I remember. But that file sits inside your project, so another tool or a project you copied could write the same line there. Now the line counts only if you pressed the button for it, which Squibby notes in its own folder on this Mac. Forget the line and the problem shows again.
- **Quiet no longer hides a changed key file or data every signed in account can read.** Those two are now shown at every strictness, like a key in the code and data open to anyone.
- **Reviews never say an AI made the change.** Squibby cannot tell another tool's edits from your own. Claude was still told "another AI tool made this change", so its summary could say "Your AI changed the price". Now it is told nobody can know who made it, and any sentence that still says an AI or a named tool made, fixed or broke something is left off the card and out of History.
- **The key warning is off unless you turn it on.** It looks at the changed files without asking, so it waits for the founder's yes before it is on for everyone. The privacy notes now say so.
- **The folder watcher was tested on two more cases on this Mac:** a long pause between saves (two separate cards, nothing lost) and closing and opening the folder again (the first save after opening arrives). It was also tested with the real review and the real undo copies, not only the watcher on its own.

## Reviews of changes, every day: 4 Nov 2026

- **Changes made while Squibby was closed are no longer lost.** When Squibby opens your project again, it compares the folder with its own last copy and offers what changed as one batch: "Changed while Squibby was closed". Nothing is looked at until you ask, even with reviews set to Automatic.
- **Snapshots are much faster.** Squibby used to read every file of your project again for each saved version. Now it only rereads files whose size or time changed. On a project of 4000 files a save went from about half a second to under a tenth. Undo still puts back every byte.
- **The folder watcher was tested on this Mac.** It was tried with the ways AI tools save files: many small saves, a save renamed over the file, 1500 files at once, one file rewritten 50 times. Every change arrived once, and only after the files settled. Two small faults were fixed: new folders took up room in the list of changes, and the temporary name some tools save under was counted as a change. Still to check by hand: real Claude Code, Codex and Cursor.
- **Honest words.** Squibby cannot tell another tool's edits from your own, so the card now says "12 files changed in this project" instead of "Your AI tool changed 12 files". The setting is now called "Review changes to your project".
- **A security look you can read.** A review now runs the same checks as Ship on the files that changed, with no Claude. A new database table that anyone with your site address can read, or a key in a file sent to every visitor, is "Fix this first", with the file and the line.
- **Your house rules count in reviews.** A change to a file your rules say never to edit is "Fix this first", and the card quotes your rule. A file your rules say to ask about first is "Worth a look". When Claude writes the review's words, your project's notes for AI tools (AGENTS.md, CLAUDE.md, Cursor's rules) are given to it as notes to read, never as orders, and the card lists which ones it read.
- **Reviews stay current.** When a newer change is reviewed, Squibby checks the earlier review's problems again with its own rules. A problem that is gone says "Changed since, this no longer applies", and a card with nothing left gives way to the newer review. With reviews on Automatic, Squibby now waits a minute of quiet before it looks, so a tool that pauses is not reviewed half way.
- **History keeps your reviews.** Each review is one row in History, with its own mark: when, which files by name, what it found and what you did (Looks fine, Copy for my AI, Fix it, or "it no longer applies"). Squibby never keeps the text of your files. Rows go after 90 days unless you choose otherwise, and Delete everything removes them.
- **A key in the code is said at once.** When a change writes what looks like a key into your code, the card and the notch's quiet line say "A change wrote what looks like a key into the code", marked Fix this first, before you ask for a review. Only that one check runs, on this Mac, with no Claude and nothing sent. It has its own switch in Settings, off unless you turn it on (see the entry above).
- **Where was I knows what changed.** Coming back after a break, it can say "Since then: 12 files changed. Not reviewed yet." or that a review still says Fix this first, and its button is Review the changes. Nothing pops up by itself.
- **The review setting is easier to find.** It now leads the Fixing page in Settings, with its other choices under More. Searching for Cursor, Codex, Claude Code or CodeRabbit finds it.
- **Beta numbers count reviews too**, if you turned them on: changes ready, reviews run, each rating, Fix it, Copy for my AI, Looks fine, Where was I and the daily limit. Counts only, never words or file names.
- **Choose how strict reviews are.** Quiet shows only what needs fixing first. Normal is the usual. Careful shows everything. On a smaller point you can press "Don't flag this kind here again": it saves a line in What I remember, and forgetting the line brings it back. A key in the code or data open to anyone is always shown.

## Fixes to the fixes: 4 Nov 2026

A second review checked the fixes above and found ten places where they fell short. Each has a test that failed before the fix.

- **An update could close Squibby and never bring it back.** If you pressed Install update while hold to talk was still busy, Squibby ended at once to avoid the crash on quit, and that also skipped the restart. Now it starts the updated Squibby first and then ends. Still to check on a real Mac: hold to talk, press Install update straight away, and see Squibby come back.
- **A preview on the internet could reach your home network.** During the browser check of an online preview, a web address that points at your router or another device at home (a trick called DNS rebinding) was let through, because only the name was checked. Now every connection of the preview goes through a small gate of the check's own that looks up where each name really points and refuses anything on this Mac or your home network.
- **Fix it could lose its own safety instructions on a big change.** A long list of files and notes pushed the message over its length limit, and the cut took the end: the lines that say to keep your other changes, leave your .env file alone and prove the fix with your tests. Now Squibby's own lines are always kept whole, and parts of the review are left out instead, with a line that says so.
- **Home forgot what it had checked when Squibby restarted.** After a relaunch, Home said "works" again even if the files had changed while Squibby was closed. Squibby now remembers the version its last check ran on, and asks again each time Home opens or the pointer comes onto it, not only when Home gets the keyboard (it usually does not).
- **Asking whether the project changed read every file again.** Now Squibby keeps one list of the files between asks and only rereads files that changed, and the asking no longer delays the weekly tidy up of saved versions.
- **The character and the notch could still go blank on a drawing error.** They now have the same safety net as Home: they draw themselves again a few times, and then show Reload this part.
- **The log said too little when an engine message could not be read.** It said only the kind of error. Now it keeps the error's own message and where it happened, with keys hidden, never what the message carried.
- **Included usage: many requests at once could pass the daily limit.** On the included usage server (switched off today), each request now holds its largest possible cost while it runs, so a burst of requests with a cent left cannot all get through. A reply that Claude itself ended with an error (Claude was overloaded) is now charged only for what Claude reported, not as the longest answer.
- **Some browser check tests could pass without testing anything.** On a Mac with no network address, four tests quietly passed. They now show as skipped, and the test run fails unless you say on purpose that you are running without them.
- **The Pro tag could come back on Check before going live.** A test of its own now fails if it does, so merging the motion work cannot bring it back by accident.

## Reliability and releases: 4 Nov 2026

Twelve problems found in the review of 4 Nov. Each has a test that failed before the fix.

- **Check before going live is free now.** It only runs checks on your Mac and costs nothing, and every safety feature is meant to be on Free. It no longer carries the Pro tag. Putting the project online is still part of Pro.
- **Check servers and test runs could outlive Squibby's engine.** When the engine was ended by force (a Stop it did not answer, a quit, a crash), the project's own server and test runs kept going until the Mac restarted, holding a port, memory and battery. Now each one ends with the engine, however the engine ends. The port is free again within about a second.
- **A screenshot could stay in the engine's memory long past its 5 minutes.** It was only dropped when it was read again. Now old pictures are dropped as soon as their time is up, and the engine holds a few at most.
- **An extra copy of the speech model could stay loaded all day.** The five minute idle rule let go of one copy but not the one loaded ahead of time, and letting go of the talk keys during a load could start a second one. Now both go after five idle minutes, and a let go waits for the load already under way.
- **Short freezes at launch and on the first Show me press.** The app waited about half a second for a signature check of Claude before its window could settle, and the first Show me press read the whole 148 MB speech model to check it. Both now happen away from the screen. Two loops that woke many times a second for nothing now sleep until they are needed.
- **The privacy note did not mention reviews.** A review sends the changed lines of your project to Claude, and in Automatic it happens without a tap. The privacy note and the draft privacy policy now say what is read, when, and how to turn it off.
- **About and the support log now name the exact build.** Each build knows the commit it came from, so a friend's report can be matched to the code that made it.
- **A release is built only from tested code.** The release script refuses a folder with uncommitted changes, or a commit the full test run has not passed on. It also refuses a build whose problem reports would reach nobody, and installs Claude for real once before building.
- **Updates name their own download.** An update now points at its own version's file, never at a "latest" address that moves on with the next release.
- **The check that no permission is asked at launch was out of date, and nothing ran it.** It is up to date with today's features, checks that the app's start up never asks for anything, and now runs with every test run.
- **Included usage could be cheated by cancelling.** On the included usage server (switched off today), a reply cancelled part way was charged for its first words only, so the daily limit never tripped. Now a reply cut short is charged as the longest answer it asked for.
- **The test run failed at random on a busy Mac.** Every test now has 30 seconds, a wait that runs out says what it was waiting for, and a test that runs out of time no longer keeps running into the next one.

## Crashes and honest results: 3 Nov 2026

Nine problems found in the review of 3 Nov. Each has a test that failed before the fix.

- **Quitting soon after hold to talk could crash.** Every crash report on the founder's Mac came after a normal Quit, an update restart or Delete everything, in the clean up that runs as an app ends. The speech model was most likely still loaded then (the reports cannot say for sure). Now a quit first lets go of both speech models and waits about a second for that. If it cannot (Squibby is still turning speech into words), Squibby ends at once after its engine has stopped, without that clean up, so it is not reported as a crash. Still to check on a real Mac: hold to talk, quit within a minute, and look for a new crash report.
- **A failed check's chip said "Tests pass".** Only its small icon changed, and VoiceOver does not read the icon, so a failure was read aloud as a pass. A failed check now says so in words: Install failed, Build failed, Tests fail, Does not start, Broken in a browser, Second look found a problem. The notch shows the same chips.
- **One error while drawing could blank the whole window.** Each place in Home, the Settings pages and the first run now sit in their own safety net: if one part cannot be drawn, it shows one plain line and Reload this part, and the top bar, the Settings sidebar and Close keep working. What went wrong is kept in the log for a report. Settings now reads its settings in one go, which removes the cause of the blank Settings page, and an engine message the page cannot read leaves the page as it was.
- **After a plan, the result said "Fixed and proven" over "Nothing changed", with no Undo.** Each step replaced the one before, so the last step (often just running the tests again) was all you saw. Now a plan ends with one result for the whole fix: every file it changed, what the whole plan cost, and Undo the whole fix, which goes back to before the first step. And a check that passed when nothing needed changing now says "Checked, it passes. Nothing needed changing.", never "Fixed".
- **Home could say your project works over code nobody checked.** Squibby now notices when your files changed since the version its last check passed on, and Home and the notch say so in your project's name (for example "test-shop changed since its last check"), with Check my project. A review that looked safe but did not run your project's checks keeps saying so, and a fix you sent from a review says "Starting the fix" until it starts.
- **One error in the engine could quietly cut it off.** One command that went wrong could stop the engine listening for any more, while Home said it kept running, and one faulty part of the app could stop it watching the engine. Now each command is handled on its own: a failure is said for that command and the next one is answered. Stop everything also waits for the engine's answer to its own question, not just any message, before deciding whether to restart it.
- **Go live, Roll back and Undo could fail without a word.** When Squibby could not pass a press on to its engine (the engine restarting, too busy, or that tool switched off), nothing was said, and Undo kept waiting. Now Home says so in one plain line, and whatever was waiting stops waiting.
- **Nothing was written down when the engine stopped or the app quit.** Now the small log on your Mac notes each time the engine ends (how, after how long, and how many starts), and each quit (from the menu, an update, Delete everything, or the system). The engine's own error messages go to a small file only you can read, with keys, emails and your home folder hidden. All three are in Save a support log, so a report from a friend has something to go on. Nothing is sent anywhere.
- **Offline, a fix sat at Working for minutes.** Claude Code tries a failed request again and again (10 times as it ships). Now Squibby checks in a few seconds that it can reach Claude before a task, a review, Prompt help and Explain, and says "could not reach Claude" at once if it cannot. Claude Code also gives up after 3 more tries instead of 10. Still to check on a real Mac: time each one with the Wi-Fi off.

## Four safety fixes: 3 Nov 2026

These four were safety problems, so they were fixed before anything else. Each has a test that failed before the fix.

- **A private key in your code could reach Claude during a review.** Keys were hidden one line at a time, so only the first line of a key written over many lines was hidden, and the rest of it was sent with the change. Now lines are judged together: every line of a key is hidden, even when only its middle changed and its first line is out of view. Ordinary code beside it is still shown. The same goes for Explain.
- **A changed project could slip instructions into "Copy for my AI" and Fix it.** File names, Claude's words about the change and your project's own check output came from the change itself, and could read like Squibby's own request. Now everything that came from the change is quoted line by line, with commands, links and code taken out, and the message says it is a report, not instructions. A file name can no longer start a line of its own.
- **The browser check let the page reach the internet.** The guard only switched on when a button was pressed, and never covered live connections (WebSockets). A page another AI wrote, or a project you cloned, could send things out from your Mac while it was checked. Now, for your project on this Mac, the page can only reach this Mac, from the first moment, and the hidden browser itself sends anything else nowhere. If the page needs code or data from the internet (a script, an online database), the result says that part was not checked. A preview on the internet is also blocked from addresses on your Mac and your home network.
- **Undo history grew forever and kept copies of your .env files.** Every review added a saved version with a plain copy of each .env file, nothing was ever cleared, and Time Machine backed it all up. Now Squibby keeps the newest 100 versions per project, plus every one a History row, an Undo or Your turn still needs, and tidies up about once a week while your Mac is plugged in and Squibby is not busy. A review's versions keep only a scrambled fingerprint of .env, never a copy, so Undo to one of those puts your code back and leaves .env as it is. Versions made by Squibby's own fixes still keep a private copy, so Undo can put .env back. The history is kept out of Time Machine, and more build folders are left out of it. If it ever passes about 2 GB, reviews pause for that project and the review card says so.

## Squibby feels alive: 3 Nov 2026

- **Smooth motion.** Moving between Now, Learn, History, Memory and Settings is a short fade: the old place fades out, then the new one rises in, so text never sits on text. Cards grow in and fold away, and what stays slides to its new place instead of jumping. Buttons press in a little and come back, and a hover is a soft change, never a flash. Home drops from the notch in one smooth motion.
- **The time and the cost count up** instead of jumping.
- **The work card shows what is happening as it happens.** Each step ticks only when it is really done: Finding, Fixing, Checking, Proven. The files appear one by one as the work really changes them, with + for added, ● for changed and − for removed. Each check shows running, passed or failed as it goes.
- **"Proven" is only said once it is true.** All checks passing is not the end: the card and the notch stay on Checking until the result really says proven.
- **The notch shows the step too,** in one word with a thin line under it. It is quiet: no sound and nothing that loops. You can turn it off with "Show the step on the notch".
- **Home's main button follows what you are doing.** With a terminal in front it offers Explain an error, and with an editor or an AI app it offers Check my project. Your project still comes first: Fix it when something fails, Check before going live once it is proven, and Carry on when a task stopped half way. Only the kind of app is used, never anything inside it. Turn it off with "Home follows the app in front".
- **The ways you use most come first** in More ways to ask. This is learned only from your own presses in Squibby, it stays on this Mac, and Reset clears it.
- **Flowflow reacts to what really happens.** It rises a little when it needs you, dips when something fails, leans toward changes waiting for a review, and looks at the ask box while you type. Only that you are typing is used, never what you type. In Still it stays put while you type. Turn it off with "Reacts to what happens".
- **Still calm.** Nothing moves at rest. Reduce motion, Less motion and How lively are always respected: with less motion, everything is simply there.
- **Fixed:** with the light behind Home off, its drifts kept running unseen. They now stop.

## Flowflow is a bubble of water now: 3 Nov 2026

- **A new Flowflow.** It is a round bubble of water that floats, with two soft closed eyes and two small bubbles that follow it. It stays round in every state, so it never looks like it is sitting in a heap.
- **Every picture of it changed too,** not only the live one: the desktop and Home with Draw live off, the notch and its list, the Water and How lively choices in Settings, the About card, the first run and the empty History. Each one shows the water colour you picked.
- **Fixed:** with Draw live off, Flowflow on the desktop and in Home showed Ocean blue whatever water you picked. It now takes your colour.
- **Fixed:** opening About or Character in Settings right after another page could leave the Settings window blank.

## Black and White, and one calm colour: 2 Nov 2026

- **Two new themes, Black and White.** Black is a true black page with near black cards, and it is now the usual. White is a clean white page (it takes the place of Paper, and a saved Paper choice keeps working). Graphite and Deep are still there.
- **A calm look by default.** Home now uses one accent colour: the water you pick. It colours Flowflow and its water, the main button, the wave line and focus. Other colours only show when they mean something: green for proven, red for failed, amber for needs you. The list icons are plain line drawings, with no coloured gems.
- **The colourful room is still a choice.** Colour (Calm or Vivid), the light behind Home and the glossy button live on the Look page in Settings.
- **The first run takes your theme,** so it is the same place as Home right after it, and Flowflow is the size it is on Home, never a small head beside Continue.
- **The water has no hard edge.** It fades smoothly under the wave instead of stepping down in a line.
- **The wide Home uses its middle.** With the light off, the ask box comes right under the work instead of waiting at the bottom behind an empty band. The fade at the bottom is shorter, so buttons are never greyed by it.
- **A proven fix has Flowflow in the wide Home too,** with "Checked. It passes.", and the proof (Tests pass) sits right under "Fixed and proven", above Undo.
- **Smaller fixes:** a review shows Why right after its buttons; "Running the tests" is said once while working, not in two cards; a practice no longer says Practice twice; a task where nothing changed shows an empty ring, not a dash that looked like remove; Settings says once what the small dot before a setting means, and the dot is grey, not blue; Black and White have no blue glow under cards; the theme pictures in the wide Settings show their names without scrolling.

## Polish from the screen by screen review, second half: 2 Nov 2026

- **A failed fix has one clear next step.** Try again is the one main button, the failure is said once, its red mark no longer moves the title, and a web error code is said in words ("the server ran into a problem").
- **After Undo, the result says what Undo did:** "Put back: 2 files", and anything Undo could not take back is listed as still there.
- **Every state has its own small drawing,** not only a colour: a turning ring while working, a light for new, a tick for proven, ! for needs you, a dash when nothing changed, and History stamps "Not fixed yet" the way it stamps "Proven".
- **The working card says which steps are done** with a tick, for VoiceOver too.
- **More ways to ask opens over the ask box** in the wide Home, each way with its drawing and a one line explanation. The voice auto send switch lives in Settings, Keys and voice.
- **The first run's Your Claude step fits the window,** and Continue saves and tests your key in one press. While the first check runs it shows the step it is on.
- **Memory is now "What I remember",** with About this project and About you, dates in words, its options as rows, and a Try again when it cannot be read.
- **Smaller things:** Flowflow eases between sizes when a task starts and ends; a room change moves every colour at one speed; Flowflow glows amber when it needs you instead of turning olive, with no dark outline on light themes; icons grow with the text size; Settings help sentences are shorter; costs are always "About 7 cents".

## Squibby reviews what your AI changes: 2 Nov 2026

- **Squibby looks over the changes your other AI tools make.** When Claude Code, Codex, Cursor or any other tool changes files in your project, and the files stop changing for a short while, a "Review changes" item shows in the list on the left and a card on Now lists the files.
- **Nothing is looked at until you ask** (or pick Automatic in Settings). Review them also runs your project's own checks in a safety box, the browser check included; Quick look skips them. A review that runs by itself only runs what you have already allowed.
- **It never looks at half written code.** If Squibby starts its own work while your other tool is still writing, that tool's changes wait until both are done and the files are still again, and nothing it writes in the meantime is lost. A memory note, an install or a check by Squibby never hides what your other tool changes at the same time.
- **The card says it plainly:** what changed, what it touches (sign in, payments, your data, settings, keys, packages or the look only), and a rating of Safe, Worth a look or Stop, each with its own mark so it never relies on colour. Each reason names the file and line, and the checks say passed, failed or not run.
- **Three things you can do:** Fix it (it asks first, and keeps a safety copy so Undo puts every file back), Send back to my AI (copies a ready message to paste into the tool that made the change, with any key hidden), and Looks fine.
- **Settings and key files are never read.** The card only says one changed. A line with a key or password in it is hidden before anything is sent to Claude, so the key never leaves your Mac.
- **A warning stays until you close it.** If more changes come in while a Stop or Worth a look is on the card, they wait behind it and show once you press Looks fine.
- **Stop everything stops reviews too,** including one that was just about to start. A slow review that gives up waiting for Claude also ends that request, and what it cost still counts toward your daily limit.
- **Two settings under Watch routines:** how often (Ask first, Automatic or Off) and how long the files must stay still first (20 seconds unless you change it).

## Home is a colourful place now: 1 Nov 2026

- **Home is a lit room, not a dark page.** A bright sky of colour at the top, rays of light falling through deep water, soft points of light drifting in it, and the colour carried all the way down. Words stay easy to read on all of it: every screen was measured.
- **The water you pick colours the whole room.** Choose Berry and Now, History, Memory and Settings turn pink, main button and all. Before, only Flowflow changed.
- **Each group has its own light.** Learn, and Now while a practice runs, is a sunset of gold, coral, rose and violet, with no more brown. Holding the talk keys turns Home pink. Dragging a file over Home turns it green and outlines the window as the place to drop it.
- **Flowflow is bigger and sits in its own water,** which takes the light of the room it is in, so it never looks like a pasted stripe. On Learn it sits in a small pool on the practice card instead of being cut by the card's edge.
- **Labels are one tidy set:** soft pills with a dot. Needs you is a step stronger, no more white sticker. In the list on the left each label is just its dot, so task names have room.
- **Calmer details:** the coloured dots at the top of the list that looked like window buttons are gone, the main button is lit rather than candy shiny, the ask box has no thick white frame, and the Water pictures in Settings show the Flowflow you see in Home.
- **Two choices on the Look page:** Colour (Vivid, the usual, or Calm, a truly quiet Home with no rays and plain cards, picked by picture) and Light behind Home (Moving, Still or Off). The light only drifts while you use Home and never moves with Reduce motion.

## Calmer and tighter, next to HeyClicky: 1 Nov 2026

- **The list on the left fits about ten tasks, not three.** Each task is one line, its name cut short with "…" (the whole name shows when you point at it, and in History), with a small label at the end only when it is working, needs you or is new. A finished, proven task shows a green tick there instead.
- **The colours in your lists mean something now.** A fix is always rose, going live green, a question blue, an explanation lilac, something new yellow; tidying up and anything else stay grey. On the dark themes the squares are deep and quiet, not pastel.
- **The labels stand up straight** and are small and outlined, no longer tilted stickers. The glossy main button is calmer: less shine, less glow.
- **Look has its own page in Settings,** right under General, and you pick by looking: little pictures of Wide and Tall, of Graphite, Paper and Deep, of the glossy and flat button and of soft and crisp corners, with the water colour beside them. What you picked shows in your water colour, and switches that are on are in your water colour too.
- **History is cleaner.** No box around it, every task in the same three columns, how it ended said once, and when it happened. Task names no longer start with "Before:".
- **Home at rest has no empty gap:** the water goes on down to the ask box. The tip under the box only suggests a follow up once a task has finished. "Not checked yet" no longer has a stray dot, and the line under it says "Last task", so it never reads like a check that happened.
- **A practice says it is a practice** on Now, and Fix it is not offered again while the fix runs. The failing line is marked like a code review (a soft red with a red edge), not a bright yellow highlighter.
- **The first run matches Home:** the same dark grey, a short bar per step, and Continue as a button on the right with Skip on the same line, not a full width white bar.
- **Settings in the wide Home uses the same left column as Home,** and a page that scrolls fades out at its foot instead of cutting a sentence. Flowflow's page is called Character now. Flowflow's lines start with a capital, like every other line.

## Make it yours: 1 Nov 2026

- **Your lists have a bit of colour.** Each task in your recent work and in History, and each practice in Learn, has a small soft coloured square with a drawing of what kind of work it was: a wrench for a fix, a magnifier for a question, an arrow for going live.
- **Small tilted stamps say where things are:** Working while a task runs, Needs you while it waits for you, Proven once its checks passed, and New for ten minutes after an answer or a change that is not proven yet. Nothing counts anything; a stamp only says what is true.
- **New choices in Settings,** all in one place (search "Look"; since the polish above, the Look page): Layout (Wide or Tall), Theme (Graphite, Paper, or Deep, a dark sea blue), Spacing (Comfortable or Compact), List icons (Colour or Plain), Stamps (on or off), Glossy button (On or Flat) and Corners (Soft or Crisp). Each changes at once, and each has a usual value that gives the look from before.
- **If you had picked the old Night theme,** it now shows as Graphite, the dark look that replaced it. Nothing you saved is lost.

## Home is wide now: 1 Nov 2026

- **Home opens as a wide window, not a tall strip.** Your places (Now, Learn, History, Memory) sit in a list on the left with small drawings, your recent work under them with how each one ended, and Settings at the bottom of the list. The work is on the right, and the box to ask runs along the bottom of it, like a chat app. Home is 688 by 480 points, so a 13 inch MacBook Air still has plenty of room under it, and the character still keeps clear of it on every edge.
- **Settings in the wide Home has its own list of sections on the left,** in place of Home's list, and opens at the same size, so nothing jumps.
- **The tall panel is still there if you like it:** search Settings for "Layout" and pick Tall. Home size Large makes the wide Home taller.
- **Bigger text still fits.** At the Large text size the list stays on the left; above that, the places go back along the top so the words keep their room.

## A grown up look, first step: 1 Nov 2026

- **Home is graphite now.** Soft dark greys in steps, thin lines between them, and one glossy water button per screen. The words are a little tighter and smaller, like a Mac app. Flowflow is exactly as it was.
- **Practice shows find, fix, prove as three steps on a thin line,** each saying where it is in words. Flowflow peeks over the card with one short line, like "found it." Once proven, you see each check that ran, with its result in the code face.
- **The failing line looks like proof.** Where it is (file and line) and the line itself show in the code face, with a yellow highlighter on the line, in Practice and under Find the problem on Home. Each file a fix changed says how it changed.
- **Fixed from the first try of this look:** no stray dot on the back arrow while a practice fixes, one Stop (in the practice card, not also in the top row), Flowflow no longer pokes into the tab row, the highlighter is a real yellow with dark words, the first run's links line up with the headings, the Settings page strip fades and shows an arrow at the end that has more pages instead of cutting a word, and no little sparks over Flowflow when a practice is proven.

## The edge, the water ring and the ask box: 1 Nov 2026

- **Pushing the character into a screen edge now just goes in, with no bounce.** Push it hard into the edge, or throw it at the edge, and it goes straight in. Keep it there for about two seconds and it rests there (the water flattens while you hold it, so you can see it will stay). If you are only playing with it near the edge, it stays exactly where you let go. The old "always sticks when I let go near an edge" is a choice in Settings, Flowflow, "Going into the edge".
- **The water ring follows your pointer again.** I had made Still the usual, and Still only showed the ring while you were talking. Lively is the usual now. Still and Gentle are still there for a quieter Mac.
- **Typing in the ask box no longer turns the whole box white.** It gets a soft blue edge and glow instead.
- **Six tests that started failing on 1 Nov** (they counted last month's fixes on the real clock) now run on a fixed date.
- **Review round:** 26 problems found by reading every part of the app, each checked by a second reader, then fixed. Among them: `cargo` with a flag in front still asks before installing, a fix that has started counts against the free limit before it is proven, more of your logins and shell start-up files are out of reach of checks, a release build no longer passes developer settings to the engine, and the README, the decisions index and the repo map match the repo again.

## cargo install asks first: 31 Oct 2026

- **Installing a Rust tool for your whole Mac now needs your tap.** `cargo install` puts a program in your Mac's own tools folder, outside your project, where Undo cannot reach it. It used to run with no question. It now asks like the other installs on your Mac (Homebrew, global npm), and the card says Undo cannot take it back. Building, testing and running a Rust project are unchanged.
- **Still allowed without a card, and worth knowing:** `npm install` inside your project (your package list is saved and Undo puts it back, but the installed packages are not, so reinstall to get them again), and deleting `node_modules` or `dist`.

## Builds that need the internet: 31 Oct 2026

- **Next.js projects with Google Fonts can be fully checked.** Checks run in a safety box with no internet, so a build that fetches its fonts used to be left out of the check. Now Squibby asks once per task, "Go online?", and on a yes runs the build again with the internet. It can still only save files inside your project, but it can reach websites while it runs. The tests and your page never get the internet. With installs set to Automatically it does not ask; set to Never, it never goes online.
- **An offline Mac is not blamed on your code.** If the build still cannot reach the internet, Squibby checks whether your Mac is online. Offline, the check says so. Online, a build that cannot reach an address is a real failure, such as a mistyped address.
- **Projects whose install changes Git's settings are checked properly.** Checks never change your project's Git folder, so an install step that changes Git's settings (husky and tools like it, which check your code each time you save a version) used to make the whole install look broken. Now those tools are told to skip during a check. If a project's own install step still tries, the install runs once more with a stand-in Git folder, and its own result decides. Your project's Git settings stay as they were.

## Review fixes for the launch cut and the first run: 31 Oct 2026

- **An update never quietly turns off what you used.** If you used file conversion, watch routines, Second Look or Type by voice, set up a watch, or picked a key for one of them, it stays on after the update, and so does the key. The tools you had not used now start off, and Settings, General says which ones once.
- **Your Google accounts stay in Settings.** An account you connected keeps working and can always be seen and disconnected there, even with watch routines off. Connecting a new one needs watch routines on.
- **No more buttons that say they are switched off.** Draw why on a found problem now shows only when Draw it for me is on.
- **The first check says why it could not run.** If the check cannot start (for example, Apple's developer tools are missing), the first run shows the reason and the fix, and says "stopped" only when you stopped it. VoiceOver now hears the result.
- **Only your own answers are saved.** Answering one setup question no longer saves the other pre-filled answers as yours.
- **Home agrees with the first check.** After it, Home says the checks pass, or that there is a problem with Fix it, never "Not checked yet".
- **Smaller fixes.** Flowflow now shows on the hello with Less motion on, and on every screen after a fold was left open. The tools list says it may ask for Accessibility too. On a Mac without Node, Which task broke it runs a practice's earlier versions too, and a practice that reaches for the internet is told apart from a real failure.

## The practices without Node: 31 Oct 2026

- **You can try a practice before you install Node.** On a Mac without Node, the practice projects now run their checks and their page on the runtime Squibby already carries, inside the same safety box as every check, with no internet. Your own projects still use Node, and Learn says so in one line.
- **Point at the problem now finds the line in a practice copy.** Practice copies have spaces in their folder names, and that hid the failing line, with Node too. It now shows the line the practice is about.

## A shorter first run: 31 Oct 2026

- **Three screens instead of nine.** Hello, Your Claude and Your project. You can watch the recorded fix again from the hello, skip any step, and go back from every one.
- **Honest lines next to the key.** Your key stays in your Mac's Keychain and goes only to Claude. You pay Anthropic directly, Squibby stops at your daily limit, and the plan line says exactly what the Plan card says (early access, nothing charged).
- **Start from where your project is.** Choose a folder on your Mac, paste a GitHub link (Lovable projects through their GitHub link), or try a practice first.
- **A first check of your real project.** Squibby saves a safety copy first, asks before installing anything, and shows the result in one line. If something fails, Fix it on Home picks it up from there.
- **Flowflow's choices and the optional questions are still there,** folded under the result, and nothing you skip is saved for you.

## The launch cut: 31 Oct 2026

- **Squibby starts as one product.** Out of the box it does one job: finds what broke in your project, fixes it, proves it, and lets you undo it. Prompt help, hold to talk and Show me how stay on.
- **The extras start off, and nothing is gone.** File conversion, watch routines and connecting Google, Second Look, Draw it and Type by voice in any app are all still there. Each has a switch in Settings, and search finds every one. If you used Squibby before, a tool you had used stays on (see the review fixes above).
- **Four keys to remember.** Fix it, Hold to talk, Prompt help and Stop everything have keys from the start. The other jobs wait in Settings, Keys and voice, with Add a key. If you used Squibby before, every key you picked yourself is kept and still works; only jobs still on their old usual keys lose them, and Settings says so once.
- **Prompt help has its own switch.** Turning off talking no longer turns off Prompt help, the error explainer or Second Look. If you had talking off, Prompt help stays off too, once.
- **Installs ask first.** Before a check installs your project's packages, Squibby now asks you by default. You can still choose Always or Never in Settings, Fixing.
- **The first run shows the real switches.** Its list of tools starts as Settings is, so pressing Next never turns anything on.

## More safety fixes: 31 Oct 2026

- **The before picture runs in the safety box too.** When Squibby starts the earlier version of your project to take the before picture, it now runs in the same safety box as every other check. If the box cannot be used, there is simply no before picture.
- **Which task broke it works again.** Squibby's private copies of your project can be checked inside the box, so the search no longer blames the wrong task.
- **The box no longer gets blamed on your code.** When the safety box itself stops a step, for example a test that needs the internet or a browser of its own, Squibby says so as something it could not check, and does not ask the agent to fix working code.
- **Package manager settings count as scripts.** A change to a project's package manager settings files is asked about like a change to its scripts, before anything installs.
- **Checks cannot change your Mac's settings.** A check in the safety box can no longer write settings for any app.
- **Tighter rules for the agent's commands and web pages.** An unusual way of writing a command is now read correctly and asked about, more kinds of web addresses that could carry your data ask first, and an address that asks is not looked up until you say yes.

## Checks run in a safety box: 31 Oct 2026

- **Checking the work can no longer reach past your project.** When Squibby checks a change, the project's build, tests and server now run in macOS's own safety box, like Claude's own commands: they can change only the project folder and the package caches, cannot read your keys, logins or Companion's own data, and cannot reach the internet. Installing packages still can, and only after you allowed it.
- **A Mac where the box does not work asks first.** If the box cannot be used, nothing of the project's runs until you say yes on the card, and a check with nobody to ask runs nothing and says why.
- **An unfinished task cannot slip changed scripts past the card.** If a task changes the project's scripts and stops before its check, the next check (Point at the problem, Put it online) treats them as changed and asks, or runs nothing. Python projects get the same card.
- **Delete everything now disconnects Google too.** Any Google account you connected is disconnected at Google and its saved sign in removed from the Keychain, and the delete list says so.
- **Claude is checked every time Squibby starts it, not only when it was installed.** If the Claude program on your Mac changed since it was installed, Squibby does not use it and offers to get it again from Anthropic.
- **A plain page is shown more carefully.** When Squibby opens a project's plain page for a check, its little server hands out only the project's own page files: never hidden files such as `.env`, never a file a link points to outside the project, and never to a request for any other address.

## Pro is built, and switched off: 31 Oct 2026

- **Nothing changes for anyone yet.** Payments are off. Every feature stays free, nothing is charged, nothing is held back, and Squibby talks to no payment service.
- **What is ready for later.** Free will keep 3 proven fixes a month and every safety feature, Undo included. Pro will add unlimited fixes, Ship with rollback, Recaps and extra water colours, with a 14 day trial that needs no card. Pro unlocks with a key you paste once. Checkout and billing open in your own browser, never inside Squibby.
- **The look is more consistent.** Small Pro tags, when they show, use the same button styles as everything else.

## A cleaner, quieter look everywhere: 31 Oct 2026

- **One look, flat silver.** The striped silver and the line through the middle of it are gone. Each screen has at most one silver button, the thing to do next. Everything else, like Install, Try again, a watch's Fix it and each lesson's Start, is a plain button.
- **Settings lines up.** Each switch, menu and number sits on the right of its name at the usual text size, and only drops under the name when the text is very big. A long microphone or voice name moves under the name instead of squashing it. A changed setting gets a small dot before its name, and the name no longer jumps sideways.
- **Steadier controls.** A number is one joined box with minus and plus. An open menu rings the choice the arrow keys are on. The key a job uses is clearly marked in Change keys. History's filter and the Watches form use the same menus and number box as Settings.
- **Settings stays put.** The top bar and the list of pages stay where they are, and only the page scrolls.
- **Restore usual asks first.** Restoring a page's usual settings first lists every setting that will change, then offers Undo.
- **Stop is always one press away.** While Squibby works, Stop shows in the top bar on every place, not only on Now.
- **Buttons follow your tools.** With Fix turned off, Home no longer offers Fix it or Check my project.
- **The notch stays readable.** With Paper chosen, the notch panel keeps its light words on black. A job and a result there are a plain line with no box, and Allow and Don't allow are the same buttons as everywhere else.
- **Big text fits.** At the biggest text size the top bar wraps instead of pushing Close off the edge.
- **Flowflow's water matches.** The preview in Settings is the same water as Home, and holds still with Still. On Paper its sky is light, not a black box.
- **Dragging lets go cleanly.** If macOS takes the pointer away mid drag, Flowflow still saves where you left it.
- **Less read from your Mac.** Nothing reads your Mac account's name any more, now that the greeting is gone.

## Flowflow keeps up when you drag it: 31 Oct 2026

- **Dragging is smooth now.** Flowflow stays right under your pointer, at the spot you took hold of it, instead of lagging behind.
- **Let go anywhere.** Let go in the middle of the screen and it stays exactly there, with no jump and no drift back to an edge. Let go near an edge and it slides onto it (at once with Less motion or Reduce motion).

## Home says how your project is: 31 Oct 2026

- **Flowflow lives in Home again.** It floats on its water at the top of Home, beside the words. It moves as lively as you chose in Settings, holds still with Still, and stops drawing while Home is closed.
- **One column, status first.** The top of Home says how your project is, in its own name: "test-shop works, checked 2 hours ago", "test-shop has a problem", or "Not checked yet". It is read only from the last check, so it never says works without proof.
- **One main button.** Under the status there is one button, picked for you: Fix it, Check before going live, or Check my project. Then the box to type what is wrong, then your recent fixes. Each recent fix opens its own receipt.
- **Words, not tiny icons, at the top.** History, Memory and Settings are buttons with their names. Learn shows until you finish your first practice. Your project's name is a menu: change folder, open one from a link, or pick one you used before.
- **Nothing was dropped.** Explain an error, Show me, Plan it, Look it up and the rest are under More ways to ask, and the options there are switches.
- **The job in one card.** While Squibby works, a card shows that a safety copy is saved, four steps (Finding, Fixing, Checking, Proven) that fill only as they really happen, what it is doing now, the time so far and the cost, with Stop in the card.
- **The result in one card.** The result comes first in big words, then what changed and which checks ran, with Undo this fix in the card. The Undo and Stop strip at the foot of Home is gone.
- **The notch shows only what is live.** Rest your pointer on it and you see one thing: the job with Stop, the result with Undo this fix and See proof, a question, Add your key when Claude is not connected, or one plain line like "test-shop works. Last fix proven 2 hours ago." The greeting and the quick buttons are gone; a click on the notch opens Home.

## A calmer Settings, inside Home: 31 Oct 2026

- **One Settings, inside Home.** The separate Settings window is gone. The gear, Command comma, the notch and the menu bar's new Settings… item all open Settings in Home, on the page you looked at last. While it is open, Home is a little wider and keeps one height, so it never jumps between pages.
- **Eight short pages.** Account, General, Fixing, Flowflow, Keys and voice, Privacy, then About and More options. Each page has a title, one line on what it is for, and a few small groups. Search sits at the top of the list: Command F goes there, and plain words like "mic", "plan" or "zoom" find what you mean, even with a typo.
- **Every setting is still there.** The ones most people never change are in More options, each page's in its own section, closed until you open it. Search finds every one, and changes them right in the results.
- **No more walls of text.** Each setting has one short line. The longer explanation is behind a small info button beside it.
- **Lists open in a sheet.** House rules, the apps that count as a call, the apps Prompt help may read and each job's keys show a short summary with Edit or Change, which slides a sheet in from the right.
- **Keys show as keys.** Each job shows its keys the way the Mac draws them, with Change beside them. The jobs most people use come first; the rest are under Other jobs.
- **Flowflow is back on its water** at the top of its page in Settings, and How lively is a row of pictures there.
- **One danger zone.** Forgetting what Squibby remembers, removing your Claude key, deleting everything Squibby keeps and resetting all settings now sit together at the end of Privacy, each saying exactly what happens. Removing the key and deleting everything ask you to type the words first.
- **A Plan card on Account.** For now it says Early access: nothing is charged, and you will be told before that changes.
- **Plainer names.** For example Speak to me is now Say answers out loud, Quiet during calls is Quiet on calls, and Pause learning is Pause memory. Search still finds the old names.

## One look, built from the same parts: 31 Oct 2026

- **The silver is flat now.** No more dark band through the middle of the silver. It is one smooth fill with a thin edge of light, and it sits only on the one main button of a screen. Switches, titles and the drop ring are no longer silver.
- **Plain titles.** Titles are plain white words, with no metal shine.
- **Settings controls that look like controls.** Every on and off setting is the same round switch. Two or three choices sit side by side, all the same width. Four or more open a short list with a tick by the one chosen, so a long name never runs off its card. Numbers have a minus, the number and a plus, with the unit after it, and a number past the limit is set to the limit with a short note.
- **Buttons you can see.** Buttons that used to be bare words now have a thin outline.
- **Squibby looks the same in light and dark Mac mode.** It always uses its own near black look. Paper, the light look, is still there when you choose it in Settings.

## Quiet unless something is happening: 30 Oct 2026

- **Flowflow now holds still when nothing is happening.** It moves when it is working, needs you, has finished, could not fix something, or is listening, then settles and stops drawing a few seconds later. To have it sway and follow your pointer again, pick Lively in Settings, Flowflow.
- **You pick how lively it is.** Settings, Flowflow has three choices: Still (the usual), Gentle (a slow, small sway) and Lively (it sways, its eyes follow your pointer, and the water ring stays on your pointer). Less motion, and Reduce motion on your Mac, still keep it still whatever you pick.
- **No more tricks at rest.** The hops, shakes and bubbles it did by itself are gone, in every choice.
- **The live character no longer reacts to checks.** Its small nods, winces and cheers when a check passes or fails or work is proven are gone from the live drawing, in every choice. Reactions and celebrations now gives a short cheer on the notch when work is proven, and in Lively a splash and confetti. The pictures (Draw live off) still nod and wince.
- **It rests during calls and in Low Power Mode.** With Quiet during calls on, the character holds still and the notch does not open by itself while you are on a call. Rest in Low Power Mode (on unless you turn it off) keeps the character still while your Mac saves power. It still shows when it is listening or needs you.
- **The notch is the bare notch at rest.** The sun and the count of new results are gone from it. The count now shows on the panel when you rest your pointer on the notch.
- **Only results that matter drop down.** A card drops from the notch by itself for a proven fix or a failure, never for a job starting or moving a step. A card that opened by itself ignores clicks for its first moment, so a pointer that happened to be there presses nothing.
- **A light when Squibby looks at your screen.** The notch shows a still ring with a dot while Show me how looks, and says "Looking at your screen".
- **Needs you pulses three times, then holds,** on the notch and on the character. On the notch, each new question pulses three more times.
- **Show me how points at once.** The ring shows at the place right away, in the Mac's own font. The drop that flies there from Flowflow is now a choice: Settings, Fly to the place first. When you click the right thing, the ring turns green with a tick. The splash and confetti come only in Lively, with Reactions and celebrations on.
- **The water ring only while listening.** In Still and Gentle the ring around your pointer shows only while Squibby listens, and stops drawing when it goes away.
- **Gone for now:** the hidden Flowflow that Home drew out of sight. A visible one may come back when Home is rebuilt.

## Squibby tells the truth about every result: 30 Oct 2026

- **One honest answer for every result.** Home, the notch, What I did, the recent list, VoiceOver, spoken replies and Copy now all say the same thing about a finished task, decided in one place. "Fixed and proven" and the green tick appear only when the project's own checks passed, and no Undo has taken the fix back since.
- **After Undo, nothing says proven.** The result turns to "Undone. The fix is gone, so the problem is back." The tick, the green colour and the check chips go at once, and What I did files the task under Undone with no second Undo.
- **Bring the fix back.** Changed your mind after Undo? One button, asked first, puts the task's files back as they were just before you pressed Undo. It uses Squibby's own undo points, never your Git.
- **Stops are named.** A task that stopped at its spending limit, today's limit or the most turns allowed now says so, instead of "Something went wrong". A task you stopped says "Stopped", and whether it changed files first.
- **Partly checked says so.** When some checks could not run, the result reads "Fixed, not fully proven. Some checks could not run." instead of a green tick.
- **Clearer questions before risky steps.** A question never says it can be undone when it can't. Anything Undo can't take back (running a script, changing your Git, an unknown tool) now says "Undo can't take this back.", and those steps are listed under "Cannot be undone" on the result. House rules get their own question, file paths are shown from your project folder, and Allow and Don't allow look equally weighted.
- **Failures in one plain sentence.** A failed check and the "This keeps failing" card show one plain sentence and where it failed. The raw output is behind Details.
- **"No cost" instead of "free so far"**, and the first run now says exactly what Undo does: it puts back the files the task changed, leaves files you changed yourself, and can't take back anything sent online.

## Fixes from a full interface review: 30 Oct 2026

- **Text can now be twice the size.** Settings, Text size has a new Huge step. Home's two columns stack when the words get that big, so nothing is squeezed.
- **The notch never cuts off its buttons.** With questions waiting, the cards scroll and the buttons under them stay in reach.
- **The ask box stays at the top.** While Claude was installing or missing, its notice could push the ask box below the side list.
- **The Paper theme is readable.** Errors, the ticks and crosses, and the dot that says a place needs you were too faint on Paper.
- **Easier to read keys and edges.** The keyboard shortcuts beside each action, and the edge of the ask box, now stand out enough to see.
- **Every button answers a press.** Some rows on Home showed no press at all, and a notch answer that was not ready yet looked pressed.
- **Clearer words.** The Now hint says to press Return, and the first run says what to do when the practice project needs Node.
- **VoiceOver keeps its place** while the first run's short story plays.

## One look on every screen: 30 Oct 2026

- **Home, Settings, the notch and the first run now look like one product.** The same near black page, cards with one thin edge, quiet rows that light up under the pointer and small square buttons, everywhere.
- **Calmer buttons.** The main button on each screen keeps its silver, now with neat corners instead of a big pill. Second choices have a thin outline.
- **Settings.** The page you are on is a lit row, as on Home's list, and the cards are flat.
- **Fixed:** the first run was squeezed into the right half of Home. It uses the whole width again.

## A new Home, laid out like the best dashboards: 30 Oct 2026

- **Ask first.** The box to ask Squibby is now a command bar across the top of Home, with a search mark, ready to type.
- **Everything to do on the left.** Find the problem, Is it safe to go live?, Explain an error and Show me sit in a quiet list with their keyboard shortcut, and your last few fixes are listed below them with a tick or a cross for how each ended. Press one to see it in What I did.
- **The job on the right.** What Squibby is working on, and every result, has the rest of the space.

## The ring keeps up, and it's smaller: 30 Oct 2026

- **The water ring sticks to your cursor.** It now moves the instant your Mac reports the mouse moving, instead of checking where it is many times a second, so it doesn't trail behind. It only ever knows where the pointer is, never what you type.
- **A bolder first hello.** The first screen's headline now reads in two tones: "Your AI built it." bright, "Let's finish it." in grey below.
- **Glassier cards.** Home's cards catch a thin rim of light along their top edge, like glass.
- **A smaller, finer ring.** About two thirds the size, with a thinner ring of water.
- **Easier to bring Flowflow out.** A short pull away from the edge is enough for it to stay where you drop it; only a drop right at the edge sticks it back.

## You can see Squibby listening, and results read cleaner: 30 Oct 2026

- **The water ring hears you.** While you hold a voice key, the ring at your pointer ripples with your voice and glows a little, so you can see Squibby is listening right where you're looking.
- **A cleaner notch panel.** Its buttons sit on one row, with Settings and Open Home as two small round buttons at the end, and the blurry glow under it is gone.
- **Home's top is tidier.** The line under the headline no longer sits on the waterline, and Flowflow melts into Home's water instead of ending in a hard line.
- **See what it's doing now.** While Squibby works, the step it's on has a small turning circle beside it, and finished steps go quiet with a tick.
- **See the keys.** Find the problem, Explain an error and Show me now show their keyboard shortcut as small keys at the end of the row, using the keys you picked.
- **Clearer results.** After a fix, Squibby's own words come first, then one tidy card of what changed: each file with a mark for added, changed or removed, its name in bold and its folder in grey.

## Easier on your battery: 30 Oct 2026

- **The water ring rests when you do.** It redraws at full speed only while your pointer moves, and slows right down when it's still.
- **Flowflow idles gently.** Its slow sway at rest uses about a third less of your Mac's graphics power, and looks the same.

## Drawing that keeps pace with the voice: 30 Oct 2026

- **Marks are drawn as Squibby says them.** When Squibby points at something and says the step out loud, the hand drawn ring or arrow now draws along with the words, finishing as it reaches the important part. Without the voice, marks draw at their own pace as before.

## Safer behind the scenes: 30 Oct 2026

- **Undo covers more.** If Squibby edits a file your project keeps out of Git (like a local config), Undo now puts it back too, and removes one it made.
- **No sneaky addresses.** When Squibby opens a web page while fixing something, it refuses a name that secretly leads back to your own Mac or home network.
- **Up to date.** Security fixes for the certificate checks and a few packages the engine uses.

## Flowflow sticks to the edge until you need it: 30 Oct 2026

- **It lives stuck to the edge.** Flowflow now waits half tucked into the edge of your screen, flattened against it like a drop of water on glass. You can always see where it is, but it stays out of your way.
- **Hover to bring it out.** Move your pointer onto it and it comes out and springs back into shape with a wobble. Move away and it sticks back to the edge.
- **Pull it out.** Drag it away from the edge and it peels off like water. The closer to the edge you hold it, the flatter it squashes.
- **No invisible box.** It flattens against the real edge of your screen now, not the edge of its own little window.
- **Leave it in the middle.** Drop it anywhere away from the edges and it stays right there. Only the notch is kept clear.
- **Your choice.** On Settings, Flowflow, "Tuck into the edge of the screen" turns this off. Under Advanced, "Stick to the edge" off hides it fully past the edge instead.

## Flowflow clings like water, and the ring lands on your cursor: 30 Oct 2026

- **Push it into the edge and it squashes.** Drag Flowflow into the side of the screen and it slides up against it, flattens and spreads along it. The harder you push, the flatter it gets. Let go and it springs back into shape with a little wobble, like water.
- **It joins the water in Home.** Where Home's waterline meets Flowflow, the two join in a soft curve, like a drop meeting water, instead of a shape floating on a line.
- **The ring lands on your cursor.** A window that follows the pointer always shows a frame or two late, so on a fast sweep it used to sit behind. The ring now aims a touch ahead along the way you're moving, and settles exactly on the cursor when you stop.

## Flowflow flows, goes anywhere, and the ring keeps up: 30 Oct 2026

- **Flowflow is liquid now.** Its point sways like poured water, slow waves run up its sides and its base spreads and gathers. When it moves it stretches and pours a smooth tail of water behind it that melts back in as it slows.
- **Put Flowflow anywhere.** Drag it away from the screen's edges and let go: it stays right there. Drop it near an edge and it snaps to the edge as before. It always keeps out of the notch and the space Home drops into.
- **The water ring keeps up.** Moves of the ring no longer queue up behind other work, and each one uses where your pointer is at that moment, so it doesn't lag behind anywhere on the screen.

## Flowflow, rebuilt as clear water, and a water ring at your pointer: 30 Oct 2026

- **Flowflow looks premium now.** It's one clean drop of clear water, lit like a studio product shot. It has a soft point on top, two calm eyes with a glint, and light gathering at its base. No more lumps or wobble: it leans, breathes and settles.
- **It's sharp.** A bug meant Flowflow had been drawn small and stretched up. It's crisp now at every size.
- **A water ring rides your pointer.** A small ring of Flowflow's water sits right on your cursor's tip, open in the middle so it never covers anything. It moves with the cursor with no lag, stretches a little when you move fast, and has small waves running round it. It stays still if your Mac asks for less motion. You can turn it off in Settings, Flowflow.

## Type by voice in any app: 30 Oct 2026

- **Talk instead of type, anywhere.** Click into any text box, in any app. Hold Option, Shift and Space, speak, and let go. Your words appear where the cursor is.
- **On this Mac only.** Your voice is turned into text on this Mac, never sent anywhere. Squibby never presses Return, so nothing is sent for you.
- **It stays out of private places.** It never types into a password box or into password managers. It never reads what's already in the box. If you moved to another box while it was working, it copies your words instead and says so.
- **You'll see what happened.** The little Flowflow at your pointer says "Typed." or "Copied. Press Cmd+V."
- **Your choice.** There's a switch on the Voice page in Settings, and you can change the keys in Shortcuts. Hold to talk still sends your words to Squibby, as before.

## Pick your Flowflow: 29 Oct 2026

- **Choose Flowflow from cards.** Settings, Flowflow page: each water is its own card with the live Flowflow in that colour, its name and a line about it (Ocean, Lagoon, Lime, Berry, Midnight). Click one, or use the arrow keys.
- **More silver.** Lively, Calm and Still, and Resting, Working and Done, are chrome when chosen, like the rest of Settings.
- **Plainer words.** Squibby no longer calls itself your "friend" anywhere in Settings or the first run. It's a tool.

## Silver Settings and a count in the notch: 29 Oct 2026

- **Settings is silver now.** The page you're on is a polished chrome pill, switches turn chrome when on, the size and speed pickers have a chrome choice, and each page sits on a dark brushed metal card. Pickers with four choices drop under their label so the words stay easy to read.
- **The notch counts what you haven't seen.** When work finishes while Home is closed, a small silver number sits in the notch until you open it.

## Pictures, a hello, and a word at your pointer: 29 Oct 2026

- **Draw it draws real pictures.** Ask it to explain something and Squibby draws a friendly picture on a sheet of dotted paper, with a handwritten title, stroke by stroke the way a hand would, then a caption underneath. When there's a problem on screen it still draws the diagram of what broke.
- **The notch says hello.** Hovering the notch greets you by name for the time of day ("Evening, Rishabh.") and tells you which keys to hold to talk.
- **A word at your pointer.** When a fix is proven, the little Flowflow following your pointer says "Fixed. Checks pass." for a few seconds. Never during a call.

## Chrome on black: 29 Oct 2026

- **Squibby is polished silver now.** Every main button (Fix something, Allow, Start, the first run's keys) is glossy chrome on black, with a bright top edge like cast metal. Big titles get a chrome sheen, the mark in the notch is chrome, and the pointer's usual ring and captions are silver. Lime is gone.
- **Flowflow's water looks premium.** It's lit like a glass product shot: a soft studio highlight, a bright glassy rim, a deep base with light gathering inside, and no more streaky stripes.
- **Flowflow follows your pointer by default** as a tiny Flowflow with eyes, and stays in view on its edge instead of hiding past it.

## Settings, made simple: 29 Oct 2026

- **Settings is a few clear pages now.** A side list with an icon for each page (Account, General, Flowflow, Voice, Shortcuts, Powers, Privacy, Advanced, About). Each page has a title, one line saying what it's for, and one card of settings: a name, one short line, and the switch or choice on the right.
- **Choices you can see.** Water colours are swatches, sizes and edges are small segmented buttons, and your friend's look sits right at the top of the Flowflow page.
- **No walls of text.** The long explanations are still there when you search, but pages show one short line per setting.

## Fixes from the founder's own screen: 29 Oct 2026

- **Flowflow is firmer and clearer.** No more squashed, bulgy jelly: it leans and settles instead of smearing, its surface is smooth, it renders sharp, and its eyes are bigger.
- **The drop that follows your pointer keeps up.** It sticks to the pointer (it catches up in about a tenth of a second) and stays a crisp little droplet instead of stretching into a blob.
- **The file menu around Flowflow looks finished.** Neat dark glass buttons that read on any wallpaper, lime when you point at one, and a smaller close button.
- **Buttons you can't press right now are a calm grey,** not a muddy faded lime.
- **Nothing shows through the Stop button** at the bottom of Home any more.

## Clearer, calmer, nothing half finished: 29 Oct 2026

- **Questions say exactly what will happen.** When Squibby needs your OK, the card asks a plain question ("Install something?", "Change your project's Git history?"), shows the exact command or file, says why, and tells you whether Undo can take it back. The same in the notch.
- **One press fixes the two dead ends.** If Squibby's engine keeps stopping, there's a Restart button instead of "quit and open again". If Claude isn't connected, there's an Add your key button that takes you straight there.
- **Nothing unfinished in sight.** The Google section stays hidden until Google is set up in your version. The first run introduces Flowflow on its own instead of showing empty "Coming soon" boxes. Lessons say where they came from instead of "Draft".
- **The usual ring colour is honest.** It was labelled "Orange" but showed your water colour; it's now called "Usual" and draws in Squibby lime when it isn't water.
- **No error codes in your face.** If the screen or the microphone can't be used, you get a plain sentence and what to try; the technical detail goes to the log.
- **Drawing on your screen looks hand made.** Rings, arrows, underlines and boxes are now drawn like real pen ink: thicker in the middle, tapering as the pen lifts, drawn in the order a hand would at a hand's speed. A ring closes a little past where it started, an arrow gets its head after its shaft, and every mark has a soft edge so it shows on light and dark apps alike. A ring never covers what it's pointing at.
- **Settings is short now.** It opens on about 25 choices you'd actually change: how Squibby looks, the notch, which groups are on, talking, keys, your daily spending limit, house rules and privacy. Everything else (timings, budgets per mode, file formats, fine tuning) is under Advanced, and search still finds every setting.
- **One name for each thing.** The top of the screen is always "the notch", the big panel is always "Home".
- **No dead end in the first run.** You can skip adding your Claude key and add it later; Home then shows an Add your key button. The confusing "signing in with a Claude plan is not available" line is gone.
- **Receipts say what the fix cost** on your own Claude ("About 4 cents of your Claude"), and drop the count of commands nobody needed.
- **Pricing is set:** Free, and Pro at $10 a month ($8 a month yearly), with a 14 day trial and half price for students. You pay Anthropic directly for Claude; we never mark it up. Payments aren't switched on yet.

## Flowflow comes alive: 29 Oct 2026

- **Flowflow doesn't just sit there any more.** Every few seconds it does something small: looks around, shakes water off, stretches, bounces, blows a bubble. Never the same thing twice in a row, never while it's working, and never with less motion.
- **It breathes and floats** a little more, so it reads as alive even while resting.
- **Home is tidier.** The ask box no longer cuts its words in half, the line under the headline sits clear of the wave, "More ways to ask" and "Watches" open with a small arrow, and the folder buttons sit in one neat row at the bottom.
- **It's bigger on the edge of your screen**, and the "Ready" tag under it is gone while it rests. Words show up only when there's something to say.

## Work cards, captions and a real Esc: 29 Oct 2026

- **Work drops from the notch as it happens.** When a job starts, moves to its next step, or finishes with its proof, its card drops from the notch for a few seconds and tucks back. You see progress without opening anything, and nothing stays over your windows.
- **Captions while Squibby talks.** Anything said out loud also shows at the bottom of your screen, and goes away when it stops.
- **Esc takes back control.** While Squibby points at something or walks you through steps, Esc clears it and stops it talking. The rest of the time, Esc stays with your other apps.
- **Your shortcut opens Squibby instantly.** No animation when you open it from the keyboard, so it feels immediate.
- **The first-run demo shows its progress.** The step playing now fills its own little bar, like stories do.
- Each of these has a switch in Settings.

## Snappier, calmer motion: 29 Oct 2026

- **Everything answers faster.** Home drops from the notch in a quarter of a second without bouncing, and rolls back up just as quickly. The notch panel opens in a blink, from the notch, instead of fading in late.
- **Every button gives a small squeeze when you press it,** so you feel each press land.
- **Bounce is saved for the moments that deserve it,** like your first run and a fix that's proven to work. Everyday things just move cleanly.
- **Lighter on your battery.** Flowflow stays alive while resting but does far less work when nothing is happening, and nothing animates in panels you can't see.

## One Flowflow everywhere: 29 Oct 2026

- **Flowflow now looks the same wherever you see it.** The notch, its cards and the character picker showed a picture of Flowflow, while your screen edge and Home showed the live water. Now it's the live water everywhere, in the colour you picked.
- If your Mac can't draw the live water, or you turn off Draw live in Settings, the picture shows everywhere instead, still all the same.

## Answer right in the notch: 29 Oct 2026

- **When the AI needs your OK, the notch opens by itself** and asks there. No need to open Squibby for every small question.
- Questions you can take back (going online, installing something, a file outside your project) get Allow and Don't allow right in the notch. Allow means just this once.
- Anything that can't be undone, like sending, deleting or going live, and anything that changes your Git history, still says "Look first" and opens Squibby so you can see exactly what it wants.
- The buttons wait a moment after the notch opens, so a stray click can't say yes for you.
- Don't want it? Settings, Open the notch for questions.

## Claude comes straight from Anthropic: 29 Oct 2026

- **Squibby no longer carries Anthropic's Claude inside the app.** On the first run it downloads Anthropic's own build, once, straight from Anthropic's package, and checks it is exactly the build we test and signed by Anthropic before using it. It usually finishes while you're still meeting Flowflow; there's a "Getting Claude ready" step in case it doesn't.
- If Claude is ever missing or damaged, Home says so and offers "Get Claude".
- The app download gets about 230 MB smaller.

## Google: sign in, and connect Gmail, Calendar and Drive: 29 Oct 2026

- **Sign in with Google** in Settings, under Account. Google's own page opens in your browser; Squibby never sees your password. Your own Claude key keeps working without an account.
- **Connect Google accounts** (Work, Personal, as many as you like) for Gmail, Calendar and Drive. Then ask: "what did Sam email me about the launch?", "find me a free hour on Thursday", "what's in the pricing doc?". Squibby can search and read, and write Gmail drafts; it never sends an email, and adding a calendar event always waits for your OK.
- **Disconnect** any account in one tap: Google is told to revoke it and nothing of it stays on your Mac.
- For the team: Google needs a client id from Google's console before this works (see docs/milestones/M21-google-plan.md).

## Flowflow comes alive: 28 Oct 2026

- **It watches you.** Flowflow's eyes and body follow your pointer anywhere on the screen, not only when you are right next to it. Choose "Its eyes", "A drop" (a little drop of its water also trails your pointer around, stretching as it goes and settling beside it) or "No" in the first run or in Settings. Only where the pointer is, a few times a second, while Flowflow is in view; never what is on your screen, never kept.
- **It has weight.** When it slides in from the edge, travels to a window or is dragged, the water lags behind like jelly, squashes as it stops and wobbles. Coming in from the edge it lands with a splash.
- **It fidgets.** In Lively it does a little hop now and then when nothing is happening.
- **The logo lives inside the notch now,** in lime on the notch's black, sharp whatever your wallpaper.
- **Settings is inside Home.** The gear, Command comma and the notch's Settings button all open it right there, grouped under Character, Powers, Your Mac, Account and More.

## Make it yours: colours, themes, sounds and more: 28 Oct 2026

- **Pick the water's colour:** Ocean, Lagoon, Lime, Berry or Midnight. Flowflow, the drop that shows you where to click, its ring and the waterline all change together. One tap on the coloured drops at the top of Settings, and you see it at once.
- **Home has three themes:** Night (black), Deep sea (dark blue) and Paper (light).
- **Lively, Calm or Still** in one switch, and the character can be small, usual or large on the edge of the screen.
- **Sounds, if you want them:** soft water sounds when the drop leaves, when you click the right thing, when work is done and when something needs you. Off unless you turn them on, and silent during calls.
- **The pointer your way:** the water drop or a plain ring, the drop small to large, and the caption in lime or white.
- **The notch panel your way:** choose whether it says hello, shows the work and the quick buttons, and make it compact.
- **Settings is easy to find:** a Settings button in the notch panel, Command comma in Home, and a sliders icon instead of the old one that looked like the sun.
- **The first run slides** from screen to screen on a spring.

## A new first run, choosing your companion, and Settings that make sense: 28 Oct 2026

- **The first run feels like meeting someone.** A drop falls into the water and Flowflow rises out of it. Then you watch it fix a real bug (before you connect anything), choose your companion, name it, pick how lively it is and which edge of the screen it lives on, and switch off any power you don't want. Then you connect Claude and choose your project. The water at the bottom rises with every step, so you always know how far along you are.
- **Choose your companion.** Flowflow is ready today. The places beside it are for the companions still to come.
- **Rename it.** Call Flowflow whatever you like; Settings uses the new name.
- **See the first run again** any time: Settings, at the top of your character, "Show the first run again". Your key, folder and settings stay as they are.
- **Settings is grouped:** Character, Powers, Your Mac, Account and More, instead of a long list. It opens on your companion, alive on the water, so you can see what you change.
- **Home is a cross section of water:** Flowflow floats in the surface, and the work happens below it, with a white ask box and plain rows for the quick actions.

## Show me how is now a drop of water, and everything is night and lime: 28 Oct 2026

- **Flowflow shows you where to click with its own water.** A drop swells out of its side, pinches off and flies to the button you need. It lands with a squash and spreads into a ring of water around the button, with a lime bubble saying what to do. Click the right thing and the ring bursts into a splash. The drop then flies home and Flowflow catches it with a ripple. The next step starts the same way.
- **One colour means "do this": lime,** the logo's colour. The main buttons are lime keys that sink when you press them. Headings and buttons use the Mac's rounded type. The notch panel says hello when nothing is running: "Hey. What are we finishing?"
- Gold and mint are gone from the notch. Water blue belongs only to Flowflow, and amber still means something is waiting for you.

## A new mark: the smiling sun in motion: 27 Oct 2026

- **Squibby has its logo:** a round sun with a smile cut through it and seven curved rays spinning the same way, like a pinwheel. Fun and warm, and it reads at 16 points. The founder picked the shape and the colours after several rounds and some research on which colours AI and developer tools already own.
- **The sun beside the notch is now this mark,** in one colour like the Mac's own menu bar icons: white on a dark menu bar, black on a light one.
- **The app icon is the mark in electric lime on matte black,** a colour no AI or developer tool owns, and the colour of "it works".

## Glow, and the sun beside the notch: 27 Oct 2026

- **The panel under the notch wears Glow, the palette the founder picked:** a shiny gold "+ Fix something", a mint "Is it safe to go live?", a warm "Find the problem", and a soft grey lift under the notch's black.
- **Squibby's sun sits beside the notch** on the menu bar, like the best notch apps do with their logo. It breathes very slowly; rest the pointer on it (or on the notch) and the panel opens. It takes 26 points of the menu bar each side of the notch, less than the wings while work runs.

## The water is on, the notch opens into a panel, and a logo: 27 Oct 2026

The founder: "the hovering on the notch is pretty bad", "I didn't see the fluidity mechanics", "it has to be something like HeyClicky's notch hover", "Flowflow is not the main guy, he is the water agent", and the logo "has to be a circle with 7 rays and the gradient like this".

- **Flowflow is drawn live by default:** the founder's own water physics, with eyes that follow your pointer, on the screen edge, in Home and in the notch. It goes back to the pictures by itself if a Mac cannot draw it, and "Draw Squibby live" in Settings turns it off.
- **Rest the pointer on the notch and it opens into a small panel**, like the notch growing down, with colour: one glowing sunset button, "+ Fix something" (the colours of the new mark), a card for each piece of work with its agent's face, what it is doing ("Step 2 of 3: ..."), the cost so far and then its result, and a row of pills: "Find the problem" in warm amber, "Is it safe to go live?" in green, and a button that opens Squibby in full. Any of them opens Home. No character peeks out any more: Flowflow is the water agent, shown on its own work.
- **A new mark and app icon:** a sun of seven rays, an orb lit from below in a sunset gradient, on a deep plum square. Made from code (`app/brand/`), so it can be tuned in one place.

## See it work in the first minute: 27 Oct 2026

The four reviews of the whole product agreed: a new person never reached the "wow". Nothing opened at launch, and setup asked for an Anthropic key before anything worked.

- **Home opens by itself the very first time you open Squibby.** No guessing that the notch is where it lives.
- **The first thing you see is a short recorded fix:** a signup page whose Join button fails, Squibby finding the exact line, one small change, the project's own check going from red to green, and Undo. Flowflow acts it out and splashes when the check passes. It says plainly that it is a recording and changed nothing on your Mac. Every file, line and message in it is the real practice project's, and a test makes the same fix on a copy and runs the check, so the recording can never show something Squibby does not do.
- **Watch it again any time:** Learn has "Watch the 15 second tour".
- **Setup is three steps:** see it work, connect Claude, pick a folder. The questions, the four groups and the keys are one optional last step you can skip in one press.
- **Your key is checked the moment you save it.** Squibby asks Anthropic once (it costs nothing) and says "Anthropic accepted your key" or plainly why not, so a wrong key is found in setup, not on your first fix. A "Get a key" button opens Anthropic's own page, with three short steps.
- **Proof you can see:** under every fix, a small green or red chip for each check that really ran ("Builds", "Tests pass", "Works in a browser").
- **Drop a project folder on Flowflow and pick "Fix this":** it becomes your project and Home finds what is wrong in it.
- **"Is it safe to go live?" is now a quick action** right after "Find the problem", the two things Squibby is for.

## One calm look and small moments of delight: 27 Oct 2026

- **One set of sizes everywhere.** Six text sizes, five corner sizes, one spacing scale and one spring, so every screen lines up.
- **The notch.** Flowflow no longer looks sliced when it peeks: it fades out into the black. Working shows a thin turning arc, thinking one breathing dot, and nothing is grey.
- **A small celebration when a fix is proven.** The tick draws itself, glows green for a moment, and the notch gives a little bounce. Off with Reactions off or Less motion.
- **Home is calmer.** The folder's name and a status dot sit at the top left, the buttons are smaller, the ask box is softer and glows when you type, the answer sits on its own card, and the line about the stop key is gone (it is in Stop's tooltip now). While something works, Stop is the one white button.
- **Undo says what it did.** The Undo button turns back when pressed, and "Put back as it was" shows for two seconds once your files are back.
- **Home unrolls out of the notch and rolls back up when you close it** with Close, Esc, the island or the character.
- **The character lost its web style rings** and the grey box when something went wrong; the count of questions is a small black pill.
- **Flowflow drawn live is merged in, still off.** The founder's live water (with eyes) is now the one live drawing, in the corner and in Home, behind "Draw Squibby live". It stays off until it has been seen on a real Mac.

## Nothing broken, no jargon: 27 Oct 2026

Every button does something you can see, and when Squibby's own machinery fails you read one plain sentence.

- **Explain an error now explains what is in the box.** Paste an error into the ask box and press it: two plain sentences and where it is in your project, the same as the explain keys. With the box empty it says how, in a line you can close. Reading an error in another app still needs the keys, with the light on first.
- **The mic button is now "How to talk".** It shows the keys to hold. A click never turns on the microphone.
- **Start or Show me with an empty box** puts the cursor in the box and says "Type what you want done first." (or how to ask Show me), never an amber error.
- **In the Settings window, "Walk me through it" starts that walkthrough in Home**, and "Open the practice list" opens Learn. Before, both just opened Home.
- **One plain sentence for every failure from Squibby itself**: the undo point, starting the helper that runs Claude, the checks, the server, picking a folder, saving the key, saving the logs. No more "could not handle agent.start: git add failed", "(exit code 1)" or "The engine is not running". The raw detail is kept in Squibby's log (on this Mac only, secrets hidden, your home folder written as ~) for a problem report.
- **Check panels lead with a plain summary and the file and line.** The check's own output is behind "Details".
- **"The engine" is now "Squibby"** everywhere you read it.
- **Explain an error checks the error still applies.** If the line it names is already fixed, it says it looks already fixed and suggests nothing.
- A change that weakened a check now says "The change weakened a check, so it was not accepted." (Claude is still told to fix the real problem.)
- A test now fails if any line you can read contains a machine word (exit code, git commands, stderr, hook, engine, checkpoint, SDK).

## Flowflow stays tucked away until you call it: 27 Oct 2026

The founder: "flowflow will always stay inside the side, only when I bring my pointer to the ends of the side screen, and when it's idle it will always be there".

- **While nothing needs you, the character waits fully out of sight** just past the edge of your screen. No sliver, nothing in the way of the app underneath.
- **Push the pointer into that edge, beside where it waits, and it springs in.** It slips back out a few seconds after you move away.
- It still comes in by itself when something needs your answer, and always before it listens or looks at your screen.
- It no longer peeks in on its own when work starts or finishes, or now and then while idle; the notch shows that instead. The switch "Peek in on its own" in Settings brings those peeks back. The other switch is now called "Tuck away past the edge of the screen"; turn it off to keep the character in view.

## The island in the notch is fun now, and never says Ready: 27 Oct 2026

The founder said the island "looks ass and complicated" and "does not always have to show Ready there". So it now works like the best notch apps:

- **Idle, it is just the notch.** Black, no words, nothing to read.
- **Rest the pointer on it and Flowflow peeks out** from under the notch with a little springy bounce and a wobble, and tucks back when you move away. A short line shows under it only when there is something real to say: not connected yet, an update waiting, the engine stopped.
- **While something happens, the notch grows small wings.** A tiny Flowflow swims on the left; on the right one live mark: three dots while thinking, a spinning ring while working or looking, moving bars while listening, a pulsing amber dot when it needs your OK, a green tick that draws itself when done (the wings tuck away four seconds later), a small red dot when something went wrong. Each wing takes about 40 points of the menu bar, no more.
- **Rest the pointer on the wings** to see one short line of what is happening, like "Working on fix the gallery page" or "Needs you: install a package".
- Everything moves on springs, and simply appears with Reduce motion or Less motion. Clicking still opens Home. VoiceOver still hears what is going on, in words.

## Settings in its own window, and the character peeks in from the edge: 27 Oct 2026

The founder: "this needs to be fun", and "our guys can always be outside of the screen, it might take a sneak peek to see what is already happening".

- **Settings can open in its own window.** A normal Mac window with a title, close and minimise, which you can resize. It has the same side list of sections and the same rows and switches as Settings in Home, and follows your Mac's light and dark. Changes reach Home, the island and the character at once. (The button to open it from Home and the island comes with their redesign.)
- **The character rests just past the edge of the screen.** About three quarters of it is out of sight, with a sliver showing. It peeks in about half way when a task starts or finishes, comes all the way in when you point at it, and slips back out a few seconds after you move away. While something needs you, it stays in view until you answer.
- **It always comes fully into view before it listens or looks at your screen**, at once, so you can see it first.
- **Now and then it takes a curious peek**, never more often than every 3 minutes, never with Reduce motion or Less motion, and never during a presentation or a call.
- It never hides behind the menu bar, the notch or the Dock, or onto another display; on those edges it just stays in view.
- Two new switches in Settings, Home and the character: "Rest past the edge of the screen" and "Take a curious peek now and then". Both are on; turn the first off to keep the character fully in view as before.

## Home is one black panel under the notch, with Flowflow beside you: 27 Oct 2026

The founder saw the wide Home with its side list and said it looked complicated and needed to be fun. The best notch apps open as one big black shape that drops out of the notch, with big content, few words and a few round buttons. Home now works that way.

- **One black panel, in light and dark.** Home hangs from the notch: square at the top, round at the bottom, black with white words whatever the Mac's theme. Nothing else is drawn around it.
- **Flowflow is in Home, large and moving.** The same water as on the desktop sits on the left: it types while working, waves when it needs your OK, and splashes when a task is done.
- **The job in big words.** At the top: what you asked for, and one short line (working and what it cost so far, checked and working, or that your answer is needed just below).
- **One ask box and three quick actions:** Find the problem, Explain an error and Show me. The mic in the box shows the keys for hold to talk. The other ways to ask stay behind "More ways to ask".
- **Results are big cards.** An answer, a receipt, research or a rescue shows as a large, easy to read card below, with ticks for what was checked and the cost.
- **No side list.** Small round buttons at the top: What I did, Learn and Memory open inside Home with a back arrow; the gear opens Settings (in its own window once that lands; until then, inside Home); and Close.
- **Undo and Stop only when they can act,** as small pills at the bottom: Undo after a task that changed files, Stop while something works.
- **It springs open** from the notch in about a third of a second. With Reduce motion or Less motion it just appears.
- Home is 640 points wide (680 with Large; 720 did not leave room for the character on a small display) and as tall as what it shows, from 300.
- **Checked by machine and in a browser preview only.** Nobody has seen it on a Mac yet.

## Home is wider, with a side list, and Settings reads like a Mac app: 27 Oct 2026

The founder found the card under the notch "too narrow". Taking the lead from how HeyClicky lays out its own Home:

- **Home is 600 points wide** (680 with Large), up from 380. It is never shorter than its list of places, so it does not jump around.
- **A side list of places, with their words.** Now, What I did, Learn, Memory and Settings sit down the left, each with its drawing and its name, instead of a row of tiny drawings. The open one has a bar on its edge. Up and Down move between them.
- **Every place has a title and a close button** at the top, so you always know where you are and how to get out.
- **Settings shows one section at a time.** Opening it turns the side list into Back and the list of sections. Each section is one rounded group of rows: a name, a short line of what it does, and the control on the right. On and off settings are real switches. What a setting usually is, and Reset, show only once you changed it. Search still looks through everything.

## Squibby checks first, quotes a fair price and speaks plainly: 26 Oct 2026

Found in the first hands on session on a Mac, the engine side.

- **A fix from an error now checks the error is still real.** Before, "Fix it" on an error that was already fixed made up a cause and moved a line for no reason. Now it reads the file and line, looks at whether the thing it names still fails, and if not says "This error looks already fixed" and changes nothing. A new test project, `stale-error`, measures this. One real run: it said so and changed nothing, for 3.7 cents.
- **The cost shown before Start is about what it really costs.** It said about 25 cents for a task that cost 3 cents. It is now what steps really cost (about 4 cents on the usual model) with a margin of one half, so one step shows about 6 cents. What a task may spend at most did not change.
- **What I did reads plainly.** A step of a plan is named by the step, not by Squibby's own instructions ("Do only this step..."). A fix started from an error you selected says which app it came from ("Fix for an error you selected in TextEdit"), and never keeps the error itself.
- **Squibby no longer talks like its own code.** Claude was told to say "the hook is blocking me". It is now told never to say hook, sandbox or permission mode, and when something is not allowed to say "Squibby does not let tasks...", with what you can do. The reasons it is given are in everyday words too.
- **No empty hidden folder left in your project.** Claude Code leaves an empty `.claude` folder in the project folder. Squibby now removes it after a task, but only when it was not there before and is empty. A `.claude` folder of your own is never touched.
- **Support can see that an approval happened.** The activity log now records that a question was asked (the kind of risk and which tool) and how it was answered (yes, no, expired or stopped), never the question's words.
- **Checked by machine, plus one real run** of the new test project only. Nobody has seen these changes on screen.

## Fixes from the first hands on session, the way it behaves: 26 Oct 2026

- **The explain key always answers.** Before, pressing it with nothing selected in Cursor showed nothing at all. Now every press ends in a plain line on the card: nothing was selected, Accessibility is off, the field is private, Squibby itself is in front, no app could be found, or the app could not be read in five seconds. Apps like Cursor and VS Code that hide their text boxes until told a screen reader is near are now woken for that one press and put back to sleep after.
- **The Show me key listens at once.** Press it, say what you want to find, press it again. The light comes on first. If voice is off, the speech model is not downloaded or the microphone is not allowed yet, it opens the question box as before. There is a new switch in Settings, "Show me key listens at once", on by default.
- **Undo where you look.** What I did now has an Undo button on the newest task that changed files, with the same question as before. Older tasks say why they have none: undoing an older task would also take back the work done after it.
- **Answers are called Answer.** A plain question is answered under "Answer". "What changed" stays for tasks that changed files.
- **Pick any hotkey.** Under Keys to remember, tick Control, Option, Shift or Command and choose the key from a list. It needs two ticks, one of them Control or Command, and it refuses the Mac's own shortcuts and keys another job already has. Nothing reads what you type.
- **Not seen on a real Mac yet.** All of this was checked by tests on a Mac with no one at the screen. The explain key in Cursor, the Show me key listening and the new hotkey picker need your eyes.

## A calmer look, and Flowflow that moves like water: 26 Oct 2026

After the first time you used it on your Mac, you said it looked bad, the card was complicated, replies were in a small box and Flowflow was a photo in a square. This is the first round of fixing that. It is checked by machine and in a browser only: nobody has seen it on a Mac yet.

- **The square box is gone.** Flowflow now floats on your desktop with nothing behind it. What it says sits in a small see through pill that stays readable on any wallpaper.
- **Flowflow is water.** It breathes and wobbles when idle, its top lags behind when you drag it, it squashes and sends out a ripple when you click it, it melts from one pose into the next, it has a soft shimmer, and it throws a few droplets when a task is done. With less motion (your Mac's setting or ours) it only fades between poses.
- **No more orange.** The app is black and white and follows your Mac's light and dark. Only small marks keep a colour: green for checked, amber for waiting for your yes, red for a refusal. Flowflow's own glow is a cool blue, on the character only.
- **Home is one calm column.** The job comes first and the ask box after it. The places (Now, What I did, Learn, Memory, Settings) are a small row of drawings at the top. One filled button; the other ways to ask, the options and the watches are behind one quiet line. Undo and Stop are always at the bottom.
- **Replies are easy to read.** Larger type, a comfortable line length, no small box. What was checked shows as ticks, with what it cost and how many files changed.
- **The ring when you drop a file is bigger and calmer.** Round targets of 44 points with space between them, small drawings instead of letters (a format shows its own name), and a More that opens the whole list in Home.
- **Under the hood:** a character is now a "skin" in one place, so a new character brings its own pictures, its own one colour and its own motion without touching the rest of the app. The rules are in `docs/design/look.md`.
- **Not decided:** the founder has not chosen a visual direction. This round is neutral on purpose.
## Flowflow can be drawn live, as moving water: 24 Oct 2026

- **A new way to draw the character, off until you choose it** (Settings, "Draw Squibby live"). Instead of a picture, Flowflow is drawn live on your Mac's graphics chip as a droplet of water that stretches the way it moves, squashes and rebounds when it stops, wobbles and settles, with two eyes that follow your pointer and tiny drops that leave and come back.
- **It only reflects what really happened:** it brightens and sends out a ripple when work is proven, turns cloudy and darker on an error, closes its eyes when asleep, and squishes where you touch it. If your Mac cannot draw it, the pictures stay.
- **A preview page with sliders** for how stiff, how damped, how fast, how rippled and how clear it is: `docs/flowflow-live.md` says how to open it. It is a first pass at the look and has not been seen in the real app yet; nothing is claimed about speed beyond what was measured in the preview.

## A safeguard before company paid usage can ever be switched on: 24 Oct 2026

- **Your own Claude key can never be sent to Squibby's server.** The audit found that if the company paid route were switched on, the light helpers would have looked in the same place for their credential as for your own key, and could have sent your own key to our server. Now the two never cross: a Squibby sign in token goes only to Squibby's server, and your own key goes only to Anthropic. The company paid route is still off, so nothing was ever sent.

## Second Look is steadier: 24 Oct 2026

- **It no longer calls a correct sum wrong.** "30 + 45 + 75 = 150", "2 + 3 + 4 = 9" and "4 + 2 × 3 = 10" were cut into pieces and one piece was reported as a mistake. Longer sums, decimal commas ("1,5 + 2,5 = 4") and "from 2020 to 2024" are now left alone. A real slip is still found.
- **It no longer drops a real problem.** "This code has no error handling" was read as Second Look changing its mind, and the answer could end up marked solid. Real problems now stay.
- **Odd text can no longer freeze Squibby.** A long run of numbers and commas, or of dots, could keep it busy for many seconds, Stop included. It now answers in a blink.
- **A folder counts once towards the daily limit,** however it is spelled (with or without a slash at the end, or through a link). Before, each spelling had a limit of its own.
- **Your key stays with Anthropic (or the usage server).** If a server ever answered with "go to another address", the quick helpers would have followed it and sent the key along. They no longer follow.
- **Checked by machine only,** with a stand in model: nothing was run on real Claude.
## A checking round on the Mac app's own code: 24 Oct 2026

- **Excel files with accents and an ampersand now open.** A cell such as "R&D" followed by accented text ("R&D café") used to make the whole sheet unreadable when you dropped it in the ask box. It is read now.
- **A hostile spreadsheet or Word file can no longer hang or flood Squibby.** One built to be slow, to copy a huge text into every cell, or to claim a gigabyte of pages is now read in a moment, cut at the usual limit, or refused as too big.
- **Folders in "What Squibby made" whose names hide invisible or line breaking characters are left out of the list**, so a name can never read like another one in the question before it goes to the Trash. Folders Squibby makes are never affected.
- **A broken names file now stops the build** instead of crashing the app the first time it needs a name. Nothing changes for people.
- **Checked by machine only,** on this Mac with made up files. Nobody has dropped a real hostile file or seen these screens on another Mac.
## A careful read of the usage server and the new screens: 24 Oct 2026

- **Nothing here is switched on,** and no real Claude was used. This was a hunt for mistakes, each one proven with a failing test before it was fixed.
- **Things a person could notice:** a file added to the ask box with strange hidden characters in its name now shows and sends a clean name (it could hide words or reverse text), and the notes about a file that could not be read no longer show its full path. A folder in What Squibby made whose size could not be fully counted no longer claims to be about 1 MB.
- **Things behind the scenes:** the managed usage server now reads a request only up to its size limit, only talks to an https address and never follows a redirect with our key, refuses the speed and priority options, and gives a person's running slot back even if saving the cost fails. The payment webhook keeps one person's events in order even when they arrive together, and its list of handled events no longer grows for ever. The engine now counts a document's size after hiding secrets, the same way the screen does.
- **Not fixed, written down:** the open questions are in `docs/milestones/M14-guide-agents-and-second-look-plan.md` under "Audit round 3".
## The paid plan can now tell Anthropic who is who, and cut one person off: 24 Oct 2026

- **Why:** Anthropic said we are responsible for what people send through our key, so we need a way to find and stop one account without reading anyone's messages. We do not keep messages, so this works from a code.
- **What it does:** every request that would go to Claude on a paid plan now carries a code that stands for the person. It is made from our own account number with a secret only we hold. It is not a name or an email, and nobody can work back from it without the secret. If the secret is not set, nothing is sent.
- **Cutting someone off:** if Anthropic reports a code, one operator command finds whose it is and, only when told to, pauses that person: their sign ins stop working and they cannot get a new one until we let them back. Without the extra word it only shows what it would do.
- **Written down, as drafts for a lawyer:** the rules for what people may not send, the steps for handling a report, and the ordered list of things to do before going live (`docs/legal/`, `docs/launch/company-paid-go-live-checklist.md`).
- **Still off.** Nothing is deployed and no plan is on sale. Checked by machine only: the real store, the real Anthropic notices and a real Dodo webhook have not been seen. Whether Anthropic is happy with this process is not known.
- **Longer sums are checked whole.** The first version of the fix left a sum with three or more terms unchecked (`6 + 7 + 8 = 22` slipped through in the free test). Now a chain that uses one kind of operator is redone from start to finish, and a mixed one (`4 + 2 x 3`) is left to the model's look, because people write it both ways.

## Anthropic says the company paid plan is a standard setup: 23 Oct 2026

- **Anthropic's support wrote back on the question about small features.** Building a paid product on their plain API under our own key is "a standard setup", and the server design we described (check the plan, enforce a daily cap, forward under our key, record token counts only) works. That clears the way for a HeyClicky style plan for the guide, Explain, Second Look and Prompt help. It is not switched on yet.
- **They set one condition:** we are responsible for what our users send through our key, so we need our own acceptable use terms and a way to cut off an offending account. The next steps, and what is still unanswered (shipping the program inside the app, and the agreement for Claude Code usage), are in `docs/outreach/anthropic-support-reply-2-2026-10-23.md` and the F22 record.

## Three small fixes: 23 Oct 2026

- **Squibby no longer asks for details you never gave.** Ask for "a one page website for my bakery with opening hours and a contact section" and the plan used to include a contact step that stopped to ask for an email address you never mentioned, so a vague request asked you twice. Now neither the plan nor any step may ask for an email, a phone number, a price or a logo that the request did not mention. It puts in an obvious placeholder, says in the step that it is a placeholder you can change, and asks only when the work truly cannot go on without something only you know. One real run on the bakery request: it did not ask for an email, and it did not ask anything else either, so it also treated the bakery's name as a placeholder. That is fine for the page but it means the question and answer path was not exercised by that run.
- **The daily limit message makes sense with no project open.** With no project open, running into the daily spending limit used to say "This project has reached its daily spending limit". It now says "You have reached your daily spending limit." with the same next step. With a project open the words are exactly as before.
- **The quality checks we run on Squibby itself now say Squibby** instead of the old name in the messages they print. Nothing about how they work changed.
- **Checked by machine only,** apart from the one real run above (about $0.11).
## The last two real checks held up after the rename: 23 Oct 2026

- **Pointing at the screen:** it still hits the right spot 100% on simple pages, 95% on busy ones and 93% on everyday app windows (128 asks, about 67 cents).
- **The loop breaker:** every case that could be fixed in one go was, and the two that only a person can decide stopped and asked. The loop card itself was not needed this time. About 21 cents.

## A way to say yes to the shared notes in a folder Squibby made: 23 Oct 2026

- **The gap:** in a folder Squibby makes for you ("make me something"), Squibby does not write AGENTS.md and CLAUDE.md, the notes other AI coding tools read, until you say yes. Until now there was no place in the screens to say it.
- **Now:** open Home, then the Memory tab, in one of those folders. There is one plain row that says what the two files are for, with one button, Add them. Press it and they are added as soon as Squibby has notes about the project. Then the row says Added and does not ask again.
- **Your own files are safe:** if the folder already has its own AGENTS.md or CLAUDE.md, the row says so and offers nothing. Squibby does not touch them. In any other project the row does not show, and nothing else changed.
- **To take it out again:** the button at the bottom of the Memory tab that removes Squibby's notes from your shared files still does that.
- **Checked by machine only:** the check that the open folder is one Squibby made, the four states of the row, and the words. Nobody has seen the row on a Mac yet, and whether the project's Undo also takes the two files out again is not proven.

## Getting paid through Dodo Payments is built, and still switched off: 23 Oct 2026

- **The plan:** people will pay for Squibby's included usage through Dodo Payments, which sells the plans and takes the payment, instead of Stripe. The code that listens to Dodo's messages (a person subscribed, renewed, missed a payment, cancelled) is written and tested. It sits next to the Stripe one.
- **Safe by default:** it checks every message really came from Dodo, ignores old or repeated ones, and applies each only once and in order, so an old message can never undo a newer one. A cancelled, expired, failed or on hold plan drops the person to the free plan straight away. If it is unsure, it grants nothing.
- **Which plan is which** is a small settings file you fill in with the product ids from your Dodo dashboard, not something written into the code. A product it does not know gets no plan, and it says so in plain words.
- **Privacy:** it never writes a message body, an email or a name in any log, and the signing secret lives only in the server's settings, never in the repo.
- **Still off:** no payment address is served at all unless you pick a provider, and included usage itself stays off until Anthropic says yes in writing. Fees, payout timing and terms are Dodo's own: check your Dodo dashboard.
- **Checked by machine only,** with made up messages and no network. No real Dodo test message has been received yet: that needs your Dodo account. What may differ in real life is listed in the managed usage plan.
## Anthropic replied: 23 Oct 2026

- **Anthropic support answered the questions we sent.** Building on their Agent SDK with the person's own API key is the supported path. Signing in with a Claude plan inside an app is not allowed, so Squibby will not offer it. Including Claude usage in our own plans needs a written agreement, which support cannot give; we are still waiting on that.
- **One line needs a written answer:** support said shipping Anthropic's program inside our app is not allowed, while their published page says it is allowed if it is unmodified and each person uses their own key. We meet every condition on that page. The reply, what it settles, the fallback if the answer is no, and the follow up to send are in `docs/outreach/anthropic-support-reply-2026-10-23.md`.
- **Nothing in the app changes today.** The app's own screens never use the Claude Code name.

## You can now see what Squibby made and clean it up: 22 Oct 2026

- **A new list in Settings, "What Squibby made".** When you ask Squibby to make something with no project open, it makes a new folder for it. Until now you had no way to see those folders in one place. The list shows each one with when it was made and about how big it is. It sits under Practice, below the setting that says where new folders go.
- **Three buttons on each folder:** Open as project, Show in Finder, and Move to the Trash. Moving to the Trash always asks first, names the folder, and says you can put it back from the Trash. Nothing is ever deleted outright.
- **What it will not do:** it will not move the project you have open, or any folder while something is working or waiting for you. It only lists real folders sitting directly in that one folder, never a shortcut to somewhere else, and it only looks at names, dates and sizes, never inside your files.
- **If a folder has git history,** the list says so and asks a second, longer question before moving it. Squibby does not run any git command or touch your git; the folder simply goes to the Trash with its history, and can be put back.
- **Checked by machine only,** with temporary folders and a stand in for the Trash. Nobody has tried it on a real Mac yet, so the real Trash, and folders kept in iCloud Desktop and Documents, are not yet checked.
## A plan for the first demo clip and the launch: 22 Oct 2026

- **A shot list for the first clip** (red to green, with Undo and the one line why, about 25 seconds, on the practice project), two follow up clips, the post words, true answers to the questions a reel like this gets, and a launch order that fits one person: `docs/launch/demo-clip-and-launch-plan.md`.
- **The bigger real Claude checks were rerun after the rename and held:** 23 of 24 test projects fixed outright and 1 stopped to ask first (nothing broken, nothing invented, the problem found in the right place 24 of 24, $0.11 a fix), Explain 96%, the second model review caught every risky change with no false alarms. About $2.70 in all.
- **Two stale lines were fixed in the docs:** the rules file said agents were out for now, but basic ones (make me something) have been in since the three layer decision; and a finding that had already been fixed was still listed as open.

## Answering a question now carries your plan on: 22 Oct 2026

- **A found bug, fixed:** when you ask for something vague ("a one page website for my bakery"), the first step builds the page and then asks a question only you can answer, such as the bakery's name, and the plan stops. Until now, typing the answer finished only that one thing and **the other steps were forgotten**: they never ran.
- **Now your answer finishes that step and the rest of the plan carries on**, in the same folder, each step with its own undo point, check and receipt, and the answer is used in the later steps. The same rules hold: anything that needs a tap still asks, the plan keeps only the money it had left, and Undo of that step ends the plan.
- **The words on the card say so:** under the question it now reads that this step finishes with your answer and the rest of the plan carries on, and a plan stopped on a question says it carries on when you give it.
- **Checked on real Claude, twice, for about $0.20 in all:** the plan did carry on after the answer, with proof and a receipt for each step. Both times Claude then asked a second question (an email address, because the plan's contact step mentions one and the request had none), and the second answer carried it on to the end. Not yet seen on a real Mac screen.
## The daily spending limit now covers the small helpers when no project is open: 22 Oct 2026

- **A gap is closed.** The small helpers (Prompt help, Show me how, the error explainer, Second Look, Draw it for me, Explain and pictures you add) used to count against your daily spending limit only when a project was open. With no project open they were not counted, so there was no daily cap on them. Show me how was not counted at all, even with a project open.
- **Now they all count, always.** With a project open, the cost goes in that project's day. With none open, it goes in a day of its own for "no project", with the same limit and the same midnight reset. It is kept when Squibby restarts, it is only a number (never any of your words), and it shows in the Settings spending row.
- **When the limit is reached** each helper says the usual plain sentence and does not ask Claude anything. Your projects and "no project" each have their own day, so one being full never blocks the other.
- **Checked by machine only** with stand ins: no real Claude was used and nobody has tried it on a real Mac yet.
## Undo now really empties a folder Squibby made: 22 Oct 2026

- **When you ask Squibby to make something with no project open, Undo of the first step now gives you back an empty folder.** Before, it left three of Squibby's own notes behind (a hidden notes folder and two files called AGENTS.md and CLAUDE.md that other coding tools read). Now Squibby does not write those two files in a folder it made, and does not ask about them, unless you say yes. Its hidden notes folder (`.companion`) is still kept, so the folder is empty except for that. Your own projects work as before: they still get the question about the shared files.
- **Checked on real Claude:** one run of the bakery request ended with a folder holding only the hidden notes folder after Undo, for about $0.07.

## Checked again on real Claude after the rename: 22 Oct 2026

- **The renamed app passed every real check:** 13 of 13 smoke checks and 21 of 21 fix, undo, approval and safety scenarios, for about $1.35 in all. One scenario first failed because the test script was too strict about a multi line commit message; the app itself behaved correctly. The script is fixed.

## Flowflow looks a little worried when something goes wrong: 22 Oct 2026

- **When a check fails or something breaks, the character now shows a small worried face in its own bright blue**, instead of the half hidden peek. It is the same drawing as the sad one that was left out, recoloured so it is never grey, and it reads as "uh oh", not as blame.

## The app is now called Squibby, and its water creature Flowflow: 22 Oct 2026

- **Every word you read now says Squibby.** The cards, the messages, the permission questions, the menu bar, the Delete everything question, the lessons, the install and privacy notes, and the words we send to Claude about who we are. The built app is now `Squibby.app`, and the disk image is `Squibby-<version>.dmg`.
- **The water creature is called Flowflow** wherever a character is named.
- **One file holds the names.** `protocol/names.json` is read by the screens, the engine and the Mac app, so the next rename is one edit. A test fails if the old name is left in a sentence a person reads, or if the Mac app and the screens disagree about which names exist.
- **What did not change, on purpose, so nobody loses anything:** the app's hidden identity (`dev.companion.app`), the Keychain items, the data folders, the `.companion` notes in projects and the code names. Practice copies and notes blocks made under the old name are still recognised, so Remove my copy and Delete everything still find them. New practice copies are named `Squibby practice ...` and new folders go in `Squibby makes`.
- **Checked by machine only.** The tests pass and the app builds and starts, but nobody has used the renamed app on a real Mac yet. Because the model is now told the new name in a few places, a few real Claude checks should be run again before the next release.

## The water character is in the app: 22 Oct 2026

- **The character on the screen edge is now the water creature**, with a different picture for each thing it is doing: asleep when off, a plain look when idle, a light bulb when thinking, a laptop when working, a magnifying glass when checking, a wave when it needs you, a splash when something is proven, and a half hidden "uh oh" when something went wrong.
- **It swims** when it comes to the window it is about, and splashes on a big win. A soft glow around it still shows when it is listening, looking at your screen, waiting for you, or done.
- **Two things were left out on purpose:** the angry face (this is a tool, not a mood) and the sad face (a broken project is bad enough without a guilt trip). The Apple logo on its laptop was removed.
- **Not tried on a real Mac yet.** It looks right at the size of the dock on a light and a dark background; the real look comes in the Mac session.
## Drop a document in and ask about it: 22 Oct 2026

- **You can now drag a PDF, Word, rich text, OpenDocument or Excel file into the ask box** (up to 20 MB), and Squibby reads its words on your Mac, hides anything that looks like a password or key, and sends only the text with your question. Nothing is kept, and the file itself is never sent.
- **Plain lines instead of failures:** a locked PDF, a scanned page with no text, and a file that cannot be read each get their own short explanation. Old `.xls`, Pages, Numbers and Keynote files are not supported yet.
- **How much text goes** is a setting (20, 50 or 100 KB; 50 by default), and a long document says in plain words where it was cut.
- **Quiet while another app uses your microphone** is built but switched off until the Mac session shows it works without surprises.

## "Make me something" tried on real Claude: 22 Oct 2026

- **The engine behind "make something with no project open" has now run on real Claude, in a brand new empty folder.** A one page bakery site was planned in 3 plain steps, built, checked in a hidden browser and given a receipt for each step. "What should I know before opening a small bakery" came back with 4 cited notes and nothing else written. Undo took the page away again. Nothing was written outside the new folder, no key leaked, nothing touched git. All of it cost about 23 cents.
- **One thing to know:** if you do not say the bakery's name, it builds the page, then stops to ask for it, and the other steps wait for your answer. With the name and the facts in the request it finishes all three steps. The screens still need to be built, and the folder making on the Mac has not been tried in the app.

## Second Look's engine: 22 Oct 2026

- **The engine behind "check any AI answer" is built.** It redoes the maths itself (sums, percentages, table totals), so a wrong number is caught for certain, not guessed. Then one short look by Claude covers code, citations, out of date facts and steps that do not follow.
- **It is honest by design:** it never says "solid" when the maths found a slip, never claims to have checked a source (it cannot search yet), and says "I can't tell" when it cannot. Secrets are hidden before anything is sent.
- **Tested on 30 AI answers, 15 with a planted mistake.** **Real score with Claude (22 Oct 2026, about 15 cents):** it caught every planted mistake. The first real run also flagged 3 of the 15 clean answers (20%, over the 10% target), once because Claude contradicted itself mid sentence ("the sum is wrong ... the addition holds"). After a tighter instruction and a filter for that, false alarms were 0% on one run and 7% on the next. The button and the card come with the screens.

## The light features can run without Claude Code: 22 Oct 2026

- **Prompt help, Explain, Draw it for me, the error explainer, Show me how and pictures you add can now go straight to Claude's plain API**, without starting Claude Code. That matters because Anthropic's terms let a company pay for the plain API for its users, but not for Claude Code. So a free version of the guide with no key of your own is now possible, once the usage server is live.
- **It is switched off for now.** Nothing changes for anyone until each feature has been tried once on real Claude.
- **A picture of your screen is never written to disk on this path,** not even for a moment.
- **Fixing still needs your own Claude,** until Anthropic agrees otherwise. If you only have a Companion sign in, Companion says so in plain words.
- We asked Anthropic in writing; their support team passed the question to a person who handles commercial terms.

## Learning is built into the fix, and the product has three layers: 22 Oct 2026

- **"Your turn" is now on by default.** After a fix that made the same change in two places, Companion offers to leave the second one for you, so you learn it by doing. It is only an offer on the receipt: ignore it if you like, and there is a switch in Settings. Our research says teaching offered as a separate lesson fails (17% understood) and teaching built into the work works (98%).
- **The structure is now written down (F23):** the hero for people who build with AI and get stuck; the guide for everyone, doing what HeyClicky does today where our privacy rules allow it, with basic agents from day one; and an AI helper for everyone who uses an LLM. The plan and the build order are in `docs/milestones/M14-guide-agents-and-second-look-plan.md`.
- **The new helper is "Second Look": press a key on any AI answer and it says what is solid, what to check, and what it cannot tell, with sources.** Planned, not built. It will be tested on 100 answers with seeded mistakes before anyone sees it.
- **A small test to find out whether people really learn** is written in `docs/launch/did-they-learn-test.md`.
- **That test is ready to run.** Each of the five practice projects now has a second project with the same kind of
  mistake in a different place, for people to fix on their own 20 minutes later. A check says whether they fixed it,
  and changing the test does not fool it. The observer gets a sheet with what to say, what not to say, and how to score
  "why was it broken?".

## "The company pays" is built, and switched off: 22 Oct 2026

- **You asked for the HeyClicky way: people sign up and use it, with no key of their own, and Companion pays Anthropic.** The core of that server is built and tested (46 tests): sign in tokens, Free, Pro and Max plans with daily and monthly limits, forwarding with Companion's key, counting what each reply cost (also when a reply is cut short), and Stripe subscription events.
- **It is off, and not deployed.** Anthropic's rules for products built on Claude Code forbid it unless they say yes in writing, so it is kept behind a switch, like the plan sign in route. The question to send them is drafted. If they say no, only the weeks of build are lost, and the own key route stays.
- **The server never keeps what people write or what Claude answers.** Tests check that no prompt, reply, token or key ever appears in a log, a record or an error.
- Not built yet: the real database, the deployment, Stripe and sign up, the app's own sign up screen, and the rewritten privacy policy.

## Settings files: no longer read, and attacked 131 ways: 22 Oct 2026

- **A task can no longer read your private settings file** (`.env` and its family), however it asks. It still sees which settings a project needs from the shared example file. Changing one still asks first, and a line can be renamed in place without ever being read.
- **We attacked the guard with 131 disguised commands, offline, and closed every gap.** The worst was older than the guard: a command hidden inside `sh -c "..."` had its file writes skipped by the safety check. That is fixed for every file, not just settings files.
- **The "why" lines after a task are also kept short:** one more rewrite if a line is too long or runs on.
- **A short script for your first hour with the real app** is in `docs/launch/mac-session-script.md`.

## Your private settings file now asks before it is changed: 22 Oct 2026

- **A real task found a gap: Companion could change your `.env` file without asking.** Now every change to a private settings file (`.env`, `.env.local`, `.env.production` and the like) asks first. The card names the setting (`SITE_NAME`) and **never shows its value**. The example files people share (`.env.example`) are not affected.
- **A key, token or password is never written for you.** If a task tries, it is refused and told to say which line you should add yourself.
- **It fixed the three projects that had been handed back**, each after at most one card, on real Claude (23 of 24 now).
- One thing is still your call: a normal task can still read that file (planning and research cannot). Closing that stops it from seeing existing values, so it is not changed yet.

## Plainer "why" lines, and the Fix it path tried on 25 projects: 22 Oct 2026

- **The two "why" lines after a task are now checked for plain words, and rewritten once if they are not.** On our 24 real changes the lines passed 92% of the time (they were 17% two days ago), and 100% were true to the change with a fair check question.
- **The app's own "Fix it with me" path was tried on all 25 broken projects with real Claude:** 20 fixed, none made worse, none invented, the problem found in the right place every time. It handed three back on purpose: one needs an email only you know, two need a line in your private settings file, which Companion never opens. About 12 cents a fix.
- **Saving your work in git works:** in a project that already has git, Companion asks before each step, and after your yes the save really happens. Checked on real Claude.

## The first real run against real Claude: 21 Oct 2026

- **For the first time, Companion's checks ran on a real key, for about $4 in all.** The smoke test passed 13 of 13. The 21 end to end checks passed 20 (one open, below). Of 25 broken practice projects, **23 were fixed, none were made worse, and the problem was found in the right place every time (24 of 24)**, for about 4 cents a fix. One more correctly stopped and asked, because only the person could supply the missing setting.
- **Pointing at the right button:** 100% on simple screens, 95% on busy dashboards, 93% on everyday app windows (128 tries, under 3 seconds typically).
- **The second model review caught every risky change (5 of 5) and raised no false alarms (0 of 5).** The loop card appeared at the right time 5 of 5 and, where only the person can decide, it asked instead of guessing.
- **Found by the run and fixed:** Rescue invented extra steps ("add your photos", "optional styling"); it now plans only what is broken. The "why" lines after a task used programming words 79% of the time; Explain now passes our check 79% of the time (it was 17%), and "Claude for quick answers" now defaults to Sonnet 5.5 for about a cent a day more. Settings now shows the three model choices.
- **Fixed after the run:** when you said yes to "make this folder a git project", nothing happened, because the Mac's safety box refuses to create that folder. Now that one command (and only that one) runs outside the box, after your yes. Every other git change stays inside the box. Checked on real Claude.

## Text from the card page that becomes a file name or a path, tried hostile: 15 Oct 2026

- Share card titles (about 320 including random junk, `../`, slashes, null bytes, right to left tricks, 5,000 characters), the file named in a problem (`../`, links that lead out of the project, absolute paths, `~`), and the project folder check (the whole disk, your home folder, Library, system folders, Companion's own folder, a link into Library, a file instead of a folder) were all attacked. Nothing got through: the checks were already sound, and are now locked in by tests. One compiler warning from the recent label change was also cleaned up.

## "Open from a link" tried with 60 hostile links: 15 Oct 2026

- Links with a password in them, a look-alike host (`github.com.evil.example`, a Cyrillic i), a port, a query, extra path, `ext::` or `file://` tricks, an option disguised as a link (`--upload-pack=...`), shell characters, newlines, percent codes, and over long names are all refused; only a plain https repository address on GitHub, GitLab or Bitbucket gets through, and the address handed to git is rebuilt from its checked parts. One oddity closed: a repository named `.git` (or any name starting with a dot) would have made a hidden folder, and is now refused.

## "Do it for me" can no longer be fooled by how a button is spelled: 14 Oct 2026

- **Do it for me never presses a button that sends, pays, deletes, publishes or signs out.** That check only knew English words, so it missed: lookalike letters from another alphabet ("Dеlete" with a Russian е), a hidden zero width character, extra spaces ("D e l e t e"), digits and signs standing in for letters ("D3lete", "P@y", "Pub1ish"), accents, and the same words in Spanish, French, German, Portuguese, Italian, Japanese, Chinese and Korean. Labels are now cleaned of those tricks before they are compared, and a bare "OK" or "Yes" is refused in any spelling or language. About 100 disguised labels are tested, plus ordinary ones that must stay pressable (Settings, Save changes, Environment variables, Privacy & Security, Screen Recording, and the word for Settings in French, German, Spanish, Japanese and Chinese).
- Strict wins: a few harmless labels are now refused too (Deployments, the Italian word for Settings contains "post"); for those you click yourself.

## Attacks on the safety rules, and four holes closed: 14 Oct 2026

- **150 disguised commands were thrown at the rules that decide what a task may run** (quotes inside the command name, a backslash, a full path, `env`/`nice`/`command` wrappers, `sh -c`, `eval`, `$(...)`, chained commands, `cd` out first, `~` and `$HOME`, encoded scripts piped to a shell). All the destructive ones, and every attempt to write outside the project, were already stopped. Ordinary building commands (tests, builds, installs inside the project, git status/diff/log) are confirmed not blocked.
- **Found and closed:** (1) a command could take a **screenshot of your screen** (`screencapture`), which broke the "only on your key press" rule: now refused outright. (2) A command could search your whole Mac (`mdfind`), schedule jobs for later (`crontab`, `at`), erase disks (`mkfs`) or back up and restore (`tmutil`): now refused. (3) Stopping programs (`kill`, `killall`, `pkill`) and the clipboard or sounds (`pbcopy`, `afplay`) now ask first. (4) The file tools treated `~/.aws/credentials` as a name inside the project; `~` and `$HOME` now count as the home folder, so reading or writing there asks or is refused.
- **Web look ups:** secrets can no longer ride out in the path of a web address (an unusually long address, or a long code-like piece of one, asks first); normal documentation links are unaffected.
- A second layer was already in place and still is: the Mac's own sandbox refuses reading your keys and shell history, writing outside the project, and all network except package registries.

## Launch review, round three: the Mac program: 15 Oct 2026

- **The overlay (the ring, the sketch, the confetti) probably could not receive its orders.** Tauri only lets a window listen for events if a permission file names it, and the overlay was not named; every test passed because the page code never runs in a test. It now has its own permission file that allows listening and nothing else, and a test checks that every window the app creates is named in one.
- **Updates signed by the script would have been refused** (the version must be signed into the signature). Fixed, with a check in the script, and the error now says what really happened.
- **Stop everything is more total.** A look at the screen that was already under way no longer sends its picture after Stop; a Prompt help read in progress is dropped (and its text is never sent); the system-wide Esc and Accept keys Prompt help borrows are given back when you Stop or close the card (Esc used to stay captured in every app for up to 90 seconds); the speech model loads on a helper so a Stop is never queued behind it; the engine is ended together with what it started; and an update now shuts the engine down properly before restarting.
- **Hold to talk with the dock hidden** (a full screen app in front, or hidden from the menu bar) recorded with no light anyone could see. It now refuses and says why.
- **Every command that works on a project is held to the folder you chose**, not only a few. And a folder can only be switched to from your list or the folder chooser.
- **Delete everything** no longer removes the whole `Application Support/Companion` folder (another product with the same name would lose its data); only Companion's own `browsers` folder goes. And a saved key that could not be removed is no longer reported as deleted: a note tells you how to remove it.
- **Prompt help no longer leaves Chrome's "enhanced interface" switched on** (it turns off window animations and confuses window snapping tools until Chrome restarts). What reading switched on in another app is switched off again when you are done with the text.
- Smaller: your turn reads the pointer without calling the main-thread-only part of the Mac's screen list sixty times a second; the 148 MB speech model's checksum is remembered instead of re-read at every press; the speech download uses the system's own `curl`; the update key is handed to Keychain on standard input, not on a command line.
- **Known and not fixed yet:** the saved Claude key can be read by any program the person runs (including a project's own install scripts) through the `security` command, because it was saved without limiting which programs may read it. See the launch verdict for the options.

## Launch review, round two: secrets, safety and "proven": 15 Oct 2026

- **Plan, Rescue and Research skipped the safety rules.** They could read any file on your Mac, settings and key files in your project, and Research could fetch a web address carrying a secret. They now use the same rules as a normal task, with every "ask" turned into "no" (there is nobody to ask): outside the project, settings and key files, and web addresses that carry data are all refused.
- **Reading other people's files through the shell** (`cat ~/Documents/...`, `grep -r password ~`, `ls /`, `sqlite3 ~/x.db`) now asks first, like the Read tool always did. Also closed: a file search that climbs out (`../../**/.env`), `git -c core.fsmonitor=...` and `git diff --output=...` (run a program or write elsewhere), `reflog expire`, `awk` programs that run commands or write files, `tar` and `zip` writing an archive outside the project, `curl`/`wget` carrying data in the address, and lookups that carry data in a host name (`ping`, `dig`, `nslookup`).
- **Settings with a telling name were not covered:** `DB_PASSWORD=...`, `STRIPE_WEBHOOK_SECRET=...`, `SUPABASE_SERVICE_ROLE_KEY=...`, `AUTH_TOKEN=...` and JSON `{"password":"..."}` went straight through. They are covered now (while ordinary text like "monkey=banana" is left alone). And what a failing test printed is covered before it reaches the card, the log or the next question to the model; an install failure too.
- **Stop everything now reaches a preview deploy that is running** (the checks before it used the same internal name and hid it), a Explain that is writing, and a second Plan/Rescue/Research started on the same helper is refused instead of orphaning the first.
- **"Proven" means proven.** A task whose browser check could not run was recorded as passed. It is now "partly checked" on the receipt and in the log. And installing packages alone no longer counts as evidence (a project with nothing to run is "nothing to check").
- Rescue, Point at the problem and Ship checks no longer run their tests or build while a task is still writing to the project.

## A launch review found real problems; the data-loss ones are fixed first: 15 Oct 2026

Three independent reviewers read the engine, the Mac program and the pages. They agreed it was **not launch ready as it stood**. The worst findings were about losing work, so those came first:
- **Undo could destroy a file it could not save.** A file that grew past 2 MiB (a dataset, a database export) cannot be kept in the safe copy; Undo then wrote the older small version over it, and undoing the undo could not bring it back. Now: where the safe copy only holds a stale small copy, the live file is left exactly as it is; where Undo really does put an older version back over a big file, the big one is copied aside first (to the safe-copy folder, up to 2 GB) and reported; with no room, it is left alone. Big files created after the undo point are never deleted. Tested with the reviewer's exact case.
- **Undo while a task is running** fought with the task. Undo is now refused (in plain words) while anything is working in the project.
- **The card said "Undone" without being told.** The engine now answers with what happened (which undo point, what was copied aside, what was left alone); the card change comes next.
- **A folder that is not a project** (your whole home folder, "/", a system folder) is refused with a plain sentence, as is a folder with more than 150,000 files, instead of hanging while it tries to copy everything. Each git step has a 5 minute limit.
- **A new Mac without Apple's developer tools** got a raw git error on the first task. It now says: open Terminal and run `xcode-select --install`.
- **Line endings:** a project that asks git to change line endings no longer changes the bytes Undo gives back (a Windows-style file now comes back byte for byte).
- **Two projects could overwrite each other's receipt picture** (checkpoint numbers repeat). The project is now part of the name.
- **One background error could stop the whole engine** (and with it Stop and every task). A stray failure after an answer was handed back is now swallowed, and a last-resort handler keeps the engine running and says so.

## Garbage in, no crash, in the Mac program too: 14 Oct 2026

- The same junk test now runs on the Mac side (the card page's JSON, text read from a screenshot, log text, text matching, the spoken line). **It found a real gap in secret covering:** a key run into the letters before it ("tokensk-ant-...", which text read from a picture can produce) was missed, both when blacking out a screenshot before it is sent and when scrubbing a support log. Anthropic, GitHub, Slack, Stripe and webhook key prefixes are now caught anywhere in a word, and ordinary words that merely contain the letters ("task-management-service") are left readable.

## Garbage in, no crash: 14 Oct 2026

- A new test feeds random junk (and deliberately huge or slow-looking input) to everything that reads text Companion does not control: a tool's output, the model's answers, lesson files, protocol lines, and the secret-covering code. None may crash or hang. It is seeded, so a failure can be repeated.
- **It found a real bug.** A message whose type was a name every object has ("constructor", "toString") made the protocol reader throw instead of refusing it. The app already blocked those names from pages, so nothing could reach it, but the reader should not fall over, and one bad line must never stop the engine: both are fixed, with a test.

## A free check that the hero finds the real failing line: 14 Oct 2026

- **Fifteen small broken projects**, each broken in a way beginners meet (a missing bracket, an undefined name, a missing file, reading a property of nothing, bad settings JSON, a missing setting, a wrong export name, a failing test, a rejected promise, a Python typo, and four TypeScript mistakes: wrong type, missing property, unknown import, wrong number of arguments; plus a Bun runtime error). For each, the project's own check is run for real and Companion's locator must turn the real output into the exact file and line. It runs in seconds with no model, and is now part of the main suite (`evals/rescue-projects`). All fifteen pass.
- **It found a real bug:** when a test failed with Node's default assertion message, Companion pointed at the right line but showed the person `error: |-` instead of what was wrong. It now says, for example, "Expected values to be strictly equal. Got 110.00000000000001, expected 120."

## Two more draft lessons, and an up to date install note: 14 Oct 2026

- **Install Cursor and open your project** (from Cursor's own help article) and **Make a place for your project on GitHub** (from GitHub's quickstart). Drafts, like the rest, and untried by a person. The earlier note that there was no Cursor lesson is now out of date.
- The friends install note (`docs/alpha/INSTALL.md`) now lists every key, what each button on the card does, and the drafts caveat; before, it said there was no updater and did not mention lessons, drawing, spoken replies or the beta numbers.

## Pointing through Computer Use, built but off: 14 Oct 2026

- **The one technique worth taking from Clicky's open source code.** It asks Anthropic's Computer Use tool where to click, declaring the picture's own size, instead of a free form coordinate. Built as an optional lane (`runner/src/aim.ts`), written fresh, with the idea credited in `THIRD_PARTY_NOTICES.md`.
- **Off, on purpose.** It works only on the API key route, only when `COMPANION_AIM=computer_use` is set, and any failure falls back to the current lane. Nothing makes a real call until you run the aim eval with it on (`COMPANION_ROUTE=api_key COMPANION_AIM=computer_use bun run scripts/eval-aim.ts`, a few cents). It becomes the default only if it clearly beats the current lane. Not yet measured, and not yet tried against the live API (the tool version and model pairing may need a change; the fallback covers that).
- The picture goes straight from memory to Anthropic with your own key; nothing is written to disk, and the key is never in an error message.
- Its confidence is worked out by us (higher when on screen text sits right at the point), not reported by the model, and the targeting rule still applies: a guess gets a soft ring, and low confidence draws nothing.

## Point at the problem works across several monitors: 14 Oct 2026

- Idea taken from reading Clicky's open source code (it lets its model point at another screen). Before, pressing the key looked only at the display your mouse was on, so a failing line in an editor on your second monitor was never found. Now, if the line is not on that display, Companion looks at your other displays one after another (up to four), all under the same light, and points on the one where it finds the line. Nothing is saved or sent; a hit on the first display never looks at the others. Tested with a fake two display Mac; **not yet tried on real monitors**.

## Three more lessons, and lessons that need no folder: 14 Oct 2026

- **New drafts:** install Claude Code and start your first session (from the official quickstart), get your Bolt project onto your Mac, and get your Replit project onto your Mac (from Replit's help page). They are marked draft like the others; none has been tried by a person. Bolt's export button is described differently by different guides, so that lesson says to look in both places. No Cursor lesson: the Cursor docs gave no usable steps and I did not want to guess.
- **Lessons no longer need a project folder to start**, when they do not read one. Before, a person with no folder (exactly who needs "install Claude Code" or "get my project out of Bolt") could not start any lesson, and the permission lessons in Settings were greyed out. Lessons that check files or settings in a project still need the chosen folder and say so.

## The lesson's progress list is visible: 14 Oct 2026

- A lesson card now has a **What we have done** list you can open: each finished step, and whether it was proven or you did it yourself. It was already kept so a lesson could pick up where it left off; now you can see it too (F17 section 4.4, and the same idea as HeyClicky's progress log). A step that came undone while you were away leaves the list.

## A careful read of the whole code: 14 Oct 2026

Checked the code against the rules in `AGENTS.md` and the source file, one pattern at a time. Found and fixed:
- **The character's endless motions ignored "reduce motion".** Only the one off reactions respected it. All of them now stop when your Mac asks for less motion, with a test.
- **The runner's type check was never part of the suite**, and it had 5 real errors (a memory field the code used but the type did not know, an error code read the wrong way, and two test type mistakes). All fixed, and `scripts/test-all.sh` now runs it every time.
- **Dead code removed:** a leftover spike probe that could read other apps' window titles is gone from the shipped program (its findings stay in the spike notes), plus unused helpers and the compiler's 18 warnings. The Rust shell now builds with none.
- **Nothing found** in: network calls (only the speech model download with a checksum, the updater, and the local proof page on this Mac), key event APIs, focus stealing, git use (only the private snapshot folder), `bypassPermissions`, secrets in the repo, and the no em dash writing rule.
- Added `docs/rename.md`: every place the product name lives, and which ones must not be changed by search and replace.

## Speak to me (spoken replies), off by default: 14 Oct 2026

- **Settings > Speak to me.** When you turn it on, Companion says short lines out loud with your Mac's own built in voice: the lesson step you are on, what a ring points at (a guess says "I think it is here"), and plain words when it is not sure or something needs your attention. Nothing is sent anywhere, there is no voice service, and a new install is silent.
- **Safe by rules, with tests:** only from the card; markup and web addresses are not read out ("a link"); anything that looks like a key, card or token is never said; long text is cut at a sentence; the same line is not said twice in a row; holding the talk keys, closing the card, or Stop everything silences it at once.
- **Not heard by a person yet.** The tests never make a sound; the voice itself, its speed and whether it sounds good are for the hands on session.

## Show me now follows the targeting rule exactly: 14 Oct 2026

Checked against F17 section 4.2 and found two places where Show me was bolder than the rule:
- **A guess is no longer drawn.** The model says how sure it is with every answer, and the app ignored that. Now, below 40 percent sure, nothing is drawn: Companion says in words what to look for ("I am not sure where that is, so I will not point at the wrong thing. Look for ...").
- **A solid ring now needs the app's own structure.** Before, text matched in the picture got a solid ring. Now that is a guess: it gets the soft dashed "around here" ring, unless a real button or link (as the Mac reports it) surrounds that text. Pointing at the failing line from your project, and clicks on real buttons the Mac reports, keep the solid ring.
- Expect more soft rings than before in apps whose buttons the Mac cannot see (some web apps in some browsers). That is the rule working, not a fault. Not yet measured on real screens: how often each kind appears.

## A lesson's saved place no longer holds your folder path: 14 Oct 2026

- Where you are in a guided lesson is saved as step names, outcomes and times, plus a short fingerprint of the project instead of its folder path. A new end to end test runs a lesson through the real engine process (listing, a click, a proof from the project, Stop everything, picking up again, beta numbers off until turned on) and is what found that the path had been written down.

## Updates: 14 Oct 2026

- **Settings > Updates.** Companion can check for a newer version and install it, so friends get fixes without reinstalling. It asks one web address for the newest version (a plain request; that address sees your internet address like any website), checks the download against Companion's own update key, and installs **only when you press Install**, and never while something is running. A once a day check (on by default, with a switch) only looks; it shows a note when a new version is ready.
- **Not live yet.** The update key and the public address are yours to set up (`docs/releasing.md`): until then the app says "Updates are not set up in this build yet" and checks nothing. The key is made on your Mac and kept in your Keychain; I never see it. Because the source repo is private, update files go in a separate public repo that holds only release files.
- Tried: the signing tool with a throwaway key, and all the words and rules by tests. **Not tried:** a real update from a real address (needs the key and the public repo).

## Do it for me on the lesson card: 14 Oct 2026

- While a lesson step's ring is waiting for your click, the lesson card now has **Do it for me** too (before, only the pointing card had it). It still never presses anything that sends, pays, deletes or publishes, or anything inside a dialog; for those it tells you to click yourself.

## Four more lessons, as drafts: 14 Oct 2026

- **Vercel:** add a setting to your project (and redeploy so it takes effect), and find out why a deploy failed (open the build log, find the real cause). **Lovable:** connect your project to GitHub (so Companion can open it from a link), and publish your project.
- **Every lesson now says if it was tried.** These four, and the three permission lessons, are marked **Draft: written from the maker's own help pages, not tried by a person yet**, and the Lessons list says so. I wrote them from the current Vercel and Lovable help pages, and corrected two steps I had first written from memory. Product screens change often, so they stay drafts until a person has walked each one on a real screen.
- Supabase lessons are not included (after the beta, as decided).

## "Walk me through it" for permissions: 12 Oct 2026

- In Settings, each permission that is not allowed yet now has a **Walk me through it** button next to Open System Settings. It starts the matching guided lesson (Screen Recording, Accessibility or Microphone). For Screen Recording the lesson is words only until the permission is given, because pointing needs it.

## Anywhere mode asks "did that work?": 12 Oct 2026

- **Show me, step by step, in any app.** After you click the ring, Companion asks "Did that work?" before the next step. Yes goes on. No writes that step down as not working and asks for another way, so the same step is never suggested again. It stops at 15 steps and hands back in words. A guess still gets the soft "around here" ring, and rings stay inside their window.
- Not tried by a person yet in a real third party app.

## Beta numbers, off by default: 12 Oct 2026

- **Settings > Beta numbers.** Off until you turn it on. When on, Companion counts how often things happen: sessions, key presses for a problem, lessons started and finished, lesson steps that needed another way, checks that passed or failed, pointing in other apps compared with builder tools, and guesses you corrected. Counts per day, kept only on this Mac (about four months), **never** any words, names, files, paths or anything from your screen. Companion sends nothing: you can read the numbers, copy them to send to the person running the beta, and erase them. "Delete everything" removes them too.
- These are the numbers the beta plan asks for (lesson completion, step success, the soft ring corrections, anywhere compared with builder use, proof pass rate). Retention and the "very disappointed" score come from the founder's own follow ups, not from the app.

## Guided lessons: 12 Oct 2026

- **A Lessons button.** A lesson is a plain data file (up to 15 steps), not code: for each step, what to say, what to look for on the screen, and how to prove it worked. The first three ship with the app and cover Companion's own permissions: Screen Recording, Accessibility and the Microphone, each told only when you use the feature that needs it. New lessons can be added as files, with no new release.
- **One ring per step.** Companion looks at your screen once for each step, with the light on first, points at the place, and waits for your own click (or "Do it for me" where that is safe). Only the mouse position and whether a button is down are read; never keys.
- **It checks, and it does not nag.** After a step the project itself is checked when it can be (a setting name exists, a file exists or contains something; setting values and key files are never read). When only you can tell, it asks "Did that work?". A step that did not work is never shown again as the same ring: you get the lesson's other way if it has one, then plain words and an "I did it myself" button.
- **Pauses are fine.** Your place is saved after every move (step names and outcomes only, never anything from your screen). Come back later and it checks again: steps you finished while away are skipped, and a finished step that came undone is shown again. Start over any time.
- **A ring stays in its window.** A ring is drawn only inside the window it was confirmed in. If that window moves, closes, is covered, or you switch to another app, the ring goes away and says why. This applies to every ring, not just lessons.
- Stop everything ends every lesson. **Not tried by a person yet:** a full lesson on a real Mac with real System Settings.

## Draw it for me: 12 Oct 2026

- **"Why? Draw it"** on the What's wrong card, and **Draw it** next to Show me in the ask box (type or speak the question, or leave it as "Why did this break?"). Companion draws a small hand drawn sketch on your screen: the parts of your project that matter as boxes, arrows for each hand over, the one place that goes wrong ringed in red with a "!" and its reason in one plain sentence, and a line of caption underneath. Strokes draw themselves on (all at once if your Mac is set to reduce motion) and the sketch fades by itself after about fifteen seconds. Stop everything, Close, or pointing at something else removes it at once.
- **Built only from your project**, never your screen: the failing line and the code around it, what the project is built with, and a short list of what the project serves and what its pages ask for (so a mismatch between a page and its server can be seen). Nothing is captured for this.
- **Real checks** (test login, a few cents): on the signup project, the sketch named the real cause every time (the page asks for /api/signup, the server only has /api/register), 3 of 3, about 4.5 seconds each. Before this, the same request returned no diagram at all, because of the fast lane fault fixed earlier today.
- Checks on the model's answer before anything is drawn: at most six boxes and eight arrows, short plain words, secrets covered, the broken place always named and real. The shapes are deterministic maths (the same every time), tested to stay within a few pixels of the true shape.
- **Not tried by a person yet:** how the sketch looks on a real screen next to a real app. The "draw or circle it yourself to ask" half was cut for the friends preview.

## A practice run at the end of the first run: 12 Oct 2026

- **Try the practice project.** The first run now ends with a small signup page that ships inside Companion and has one thing wrong on purpose (the Join button sends to an address the server does not have). It is copied into a new folder, Companion practice, in your home folder (never over anything), and Companion walks you through it: **Find what is wrong** (the same as pressing Control, Option, Command and F), which runs the project's own checks and points at the failing check; **Fix it with me**, a short fixed request on a 60 cent cap; and the proof, with the before and after picture and the celebration. So someone who is not stuck this week still sees the whole loop in the first minutes. You can skip it, and Settings has "Try the practice project again".
- **Real checks on Claude, on the test login:** 3 of 3 runs passed with the small model (about 7 cents each), and one with Sonnet, the app's own default, passed in 36 seconds for 17 cents (so the card says "around 20 cents"). Claude fixed either side of the mismatch (the page's address, or the server answering it too), and never touched the test.
- The same project is the set for the demo video.
- Along the way: Node's own test output (two places per failure: where the test starts and the check that failed) is now read so the pointer lands on the failing check, with the failure's own words.

## A plain privacy note for friends: 12 Oct 2026

- `docs/alpha/PRIVACY.md`: what Companion reads and when, feature by feature, and exactly where each thing goes (your Mac, Claude under your key, Vercel under your login). It makes no claim about how Anthropic or Vercel treat data, and does not say that only one provider sees your screen. Draft for the founder to review before it is sent.

## An installer a friend can use: 12 Oct 2026

- **Companion now carries its own engine.** Before this, the app found its engine only through the developer's settings file, so a copy on anyone else's Mac would not have started. The app now contains Bun, the runner and its packages, including Anthropic's own Claude binary, which is copied as is and never re-signed (its checksum is compared before and after signing).
- **`app/scripts/build-app.sh`** stages the engine, builds, signs and verifies; **`make-dmg.sh`** makes `Companion-0.1.0.dmg` (155 MB) with a shortcut to Applications; **`release.sh`** is the whole notarized release for when Apple approves the developer account (written, not run). A short install note for friends is in `docs/alpha/INSTALL.md`.
- **Checked for real:** the disk image verifies, an app copied out of it still verifies and carries the identical Claude binary, and run from a copy in an empty home folder it started its own engine and logged it. Two real Claude checks (Explain, and the before and after receipt picture) passed through that installed engine.
- On a Mac with no developer settings, Companion no longer invents a default project folder: you choose one.
- The app now says it needs macOS 14 (screen capture). **Only tried on macOS 27, on Apple Silicon.** Not notarized yet, so the first open needs "Open Anyway" in System Settings, which the install note explains.

## A log you can send when something goes wrong: 12 Oct 2026

- **Save a log for support** in Settings writes one text file to your Downloads folder and shows it in Finder. It holds Companion's version and your Mac's, which permissions are allowed, what Companion keeps (sizes only), Companion's own activity log with times (what happened, never what was typed, said or on screen) and the newest crash report from the last two weeks if there is one.
- **The activity log is an allowlist**: only Companion's own known events and fields go in (the app starting, the engine starting or failing, your own hotkeys); anything else, including the detailed developer logging that names the apps you use, is dropped. The crash report loses its list of other software on your Mac. Everything is then scrubbed: your home folder (only the first folder under it is kept), user name and computer's names, every project folder and its name ("project 1", "project 2"), identifiers, anything that looks like a key or token even inside a link or a path, and email addresses. It never replaces a file that is already there, and nothing is sent anywhere: you choose whether to share it.
- Checked against this Mac's real 237 KB activity log: 68 lines kept, no folder, name or key survived. No crash report existed to try; the crash part is tested with made up reports. A second review found 9 problems (verbose logs, identifiers in crash reports, keys inside links, case and boundaries in paths, reading and cutting crash reports safely) and all are fixed with tests. Names with accents written in a different Unicode form from the one stored are not matched by path (the project's folder name alone is also covered).

## Settings, and delete everything: 12 Oct 2026

- **A Settings button** on the card with three parts: what Companion may do on this Mac (Screen Recording, Accessibility, Microphone: allowed, not allowed or not asked yet, what each is for, and a button that opens the right page of System Settings; Companion still asks for each one only the first time you use the feature that needs it); your choices in one place (reactions, Explain, sending spoken words automatically); and what Companion keeps on this Mac, with sizes.
- **Delete everything.** One button, then a second "Yes, delete everything" after you have read what goes. It removes Companion's own task history, undo snapshots, receipt pictures, memory, the speech model, the hidden browser, settings and the activity log, and your saved Claude key from your Keychain (Companion's own item only, never your Claude login). You can also tick a box to remove Companion's own notes inside your projects: the .companion folder and Companion's marked block in AGENTS.md and CLAUDE.md, with every other line of those files left exactly as it was. Your projects' own files are never touched, your own house rules (rules.txt) are kept, and links are never followed. You are asked twice: on the page, and by macOS itself (a question no web page can answer for you, with Cancel as the default). The work is done by a helper after Companion has quit, so nothing is holding or rewriting the files; the helper then opens Companion again as if it were new. If something could not be removed, the key is kept and Companion tells you on the next start.
- Tested with temporary folders (grouping, sizes, nothing outside Companion's own places removable, links, a link planted at a temporary name, Windows line endings, several blocks, file permissions kept, the helper's order and failure path), a throwaway Keychain item, and the real helper run against a fake home with its own Keychain (everything deleted, developer settings kept, the key deleted). **Not tried by a person yet:** the button in the built app, including the macOS question and the reopening; it deletes real data, so it is in the hands on session, not mine.

## Explain now explains the work: 12 Oct 2026

- **Fixed:** the small model Explain uses was told to "improve the prompt", so one explanation in four was about your prompt ("the original prompt was vague") instead of why the work was done. Explain now sends its own request as is. Same four requests again: all four about the work, answers in 5 to 7 seconds instead of 11 to 37, because the model no longer thinks first and the answer is handed over the moment it is complete. Prompt help is unchanged.

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

## Launch review, round four (pages)
- Undo now asks first, with a plain warning, and says "Undone" only after the engine confirms it finished. A failed undo says so.
- Questions that ran out of time disappear from the card instead of sitting there dead.
- If a check could not run all the way, pressing the key no longer says everything passes.
- "Fixed after N tries" is no longer shown for a stopped task. Receipts say "partly checked" when some checks were skipped.
- Engine messages written for people are shown as they are; technical ones are wrapped in plain words.
- The card no longer grabs the keyboard while you are typing.

## Your key is now readable only by Companion
- Companion saves and reads your Claude key in the Mac's Keychain itself, so another program asking for it gets the Mac's own "allow?" question instead of the key.
- A key saved by an earlier version is moved the first time Companion starts. The Mac may ask once to allow that. If you say no, paste your key again.
- Not yet tried by hand on a real Mac (the move and the refusal of another program). Tests cover saving, reading, replacing, deleting and that the key never appears in anything the engine writes.

## M11 wave 1: fixes found by checking every feature against HeyClicky (16 Oct 2026)
- **Your key reaches Companion's engine again.** Yesterday's Keychain change had a bug: the key was saved safely but never handed to the engine, so Companion would have said "not connected". Fixed, with a test that runs the real handoff.
- **Private text is no longer saved by Claude Code.** Prompt help text read from other apps and off the record tasks used to end up in Claude Code's own conversation files in your home folder. Now those runs save nothing, and on the API key route ordinary task conversations live inside Companion's folder, so Delete everything removes them. (Conversations saved before this change are still in ~/.claude/projects; delete them there if you want them gone.)
- **The browser check works on a new Mac.** It needs a one time download (about 104 MB, about 200 MB on disk) from Playwright's servers. It starts only when you press the button, shows progress, and Stop everything ends it.
- **What Companion remembers about your project now reaches Claude.** Before, it was dropped on the way. A CLAUDE.md that points to AGENTS.md is now followed, but never to settings or key files.
- **Settings:** replace or remove your Claude key (removing asks first), see today's spending against a daily limit you can change (1 to 500 dollars), see every hotkey, and see whether the microphone was never asked, turned off or blocked.
- **Paste back puts your clipboard back** afterwards, and never touches a clipboard marked private (password managers).
- **Only one copy of Companion runs at a time.**
- **Safer approvals:** "yes for the rest of this task" covers only harmless asks; commands, installs and anything that cannot be undone still ask every time. Reading the output of a command the task started no longer needs a yes.
- Spending is counted correctly when a fix continues a conversation (it was counted twice), and token counts are real.
- One test run reached the internet by mistake while these were built: it downloaded the browser three times into temporary test folders, which were deleted. Nothing else was sent. The tests now cannot reach the network.

## M11 wave 2: fixes it with you, teaches from the real change, and more (17 Oct 2026)
None of this has been tried by a person on a real screen or with real Claude yet. Tests pass; the hands on session and the real runs come next.
- **Fixes it with you.** After a task, a box under the receipt lets you say what is still wrong ("the button is still grey"). It carries on from that task with a new undo point and a new check. **Try again** reruns a task that failed and tells Claude what failed.
- **Stops going in circles.** A single task that fails the same way three times now stops and asks, like a plan already did.
- **Plain progress lines** while it works, such as "Reading signup.js" or "Running the tests". Never the raw command.
- **Explains from the real change.** The two lines of "why" are now written from the actual lines that changed (secrets and settings files are never sent), for every step of a plan too, with one quick question to check you got it. Its cost now counts in the day's spending.
- **Show me what changed** rings the first changed line in your editor.
- **Your turn** (off by default, in Settings): when a fix made the same small change in two places, Companion can leave the second one to you, ring it, and check your change.
- **Python projects get real checks:** tests (pytest), code checks (ruff or flake8, mypy) and the page, using the project's own virtual environment. It never installs Python packages for you.
- **A failed Vercel deploy** is read through your own Vercel tool (read only, never a deploy) and the line that stopped it is ringed.
- **Lessons prove each step from your project** where they can (for example, the setting is now in .env.local), and pick up where you left off. A new lesson is made for exactly the settings your project needs. One more practice project (a missing setting) is in Settings; three more are in the test set.
- **On screen:** one answer can point at up to five places in order, Show me can look at every screen (off by default), and pointers can be drawn as hand drawn rings, arrows, underlines or boxes, always only on the window they belong to.
- **Hidden from screen sharing and quiet on calls**, both on by default. Companion checks only whether a call app is in front or the camera is on, never what is in it.
- **Which task broke it?** When a check fails, Companion checks earlier saved versions in a private copy (never your folder) to find the task after which it started failing, and can undo just that task. Not for Python projects yet.
- **Error explainer:** select an error in any app and press Control, Option, Command and E. It explains it in two plain sentences, shows where it is in your project, and offers Fix it (run off the record).

## M11 wave 3: ready for real Claude, home in the notch, the companion from anywhere (17 Oct 2026)
None of this has been seen on a real screen or run with real Claude yet.
- **Home lives in the notch.** A quiet island at the top center of the screen (a small pill on screens without a notch) shows what Companion is doing when you hover, and opens Home below it with five tabs: Now, What I did, Learn, Memory, Settings. Hidden in full screen apps and from screen sharing.
- **The companion comes from anywhere.** Drag it to any edge or corner. When it has something about a window, it comes beside that window (never over it) and goes home afterwards. You can turn this off in Settings ("Come to what it is about").
- **Hold to talk is Option and Space.** If another app already uses those keys, Settings offers other two key choices that are free on your Mac.
- **Ready for your Claude key.** Every request Companion makes now has the shape the newest Claude models accept (some older shapes would have failed on Sonnet 5.5 and Opus 5.5, including every Show me how on the default settings). Pointing with Computer Use uses the newest tool version.
- **Safe paid tests.** All test runs with your key go through one harness: your key is read from the Keychain in code and never shown, each case and the whole run have a spending stop, and nothing spends unless asked. The test sets are ready: 25 fix cases, 5 "going in circles" cases, 10 risky changes for the second check, Explain scoring, and harder pointing tests.

## M11 wave 4: make it yours, and usable by everyone (18 Oct 2026)
None of this has been seen on a real screen yet.
- **Every hotkey can be changed** in Settings, Keys to remember. Only key combinations are allowed (Companion never reads what you type), keys another app holds are shown as taken, no two jobs share keys, Stop everything always keeps working, and Reset puts the usual keys back. Every hint names the keys you picked.
- **Voice:** pick the Mac voice and how fast it speaks, have short replies to voice questions read out (off by default), choose the microphone (Companion falls back to the Mac's default if yours disappears), and pick the language. Speech to text knows your project's own words (file and package names), worked out on your Mac.
- **Accessibility:** every control has a name for VoiceOver, everything works with the keyboard alone, new questions are announced without taking your keyboard, all motion follows the Mac's Reduce motion setting, colors meet contrast standards in light and dark, and there is a text size setting.
- **Small things that add up:** links open in your browser, a short "what changed" note after an update, Report a problem (it saves a cleaned log and opens a ready report; it sends nothing itself), a multi line ask box that keeps your draft, Copy on replies, drop or paste files into the ask box (secrets hidden, settings and key files refused), search in What I did, and a faster first reply at no cost.
- **Which task broke it** now works for Python projects too.
- Tests no longer fail just because the Mac is busy.

## M11: make it yours, everything in Settings (19 Oct 2026)
None of this has been seen on a real screen yet. Every setting starts at what Companion did before, and Reset puts it back.
- **One Settings page for everything,** with sections, a search box, and Reset for one setting, a section or everything. Things you add to protect yourself (house rules, apps Companion must never read) are never reset by accident.
- **Spending and how work runs:** budgets for a task, a plan, a Rescue and a Research question (always within your daily limit), how many failed checks before Companion stops and asks, how many steps a plan may have, whether Try again carries on or starts fresh, and how long a question waits for you (no answer always counts as no).
- **Checking your project:** house rules, what the check must see on the page, a button it should press and what must show after, which start script to use (only scripts that start the project, never one like deploy), checks to leave out (shown as "partly checked", never as passed; the page check always runs), how long checks may take, whether packages are installed automatically, after asking, or never, page size, a slow internet mode, and receipt pictures.
- **Memory and teaching:** Explain off, reasons only, or reasons and a question; what Companion learns from; how much it recalls; off the record by default; how long the "remembered" note stays; when to offer a recap.
- **Home, the island and the character:** whether the island shows and peeks on hover, how fast it opens and closes, which display it uses, whether Home closes when you click away, whether it jumps to what needs you, its size, and where the character lives and how long it stays beside a window.
- **Pointing, talking and other apps:** how long rings stay, their colour and lettering, guesses as a soft ring or words only, the pace of multi step answers, how long a sketch stays, the longest hold to talk, what else is said out loud, Prompt help's style and whether it pastes or copies, your answers per app, which editor opens, and which call apps count.
- The microphone now closes the moment Companion is hidden while you hold to talk.
- One test run reached the internet by mistake while these were built (a real package install and a clone attempt in a temporary folder; nothing of yours was touched). The test cannot run real commands any more.

## Matching HeyClicky's newest release, and the practice library (20 Oct 2026)
HeyClicky's newest release is still v1.0.53 (2 Oct 2026). These are the parts of it that fit Companion, plus the finished practice library. None of it has been seen on a real screen or run with real Claude yet.
- **Claude only gets the tools Companion uses.** No more "unknown tool" questions for tools it should never use.
- **When it truly needs you, it asks one clear question** and stops there, with the question on the card and the follow up box ready for your answer. A friendly "want me to do more?" never counts as a question.
- **A dropped internet connection is named** ("Companion could not reach Claude") with Try again, never blamed on your project or your key.
- **Follow up by voice:** point at a finished task and hold the talk keys to fill its follow up box (off by default). Saying "wait" or "stop" never starts a task.
- **Lessons and walkthroughs:** a lesson can start where you already are (off by default), walkthroughs wait for a slow page before looking again, and anywhere mode stops asking "Did that work?" after a clean click on a solid ring.
- **Steadier on the Mac:** no beachball after sleep or a headset change, hold to talk works with the lid closed, Home steps aside for the windows it opens, the island tells you when an update is ready, and Home opens with a short motion (none with Reduce motion).
- **The practice library is finished:** five practice stuck moments on the Learn tab, each in its own new folder, with progress, Start over, Try again and Remove my copy (to the Trash, after you confirm). The first run offers one in minute one. The fix runs exactly like it would on your own project, with Undo and Explain.

## Dependability audit (20 Oct 2026)
Eight independent readers went through everything built in M11 and found 83 distinct issues. The 55 serious ones were each checked by two skeptics; 49 were confirmed and fixed, each with a test that failed first. None of this has been tried on a real screen or with real Claude yet.
- **Spending is counted when you press Stop.** Before, the work done in a stopped round never reached the daily limit or the receipt.
- **Plans no longer hang** when you edit a file or press Undo while Companion waits for your answer, and a pause during "try a different approach" carries on instead of ending the plan.
- **"Done" is harder to fool:** a page whose server no longer starts is not called proven, the browser check's own guard no longer fails working pages, and checks the agent could edit no longer run without a tap.
- **Privacy:** with Companion hidden, nothing captures the screen without the visible light, and Stop everything ends speech to text before the Show me key can use it. The "free" setting practice no longer sends screen pictures to Claude.
- **After changing folders,** an old folder's receipt and Undo are gone, so Undo can never roll back the wrong project.
- **No more stuck "Needs you"** after cancelling a plan or closing Rescue's report, and first run practice can be fixed straight from Learn.
- Smaller fixes to web fetch checks, house rules with links, wording that was not true, and docs.

## Everyday use, and drop a file on the companion (21 Oct 2026)
None of this has been seen on a real screen or run with real Claude yet.
- **The stuck key works in any app, not only code projects.** With no project, or with an everyday app in front, it looks at your screen (only when you press the key, light first, nothing kept), names the problem in two plain sentences, and walks you through the fix. Spreadsheet errors such as #REF!, #VALUE! and #DIV/0! are explained from a built in table first. It only says "fixed" when a fresh look shows the error gone; otherwise it asks you. Turn it off in Settings if you only want project checks.
- **Show me how as a tutor for everyday apps** (Mail, Finder, System Settings, spreadsheets, documents, slides, design and photo apps): plain steps in that app's own words, never code talk. Off for now, until the paid pointing test shows it helps; one switch in Settings.
- **Short spoken steps,** paced with the rings, when you have speaking on (off by default).
- **Do it for me never presses sign in or connect account buttons,** on top of send, pay, delete, publish and answer.
- **Drop a file on the companion** (the character or the notch island) to convert it: pictures between PNG, JPEG, HEIC and TIFF, resize and compress; PDFs merge, split, compress and pages to pictures; documents to PDF, text, Word, RTF or HTML; sound and video convert and trim. Everything happens on your Mac with its own tools, nothing is uploaded, the result is saved next to the original with a new name, and the original is never changed.

## Groups, and a second dependability audit (21 Oct 2026)
None of this has been seen on a real screen or run with real Claude yet.
- **Tools are grouped by what they do on your Mac:** Flow (find, fix, prove, undo, explain), Guide (Show me how, lessons, practice), Voice (hold to talk, spoken answers, Prompt help, the error explainer) and Files (drop a file to convert it). The names are placeholders. Each group has a switch in Settings; a group that is off really stops its tools (keys, buttons, commands and anything it was running) and says so in one plain line. Stop everything, the daily limit, your key and the safety rules are never part of a group.
- **Home shows which tools you have not tried yet,** with a one line invitation that goes away once you try them. No scores, streaks or levels. A setting hides it. The first run explains the four groups.
- **The island names the group at work,** and the character has calm, clear and murky water states ready for the art.
- **Second audit of the newer code:** 25 more issues confirmed and fixed. Examples: a spreadsheet error is only called fixed when the same sheet is still in view; a wrong built-in explanation can no longer override Claude's own finding; the file converter now carries on past one bad file and cleans each file's work folder as it goes; plus the small leftovers from the first audit.

## Launch preparation (22 Oct 2026)
- **First-run words made true.** The welcome no longer says everything stays on your Mac (your questions, parts of your project and screen pictures go to Anthropic through your own key). The key step now says it costs money and that a chat subscription is not a key. The folder line no longer says it never looks anywhere else. "Plan sign-in comes later" now says it is not available yet.
- **Release checks:** a dry run of the release script that lists what each step needs from you, early checks for missing certificates, matching versions and an empty update key, a fix to the notarization check that always complained, and a founder runbook in docs/releasing.md.
- **A smaller, cleaner app:** no developer paths or source maps inside it.
- Drafts for a lawyer (privacy policy, terms, refunds, lawyer questions) and for the website, pricing, demo video and launch posts are in docs/launch. They are drafts: nothing is published.

## Watch, more formats, more project types, safer Undo (22 Oct 2026)
None of this has been seen on a real screen or run with real Claude yet.
- **Watch routines.** Add a check for a project and pick how often it runs: is my site answering, did the last deploy fail, is CI red, do my project's own checks still pass. They run only while Companion is open, are read only, and cost nothing (no Claude). You get one alert when something starts failing and one when it recovers; a failing watch offers Fix it, which starts only when you press it. Quiet hours are a setting.
- **Read only builder connections.** Vercel and GitHub are read through your own `vercel` and `gh` tools, so Companion never stores your tokens, and anything that could change something is refused in code. Rescue and Fix it use the evidence.
- **Where was I.** Opening Companion after time away tells you what you were doing, what is unfinished and what changed, with one suggested next step that starts only when you press it.
- **More file conversions,** all with the Mac's own tools: more picture formats and edits (including removing place, camera and author details), several pictures into one PDF, PDF page and text actions, old Word and OpenDocument in both directions, more audio formats, video presets, a still frame, and zip and unzip with guards against unsafe paths and zip bombs. What the Mac cannot do without ffmpeg (MP3, WebP, WebM, MKV and similar) is listed for the lawyer.
- **More project types in the checks:** Go, Rust, Java and Kotlin, Swift and Xcode projects get real checks and the failing line is found. Companion never installs tools for you, builds offline first and asks before anything downloads, and Xcode only builds for the Mac (never signs, archives or installs).
- **Undo never overwrites your own edits.** If you changed a file yourself since a step, Undo leaves it alone, says which files, and offers "Put those back too" as a separate confirmed action; your version is always kept in a safety copy. A setting controls it (on by default; never off for plans you paused and resumed).
- **Groups:** the new tools belong to the Flow group and obey its switch.
