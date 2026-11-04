# Squibby design spec: from "okay" to a top YC product

Date: 4 Nov 2026. Draft for the founder. Nothing in the m48-launch worktree was edited.

Inputs: three YC benchmark passes (HeyClicky, Willow, jo, Replit, PostHog, Pickle, Supabase, Mintlify, Resend, Trigger.dev, Infisical, Browser Use, Replicate, Airbnb, Stripe, Gusto, Retool, Brex; Cal.com as a non YC reference), and a 260 shot tour of the current build (`tour/founder-*`, `tour/graphite-*`).

Mockups (static HTML, screenshotted at 2x):
- `mock-home-rest.html` / `.png`: Home wide at rest, calm Instrument light.
- `mock-home-review.html` / `.png`: Home wide with a review that needs you.
- `mock-visor-notch.html` / `.png`: the Visor in six states, the notch working and proven, and the screen edge dock (Graphite dark).
- Shared: `mock-base.css` (the tokens below, written out), `mock-visor.js` (a drawable Visor in SVG).

Founder picks this spec keeps, unchanged:
- The **Visor** is the character: a glass orb, a dark visor band, and lights that blink, scan and smile. It is the only playful object on any screen.
- **Calm by default.** Neutral surfaces, one blue accent. The colourful look is a choice in Settings, never the default.
- **A productivity tool, never an AI friend.** No faces with eyes, no affection, streaks or praise. Wit is dry, short and never on errors or money.

---

## 0. What the best YC products share, and what that means here

The same seven moves show up across every benchmark:

