# M89: Better speech on this Mac, the usage runway, and quiet updates

Status: built 14 Nov 2026, tests pass. Not committed. Nothing was spent on a real model: the spike ran Anthropic's bundled Claude Code against a stand in model on 127.0.0.1, and every other test used fixtures and fake query functions in temporary folders. The Best speech model was downloaded once into the session's scratch folder (never the app's folder) to pin and measure it.

The why comes from the checked research of 13 Nov 2026 (`research-1113/synthesis.md` first). Feature 5, the usage runway, answers the loudest complaint group found (group F in `user-needs.md`, F1 to F9): Codex threads of about 624, 324 and 210 comments (F6, F7, F8), a 331 point Hacker News thread, and Anthropic itself saying people were "hitting usage limits in Claude Code way faster than expected" (F1). It hits Squibby too: Hand Squibby the job and Rescue run on the person's own Claude. The speech part is section M86 of `M84-86-plans.md`.

## (b) The usage runway: the spike first

`runner/test/m89-runway-spike.test.ts` runs the pinned SDK's own bundled binary (0.3.293) against a tiny server on 127.0.0.1 that answers like the Messages API and sends every `anthropic-ratelimit-unified-*` header the binary knows (names read from the binary with `strings`). Throwaway `CLAUDE_CONFIG_DIR` and `HOME`, a made up key that only reaches that server, `settingSources: []`, `strictMcpConfig`, no tools, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `system/init` lists no tools and no servers. No plan login, no credential file, no Keychain.

What the SDK really gives:

1. **API key route (the usual one): nothing about how much is left.** No `rate_limit_event`, even with the plan's headers on every answer. The SDK's `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` says `rate_limits_available: false`, `rate_limits: null`, `subscription_type: null`.
2. **A request turned away (429) is seen on either route:** an `api_retry` system message per try (`error: "rate_limit"`, `error_status: 429`, `retry_delay_ms` from `retry-after`), then a reply with `error: "rate_limit"` and an error result.
3. **Plan route (behind the remote switch, off until Anthropic says yes in writing):** the SDK's types promise `rate_limit_event` with `status` (allowed, allowed_warning, rejected), `utilization`, `resetsAt` and `rateLimitType` (five_hour, seven_day, ...). Read from the types only: tests never use a plan login. [verify]

So the runway is built only from what is real: the plan's own numbers when it is on, and "Claude turned a request away just now" on either route. Nothing is guessed from token counts.

## (b) Built

- **Engine.** `runner/src/runway.ts` reads `rate_limit_event`, `api_retry` (429 or rate_limit only; overloaded and server errors are not the person's limit) and a reply ending on `rate_limit` into one reading: state ok, near or out, source plan or limit_hit, and when present the share used (a whole percent), the reset time and the window. `sdkEngine.ts` passes each to `EngineOptions.runway`; a listener that throws never breaks a run. `agent.ts` tells the pages `usage.runway` only when the reading changed (every limit hit is news), from the task rounds, the look only runs (Rescue, planning) and the second reviewer.
- **Protocol.** Event `usage.runway` (numbers and times only: any other field is refused). Commands `jobs.save`, `jobs.list`, `jobs.drop` (page commands for the chosen project only, never gated) and event `jobs.saved`. Fixtures `m89c1` to `m89c4` and `m89e1` to `m89e5`, read by the runner, the pages and the shell.
- **Saved jobs.** `runner/src/savedjobs.ts`: a table beside the task history (so Delete everything removes it), at most 10 per project, the request's words with anything shaped like a key hidden first and at most 4000 characters. Rescue is saved with no words. Off the record, the page does not offer Save (the runner does not check).
- **The notch.** The hover panel's head shows a small ring beside Settings with "Claude 91%" (`islandPanel.tsx RunwayRing`, `runway.ts runwayMark`): grey while there is room, amber once close (the plan said so, or 80% or more) or reached, and "Limit reached" with a full amber ring when Claude just turned a request away. Its label is the whole sentence, with the reset time. The bare notch stays bare at rest (the founder's 4 Nov decision). Setting `runway.mark` (on).
- **The notch itself did not change in M89.** Only the hover panel gained the ring. The founder's note of 14 Nov ("i hope the notch will be changed") is not met here: a new notch look is a separate founder decision and its own milestone, not part of M89.
- **The warning before a big job.** Run it (Hand Squibby the job with Claude Code) and Rescue ask first when the limit is close (`runway.ts warnBeforeJob`: near or out as Claude said, or the share used at or above `runway.warnAt`, 80% as usual, Off never). The warning (`runwayPanels.tsx RunwayAsk`) offers **Save for after the reset**, **Start anyway** and **Not now**; nothing starts or is saved without one of those presses. A limit hit with no reset counts for 5 minutes (or as long as Claude said it waits). The warning is small (the title and the buttons on one row), names the job (its words, or Rescue) and says when the limit resets (`runway.ts warnLine`); reached says it is reached, and a request turned away says until about when to wait, with "Save for after the wait".
- **Saved for after the reset** (`runwayPanels.tsx SavedJobsList`): in Now's own column, above Today (never pinned under the ask box), each saved job with "Ready to start" once its reset passed (or "Starts best at 3:40 pm", in the same clock style as the rest of Home, `clock.ts`), Start and Remove. A job saved after a limit hit with no reset from Claude (the API key route) keeps the end of the wait as its reset (`runway.ts resetOrWait`), so it never says "Ready to start" while Claude turns requests away. Start goes through the same warning (Save there only closes it: the job is already saved, and the box is left alone), then the usual task path (`agent.start` or `rescue.diagnose`). The job leaves the list only once the task really began (`runway.ts savedStartOutcome`: the before snapshot, or Rescue at work); refused, it stays. Asked when the project opens.
- **Off the record.** Only the page stops a save off the record (it does not offer Save). `jobs.save` has no off the record field and the runner saves what it is sent.

## (a) Better speech, still on this Mac

- **Speech accuracy** in Settings, Keys and voice, More options (`talk.accuracy`, Standard as usual). Standard is the model already used (`ggml-base.bin`). Best is `ggml-large-v3-turbo-q5_0.bin` from the same ggerganov/whisper.cpp repo on Hugging Face, pinned at **574,041,195 bytes** and SHA-256 **394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2** (the Hugging Face API's file list on 14 Nov 2026, repo commit 5359861c739e955e79d9a303bcbc70fb988958b1; a download on this Mac matched both). `app/src-tauri/src/speechmodel.rs` holds both pins and the rules.
- Best downloads only after the person picks it, through the same one at a time download with progress (`voice_download_file`), and is kept only if it matches both pins (`voice_mac::download_model_of`). Until it is here and checked, Standard keeps working. Switching back to Standard deletes it (a download still running is dropped when it finishes). Delete everything removes both (the models folder). The voice worker loads the chosen file and drops a loaded copy of the other one at the next press.
- **Measured on this Mac** (`voice_mac.rs m89_speech_accuracy_measured`, ignored in the suite; five sentences made with `say` into a temporary folder, release build, English):

| | Words right | Time to text, median | Slowest |
|---|---|---|---|
| Standard (148 MB) | 50 of 58 (86%) | 110 ms | 369 ms |
| Best (574 MB) | 53 of 58 (91%) | 1148 ms | 1226 ms |

  Best wrote "Supabase", "sign up" and "home page" right where Standard wrote "SuperBase", "sign-up" and "homepage"; both wrote "Versal" for Vercel and missed "four oh five" as "405" (counted as wrong). Load times depend on the disk cache (Standard 5.8 s cold, Best 0.15 s warm) and are not compared. Audio never leaves the Mac either way; Wispr's API stays out.

## (c) Updates install quietly

The app has an updater (`updates.rs`, `shell_updates.rs`). Now an update the check found can install while the person is away (`updates.quiet`, on as usual; Settings, About, under the daily check):

- **The shell** looks every 30 seconds from its tick (`quiet_update_tick`) and asks the card page (`update-quiet-ready`) only when every condition holds (`updates.rs quiet_install_ok`): switched on, an update found, **5 minutes with no keyboard, mouse or trackpad input** (`idle_seconds`: the window server's idle time, a number only, no event read), nothing running (agents and approvals), no call (presentation.rs), no screen look (a Show me answer or a pointer on the overlay), not listening or speaking, no install under way. It asks at most once every 10 minutes.
- **The page** adds what only it knows (`updates.ts quietInstallOk`: a deploy, an install, a practice, Draw it or Point at the problem under way, speech being understood, typing in Home) and the switch, then calls `install_update` with `quiet: true`.
- **The shell checks again** before it takes the update (the tick must have seen it quiet in the last 90 seconds) and again after the download, before it installs. Then it restarts the usual way and leaves a note (`update-note.json`, the version only). After the restart Home says "Squibby updated itself to version 1.4.0 while you were away" (`update_note_take`, read once and removed; a note over a day old is dropped).
- The release doc (`docs/releasing.md`) says so.

## Tests

- Runner: `m89-runway-spike.test.ts` (3, the real bundled binary against the stand in), `m89-runway.test.ts` (17: readings, the engine passing them on, once per change, saved jobs, the protocol), `settings-registry.test.ts` (the four settings).
- Pages: `app/src/m89.test.ts` (23), `app/dom/m89.test.tsx` (14: the warning, Save, Start later, Not now, Remove, the list asked on open, the quiet install and its note, the ring, and the review's six: a save after a limit hit waits, the warning names the job and the reset, Save on a saved job keeps one copy and leaves the box, a refused start keeps the job, a saved Rescue leaves once at work, the list sits in Now's column), `app/dom/m89Off.test.tsx` (2: both switches off).
- Shell: `updates.rs` (3: the quiet rule, the note, the idle time reads no events), `speechmodel.rs` (4: both pins, Best only once ready, switching frees it, Delete everything), `runner.rs` (1: the fixtures).
- One old expectation changed on purpose: `app/src/settingsPages.test.ts`, About's main level now lists `updates.quiet` after `updates.daily`.
- After the review, these expectations changed on purpose: the ring's short text (`"40%"` and `"91%"` became `S.m89.runway.used`, which now says "Claude 40%"); the warning's line (`S.m89.warn.job` is now a sentence with the reset in it, so the words test calls it); and Start anyway on a saved job now drops it only after the task's before snapshot arrives (the dom test sends that event first).

## [verify] on a real Mac (also in `docs/research/technical_research.md` section 20, item 34)

- A real plan route `rate_limit_event`: that it comes on Squibby's runs, that `utilization` is a fraction (0.91) as the headers are, and that `resetsAt` is in seconds. Needs Anthropic's written yes and the plan switch on.
- That reading the idle time (`CGEventSourceSecondsSinceLastEventType`) never makes macOS ask for Input Monitoring, and that it counts trackpad and keyboard alike.
- A whole quiet install on a signed build: found by the daily check, installed after 5 idle minutes, not during a call or a task, the note shown after the restart.
- Best on an Intel Mac or a Mac with 8 GB, if any is supported: its time to text and memory.
