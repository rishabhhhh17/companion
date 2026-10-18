# M11: Customize everything (the settings plan)

The plan for making every behaviour a setting with a safe default, so the area builders can follow it. The core (the
registry, the Settings page, search, Reset, the migration and one worked example) is built first; then five areas, one at
a time. The decision record is `docs/decisions/T16-settings-registry.md`.

Status of the core (19 Oct 2026): built on `m11/customize-core` and tested with fakes (all suites). Not yet tried in the
built app by a person: see "What done means" at the end.

## 1. One registry, three readers, one writer per store

### The definition list: `protocol/settings.json`
- Data only, no words a person reads. The Rust shell reads it with `include_str!` (as `runner.rs` already reads
  `protocol/fixtures`); TypeScript reads it through `protocol/settings.ts`, which exports the types and helpers for the
  pages and the engine. JSON, not TypeScript, so Rust reads the exact same file with no build step.
- Shape: `{ "version": 1, "sections": [...], "settings": [Def, ...] }`. The order of `sections` is the order on the page:
  keys, talking, home, pointing, spending, work, checks, memory, otherApps, sharing, display, updates, numbers.
- Each definition:
  - `key`: dotted lowerCamel (for example `work.maxTurns`), stable forever. A rename keeps the old name in `renamedFrom`,
    read once on load.
  - `section`: one of the sections.
  - `kind`: switch, choice, number, text, list or custom. Custom is only for the editors that already exist (keys, voice)
    and the per app answers editor area 5 adds (promptHelpApps, the only protective custom row); never for a new plain
    setting.
  - `default`: the value that matches today's behaviour.
  - choice: `options`. number: `min`, `max`, `step`, `unit` (dollars, seconds, minutes, percent, count, words). text:
    `maxLength`. list: `maxItems` with `item.maxLength` or `allowedItems`.
  - `scope`: app or project. A project value is kept per project folder; with no folder chosen the row is disabled and
    says why.
  - `applies`: who reads it (shell, runner, pages).
  - `store`: where the value lives: `settings` (the new shell file) or a wrapped store: dock, presentation, keys, voice,
    spending, memory, metrics, promptHelpApps (area 5; later: rules).
  - `live`: true takes effect at once; false shows "From the next task" and is read when a task starts.
  - `protective`: true for lists a person adds protections to (house rules, never read apps). Never touched by Reset this
    section or Reset all; only its own control removes an item, after an inline confirm.
  - `floor`: optional words id for the fixed part, shown under the row (for example "No answer always counts as no").
  - `from`: optional migration source, for example `{ "pageStorage": { "name": "companion.reactions", "map": "notOff" } }`.
    Maps: isOn (the word is "on"), notOff (anything but "off"), isOne (the word is "1"), notZero (anything but "0"),
    textSize (one of the sizes, else Standard).

### The words: `app/src/strings.ts` (rule 21)
`S.set[key]` holds the label, the help line, other words people may search with (`also`), each option's words and, for a
custom setting, what its usual value is called. `S.sections` holds the section titles, and `S.on` and `S.off` replace the
hard coded "on" and "off". A pages test checks every setting and every option has words, no words are left over, and the
words follow the writing rules (no em dashes, plain words).

### Kinds and their rules, the same in Rust and TypeScript
- switch: true or false only. choice: one of its options. number: a finite number within min to max (outside is refused
  in plain words); a value between steps is put on the nearest step. text: spaces trimmed, one line (no line breaks,
  control characters or paragraph separators), up to maxLength, and refused when it looks like a key or password ("That
  looks like a key or password, so it was not saved."). list: different items, each valid, up to maxItems.
- Both sides run the same cases from `protocol/fixtures/settings-cases.jsonl` (`{key or def, value, ok, normalized or
  reason}`, and migration cases), so Rust and TypeScript agree on every one of them. A test checks every usual value
  passes its own rules, min is below max, the step fits, options are different, and sections and stores exist.

### Where values live
- New file, owned only by the shell: `~/Library/Application Support/dev.companion.app/settings.json`, owner only, written
  whole and atomically under one lock: `{ "version": 1, "values": {...}, "projects": { "p_<12 hex of sha256 of the folder
  path>": {...} }, "migrated": ["pageStorage.v1"] }`. Only values that differ from the usual one are written, so Reset
  means removing the name. Names this version does not know are kept when writing, so going back a version loses nothing.
- Wrapped, left as they are: `dock.json` (come to, and later the character's place), `presentation.json` (hide from
  sharing, quiet on calls), `keys.json` (its own picker, Reset to the usual keys, the old talk keys file), `voice.json`
  (voice, speed, microphone, language). The shell's adapters read and write them with their existing code.
- The engine's own, left as they are and reached through the protocol: `runner/spending.json` (the daily limit, through
  `spending.set` and `spending.show`), `runner/memory-settings.json` (Explain and pausing, through `explain.set` and
  `memory.pause`; the forgotten list and the AGENTS.md answer stay engine data), `runner/metrics.json` (beta numbers,
  through `metrics.set`). The money path is unchanged. These apply to every project, so the shell sends them with the
  current project or the stand in for no folder ("no-project"), and the engine treats that as no folder (profile only
  memory, nothing spent). This also fixes the greyed out Explain button with no folder.
