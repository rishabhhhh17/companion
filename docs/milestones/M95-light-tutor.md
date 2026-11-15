# M95: A light tutor: what you have learned, and what to practise next

Status: built 15 Nov 2026, tests pass. Committed 15 Nov 2026 (38b0188). Nothing was spent on a real model: stand in engines, fixtures and temporary folders only.

The why: the founder asked on 14 Nov 2026, "does it teach me how to code better?" Teaching already rides inside the fix (Explain with its check question, Your turn, Show me what changed, the six practice projects and the guided tour in Learn, lessons made from the project, Prompt help). Nothing followed the person over time. This milestone adds a light tutor in Learn: what you have learned, and one thing to practise next.

## The rules it keeps

- **Only explicit signals inside Squibby (rule 15).** Four, and nothing else:
  - a practice project finished,
  - an Explain check question answered under a fix (right is learned; a wrong answer is kept as missed, only so Practise next can suggest a practice),
  - a Your turn change the person made themselves, after a fix, that the checks passed,
  - a problem a review found that a later change took out (not when the later version is just the change undone).
- **Only fixes count.** A task gives a kind only when it really was a fix: a practice, a Rescue, the fix of a problem Squibby's own check found, a review's Fix it, or a task whose proof first failed and then passed (then the failing check's words must name a kind). Every other task, a feature request above all, gives nothing to note, whatever its words mention (`kindOfTask`). The review finding of 15 Nov showed the old rules reading "Add a password reset page" as a key in the code.
- **Memory you can read and edit.** It is part of the memory module (`runner/src/memory/learned.ts`), in the profile's own folder beside `profile.md`, never in the project, never told to Claude. Every line shows its source and can be forgotten, and a forgotten signal is never learned again. Pause memory stops new signals too.
- **A productivity tool, not an AI friend (rule 16).** Each line is a plain fact, worded from its source: "found and moved to settings" only for a practice or a Your turn change, where the checks proved it; "a review found it and a later change took it out" for a review; "Check question answered: why a key in the code is a problem" for a check answer. No streaks, levels, points, scores or praise words, and nothing about health, money or moods. A test reads every tutor string for those words.
- **No model calls.** The kind of problem comes from fixed rules: the practice's own kind (`PRACTICE_LEARNED`), a review reason's kind (`kindOfReason`, only where the problem is clear), or the words of a fix request or a failing check (`kindFromText`, which needs an error's or a fix's words, never a bare mention). Only the kind is kept, never the words.

## Built

- **Protocol** (`protocol/index.ts`): `LEARNED_KINDS` (nine kinds, `other` among them), `LEARNED_SOURCES`, `PRACTICE_LEARNED`, `MAX_LEARNED` (500), `learnedSignalOk`. Commands `tutor.list`, `tutor.note` (a practice from the catalog, or an Explain checkpoint and whether the answer was right; nothing else), `tutor.forget` (a kind, and `learned` or `missed`). Event `tutor.learned` (`on`, `paused`, and signals of a kind, a source, a day and `missed` only as true; any other field is refused). `commands.json` rows (page commands; `tutor.note` is bound to the chosen folder, the other two are for every project). Fixtures `m95c1` to `m95c4` and `m95e1`, `m95e2`.
- **Groups**: a new tool, `tutor`, in Guide, with the setting `tutor.on`; tried once it holds something the person did. `groups.tried` may now hold `tutor` (25 items).
- **Engine**:
  - `runner/src/memory/learned.ts`: `LearnedStore` keeps `learned.json` (private, 0600, written atomically), each signal under a hashed key so one event counts once; a damaged file is kept aside as `learned.damaged.json`; fields a hand edit added are dropped.
  - `agent.ts`: answers `tutor.*`; remembers each explanation it gave with a check question (by project and checkpoint, with its kind), and notes an answer to it once, never one for a checkpoint it did not ask about; notes a Your turn check that passed; `learnFromReview` for reviews. Nothing with `tutor.on` off.
  - `review/service.ts`: when a recheck finds a reason no longer holds, it tells the tutor that reason's kind (deps `learned`, wired in `main.ts`), never in the key practice's copy (the practice counts it) and never with the switch off.
- **Pages**:
  - `app/src/tutor.ts` (pure): `learnedFrom`, `learnedLines` (one line per kind handled, with how many times and each source's newest day, newest first; a missed answer is never a line), `practiseNext` (below), `practiceNotesDue`.
  - Practise next, in this order: a practice not done about the kind of the newest missed check question (with Not this one, which forgets that missed answer); else the first practice, in the list's order, about a kind not met yet; else the first practice not done; else a lesson made from the project not tried yet; else "Every practice project is done."
  - One suggestion on Learn, never two. With the practice list shown, its featured card is Practise next: a missed check answer's practice leads it, with the tutor's why and Not this one in the card; otherwise the course path leads as before, and the tutor shows no Practise next of its own. Only when the practice list is not shown does `app/src/tutorPanel.tsx` show Practise next itself, with Not this one inside the row. A practice that needs Node while Node is missing is passed over; with only those left, the row says Needs Node. Nothing is suggested before the practice record has loaded.
  - `app/src/tutorPanel.tsx`: What you have learned with Forget on each line ("Nothing yet" and one short line when empty), and one line on where it comes from. With the switch off: one line that says so.
  - `card.tsx`: Learn asks for the list; a practice finished is noted; practices the shell's record already has as done are noted once per session (so ones finished before this version count); the answer to an Explain check question is noted (not the everyday app's why, which is not about a project).
- **Settings**: `tutor.on` ("What you have learned, on Learn"), on by default, in Privacy, More options, Memory.
- **Erase on the Memory page** for the profile erases What you have learned too (each signal kept as forgotten, so a practice the record still has as done is not learned again).
- **Delete everything** removes `learned.json` with the rest of memory (`wipe.rs` already groups every unknown runner file as memory; a new test says so for this file).

## Expectations changed on purpose

- `app/src/groups.test.ts`: the Guide group's tools not tried yet now end with `tutor`, the new tool. Nothing else in that test changed.
- After the review of 15 Nov: the engine tests now start their fixes as a fix of a problem Squibby's check found (a feature request is no longer a fix); the line for a key from a practice and a review now says "once" (only the practice is counted in "found and moved"); the DOM tests look for Practise next on the featured card, not in the tutor's own group, and for "Nothing yet".

## Not built, and why

- An Undo after a kept fix does not take its line back. A line can be forgotten by hand.
- A Squibby fix started from a review's Fix it counts through the same recheck only when a later batch is reviewed; the fix itself is not a separate signal, so nothing is counted twice.
- The everyday app's why (spreadsheets and the like) is not a signal: it is not about coding.
- Lessons have no kind, so Practise next offers a lesson only once every practice is done.
- Memory's export (Save my notes) does not include the tutor's signals.
- A review signal for a key says only that a review found it and a later change took it out: nothing checks where the key went, or that the person kept the change after.

## Tests

- `runner/test/m95-tutor.test.ts` (21): the store (kept once, local day, private file in the memory folder only, hashed keys, missed apart, Forget for good, Pause memory, a damaged file kept aside, hand edits filtered, the cap); the kind rules (every practice, review reasons, words); the protocol (commands and the event, the fixtures); through the engine (list, practice note, an Explain answer right and wrong, once only, never for a checkpoint without a question, Your turn passed and failed, the switch off, Pause memory, Forget, and scope: never in the project, never in the project's memory, never told to Claude); a review whose key is taken out is learned once, not in the key practice's copy, not with the switch off.
- `app/src/tutor.test.ts` (13): reading the event, the lines and their sources, how many times in words, every Practise next rule, the practices due, and the words (no praise, streaks, levels, points, health, money or moods, no dashes).
- `app/dom/m95.test.tsx` (4) and `app/dom/m95Off.test.tsx` (1): Learn with no history, some history (Forget and Not this one send exactly that), every practice done (each told once), an Explain answer sends its checkpoint and right or wrong, and with the switch off one line and nothing noted.
- `runner/test/settings-registry.test.ts`: `tutor.on` is there with on as its usual value.
- Rust: `wipe.rs` (`learned.json` is memory and Delete everything removes it), `runner.rs` (the tutor's fixtures: `tutor.note` bound to the chosen folder, the others for every project, the event carries kinds, sources and days only).

## [verify] on a real Mac

These are also listed in `docs/research/technical_research.md` section 20, item 40.

- A real Explain answer from the person's own Claude is noted once, and its kind matches the fix.
- A real Your turn check that passes is noted once.
- A real review of another AI tool's change whose key is then moved out is noted once, and not in the key practice's copy.
- Practices finished on a shipped build are picked up from the shell's record on the first visit to Learn.
- Delete everything removes `learned.json` (and `learned.damaged.json`).

## Shots

Headless Chromium at 2x, the pages served from `app/dist` with a stand in for `window.__TAURI__`: Learn with no history, with some history, and with every practice done. Paths are in the final report.
