# M59: Foundations before the engine

Status: built 11 Nov 2026 on `m48/launch`, not committed. Source: the 4 Nov roadmap (`workflows/review-2026-11-04/roadmap.json`, milestone M59, must fixes 28, 29 and 30). Time boxed: the roadmap says only the harness, the three registries and the tool runner guard must land before M60. This milestone does those, plus the hooks lint.

## The founder's yes (6 Nov 2026)

Three test only dev dependencies, never shipped, pinned exactly in `app/package.json` devDependencies:

| Package | Version | Licence | Why |
|---|---|---|---|
| happy-dom | 21.0.4 | MIT | A DOM for the page tests under bun test |
| @testing-library/react | 16.3.3 | MIT | Render a page and press its buttons as a person would |
| eslint-plugin-react-hooks | 7.1.1 | MIT | The rules of hooks lint |

Each of the last two needs a peer package to run, which Bun installs with it (in `app/bun.lock`, not listed in package.json): `@testing-library/dom` 10.4.2 (MIT) and `eslint` 10.14.0 (MIT). No other new dependency. None of them is a production dependency, so `ACKNOWLEDGEMENTS.txt` does not change. Clippy is part of the Rust toolchain already installed, not a dependency.

## What the 4 Nov roadmap listed, and what this milestone does

| Roadmap item | Here | Notes |
|---|---|---|
| DOM test harness (happy-dom, Testing Library) | Done | `app/dom/`: `globals.ts` (the DOM and the one stand in for `window.__TAURI__`: every command recorded, answered from a table, every event fireable), `setup.ts` (the preload), `render.tsx` (`renderHome`, `renderPage`, `runner`, `press`). Run with `bun run test:dom`, each file in a fresh page (`--isolate`). The shot harnesses' stub did not survive in the scratchpad, so this is the one stub now. `card.tsx` exports `Card` and mounts itself only when its `#root` is there |
| Render tests in place of source text pins | Done for the main flows | 28 click through tests: Now at rest, a review card (Fix it asks first, Copy for my AI, Looks fine, Keep it anyway), Fix it to proven to Undo (Undo asks first), Stop and Undo these changes, Stop everything's event, History (Star, Name it, Undo), Memory (Forget with its Undo, a second Forget, leaving the page, Export), Settings (search, change a switch, Restore usual), the first run to a found problem and Back keeps it, the hover panel's quick actions and Stop. Source pins now covered were replaced: History's Undo wiring (`history.test.ts`), Forget's Undo (`m72Rows.test.ts`), the first run's Back and found line (`m72FirstRun.test.ts`). No test that guards a rule (focus, permissions, honest words, Stop) was weakened |
| One CSS helper | Deferred | Not needed by the render tests; next with the remaining source pins |
| Must fix 28, one Stop registry | Done | `runner/src/interrupts.ts`: `STOP_PARTS` names all 17 parts (the runner's tasks, drives, checks, check waits, installs, pictures, watch runs, M75's cost pause and sign in wait; walks, the browser download, the warm up, watches, the review, Prompt help and its kin, M77's guard waits and Claude is waiting marks, M75 and M78's hooks folder). Stop everything, a group switched off and the engine closing all go through it (`main.ts`); `AgentRunner.stopParts()` is the same list for a runner used alone. New: Stop everything now also lets a guard request waiting for its snapshot go at once and ends the waiting marks (`HookGuard.stopWaits`). `runner/test/interrupts.test.ts` starts one job of each kind and checks Stop ends them all, and that main.ts registers exactly the list |
| Must fix 29, no unsandboxed tool runner | Done (the guard) | `defaultExecutor` is gone. The plain runner is `testToolRunner` in `engine.ts`, carried only by the scripted test engine or passed in by a test. An engine that does not run tools itself and has no executor cannot be built (`AgentRunner` throws `NO_EXECUTOR`), so an F29 engine of our own loop can never fall back silently. `runner/test/no-executor.test.ts`. The sandboxed executor itself belongs in the engine plan, before any own loop code (deferred, as the roadmap says) |
| Must fix 29, typed error code in protocol/ | Deferred | Error codes still travel in message text (`plainfail.ts`, `agent.ts` status regex, `app/src/model.ts`). Next, with typed events |
| Must fix 30, one command list | Done | `protocol/commands.json`: one row per command (85) with `gate`, `page`, `project`, `own`. Read by the runner (`protocol/commands.ts`: `plan.ts` gates, `review/service.ts` OWN_WORK and LIGHT_WORK), the shell (`runner.rs` ALLOWED and PROJECT_BOUND through `include_str!`, `groups.rs` test) and the pages' test (`groups.test.ts`). A Command type with no row fails to compile. `runner/test/commands-list.test.ts` and `runner.rs the_shells_lists_come_from_the_one_command_list` check they agree, and that every page command naming a project is project bound |
| Typed events, engine errors, one plain words module | Deferred | Next |
| Dead code, blanket allows, the 79 unused strings | Deferred | Next |
| Clippy and the React hooks lint in test-all | Hooks lint done; clippy noted | `app/scripts/lint-hooks.ts` (rules of hooks as errors; types taken off by Bun's transpiler, then ESLint). It found 5: `useFolder` in `card.tsx` was not a hook (renamed `openFolder`), and `homeCharacter.tsx` read a setting behind `liveliness ??` (a real hook order bug, fixed). Clippy: see below |
| Split main.rs, Card and AgentRunner | Deferred, next | Too big for the remaining budget (the founder's brief) |
| architecture.md section 3, design/look.md | Deferred | Next |
| Ask the founder to settle rule 21 | Not done here | A question for the founder, not code |

## Clippy

Clippy (0.1.99) comes with the installed Rust toolchain, so it needs no new dependency, but it does not run cleanly: `cargo clippy --all-targets` gives 68 warnings on the app and about 65 more in its tests (none from this milestone's code; the most common are `map_or` that can be simpler, needless `&vec!`/slice borrows and assertions on constants). So it is not in test-all yet. Next: fix those warnings (most are `cargo clippy --fix`), then add `cargo clippy --all-targets -- -D warnings` to test-all.

## Other changes this needed

- `app/scripts/stage-engine.sh` copies `protocol/commands.ts` and `commands.json` into the app, since the engine imports them.
- The eval wrappers around an engine (`evals/lib/budget.ts`, `evals/fix-projects/pipeline.ts`, `evals/review-catch/pipeline.ts`) pass the scripted engine's test runner through; tests with a stand in engine of their own pass `testToolRunner` in.
- `runner/test/warm.test.ts` now checks the warm up is stopped through the registry.
- The pages read the command list only in their tests (`groups.test.ts`); no page refuses a command by itself yet (the shell does).

## Checks (11 Nov 2026, each run alone; load average about 2 on this Mac)

| Check | Result |
|---|---|
| `cd app && bun run test` | 3821 pass, 0 fail (193 files), then the DOM tests: 28 pass, 0 fail (6 files) |
| `cd app && bun run typecheck` | clean |
| `cd runner && bun run typecheck` | clean |
| `cd runner && bun test` | 5446 pass, 3 skip, 0 fail (5449 tests, 266 files, 1138 s) |
| `cd app/src-tauri && cargo test` | 1326 passed, 0 failed, 7 ignored |
| `sh scripts/test-all.sh` | exit 0 (every suite, including the new DOM tests and the hooks lint) |