- Not settings (state, they stay where they are): `island.json`, `projects.json`, `dock.json` last screen, and the page
  storage for the ask box draft, last seen, the version seen, onboarded and the last update check.

### Who applies a setting, and how a change reaches them
Pages never write a file. Every change goes through one shell command, `settings_set` (and `settings_reset`,
`settings_migrate`), accepted only from Home's window. The shell checks it, writes the store, runs its own part for that
setting (for example applying screen sharing or sending the character home), then:
- tells every window (`settings-changed` with the values, the project, what changed and any problems); `settingsStore.ts`
  in each window (Home, the character, the overlay, the island) takes the new snapshot and `useSetting(key)` draws again.
  Before the first snapshot, `setting(key)` gives the usual value (or the old page storage, below), so a page never breaks.
- if a setting the engine applies changed in `settings.json`, sends the engine `settings.apply` with every engine setting
  that differs from usual and the current project's own. Each replaces the one before, so a reset reaches the engine as a
  missing name.
- for the engine's own stores, sends their existing command itself; the pages learn the result from the existing events
  (`spending.state`, `explain.state`, `memory.state`, `metrics.summary`). Pages no longer send these four; they are off
  the page allow list.

`settings.apply` is the first line the engine reads after every start and restart (queued on the new engine's own queue
before it can be reached by anything else), sent again after each change the engine applies and when the project folder
changes, and never accepted from a page. The engine (`runner/src/settings.ts`) checks each value again with
`protocol/settings.ts`, uses the usual value for anything refused, ignores names it does not know, keeps the values in
memory only, never writes a file, and answers `settings.applied` with names only. A running task keeps what it started with.

