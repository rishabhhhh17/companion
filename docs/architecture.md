# Architecture: every feature on the map, and where it lives

**Status:** proposed, 6 Oct 2026, before any code; updated 7 Oct 2026 after review. **Read with:** `docs/research/technical_research.md` (how) and `docs/research/product_research.md` section 3 (the feature map). If this file and the research disagree, the research wins until someone fixes one of them.

This file exists so that nothing on the feature map needs a rewrite later. Every feature, including v1.1 and "Later" ones, is assigned now to the modules that will own it. A later feature should only ever mean **new modules plugged into existing seams**, never a change to how the core works.

## 1. The shape in one picture

Three local processes and one small cloud service (technical doc section 2 has the full diagram):

```
 React UI (webview, least trusted)  <-- named commands / events -->  Rust shell (OS, secrets, permissions)
                                                                         |  spawns, JSON lines v1 on stdin/stdout
                                                                         v
                                                    runner (Bun compiled TypeScript: agents, trust, memory)
                                                                         |  spawns
                                                                         v
                                              Anthropic's unmodified Claude binary, git (shadow), dev servers, Playwright
                                                                         |
                         relay (Beta: Cloudflare Worker) <-> phone web app (sealed), Telegram (plain text summaries)
```

The rules that shape the split:

- **The webview never** spawns processes, holds secrets, or sees full screenshots or other apps' text beyond what a card shows.
- **Only Rust** touches the screen, other apps' text and the microphone, and only on a user hotkey (connected sources excepted, read on the user's schedule). Before an image leaves Rust it is redacted and resized.
- **Rust also owns** the Keychain and OAuth. These are not tied to a hotkey: Rust reads the API key (when the user chose one) at every runner spawn and runs OAuth when the user connects a source. `presence` and `watch` also run without a hotkey, but they read only which app is in front, idle time and file change events, never content.
- **Only the runner** talks to agents, git and the relay. It is testable headless through the protocol.
- **The relay** holds sealed payloads it cannot read (ciphertext), push subscriptions and timing. For users who turn Telegram on, it also passes short plain text summaries and low risk button presses to and from Telegram, whose chats are not end to end encrypted, so the summaries never carry code, diffs or secrets. In v1 no other user content sits on Companion servers.

> **Words used here.** One plain line per term, for anyone new to them.
>
> - **NSPanel:** a kind of macOS window that floats above other apps without taking the keyboard away from what you are typing in.
> - **FSEvents:** macOS telling us that a file in a folder changed. It never shows what you type.
> - **PKCE:** a safe way to sign in to another service (such as Google Calendar) in the browser, so Companion never sees your password.
> - **SMAppService:** Apple's built in way to start an app when you log in, with no permission prompt.
> - **Sidecar:** a helper program that ships inside the app and runs beside it. Here it is the runner.
> - **Keychain:** the macOS password store. Companion keeps your API key and tokens there.
> - **TCC permission:** one of the macOS privacy switches (Accessibility, Screen Recording, Microphone, Automation) that the user turns on in System Settings. TCC is Apple's name for the system that stores them.
> - **Shadow git:** a private git history that Companion keeps in its own folder to snapshot a project, so undo never touches the user's own git.
> - **gc:** garbage collection, which deletes old snapshots to free disk space.
> - **Nonce:** a one time random number in each approval, so an old approval cannot be replayed.
> - **Durable Object:** a small unit of Cloudflare storage with its own address. The relay keeps one per paired phone.
> - **`dontAsk`:** a Claude Code permission mode that refuses anything not on the allowlist instead of asking. Saved tasks that run unattended use it.
> - **`persistSession`:** a Claude Code option. Set to false, it stops the conversation being saved to a session file.
> - **MCP:** Model Context Protocol, the standard way to give Claude extra tools, such as reading a calendar.
> - **Seam:** a place in the code left ready so a later feature can plug in without changing the core.
> - **Entitlements (in this file):** what the user's plan (Free or Plus) includes. Never anything to do with model usage, which always runs on the user's own Claude. Not the same as Apple's code signing entitlements (permissions an app declares when it is signed), which the M0 plan talks about.
> - **M0 to M12:** the milestones in technical doc section 18. M0 is throwaway proofs, M1 to M9 build the alpha, M10 and M11 the beta, and M12 is v1.1.

## 2. The shared core: four parts every feature reuses

| Core part | What it is | Where it lives |
|---|---|---|
| **Characters** | One state machine per character, driven by agent events; cards with proof and controls | UI `characters`, `dock`, `cards`; Rust `windows`; states come from runner events plus three the shell adds itself (`off`, `seeingScreen`, `readingText`) |
| **Agent engine** | Three lanes behind one `Engine` interface: agent sessions (Sonnet 5.5, Opus 5.5 for planning), fast lane (Haiku 4.5, no tools, warm), vision session (Sonnet 5.5, only `point_at`, `zoom`, `finish`). Every lane runs with `strictMcpConfig: true` | Runner `engine`, `agents`, `auth` |
| **Memory** | Plain markdown files the user can read and edit, plus a local SQLite task log | Runner `memory`, `tasklog`; UI `memory-page` |
| **Trust layer** | Safety hooks and deny rules, shadow snapshots, proof ladder, approvals, receipts, budgets; permissions and consent on the OS side; the kill switch | Runner `safety`, `checkpoints`, `proof`, `approvals`, `receipts`, `ledger`, `interrupts` (kill switch registry); Rust `permissions`, `hotkeys` and `supervisor` (kill switch) |

## 3. Modules

The First column gives the milestone when a module first appears (technical doc section 18). Alpha milestones are M0 to M9, Beta is M10 and M11, v1.1 is M12.

### Rust shell: `app/src-tauri/src/`

The folder starts in M1 with only `secrets` (the Keychain key) and `supervisor` (spawning the runner). Every other Rust module arrives from M2.

