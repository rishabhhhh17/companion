# AGENTS.md

Rules and map for every coding agent working in this repo (Claude Code, Codex, Cursor and others). Keep it short. If something here disagrees with `docs/research/`, stop and flag it instead of picking one.

## The product in one paragraph

Squibby (the product name since 22 Oct 2026, F24; the code, folders and docs still say Companion until the rename lands) is a Mac first, Windows next desktop app for non engineers who build with AI (Lovable, Bolt, Replit, Cursor, Claude Code) and get stuck. **The hero (F16, 10 Oct 2026; scope and order in F17, 12 Oct 2026, `docs/decisions/F17-teaching-engine-and-launch-scope.md`, which wins where it differs from older docs): "Stuck while building with AI? Press the key. It finds the problem on your screen, fixes it with you, and shows you why."** It points at the real failing line, error or button in the person's own project, fixes it safely with proof, and teaches as it goes. A character on the screen edge carries it (the founder is supplying the character designs; until then the plain dot stays). Users bring their own Claude: their own API key or cloud credential, or (once Anthropic confirms it in writing) their Claude subscription signed in through Anthropic's own flow. We never pay for, resell or route model usage. We are building the **Curious path**, in three layers (F23): the hero for people who build with AI and get stuck; the guide for everyone (HeyClicky class, with basic agents from day one); and an AI helper for every LLM user (Second Look, M14). The **Geeked (Pro) path is parked**: build nothing for it, block nothing for it. Teaching works on any app on screen (best effort, with the deepest lessons in the builder niche). Out for now: shared memory across other AI tools, authored lessons for general apps, dictation everywhere, proactive popups, agents, routines and referral programs (F17 section 9 lists what is not at launch).

## Presence plus four jobs, on one shared core

| | What | Alpha examples |
|---|---|---|
| **Presence** | Characters docked on a screen edge, clear states, cards with proof, Stop, Undo, Receipt; ask box (type or hold to talk); stop everything hotkey | Dock, ask box, voice, questionnaire |
| **1. Help you use AI better** | Point at the problem (the failing line, error or button, then your turn to click, or Do it for me); Show me how (one capture, point at where to click); Prompt help (rewrite the prompt, show a diff, paste back on accept) | All three |
| **2. Do the work** | Build mode: Drive, Rescue, Ship, Research, Proof, undo, receipts with a before and after picture, the it's live card, house rules, fix loop breaker; open a Lovable, Bolt or Replit project | All of it |
| **3. Notice for you** | Where was I; from v1.1 Loop Closer, Pattern Catcher, recaps | Where was I |
| **4. Grow with you** | Explain, memory you can read and edit; Tutor later | Explain, memory |

The shared core is four parts: **characters**, **agent engine**, **memory**, **trust layer** (snapshots, proof, receipts, approvals, safety). Every feature is a thin client of that core. `docs/architecture.md` maps each feature to the modules that own it.

## Rules that never bend