### Migration, losing nobody's choices
Only Home's window, on its first start after the update, reads the old page storage with exactly today's meaning and
calls `settings_migrate` once: `companion.reactions` (notOff) to `fun.reactions`; `companion.yourTurn` (isOn) to
`teach.yourTurn`; `companion.textSize` (textSize) to `display.textSize`; `companion.speak` (isOne) to `talk.speak`;
`companion.speakReplies` (isOne) to `talk.speakReplies`; `companion.voiceAutoSend` (isOne) to `talk.autoSend`;
`companion.showmeAllScreens` (isOne) to `showme.allScreens`; `companion.updateAuto` (notZero) to `updates.daily`. The shell
writes only names not already set, drops invalid values, records `pageStorage.v1` and refuses a second run. Until the mark
is in the snapshot, every window falls back to the old page storage for these, so nothing flashes a wrong value. Storage
that cannot be read migrates nothing (today's defaults) and is tried again next time. The old page storage is kept for one
version, so going back still works; Delete everything removes it as today. Once the mark is in a snapshot, page storage
also keeps `companion.settingsMigrated` ("1"): with it the old page storage is never read again and the migration only
records the mark again, sending nothing, so a settings.json lost later (damaged, or removed by hand) never brings the
choices from before the update back.

### Reset
- One setting: a Reset button shows only when the value differs from usual (named "Reset {label} to {usual}").
- A section: "Reset this section" shows when anything in it changed, with an inline confirm listing what will change.
  Protective settings are left out. A toast then offers Undo for 10 seconds, for that section's values only.
- Everything: "Reset all settings to usual" at the bottom, with a confirm that names every setting that will change (so
  someone who paused learning reads "Pause learning" there). It resets `settings.json` (the app's and every project's
  values), the wrapped shell stores (come to, presentation, keys through Reset to the usual keys, voice to the Mac's own
  choices) and the engine's (daily limit $10, Explain on, learning on, beta numbers off; their counts stay). It never
  touches the key, project folders, memory lines, history, undo points, pictures, per app answers or anything protective.
  A toast then offers Undo for 10 seconds, which puts the previous values back through `settings_set`.
- What a reset changes is decided by the shell from exactly what the page was shown (`settings.rs` `reset_plan`), and the
  page keeps that same list for Undo (`undoValues`); both run `protocol/fixtures/settings-reset-cases.jsonl`. The engine
  keeps its own three settings, so the page names the ones it has heard away from usual and the shell resets only those.
  One the page has not heard yet is left as it is, and the confirm says "Left as they are, because Companion could not
  read them yet: ...". Undo puts the voice and the keys back only exactly as they were shown (`voice_from`, `keys_from`).
- For area 2 (project settings): Reset all also clears every other project's values, but Undo puts back only the current
  project's. Before the first project setting is registered, either make Reset all clear only this project's values or
  make Undo restore the others, with a test.

### Search
A search box at the top of Settings (a search region; Esc in the box clears it). It matches section titles, labels, help
lines, option words and the `also` words, ignoring case and accents, from the start of words. Results stay under their
section titles; a polite line says how many match; no match says "No setting matches that. Try other words." The fixed
parts (permissions, your Claude key, practice, what Companion keeps, acknowledgements, logs) are searchable too.

### Delete everything
`settings.json` and the kept copy of a damaged one are in Companion's folder, so `wipe.rs` already lists them under
settings and removes them; a test proves both. `dev.json` still stays.

### When something goes wrong
A file that is not JSON (or not text) is moved aside as `settings.damaged.json` (kept for support, removed by Delete
everything) and Companion starts on usual values, with one plain line in Settings; the migration mark is kept and written
at once in a fresh file. A file that is there but cannot be read at all (no permission, an I/O error, a folder in its
place) is left where it is and never saved over: Companion uses the usual values for that session, says so in one plain
line, and reads it again before each change that would write it (refused while it still cannot be read). A single bad value falls back to usual and is listed. A
failed write says "Could not save that setting. It is unchanged." and the control goes back. The activity log records
which setting changed, never its value.

## 2. The areas, one at a time after the core

Each row: the setting, its control and usual value, who applies it, where it reads today, its range, and notes. "Needs a
floor" means a fixed part that must be proven by a test before the setting ships.

### Area 1: Spending and how work runs (engine builder; budgets and models also touch `app/src/commands.ts`)
`work.maxTurns` is built by the core as the worked example, so this area skips it.

| Setting | Control, usual | Applies | Where today | Range | Notes |
|---|---|---|---|---|---|
| `budget.task` Most one task may spend | number, 3 | pages | commands.ts DEFAULT_BUDGET_USD; agent.ts caps at what is left of the day | $0.50 to $50, step $0.50 | Read when the task starts. A follow up and Try again reuse the last task's budget. Never above what is left of the daily limit. Practice stays at $0.60. |
| `budget.plan` Most a whole Drive plan may spend | number, 5 | pages | commands.ts DRIVE_BUDGET_USD in planDrive | $0.50 to $50, step $0.50 | DRIVE_BUDGET_USD is also used by Rescue today; split it so each has its own. |
| `budget.rescue` Most a Rescue may spend | number, 5 | pages | commands.ts diagnose | $0.50 to $50, step $0.50 | Same caps. |
| `budget.research` Most one Research question may spend | number, 2 | pages | commands.ts askResearch | $0.50 to $50, step $0.50 | Same caps. |
| `model.work` Claude for tasks, plans and research | choice recommended / careful, recommended | pages | runner/src/models.ts (a map from option to model, with the price), commands.ts | recommended = claude-sonnet-5-5; careful = claude-opus-5-5 | Option ids are stored, not model ids. An option is offered only after the real smoke test ran it. The engine keeps refusing a model it does not know. |
| `model.rescue` Claude for Rescue | choice careful / recommended, careful | pages | commands.ts DIAGNOSE_MODEL, models.ts | careful = opus; recommended = sonnet (cheaper) | Same real run gate. |
| `model.quick` Claude for quick answers (Prompt help, Explain, Draw it for me, the error explainer) | choice fast / recommended, fast | runner | models.ts, engines.ts, lanes.ts | fast = today's fast model; recommended = sonnet | The lanes must read it per request. COMPANION_FAST_MODEL in dev.json still wins. Check Anthropic's model list first (flag 3). |
| `work.tries` Checks before Companion asks you what to do | number, 3 | runner | agent.ts MAX_TRIES | 1 to 5 | Counted per approach; the budget still caps the cost. |
| `work.askOnAnyFailure` Ask me when the tries run out, even if each failure was different | switch, off | runner | agent.ts sameThree | | Off is today. The loop card still appears at most once per task. |
| `drive.maxSteps` Most steps in a plan | number, 12 | runner | drive.ts | 3 to 20 | The estimate and the plan's budget still apply. Rescue plans stay 3 to 7. |
| `drive.pauseOnMyEdits` Pause a plan when I change the project myself | switch, on | runner | agent.ts, watcher.ts | | Needs a floor: a test that undoing a step never puts back files the person changed during the plan. |
| `work.tryAgain` Try again | choice carry_on / fresh, carry_on | runner | agent.ts, followup.ts | | Fresh still tells Claude how the last attempt ended. Off the record already starts fresh. |
| `approval.waitMinutes` How long a question waits for your answer | number, 30 | runner | engine.ts, sdkEngine.ts HOOK_TIMEOUT_SECONDS | 5 to 120 minutes, step 5 | Needs a floor: no answer always counts as no. The SDK hook's limit is set from the ceiling (120 minutes plus a margin) at engine start. Read when each question is asked. |

### Area 2: Checking your project (engine builder, proof; most settings are per project)

| Setting | Control, usual | Applies | Where today | Range | Notes |
|---|---|---|---|---|---|
| `rules.house` House rules | list built from five kinds (never edit, never run, ask before editing, ask before running, ask before installing packages); no rules | runner | rules.ts, the project's .companion/rules.txt | up to 50 rules; each pattern one line, up to 200 characters | Per project. The file stays the source: read by the editor, written only on Save, lines it does not understand kept exactly. Rules only make things stricter. Protective. Delete everything already keeps rules.txt. |
| `check.mustSee` Words that must be on the page | list, none | runner | proof/ladder.ts expectText | up to 5 items, 1 to 80 characters | Per project, kept in settings.json. If .claude/proof.json exists it wins and the rows show it, read only. |
| `check.press` A button the check should press | text, none | runner | ladder.ts click, browser.ts | up to 60 characters | Per project. A label with a risky word is still never pressed. |
| `check.afterPress` Words that should appear after pressing it | text, none | runner | ladder.ts expectAfterClick | up to 80 characters | Shown only when check.press is set. |
| `check.start` How to start this project for the check | choice auto / the project's own scripts, auto | runner | proof/detect.ts | auto plus the scripts found | Options from the project report; checked again at use. Never a free text command. .claude/launch.json still wins. |
| `check.skip` Checks to leave out | list, none | runner | detect.ts, ladder.ts | only the found typecheck, lint, build and test scripts | Needs a floor: the start check and the browser check can never be left out (F14). Each left out is a gap, so at best "passed with gaps". |
| `check.time` Time allowed for checks | choice normal / longer / longest, normal | runner | ladder.ts, browser.ts, before.ts | normal, 2x, 4x | runLadder must take the limits as a parameter. |
| `check.install` Install packages for a check | choice auto / ask / never, auto | runner | ladder.ts, rules.ts, agent.ts (Rescue's check) | | Ask uses the approval card; no answer is no. While the house rule "ask before installing packages" is present, at least ask. |
| `check.pageSize` Page size for the browser check | choice desktop / phone / both, desktop | runner | browser.ts | 1280x800, 390x844, both | Both takes about twice as long; the row says so. |
| `net.slow` My internet is slow: allow longer | switch, off | runner | deploy.ts, agent.ts, browser.ts, checkpoints.ts | | All projects. Doubles the deploy, promote, rollback, install, clone, browser download and snapshot limits. |
| `pictures.make` Make before and after pictures | switch, on | runner | agent.ts | | Off the record never makes them. |
| `pictures.keep` Pictures to keep | number, 200 | runner | agent.ts KEEP_PICTURES | 0 to 1000, step 50 | 0 shows the picture, then deletes it. Lowering says first how many go. |
| `rescue.readDeployLog` Read my last Vercel deploy log when looking for a problem | switch, on | runner | agent.ts (Rescue and Point at the problem) | | Read only, through the person's own Vercel tool. |

### Area 3: Memory, Explain and teaching (engine builder, with small page changes)

| Setting | Control, usual | Applies | Where today | Range | Notes |
|---|---|---|---|---|---|
| `explain.mode` Explain after a task | choice off / reasons / reasonsAndQuestion, reasonsAndQuestion | runner | memory/store.ts, explain.ts, card.tsx | | Replaces the core's explain.on, kept in memory-settings.json (old explain false becomes off, true becomes reasonsAndQuestion). Remove the copy on the Memory tab. |
| `explain.after` Explain after | choice everyTask / plansOnly, everyTask | runner | agent.ts | | plansOnly also saves money. |
| `memory.learnFromFiles` Learn about the project from its files | switch, on | runner | memory/learn.ts, agent.ts | | Pause still stops all learning. |
| `memory.learnFromWords` Learn how I like to work from what I say | switch, on | runner | memory/learn.ts | | What memory may never hold is fixed. |
| `memory.rememberGoals` Remember the goals of plans I approve | switch, on | runner | agent.ts | | |
| `memory.tellClaude` Tell Claude what Companion remembers | switch, on | runner | memory/store.ts forAgent, agent.ts, main.ts | | Covers tasks and Prompt help. The Pause row says plainly it only stops new lines. |
| `memory.recallLength` How much Claude is told from memory | choice short / normal / long, normal | runner | store.ts, main.ts | 500 and 100, 1500 and 300, 3000 and 600 words | Longer costs more on every task; the help says so. |
| `task.offRecordByDefault` Start every task off the record | switch, off | pages | card.tsx | | What off the record keeps can never be loosened. |
| `memory.toastSeconds` How long "Remembered" stays, with Undo | choice 5 / 10 / 20 / 60 / untilClosed, 10 | pages | card.tsx | | Timing a person can change (accessibility). |
| `recap.after` Show Where was I after a break of | choice off / 30min / 2h / nextDay, 30min | pages | card.tsx AWAY_MS | | Also: teach.yourTurn (moved by the core) should make the engine skip working out Your turn when off. |

### Area 4: Home, island and character (shell builder, with page changes in home.ts and motion.ts)

| Setting | Control, usual | Applies | Where today | Range | Notes |
|---|---|---|---|---|---|
| `island.show` Show the island in the notch | switch, on | shell | main.rs, island.rs | | Needs a floor: off, Home opens beside the character and the hotkey still opens it; the character carries the light for every capture and the microphone (rule 5), proven by a test. |
| `island.peekOnHover` Show status when I point at the island | switch, on | shell | island.rs | | Off: opens only on a click. |
| `island.openDelay` Open the island after pointing at it for | number, 0.4 | shell | island.rs HOVER_IN_MS | 0.1 to 1.5 seconds | F18 lists 0.4 as still to be judged. |
| `island.closeDelay` Close it after moving away for | number, 0.3 | shell | island.rs HOVER_OUT_MS | 0.1 to 1.0 seconds | |
| `island.display` Which display the island and Home use | choice follow / builtIn / main, follow | shell | island.rs, main.rs | | Built in falls back to main with the lid closed. |
| `island.followDelay` Move to another display after the pointer stays there for | number, 3 | shell | island.rs FOLLOW_MS | 1 to 10 seconds | Only with follow. |
| `home.closeOnClickAway` Close Home when I click another app | switch, on | shell | main.rs, island.rs, home.ts | | Esc still closes Home; it never closes while something waits. |
| `home.goToNeeds` When something needs me | choice goToIt / markTab, goToIt | pages | home.ts | | Needs a floor: markTab still marks the tab and the island and is said aloud with Speak to me on. |
| `home.size` Home size | choice standard / large, standard | shell | island.rs CARD, main.rs resize_card, docking.rs | 380 by up to 640; 460 by up to 760 | Clear zones come from the same numbers. |
| `character.edge` Edge for the character on this display | choice left / right / top / bottom, right | shell | docking.rs, main.rs | | Wraps dock.json per screen; a keyboard way to place it. |
| `character.position` Position along that edge | number, 50 | shell | docking.rs | 0 to 100 percent, step 5 | Same entry as the edge. |
| `character.sameEverywhere` Same place on every display | switch, off | shell | docking.rs | | Copies to displays with no place yet. |
| `character.motion` Motion | choice followMac / less, followMac | pages | motion.ts, main.rs, roam.rs | | Less appears in place, inside Companion only. |
| `character.linger` Stay beside a window for | number, 1.5 | shell | roam.rs LINGER_MS | 0.5 to 10 seconds | Still goes home at once on a window change or Stop. |
| `character.overFullScreen` Show Companion over full screen apps | switch, off | shell | main.rs, visibility.rs | | Hold to talk still refuses while hidden (rule 5). |

### Area 5: Pointing, talking and other apps (pages and shell builder)

Status (19 Oct 2026): built on `m11/set-pointing-talk` and tested with fakes (all suites). Not yet tried in the built app on
a real Mac. Where the build differs from the first draft of this table, the row says so: the usual value always keeps
today's behaviour, so the ring colour's usual option is today's orange (not red) and the lettering's is today's plain
caption (not handwritten).

| Setting | Control, usual | Applies | Where today | Range | Notes |
|---|---|---|---|---|---|
| `point.ringSeconds` How long a ring stays | number, 10 | shell and pages | anchor.rs `ring_ms`, `watch_ms`, `watch_polls`; main.rs `draw_pointer_with` sends `ringMs`; overlay.ts `ringMsOf` | 5 to 30 seconds, step 1 | Floor, tested for every value: the window watch and the overlay's busy time are the ring time plus 0.5 seconds, from the same reading. A ring still clears at once when its window changes. |
| `point.yourTurnSeconds` How long a your turn ring waits for your click | number, 90 | shell | yourturn.rs `wait_ms`, main.rs `your_turn` | 30 to 300 seconds, step 15 | The mouse is read only inside that loop, while the ring is up. |
| `point.colour` Ring colour | choice orange / yellow / blue / highContrast, orange | pages | pointer.ts `ringLook`, overlay.ts | | Orange is today's ring. High contrast is white with a dark edge. The guess ring keeps its dashed amber look in every colour. |
| `point.lettering` Ring lettering | choice plain / handwritten, plain | pages | pointer.ts `captionStyle`, overlay.ts | | Plain is today's caption. Captions now follow text size (standard is today's 15 points). |
| `point.guesses` When Companion is only guessing | choice softRing / wordsOnly, softRing | shell | showme.rs `solid`, `said_in_words`; main.rs `showme_aim`, `point_problem`; card.tsx | | Floor: solid needs a confirmed target in a known window whatever the setting; below 0.4 nothing is drawn (sequence.ts). Words only answers `why: "guess"` and the page says where to look. |
| `point.pace` Pace of step by step pointing | choice slower / normal / faster, normal | pages | pointer.ts `paceFactor`, `flightMs`; sequence.ts `leadMs`, `afterMs`, `lineMs`; speech.ts `lineFor` | x1.5, normal, x0.75 | Still scaled by the voice speed. Faster never shortens a spoken line. |
| `drawIt.seconds` How long Draw it for me stays | choice 10 / 15 / 30 / untilClosed, 15 | shell and pages | diagram.rs `shown_ms`, `timing`; main.rs `show_diagram`; overlay.ts | | One setting drives both sides: the shell hides one second after the page's time (busy half a second more), so 15 gives today's 16 and 16.5 seconds. Until closed: Close and Stop everything clear it, and so does Companion being hidden; a new picture may replace it. |
| `talk.maxHold` Longest hold to talk | choice 30 / 60 / 120, 60 | shell | voice.rs `max_hold_ms`, `Hold::down_for`, `stopped_words`, `buffer_samples`; voice_mac.rs `buffer_room` | | Floor: there is always a cap, at most two minutes, read when the keys go down; the recorder keeps room for the cap and ten seconds (70 seconds for a minute, as before). The microphone is open only while the keys are held and the light is on. |
| `speak.alsoSay` Also say out loud | list from needsYou, taskDone; none | pages | speech.ts `alsoSayLines`, card.tsx | | Only with Speak to me on; fixed words only, never the task's or the question's text; quiet during calls and the secret check still hold in the shell. A task with skipped checks is never said to have passed. "All done. Every step is finished." comes from strings.ts (`S.lessonDone`). |
| `ph.style` Prompt help rewrites | choice full / light, full | shell | prompthelp.rs `style_of`, phelp.rs `send_prompt` | | The engine already supported light. |
| `ph.useProjectInfo` Use project info in Prompt help | switch, on | runner | lanes.ts `AssistService.prompt` | | Off sends no project description. What Companion remembers is left to its own setting (area 3). |
| `ph.handBack` Give the suggestion back by | choice paste / copy, paste | runner | prompthelp.ts `handBack`, lanes.ts | | Terminals always get copy (T11, fixed). |
| `ph.appAnswers` Apps Prompt help and the error explainer may read | custom (store promptHelpApps, prompt_help.json), protective | shell | prompthelp.rs `apps_op`, `Consent::change`; phelp.rs `apps_value`, `apps_change`; settingsPage.tsx `AppAnswers`; appanswers.ts | per app answer | Floor: the built in never list (any case) can never be changed or forgotten; a never the person added is loosened only after the inline confirm; Forget all keeps the nevers; no reset touches it. Answers given on the card show in Settings at once. |
| `pointat.editor` Open files in | choice editorInFront / cursor / vscode / windsurf / macDefault, editorInFront | shell | pointat.rs `choose_editor_for`, `missing_words`; main.rs `point_problem` | | One not on this Mac falls back to today's order and says so. |
| `calls.apps` Apps that count as a call | list, the seven built in ids | shell | presentation.rs `call_apps_from`, `quiet_with`; main.rs `quiet`, `front_app`, `app_names`; callapps.ts, settingsPage.tsx `CallApps` | each built in app on or off, plus up to 20 added | Only the front app's id is stored and compared (rule 7). At most 20 added apps count, whatever the list holds. A call in a browser still cannot be noticed. |

## 3. Never a setting
- Deny rules and protected places (.git, .claude, .companion never written; nothing outside the project; no sudo; no
  private home folders; no system folders as projects). House rules may only add to them (rule 12).
- Approvals before anything destructive, outside the project, touching the person's git, installing, reaching the network
  or deploying. No always allow, trust this project, auto approve or let Companion commit (rules 10 and 13).
- An unanswered question counts as no. Only the wait may change (area 1).
- A tap before going live, rolling back or undoing one task; a blocked ship gate cannot be confirmed away (rule 13).
- Stop everything is always there, always stops everything, always has keys and its menu item. Its keys may move; it can
  never be unbound, turned off or made partial (rule 11).
- Screen, other apps' text and the microphone only on a hotkey with the light lit first, never while hidden, never in the
  background, captures never on disk (rule 5). No watch my screen, wake word or save screenshots.
- No key events and no Input Monitoring. The key picker stays a list of chords; never a record keys field (rule 8).
- Permissions are asked the first time their feature is used, never at install (rule 8).
- The API key lives only in the Keychain and is never shown, logged or saved to a file (rule 2).
- Never routing Claude usage; the subscription route stays behind the remote switch; developer settings stay in dev.json
  (rules 1 to 3).
- Never bypassPermissions; the sandbox stays on (rule 13).
- Only the bundled Claude binary, with no project settings files, hooks or MCP servers loaded (rule 20).
- Honest proof: the browser check can never be turned off (F14), a gap is never shown as passed (rule 14).
- What memory may never hold (health, money, relationships, moods, secrets, contact details) (rule 15).
- Off the record keeps nothing; it may become the default, but what it keeps can never be loosened.
- The reviewer and planning change nothing; Rescue only looks; Research opens only safe public pages (rule 12).
- Password managers and secure typing are never read; the built in never read lists only grow.
- Redaction always runs before anything is sent, said or copied.
- Do it for me presses only a plain labelled button, link or tab (rules 8 and 13).
- Targeting: solid only on a confirmed target, clipped to its window, cleared when it changes; nothing below 0.4 (rule 22).
- Panels never take keyboard focus (rule 9).
- Companion's own machinery never writes the person's git (rule 10, F13).
- Only signed updates, installed only on a press.
- The daily limit can never be turned off or set above $500, and no budget can exceed what is left of the day.
- Tone: no affection, streaks, mood check ins or friendly mode (rule 16).
- Founder cut features get no switch (F18's general assistant features, the experimental Computer Use pointing lane,
  notifications and other proactive popups, an "Answer the setup questions again" button).

## 4. The core build

### Scope
The registry, the shell store, the engine path, the page store, the new Settings page (sections, search, every kind of
row, Reset for one setting, a section and everything), the page storage migration, and every existing setting registered.
Exactly one new setting, `work.maxTurns`, as the worked example. No other area settings.

### Registered by the core
`keys.hotkeys` (custom, keys.json, shell), `talk.voice` (custom, voice.json, shell), `talk.speak`, `talk.speakReplies`,
`talk.autoSend` (switches, off, settings.json, migrated, pages), `character.comeTo` (on, dock.json, shell), `sharing.hide`
and `calls.quiet` (on, presentation.json, shell), `showme.allScreens` (off, migrated, pages), `fun.reactions` (on,
migrated, pages), `teach.yourTurn` (off, migrated, pages), `display.textSize` (Standard, Large, Larger, Largest; migrated;
pages), `updates.daily` (on, migrated, pages), `spend.dailyLimit` (1 to 500 dollars, step 0.01, usual 10; spending.json;
the engine), `explain.on` (on; memory-settings.json; the engine), `memory.paused` (off; memory-settings.json; the engine),
`numbers.on` (off; metrics.json; the engine), and `work.maxTurns`.

### The worked example
`work.maxTurns`: number, section work, usual 80, 20 to 200, step 10, a count, for every project, applied by the engine,
kept in settings.json, from the next task. Words: "Most turns in one task"; "A turn is one step where Claude reads, runs or
changes something. A long task can stop here before it reaches its spending limit. The spending limit still caps the
cost." Path: the row, `settings_set`, settings.json, `settings-changed` to the pages, `settings.apply` to the engine,
`RunnerSettings`, read when a task starts, the SDK's `maxTurns`. A running task keeps its number. It covers every agent
session (tasks, Drive, Rescue, Research, planning); the one turn quick lanes stay at 1. A task that reaches it ends as
`error_max_turns`, worded on the card as "Stopped: this task used the most turns allowed (Most turns in one task, in
Settings). Nothing more was run.", in What I did as "Stopped at the most turns allowed" (in the Stopped group), and for a
Drive plan as "Stopped after N of M steps: a step used the most turns allowed (...)". Never "try again": the same task
would stop at the same place.

