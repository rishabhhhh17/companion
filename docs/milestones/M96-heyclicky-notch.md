# M96: The notch, HeyClicky style: small, then it opens out

Status: built 15 Nov 2026, tests pass. Committed 15 Nov 2026 (6150338). Nothing was spent on a real model: fixtures and stand ins only.

## The founder's feedback

15 Nov 2026, on the real M93 hover (a wide black panel under the notch: a tiny Flowflow, "Hey there", a Check my project button with a green check box icon, Open Home far right, lots of empty black):

> "I don't like how it looks, just see how HeyClicky does it"

and then

> "it starts small and then when we go to settings then it opens up"

A mock of three states was made (scratch `hovermock/mock.png`, not in the repo) and the founder approved it ("yeah"). Recorded in F32 (update of 15 Nov 2026).

## What it does now

1. **At rest.** Only the hardware notch, nothing drawn. The M90 peek still slides out from the side only when there is news.
2. **Pointing at the notch.** The black grows out of the notch itself, the same black, no gap, no border, bottom corners 20, 330 wide and one 42 point row below the notch: Flowflow's live face (24), a lowercase **hey rishabh** (13.5 point medium, white at 92%; **hey there** with no name), and at the right **one glowing pill**: lavender blue (#DFE8FF to #A9C1FF), navy words, an inner white hairline and a soft blue glow. Its words are the moment's one action:

