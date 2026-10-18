# T16. One settings registry, read by the shell, the pages and the engine

- **Status:** Accepted (M11, customize core). Built and tested with fakes; not yet tried in the built app by a person (see "Not proven").
- **Date:** 2026-10-19
- **Source:** the founder's "customizable everything" direction (every behaviour gets a Settings control with a safe default); `docs/milestones/M11-customize-plan.md`
- **Related:** F17, F18, T05, T13, T14

## Decision
Every setting a person can change is described once, as data, in `protocol/settings.json`: its name, section, kind (switch, choice, number, text, list, or custom for the editors that already existed), its usual value (today's behaviour), its limits, whether it is per project, who applies it (shell, engine, pages), where its value is kept, and whether it takes effect at once or from the next task. The shell reads the file with `include_str!` (`app/src-tauri/src/settings.rs`); the pages and the engine read it through `protocol/settings.ts`. The words a person reads are in `app/src/strings.ts` (`S.set`, `S.sections`), never in the registry (rule 21).

The rules for what a value may be are written twice, in Rust and in TypeScript, and both run every case in `protocol/fixtures/settings-cases.jsonl` (valid, refused and tidied cases for every kind, and the migration cases), so they agree on each of them. The check that text "looks like a key or password" is the shell's own `redact::is_sensitive`, written again in `settings.ts`.

## Where values are kept (the stored file this record adds)
A new file, owned only by the shell: `~/Library/Application Support/dev.companion.app/settings.json`, owner only (0600), written whole and atomically under one lock:

```
{ "version": 1, "values": { "<name>": <value> }, "projects": { "p_<12 hex of sha256 of the folder path>": { "<name>": <value> } }, "migrated": ["pageStorage.v1"] }
```

- Only values that differ from the usual one are written, so putting a setting back means removing it.
- Names and fields this version does not know are kept untouched, so going back a version loses nothing.
- A project's values are kept under a hash of its folder, never under the path.
- A file that is not JSON (or not text) is moved aside as `settings.damaged.json` (kept for support) and Companion starts on the usual values, with one plain line in Settings. The migration mark is kept, and a fresh file holding only it is written at once: a settings.json is only written after Home has run the migration, so the damaged one had it, and without it the old page storage would copy the choices from before the update back in. One bad value falls back to its usual value and is listed.
- A file that is there but cannot be read at all (no permission, an I/O error, a folder in its place) is not damaged: it is left where it is, Companion uses the usual values for that session with one plain line in Settings, and nothing is saved over it. Each change that would write settings.json first reads it again; while it still cannot be read the change is refused ("Could not save that setting. It is unchanged."), and once it can, its values are taken first.
- Both files are in Companion's own folder, so Delete everything already removes them (a `wipe.rs` test proves it); `dev.json` still stays.

Wrapped, left where they always were (moving them would be risk for no gain): `dock.json` (Come to what it is about, and since area 4 the character's place on the display it is on: its edge, its position along it, and Same place on every display), `presentation.json` (hide from screen sharing, quiet during calls), `keys.json` (its own editor and checks), `voice.json` (its own editor). The engine keeps its own three, reached only through its own commands, which only the shell sends now: `spending.json` (the daily limit, `spending.set`), `memory-settings.json` (Explain and pausing, `explain.set` and `memory.pause`), `metrics.json` (beta numbers, `metrics.set`). The money path (the daily limit, `COMPANION_DAILY_CEILING_USD`, the real run daily limit scenario) is unchanged. These apply to every project, so with no folder chosen the shell names the stand in project, and the engine reads and writes no folder for it (profile only memory, nothing spent).

## How a change travels
Pages never write a file. Every change goes through the shell (`settings_set`, `settings_reset`, `settings_migrate`, Home's window only; `settings_get` from any window). The shell checks it, keeps it, applies its own part (for example sends a visiting character home, applies the screen sharing setting, silences speech), then tells every window (`settings-changed`). What the engine applies from `settings.json` reaches it as the protocol command `settings.apply` (values that differ from usual, and the current project's own). It is the first line the engine reads after every start and restart (queued on the new engine's own queue before anything else can reach it, `runner::supervise_first`), and it is sent again after each change the engine applies and when the project folder changes. It is not on the page allow list, and neither are `spending.set`, `explain.set`, `memory.pause` and `metrics.set` any more. The engine checks every value again, keeps them in memory only, answers `settings.applied` (names only), and a task reads what it needs when it starts, so a running task keeps the values it started with.

## Migration
The choices the pages kept in their own storage before the registry (reactions, Your turn, text size, Speak to me, Answer out loud, auto send, Show me on all screens, the daily update check) are read once by Home's window with exactly today's meaning and sent to `settings_migrate`. The shell keeps only ones not already set and only valid ones, records `pageStorage.v1` and refuses a second run. Until the mark is in the snapshot, every window reads the old page storage for these, so nothing shows a choice the person did not make. Storage that cannot be read migrates nothing and is tried again next time. The old page storage is not deleted for one version (going back still works); Delete everything removes it with the rest of the page storage, as before.

Once the mark is in a snapshot, page storage also keeps one value of its own, `companion.settingsMigrated` = "1" (the only thing the pages write there for settings). With it, the old page storage is never read again and the migration sends nothing (it only records the mark again), so a settings.json lost later (damaged, or removed by hand) never brings the choices from before the update back. Delete everything clears page storage and settings.json together.

## Reset
One setting (Reset, only when it differs from usual), a section (Reset this section), or everything (Reset all settings to usual). Both of the last two ask first, naming every setting that will change (so someone who paused learning reads "Pause learning" in the list), and both offer Undo for ten seconds. Protective settings (lists a person adds protections to, such as house rules later) are never in a section or everything, and are never reset from their own row. Reset all covers settings.json (the app's and every project's), the wrapped stores (keys through the same path as Reset to the usual keys, voice to the Mac's own choices) and the engine's three (daily limit $10, Explain on, learning on, beta numbers off; their counts stay). It never touches the key, project folders, memory lines, history, undo points, pictures or anything protective. What a reset changes is decided by the shell from exactly what the page was shown (`settings.rs` `reset_plan`: each setting in it whose shown value differs from its usual one), and the page keeps the same list for Undo (`settingsStore.ts` `undoValues`); both run `protocol/fixtures/settings-reset-cases.jsonl`, so Undo puts back exactly what was reset. The engine keeps its own three, so the page names the ones it has heard away from usual, and the shell resets only those: one the page has not heard yet is left as it is (the confirm says so), because the page could neither name it nor put it back. Undo puts every value back through `settings_set`, the voice and the keys only exactly as they were shown (`voice_from`, `keys_from`; keys one job at a time through the same switch Change uses).

## Why
- One list means the Settings page, search, Reset, the migration, the engine and the tests all come from the same place; a new setting is one definition, its words, and the code that reads it.
- JSON, not TypeScript, so the Rust shell reads exactly the same file with no build step.
- The shell is the only writer, so a page (which runs web code) can never write a setting file, and every value is checked where it is kept.
- The engine's own stores stay its own, so the spending limit and memory rules keep their tested code paths.

## What this means for the build
- A new setting needs a definition in `protocol/settings.json`, its words in `S.set` (a test fails without them), and its reader. Never a plain setting as `custom`.
- Read a setting in a page with `setting(key)` or `useSetting(key)` (`app/src/settingsStore.ts`); in the engine with `RunnerSettings.get(key, project)`, once, when a task starts; in the shell from `settings.rs`.
- The worked example is `work.maxTurns` ("Most turns in one task", 20 to 200, usual 80), which reaches the SDK's `maxTurns` for tasks, Drive, Rescue, Research and planning.
- Never a setting for anything in `docs/milestones/M11-customize-plan.md` under "Never a setting".

## Not proven
- Built and tested with fakes only. The app was not built and opened in this change; carrying a real Mac's old choices over, a setting kept across a quit, Reset and Undo, and Delete everything removing settings.json are still to be tried on a real Mac. The keyboard and VoiceOver pass needs a person.
- `work.maxTurns` is proven with the fake engine and a fake SDK query; no real Claude run was made. A task that reaches it ends as `error_max_turns`, which the page words as "Stopped: this task used the most turns allowed (Most turns in one task, in Settings). Nothing more was run." (tested with the model only).

## Revisit if
Settings need to sync between Macs (then the file format needs an owner and a merge rule), or a store that is wrapped today needs a change that is easier in settings.json.
