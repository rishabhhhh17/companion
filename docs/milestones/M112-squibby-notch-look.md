# M112: Squibby's own look: life from elsewhere

Status: designed and built 17 Nov 2026. Not committed. Nothing was spent on a real model: stand ins and fixtures only. Every suite passes (counts at the foot). The real app was built and opened; opening the notch on the real notch by click, by the ask key and by typing still needs a person's pointer and keys (the [verify] list).

## The founder's words

16 Nov 2026, on the M96 notch: "It's the best thing you've done till now", but "the notch feels a lot like HeyClicky... we just need to change up the colors and things... You can do anything that you want now with it, and just don't make it feel too much like HeyClicky."

16 Nov 2026, with a shot of the Home panel: "these colours and icons... I want the theme of ours to be like extraterrestrial life organisms... if we can do something according to our theme."

Also 16 Nov 2026: "It should not be very imposing, but that's the main theme that we should follow." And: "Every other character will give you a different type of home screen... just the colours and everything, a little bit of design... Flowflow would have one design, and then another one, and another one."

So the theme is an undertone. The person's work (the review, the checks, the code) stays the loudest thing on every screen. Life from elsewhere lives in the palette, the icon set, the glow on the one thing to press, the small details and the empty states. And the look belongs to the character: a habitat per character.

## First: the glitch the founder saw (16 Nov 2026)

The opened notch showed two panels at once: the small chat, and under it, cut off by the window's edge, Home's own ask box ("What are you stuck on?") with its project chip half clipped. Separately, Flowflow's word beside it ("Looking at yo...") was cut off by its own window.

**Reproduced** with the pages served from `app/dist` and a stand in for the app, with Home's tall layout (`look.layout` tall, the founder's). The usual wide layout hid it, which is why the M96 shots never showed it.

**Causes:**

