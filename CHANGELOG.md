# Changelog

What changed, in plain words. Newest first. Written so it can be posted while building in public.

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
