# AGENTS.md

Rules and map for every coding agent working in this repo (Claude Code, Codex, Cursor and others). Keep it short. If something here disagrees with `docs/research/`, stop and flag it instead of picking one.

## The product in one paragraph

Companion (working name; every name will change) is a Mac first, Windows next desktop app for non engineers who start projects with AI and get stuck. Abstract characters with their own personalities live on the side edges of the screen, and through them you get one companion that helps you finish what you start. Users bring their own Claude: their own API key or cloud credential, or (once Anthropic confirms it in writing) their Claude subscription signed in through Anthropic's own flow. We never pay for, resell or route model usage. We are building the **Curious path**. The **Geeked (Pro) path is parked**: build nothing for it, block nothing for it.

## Presence plus four jobs, on one shared core

| | What | Alpha examples |
|---|---|---|
| **Presence** | Characters docked on a screen edge, clear states, cards with proof, Stop, Undo, Receipt; ask box (type or hold to talk); stop everything hotkey | Dock, ask box, voice, questionnaire |
| **1. Help you use AI better** | Prompt help (rewrite the prompt in any app, show a diff, paste back on accept); Show me how (one capture, point at where to click) | Both |
| **2. Do the work** | Build mode: Drive, Rescue, Ship, Research, Proof, undo, receipts, house rules, fix loop breaker | All of it |
| **3. Notice for you** | Where was I; from v1.1 Loop Closer, Pattern Catcher, recaps | Where was I |
| **4. Grow with you** | Explain, memory you can read and edit; Tutor later | Explain, memory |

The shared core is four parts: **characters**, **agent engine**, **memory**, **trust layer** (snapshots, proof, receipts, approvals, safety). Every feature is a thin client of that core. `docs/architecture.md` maps each feature to the modules that own it.

## Rules that never bend

