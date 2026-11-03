> **DRAFT. Not legal advice. For a lawyer to review before it is published.**
> Written 20 Oct 2026 from what the code and docs do today (build 0.1.0 and the notes in `docs/alpha/PRIVACY.md`). Items marked **[unproven]** are claims the code or the tests do not prove yet. Items in [square brackets] are placeholders. Remove this box only after a lawyer has signed off.

# Privacy Policy for [Product name] (working name: Companion)

Last updated: [date]

[Company name] ("we", "us") makes [Product name], a Mac app that helps people who build with AI. This page says what the app does with your information. It is written in plain words on purpose.

## 1. The short version

- The app has **no account and no server of ours that receives your content**. We do not see your key, your projects, your screen or your voice.
- You bring **your own Claude key**. When the app asks Claude something, the request goes **from your Mac straight to Anthropic**, under your key and your account. We are not in the middle.
- The app looks at your screen or listens to your microphone **only when you press its key**, and a light comes on first. It does not watch in the background.
- Everything the app remembers stays **on your Mac**. **Settings, Delete everything** removes it.
- We have **no analytics**. The only counts the app keeps are the optional "Beta numbers", off until you turn them on, kept on your Mac and never sent by the app.

## 2. Who is responsible

[Company name], [address]. Contact: [privacy email]. [If the law where you live requires it: our representative in the EU or UK is [name and address].]

Because the app runs on your Mac and sends your content to Anthropic under your own account, [Company name] does not receive or hold that content. For what Anthropic does with it, Anthropic is responsible. See section 4.

## 3. What stays on your Mac

The app keeps these in its own folders on your Mac (mainly `~/Library/Application Support/dev.companion.app/` and `~/Library/Application Support/Companion/`):

| What | Why |
|---|---|
| Task history and spending record | So you can see what was done and what it cost |
| Undo snapshots of your projects | So you can undo a change. They are private copies in the app's folder. Your own git is never touched |
| Receipt pictures (before and after pictures of **your app**, never your screen) | Proof that a change worked |
| Memory notes and a small profile | So the app remembers your project and how you like to work. You can read, edit and forget every line in "What I know" |
| Where you are in each lesson, and which practice projects you tried | So lessons can continue |
| The speech model and the hidden browser (after you download them) | Hold to talk, and the browser check |
| Settings, recent folders, and a small activity log | The log lists what happened (for example "the app started"), never what you typed, said or had on screen |
| Words you typed in the ask box but have not sent | So they are still there when the app reopens. Not kept when they look like a key or password, and not kept for "off the record" tasks |
| Your Claude key | In the **macOS Keychain**, not in a file |
| Beta numbers (only if you turn them on) | Counts per day of how often something happened. Never words, names, files or anything from your screen |

Inside your own projects the app also writes `.companion/project.md` and a marked block in `AGENTS.md` and `CLAUDE.md`. That is where it keeps project notes. You can see and remove them.

**Retention.** The app keeps these until you remove them. There is no automatic expiry except the ones the app states in its own settings (for example how many receipt pictures to keep, and session notes that expire). **[unproven: the exact list of automatic expiries should be written out from the code before launch.]**

**Never stored.** Pictures of your screen, text read from other apps (Prompt help, the error explainer), and your microphone audio are held in memory only and are not written to disk by the app. Health, money, relationships, moods and secrets are never put in memory.

