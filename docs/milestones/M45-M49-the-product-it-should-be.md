# M45 to M49: the product it should be

From the executive review (`docs/design/2026-10-30-executive-review.md`, section 10) and the founder's answers recorded in F28. Smallest first. Each milestone ends with the full suite green, the app rebuilt and opened, and a line in CHANGELOG.md. Each also goes on the list for the next hands on Mac session, because nothing counts until it is seen on a real Mac.

## M45: Tell the truth
- **One verdict function** over three facts: the proof (passed, partial, failed, none), how the task ended (done, stopped, spending limit, needs you) and whether it was undone. Home's headline, the receipt, the notch, What I did and the recent list all read it. No other code decides "proven".
- **The app keeps the runner's ending** instead of dropping it, and reads the undone flag everywhere.
- **Partial names its missing check.** A zero cost says "No cost".
- **Approval cards never contradict themselves:** irreversible risks are marked not undoable in safety.ts, and the reasons are written for the person.
- **Failure and loop breaker cards** put the raw output behind Details.
- **The first run's Undo line** promises no more than Undo does.
- **Tests:** every combination of proof, ending and undone, and every irreversible risk.

## M46: Quiet by default (F28 liveliness, F18 notch)
- Flowflow's three choices: Still (the usual), Gentle, Lively. Still meets F04's budget: no frames after 3 seconds without news.
- The pointer ring shows only while listening or pointing, except on Lively.
- The old animations, the 7 degree lean, the idle tricks and the hidden Home Flowflow go.
- The notch is exactly the hardware notch at rest, with its own "looking at your screen" mark. It drops on its own only for a question, a proven result or a failure, ignores early clicks, and stays quiet while presenting or on a call.
- Amber pulses three times, then holds.

## M47: One Settings and the launch cut (F28 focus)
- One Settings surface in the Night look, grouped by the current pages, with a test.
- The non hero groups start off. Four default global keys.
- Fix the broken and confusing controls the review names.

## M48: Home and the result card (F28 Home, F28 notch hover)
- The status headline and the one next step chosen by status, in one column.
- The working strip with Stop. One result card with Undo inside and "Bring the fix back".
- Recent rows open their own receipt. Memory in the top bar.
- The notch on hover shows the live job, the result or the question, nothing else.
- Built from shared parts defined once; old style layers deleted, not overridden.

## M49: Three screen first run, measured
- Hello with the replay, the key screen with the honest privacy, cost and plan lines, and the project screen (folder, GitHub or Lovable, practice).
- A first check of the real project, with a safety copy first and installs set to ask.
- The practice runs without the person installing Node (a [verify] spike first).
- Flowflow choices and F05's questions after the first proven fix (F05 timing needs the founder's yes; until then they stay where they are).
