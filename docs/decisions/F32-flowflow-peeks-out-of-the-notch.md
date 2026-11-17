# F32. Flowflow peeks out of the notch

- **Status:** Founder decision, 14 Nov 2026 (asked and answered in the build chat). Amends F28's update of 4 Nov 2026 (founder, later), which made the notch the bare notch at rest. Not to be reopened without the founder.
- **Date:** 2026-11-14
- **Related:** F18 (Home in the notch), F27 (Flowflow is clear glass water), F28 (the notch is bare at rest; its updates of 4 Nov), M70, M83, M84, M90, M93

## Decision
- **The notch at rest is no longer bare while something goes on.** Flowflow's eyes and the top of its head peek out from the side of the notch and react to what happens. When nothing goes on, it hides, and the notch is the bare notch again.
- **What it shows.** Watching while any connected AI tool or Squibby's own job runs. (M90 review: a connected tool counts only through its guard hook, the saved copy signal, after the person's yes, and only while it runs shell commands; the copy says so, and a broader busy source would need its own yes.) Waiting on you (a gentle look and a small amber dot) when a tool waits on the person. Proud when a review's checks pass, worried when a check fails. Sleepy, then hidden, after a quiet spell. Hello once at launch.
- **When it hides.** Nothing running, nothing waiting and no fresh result for the chosen time; during presentation mode (a call in front, rule 7); while a capture or Show me how is on (rule 5); when Stop everything is pressed (rule 11); while Home or the notch's hover panel is open.
- **How you use it.** Pointing at it opens the same hover panel as the notch; clicking it opens Home. It never takes focus (rule 9) and is hidden from screen sharing when that setting is on.
- **Settings** (General, More options, Notch): on by default, left side by default, hide after 2 minutes by default.

## What changed, and why
- **What changed from 4 Nov.** On 4 Nov the founder said "I don't want Squibby to be there always, and I don't need a small little bubble type to be there" (F28, update later that day), so the rest wings and the hello went off and the notch became bare at rest. That stands for the times when nothing goes on: the peek is not there always, it hides when idle, and it is not a bubble with words. What is new is that while work goes on, or something waits on the person, the character shows at the notch's side and reacts.
- **Why.** After M84 the hover panel was useful but the notch itself still looked the same as before; the founder asked for a new resting look and picked "Flowflow peeks out" from the options offered (14 Nov 2026). It gives the notch presence when there is something worth a glance, without a status line, and keeps the bare notch when there is not.
- **The rest wings and the hello** (island.wings, island.hello) stay as they were: off by default, their switches kept.

## Notes from the build (M90)
- In words a person reads, the character is not named Flowflow (M72 item 7, `app/src/m72Words.test.ts`): Settings says "The character peeks out of the notch", and VoiceOver says what Squibby is doing. The record and the code keep the name Flowflow.
- It draws Flowflow's own water (the Draw live renderer, `app/src/flowflow/`) or, with Draw live off, the existing pictures (glance, peek, worry, sleep), whatever character is picked for Home and the edge: the founder's decision names Flowflow's eyes. No new art.
- General's main level already holds its ten settings (the settings spec, 3.4), so the three rows sit first in More options' Notch group ("What the notch shows at rest and while working"), right after what pointing at the notch opens.
- A connected tool counts as working when its guard hook sees it run a command (a new engine event, `hook.busy`, the project only); its done hook ends it, or 90 seconds with nothing new.

## Update, 14 Nov 2026 (founder, later): the hover is minimal (M93)
- **The founder, on the real app, with a shot of the M84 hover panel:** "I don't like this, it's too much for just a notch. It just needs to be like 'Hey Rishabh' and some CTA." This reverses M84's "more in the hover" direction.
- **Decision.** Pointing at the notch, or at the peeking character, opens two rows: Flowflow's live face beside "Hey" and the person's first name ("Hey there" with none), at most one short line only when it matters, then one action that fits the moment and a quiet Open Home. Nothing when all is quiet besides the hello and the action. A job running shows Stop; the engine stopped says so with its one action. The AI tools, the latest review, the usage ring, the key hint, Settings and the practice offer live in Home.
- **The name stays typed only.** F28 says the name is one the person types, never the Mac account name. The founder's words do not change that, so the hover uses the first word of Your name (`you.name`), which moved to General, More options, Notch. Reading the Mac account name would need the founder's own yes to amend F28.
- **Unchanged:** a question or a fresh result that opens the panel by itself keeps its cards; the peek, its hide rules and its settings; every press opens Home through `island_go`, except Stop.
- Built in `docs/milestones/M93-minimal-hover.md`.

