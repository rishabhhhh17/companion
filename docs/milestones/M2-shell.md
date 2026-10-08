# M2: The app shell. Plan for approval

**Status:** waiting for the founder's approval. No code until approved. **Written:** 8 Oct 2026. **Source:** technical doc section 4 (the panel recipe, as changed by T01), section 2 (processes), the M2 row in section 18; product doc section 4 (Presence). Decisions behind it: T01 (native panels), F04 (characters), F11 (never steal focus, never watch), F15 (agents first, logic before looks).

## What M2 is

The first time Companion appears on your screen. The engine from M1 gets a body: a character on the edge of your screen, cards that show what's happening, a box to tell it what to do, and the hotkeys. After M2 you can type a task, watch the character work, approve or refuse a risky step with a tap, see the receipt, and undo, all in the real app.

## The decision I need from you: how much to build now

The full plan in the technical doc packs a lot into M2: the animated character art, talking to it, a mode for screen sharing, and the signing needed for other people to install it. Because you said "logic first, looks later" (F15), I recommend splitting it:

**Option A (my recommendation): M2 now, the essentials.**
- It gets a working, usable app on your screen fastest, with the agent doing real work in it, and keeps the pretty parts for when the logic is solid.
- About **8 to 10 working days**.

**Option B: the whole M2 in one go.**
- Everything below, plus the finished animated character, voice, the screen sharing mode and signed installers.
- About **3 to 4 weeks**, and more of it needs your eyes (art, voice feel).

## What Option A builds

1. **The app itself,** a small Mac app with no Dock icon, built the way we proved in spike (a3): each window is a panel created natively, non activating from the start, with a web page inside. It never takes your keyboard when clicked.
2. **The character,** one, on the right edge (your choice of edge later), with every state from the product doc: off, idle, listening, thinking, working, checking, needs you, done, error. Drawn simply (clean shapes with simple motion), not the final art. Includes **reduced motion**, which freezes movement.
3. **Cards:** a small card that opens beside the character for: a task in progress, an approval ("Allow `git push`?" with Allow and Don't allow), the receipt (what changed, what can't be undone, the cost) with an **Undo** button, and errors in plain words.
4. **The ask box:** a hotkey opens a small box beside the character, you type a task, and the right agent starts. (Typing only, no voice yet.) Typing uses the card panel that we proved takes the keyboard safely.
5. **Hotkeys that need no permission:** open the ask box, and the **stop everything key**, which stops every agent right away (the microphone and screen captures come with their features).
6. **A menu bar icon** to pause, quit and open settings.
7. **Docking:** remembers which edge and how high, per display, and moves back on screen when you unplug a screen or change the Dock or resolution.
8. **Connecting the engine:** the app starts the M1 runner as a helper program, talks to it in the message language, reads your API key from the Keychain and hands it over safely (never to a web page). If no key is stored, it says "Not connected" and explains your options in plain words. It never shows a Claude login form (rule 2).
9. **A permissions framework:** nothing is asked at install. Each permission (Accessibility, Screen Recording, Microphone) is asked the first time its feature is used, with a short plain explanation first. In M2 nothing needs one yet, so the framework is built and tested but stays silent.
10. **Quiet manners:** it never interrupts while you're typing in another app, it hides over a full screen app by default (leaving a small "needs you" badge), and it speaks only when you start something or something you started changes.

## What Option A leaves for later

The finished animated art (Rive) and the other four characters, hold to talk voice, presentation mode for screen sharing, and signed and notarized installers for testers. None of them is needed to prove the engine works in a real app, and the signing waits on your Apple approval anyway.

## How we'll know it worked

**Automatic checks** (run after every change):
- the Rust side and the runner agree on every message (shared test fixtures);
- character states follow agent events correctly, including reduced motion;
- an approval card's answer reaches the runner, and an unanswered one expires;
- the stop everything key stops every running agent;
- the key never reaches a web page or a log (a search of the page's messages and logs finds none);
- docking maths for several screens, and moving back on screen after a change;
- no permission is requested at startup (the app's entitlements and prompts are checked).

**Hands on check with you,** about 20 minutes, guided step by step in chat like before, because only you can click: clicking the character and the card while typing in Terminal never steals your typing; the card and Esc route; over a full screen app; Spaces and Stage Manager; moving the Dock; a second screen if you have one. These are the open checks from T01, now on the real app.

**One more thing to re-check:** while the card holds your typing, the app privately counts itself as "active". We confirm it has no side effects.

## What I need from you

1. **Option A or B** (I recommend A).
2. **Approve this plan.**
3. Nothing to install: the Rust tools and Tauri are already on your Mac, and Bun is there from M1.

## Order of work

1. The app skeleton and the panels (the part we proved), with a test that clicks never activate the app.
2. The runner helper and the message channel, including the Keychain handoff.
3. The character and its states, then the cards (task, approval, receipt, error, Undo).
4. The ask box and hotkeys, including stop everything.
5. Docking, menu bar icon and permissions framework.
6. The hands on check with you.

## Risks and plan B

- **Our own panels behave differently in a full app than in the spike.** The spike proved the core click behaviour; the hands on check covers the rest. If a click ever activates the app, we fall back to a native character with the web page only in the card (option A from our earlier panel options).
- **The web page inside our panel loses its connection to the app** after sleep or a display change. A test checks events keep flowing; the fallback is rebuilding the page.
- **Hotkeys that clash with other apps.** Users can change them; defaults avoid common ones.

## Approval

Say **approved A** (or **approved B**), and I'll start with the app skeleton and the click test.
