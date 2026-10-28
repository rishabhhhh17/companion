# M16: The notch is the app

**Decided by the founder, 27 Oct 2026:** the palette is **Glow** (bright and glossy, closest to HeyClicky: a shiny gold main button, a mint green pill, a lifted grey panel); **step 5 yes, only then** (Squibby acts as a normal app, with its menu and maybe a Dock icon, only while a window the person opened is in front; F11 and T01 amended); **step 6: only on hover** (the wings show work is running; the cards show when the person looks; nothing hangs over the screen by itself).

Written 27 Oct 2026, after the founder looked at HeyClicky's notch ("look at how this is") and asked for better colours, "the menus", the sun icon beside the notch ("yeah"), and "how are we going to build it". The founder picked: everything in the notch, Squibby's own app menu, menus inside the panel, and three colour options to choose from (sent as screenshots: Ember, Dusk, Glow).

## What it should feel like
Like the best notch apps: the notch is where Squibby lives. Rest the pointer on it and it grows into a small coloured panel; open it and Home, the answers and Settings are the same surface, grown further down. Work in progress hangs from the notch. Flowflow is the water agent: it shows on its own work, never as the face of the app.

## In order

### 1. Colours (needs the founder's pick: Ember, Dusk or Glow)
- The chosen palette becomes named brand colours (from the mark in `app/brand/`), used in the panel, the sun icon and Home's main button. The base chrome stays black and white; the tests that keep it neutral stay.
- Done when: the panel, the sun and Home's Start button use only the brand colours, contrast passes, and the founder says yes on a real Mac.

### 2. The sun beside the notch
- At rest, a small sun (the mark, 14 points) sits just left of the notch, always there, like HeyClicky's logo. It glows softly while work runs. Clicking it opens the panel.
- The island's rest size grows by one small wing on the left; `island.rs` and the character's clear zone follow, with tests.

### 3. Everything in the notch
- Home opens as the notch grown down: no gap under the island, the same black (or the palette's dark), the island's corners flowing into Home's, so it reads as one surface.
- The answer to a question shows inside it (already on Now), and Settings is a place inside it (it already is; the separate Settings window stays for those who want it).
- Done when: on a real Mac, opening Home from the notch looks like one shape growing, not a second window.

### 4. Menus inside the panel
- The pills open small dropdowns under the notch, like HeyClicky's "Apps +": **Projects** (switch folder, recent ones), **Recent fixes** (the last few receipts, each opening in Home with Undo). Keyboard and VoiceOver work like any menu.

### 5. Squibby's own app menu ("Squibby  Edit  View  Window  Help")
- A menu bar app with no Dock icon shows no app menu. **This needs the founder's yes, because it touches F11 ("panels are non activating with no Dock icon") and T01 (an accessory app).** Proposal: only while a window the person opened is in front (the Settings window, or Home while they type), Squibby becomes a normal app for that moment (its menu shows; a Dock icon may show too), and goes back to no Dock icon when it closes. Never while idle, never by itself. Whether macOS can do this without the Dock icon showing is [verify] in a short spike first.
- The menu: About, Settings, Check for updates, Hide, Quit; Edit with copy and paste; Window; Help with the guide and Report a problem.

### 6. Work hangs from the notch
- Each job runs as its own small card under the notch while the pointer is away (not only in the panel): its plan while it works, its result when it is done, gone after a few seconds or on a click. Off by default if it ever covers what the person is doing; a setting either way.

### 7. A real Mac session
- One step per message, as before, with sizes, timing and colours tuned live.

## How I will work
One branch from `m15/make-it-great`, the steps in order, tests first for the geometry and the menus, the full suite after each step, the app built and opened after each step, nothing merged without the founder.

## Decisions only the founder can make
1. The palette: Ember, Dusk or Glow (or a mix).
2. Step 5: may Squibby become a normal app (its menu, maybe a Dock icon) only while a window you opened is in front? (Changes F11 and T01.)
3. Step 6: should finished work hang from the notch by itself, or only show when you look?