**Claude usage**
1. Never pay for, resell or route anyone's Claude usage.
2. Never show a Claude login form. Never read, store or pass claude.ai tokens or credential files. Plan login happens only in Anthropic's own `claude auth login`. We detect the login from the SDK's account info; `claude auth status` runs only while the user is signing in or presses "Check again", never at launch or on a timer (it can sign users out). The API key stays in the Keychain and reaches only the runner and Claude Code; agent commands, hooks and MCP servers never see it (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`).
3. The API key route is the polished default. The subscription route sits behind a remote switch, off until Anthropic confirms in writing. Keep the switch even after a yes.
4. Ship Anthropic's Claude binary unmodified and never re-sign it: it is staged in `vendor/` (never committed) and goes into the app through `bundle.macOS.files`, never as an `externalBin` (Tauri re-signs those). "Powered by Claude" is fine; never call or style anything as Claude Code.

**Never watch passively**
5. The user's screen, other apps' text boxes and the microphone are touched only on a user hotkey, with a visible indicator lit first. Never in the background, never stored. Captures of the user's screen are never written to disk. A Show me how walkthrough the user started may capture again at each step while it is visibly on. (Proof screenshots of the app being built, in a headless browser, are stored with receipts.) Whether Claude Code itself keeps received images off disk is checked in M0 spike (e); no Show me how code until that is settled.
6. Only exception: a source the user explicitly connected for Loop Closer or Pattern Catcher. Read on the user's schedule or request, indexed on the device only, deleted on disconnect.
7. Presentation mode may check whether a call app is in front and whether the camera or microphone is in use. Never content. It can be turned off.
8. Each permission (Accessibility, Screen Recording, Microphone) is asked the first time its feature is used, never at install. Nothing ever asks for Input Monitoring or reads key events.

**Hands off the user's things**
9. Never steal keyboard focus. Panels are non activating.
10. Companion's own machinery never writes the user's git (branch, staging area, history). Undo uses our shadow snapshots. Agent commands that would change the user's git need approval. If an agent made a commit, Companion shows the exact git command to undo it, or asks through an approval card; it never runs one on its own (F13).
11. One global hotkey stops everything: every agent, task, capture and the microphone.

**Safety and proof**
12. Safety lives in hooks, deny rules and allowlists, never in prompts. `canUseTool` is only the approval UI.
13. Never send, pay, delete or go live without a tap. Unattended tasks never exceed their allowlist. Never use `bypassPermissions`.
14. "Done" means proven: exit codes first, browser checks second, a screenshot judgment only as extra evidence. Every user gets the browser check, Free or Plus (F14).

**Memory and tone**
15. Project memory may be filled in from the granted folder and agent runs, always visibly and with its source. The profile learns only from explicit signals inside Companion. Every line can be forgotten. Never store health, money, relationships or moods, or secrets.
16. A productivity tool, never an "AI friend". Plain language in everything a user sees. No affection, streaks or mood check ins.

**How we build**
17. Tests come first for risky logic: snapshots, undo, safety, paste back, redaction, permissions, memory scope. Run them after every change.
18. Items marked **[verify]** must be checked in a spike or a test on a real Mac before code depends on them; official docs settle only some of them. When one is resolved, update `docs/research/technical_research.md` and the matching decision record, and this file if a rule, a command or the repo map changes.
19. Founder decisions (F records in `docs/decisions/`) are not reopened. Technical records (T) change only when a spike or check proves the research wrong, and the founder is told. Ideas in product doc section 11 stay dropped unless the founder says otherwise.
20. Pin `@anthropic-ai/claude-agent-sdk` to an exact version (no caret), and always run the SDK's bundled Claude binary, never a `claude` found on `PATH`. Upgrade on a branch with the full suite.
21. Names are placeholders. Product, path and character names live in one strings file, never in logic.

## The bar: this is a paid product, built like a real company builds one

Decided by the founder on 9 Oct 2026. Companion is what the founder will charge money for. It is not a demo, a hobby or a spike. Every agent working here builds it the way a serious software company ships a paid AI tool: slowly enough to be right, never pretending something works that nobody has checked. If a rule in this section clashes with speed, the rule wins.

**What "done" means**
1. A change is done only when its tests pass, the whole suite passes (`scripts/test-all.sh`), and the thing was exercised the way a user will meet it. For anything that touches Claude, the Mac, the network or money, that means a real run (`runner/scripts/real-verify.ts`, a real Mac check), not only a fake. A fake proves our wiring, never the world.
2. Never say "works" for something that was only compiled or unit tested. Say what was proven and what was not. Keep the launch readiness table (`docs/status/`) true: built, real Claude, tried by a person, confidence, what is left.
3. Anything that needs a permission click, a real microphone, a real screen or the founder's accounts is "not proven" until a person has tried it. Say so plainly; do not round it up.

**How to change things without breaking things**
4. Before saving a file you did not create, read it. Never overwrite a whole file when an edit will do (on 9 Oct 2026 a whole file replace silently removed the no Dock icon setting; a test and a build check now guard it). After every change, look at the diff for collateral damage, not only for what you meant to change.
5. Every bug gets a test that fails without the fix. Bugs found by real runs and by the founder come first; they are the ones tests missed.
6. Risky logic is tested first (rule 17). Safety, privacy, undo, money, memory scope and permissions are never merged without tests and a real check.
7. Do not add a dependency, a download, a permission, a network call or stored data without saying why in the change, the changelog and the matching decision record.

**Honesty and incidents**
8. Report faithfully. If a test fails, a check was skipped or a result is a guess, say it first, not last. Estimates are labelled estimates.
9. Anything that could leak a secret, store something private, touch the person's git, spend money or go live without a tap is an incident, not a bug. Stop other work, fix it, add the test, tell the founder in plain words, and note it in the changelog.
10. Findings that cannot be fixed now are written down (readiness table, decision record, milestone plan), never left in someone's head.

**Quality a user feels**
11. Plain words everywhere a user reads. No jargon, no raw error text without a next step, no silent failures. If a feature cannot work (missing permission, offline, no key), it says why and what to do.
12. It must never be a nuisance on the desktop: no focus stealing, no surprise windows or sounds, no background watching, low idle CPU and memory, everything stoppable with one key.
13. Accessibility is part of done: keyboard and VoiceOver reach everything, text is readable, motion respects reduced motion.
14. Speed is a feature. Measure it (the aim eval, the speech timing) and record the numbers; do not accept regressions.

**Before anything ships to a person other than the founder**
15. Full suite green, real Claude run green, the readiness table updated, the changelog written, no known incident open, and the founder told what is still unproven.

## How we work

- **The founder is a solo, first time founder.** Explain decisions in plain words and say why. Ask before any big or irreversible step: a new dependency with a licence question, a change to a fixed decision, anything touching signing keys, deleting work.
- **One milestone at a time,** in the order of technical doc section 18. No feature code for a milestone until the founder has approved its plan in `docs/milestones/`.
- **Git:** commit only when asked, on a branch, never directly on `main`. Never commit secrets, signing material, the copied Claude binary or screen recordings (see `.gitignore`). Tests never run git against a real user project; they use temporary fixture folders.
- **When research and reality disagree:** say so, fix the research doc in the same change, and note it in the matching decision record.
- **Writing style** for docs and user facing copy: plain words, short sentences, no em dashes, compound words written open as the research does (on device, non activating, hold to talk).
- **Docs that must stay true:** this file (rules, repo map, test commands), `docs/architecture.md`, `docs/decisions/`, and `CHANGELOG.md` (plain language; the founder posts from it while building in public).

## Repo map

Folders marked *(planned)* do not exist yet; they are created by the milestone shown.

```
AGENTS.md            this file
CLAUDE.md            imports this file, plus Claude Code notes
README.md            for humans
CHANGELOG.md         plain language, for building in public
docs/
  research/          source of truth: product_research.md, technical_research.md
  decisions/         one record per fixed decision (F = founder, T = technical)
  architecture.md    every feature on the map -> the modules that own it
  milestones/        one plan per milestone (M0-spikes.md first), plus the M0 desk research
  outreach/          drafts the founder sends by hand
  status/            dated status snapshots, written so a reader with no context can follow the project
spikes/              M0 throwaway proofs, one folder per spike, each with README, TESTING and RESULTS (a-panel exists)
scripts/             (planned, M0) build helpers: copy and verify Anthropic's binary, signing checks
protocol/            JSON lines protocol v1: types, parser, shared fixtures (M1, started)
runner/              TypeScript sidecar on Bun: checkpoints, safety, agent runner, Keychain, fast and vision lanes, task log (M1, done); proof (including locate, which turns a failed check into a file and line, and the visual receipt: before, visualdiff, picture), ship, Drive, Rescue, Research and memory (project memory, profile, shared AGENTS.md) live in it
app/src-tauri/       Rust shell: windows, hotkeys, Prompt help (ax, phelp), Show me how (macos_see capture and text reading, showme flow, snap, redact, coords, frame), Point at the problem (pointat), your turn (yourturn), the it's live card buttons (share), hold to talk (voice rules, voice_mac microphone and speech model), project folder (projects), Keychain key saving (keystore), runner supervisor
app/                 Tauri 2 + React shell: native panels, runner link, character, cards, ask box, docking, tray (M2, started); memory page later
app/vendor/          (planned, M2) Anthropic's Claude binary, copied from the pinned SDK package at build time; never committed
evals/               (planned, M3+) quality suites: Prompt help targets, Show me how screenshots, voice latency, rescue projects
relay/               (planned, Beta) Cloudflare Worker relay and the phone web app
```

## Running tests

Product code arrives in M1; these are the planned commands, so update this section the day each one starts working. Spike (a) has its own working checks: see `spikes/a-panel/README.md`.

| Suite | Command | Covers |
|---|---|---|
| Runner (headless) | `cd runner && bun test` (works since 8 Oct 2026: protocol, undo, safety, runner, Keychain, lanes; memory arrives in M8). `cd runner && bun run typecheck` checks types. Manual: `bun scripts/demo.ts` (free demo) and `bun scripts/real-run.ts` (a real run; needs the test login) | Protocol, snapshots and undo, safety hooks, key scrub, budgets, memory scope, task log |
| Rust shell | `cd app/src-tauri && cargo test --release` (21 tests: runner link, docking maths, permissions) and `app/scripts/lint-permissions.sh` (no permission asking calls) | Paste back, redaction, image resize and coordinate mapping, permissions state |
| UI | `cd app && bun test` and `bun run typecheck` (31 tests: character state, approvals, receipts, plain errors, command shapes) | Character state mapping, cards, protocol client |
| Real Claude check of Build mode | `cd runner && bun run scripts/real-verify.ts [scenario]` (uses a little of the test plan login, small caps) | House rule and undo, Drive, take the wheel, Rescue, Research, daily limit and second model review with real Claude |
| Prompt help eval | `cd evals/prompt-help && bun test` (free); `bun run run.ts --real` (asks real Claude, only when asked) | The scorer and the 30 cases; the real run measures rewrite quality |
| Protocol fixtures | run by both runner and Rust suites | Rust and TypeScript agree on every event |
| Everything | `scripts/test-all.sh` | All of the above; run before every merge |

Feature suites (Prompt help targets, Show me how eval, voice latency) live in `evals/` and run before merging that feature.

Installs that tasks run use Node 20 or newer; under Claude's sandbox, Node 18 cannot reach the registry (it tries IPv6 first). Say so in plain words if a task fails that way.

## Before you start any task

1. Read the product doc sections for the feature (section 3 is the map, section 10 is what Companion may see, section 11 is what we dropped) and the matching technical doc section.
2. Check `docs/decisions/` and `docs/architecture.md` for where the code belongs.
3. Write the risky logic's tests first. Run the suite. Update `CHANGELOG.md` in plain words when something a user would notice changes.