1. `ui/system.css` shows the tall Home's work column with `.home:not([data-side]):not([data-view="settings"]) .work:has(> .askwrap) { display: flex }`, specificity 0,5,0. The chat's hide rule, `.home[data-chat] > .inner > :not(.notch-chat) { display: none }`, is 0,4,0. So all of Home was laid out under the chat. Home's `main` scrolls, so a scroll or a focus brought its ask box into view (shot: `before/3j-chat-scrolled.png`; with this data even unscrolled, `before/3a-chat.png` in the comparison).
2. The build's CSS minifier drops `translate` from a rule that also sets `transform`. The character's word kept `left: 50%` with no `-50%`, so it hung half its width to the right and was cut by the 160 point window (measured: its left edge at the window's centre).

**Fixes:**

- The hide rule is `!important`, and Home itself is `overflow: clip` while the chat shows, so nothing under it can be scrolled into view. Opening the chat also sets Home's scroll to the top.
- The word under the character is placed with one `transform: translateX(-50%)`, and never wider than its window (`max-width: min(150px, 100vw - 2 spaces)`), so a long word wraps inside it.
- A long project name is cut at a word with an ellipsis (`notchChat.ts` `CHAT_NAME_MAX`, 28 letters) in the chat's top row and in the field's hint, never two ellipses.
- The island's row already stops drawing once Home's shape covers it, so exactly one panel shows.

**Tests first:** `app/src/m112Glitch.test.ts` (the hide rule beats every other rule, Home never scrolls under the chat, no rule mixes `translate` and `transform`, the word is centred and bounded, long names) and `app/dom/m112.test.tsx` (the chat opens at the top of a scrolled Home). Both failed before the fix.

## Step 1: three directions

Mocks in the session scratch folder (not in the repo): `m112/direction-a.png`, `direction-b.png`, `direction-c.png`, side by side in `m112/directions.png`. Each shows the notch at rest, pointing (nothing waits; changes to review), the opened chat, and the Home Now page from the founder's shot.

| | A. Deep sea glow | B. Cells under a microscope | C. A calm alien greenhouse |
|---|---|---|---|
| Idea | Bioluminescence in the deep: one cyan teal glow on black, membranes of light, photophore dots | A slide under the lens: chartreuse chlorophyll, double membranes, every container a cell | Night in a glass house of strange plants: jade glow, tendrils, warm spore light |
| Fits the theme | Yes: the deep sea is where life looks most alien, and Flowflow is a water organism | Yes, literally | Partly: plants read more garden than alien |
| Not HeyClicky or a known product | Yes: no lavender, no gradient pill, no grid | Yes | Yes |
| Calm and premium | Yes: black stays black, one glow | Busier: the lime is loud on black | Calm |
| Colour carries meaning | Best: cyan teal is far from proven green, review amber and risk red | Weak: the chartreuse accent sits next to proven green | Weak: jade accent and proven green are neighbours |
| Reduce Motion, Reduce Transparency, Increase Contrast | All three hold: one glow to drop, edges become solid | Same | Same |
| Motion | A photophore breathing, opacity only | Same | Same |

**Picked: A, deep sea glow.** It is the only one where the accent never competes with a meaning colour, it continues Flowflow's own water, and it keeps the black calm. Grafted from the others: B's living cell as the Now glyph (a membrane with a nucleus) and its round cells for tiles; C's quiet spore marks for the empty states.

## Step 2: what was built

### The habitat (per character)

- `app/src/habitat.ts`: the typed `Habitat` (its id, its character, its glyph switches, its empty state art, its notch details), `HABITAT_TOKENS` (the tokens every habitat fills, each one read by the page: habitat.test.ts), `habitatFor` (the chooser: a character with none lives in Flowflow's), `applyHabitat` (puts `data-habitat` and its switches on a page's root), `useHabitat`, and the WCAG contrast helpers.
- `app/src/ui/tokens.css`: Flowflow's block `:root[data-habitat="flowflow"]` (only `--hab-` tokens), then one shared block `:root[data-habitat]` that maps the page's own tokens (`--acc`, `--ok`, `--amber`, `--bad`, `--water`, the surfaces and words, the `--c-*` colours, the chat and the tuck tokens) from whichever habitat is on the root. Increase Contrast strengthens words and edges; Reduce Transparency drops every glow and makes edges solid.
- Every page puts the habitat on its root through `useLook.ts` (before the first frame, then kept in step). No page and no other stylesheet names a habitat.
- One habitat ships, Flowflow's. No other character was invented (the founder supplies and approves every character's art).

**Flowflow's palette** (deep sea glow): black; cards `#0A1214`, raised `#101B1E`, pressed `#172429`; words `#EAF5F3`, `#A3B5B3`, `#8A9C9A`; the one glow cyan teal `#3DDCCB` (words in it `#7FEDE1`, dark ink on it `#022120`); proven organism green `#7BE08F`; to review amber spore `#F2B23E`; a risk deep red `#FF5D66`; working Flowflow's own blue `#5CB8FF`; listening a soft orchid `#E59CFF`. No meaning is ever the accent: blue (`--c-blue`) is working and teal (`--c-teal`) is listening under the habitat, the working ring reads `--hab-working`, and the places take the accent itself (`data-c="accent"`, `meaning.ts` `PartColour`), never a meaning's name (habitat.test.ts, "the accent is never a meaning"). Every word is 4.5 to 1 or more on black and on every surface, every mark 3 to 1 or more (habitat.test.ts, and a11y.test.ts now measures every theme with the habitat on).

### How to add a character's habitat

