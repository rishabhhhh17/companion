# M4: Drive, Rescue and Research. Plan for approval

**Status:** approved by the founder on 9 Oct 2026, with the recommended split (M4a now, M4b right after), at most 12 steps per plan and $5 per Drive task. M3 was merged into main the same day (PR 4). **Built on branch m4a/drive-core:** plan then approve, a snapshot and check per step, the fix loop breaker, house rules, the daily ceiling and take the wheel. **Left in M4a:** decisions saved to memory, which waits for the memory milestone (a half built memory would break rule 15), and the hands on run with the founder. **Written:** 9 Oct 2026. **Source:** technical doc section 18 (the M4 row), section 7 (proof) and the "take the wheel" paragraph in section 6; product doc section 3. Decisions behind it: F15 (agents first and best), F13 (undo never touches your git), F14 (everyone gets the browser check), T07 (the proof ladder).

## What M4 is

Today you type one request and one task runs. M4 makes the agent good at **big, messy work**, which is the product's main promise: you start a project with AI, get stuck, and Companion helps you finish it.

- **Drive:** you describe a goal ("a booking page for my studio"). Claude first writes a short **plan** in plain words. You approve or edit it. Then it works through the steps one at a time. Every step gets its own snapshot and its own proof check, so any step can be undone on its own.
- **Rescue:** you point it at a project that is stuck or broken. Claude reads it, says what is wrong in plain words, and proposes a fix plan. Same safety as Drive.
- **Research:** Claude reads docs and web pages for a question and writes **cited notes**, never changing your project.

## The pieces

1. **Plan, then approve.** A planning phase that can read but never write (Claude's own plan mode). The card shows the plan as a short checklist. You can remove or reword steps, then press Start.
2. **Step by step, with a snapshot per step.** Each step ends with its own proof check (the M3 ladder). A step that fails goes back to Claude twice, then stops with evidence. Undo works per step as well as for the whole task.
3. **The fix loop breaker.** If the same failure happens three times in a row, Companion stops the loop and shows a card: "This keeps failing. Try a different approach?" with the evidence and two or three options. This is the "stuck" moment the product exists for.
4. **Take the wheel.** The agent pauses within about a second when you bring the project's editor or terminal to the front, or when a file changes that the agent did not write. You resume with a click. This needs no permission and never sees what you type (rule 5).
5. **House rules.** A plain text list per project ("never touch the pricing file", "always ask before adding a package"). Rules are checked in code by the safety layer, not just told to Claude (rule 12).
6. **A daily ceiling per project.** The runner keeps its own ledger of estimated spend. When the day's limit is reached, new turns stop and the card says why. (We never pay for or resell usage; this is only a guard on the user's own spend.)
7. **Rescue diagnosis on a stronger model,** and **a second model reviews risky changes** (proof rung 7). Both use the user's own Claude and show their cost.
8. **Decisions saved to memory.** When you approve or change a plan, the choice is saved as a visible, forgettable line (rule 15).
9. **Research mode.** Read only, web allowed through an allowlist, notes with sources, saved where you can read and edit them.

## How we will know it works

Automatic, written first, run after every change:
- a 10 step plan runs to a proof pass, or stops with evidence, on seeded projects (including the four from M3);
- every step is undoable on its own, and the whole task is undoable;
- three identical failures trigger the different approach card, and two do not;
- bringing the project's editor or terminal to the front, or editing a project file by hand, pauses the agent within about 1 second (a test with a fake front app and a real file change);
- the daily ceiling halts new turns and says so;
- plan mode really cannot write (a test that tries and is refused);
- house rules block a matching command or file write in code, with the rule named in the message;
- Research never writes into the project.

Then a real run with you on the Claude plan route: a small goal, the plan card, a step that fails on purpose, and an Undo of one step.

## What I recommend: split it, like M2

**M4a (do now, about 7 to 9 working days):** plan then approve, step by step with a snapshot per step, the fix loop breaker, take the wheel, house rules, the daily ceiling, decisions saved to memory.
**M4b (right after, about 4 to 5 days):** Rescue, Research and the second model review.

Why: M4a is the heart of Drive, the thing you called best-in-class. Rescue and Research reuse all of it, so they are quicker and safer once 4a is solid.

## What I need from you

1. **Approve this plan,** and say if you want the split (my recommendation) or all of M4 in one go (about 3 weeks, bigger risk).
2. **A decision on step size.** I suggest at most 12 steps per plan and a default budget of $5 per Drive task (from the technical doc), shown on the plan card before you press Start. Change either if you like.
3. Nothing to install or download.

## Risks and plan B

- **Plans that are too big or vague.** The plan card shows the cost estimate and step count first; the agent is told to keep steps small and independently checkable. If a plan has more than 12 steps, Companion asks Claude to shorten it.
- **A step cannot be proven** (no tests, no page to open). It is marked "done, not checked" in the same plain words as today, never "proven".
- **Take the wheel false alarms** (a build tool writing files). The agent's own writes and the snapshot diff are subtracted; build output folders are ignored by default.
- **Plan mode differs between SDK versions.** The SDK is pinned; a test fails loudly if the behaviour changes.

## Approval

Say **approved** (or **approved, all of M4**), and I'll start with the tests for the plan phase and per step snapshots.
