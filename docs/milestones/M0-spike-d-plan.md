# Spike (d): read and paste text in other apps. Plan for approval

**Status:** waiting for the founder's approval. No code until approved. **Written:** 8 Oct 2026. **Detailed technical plan:** `docs/milestones/M0-spikes.md`, section "Spike (d)". This file is the plain words version, updated for the new launch order (F15): Prompt help is now a top priority, so this spike goes before the others.

## The question

When you press a hotkey in another app, can Companion read the prompt you've typed, and (after you accept) put a better one back in the same box, without stealing your typing, breaking the app, losing what was on your clipboard, or ever touching a password field?

This is the foundation of Prompt help. It uses **no AI and no API key**: the "better prompt" in the test is a fixed sentence.

## What the spike will test

A small throwaway app called **Paste Spike**, opened from Finder like a normal app. It has no window to type in. It lives in the background and reacts to hotkeys, and only when you press one:

1. **Read hotkey.** Reads the text in the box you're typing in. A visible indicator lights first. Nothing is read in the background or at any other time (rules 5 and 11).
2. **Accept hotkey.** Puts the fixed "improved" text into the same box.
3. **Esc.** Cancels, and puts everything back as it was.

It's tested in six places, because each handles text differently:

| Place | Why it's tricky |
|---|---|
| Claude desktop app | Built on Chrome's engine; accessibility info switches on slowly |
| ChatGPT Mac app | Changed to a Chrome based app in July 2026; needs a different trigger |
| claude.ai in Chrome | A rich text editor, not a plain box |
| claude.ai in Safari | Same site, different engine |
| Cursor chat | Another Chrome based editor |
| Lovable (a free project) in Chrome | A web app builder, the sort of tool our users use |

It also tests:
- **Selecting one word** reads only that word.
- **Your clipboard is kept safe:** an image you copied earlier is still there afterwards, and our temporary text doesn't show up in clipboard history.
- **Switching apps in between** pastes nothing; it says "copied instead" and leaves the text on your clipboard.
- **Password fields:** it refuses, and logs no text.
- **Terminal with Claude Code running:** it only copies and says "Copied, press Cmd+V". It never sends a key to Terminal.
- **Whether macOS starts alerting about clipboard reads** (a change Apple may be switching on in macOS 27.2). Recorded, with the exact wording.

The fixed "improved" text contains a link, a code snippet, an emoji and a Hindi word, so we catch apps that mangle special characters.

## The permission you'll be asked for

**One permission: Accessibility, once, under the name Paste Spike.** It's how a Mac app reads another app's text box. macOS shows a prompt the first time you press the read hotkey (never at install, rule 8). You click **Open System Settings**, then switch **Paste Spike** on under Privacy and Security, Accessibility.

- **Do not** give Terminal or any other app Accessibility. We want to prove that Paste Spike alone is enough.
- **Never asked for:** Input Monitoring, Screen Recording, Microphone, or "control System Events". If any of those appear, that's a failure we record.
- The clipboard reading uses no permission, but macOS may show a clipboard alert. That's one of the things we measure.

## How you'll know it worked (the pass list)

- Paste Spike asks for Accessibility once, under its own name, and no other permission prompt ever appears.
- In all six places, the text it reads is **exactly what you typed**. Reading takes about half a second or less once warm; the first read in an app may take up to about 2.5 seconds, and is recorded.
- Selecting one word reads only that word.
- Accepting puts the new text in the box. Your app stays in front, your cursor is still in the box, and nothing lands anywhere else.
- The app's Send button works with the new text, and Enter sends the new text, not the old one.
- Pressing Cmd+Z in the app brings your original text back within two presses.
- The image on your clipboard from before is still there afterwards.
- Switching apps between read and accept pastes nothing.
- On a password field (in Safari and in Chrome) it refuses and logs no text.
- In Terminal with Claude Code mid task, it only copies, and Claude Code isn't interrupted.
- The results table records, per app, what it took to read it.

If an app fails, that isn't the end: the plan has a fallback ladder (retry, the app's own Copy menu, then "copied, press Cmd+V" for that one app). The result we're after is a clear list of which apps work smoothly and which need the fallback.

## What I do, and what you do

**I do:** write the spike, build and sign it, set the hotkeys, write the log and the analysis, and guide you through the tests one step at a time in chat, as before. I record your answers myself.

**You do** (about 10 minutes of setup, then about 45 minutes of guided tests):
1. **Create a free Apple Development certificate** (recommended, about 5 minutes): Xcode, Settings, Accounts, sign in with your Apple ID, Manage Certificates, +, Apple Development. Without it, macOS forgets the Accessibility permission each time I rebuild the app. It's free, needs no paid Apple account, and I never see the certificate.
2. **Be signed in** to claude.ai in Chrome and in Safari, the ChatGPT app, Cursor (with its chat open), and a free Lovable project in Chrome.
3. **Copy an image** in Preview shortly before the clipboard test, and turn on Spotlight clipboard history for the test (I'll tell you when to turn it off again).
4. **Click Allow** on the one Accessibility prompt.
5. **Don't dictate with Wispr Flow** during the tests, because it also uses the clipboard.
6. **Don't update macOS** past 27.0.1 until the clipboard test is done.

Already installed here: Claude, ChatGPT, Cursor, Chrome, Safari, Xcode.

## What is left out for now

- Testing whether Claude Code follows a pasted prompt as well as a typed one, since it marks pasted text as untrusted. That moves to M5 (the trimmed M0 decision).
- Windows.
- Any AI call. The rewrite itself is built in M5.

## Risks and plan B

- An app returns nothing on the first press: retry, then the app's own Edit, Copy menu.
- A rich editor doubles or garbles text when we select everything and paste: read back after pasting; if wrong, undo and use "copied, press Cmd+V" for that app.
- macOS shows a clipboard alert when we save your clipboard: skip save and restore, and tell the user plainly their clipboard now holds the improved prompt.
- Modifier keys still held down merge with our paste: wait until they're released.
- macOS forgets the permission after a rebuild: sign every build with the free certificate.

## Estimate

About 4 working days of my time, as in the M0 plan, plus your 10 minutes of setup and about 45 minutes of guided testing. It needs **no API key** and **no paid Apple account**.

## Where the work goes

`spikes/d-paste/` (throwaway code), with a README, a `TESTING` guide and a `RESULTS.md`. Afterwards, `docs/research/technical_research.md` and decision record T11 are updated with what we learned, and the founder is told if the research was wrong.

## Approval

Say **approved** and I start, beginning with the app and the log. Say what to change otherwise.
