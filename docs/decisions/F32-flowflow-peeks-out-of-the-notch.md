# F32. Flowflow peeks out of the notch

- **Status:** Founder decision, 14 Nov 2026 (asked and answered in the build chat). Amends F28's update of 4 Nov 2026 (founder, later), which made the notch the bare notch at rest. Not to be reopened without the founder.
- **Date:** 2026-11-14
- **Related:** F18 (Home in the notch), F27 (Flowflow is clear glass water), F28 (the notch is bare at rest; its updates of 4 Nov), M70, M83, M84, M90

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

## Revisit only if
People on real Macs find it distracting at work, or read it as a glitch; then the usual may change, the switch stays.