| Module | Owns | First |
|---|---|---|
| `windows` | NSPanel conversion, dock geometry per display (display id, edge, offset percent), card window sizing, overlay panels per display, full screen behaviour | M2 |
| `hotkeys` | Global shortcuts and rebinding; temporary hotkeys only while a card is up (accept, Esc); the stop everything hotkey | M2 |
| `presence` | Frontmost app (NSWorkspace notifications, no permission). "Typing" means a terminal, editor or text app is in front. "User returned" means a screen unlock, the system idle time (read with no permission, **[verify]** in M2) resetting after N minutes or more away (default 30), or a click on Companion. Call app frontmost, camera or microphone in use. Never key events, never an event tap, never content | M2 |
| `presentation` (`presentation.rs`, M11) | Screen sharing and calls (rule 7), two settings on unless turned off, kept in `presentation.json` in the data folder: hide from screen sharing (the overlay and the card set NSWindow sharingType none, best effort, applied at launch and when changed) and quiet during calls (no speech, no reactions or confetti while a known native call app is in front, by exact bundle id). The camera in use check is written but switched off (`CAMERA_CHECK_ON`) until a real Mac shows it never prompts. Checked only at the moment something would be said or played, never on a timer. Commands `presentation_settings`, `set_presentation` (card only), `quiet_now` | M11 |
| `assist::text` | Read the focused field (Accessibility, waking Electron and Chromium apps' accessibility per app session), Edit > Copy fallback, write back by paste, clipboard save and restore only when macOS allows it silently, secure field refusal, per app consent | M5 |
| `assist::capture` | One ScreenCaptureKit capture of the cursor's display, Companion and password managers excluded, memory only. From M11 (`showme::start_on`), when the person turns on "Show me on all screens" (off by default), every display under the same light, the cursor's first, at most four, each labelled "Screen N of M" for the model (`coords::screen_label`), each read with the careful text reader so its secrets are covered as well as the first one's; the windows on screen (owners and sizes) are noted with the picture so nothing is drawn over a window that changed since (`showme::unchanged`) | M6 |
| `assist::redact` | Black out secure fields and secret looking strings before anything leaves Rust; count what was hidden | M6 |
| `assist::resize` | After redaction, scale each capture so neither Claude Code nor the API resizes it: at most 2000 px on the long edge (Claude Code's cap as read from its binary; spike e confirms it), about 1280 px by default, Retina scale handled, final size sent with the image so `point_at` coordinates map back one to one | M6 |
| `assist::ocr` | On device text recognition boxes | M6 |
| `assist::snap` | Accessibility hit test, OCR match, pixel to point to global coordinate mapping (per screen from M11: `coords::shot_for`). A multi step answer is snapped one target at a time as the page sends it (`showme_aim` with step, of, screen and mark; `showme_hide` for a step said in words) | M6 |
| `voice` | Microphone while the key is held, on device Whisper, model download; read aloud of short status lines with `AVSpeechSynthesizer` system voices, only when turned on in `settings` (off by default) | M2 |
| `watch` | FSEvents on the active project (take the wheel); on granted folders from v1.1 | M4 |
| `secrets` | Keychain: API key, deploy tokens, connector tokens | M1 (one of the two first Rust modules) |
| `permissions` | Permission state, first use explainer, request, denied recovery, consent table. Covers Accessibility, Screen Recording, Microphone and, from M12, Automation for Apple Mail. Never Input Monitoring | M2 |
| `supervisor` | Spawn the runner, inject env (login shell `PATH`, key), frame JSON lines, restart, version check, image handoff, send entitlements (a fixed alpha value until `account` lands), fan out the kill switch to the runner and to `voice`, `assist`, `windows`, `scheduler` and `connectors` | M1 (one of the two first Rust modules) |
| `connectors` | OAuth (PKCE, loopback) for sources the user connects; `connectors::mail` reads Apple Mail through AppleScript or JXA scoped to Mail.app, only from mailboxes the user picked | M12 |
| `scheduler` | Timers and folder triggers for saved tasks | M12 |
| `account` | Plus entitlements (sent to the runner, see the entitlements seam in section 5) and billing handoff to the merchant of record | M10 |
| `platform` | `macos` and `windows` implementations behind traits used by every module above | M2, Windows in M11 |
| `app` | Tray, launch at login (SMAppService), updater, single instance; opens the Terminal sign in (the runner's `.command` file, through `open`) | M2, hardened M9 |
| `commands` | The short list of Tauri commands the UI may call | M2 |

### Runner: `runner/src/`

| Module | Owns | First |
|---|---|---|
| `protocol` | Uses the top level `protocol/` package: envelope, commands, events, validation, refuse unknown `v` | M1 |
| `engine` | `Engine` interface; folders named after the engine ids: `engine/claude-agent-sdk` (agent sessions, fast lane, vision lane), later `engine/messages-loop` and `engine/codex-app-server`. Every lane runs with `strictMcpConfig: true`; tests check that `system/init` lists zero tools in the fast lane and only `point_at`, `zoom` and `finish` in the vision lane | M1 |
| `auth` | Four states (Plan, API key, Cloud, Not connected) plus Unknown with the raw JSON. First run and routine detection use a dedicated long lived streaming `query()` whose prompt has not yielded anything yet, then read `accountInfo()` or `initializationResult()` and `system/init`; this spends no tokens. It is not the warm fast lane handle: a `startup()` handle has only `query()` and `close()`. Whether this works with no login at all is checked in spike (c). `<claudeBinPath> auth status` (the bundled binary, never a `claude` on `PATH`) runs only while waiting for the Terminal sign in (every 3 seconds, stopping at the first signed in result or after 5 minutes), on "Check again" and in diagnostics. Never at first run or launch, never on a background timer (open bug 95822: it can spend the refresh token and sign the user out). Same binary and config folder as the sessions. `CLAUDE_CONFIG_DIR` stays unset on the plan route unless the user's login shell already sets it; on the API key route agent sessions and both lanes use `runner/claude` in Companion's data folder (`engineEnv` in `runner/src/engines.ts`), so Delete everything removes the conversations Claude Code saves (agreed by the founder 16 Oct 2026, T03). Writes the `.command` file that runs `<claudeBinPath> auth login` and unsets every stripped variable. `buildChildEnv` strips every variable that could override the chosen route and adds `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, so Bash commands, hooks and stdio MCP servers that Claude Code starts get no credentials. A second env with no `ANTHROPIC_*` keys for the runner's own spawns (dev server, Playwright, gitleaks, package installs). Plan route remote switch, active method shown on receipts | M1 |
| `agents` | Agent specs as data (prompt, tools, model, permission profile): builder, rescuer, shipper, researcher, reviewer, guide, prompt helper; later closer, watcher, tutor, analyst, supervisor. Mode profiles as data from M4 (which agents, output style, UI surfaces) | M1, grows each milestone |
| `interrupts` | One interrupt registry. Every runner module that starts work or spawns a process (agent sessions, fast lane jobs, dev servers, Playwright, deploy CLIs, gitleaks, package installs) registers it here. `agent.interruptAll` stops everything registered and holds new work until the user resumes | M1 |
| `entitlements` | One helper that answers whether the current plan includes a feature. The value comes from Rust (`account` from M10, a fixed alpha value before that). Never involved in model usage | M1 |
| `drive` | Plan, run short steps, stop conditions, fix loop breaker, decision cards, pause on take the wheel | M4 |
| `followup` | What a follow up (`agent.send` with text), a Try again (`agent.send` with `retry`) and a single task's different approach say to Claude; the failing check's evidence, redacted and clipped. The runner (`agent`) keeps each agent's last task in memory only (its request, model, budget, how it ended, last failure and conversation id; no conversation id off the record; after a Drive plan, the last step's title, the plan's goal and the plan's whole budget) and runs each follow up as a new checked task. Undo in that project marks it undone, and a follow up on it is then refused | M11 |
| `safety` | `PreToolUse` hooks, deny rules, path guard, git write and irreversible classifiers, `.env` guard, project trust check, permission profiles | M1 |
| `approvals` | Approvals bound to checkpoint, tool call, input hash, nonce and expiry; channels (desktop now, phone later); `defer` for long waits | M1, phone M10 |
| `checkpoints` | Shadow git store per project, snapshot and restore, `.env` vault, caps, gc, per project lock | M1 |
| `proof` | Ladder rungs 1 to 7, `launch.json`, dev server, Playwright, test tamper check, vision evidence, reviewer session; Python projects (`proof/python`: pytest, ruff or flake8, mypy, a Flask, FastAPI, Django or Streamlit dev server, with the project's own virtual environment; never installs a package, and Point at the problem says what to install instead; an empty SQLite file a dev server made is removed after) and pytest's report (`proof/pytest`) | M3, rung 7 M4, Python M11 |
| `ship` | Safety gates (gitleaks, Supabase RLS, login protection), Cloudflare and Vercel adapters, preview smoke, live, rollback; reading why the last Vercel deploy failed (`ship/deploy` `lastFailedBuild`: `vercel list` and `vercel inspect <url> --logs`, read only; `ship/buildlog`: the failing line, a missing setting's name, or the sentence) for Point at the problem and Rescue; launch post and "built with" link later | M7, Beta extras M10, deploy failure rescue M11 |
| `memory` | `project.md`, `profile.md`, `session.md`, provenance, scope filter, off the record, house rules, decisions, `AGENTS.md` and `CLAUDE.md` in user projects | M1 files, M8 page |
| `tasklog` | SQLite schema and migrations: tasks, events, decisions, rules, approvals, receipts, ledger, dismissals; later loop items, pattern candidates, saved tasks | M1 |
| `receipts` | Receipt per task from the ledger and the snapshot diff; timeline queries | M3 |
| `ledger` | Cost estimates, per card budget, per project daily ceiling, labelled as estimates | M1 |
| `spending` | The daily spending limit the person chooses in Settings (1 to 500 dollars, default 10): checks it, keeps it in `spending.json` in the data folder, reads it at start (`spending.show`, `spending.set`) | M11 |
| `lessongen` | Lessons made from the person's own project (M11): from the setting names `proof/intake` finds the code reads, a settings lesson for exactly the names not set (where to get each value from a small table of well known names, how to add it to `.env.local` or `.env`, an `env_name` check per name; a name the page could read that looks like a secret gets a warning the person answers instead) and a Vercel lesson for every name the project needs (asked). Plain lesson data put through `walk`'s checks; at most 15 steps; a paused one keeps its names. Reads names only, never a value; runs and writes nothing | M11 |
| `models` | Every model id the runner uses, in one place (T10): agent sessions, Drive planning, Rescue, the reviewer, the fast, vision and pointing lanes. `COMPANION_FAST_MODEL` and `COMPANION_VISION_MODEL` switch the small lanes for testing | M11 |
| `assist` | Prompt help (rubric, target adapters, context block, growth cap, light mode); Show me how orchestration (walkthrough state, short text history). The vision lane (`lanes.ts`) answers with up to five ordered targets, each with a line, a mark and its screen; malformed, off picture and duplicate targets are dropped (`parseTargetsText`); with more than one screen every picture is sent with its label, and the Computer Use lane steps aside | M5, M6 |
| `notice` | Where was I; later recaps, Loop Closer, Pattern Catcher pipelines | M8, M12 |
| `explain` | Explain output style file and the optional check question | M8 |
| `projects` | Project registry and ids, concurrency limit (1 in alpha, 3 in beta), activity timestamps | M1 |
| `demo` | The demo project before any Claude account is connected: a recorded run (protocol events captured from a real run, kept as a fixture) played to the UI through the protocol, each event marked as a demo. No engine call, no network call to Anthropic | M8 |
| `saved-tasks` | Unattended runs in `dontAsk` with exact allowlists, pause after two failures | M12 |
| `connectors` | MCP configs for connected sources, tool allowlists, `requiresUserInteraction` on send, pay and delete tools; each source's on device index (built from what Rust `connectors` and the MCP connectors return), deleted on disconnect while Rust `secrets` drops the token | M12 |
| `relay` | Relay client, pairing, sealed payloads, signed approvals | M10 |
| `timelapse` | Assemble the share video from proof screenshots and the timeline | M10 |

### UI: `app/src/`

| Module | Owns | First |
|---|---|---|
| `characters` | Rive player, state input, skins as data, reduced motion, pause when idle or hidden | M2 |
| `dock` | Docked tab, card stack (three visible, rest counted), drag to float, drop a folder target | M2 |
| `cards` | Agent, decision, approval, Prompt help diff, Show me how caption, Where was I, error, Explain section | M2 onward |
| `askbox` | Plain text input that accepts Wispr Flow and Dictation pastes, voice waveform, send | M2 |
| `overlay` | Pointer arrow, ring and caption inside the overlay panels; from M11 a hand drawn mark per confirmed target (ring, arrow, underline or box, `marks.ts` with the `sketch` pen), kept inside the target's window, faded after its line, never on a guess | M6 |
| `sequence` | Multi step pointing (M11): up to five targets from one answer, played in order (0.9 s lead in, the line, 0.35 s pause), only the last waits for the click, low confidence steps said in words; a lesson uses only the click target (the last one). One answer at a time (`answerPlayer`): closing the card, holding to talk, Point at the problem, Stop and a new question end it, with any line still waiting to be said; the shell ends its side too (`showme::Pending`, the "hush" event) | M11 |
| `memory-page` | "What I know about you": provenance, Edit, Forget, Pause, Erase all, off the record | M8 |
| `timeline` | Per project timeline and receipts with undo | M3 |
| `onboarding` | Pick a character, connect Claude, demo project, questionnaire, permission explainers | M8 |
| `settings` | Hotkeys, permissions, per app consent, connected sources, quiet rules, read aloud toggle (off by default), privacy page with delete all; later the mode switch | M2 onward |
| `shelf` | Project shelf and parallel projects | M10 |
| `strings` | Every user facing word and every name, so renaming is one file | M2 |
| `activity` | The agent's latest one or two steps in plain words for the card ("Reading signup.js", "Running the tests"), never the raw command, secrets hidden again | M11 |
| `state` | Store fed by runner events; character state reducer | M2 |
| `bridge` | Typed wrappers for Rust commands and event channels | M2 |

### Everything else

| Folder | Owns | First |
|---|---|---|
| `protocol/` | JSON Schema for every command and event, TypeScript types and validators, shared fixtures that the Rust and TypeScript suites both parse | M1 |
| `evals/` | `prompt-help/`, `show-me-how/` (about 100 labelled screenshots we curate, never user captures), `voice/`, `rescue/` (10 real stuck projects), `projects/` (seeded broken projects for M3) | M3 onward |
| `relay/` | `worker/` (Cloudflare Worker and Durable Object, Telegram bot), `phone/` (the PWA) | M10 |
| `spikes/` | M0 throwaway proofs | M0 |
| `scripts/` | Copy Anthropic's binary byte for byte from the pinned SDK package into `app/vendor/` (`spikes/b-sidecar/vendor/` in the M0 spike), a folder git always ignores, then into the app through `bundle.macOS.files` (never as an `externalBin`, which Tauri re-signs); `app/src-tauri/binaries/` holds only the runner sidecar. Assert its signature (team `Q6L2SF6YDW`) and SHA-256 against the npm package are unchanged. On Windows (M11) the `win32-x64` binary ships as a plain resource, never an `externalBin`, with the same CI hash check; **[verify]** in M11 that Tauri's Windows signing leaves it untouched. Signing and notarization helpers, `test-all.sh` | M0 |

## 4. Feature map to modules

Every row of product doc section 3, plus the features the brief and the technical doc add (presentation mode, skins, manners, connect Claude, permissions, saved tasks, billing, Windows, distribution). Release labels follow the product doc: **Alpha** (Mac, M0 to M9), **Beta** (M10, M11), **v1.1** (M12), **Later** (gated modes and platform work).

### Presence

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Characters and dock | Alpha: one character, all states. Beta: full set | `windows`, `platform` | Emits `agent.state` | `characters`, `dock`, `state` | Characters: the state machine. Engine: agent events mapped one to one onto states |
| Cards (proof, Stop, Undo, Receipt) | Alpha | `windows` (card sizing) | `receipts`, `checkpoints`, `proof`, `engine` (interrupt) | `cards`, `timeline` | Trust: receipts, snapshots, proof results. Engine: interrupt |
| Skins | Beta | None | None | `characters` (data bound view models) | Characters: skins change material, never the silhouette |
| Presentation mode | Alpha | `presence` (call app, camera, mic in use), `presentation` (M11: quiet during calls by call app bundle id, hide from screen sharing), `hotkeys`, `windows` | `approvals` routes to the phone once it exists | `characters` (neutral dot), `cards` (hide contents), `settings` (two switches, on by default) | Trust: never reads content; can be turned off. M11 built the quiet and the sharing setting only; the neutral dot, hidden card contents and the camera check are not built |
| Manners | Alpha | `presence` (never interrupt typing: hold non urgent cards while a terminal, editor or text app is in front, then wait for a pause; never key events) | `tasklog` (dismissals per kind, stop after two) | `strings` (plain, never flattering), `cards` | Memory: dismissals. Characters: one speaks at a time, no sound by default |
| Ask box | Alpha | `hotkeys`, `windows` (key only while typing), `voice` | `agents` (pick the right agent), `projects` (dropped folder) | `askbox`, `dock` (drop target) | Engine: start the right agent. Memory: project registry |
| Voice | Alpha | `voice` (also read aloud, opt in), `hotkeys` (hold to talk), `permissions` (Microphone) | Receives text only | `askbox` (waveform), `characters` (listening), `settings` (read aloud toggle, off by default) | Trust: mic only while held, transcribed on the device; replies read aloud only when turned on, short status lines only |
| Stop everything | Alpha | `hotkeys`, `supervisor` (fans out to the runner and to each Rust module that owns running work), `voice` (ends the microphone), `assist::capture` (ends capture), `assist::text` (cancels a read), `windows` (hides overlays), `scheduler` (paused until resumed, from M12), `connectors` (stops source reads, from M12) | `agent.interruptAll` reaches the one interrupt registry in `interrupts`, which stops `engine` (all three lanes), `drive` (no next step), `proof` (dev servers, Playwright, retry loop), `ship` (deploy CLIs, preview smoke), `assist`, `notice` and `explain` (fast lane jobs), `saved-tasks` and `connectors`. Every module that spawns a process registers it there | `characters` (off) | Trust: one hotkey stops every agent, task, capture and the microphone. Test: with a deploy and a dev server both running, the kill switch stops both, and nothing restarts until the user resumes |
| Onboarding questionnaire | Alpha | None | `memory` (answers saved with source) | `onboarding`, `memory-page` | Memory: profile from explicit signals; each answer visibly changes behaviour |
| Connect Claude and first run | Alpha | `secrets` (API key), `app` (opens the runner's `.command` file with `open`, so Terminal runs Anthropic's own `<claudeBinPath> auth login` with no Automation permission, **[verify]** in spike c) | `auth` (four states plus Unknown; detection as in its module row; writes the `.command` file), `demo` (recorded run, no engine call), demo project in `projects` | `onboarding` | Engine: auth detection, never touches tokens. Plan route behind a remote switch. A Console sign in route (`<claudeBinPath> auth login --console`) is a pending founder decision. Test: the demo makes no network call to Anthropic |
| Remote approvals | Beta | Pairing QR in `windows` | `relay`, `approvals` (channels, signatures, `defer`) | `settings` (pairing); phone app in `relay/phone` | Trust: approvals bound to checkpoint and tool call; Telegram only for low risk |

### Help you use AI better

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Prompt help | Alpha | `assist::text`, `hotkeys` (temporary accept and Esc), `permissions` (Accessibility, per app consent) | `assist` (rubric, target adapters), `engine` fast lane | `cards` (diff card), `characters` (readingText) | Engine: fast lane. Memory: project context and house rules for granted folders. Trust: consent, no content logs |
| Visual receipt and "it's live" card (M10) | Friends preview | `share` (Save picture to Downloads, never over a file; Copy link, web addresses only) | `proof/before` (the earlier version from a snapshot into a private folder, started and photographed), `proof/visualdiff` (what is new on the page), `proof/picture` (circles; picture comparison when only the look changed), `ship/card` (1200 by 630 card of the live site), `checkpoints.exportTo` | `cards` (receipt picture, share card) | Trust: pictures of the app being built only, in the hidden browser, never the screen; kept privately (newest 200); the project is never touched; Stop everything ends it |
| Draw it for me (M10) | Friends preview | `diagram` (validate, then draw on the overlay; never a capture), `windows` (overlay; replaced by any pointer; busy while shown) | `diagram` (model request from the project only: failing line, stack, routes and calls; strict parse), `diagram.ask` | `layout` (boxes and arrows laid out in code), `sketch` (hand drawn strokes, deterministic), `overlay`, `cards` (Why? Draw it) | Trust: no screen capture; at most 6 boxes; secrets covered; Stop everything and Close remove it; reduced motion respected |
| Guided lessons (M10, M11) | Friends preview | `anchor` (a ring belongs to one window: clipped to it, cleared if it moves, is covered or the app changes; from M11 `anchor::watch` also watches every ring that does not wait for a click, such as a step in the middle of a multi step answer or Point at the problem's line ring, for its whole ten seconds counted from the draw; a ring with no ordinary window under it, over a menu, a dialog or the desktop, is watched against the app in front, `anchor::Watched`), `yourturn` (click by mouse position and button only), `windows` (overlay) | `walk` (lesson format, checked; progress; proof per step; a ring click the project cannot prove yet waits and only the person's own "I did it" can count a step as not working; never repeats a failed step; resume at the first step not proven done, asking "Did you already do this?" for steps only the person can confirm), `walkservice`, `lessongen` (lessons made from the project's own setting names), `walk.*` (`walk.step` `already`, `walk.lessons` `fromProject`, `walk.acted` `pressed`, `walk.wait`) | `lessons` (data files in `lessons/`, plus the user's own folder), `cards` (Lessons) | Trust: lesson files are data with a fixed set of checks, no commands; project only read; setting names never values; key files never read; progress holds step ids only; Stop everything ends every lesson |
| Beta numbers (M10) | Friends preview | none (nothing leaves the Mac) | `metrics` (fixed list of counters per day; watches event kinds and a few fixed words only), `metrics.*` | `settings` (Beta numbers: on/off, show, copy, erase) | Trust: off by default; counts only, no text, ids or paths; local; erased by Delete everything |
| Updates (M10) | Friends preview | `updates` (config check, plain failure words), `check_update`, `install_update` (Tauri updater; signature checked against the key in `updater.json`) | none | `settings` (Updates), once a day check | Trust: nothing without a press except a look; install only when idle and on a press; signed with a key only the founder holds; off until `updater.json` is filled in |
| Speak to me (M10) | Friends preview | `speak` (what may be said, cut, no secrets, no repeats; the Mac voice), `speak`/`speak_stop` commands, silenced by Stop everything, closing the card and hold to talk (from M11 these also end a Show me answer still playing and drop any line still waiting to be said: the "hush" event to the card) | none | `speech` (the switch, which line goes with what is shown), `settings` | Trust: off by default; built in voice only, no cloud; refuses anything secret looking; card only |
| Practice run (alpha, M10 6b; library M11) | Friends alpha | `practice` (copy a sample from the app into a new folder in the home folder, never over anything; a page may name only a practice on the list: `stuck-signup`, `stuck-setting`), `create_practice` | `app/sample/` practice stuck moments, each broken one way on purpose: `stuck-signup` (wrong address), `stuck-setting` (a missing setting), `stuck-route` (a link to a page that is not there), `stuck-import` (a renamed file still imported by its old name), `stuck-open-table` (a Supabase table without row level security in a migration); their expected failing checks are in `evals/rescue-projects/practice.json`, so they are rescue eval cases too; `proof/locate` (reads Node's test output), `ship/rls` (the open table) | `cards` (Practice panel: find it, fix it, prove it; the setting practice is fixed with the lesson made from the project, then the checks run again), onboarding (signup only), Settings (signup and setting) | Trust: signup: a fixed request on a small cap, the person's own key; setting: no model at all, the value is the person's to put in place; skippable. `stuck-route`, `stuck-import` and `stuck-open-table` are not offered in the app yet |
| Installer (alpha) | Friends alpha | `runner::bundled_engine` and `locations_with_bundle` (the engine inside the app, after the developer file and the environment) | `app/scripts/stage-engine.sh` (Bun, the runner, production packages, Anthropic's binary with a checksum), `build-app.sh`, `make-dmg.sh`, `release.sh` (notarization; not yet run) | `docs/alpha/INSTALL.md` | Trust: Anthropic's binary shipped unmodified and never re-signed (rule 4); notarization and the developer certificate are the founder's |
| Crash and log export (alpha) | Friends alpha | `logexport` (compose and scrub: home, user, projects, keys, emails; newest crash report; never overwrites), `main` (`export_logs`) | None | `cards` (Settings: Save a log for support) | Trust: no project content or typed, spoken or screen content; nothing sent; the person chooses whether to share it |
| Settings and delete everything (alpha) | Friends alpha | `wipe` (what Companion keeps, grouped; only its own places removable; links not followed; the marked block removed from AGENTS.md and CLAUDE.md), `keystore` (Companion's own item only; replace and remove the key, exact words to remove), `permissions` (status, never a prompt: the microphone says never asked, turned off or blocked; Accessibility and Screen Recording only on or off), `main` (stops the engine, relaunches; `remove_api_key` tells the engine at once that it has no key), `instance` (one copy at a time: a lock in the data folder, a second copy leaves quietly) | None | `cards` (Settings, permission rows with what to do, the keys to remember, the key, what is kept, two step delete) | Trust: reversible privacy; never touches a project's own files or git; the developer settings file stays; confirmation words are exact |
| Open a project (M10) | Friends preview | `projects` (folder for a copied project), `clone_project` (folder choice) | `proof/intake` (about this project, setting names only), `proof/detect` (lock file choice, .replit run), `proof/clone` (links), `project.inspect`, `project.install`, `project.clone` | `cards` (About this project, Install packages, Open from a link) | Trust: reads files only until the person presses Install; never shows a setting's value; copies only into a new folder; public repositories only, no password asked |
| Reactions and celebration (M10) | Friends preview | `windows` (overlay confetti from the character, never over a waiting ring) | Receives events only | `reactions` (which event earns which reaction, kept calm; the on/off setting), `dock` (character moves), `overlay` (confetti) | Trust: momentum, never affection (rule 16); reduced motion respected; one switch turns it off |
| Your turn (M10) | Friends preview | `yourturn` (click watch: button state and mouse position, polled only while the ring is up; risky labels), `ax::press_at_if` (Do it for me, label checked on the real element), `windows` (overlay hold and celebration) | None | `overlay` (green ring, tick, burst; reduced motion), `cards` (Do it for me, auto next step) | Trust: no Input Monitoring, never keys; nothing that sends, pays, deletes or publishes is pressed for the person (rule 13) |
| Point at the problem (M10) | Friends preview | `pointat` (open the file at its line in Cursor, VS Code or Windsurf, find the line, error or button on screen by its text), `showme::look_for` (one capture, read quickly then carefully, nothing sent), `windows` (overlay), `hotkeys` (Ctrl+Opt+Cmd+F), `permissions` (Screen Recording) | `proof/locate` (a failed rung's output becomes a file and line inside the project, a button, or the error sentence; `proof/pytest` reads pytest's report, and ruff, flake8 and mypy are read too), `problem.find` (check the project as it is, no Claude); when the project's own checks pass and the folder is linked to Vercel (`.vercel/project.json`), `ship/buildlog` reads the last failed deploy's build log through the person's own Vercel tool and points at the line that stopped it (`problem.found` with `from: "deploy"`, or a `note` when the tool is missing or signed out, or a Python package is not installed) | `overlay`, `cards` (What's wrong, Show me where, the note line), `characters` (checking) | Trust: no model call; nothing from the project or the screen leaves the Mac to find the place. The one network read is the person's own Vercel tool fetching their own deployment list and build log, only for a folder linked to Vercel, read only (never a deploy), stopped by Stop everything; the log is cleaned of secrets and never stored. Only files inside the project; a deploy's line is ringed only when it is confirmed (the log's picture of the line reads the same here, the import still names the module, or the file has not changed since the deploy), and a deploy problem with no line here (a setting Vercel lacks) is said in words without looking at the screen (`pointsOnScreen` in `app/src/model.ts`); light before capture, never written to disk |
| Show me how | Alpha | `assist::capture`, `assist::redact`, `assist::resize`, `assist::ocr`, `assist::snap`, `windows` (overlays), `permissions` (Screen Recording, Accessibility) | `assist` (walkthrough), `engine` vision lane | `overlay`, `sequence`, `marks`, `cards`, `characters` (seeingScreen) | Engine: vision lane. Memory: which tools the user uses. Trust: indicator before capture, never written to disk; the display under the cursor unless the person turned on all screens; nothing drawn over a window that changed since the picture |

### Do the work (Build mode)

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Drive | Alpha | `presence` and `watch` (take the wheel) | `drive`, `agents` (builder), `engine` agent sessions | `cards` | Engine: plan mode then `acceptEdits`. Trust: snapshot before every step, proof after. Memory: decisions, house rules |
| Decision cards | Alpha | None | `drive`, `memory` (decision saved, never asked twice) | `cards` (decision card) | Memory: decisions. Characters: needsYou |
| Rescue | Alpha | None | `agents` (rescuer, Opus 5.5 diagnosis), `drive`, `ship/buildlog` (for a folder linked to Vercel, why the last deploy failed, as one more line of evidence) | `cards` | Engine. Trust: snapshots and proof. Memory: finish plan into `project.md` |
| Ship | Alpha: preview and live. Beta: launch post, "built with" link | `secrets` (deploy tokens) | `ship`, `proof` (preview smoke), `approvals` (Make it live) | `cards` (approval card) | Trust: gates, irreversible approval bound to a checkpoint, rollback |
| Research | Alpha | None | `agents` (researcher, no code tools), `memory` (cited notes) | `cards` | Memory: notes with sources, written visibly. Engine: agent session with read only tools |
| Proof and review | Alpha | Runner link (`browser.check`, `browser.install`, no folder or address) | `proof` (rungs 1 to 7), `proof/browsersetup` (the hidden browser's one time download, only on the person's press), `agents` (reviewer, read only) | `cards` (proof; the browser check's offer, progress and Ready line) | Trust: exit codes first, browser second, screenshot only as evidence; the browser download starts only on a press, one at a time, and Stop everything ends it |
| Undo, receipts, timeline | Alpha | None | `checkpoints`, `receipts`, `tasklog` | `cards`, `timeline` | Trust: shadow snapshots, never the user's git; "not undoable" list |
| House rules | Alpha | None | `memory` (rules file), `safety` (rules that can be enforced become hooks) | `memory-page` | Memory. Trust: enforceable rules live in hooks, not prompts |
| Fix loop breaker | Alpha | None | `drive` (three failures on the same error, once per step of a plan), `agent` (the same for a single task, once per task, inside its own fix loop: one undo point and one receipt), `tasklog` | `cards` (different approach card; a single task's card has no step number) | Trust: proof results. Engine: interrupt; Stop and Stop everything answer the card |
| Follow ups and Try again (M11) | Friends preview | `runner` (`agent.send` is project bound) | `agent` (`agent.send`: refused while the agent or the project is busy, and after Undo in that project; carries on the last task's conversation, or off the record starts afresh and is told the request again), `followup` | `cards` (one line follow up box under the receipt, Enter sends; Try again after a task that was not done; hidden once Undo has put the files back), `activity` | Trust: each one is a new task with its own snapshot, the same safety rules, the proof ladder, a receipt, cost booked to the day and the daily limit; Stop ends it |
| Project shelf and parallel projects | Beta | `watch` | `projects` (limit 3), `checkpoints` (per project lock) | `shelf` | Memory: project registry. Trust: one agent per project by default |
| Build timelapse | Beta | None | `timelapse` (proof screenshots plus timeline, never a screen recording) | `cards` (share) | Trust: proof screenshots stored with receipts |

### Notice for you

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Where was I | Alpha | `presence` (user returned) | `notice`, `engine` fast lane, `tasklog` | `cards` (labelled AI written) | Memory: task log rows only. Engine: fast lane |
| Recaps | v1.1 | None | `notice`, `ledger`, `tasklog` | `cards` | Memory: task log over a longer window. Engine: fast lane |
| Loop Closer | v1.1 | `connectors` (OAuth; `connectors::mail` for Apple Mail), `permissions` (Automation for Mail), `watch` (granted folders), `scheduler` | `notice`, `connectors` (each source's on device index), `tasklog` (loop items), `engine` fast lane | `cards`, `settings` (sources) | Memory: local index owned by runner `connectors`, deleted on disconnect (M12 test: disconnecting a source deletes its index). Trust: drafts never send without a tap |
| Pattern Catcher | v1.1 | `watch`, `scheduler` | `notice`, `tasklog` (tool call signatures, intent labels) | `cards` (evidence) | Memory: task log. Trust: approved into a saved task with an allowlist |
| Saved tasks | v1.1 | `scheduler` (timers, folder triggers) | `saved-tasks`, `safety` (unattended profile: `dontAsk`, exact allowlist) | `settings`, `cards` | Trust: never exceed the allowlist; never send, pay or delete without a tap |

### Grow with you

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Explain | Alpha | None | `explain` (output style), `engine` fast lane (check question) | `cards` (collapsible "why") | Engine: output style in agent sessions. Memory: explanation level from the profile |
| Shared memory swarm (Pro, parked, F15) | Later | None | `memory` exposed to other agents (read and write, MCP server), same scope filter | settings | Memory: the plain files stay vendor neutral. Trust: other agents go through the same approvals and proof. Nothing built before the Pro path resumes |
| Memory | Alpha | None | `memory`, `tasklog` | `memory-page`, toasts | Memory: provenance, scope filter (never health, money, relationships, moods, secrets) |
| Tutor | Later (Learn) | None | `agents` (tutor spec), `explain` (Learning style) | `cards` | Engine: a new agent spec and output style, no engine change |

### Later modes and platform

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Learn mode | Later | None | `agents` (tutor spec and the Learn mode profile) | `settings` (mode switch), progress view | Mode profile picks agents, output style and UI surfaces |
| Work mode | Later | None | `agents` (analyst, closer, researcher) | Mode surfaces | Same core; new agent specs |
| Team mode | Later | `account` | `agents` (supervisor), shared policies on top of `safety` | Team view | Trust: policies are more deny rules and allowlists. Memory: shared memory needs the sync adapter |
| Builder drives Cursor's agent and other tools | Later | None | New `Engine` adapter | None | Engine interface; events carry `vendor` |
| Second engine (Codex) | Later | None | `engine/codex-app-server` (`codex app-server`) | None | Engine interface; trust and proof unchanged |
| Managed credits | Later | `account` | `engine/messages-loop` (Companion's own loop on the Messages API, tools wrapped by core hooks) | Billing screens | Needs Anthropic's written terms first |
| Project memory as an MCP server | Later | None | `memory` exposes a read API | None | Memory files are already plain and readable |
| Cloud agents | Later | None | The runner already runs headless over the protocol | Status cards | Protocol is transport agnostic. Would need: the user's Claude credential and project on a machine the user owns or controls, never on Companion servers; the relay stays a sealed pipe |
| Opt in memory sync | Later | None | Sync adapter beside `memory` | `settings` | Memory files stay the source of truth. Would need storage the user owns, or end to end encryption, so Companion servers never hold readable memory |
| Geeked observer (parked) | Parked | None | A hooks based observer that feeds `proof` | None | Events carry `vendor` and an external session id; `proof` takes a folder and a "done" signal |

### Cross cutting

| Feature | Release | Rust shell | Runner | UI | Needs from the shared core |
|---|---|---|---|---|---|
| Permissions and privacy page | Alpha | `permissions`; delete all also clears `secrets` (API key, deploy and connector tokens) and, if the user chooses, `voice` (Whisper models) | Delete all reaches every module that stores data: `checkpoints` (shadow snapshots and the `.env` vault), `proof` and `receipts` (proof screenshots, receipts), `timelapse` (share videos it saved, from M10), `tasklog`, `memory` (`profile.md`, and Companion's files inside each project only after asking), `connectors` (source indexes, from M12), `relay` (unpair and clear the relay's copy, from M10), and the runner and Rust logs | `settings`, `onboarding` | Trust: first use only, never at install, never Input Monitoring. Delete all leaves nothing from section 7 behind (test) |
| Billing (Plus) and referral | Beta | `account` (sends entitlements to the runner) | `entitlements` (one helper), read by `proof`, `ship`, `relay`, `projects`, `receipts`, `timelapse` and `notice`; no model usage involved | `settings`, `characters` (skins), `shelf` | None from the engine: we never bill model usage. Free and Plus both get proof rungs 1 to 5 (the browser check); Plus adds rungs 6 and 7 (founder decision, 7 Oct 2026, F14). |
| Windows build | Beta | `platform::windows` for panels, text, capture, OCR, mic; Anthropic's `win32-x64` binary bundled as a plain resource, never an `externalBin`, hash checked in CI (**[verify]** in M11 that Tauri's Windows signing leaves it untouched) | Stricter ask rules where the sandbox does not run | Same UI | Trust: more Bash patterns become approvals; Anthropic's binary never re-signed |
| Distribution (signing, updates, environment doctor) | Alpha (M9) | `app` (updater), `supervisor` (`PATH`, git and Node checks) | Reports missing tools | `onboarding` | Trust: Anthropic's binary never re-signed |

## 5. Seams reserved now so later features plug in

| Seam | Built in | Lets these land without a rewrite |
|---|---|---|
| Protocol envelope carries optional `vendor` and `externalSession` | M1 | Geeked observer, Cursor and Codex engines |
| `Engine` interface with ids `claude-agent-sdk`, `messages-loop`, `codex-app-server`, one folder per id under `engine/` | M1 | Second engine, managed credits |
| Entitlements: Rust sends the plan to the runner at start and on every change (`supervisor` sends a fixed alpha value until `account` lands in M10); one runner helper, `entitlements`, answers every check; read by `proof`, `ship`, `relay`, `projects`, `receipts`, `timelapse`, `notice` and UI `characters`, `shelf`. Model usage is never billed | M1 | Plus billing without touching those modules |
| One interrupt registry in runner `interrupts` that every process spawning module registers with | M1 | New lanes, adapters and saved tasks that the kill switch must stop |
| Agent specs are data, not code paths | M1 | Closer, Watcher, Tutor, Analyst, Supervisor |
| Permission profiles in `safety`: interactive, planning, review (read only), vision, fast lane, unattended | M1 | Saved tasks, Pattern Catcher, Team policies |
| Approval channels behind one interface | M1 | Phone app, Telegram |
| Project registry with ids and a concurrency limit | M1 | Shelf and parallel projects |
| SQLite migrations from day one | M1 | Loop items, pattern candidates, saved tasks, connectors |
| Character registry and skins as data | M2 | Full character set and skins |
| `platform` traits in Rust | M2 | Windows |
| One `strings` file for every name and word | M2 | Renaming the product, paths and characters |
| Mode profile in runner `agents` (which agents, output style, surfaces), switched in UI `settings` | M4 | Learn, Work, Team |
| Memory read API separate from the UI | M8 | Memory as an MCP server, opt in sync |

## 6. What the alpha must already record

Later features read history the alpha writes. If it is not recorded from M1, v1.1 starts blind.

| Recorded from | Data | Used by |
|---|---|---|
| M1 | Request text, agent, project, outcome, cost estimate per task | Where was I, recaps, Pattern Catcher (intent labels can be backfilled later from request text, so no extra Claude spend in the alpha) |
| M1 | Ordered tool call signature per task (from the `PostToolUse` ledger) | Pattern Catcher |
| M1 | Project activity timestamps | Stalled project detection in Loop Closer |
| M1 | Approvals with checkpoint and tool call binding | Phone approvals, receipts |
| M2 | Dismissals per kind | Manners, Loop Closer and Pattern Catcher suggestion limits |
| M3 | Proof screenshots and the timeline | Build timelapse |
| M4 | Decisions and their answers | Never ask twice, recaps |

Everything marked off the record by the user is left out of all of these.

## 7. Where data lives

| Place | What |
|---|---|
| `~/Library/Application Support/dev.companion.app/` (the app's own folder) | Settings the shell keeps: `dock.json` (where the character sits), `projects.json`, `presentation.json` (hide from screen sharing and quiet during calls, M11), the activity log; delete everything removes them with the rest of the settings group |
| `~/Library/Application Support/Companion/` | `shadow/<projectId>.git` snapshots with the `.env` vault, `tasklog.sqlite`, `profile.md`, proof screenshots and receipts, `runner/claude` (API key route only: Claude Code's own folder, holding the saved conversations an ordinary task needs to continue), on device indexes of connected sources (from M12), Whisper models, logs |
| macOS Keychain | API key, deploy tokens, connector tokens |
| Inside a user's project | `AGENTS.md`, `CLAUDE.md` (first line `@AGENTS.md`), `.claude/launch.json`, `.companion/project.md`, `.companion/session.md` (expires) |
| Never on disk | Captures of the user's screen, text read from other apps, microphone audio. Fast lane and vision sessions, which are the only sessions that see them, run with `persistSession: false`. Agent sessions keep their session files so they can resume after a restart, so captures and other apps' text never go to them. Off the record tasks (and their plans and reviews) also run with `persistSession: false`, so each of their rounds starts afresh and is told the request again. A follow up needs the agent's last task (its request, model, budget, how it ended and last failing check, plus its conversation id except off the record); the engine keeps that in memory only, and the next task replaces it. M0 spike (e) checks that Claude Code itself keeps received images off disk too; if it does not, the fix is a pending founder decision (technical doc section 3) |
| On Companion servers (relay, from M10) | Sealed payloads the relay cannot read, push subscriptions, timing and a counter per pairing. For users who turn Telegram on, short plain text summaries and low risk button presses pass through it to and from Telegram. No other user content, in v1 |

Delete all on the privacy page removes everything in this table that Companion wrote, across every module that owns it (section 4, Cross cutting). Whisper models go only if the user chooses, and files inside a user's project only after asking.

## 8. Where the risky logic is tested

Tests come first for these, in the module that owns them:

| Risk | Module | Suite |
|---|---|---|
| Snapshots and undo | runner `checkpoints` | `cd runner && bun test` |
| Safety (paths, git writes, irreversible actions, budgets) | runner `safety`, `ledger` | `cd runner && bun test` |
| Memory scope (never health, money, relationships, moods, secrets) | runner `memory` | `cd runner && bun test` |
| Paste back (focus moved, clipboard restored, terminals copy only) | Rust `assist::text` | `cd app/src-tauri && cargo test` plus the Prompt help target suite in `evals/` |
| Redaction (secure fields, keys, card numbers) | Rust `assist::redact` | `cd app/src-tauri && cargo test` |
| Resize and coordinate mapping (output never over 2000 px on the long edge, size echoed back, points map back one to one) | Rust `assist::resize`, `assist::snap` | `cd app/src-tauri && cargo test` |
| Permissions (never at install, first use only, no Input Monitoring request and no event tap in any code path) | Rust `permissions`, `presence` | `cd app/src-tauri && cargo test` |
| Stop everything (with a deploy and a dev server both running, the kill switch stops both; nothing restarts until resume) | runner `interrupts`, Rust `supervisor` | both suites |
| Delete all (nothing from section 7 is left behind) | runner `checkpoints`, `proof`, `receipts`, `tasklog`, `memory`, `connectors`; Rust `secrets` | both suites |
| Key hygiene (an agent's Bash `env` shows no `ANTHROPIC_API_KEY`; the runner's own spawns get no `ANTHROPIC_*` keys; the plan route child env holds no key) | runner `auth` | `cd runner && bun test` |
| Lane tools (`system/init` lists zero tools in the fast lane and only `point_at`, `zoom`, `finish` in the vision lane) | runner `engine` | `cd runner && bun test` |
| Demo (the demo makes no network call to Anthropic) | runner `demo` | `cd runner && bun test` |
| Deploy failure rescue (read only: only `vercel list` and `vercel inspect --logs`, never in a folder not linked to Vercel, a deploy's line ringed only when confirmed in this folder, a list that cannot be read never shown, setting names never values) | runner `ship/deploy`, `ship/buildlog` | `cd runner && bun test` |
| Protocol drift between Rust and TypeScript | `protocol/` fixtures | both suites |