### The Settings page
- Top: the title, the search box (a clear button, Esc clears it) and a polite line with the count.
- Sections in registry order, each with its title, its rows and "Reset this section" when anything changed. Then the fixed
  parts, which are not settings but are searchable. Last: "Reset all settings to usual".
- Rows by kind: a switch is a button with role switch saying On or Off; a choice is a radio group with the arrows (a menu
  with more than four options); a number is a box with minus and plus, kept on Return or when the box is left, never kept
  when invalid, with the plain reason; text is a box with a length limit, the same way; a list shows items with Remove and
  an Add box; custom embeds the existing editor.
- Every row has its label, a help line, "Usual: X", Reset when changed, "From the next task" when it is not at once, the
  fixed part when there is one, and for a project setting "This project: <folder>" or disabled with "Choose a project
  folder to change this".
- Keyboard and VoiceOver reach everything; text size and reduced motion are respected.

### Tests (written first; each seen failing first)
- Rust: the registry reads and every definition is valid; a broken one is caught; validation matches every shared case;
  a missing file gives usual values; a damaged file is kept aside and gives usual values with one problem, keeping the
  migration mark (a migration after it writes nothing); a file that cannot be read is neither moved nor saved over, and is
  read again before a change; what a reset changes in each store matches every shared reset case and comes from what the
  page was shown, the engine's own only when the page names them; Undo's voice and keys come back only as shown; one bad value
  falls back and is listed; unknown names survive a write; a usual value is not stored; set, reset of one, a section and
  everything (protective left out); only Home's window may change settings; migration writes only unset valid values once;
  project values are kept under the hash, never the path; the settings line holds only what the engine applies; the
  engine's first line is the settings line after every start, even with a page command sent at once; a page can never send
  settings.apply, spending.set, explain.set, memory.pause or metrics.set; the stand in is accepted only for spending.show
  and memory.list (and lessons); Delete everything removes settings.json and its damaged copy and keeps dev.json.
