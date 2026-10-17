# What Companion reads, when, and where it goes (friends alpha, build 0.1.0)

**Draft for the founder to review before it is sent to anyone.** Written from what the code does today. It makes no claim about how Anthropic handles data: read their terms for the key you use.

## The short version
- Companion looks at your screen or listens **only when you press its key**, with a light on first. It never watches in the background.
- It uses **your own Claude key**. Companion has no server and never sees your key, your project or your screen: what Claude is sent goes from your Mac to Anthropic, under your account.
- Nothing you did is kept anywhere but on your Mac, and **Settings, Delete everything** removes all of it.

## Feature by feature
| When | What Companion reads | Where it goes |
|---|---|---|
| You press **F** (point at the problem) | Runs your project's own checks and reads the failing line from your files. Then looks at the screen you are on, **on your Mac**, to find that line (the Mac's own text reader). If the line is not there, it looks at your other screens one after another, with the light still on. The pictures are never saved and never sent. | Nothing leaves your Mac for this step. |
| You press **S** (ask about your screen) | One picture of the display you are on. Card numbers, bank numbers, keys and tokens that the text reader finds are blacked out first. Your password manager's windows and Companion's own are left out. | The picture (in memory only, never written to disk by Companion) is sent to Claude with your question, under your key. Claude Code itself keeps a copy of any picture it receives in its temporary folder; Companion points that folder at a drive in memory and erases it after each answer. |
| You hold Option and Space (talk, or the other keys you picked in Settings) | Your voice, only while you hold the keys. | Turned into words on your Mac by a speech model. The audio is never saved or sent; the words go in the box and are sent only if you send them. |
| You ask for a task, a fix or a plan | The files of the project you chose, as Claude needs them. | Sent to Claude under your key, like any use of Claude Code. Companion's safety rules limit what it may change, and every change is snapshotted first so you can undo it. |
| You start a **lesson** (Lessons button) | For each step, one picture of your screen like **S** (light on first, same covering of private text), to find the place to point at. The project's own files are checked to prove a step worked (a setting's name, whether a file exists; setting values and key files are never read). Where you are in a lesson is saved as step names and outcomes only. | The picture goes to Claude under your key, like **S**. The saved place stays on your Mac. |
| Once a day, and when you press **Check for updates** (once updates are set up) | Nothing from your Mac. It is a plain request for one file. | One web address (the founder's release page) is asked for the newest version, so it sees your internet address like any website. Updates are installed only when you press Install, and only if they match Companion's own key. You can turn the daily check off in Settings. |
| You press **Get the browser check** (on a check result, once) | Nothing from your Mac. It is a plain download. | One download (about 100 MB) from Playwright's servers (`cdn.playwright.dev`; Playwright is made by Microsoft), so they see your internet address like any website. It is the hidden browser Companion opens your pages in, plus a small video tool (about 1 MB) that Playwright's installer always adds and Companion does not use. Nothing downloads until you press the button, and Stop everything ends it. It is kept in Companion's own folder; Delete everything removes it. |
| You turn on **Speak to me** (Settings; off by default) | Short lines Companion itself wrote (a lesson step, what a ring points at). Never anything that looks like a key, card number or token. | Said out loud by your Mac's own voice. Nothing is sent anywhere. |
| After a fix passes its checks | Opens your page in a hidden browser on your Mac and takes a picture of **your app** (never your screen), before and after. | Stays on your Mac. |
| You go live | Your project's files go to Vercel through **your own Vercel login**, after safety checks and your yes. | To Vercel, by their tool. |
| Always on | The last few things you did, as short notes (what is in `.companion/project.md` in your project, and a small profile in Companion's own folder). You can read, edit and forget every line in **What I know**. | Stays on your Mac. Never health, money, relationships, moods or secrets. |

## What Companion keeps on your Mac
**Beta numbers** are off until you turn them on in Settings. When on, Companion keeps counts per day on your Mac (how often a thing happened; never words, names, files or anything from your screen). It sends nothing. You can read them, copy them to send to the founder, and erase them.

Task history and spending, undo snapshots of your projects, receipt pictures, memory notes, the speech model, a hidden browser, settings and a small activity log (what happened, never what was typed, said or on screen). **Settings** lists them with sizes. **Delete everything** removes them and your saved key.

## If you send a log
**Settings, Save a log for support** writes a text file with no project content, nothing typed or said and nothing from your screen; your name, folders and keys are covered. You decide whether to send it.

## What this note does not say
Companion cannot see what Anthropic or Vercel do with what they receive, and does not claim to. Do not use it on a project you are not allowed to share with Claude.