**One thing to know about pictures.** Claude Code (the program from Anthropic that the app runs) saves a copy of any picture it is sent in a temporary folder. The app points that folder at a small drive that lives in memory and erases it after each answer. **[unproven: whether this fully satisfies "never written to disk" has not been confirmed on a real Mac in a written test. The founder's own status notes list it as open.]** The Mac's own temporary folder may also hold the output of commands Claude Code ran during a task. macOS clears it by itself.

## 4. What is sent, and to whom

### 4.1 To Anthropic, through your own key

When you use a feature that needs Claude, the app sends the request from your Mac to Anthropic using the key you saved. It does not go through us. The table says when, and what is in it. Before sending, the app blacks out card numbers, bank numbers, keys and tokens that it can find (see section 6 for the limits of this).

| Feature (how you start it) | What goes to Claude |
|---|---|
| **Show me how / ask about your screen** (hotkey **S**) | One picture of the display you are on, with the app's own windows and password managers left out, and your question. The words the Mac's own text reader found on the screen (up to 60 lines per display) go with it. The app name goes only as a common name, and only if you turned on "Teach everyday apps in their own words" |
| **Point at the problem** (hotkey **F**) in a code project | Nothing about your project or screen. The app runs your project's own checks on your Mac and finds the screen line on your Mac. If your folder is linked to Vercel, your own Vercel tool may read your last deploy log. That goes to Vercel, not Claude |
| **Point at the problem** with no project, or another kind of app in front | One picture of the display, as above, and again after each step of the fix |
| **Prompt help** (hotkey **R**) | The text in the box you are typing in (set-aside code, links and commands are put back after), plus, unless you turn it off, your project's name, script and package names, top-level file and folder names, house rules, and up to 300 words of what the app remembers |
| **Explain an error** (hotkey **E**) | The text you selected, with keys hidden, and the project line it names |
| **Tasks, fixes, plans, Rescue, Research** | The files of the project you chose, as Claude needs them, plus your request and the app's memory notes. Research also searches the web through Claude. A task may too, unless you turn "Let tasks search the web" off |
| **Explain each fix** (on unless you turn it off) | The lines the task changed, with keys hidden. Not sent for "off the record" tasks |
| **Draw it** | Your question, the failing check's text, a few lines of code near the failure, package names, some folder names |
| **A file you drop in the ask box**, after you press Start | That file only (key-like text hidden; files such as `.env` are never read) |
| **Lessons** | A picture of your screen at each step, as for **S**. The "setting practice" lesson does not look at your screen |
| **Your typed answer to a question under a result** | Your answer, with anything that looks like a key or password hidden |
| **Review changes to your project** (Ask first unless you change it) | When another AI tool changes the project you chose: the names of the changed files, the changed lines with keys hidden, and what your project's own checks said. Settings and key files such as `.env` are never read. With Ask first, nothing is sent until you ask. If you turn on the key warning (off unless you change it), one check for a key written into the code runs on your Mac without asking, and sends nothing. With Automatic, each change is sent without a tap once the files are quiet. History keeps one row per review on your Mac (file names, never their text) for 90 days unless you change it. Off stops watching the folder |
| **A second-opinion review** of risky changes | Text with key-like values hidden |

**Your voice** is turned into words on your Mac. The audio is never saved or sent. Only the words go in the box, and they are sent only if you send them.

**What Anthropic does with this** is under your agreement with Anthropic (their Commercial Terms or Consumer Terms, their Privacy Policy and their data retention rules for the key you use). We make no promise about it. Read their terms: [link].

### 4.2 What is never sent

- Your Claude key. It goes from the Keychain only to the engine and Claude Code on your Mac, and the app's commands, hooks and add-ons do not see it.
- Your project or screen to us. We have no server for that.
- Your microphone audio.
- Files you convert by dropping them on the companion. Conversion happens on your Mac with the Mac's own tools. Nothing is uploaded.
- Anything from a password box, a password manager, Keychain Access, Passwords or System Settings (these are never read by Prompt help or the error explainer), or key files such as `.env` and `id_rsa`.
- Anything on a timer or in the background. Screen, text boxes and microphone are touched only on your hotkey.

### 4.3 Other places your Mac contacts

| Who | When | What they can see |
|---|---|---|
| **Hugging Face** (`huggingface.co`) | Only when you press Download for the speech model (about 140 MB) | Your internet address and the request, like any website visit |
| **Playwright's download servers** (`cdn.playwright.dev`, a Microsoft project) | Only when you press "Get the browser check" (about 100 MB, once) | Your internet address and the request |
| **GitHub** (planned release host) **[unproven]** | Once a day and when you press "Check for updates", **once updates are switched on** | Your internet address and that you asked for the newest version file. The update address and key are not set in the current build, so today it checks nothing |
| **GitHub, GitLab or Bitbucket** | Only when you open a project from a link you typed | Your internet address and the project you copy. This is a normal git copy made by your Mac |
| **Package registries** (for example npm) | When a check after a task installs your project's packages (you can set the app to ask first or never) | Your internet address and which packages are asked for |
| **Web pages a task opens** | Only if the task needs a help page and "Let tasks search the web" is on | The site sees your internet address |
| **Vercel** | Only if you use your own Vercel tool and login (reading your last deploy log, or going live after your yes) | Whatever Vercel receives under your own login |
| **Apple** | Normal macOS services: Keychain, notarization checks, and any crash reports you choose to share with Apple | Governed by Apple's terms. The app adds nothing to this |
| **Your mail app** | If you press "Report a problem", the app opens an email with only the app's version and macOS version filled in | You attach any file and send it yourself, or not at all |

We do not use advertising, analytics, tracking or crash-reporting services in the app. **[unproven: confirm with a network capture on a real Mac that no other host is contacted. The code was searched for other addresses and none was found, but a capture has not been done.]**

### 4.4 Not built yet

The planned phone approvals relay and Telegram link are not part of the current build. If they are added, this policy will be updated first and they will be off until you turn them on.

## 5. Saving a log for support

**Settings, Save a log for support** writes one text file to your Downloads folder. It holds the app's version, your Mac's version and chip, which permissions are allowed, sizes of what the app keeps, an allowlisted activity log (known events and fields only) and the newest Companion crash report from the last 14 days if there is one. Your home folder, user name, computer name, project folders and names, identifiers, key-like text and email addresses are replaced. **Nothing is sent.** You choose whether to share it. **Report a problem** saves the same file and opens an email in your own mail app. You attach the file yourself.

The scrubbing is thorough but automatic. **[unproven: it has been tested with made-up and one real log, not with many real crash reports. Say "tell us if you find anything personal in it" in the app.]** Read the file before you send it.

## 6. Limits of what the app can promise

Hiding keys, numbers and tokens works by looking for patterns. It can miss things and it can hide harmless things. The text reader that finds text on the screen can also miss text. Do not use the app on a screen or project that you are not allowed to share with Claude.

## 7. Deleting your data

**Settings, Delete everything** shows you what will go and asks for a second confirmation. It then quits the app, removes the app's own folders (task history, undo snapshots, receipt pictures, beta numbers, lessons, practice record, memory, the speech model, the hidden browser, settings, recent folders and the activity log, and the app's web view storage), disconnects every Google account you connected (it asks Google to cancel the app's access when Google answers, and removes the saved sign in from the Keychain either way), removes your saved key from the Keychain, and relaunches. The Google connections and the key are removed only if everything else was removed. If something cannot be removed, the app says so plainly the next time it starts.

It can also, if you tick that line, remove the app's own notes inside your projects (the `.companion` notes and the app's marked block in `AGENTS.md` and `CLAUDE.md`). Your `rules.txt` and the rest of your files stay. Practice-project copies in your home folder stay unless you tick the line to move them to the Trash.