| State | Pill |
|---|---|
| A job runs | Stop (sends the stop, as before): a quiet dark pill with no glow, so the safety action never looks like the others. Every pill steps a touch deeper under the pointer |
| Engine stopped | See why |
| Claude not set up | Open Home |
| A question waits | Answer, with a small dot |
| Claude Code waits here | See what Claude asks, with a small dot |
| No project | Pick a project |
| Changes to review | "2 changes to review", with a small dot |
| A check failed | Fix it |
| Not checked, or changed since | Check my project |
| The last fix can be undone | Undo last change (asks Home's own Undo question); with the Undo tool off, Check my project |
| Nothing waits | Check my project |

   No line row, no Open Home words, no icon in the pill, no check boxes. The line M93 drew is still decided: it is what VoiceOver hears for the row and the pill's tooltip. The row arrives on one short move (220 ms, `--dur-notch-row`); with Reduce Motion only a fade.
3. **Opened.** A click on the face or the hello (`island_chat`), or the ask key, opens Home as a **small chat** out of the notch: 460 wide, 266 under the notch (about 300 with the notch's row), one shape as wide at the menu bar row as below it, on a faint dotted grid. A top row (Flowflow, hey <name>, a round **Settings** button and a round **Open all of Home** button, both SVG drawings), the recent news as bubbles (Squibby's dark grey with the tail bottom left, the person's in the same lavender with navy words, bottom right), a small "Today 6:45 pm" line, and at the foot a round lavender **mic** and the pill shaped **Ask Squibby…** field with its lavender outline, glow and round send button.
   - The field **is Home's one ask box** while the chat shows (`card.tsx` `box` reads whichever field shows), so Return asks exactly as Home does (the same refusals, the vague ask choices, a project to pick), voice words land in it, the warm up and the character's eyes follow it, and words typed move across when it opens out.
   - Anything that needs a card of its own (a question to allow, a plan, a stuck fix, a pause, a sign in, a lesson, the vague ask's choices, which folder, the hand off, the first run) opens the chat out to all of Home at once (`chatHolds`), so nothing waits where it cannot be seen. So does what only Home draws: hold to talk's panel (listening, a model to download, the microphone refused), a notice or an error that arrives while the chat shows (so a Return is never silent), files attached or dropped, and a new result with its receipt, Undo and See proof.
   - The task at work stays in the chat, with its own quiet **Stop** in the top row (Home's own stop).
   - The top row names the project an ask goes to, beside the hello, and the field says "Ask about <project>…".
   - Squibby's answers say what the proof says (rule 14): "Done, and the checks pass" only when they passed; otherwise "Finished. Some checks passed and some did not run.", "Finished, but the checks did not pass." or "Finished, not checked yet." Never a bare "Done.".
   - The bubbles that point somewhere are buttons that open out to that place: the changes to review (to the review), Claude Code waiting and a failed check (to Now, where its question and Home's own Fix it are). A press only opens out; it never starts anything.
   - One bubble alone (the invite, or one piece of news) sits in the middle of the chat, never pinned under an empty band.
   - **Settings** and **Open all of Home** open it out in place (`home_expand`): the founder's "when we go to settings then it opens up".
   - **A click elsewhere** folds it back (Home's own close), and so does **Esc** once the person has clicked into the chat (Esc before that is a [verify] item below); a chat opened by a click is the person's, so the pointer leaving never folds it. **Stop everything** closes it at once, and the island goes back to the bare notch.

## Focus (rule 9)

- At rest and while pointing nothing can take the keys: the island is a plain non activating panel that can never become key, and the row never calls focus.
- The greeting's click opens the chat **without** the keyboard. The chat's field takes the keys only when the person clicks into it: Home's panel answers `canBecomeKeyWindow` through `home_may_key()` (`main.rs`), which asks `island::home_can_key(on_shape, by_key)` (`island.rs`), unchanged. Until then Home is not key, so the page's own Esc does not hear a key press. The ask key opens it **with** the keyboard, as the ask key always did, and the field is ready.

## The mic (rule 5)

The round mic is the existing one: a click never opens the microphone. Its own name says the keys ("Hold ⌃⌥ to talk"), and a press says them again as a bubble that stays while the person types, until hold to talk is used or the chat closes; holding them runs the existing voice path with its light first, and the words land in the chat's field.

## Typing without the key

The task said "starting to type opens it". The panel cannot see typing while it is not key, and nothing ever reads key events (rule 8, no Input Monitoring), so typing opens it only through the ask key. Said plainly here; not built otherwise.

## Settings

**Open a small chat first** (`island.smallChat`, on), General, More options, Notch. Off: the greeting and the ask key open Home at its full size, as before. Registry, words, page and registry test.

## Where everything went (nothing lost)

| Was in the M93 hover | Now |
|---|---|
| The greeting | The row, lowercase |
| The one line | The row's VoiceOver name and the pill's tooltip; the facts are also the chat's bubbles and Home |
| The one action | The pill |
| Open Home | The chat's Open all of Home, and a click on the notch's own row (as always) |
| Stop | The pill while a job runs |

## Code

- `app/src/notchMinimal.ts`: lowercase `hoverGreeting`, `hoverPill` (words and dot), Undo last change, `HOVER_W` 330 and `HOVER_H` 42; Ask left the pill (asking is the chat); `hoverSecondary` and the two row heights removed.
- `app/src/notchChat.ts` (new): `notchView`, `notchNext` (which state shows when), `takesKeys`, `chatBubbles`, `outcome`, `chatWhen`, `chatHolds`, `CHAT`.
- `app/src/notchChat.tsx` (new): the chat. `app/src/card.tsx`: chat mode (`data-chat`), `box` reading the field in use, opening out.
- `app/src/islandPanel.tsx`: the one row. `app/src/island.tsx`: tells the shell the panel's width (`panelW`).
- `app/src-tauri/src/island.rs`: `PANEL_W_MIN`, `panel_w`, `look_sized`, `State.pw`, PANEL_MIN 40, PANEL_R_NOTCH 20, `HomeSize::CHAT`, `size_in_force`, `opens_small`, the chat's band and body in `home_panel`, the ask key instant in `animates_open`.
- `app/src-tauri/src/main.rs`: `CHAT_OPEN`, `chat_can_grow`, `island_chat`, `home_expand`, the ask key's source `ask_key`, the `chat` flag in "opened", cleared in `home_closed`. `protocol/groups.json`: both commands are the ask box's.
- `app/src/ui/tokens.css`: `--lav-*`, `--notch-wait`, `--chat-*`, `--dur-notch-row`. `ui/notch.css`: the row. `ui/black.css`: the chat. `style.css`: the corner 20. `icons.tsx`: `expand`.
- `app/src/strings.ts`: `S.m96`, the setting's words.

## Tests

- `app/src/m96Notch.test.ts` (59; the M96 review added: only proof says done, the bubbles that point somewhere, the field names the project, what the chat cannot show opens it out, Undo last change follows the Undo tool's switch): the name (blank, one word, full name, odd characters, very long), the pill in every state with its words and dot, which state shows when (rest, pointing, opened, Esc, a click outside, Stop everything hides all, the setting off), the keys never taken at rest or pointing, the sizes on both sides, the motion token and Reduce Motion, the bubbles, the time line, opening out, the tokens, the lavender only on its four parts, no lime, words in strings.ts, real SVG icons.
- `app/dom/m96Notch.test.tsx` (13): the chat in Home, no focus from a click and focus from the ask key, Return asks through the one path, expand and Settings open out keeping the words, Esc, a question opens it out, the project named, the chat's Stop sends the interrupt, a new result opens out, hold to talk's panel and a notice open out, the mic's keys and its hint kept while typing, the changes bubble opens out to the review.
- `island.rs` `m96_tests` (3): the row's frame and width limits, the chat's size, band and body in the same window, and the shell wiring (keyboard never from the greeting, the size set before Home is placed, closed and Stop forget it).
- `runner/test/settings-registry.test.ts`: `island.smallChat`.
- **Old expectations changed on purpose** (the product changed): `m93Hover.test.ts` (lowercase greeting, the pill's labels, all fine is Check my project, no Open Home, one 42 point row), `islandPanel.test.ts`, `notchQuick.test.ts`, `m83Notch.test.ts` (the row's selectors, `island_chat` in place of Open Home, 42 by 330), `island.test.ts`, `islandPanel.test.ts`, `liveProgress.test.ts`, `notchHello.test.ts` (`island_alert` also sends `panelW`; the hello compares lowercase), `hotkeys.test.ts` (the ask key's source), `followup.test.ts` (the closed listener also forgets the chat), `skins.test.ts` (the lavender and chat tokens are named), `ui/styleLint.test.ts` (the M71 gradient and glow rule names exactly the four M96 parts, with a test that holds the count), `dom/hoverPanel.test.tsx`, `dom/m93Hover.test.tsx`, `dom/m86.test.tsx` (the row in place of the two rows), `island.rs` (the `home_size` pin, PANEL_R_NOTCH 20, the `look_sized` pin, the ask key instant).

## What differs from the mock

- The chat's bottom corners are 24, Home's own shape (the mock says about 26).
- Home's shape keeps its small concave shoulders where it meets the menu bar row; the mock's sides are straight.
- The time line uses Squibby's one clock style ("6:45 pm", lowercase), not "2:41 PM".
- The chat shows the newest three bubbles under the time line, so they fit at the usual text size; older ones are in History.
- The grow and tuck of the island's black use the notch's existing springs (`islandSpring.ts`); the new 220 ms token is the row's and the bubbles' own arrival. Reduce Motion: a fade.
- Settings uses the app's own settings drawing (sliders), not a gear.

## [verify] on a real Mac

Also in `docs/research/technical_research.md` section 20, item 41.
- The 330 point row grows out of the real notch with no gap and no jump on 14 and 16 inch MacBook Pros, and never takes focus.
- The small chat grows from that row and folds back on a click elsewhere, and on Esc after a click into it; clicking into its field makes Home key and typing works; the ask key focuses it at once.
- Esc folds a chat opened by a click before anything in it was clicked. Home is not key then, so the page's `onKeyDown` never hears it, and no shell Esc hold covers it (`esc.rs` holds Esc only for a result or a drawing). If it does not, the fix is a shell hold while the chat shows, not a focus grab.
- Open all of Home and Settings grow Home to its full size in place with no flash.
- The 460 point band covers the menu bar beside the notch only while the chat is open, and clicks there go to the chat.
- Hold to talk words land in the chat's field.

## Shots

Served from `app/dist` with a stand in for the app, headless Chromium at 2x, in the session's scratch folder (not committed): `m96shots/out/` (1-rest, 2a to 2g the row in each state including no name and a very long name, 3a to 3d the chat, opened by a click, by the ask key, empty, and opened out), and `m96shots/built-vs-mock.png`, the three built states on the mock's own screen. Not shot on the real notch in this step: that needs the built app running and a person's pointer on the notch.