- Engine: settings.apply and settings.applied parse; invalid values give usual ones and are listed as refused; unknown
  names are ignored; project values apply only to the named project; maxTurns is 80 by default, 120 after an apply, a
  running task keeps its number, 500 is refused and stays 80, planning reads it too, and the SDK gets it; Explain, pausing
  and the daily limit work with the stand in and touch no folder; the daily limit tests pass unchanged.
- Pages: the migration reproduces today's meaning for every old key and value, absent keys and storage that throws; the old
  storage decides until the mark is there; setting(key) gives the usual value with no snapshot; search by label, help,
  option and other words, ignoring case and accents, grouped, with the empty message; every setting and option has words
  and nothing is left over; each kind of row; Reset only when changed and never for a protective list; what the page names
  and keeps for Undo matches every shared reset case; Undo sends each kept value back through settings_set in order and
  carries on past a refusal; Reset this section and Reset all both name what changes and both offer Undo; the migration
  flag is set from a snapshot with the mark, and with it nothing from before the update is read or sent; no "on" or "off"
  written in the Settings code; the stand in never becomes the Memory tab's state; the most turns stop is in plain words.
- Then the whole suite: `sh scripts/test-all.sh`, gated on its exit code.

### What done means
Build and open the app (`sh app/scripts/build-app.sh`) and check it stays running. On a Mac with the old version's choices
(reactions off, text size large, auto send on), update and confirm every choice carried over. Change a setting, quit,
reopen, and it is still there. Reset a section, then Undo. Pause learning and lower the daily limit, then Reset all: the
confirm names both, and Undo puts both back. Delete everything removes settings.json. maxTurns is proven by
the fake engine; a real Claude run is optional and only when the founder says go. The keyboard and VoiceOver pass needs a
person: "not proven" until the founder tries it. None of these real checks were done in the core change (the build was
not opened by its instructions); they are owed before anything ships.