1. The founder supplies and approves the character's art (no character is invented).
2. In `app/src/habitat.ts`, add one `Habitat` entry to `HABITATS`: its `id`, the `character` id from `companion.ts`, its glyph switch (`nucleus`: filled or an outline, read by `style.css`), its empty art and its notch details (`photophore`: the pill's own light, read by `ui/notch.css`; `breathe`).
3. In `app/src/ui/tokens.css`, add one block `:root[data-habitat="<id>"] { ... }` that sets every token in `HABITAT_TOKENS`, and nothing else.
4. Run `bun test src/habitat.test.ts`: it fails until the block fills every token and every word, mark and fill meets WCAG AA.
5. Nothing else changes: the notch, Home, the cards, Settings and the bubbles read the tokens. The test only habitat in `habitat.test.ts` and `dom/m112.test.tsx` proves it.

### The notch

- At rest: unchanged, nothing drawn.
- Pointing: the same row, greeting and one action (same states and words as M96). When nothing waits, the pill is the accent, filled, with dark words, exactly like Home's main button, and a small dark nucleus at its left that breathes (opacity only, every 4.8 s, never with Reduce Motion). When something waits it is a dark membrane with a hairline rim and a steady photophore in the waiting meaning's colour: amber when changes wait to be reviewed, red for a failed check or a stopped engine (its halo's blur is `--hab-light-blur`, none with Reduce Transparency). Stop stays a quiet pill with no light and no glow.
- Opened: the same small chat. Plain black (no dotted grid), bubbles as membranes with a hairline of light, the person's own bubble in the deep water's tint, the mic a dark round with a rim, the field a dark pill whose rim lights in the accent with a soft glow while it has the keys, and send in the accent once there are words to send (with the field empty it is a quiet dark circle, as Home's own send now is). The top row shows the project name up to 40 letters; its tooltip and VoiceOver have the whole name.
- Tuck hint (M111): the same row with the habitat's glow inside the notch's edge instead of lavender.

### Home, the cards, Settings and the bubbles

- The places (Now, Learn, History, Memory) are living glyphs in one stroke: a cell with its nucleus, a sprouting spore, a shell's growth spiral, a neuron (`icons.tsx`). They are lit in the accent when open, never coloured squares, and never a meaning's colour (History was orange, the colour of something to review).
- Tags are sentence case ("Practice ready", "A check failed"): a glowing meaning dot and the words in the meaning's colour, no all caps and no pill.
- The main button is the accent with dark words, a faint light along its top and a soft glow: the one thing to press.
- Cards are membranes: their own step of near black with a hairline of the habitat's light.
- Tiles in lists and the Settings sidebar are round cells: a deep wash of their hue with the drawing in the habitat's light.
- Switches that are on take the accent, deepened so the white knob reads on it.
- Empty lists show three small photophores (`spores`); History's empty row shows the spiral.
- Every drawing uses the habitat's stroke (`--hab-glyph-stroke`).
- The character's speech bubble takes the habitat's surface.

### Words

All words stay in `strings.ts`. Changed: the chat's hint and invite never add a second ellipsis or a full stop after a shortened name.

## Compared with the best

The founder, 17 Nov 2026: "always compare yourself to HeyClicky or CodeRabbit so we are up to them on the UI and UX side, and also functionality, and how easy they are to use". The job this milestone touches: see what matters from the notch, act on it, and read Home at a glance. Sources: the research notes of 15 Nov 2026 (HeyClicky's changelog and site, CodeRabbit's docs) and the founder's note on Coucou (github.com/Louis-CFM/coucou, 17 Nov 2026). We copy what works, never their names, characters, sounds or look.

| | HeyClicky (notch companion) | Coucou (notch agent watcher) | CodeRabbit (code review) | Squibby after M112 |
|---|---|---|---|---|
| At rest | The notch only (since 20 Jun) | Hides when idle | Not on the desktop | Nothing drawn: match |
| Steps to act on what matters | Point, a peek of suggestions, pins and agents, then "Expand Home" | One press on Allow, Deny or Always in the notch | One click to commit a suggestion in the PR | Point, then one press on the one action that fits now ("2 changes to review", "Fix it", "Check my project"): one step, like Coucou |
| How fast it shows | Not stated | Not stated | Local reviews 7 to 30+ minutes (its own doc) | The row after 0.3 s of pointing (Settings, 0.1 to 1.5 s), one 220 ms move; the chat opens from history already on the Mac, no model call |
| Words | Short, friendly | Agent and file names | Critical, Warning, Info, written for developers | Plain sentences, a meaning always said in words and never by colour alone ("A check failed", "Practice ready"): better for non engineers |
| Colour | Lavender to blue, its own look | Its own look | Severity colours | Black, one cyan teal glow on the one thing to press, green proven, amber review, red risk, blue working: its own look, and colour carries meaning |
| Motion | Haptic on hover (28 Jun) | Not checked | None | Short springs, one slow breathing light at most, still with Reduce Motion; haptics a setting (island.haptics, off by default): match |
| Can be turned down | The peek can be turned off | Not checked | Quiet mode | Pointing can be turned off (island.peekOnHover), and the delays and the small chat are settings: match |
| Accessibility | Not stated | Not stated | Not stated | WCAG AA for every word and mark in every habitat (tested), Increase Contrast, Reduce Transparency, Reduce Motion: better |

**Where we match:** a bare notch at rest, a small peek on pointing that can be turned off, haptics, a chat out of the notch.

**Where we are better:** fewer steps than HeyClicky's peek (the one action is in the row itself), plain words where CodeRabbit uses developer severity labels, "done" only when proven (the chat's bubbles say "the checks pass" or "not checked yet"), a look that belongs to the character, and contrast and the Mac's accessibility settings tested rather than hoped for.

**Gap closed in this milestone:** both HeyClicky and CodeRabbit keep one colour for "press this". Ours did not: a row's own action took its row's hue, so "Start practice" read lavender (the colour the founder asked to drop) and "Undo these changes" orange (the colour of something to review) beside the cyan main button. Now every row action under a habitat takes the accent's words and fill (`--row-act-fg`, `--row-act-soft` in the shared habitat map; `ui/parts.css`), and tags and facts keep their meaning colour. Tests first: `habitat.test.ts`, "one colour for every action under a habitat" (3; failed before the fix). Shots: `after/4a-home-now.png`, `after/4d-home-history.png`.

**Gap closed in the M112 review:** the notch's one action was a dark pill with a faint rim, while the same action in Home is a filled button, so in the notch it read as a status chip. Now the notch says "press this" the same way Home does: the accent, filled, when nothing waits. The dark pill with an amber or red light is kept only for "something waits for you" (review, a failed check), which is a different message. Shots: `review/2b-check.png`, `review/2a-changes.png`, `review/2h-failed.png`.

**Gaps listed for later (they do not fit a look milestone):**
- Coucou shows each agent's live reads, edits and runs with +N and minus M lines per file, answers Allow, Deny or Always from the notch, and jumps to the session's terminal. Squibby's row names one thing to do; per file lines and approvals in the row belong to the notch agent watcher work in the build queue.
- HeyClicky lets you drag an agent's newest files out of the peek. Not planned.
- HeyClicky follows the system's light or dark. Squibby stays black on purpose (the founder's one black look, M71); not a gap to close.
- Starter asks in the empty small chat. Home's ask chips come only from facts Squibby holds and are never invented, so with nothing known there would be none; the empty chat's next step is its field, named for the project.
- How fast the chat opens on the real notch is not measured yet ([verify] below).

## Decision record

`docs/decisions/F32-flowflow-peeks-out-of-the-notch.md` has an update of 17 Nov 2026 (the look changed, and why). `docs/milestones/M96-heyclicky-notch.md` points here.

## Tests

- New: `app/src/m112Glitch.test.ts` (6), `app/src/habitat.test.ts` (17, plus 3 for one action colour from the comparison: the chooser, every habitat fills every token, contrast of each habitat including the test only one, switching at run time, no page names a habitat), `app/dom/m112.test.tsx` (4).
- From the review of 17 Nov 2026 (each written failing first): `habitat.test.ts` measures Calm with the habitat on (every tile is the accent's dark wash, the light mark on it is 3 to 1 or more, and Calm never remaps the waiting meanings); `m96Notch.test.ts` holds the pill's waiting light on `--amber` and `--bad`, which Calm leaves alone, and holds that no orange or red pill breathes, with the Reduce Motion rule naming the same pills; `system.test.ts` holds that the status tag, the meaning tag and the eyebrow share one type (caption, strong).
- **Old expectations changed on purpose** (the product changed): `m96Notch.test.ts` (the lavender tests became the habitat's: no lavender, gradient or grid; the pill, bubble, mic, field and send read the habitat), `ui/styleLint.test.ts` (the glow is on exactly the pill, send and the field with the keys; no gradient; no upper case anywhere), `system.test.ts` (no tag is upper case), `meaning.test.ts` (the places are lit in the accent with their glyphs), `pages.test.ts` and `auditSecondHalf.test.ts` (History's empty row shows the spiral), `a11y.test.ts` (every theme is measured with the habitat on, as the page draws it).

## Shots

Session scratch folder `m112/` (not committed), all at 2x. Every after shot, the three sheets and `built-vs-before.png` were retaken on 17 Nov 2026 from `app/dist` rebuilt from the final sources (after the review fixes), and checked against the code: 3f has one ellipsis, History, Memory and the wide sidebar are lit in the one accent, and the Settings switches are the accent.
- `before/` and `after/`: `1-rest`; the row `2a-changes`, `2b-check` (nothing waits), `2c-undo`, `2d-job` (Stop), `2e-engine-off`, `2f-no-name`, `2g-long-name`, `2h-failed`, `2i-no-project`, `2j-check-hover`, `2k-tuck-take` (the M111 tuck hint), `2l-tucked-said`; the chat `3a-chat`, `3b-chat-ask-key`, `3c-chat-empty`, `3d-chat-working`, `3e-chat-failed`, `3f-chat-long-project`, `3g-chat-no-project`, `3h-chat-typed`, `3i-chat-no-name`, `3j-chat-scrolled` (the glitch); Home `4a-home-now`, `4b-home-now-review`, `4c-home-learn`, `4d-home-history`, `4e-home-memory`, `4f-home-settings`, `4g-home-now-wide`, `4h-home-now-empty`; `5a-dock-label`; Calm colours with the habitat `6a-calm-changes`, `6b-calm-failed` (the waiting lights stay amber and red), `6c-calm-check` (the accent), `6d-calm-home-now`, `6e-calm-home-wide` (every tile the dark wash).
- `built-vs-before.png`: the old look beside the new for the notch states, the chat (the glitch included) and Home Now.
- `directions.png`: the three directions.

## [verify] on a real Mac

Also in `docs/research/technical_research.md` section 20, item 48.
- Time from pointing at the notch to the row, and from a click to the chat, on the real notch (the comparison's speed line).
- Open the notch by a click, by the ask key and by typing (through the ask key), with a project and without, in the tall Home: exactly one panel shows, nothing is cut by a window's edge.
- The character's word ("Looking at your screen") sits centred under it and inside its window on both edges.
- The photophore's breathing reads as calm, not as a blinking light, on the real notch; with Reduce Motion it is still.
- The cyan teal and the meaning colours on a real display with Increase Contrast and Reduce Transparency on.
- WebKit honours `overflow: clip` on Home while the chat shows (a focus into the chat's field never scrolls it).

## Test counts

17 Nov 2026, after the comparison with the best (one action colour):
- Pages: `bun test ./src` 4316 pass, 0 fail; `bun run test:dom` 161 pass, 0 fail; `bun run typecheck` clean; `bun --bun vite build` builds.
- Runner: 5883 pass, 3 skip, 0 fail (all 289 files, with the runner's own `--timeout 30000`, run in foreground batches of about 25 files: a run in the background was slowed so much that tests timed out, and a file that failed that way passed in 7.5 s in the foreground). `bunx tsc --noEmit -p .` clean. No runner file changed in M112.
- Rust: `cargo test` 1394 pass, 0 fail, 8 ignored. No Rust file changed in M112.
- The real app: `build-app.sh` built and signed it, `reopen-app.sh` opened it and it stayed running.