It does not remove: anything Anthropic, Vercel or another site already received; files you or the app created in your projects; results from file conversions (they are new files you own); the macOS temporary folder; macOS crash reports; or the app itself (drag it to the Trash).

## 8. Your rights

Because the app holds your information on your Mac, you can see it, change it and delete it yourself in the app. We hold almost nothing about you. We hold what you send us if you write to us, and **[billing and licence records kept by our payment provider, see the Refund and Billing page. Placeholder until a provider is chosen.]**

[If the GDPR or UK GDPR applies: you have the right to access, correct, delete, restrict and move your data, to object, and to complain to your data protection authority. Legal basis for the little we process: contract and legitimate interests. International transfers: [to be completed by a lawyer].]
[If US state laws apply: [to be completed by a lawyer].]

## 9. Children

The app is not for children under [13 / 16 / 18, lawyer to decide]. It is a tool for people who build software, and it needs a paid developer-style API account from Anthropic, which has its own age rules. We do not knowingly collect information from children. If you think a child has written to us, contact [privacy email].

## 10. Security

Your key lives in the macOS Keychain. The app asks macOS for it itself, so another program that asks gets the Mac's own "allow?" question and not the key. Commands the agent runs are limited by a Mac sandbox (no writing outside the project, no reading private folders, only package sites on the network). No system is perfectly secure, and we cannot promise it.

## 11. Changes

We will change this page when the app changes what it reads or sends. The date at the top shows the last change. For a change that matters (a new place data goes), the app will tell you in the app before it starts doing it. Old versions are kept at [link].

## 12. Contact

[Company name] · [postal address] · [privacy email]