## Update, 15 Nov 2026 (founder): the notch HeyClicky style, small then it opens out (M96)
- **The founder, on the real M93 hover** (a wide black panel under the notch: a tiny Flowflow, "Hey there", a Check my project button with a green check box icon, Open Home far right, lots of empty black): "I don't like how it looks, just see how HeyClicky does it", then "it starts small and then when we go to settings then it opens up". A mock of three states was made and the founder approved it ("yeah").
- **Why it changed.** M93 cut what the hover said, but kept the 560 point width it shared with the question cards, so two rows sat in a wide black panel that read as empty. HeyClicky's notch is small and grows only as far as what it holds, and opens out only when asked.
- **Decision.** At rest: only the hardware notch (the M90 peek still slides out when there is news). Pointing: one row out of the notch, about 330 wide, the same black with no gap or border: Flowflow's live face, a lowercase "hey <first name>" ("hey there" with none), and one glowing lavender pill with the moment's one action in its own words ("2 changes to review" with a small dot when something waits, "Undo last change", "Fix it", "Stop", "Check my project" when nothing waits, See why with the engine stopped). No line row, no Open Home, no icon in the pill. Opened: a click on the face or the hello, or the ask key, opens a small chat out of the notch, about 460 by 300: Settings and expand buttons, the recent news as chat bubbles, the mic and an Ask field. Settings and expand open all of Home. Esc and a click elsewhere fold it back; Stop everything hides everything.
- **The colour.** One lavender blue, only on the pill, the person's own bubble, the mic and the field's outline, with the soft glow the mock shows. The M71 rule (no gradient, no glow) keeps holding everywhere else; the lint names exactly these parts. One accent, calm black, no lime.
- **Unchanged:** the name is typed only (F28); every press opens Home through `island_go` except Stop; the question and result cards keep their 560 point panel; the panel never takes focus; the chat takes the keys only when the person clicks into it or used the ask key. A switch, Open a small chat first (`island.smallChat`, on), brings back Home at its full size.
- Built in `docs/milestones/M96-heyclicky-notch.md`.

## Revisit only if
People on real Macs find it distracting at work, or read it as a glitch; then the usual may change, the switch stays.

## Update, 16 Nov 2026 (founder): tucked into the notch (M111)
- The character can now live in the notch (F18 update of 16 Nov 2026). The peek out from the notch side keeps its own setting (`notch.peek`) and rules, unchanged, whether the character is tucked or not.
- The notch's hover row and the small chat show the character's face; while tucked, that face can be dragged out onto the screen, and the chat has one small Bring out button beside Settings. A click on the face still opens the chat.
- Built in `docs/milestones/M111-tuck-into-notch.md`.

## Update, 17 Nov 2026 (founder, 16 Nov): the notch's look is Squibby's own (M112)
- The founder liked the M96 notch ("the best thing you've done till now") but said it "feels a lot like HeyClicky": change the colours and things, and "don't make it feel too much like HeyClicky".
- The behaviour, states, focus rules and sizes of M96 are unchanged. The look changed: the lavender to blue gradient pill, the lavender glow on the field, the lavender bubbles and the dotted grid are gone. The notch and the small chat now take the character's habitat (Flowflow's: deep sea glow, a cyan teal glow on black with membranes of light and a small photophore in the pill), the founder's theme of life from elsewhere as an undertone.
- Also fixed: the opened notch could show the small chat and Home's ask box at once in the tall Home.
- Built in `docs/milestones/M112-squibby-notch-look.md`.
