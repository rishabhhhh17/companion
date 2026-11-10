# M77: the safety net

Status: plan written 10 Nov 2026 on m48/launch (HEAD bc5b845), then built in the same change. Not committed. The build status of each part is at the end, with what still needs a real Mac.

Sources: `docs/plan/2026-11-08-the-plan.md` (section 4, step 2); `docs/research/2026-11-08-who-pays-and-why.md` (section 4, the "oh shit" moments 3 and 4, and the developer list in section 6); F30; M75 (the done signal's hook machinery and its card); M76 (Delete everything and leaving a project remove the hooks). The founder's target, 10 Nov 2026: Squibby is the safety net for people coding with Claude Code and the VS Code Claude extension first, Codex and Cursor second.

## Rules this milestone keeps

- AGENTS.md rules never bend. Squibby never writes the person's git (rule 10): a snapshot is a shadow snapshot and Undo restores from it. Nothing of the person's Claude Code session is blocked or changed: the hook always lets the command go.
- F30 and M75: a hook in another tool's settings only after the person's yes, shown exactly first, removable with one press, listed in Settings, and taken out by Delete everything and by leaving a project.
- Rules 5 and 6: the hooks carry as little as they can. The snapshot hook needs the command's text to tell a destructive command from any other; it is read once from a file in Squibby's own folder, the file is removed as it is read, and only a short, redacted form of the command (60 characters) is kept, in the History row's name. The waiting hook keeps only Claude Code's own short notification message (120 characters, redacted), never the question.
- Honest words (M57): never "Claude did" or "your AI did". The review says "the changes".
- Rule 16: the catch rate is a count of real rows, shown only when it is above zero. No streak, no praise.
- Safety lives in rules (rule 12): the weakened check rule and the key before push rule are code in `rate.ts` and `weakened.ts`, never a prompt.
- Strings only in `strings.ts`, colours only in `ui/tokens.css`, the M71 parts and look. Plain words, no em dashes.
- New settings in the four registry files with safe defaults. Protocol changes with fixtures both sides read.
- Tests first for the risky logic (rule 17): temporary fixture folders only, a stand in for the model, no real model, no real project.

## The Claude Code hook contract (checked 10 Nov 2026, code.claude.com/docs/en/hooks)

- Hooks live under `hooks.<Event>` in `.claude/settings.local.json` (project, gitignored by Claude Code), as a list of matcher groups, each `{ "matcher", "hooks": [ { "type": "command", "command", "timeout" } ] }`. `timeout` is in seconds (the usual is 600 for a command hook). The command goes to `sh -c` on macOS.
- `PreToolUse` with `"matcher": "Bash"` fires before each Bash tool call. Its stdin is JSON with `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `tool_name`, `tool_input` (`command`, `description`, `timeout`, `run_in_background`), `tool_use_id`. Exit 0 with no output: "the hook has no decision to report, so the tool call continues". Exit 2 blocks; any other exit code lets the action go ahead. A hook that reaches its timeout is cancelled and "doesn't block the tool call". So Squibby's hook always exits 0 and prints nothing, and even if Squibby is slow or gone the command still runs.
- `Notification` with a matcher on `notification_type` (`permission_prompt`, `idle_prompt` and others). Its stdin carries `message`, an optional `title` and `notification_type`. "Notification hooks can't block or modify notifications"; exit code and stderr are ignored.
- The docs say Claude Code "fires the same hook events wherever it runs: sessions in the terminal, IDE extensions, the Desktop app". [verify] that the VS Code extension reads the project's `.claude/settings.local.json` the same way (the docs do not say so in words).
- [verify] whether Claude Code picks up a hook added to `.claude/settings.local.json` in a running session, or only at the next session, and whether it asks the person to review it in `/hooks` first.

## 1. A snapshot before a destructive command (Claude Code first)

- `runner/src/donesignal.ts` grows from one hook kind to three (`HookKind`: `done`, `guard`, `waiting`), for Claude Code; Codex keeps `done` only (its PreToolUse contract is not checked, [verify]). The same plan, add, remove and state, the same marker rule (only Squibby's own entries, found by Squibby's own folders), the same index. Every hook command starts by checking that Squibby's engine is alive (its `guard/pid` file) and exits 0 at once when it is not, so a closed Squibby never slows Claude Code.
- The guard hook (`PreToolUse`, matcher `Bash`, timeout 10): writes its stdin to `<data>/guard/<token>.<pid>` through a temporary name (so the engine never reads a half written file), waits up to 5 seconds for `<that file>.ok`, removes both and exits 0. It never prints and never exits 2.
- `runner/src/guard.ts` (new, tested first): `destructiveCommand(command, project)` reuses `safety.ts` (`commandsWithFolder`, so `cd` is followed) and `dbsafety.ts` (`databaseProgram`, `databaseTool`, `databaseScript`, `databaseSetting`), with its own short list of git commands: `reset --hard`, `checkout` or `restore` on paths (never a plain branch switch), `clean`, `stash drop|clear|pop`, `branch -D`, `push --force`; `rm` with `-r` or `-f` inside the project; `find -delete`; `truncate`; and a database drop, truncate, reset or remote write that `dbsafety.ts` already names. `HookGuard` watches only Squibby's own `guard` folder: a request names a project (by token), its command is judged, a destructive one gets a snapshot (`CheckpointStore.snapshot("Before Claude ran: <short>")`) and a History row, then `.ok` is written; anything else gets `.ok` at once; any failure still writes `.ok`. A snapshot that takes longer than 4 seconds lets the command go and finishes on its own.
- History: a saved copy is its own row (`tasks.list.saved`, never in the task rows, so no verdict is read from it): "Before Claude ran <short command>" with Undo (checkpoint.restore from the shadow snapshot, as every Undo). The notch and Now say "Squibby saved a copy before Claude's command" once (event `guard.saved`).
- Settings: the same "Start reviews sooner" group on Fixing gets two more Claude Code rows with the same card and Remove. Delete everything and leaving a project remove them too (`donehooks.rs` now knows every event and the guard folder).

## 2. "Claude needs you" in the notch

- The waiting hook (`Notification`, matcher `permission_prompt|idle_prompt`, timeout 5): writes its stdin to `<data>/guard/<token>.<pid>.note` and exits 0. The engine reads `message` and `notification_type`, keeps 120 redacted characters of the message, removes the file and says `hook.waiting { project, waiting: true, message }`. It says `waiting: false` when the next hook event for that project arrives (a guard request or the done marker) or after `notch.waitingMinutes` (usual 15).
- The pages: the notch's live mark goes amber and the hover panel says "Claude is waiting for you in <project>" with the message under it; Home's Now shows the same line. No new global hotkey.

## 3. What the changes did not tell you

- `review.result.untold` from the review's own data, no model call: files changed beyond the usual code (tests, CI and lint config, settings, dependencies, settings and key files), checks not run or not able to run, TODO or FIXME lines added, failing checks. The card shows up to three plain lines at the top, each from strings.ts. The ask is never known (the done signal carries no content), so the words are always "beyond the usual files".

## 4. Weakened tests and checks, ranked first

- `runner/src/review/weakened.ts` (new, tested first): on the added and removed lines of each changed file: tests skipped or narrowed (`it.skip`, `xit`, `test.only`, `describe.skip`, `@pytest.mark.skip`, `t.Skip`), assertions deleted from a test file (more `expect`/`assert` lines removed than added), coverage thresholds lowered, CI steps told to pass anyway (`continue-on-error: true`, `allow_failure: true`, `|| true`, `exit 0` in a check), lint or type rules turned off (`"off"` or `0` in a lint config, `eslint-disable`, `@ts-ignore`, `@ts-nocheck`), with the file and line. Each is a reason `weakened_check`, a Fix this first, placed before every other reason.
- "Says it passed but did not run": when the review's words claim the checks pass and the checks did not run or failed, a reason `claimed_passed` (Fix this first) says so. The same rule (`claimsPassed`) marks a task's receipt (`claimedPassed`) when the task's last words claim a pass and its proof says otherwise.

## 5. A key about to be pushed

- When the review finds a key in code and the project has a git remote (`.git/config` names one; read only, never written), the finding adds "If this is pushed, the key is public." and the Copy for my AI text ends with removing it before any commit or push. Squibby runs no git command.

## 6. The catch rate

- `tasks.list.caught` from real rows of the last seven days: reviews whose checks failed or that said checks did not run as claimed (false dones), keys found, checks weakened, saved copies an Undo went back to, tasks put back with Undo. Review rows now keep the kinds of their reasons (names only). History shows one "This week" line when the total is above zero; Now shows a "What Squibby caught" row then. Setting `history.thisWeek` (On).

## Settings (protocol/settings.json, strings.ts, settingsPages.ts, settings-registry.test.ts)

- `review.weakenedChecks` (On, watch, runner): flag tests or checks a change weakens.
- `notch.waitingMinutes` ("15"; "5", "15", "60"; home, runner): clear "Claude is waiting for you" after this long.
- `history.thisWeek` (On, home, pages): the "This week" line and the Now row.

## Protocol

- Commands `donesignal.show|add|remove` gain `hook` ("done", "guard", "waiting"; absent means "done"). Event `donesignal.state` rows gain `hook`. New events `guard.saved { project, checkpoint, command }` and `hook.waiting { project, waiting, message? }`. `tasks.list` gains `saved` and `caught`. `review.result` gains `untold`. Reason kinds gain `weakened_check` and `claimed_passed`. Receipts gain `claimedPassed`. Fixtures for every one, read by the runner's suite and the shell's.

## Tests first

- `runner/test/m77-guard.test.ts`: which commands are destructive and which are not (a plain `git status`, `git checkout main`, `rm file.txt`, `npm test` are not); the guard and waiting hook plans name the exact file and lines; adding keeps every other hook and adding twice adds once; the hook command run for real with `sh`: with no engine it exits 0 within a moment and writes nothing; with an engine pid it writes the request, waits for `.ok` and removes both; the guard takes a snapshot for a destructive command and writes `.ok`, writes `.ok` at once for a harmless one, and never blocks on a failure; the History row and the events; a fixture project's `.git` is the same before and after; the waiting note becomes `hook.waiting` and clears on the next event and on the timer.
- `runner/test/m77-weakened.test.ts`: each weakened pattern is found with its file and line, ordinary test edits are not; `claimsPassed`; the key before push words; `rate` puts a weakened check first; the review end to end with a stand in store (a skipped test in a batch is a Fix this first, first).
- `runner/test/m77-caught.test.ts`: the counts from real rows, zero when nothing happened, only the last seven days.
- `app/src/m77.test.ts`: the saved row in History with Undo, the notch's amber mark and line while Claude waits, the three untold lines (never more), the This week line only above zero and with no praise, where the settings live.
- `app/src-tauri/src/donehooks.rs`: the guard and waiting entries go with the Stop entry; a person's own PreToolUse entry stays.

## Checks on a real Mac (the founder's hands, one per message)

1. Set up the snapshot hook in a test project. In Claude Code, ask for `git reset --hard`. Approve it in Claude Code. History shows "Before Claude ran git reset --hard" with Undo; Undo brings the files back. [verify] the hook runs in a live session without a restart, and whether `/hooks` asks first.
2. The same from the VS Code Claude extension. [verify] it reads the project's settings.local.json hooks.
3. Set up the waiting hook. Let Claude Code reach a permission prompt. The notch's mark goes amber and the hover panel says Claude is waiting for you with the project's name. Answer it; the mark clears on the next command.
4. Ask Claude Code to skip a failing test. The review's first line is the weakened test, Fix this first.
5. With a project that has a git remote, let a key be written into code: the finding says what happens if it is pushed.

## Status, 10 Nov 2026 (built, not committed)

All six parts are built end to end with tests, temporary fixture folders and no model. No real model ran and nothing was spent. The hooks were run for real with `sh` in the tests (with and without a live engine pid); Claude Code itself was not run.

**1. A snapshot before a destructive command: built.** `runner/src/donesignal.ts` (three hook kinds for Claude Code, Codex keeps done), `runner/src/guard.ts` (`destructiveCommand`, `HookGuard`, the pid file, the stale sweep), `TaskLog.saved`, `savedRows` and `caught`, `tasks.list.saved`, event `guard.saved`, the History row with Undo and the notch's and Now's one time line. Tests: `runner/test/m77-guard.test.ts` (65), `app/src/m77.test.ts`, `donehooks.rs` (the guard and waiting entries go on Delete everything and leaving).
- [verify] Claude Code runs a PreToolUse hook added to `.claude/settings.local.json` while a session is open, or only from the next session, and whether `/hooks` asks the person to review it first.
- [verify] the VS Code Claude extension reads the same project file and runs the same hooks.
- [verify] `sleep 0.1` and `kill -0` behave the same under Claude Code's `sh -c` on a real Mac (both are macOS /bin/sh built ins or BSD tools; the tests run them for real here).
- [verify] the snapshot's time on a large real project: the hook lets the command go after 5 seconds whatever happens, so a slow snapshot may land after the command started (then its History row is still a copy from before the command's first write only if the snapshot read the files first; the plan's honest limit).
- Not built: Codex's PreToolUse and Notification hooks (their contract was not checked), and Cursor.

**2. Claude needs you: built.** The waiting hook, `hook.waiting`, the model's `claudeWaiting`, the amber mark (`home.ts` `need` and `waiting`), the notch line and Now's line, cleared on the next hook event or after `notch.waitingMinutes`. No new global hotkey.
- [verify] the Notification hook fires for `permission_prompt` and `idle_prompt` in a terminal session and in the VS Code extension, and what `message` says for each.

**3. What the changes did not tell you: built.** `untoldOf` in `weakened.ts`, `review.result.untold`, `untoldLines` in `app/src/safetyNet.ts` (at most three lines) on both review card views.

**4. Weakened tests and checks: built.** `review/weakened.ts`, the two new reason kinds (`weakened_check`, `claimed_passed`) first in `rate.ts`, never silenced in `look.ts`, their fixed words in `strings.ts` and `findingShape.ts`, the receipt's `claimedPassed`. Setting `review.weakenedChecks` (On). Tests: `runner/test/m77-weakened.test.ts`.

**5. A key about to be pushed: built.** `hasGitRemote`, `withPushRisk`, `ReviewWords.pushRisk` and the closing line in `sendback.ts` (both Copy for my AI and Fix it). No git command is run.

**6. The catch rate: built.** `TaskLog.caught` (review rows now keep their reason kinds), `tasks.list.caught` only when above zero, the History line and the Now row (`safetyNet.ts`, `homeRest.ts nowRows`). Setting `history.thisWeek` (On).

Found and changed on the way: `safety.ts whereIs` is exported for the guard's path check (no behaviour change); older task log files get a `kinds` column on reviews and keep every row.