1. One type family, tight tracking at display sizes (-0.02em), regular or medium weight for big text.
2. Greys made from one ink at opacity steps, not many hex greys.
3. Exactly one accent, used only on the main action.
4. Fun lives in one place per screen (Airbnb's 3D icons, PostHog's hedgehog, Stripe's ribbon). Everything around it is quiet.
5. The real product is the illustration (proof screenshots, real code lines, real file names), never a drawing.
6. Short, concrete copy: 2 to 6 word outcomes plus one plain sentence of why.
7. Trust stated next to the action: "You can undo this." "Nothing is saved."

Squibby today breaks 1, 3, 4 and 6 in places (see the tour): the founder's stored look turns whole pages maroon, the character slot holds a water drop instead of the Visor, Home at rest is 60% empty, and code is shown before plain words.

---

## 1. Visual system

### 1.1 Type

System font only (SF Pro via `-apple-system`), so it feels native and costs nothing. SF Mono for file names, line numbers, exit codes and key caps. No second display face in the calm look.

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 28 / 32 | 500 | -0.022em | Home hero, Where was I headline |
| `display-sm` | 22 / 27 | 500 | -0.02em | Review card headline |
| `title` | 17 / 22 | 600 | -0.012em | Page titles (History, Memory) |
| `headline` | 13 / 18 | 600 | -0.005em | Card titles, row titles |
| `body` | 14 / 20 | 400 | -0.006em | Default text |
| `body-sm` | 13 / 18 | 400 | -0.004em | Card body, row sub lines |
| `caption` | 12 / 16 | 400 | 0 | Meta, timestamps, reassurance lines |
| `eyebrow` | 11 / 14 | 600 | +0.06em, uppercase | "LAST FIX", "SINCE THEN", pill labels |
| `mono` | 12 / 20 | 400 | 0 | File paths, code, exit codes |

Rules:
- **Two tone headlines** (Stripe, Browser Use): the outcome in `t1`, the why in `t3`, same size. "my-shop checked out fine. / Proven 2 hours ago. 3 files changed since." This replaces the current title plus small subtitle.
- Numbers that change (counts, timers, "2 of 4") use `font-variant-numeric: tabular-nums` so they never jiggle.
- No bold above 600. No weight 700/800 anywhere.

### 1.2 Palette: Instrument (the calm default)

One ink, stepped by opacity. One blue. Status colours appear only in small pills, hairlines and Visor lights, never as surfaces.

**Light (Instrument on Paper)**

| Token | Value | Use |
|---|---|---|
| `--ink` | `rgb(11 18 32)` | Base for all text and hairlines |
| `--t1` | ink / 0.92 | Primary text |
| `--t2` | ink / 0.62 | Secondary text, icons |
| `--t3` | ink / 0.42 | Tertiary, second line of two tone headlines |
| `--hair` | ink / 0.09 | Card borders, dividers |
| `--hair2` | ink / 0.14 | Control borders |
| `--bg` | `#F6F6F4` | Window background (warm off-white) |
| `--surface` | `#FFFFFF` | Cards, ask box |
| `--sunken` | `#EEEEEB` | Code header, browser frame bar |
| `--accent` | `#2F6BFF` | The one main action, "pointing here", selected nav text |
| `--accent-deep` | `#1E4FD6` | Primary button bottom edge, selected nav text |
| `--accent-tint` | accent / 0.10 | Selected nav row, context tokens in the ask box |
| `--ok` | `#1F8A5B` (tint 0.10) | Proven, Fine |
| `--warn` | `#B26B00` (tint 0.10) | Needs you, Then |
| `--danger` | `#B42318` (tint 0.08) | Fix this first. Deep red, never bright |

**Dark (Instrument on Graphite)**: `--ink` becomes `rgb(233 235 223)` (warm off-white, Retool), `--bg #151515`, `--surface #1C1C1C`, `--sunken #232323`, `--accent #4D86FF`, status colours lift to `#5BE3A1`, `#FFB547`, `#FF6B5E` at the same tint opacities.

**Black** stays as a third option for OLED fans but is no longer called "the usual" anywhere. The Look page says one sentence: "Instrument is the calm default. Paper or Graphite follows your Mac."

### 1.3 Palette: Friendly, the improved colourful look (opt in)

The current Vivid plus Deep swaps whole pages to maroon and purple. That is the bug, not the colour. New rule (Replicate's lesson): **colour changes only the backdrop layer, the accent and the Visor's lights. Cards, text and controls are identical to Instrument.** One design system, a safe switch.

| Token | Friendly value |
|---|---|
| `--bg` | Soft wash: `radial-gradient(120% 80% at 100% 0%, #FFE7D6 0%, transparent 55%), radial-gradient(90% 70% at 0% 100%, #E3E6FF 0%, transparent 60%), #FAF7F2` |
| `--accent` | `#A55742` terracotta (jo), deep `#8A4433`, tint 0.10 |
| Visor lights | Idle `#FF9F6B`, working sweep `#FF9F6B to #FFD27A`, proven `#5BE3A1`, needs `#FFB547`, error `#FF6B5E` |
| Signature detail | A 2px gradient hairline (`#FF9F6B to #A78BFA`) along the bottom of the primary button and the top of the active card (Gusto's rainbow underline idea) |
| Dark Friendly | `--bg #17141A` with the same washes at 0.18 opacity |

What Friendly may never do: tint text, tint cards, switch a single page (Learn, practice) to its own palette, or add a second character. "Flowflow" the water drop retires from user facing UI (see section 2.5).

### 1.4 Spacing

4px base. Steps: 4, 8, 12, 16, 20, 24, 32, 48.
- Window gutter: 24. Card padding: 14 x 16 (compact), 18 x 20 (review card).
- Gap between cards: 12. Between a headline and its actions: 16.
- Sidebar width 200 (wide), hidden in tall.

### 1.5 Radii

| Token | Value | Use |
|---|---|---|
| `--r-ctl` | 6 | Buttons, inputs, key caps (5) |
| `--r-chip` | 8 | Code blocks, inline callouts, thumbnails |
| `--r-card` | 12 | Cards, window corners |
| `--r-panel` | 16 | Ask box, notch panel lower corners (20 in the notch) |
| `--r-pill` | 999 | Status pills, suggestion chips, round send button |

### 1.6 Elevation

Hairlines first, shadows rarely (Supabase).
- Level 0: cards. `1px solid --hair`, no shadow.
- Level 1: floating ask box, toasts. `0 1px 2px rgb(0 0 0/.04), 0 4px 14px rgb(0 0 0/.06)`.
- Level 2: notch panel, popovers, menus. `0 10px 30px rgb(0 0 0/.25)` on black.
- Buttons are "keys" (PostHog): a 2px darker bottom border that drops to 1px with `translateY(1px)` on press. Primary adds `inset 0 1px 0 rgb(255 255 255/.22)` for a glass edge that echoes the orb.

### 1.7 Iconography

- One line icon set, 1.6px stroke, 15px in nav, 12px in rows, rounded caps. SF Symbols weights are the reference.
- Icons are grey (`t2`). Never filled colour icons, never emoji in the app.
- Source icons for where a change came from (Lovable, Bolt, Replit, Cursor, a file) as small 16px monochrome marks, like jo's Gmail and Calendar icons.
- Status is always a pill with a word ("PROVEN", "FIX THIS FIRST"), never an icon alone.
- The Visor is the only rendered 3D object in the app.

---

## 2. The Visor: personality without a face

The Visor (see `mock-visor-notch.png`) is a pearl glass sphere (radial gradient white to `#9AA4B4`, a 1px white rim, a soft top left highlight, a soft contact shadow) crossed by a dark visor band (`#1B2230 to #0B0F17`, slightly curved). Its only expressive part is the lights inside the band. Nothing else moves except a 4 degree lean. No eyes, no mouth, no limbs.

### 2.1 States (each readable without its label)

| State | Lights | Motion | When |
|---|---|---|---|
| Ready | Two soft round lights, accent colour | Blink (lights scale Y to 0.1) every 6 to 9 s, random, 120ms | Idle |
| Listening | Lights become a 5 bar waveform driven by mic level | 60ms per level update | Hold to talk |
| Working | One bright segment sweeps left to right along a faint track | 900ms linear loop | Any agent or check running |
| Needs you | Amber, lights 15% taller, a third small dot to the side | Lean 4 degrees toward the user's side of the screen, 240ms; one pulse every 4 s | Approval, review waiting |
| Proven | A green smile arc | Draws in 200ms, holds 1.2 s, fades back to Ready over 400ms | A check passed |
| Problem | One flat red bar | Appears in 120ms, no shake | A check failed, stuck |
| Stopped | Lights dim to 30%, short dashes | 300ms fade | Stop everything key, or paused |

Rules:
- At most one Visor reaction per card or event. When a card already has strong proof (a before and after picture), the Visor stays small or idle so there is one focal point.
- The stop everything key always shows Stopped first, so the user sees it obey.
- Reduce Motion: blink and sweep become static lights, the smile appears without drawing, no lean.

### 2.2 Sizes

| Place | Size |
|---|---|
| Home hero | 96px |
| Review card | 64px |
| Screen edge dock | 44px |
| Notch panel | 34px |
| Notch closed | 20px, plus the band becomes a 120px light track |
| Empty states | 72px, Ready |

### 2.3 Reactions across screens

- **Home at rest:** Ready, blinking. Looks toward the ask box when the user starts typing (lights shift 2px toward the box, 180ms).
- **Review needs you:** Needs you at 64px, top right of the card, never covering the code.
- **Fix it running:** Working sweep. The notch shows the same sweep plus "2 of 4".
- **Proven:** One smile. The proof card's status pill flips "CHECKING" to "PROVEN" at the same moment (Cal.com's chip that turns into "Booked").
- **Undo:** The lights do a quick right to left sweep (the reverse of Working), 300ms, then Ready. That is the "rewind" signature.
- **Error:** Flat red bar. Copy does the talking.

### 2.4 Empty states

Every empty state is the Visor in Ready at 72px, one sentence that says what is missing, and one button that fixes it (Supabase's formula). Examples in section 5.

### 2.5 The notch hello

First launch, and after "Replay the welcome tour": the Visor drops out of the notch (240ms, ease out), blinks once, the lights sweep once across the band, and a single line appears under it: "Press Option Space when you're stuck." Then it folds back into the notch. Total 2.4 s. Never again unless replayed.

### 2.6 Implementation note

Ship the Visor as an SVG (or Lottie or Rive if the founder's final art needs it) with named parts: `sphere`, `band`, `lights`. State is a prop. The lights are separate shapes so motion is transform and opacity only. `mock-visor.js` is a working reference for shapes and colours at every size. Remove "Glass orb", "Friendly" and "Flowflow" from the Character page; replace with "Visor" plus "Light colour: Match look / Blue / Warm / Mint" and "Reactions: On / Quiet / Off".

---

## 3. Screen by screen

One layout grammar for both sizes and both looks:
- **Top bar:** project picker (status dot, name), one line of context, the hotkey hint on the right.
- **Content:** the most important card first.
- **Ask box: always at the bottom**, pinned, in both tall and wide.
- **Settings: always the last item in the nav** (sidebar in wide, the "More" tab in tall).
- **Status footer** ("Checked just now · Undo is ready") lives in the top bar context line in every style.

### 3.1 Home at rest, wide (`mock-home-rest.png`)

The current Home leaves 55% of the window empty. New layout:

1. **Hero**, two tone, driven by the latest known state (never "Not checked yet" when there is a proven run):
   - "my-shop checked out fine. / Proven 2 hours ago. 3 files changed since."
   - Pill: "LAST CHECK PASSED" (ok), "NEEDS A LOOK" (warn), "NOT CHECKED YET" (neutral, only for a truly new project).
   - Actions: primary "Check it again ↵", secondary "Where was I?".
   - Visor 96px on the right.
2. **Two cards side by side:**
   - **Last fix** (1.35fr): title, one line why, a before and after pair in minimal browser frames with the project URL, proof ticks ("Build passed", "Page checked in a browser"), and a quiet Undo.
   - **Since then** (1fr): up to three rows: "Lovable changed 3 files · 40 min", "Not checked yet · Check", "Left off: price page · Yesterday".
3. **Ask box**, pinned: "What are you stuck on?", a project token, three example chips drawn from the user's own project (Replit's first box), a mic, a round send.

New user variant (no runs yet): the Last fix card becomes "Practice on a sample project. It can't touch anything real. Takes about a minute." with one button "Start practice". Since then becomes a 3 step setup checklist (see 3.11).

### 3.2 Home at rest, tall

Same order, one column: top bar, hero (Visor 64px inline right of the headline), Last fix card (before and after stacked), Since then rows, ask box pinned at the bottom. Nav becomes a 4 icon tab bar at the top: Now, History, Memory, More (Learn, Settings).

### 3.3 Review card (`mock-home-review.png`)

The strongest screen today; it needs plain words before code and one button grammar.

- 3px top border in the severity colour.
- Pill: "FIX THIS FIRST · 1 OF 2".
- Two tone headline that names the problem and why it matters: "Your payment key is written into the code. / Anyone who sees the code can copy it and spend your money."
- Visor 64px, Needs you, top right.
- **The pointed line**: a 3 line code excerpt with the file name in the header, the failing line tinted with a 3px left bar and "← Squibby is pointing here". This is the hero promise made visible.
- Actions, all the same key button shape: **Fix it ↵** (primary), Copy for my AI, Keep it anyway. "Why does this matter?" as a quiet link on the right.
- Reassurance under the buttons, 12px `t3`: "Squibby moves the key to a safe settings file and checks the site still works. You can undo it."
- Below: the other findings as one line cards with a pill (THEN, FINE) and a single quiet action (Look, See). File lists move behind "See".
- The ask box switches its placeholder to "Ask about this change", with tokens for the pointed line and chips "What is a key?", "Is my site live?".

### 3.4 Fix it and proof

1. **Running:** the review card collapses to a run list (Trigger.dev): one row per step, verb first, live status on the right.
   - "Moving the key to a settings file · Done 2 s"
   - "Building the site · Running…" (Visor sweeping)
   - "Opening the page in a browser · Waiting"
   - "Comparing before and after · Waiting"
   Counter in the notch: "2 of 4".
2. **Proven:** the run list folds into a receipt card in place (the old "Checking the work…" card must be removed when the result arrives). Receipt: title "Key moved to a safe file", one line why, before and after pair, proof ticks with exit codes in mono ("npm run build · exit 0", "browser check · 200"), "Checked 3 pages in 4 seconds", Undo and "Replay what Squibby did".
3. **Failing:** lead with the failing line pointed at, exactly as the review card does, then "Try again" (primary) and "Copy for my AI". Name the step that actually failed.

### 3.5 Where was I

A single card at the top of Home (and the hotkey result when pressed cold):
- Headline: "You were fixing the price page. / Lovable changed 3 files since. One thing left: the signup button."
- A short timeline of three rows with times.
- One primary: "Pick up where I left off". Secondary: "Check it first".

### 3.6 History

- Grouped by day ("Today", "Yesterday", "Mon 2 Nov").
- Each row: source icon, 2 to 6 word outcome, a 48px before and after thumbnail for proven fixes, pills (PROVEN, UNDONE, COPIED FOR AI), time on the right in tabular numbers.
- One quiet action per row (Undo or Open). The explanation of Undo order becomes a one line caption at the top, not wedged between rows.
- Empty: Visor Ready, "Nothing here yet. Your first fix will show up here with its proof.", button "Start practice".

### 3.7 Memory

- Two sections with clear names: "About my-shop" and "About you".
- Each line: the fact, its source in `t3` ("From package.json", "You told me, 2 Nov"), Edit and Forget as quiet actions on hover.
- Danger buttons say their subject: "Erase my-shop notes", "Erase notes about you".
- "Reactions and celebrations" moves to Settings > Character.
- Empty: one example line shown greyed with its source ("Uses Supabase for sign in · from package.json") and "Squibby fills this in as you work. Every line can be forgotten."

### 3.8 Learn

- A course style path: the first practice project recommended and expanded (Find it, Fix it, Prove it progress), the next ones collapsed as "Next".
- Same Instrument palette as every other page. No page level colour.
- Remove the dead end "Guided lessons: No lessons yet / Close". Replace with "Lessons appear when Squibby spots something in your project."

### 3.9 Settings

Model: Infisical's tables. Every behaviour keeps a control with a safe default (founder rule), but the default view is short.
- Pages: General, Look, Character, Keys and shortcuts, Privacy, Account, About.
- About 5 rows visible per page. Everything else under "Show all options" without a count.
- Rows: plain label, one line of what it does, the control on the right.
- Fix the unfinished parts: About shows the real version and update channel; empty groups ("Your Claude", "What Squibby may see") are filled or hidden.
- Rename internal names users see: "Flowflow" goes, "Second Look" becomes "Check another AI's answer".
- Keys: one memorable main key (Option Space) shown everywhere. The four key chords stay available under Keys and shortcuts, never in onboarding copy.
- Search ranks title matches first.
- General gets "Replay the welcome tour" (HeyClicky).

### 3.10 First run

Three steps, each with real content in the middle instead of empty water:
1. **Welcome.** Left: "Stuck while building with AI? Press the key." and a three tick promise list: "Nothing changes without your OK", "Every change can be undone", "Squibby only looks when you press the key. Nothing is saved." Right: a 10 second autoplay loop of the real flow (stuck, press the key, the line is pointed at, fixed, proven, Undo), with a visible Pause. Step chips "01 Welcome · 02 Connect Claude · 03 Pick a project" (Willow).
2. **Connect Claude.** A picture of where the key is in the Anthropic console (three numbered shots), the paste field, a live check after paste ("Key works"), and a plain cost line: "Most fixes cost a few cents of your own Claude usage."
3. **Pick a project.** Recent folders found on the Mac, "Open a Lovable, Bolt or Replit project", and "Practice on a sample project first".
- Last beat: the notch hello (2.5), so the tour always ends in the notch.

### 3.11 Setup problems (no Claude, no project)

One numbered checklist replaces the stacked duplicate messages: "1 Get Claude · 2 Add your key · 3 Pick a project", done steps ticked, the current step expanded with one button. The practice project is offered as a one tap start whenever no project is chosen.

### 3.12 Approval

- Header names the question: "Squibby needs your OK to add a tool."
- One plain sentence of why: "Adds a small tool that checks form input. The fix needs it."
- The command in a reveal: "Show the command" opens `npm install zod`.
- Allow (primary) and Don't allow, with clear contrast in the notch too.
- Reassurance: "You can undo this."

### 3.13 The notch and its panel (`mock-visor-notch.png`)

- **Closed, working:** the Visor at 20px plus a 120px light track that sweeps, plus "2 of 4" in tabular numbers. The visor band becomes the notch status.
- **Hover:** a quick peek (a setting, on by default) showing the current step line.
- **Proven:** the panel drops down (240ms) as a mini receipt: Visor smiling, title, "Checked in a browser · 4 s", a proof thumbnail, then Keep ↵ (primary), Undo ⌘Z, See proof. Keyboard hints live on the buttons (Willow Scribe). It folds back after 6 s, or on Keep.
- **Needs you:** amber lights, the panel shows the question and Allow / Don't allow with full contrast.
- Drop "not checked yet" while a review is pending.
- Never draw over an app that isn't the one being helped.

### 3.14 Screen edge dock

- Visor 44px with the six states from 2.1. Working and Needs you must look different without the badge: sweep versus amber plus lean.
- The "1" badge stays, amber, for count only.
- Problem is a flat red bar, never a closed eyes face.

### 3.15 More ways to ask

It opens downward, pushing content, as a short menu: jobs on top (Fix it, Where was I, Explain this error, Show me how, Make something new), and per task options below a divider ("Off the record", "Make it in a new folder"). It never covers the ask box.

---

## 4. Micro interactions and delight

Motion tokens (one curve everywhere, as Supabase and Browser Use do):

```
--ease:        cubic-bezier(.22, 1, .36, 1)
--t-press:     100ms   (button press, scale .98, translateY 1px)
--t-fast:      120ms   (hover, pill colour, blink)
--t-base:      180ms   (cards in or out, row expand)
--t-panel:     240ms   (notch panel, sheet, Visor lean)
--t-sweep:     900ms   linear, loop (Working)
```

Animate only `transform` and `opacity`. Respect Reduce Motion everywhere. Any autoplay loop has a visible Pause.

| Moment | What happens | Values |
|---|---|---|
| Button press | Scale 0.98, bottom edge from 2px to 1px | 100ms |
| Card appears | Fade plus 6px rise | 180ms, stagger 40ms |
| Chip turns ("CHECKING" to "PROVEN") | Crossfade the label, tint to ok | 180ms, in sync with the Visor smile |
| Keep a fix | The receipt folds up into the Last fix card (scale 0.96, fade) | 240ms |
| Undo | Visor reverse sweep, card slides back, a toast: "Undone. Your files are back to 2:14 pm." | 300ms sweep, toast 4 s |
| Pointed line | The failing line's tint fades in, then the arrow slides 8px in from the right | 180ms plus 120ms |
| Voice | The transcript types into the ask box while the Visor shows a waveform | 60ms per level |
| Ask box focus | 1px accent ring plus a soft 0 0 0 4px accent/0.10 glow | 120ms |
| Notch hello | Drop, blink, sweep, line, fold | 2.4 s total, once |
| Live counter | "3 of 4 checks passed" in tabular numbers | Update per step, no tween |

Sound: one muted chime on Proven, off by default, with a volume control. Nothing on errors.

Easter eggs, small and true (PostHog): the Visor does a double blink if you press the hotkey twice quickly; the About page shows the Visor at large size, slowly sweeping, with the version. No kaomoji, no memes.

---

## 5. Copy rewrites (plain words)

| Where | Now | New |
|---|---|---|
| Home hero at rest | "Not checked yet / In my-shop" | "my-shop checked out fine. / Proven 2 hours ago. 3 files changed since." |
| Home hint | "Type a small task in the box above, then press Return." plus "Or tell me what's wrong" | Placeholder only: "What are you stuck on?" |
| Approval header | "Your answer goes just below" / "Install something?" | "Squibby needs your OK to add a tool." |
| Approval body | "npm install zod" | "Adds a small tool that checks form input. The fix needs it." (command behind "Show the command") |
| Review headline (Friendly) | "Fix this first / 4 files changed" | "Your payment key is written into the code. / Anyone who sees the code can copy it and spend your money." |
| Review reassurance | none | "Squibby moves the key to a safe settings file and checks the site still works. You can undo it." |
| Failing | names the wrong check | "The sign up page shows an error. / Line 17 in signup.test.js expected a thank you message." |
| Proven | "Fixed and proven / Fix the sign up button" | "Sign up button fixed. / Checked in a browser in 4 seconds." |
| Undo toast | "Undone" | "Undone. Your files are back to 2:14 pm." |
| No Claude | two "Get Claude" buttons and "Add your key" | "1 Get Claude · 2 Add your key · 3 Pick a project" |
| History empty | "Ask for a first fix" | "Nothing here yet. Your first fix will show up here with its proof." / "Start practice" |
| Memory empty | "Nothing yet." twice | "Squibby fills this in as you work. Every line can be forgotten." |
| Memory buttons | "Erase all" twice | "Erase my-shop notes", "Erase notes about you" |
| Learn empty lessons | "No lessons yet / Close" | "Lessons appear when Squibby spots something in your project." |
| Settings count | "More General options (56)" | "Show all options" |
| Character | "Match look / Glass orb / Friendly", "Flowflow" | "Visor" plus "Light colour" |
| Second Look | "Second Look" | "Check another AI's answer" |
| About | "Version . Updates are not set up in this build yet." | "Squibby 0.9.2 · Beta channel · Up to date" |
| First run trust | none | "Squibby only looks when you press the key. Nothing is saved." |
| Help link | various | "Talk to a human" |

Voice: 2 to 6 word outcomes, one sentence of why, one proof line in mono. Light wit only where the stakes are low ("Back where you left off."). Never on errors, money or keys. No "friend", no praise, no "Welcome back".

---

## 6. Ranked build list (biggest felt change first)

1. **Ship the Visor as the default character** with the seven light states (2.1), across Home, review card, dock and notch. Retire Flowflow and the plain ball from user facing UI. Why first: the product has no face today, and every other screen hangs off it.
2. **Make Instrument the real default and fix the palette leak.** Tokens from 1.2 in one file; the colourful look changes only the backdrop, accent and Visor lights (1.3). Learn and practice stop switching palettes. Settings says plainly which look is the default.
3. **Home at rest never empty** (3.1, 3.2): two tone hero driven by the latest state, Last fix card with before and after and Undo, Since then rows, the practice project for new users. Fixes the "Not checked yet" next to "proven 2 hours ago" contradiction.
4. **One layout grammar:** ask box pinned at the bottom in tall and wide, Settings always last, status in the top bar in every look. Fix "More ways to ask" covering the hero (3.15).
5. **Review card rewrite** (3.3): plain words headline, the pointed line with "Squibby is pointing here", one button shape for Fix it / Copy for my AI / Keep it anyway, reassurance under the buttons, findings as one line cards.
6. **Fix it run list and receipt** (3.4): verb first step rows, the proven receipt replaces the Checking card in place, failing leads with the pointed line and names the right step. Confirm the stale Checking card on a real run first.
7. **Motion and button tokens** (section 4, 1.6): one curve, key style buttons with press, the chip flip in sync with the Visor smile, the Keep fold and the Undo reverse sweep.
8. **Notch and dock** (3.13, 3.14): the visor band as the notch status, the mini receipt panel with keyboard hints, distinct Working versus Needs you, readable contrast for Allow.
9. **First run with content** (3.10): promise ticks, the 10 second loop, the visual key guide with live check and cost line, the practice path, ending in the notch hello. "Replay the welcome tour" in Settings.
10. **Copy pass** (section 5) across every screen, plus approval rewrite (3.12) and the setup checklist (3.11).
11. **Settings trim and finish** (3.9): 5 visible rows per page, no counts, real About, no empty groups, renamed internal names, one main key in all onboarding copy.
12. **History, Memory and Learn polish** (3.6 to 3.8): grouped by day with thumbnails, named erase buttons, course path, real empty states.

Items 1 to 5 are most of the felt change: a real face, a calm consistent look, a full and honest Home, and a review card a beginner can act on.