### Docs
T16 (why one registry, why JSON, which stores are wrapped and why, the migration); docs/architecture.md (the settings
module and a feature row); AGENTS.md repo map (protocol also holds the registry). The changelog line ("Settings has a
search box, and every setting can be put back to its usual value. Your choices carry over.") is left for the founder to
add when merging.

## 5. Flags for the founder (not settings work, found while designing)
1. Shared project notes: when a project has no AGENTS.md or CLAUDE.md, Companion creates both without asking
   (`runner/src/memory/agentsmd.ts`). They are written before the task's Before snapshot, so Undo does not remove them.
   F17 lists shared memory across models as not at launch. This needs a decision, and arguably an incident review, before
   anyone adds a setting for it.
2. Skipping the setup questions still writes "Prefers plain words, no jargon" with the source "your answer at setup"
   (`onboarding.tsx` uses DEFAULT_ANSWERS, whose plain is true). That goes against rule 15. Fix it with a failing test first.
3. Haiku 4.5: `models.ts` says to check its retirement before 15 Oct 2026, and that date has passed. Check before area 1
   offers model choices.
4. Kept fixed in this pass: the 90 seconds Prompt help holds Accept and Esc (changing it changes T11), the second model
   review (developer only until its real run passes), launch at login (a new dependency and a decision record), and the
   menu bar icon switch (hiding it can leave no way back).

## 6. Estimate (an estimate, not a promise)
Core: about 2 days of agent work including tests and the app launch check. Areas: about 1 to 1.5 days each (areas 4 and 5
at the top of that because of shell launch checks). Each area also needs about 20 to 30 minutes of the founder's hands on
checking. Total: about 7 to 9 agent days, built one at a time, core first.