**Claude usage**
1. Never pay for, resell or route anyone's Claude usage, **unless managed usage is switched on** (F22). It is built but off for everyone until Anthropic confirms in writing that it is allowed for the Claude Code engine. A chatbot reply is not approval.
2. Never show a Claude login form. Never read, store or pass claude.ai tokens or credential files. Plan login happens only in Anthropic's own `claude auth login`. We detect the login from the SDK's account info; `claude auth status` runs only while the user is signing in or presses "Check again", never at launch or on a timer (it can sign users out). The API key stays in the Keychain and reaches only the runner and Claude Code; agent commands, hooks and MCP servers never see it (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`).
3. The API key route is the polished default. The subscription route and managed usage (F22) each sit behind a remote switch, off until Anthropic confirms in writing. Keep the switches even after a yes.
4. Ship Anthropic's Claude binary unmodified and never re-sign it: it is staged in `vendor/` (never committed) and goes into the app through `bundle.macOS.files`, never as an `externalBin` (Tauri re-signs those). "Powered by Claude" is fine; never call or style anything as Claude Code.

**Never watch passively**
5. The user's screen, other apps' text boxes and the microphone are touched only on a user hotkey, with a visible indicator lit first. Never in the background, never stored. Captures of the user's screen are never written to disk. A Show me how walkthrough the user started may capture again at each step while it is visibly on. (Pictures of the app being built, taken in the headless browser for proof and the visual receipt, are stored with receipts; they are never pictures of the screen.) Noticing a click or a drawing gesture (your turn, draw or circle to ask) reads only the mouse position and whether a button is down, only while the pointer or draw mode is visibly on: it never reads keys, never reads screen content for this, and never asks for an extra permission (verified 11 Oct 2026). Whether Claude Code itself keeps received images off disk is checked in M0 spike (e); no Show me how code until that is settled.
6. Only exception: a source the user explicitly connected for Loop Closer, Pattern Catcher or Watch routines (F21). Read on the user's schedule or request, while Companion is open, only through the user's own tools or their own web address, indexed on the device only, deleted on disconnect. Watch routines are read only and never change anything.
7. Presentation mode may check whether a call app is in front and whether the camera or microphone is in use. Never content. It can be turned off.
8. Each permission (Accessibility, Screen Recording, Microphone) is asked the first time its feature is used, never at install. Nothing ever asks for Input Monitoring or reads key events; noticing a click or a drawing gesture uses only mouse position and button state (rule 5). Do it for me presses only a plain labelled button, link or tab, never one that sends, pays, deletes, publishes, signs in, connects an account or answers a question (rule 13).

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

**Targeting (F17)**
22. A solid ring or drawing goes only on a target confirmed from the project or the app's accessibility structure. A guess read from a screenshot gets a soft ring and is called a guess. Low confidence draws nothing: say in words where to look. Drawing is clipped to the window it was confirmed in and clears if that window changes or loses focus. Nothing is ever drawn over the wrong app.
23. Never claim on the website that "only one provider sees your screen" until it is verified against the code and the real data flow.

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
  decisions/         one record per fixed decision (F = founder, T = technical); F17 is the source of truth for scope and order
  architecture.md    every feature on the map -> the modules that own it
  milestones/        one plan per milestone (M0-spikes.md first; M11 is current: M11-match-and-beat.md, with M11-customize-plan.md, M11-wave3-plan.md, M11-wave4-plan.md and M11-real-run-checklist.md)
  outreach/          drafts the founder sends by hand
  alpha/             INSTALL.md and PRIVACY.md, drafts the founder reviews before sending to friends
  status/            dated status snapshots, written so a reader with no context can follow the project
  lessons.md         how to write a lesson (data files in lessons/)
  releasing.md       the founder's steps to release and to set up updates
spikes/              M0 throwaway proofs, one folder per spike, each with README, TESTING and RESULTS
scripts/             test-all.sh (every suite) and build helpers
protocol/            JSON lines protocol v1: types, parser, shared fixtures; the settings registry (settings.json, settings.ts, T16); the one list of apps by kind the shell and the engine both read (apps.json)
lessons/             guided lessons as data files (status draft until a person has walked them); shipped inside the app
runner/              TypeScript sidecar on Bun: checkpoints, safety, agent runner, Keychain, fast and vision lanes, task log, proof (locate, visual receipt), ship, Drive, Rescue, Research, memory, Draw it for me data (diagram), walkthroughs (walk, walkservice, lessongen for lessons made from the project), beta numbers (metrics), follow ups and Try again (followup), the fix request after a check found the problem (fixfound), which task broke it (bisect), the error explainer (errorhelp)
app/src-tauri/       Rust shell: windows, the island in the notch that Home drops from (island), hotkeys, Prompt help, the error explainer (errhelp, errorsel), Show me how, Point at the problem (pointat), your turn (yourturn), anchor (a ring belongs to one window), docking and roam (the character on any edge or corner, and beside the window it is about), presentation (hide from screen sharing, quiet during calls), diagram, share, practice, hold to talk, project folder, Keychain key saving and removing, updates, settings helpers (wipe, logexport), one copy at a time (instance), runner supervisor
app/                 Tauri 2 + React shell: native panels, runner link, cards, Home and its tabs (home), the island page, ask box, docking, tray, settings; scripts/ build the app, the engine inside it, the disk image and the release
app/vendor/          Anthropic's Claude binary and the engine, staged at build time; never committed
app/sample/          practice stuck moments, each broken one way on purpose, and their one catalog (practices.json: order, the failure Find must show, how each is fixed and proven, the files its house rule protects)
evals/               quality suites (evals/README.md): rescue-projects, prompt-help, and the M11 sets, dry by default and spending only with --spend through one harness (evals/lib): fix-projects, loop-breaker, review-catch, explain, show-me-how (the aim eval's hard set); voice latency still to come
relay/               (planned, Beta) Cloudflare Worker relay and the phone web app
usage-proxy/         (M13, switched off) the server that holds Companion's Anthropic key for managed usage: sign in tokens, plans, daily limits, metering, Stripe events. Never logs a request or reply body
```

## Running tests

| Suite | Command | Covers |
|---|---|---|
| Everything | `sh scripts/test-all.sh` (needs `cmake` on PATH for the Rust build; on this Mac it is in `~/Library/Python/3.9/bin`) | All of the below. Run before every merge; a merge is gated on its exit code being 0, not on reading the output |
| Usage proxy | `cd usage-proxy && bun test` | Sign in tokens, plan limits, metering, streaming usage, Stripe signatures, no body logging |
| Runner (headless) | `cd runner && bun test` | Protocol and fixtures, snapshots and undo, safety hooks, key scrub, budgets, memory scope, task log, proof, Draw it for me, walkthroughs, beta numbers, every practice start to finish with a stand in agent (`test/practice-e2e.test.ts`) |
| Rust shell | `cd app/src-tauri && cargo test` | Paste back, redaction, image resize and coordinate mapping, permissions state, rings and windows (anchor), delete everything, updates |
| Pages | `cd app && bun run typecheck && bun test ./src` | Character state mapping, cards, lessons, settings, command shapes (`./src` keeps the practice project's deliberately failing test out) |
| Real Claude smoke test | `cd runner && bun run scripts/smoke-real.ts` prints the plan and spends nothing; add `--spend` to run it on the founder's key (about $0.75, stops at $1; only when the founder says go) | Every lane on its default model and the switched ones (each model choice in Settings is offered only once its own case passes), a resumed conversation, a follow up, off the record, and what each writes to disk |
| Real Claude checks | `cd runner && bun run scripts/real-verify.ts [scenario]` prints the plan; add `--spend` to run it on the founder's key (the `companion-dev` Keychain item, shipped models, per scenario and total stops; `--cheap` for Haiku 4.5; only when asked) | House rule and undo, Drive, Rescue, Research, visual receipt, the practices (practice, practice-route, practice-import, practice-open-table), diagram, explain, memory, the daily limit, the second model review, ship gates, the error explainer, approve after a wait, Stop everything, the loop breaker. What each proves: `docs/milestones/M11-real-run-checklist.md` |
| Sandbox backstop | `cd runner && bun run scripts/real-sandbox.ts` prints the plan; add `--spend` to run it on the founder's key (about $0.10; only when asked) | The macOS sandbox under Companion's own checks, on the API key route: no write outside the project or in the home folder, no private file read, only the allowed registries reachable. `real-run.ts`, `e2e-plan.ts` and `real-sandbox-net.ts` are retired and start nothing |
| Rescue projects eval | `cd evals/rescue-projects && bun test` (free, no model; part of `test-all.sh`) | Fifteen small projects broken in fifteen common ways (JavaScript, TypeScript, Bun, Python), eight more in `native-cases` for Go, Rust, Java, Swift and Xcode (run with the real tool, skipped cleanly when the Mac lacks it), plus the five practice stuck moments in `app/sample` (expected checks in the catalog, `app/sample/practices.json`): the locator must turn the real failing output into the exact file and line, with a readable message; the open Supabase table must be blocked by the database access check |
| Prompt help eval | `cd evals/prompt-help && bun test` (free, no model, no network; part of `test-all.sh`); `bun run run.ts --real` prints the plan, `--real --spend` runs it on the founder's key (only when asked) | The scorer and the 30 cases |
| Eval sets, dry | `cd evals && ../runner/node_modules/.bin/tsc -p . && bun test ./lib ./fix-projects ./loop-breaker ./review-catch ./explain ./show-me-how` (free, no model, no network; part of `test-all.sh`) | The fix, loop breaker, review, Explain and hard pointing sets run end to end on stand ins: every case broken as it says, found, solvable and scored by checks; wrong fixes told apart; the spending caps, the cumulative stop; and, with stubbed queries, the real run harness under them (its guards, its stops, a refusal or stop failing the case, never a score, and request shapes only from `runner/src/models.ts`) |
| Eval sets, paid | `bun run evals/<set>/run.ts --spend`, `cd runner && bun run scripts/eval-aim.ts --spend` (through the real run harness, the `companion-dev` Keychain item; only when the founder says go, after the smoke test) | See `evals/README.md` for each set's dry and paid command, the cost of each case and the order to run them in |
| After adding a Tauri plugin or changing `tauri.conf.json` | `sh app/scripts/build-app.sh`, open the app, check it stays running | A plugin that fails to start crashes the app at launch while every test passes |

Installs that tasks run use Node 20 or newer; under Claude's sandbox, Node 18 cannot reach the registry (it tries IPv6 first). Say so in plain words if a task fails that way.

## Before you start any task

1. Read the product doc sections for the feature (section 3 is the map, section 10 is what Companion may see, section 11 is what we dropped) and the matching technical doc section.
2. Check `docs/decisions/` and `docs/architecture.md` for where the code belongs.
3. Write the risky logic's tests first. Run the suite. Update `CHANGELOG.md` in plain words when something a user would notice changes.
