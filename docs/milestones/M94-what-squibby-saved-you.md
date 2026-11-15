# M94: What Squibby saved you

Status: built 15 Nov 2026, tests pass. Not committed. Nothing was spent on a real model: stand in engines, fixtures and temporary folders only.

The why: the founder asked on 14 Nov 2026, "does it save tokens and do my things efficiently?" Squibby already guards its own spend (a model per job in `runner/src/models.ts`, the fix loop breaker in `drive.ts`, the cost pause in `costpause.ts`, the daily limit in `spending.ts`, `bisect.ts` with no model, proof by exit codes first) and stops waste, but nothing showed it. This milestone shows it, counting only real events from the person's own task log.

## The rule on amounts

F29 and M69 say no cents and no amount anywhere a customer looks; M75 says the cost card says "a lot more than usual", never a number. So this part is **counts only**. No spend, no estimate of tokens, time or money saved, and no amount in the JSON. The page says so in its own words.

## Built

- **Task log** (`runner/src/tasklog.ts`): a new `marks` table, one row per real event (kind, what it was about, the person's choice where there is one; never words, never an amount), and an ask row's new `live` column. Older log files gain both on open and keep their rows; an older ask whose reason ends with the live systems sentence (`LIVE_TAIL`) still counts as live.
- **Written as it happens** (`runner/src/agent.ts`):
  - `loop_stopped`: when the fix loop breaker fires, on a single task and on a Drive step (on that step's own task).
  - `cost_paused`: each time the cost pause is answered, with Keep going, Stop or Undo (Stop everything ends it as a stop).
  - `bisect_found`: when Which task broke it? names a version.
  - `drift`: the kinds of a receipt's flags, Not what you asked for and Said one thing, ran another (the flags were only on the receipt before).
  - Squibby's own asks keep `live` when the command touches a live system. The guard hook only ever asks about live ones.
- **Counted** (`TaskLog.spared`, the same seven days as This week). Each event is counted once, by distinct task or version:
  - `loopsStopped`
  - `paused`, and `pausedStopped` (stopped or undone; never more than `paused`)
  - `foundNoModel`
  - `wrongCaught`: reviews that flagged a weakened check, a done that was not done or failed checks and that the person then fixed (Fix it, or sent back to their AI), plus Squibby's own flagged tasks the person undid.
  - `liveAsks`
  - Saved copies before destructive commands are `WeekView.saved` already, so they are not counted again.
- **Protocol**: `WeekView.spared` (optional), `SPARED_KEYS`, `MARK_KINDS`. The check needs exactly the six whole counts with `pausedStopped <= paused`. New fixture `m94e1`.
- **Pages**: `weekFrom` reads it (anything off drops the whole part, never a made up zero). Your numbers (`m88Panels.tsx`) gains a What Squibby saved you part with five rows (the stopped pauses are said in the paused row's label, never as a row of their own), or "Not counted" for an older engine. Its footer says that a weakened check or a done that was not done, caught in the table above, is counted here too once fixed or undone. This week gets a bold What Squibby saved you title and a list of the parts above zero (`sparedLine` returns the list), and nothing when there are none. A week whose only events are these counts is not an empty week (`weekEmpty` counts them, not `pausedStopped`, which is already among the pauses); Share what my AI did then says Nothing was caught instead of a blank summary. Send these numbers gains `spared`, the same six counts in a fixed order.
- **Shell**: `numbersmail.rs check_json` accepts `spared` only as exactly those six counts.
- No new setting: the part lives inside Your numbers, which `numbers.yours` already turns off.

## Two expectations changed on purpose

A third `week.summary` fixture (m94e1) now exists, so the fixture count went from 2 to 3 in `runner/test/m79-week.test.ts` and in `runner.rs` (`m79_the_weekly_summary...`). Nothing else changed in those tests.

## Not built, and why

- Undo of a review of the person's own AI tool has no record linking it to that review, so a review is counted only on Fix it or sent back. A Squibby task counts on Undo.
- Share what my AI did does not carry the new line.
- Weeks from before this version have no marks, so only reviews and live asks count back.

## Tests

- `runner/test/m94-saved.test.ts` (11): counts from fixture logs, nothing counted twice, other projects, rows past seven days and future rows left out, marks keep no words, an older log file upgraded. Written as they happen: loop breaker, cost pause Keep then Stop, Said one thing ran another then Undo, Which task broke it? twice for one version, Squibby's live ask. week.show carries counts only and agrees with the protocol and the fixture.
- `app/src/m94.test.ts` (7): reading, rows (five, no question mark in a label), the JSON (keys, order, counts and dates only, the shell's own key list), This week's list, a week with only these counts is not empty, and words with no amount, estimate, streak or praise.
- `app/dom/m94.test.tsx` (4): Your numbers with data, with an older engine, This week's titled list, and a week with only these counts that does not say nothing happened.
- Rust: `numbersmail.rs` (`only_counts_and_dates_pass` gains the `spared` cases), `runner.rs` (m94e1's counts pass the shell's check).

## [verify] on a real Mac

These are also listed in `docs/research/technical_research.md` section 20, item 39.

- Each event leaves exactly one mark per task, or per version found, in a real `tasks.db`.
- A `tasks.db` from a shipped build upgrades on first open.
- A live ask from real Claude Code through the guard hook is counted once.
- The counts match History for the same week.

## Shots

Headless Chromium at 2x, the pages served from `app/dist` with a stand in for `window.__TAURI__`: Your numbers with data, with an older engine (Not counted), Send these numbers' JSON, and This week with data, with only these counts, and empty. The History header in the shots comes from the same week as the page (1 done that was not done, 1 weakened check, 1 Undo), so the two agree. Paths are in the final report.

## Review fixes (15 Nov 2026)

- An empty week no longer contradicts itself: a week with only a stopped fix loop or a cost pause is not empty.
- The double count is said, not hidden: the lead says "one time each in this list", and the footer names the reviews that show up in both parts.
- This week's part has a title and a list, like What was caught.
- The row "Times Which task broke it? found the task, with no AI" is now "Broken tasks found by Which task broke it, using only your checks".
- "Of those, stopped or undone by you" is no longer a sixth row: the paused row's label says it. The JSON keeps all six keys.
- Expectations changed on purpose, in `app/src/m94.test.ts` and `app/dom/m94.test.tsx` only: the rows are five, and This week's part is a list, not one sentence.
