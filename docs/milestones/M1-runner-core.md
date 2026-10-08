# M1: Runner core. Plan for approval

**Status:** approved by the founder on 8 Oct 2026 ("go for it"), with Bun approved and `git push` set to **A: an approval card each time, never silent**. Work started. **Written:** 8 Oct 2026. **Source:** technical doc sections 2, 3, 6 and 8, and the M1 row in section 18. Decisions behind it: T02 (engine), T04 (runner packaging), T05 (safety), T06 (undo), T14 (local data).

## What M1 is

The **runner** is the engine room of Companion. It's a program that runs in the background, starts Claude (through Anthropic's own Agent SDK), keeps every project safe, and tells the app what happened. The characters, cards and buttons all sit on top of it later. This is the "do the work" side you called the best part: Drive, Rescue and Proof all use it.

M1 builds the runner and tests it **without any screen**: no characters, no windows. We talk to it the way the app will, and check what it does. It needs no API key for most of the work.

## What gets built, in plain words

1. **The language between the app and the runner.** A fixed set of short messages ("start this task", "stop", "the agent wants to run a command, allow it?"). It's written once and checked by tests, so the app and the runner can never misread each other.
2. **Running agents.** Start a task in a project folder, stream what Claude is doing, stop it, send a follow up, and pick up again after a restart.
3. **Undo (shadow snapshots).** Before every step, a full copy of the project is saved in a private folder outside your project. Undo puts it back, including files the agent created with commands. It **never touches your git**: no branch, no staging area, no history (F13).
4. **Safety rules in code, not in prompts.** Blocks that no instruction can talk its way past:
   - an agent can't write outside the project folder;
   - commands that would change your git, deploy, install things on your Mac or delete things need your tap;
   - the agent's commands never see your API key;
   - a spending limit per task that stops it when reached.
5. **Receipts.** After each task, a list of what changed, what commands ran, what can't be undone, and what it cost.
6. **A task log.** A small local database of every task, for the timeline, Where was I, and later recaps. It stores no secrets and no screen content.
7. **Your key handling.** The API key stays in the macOS Keychain and goes only to the runner at start. Agents and their commands never get it.
8. **The fast lane and the vision lane, as plumbing.** The small, quick jobs (like Prompt help) and the screenshot job (Show me how) get their own paths, without the full agent, so they can start fast. The real features come in M5 and M6.

## How we'll know it worked

All of these are automatic tests, run after every change, and all must pass:

- **Undo:** a step's changes are fully undone, including a file created by a command, a changed `.env` file, and a restore of an earlier undo. A folder that isn't a git project never gets a `.git` created in it. A 3 MB new file is skipped and reported instead of silently saved. Your own staged git changes survive an undo.
- **Safety:**
  - a write to `../outside.txt` is refused;
  - `git push` never runs without you;
  - an agent running `env` shows no API key;
  - a $0.05 spending limit ends the task with the right error.
- **Plan route:** a run on a Claude plan login never inherits an API key, or a helper that supplies one.
- **Protocol:** every message type is accepted, and an unknown version is refused, not guessed.
- **Task log:** a row exists for every task.

How the tests run without spending money: most use a **stand in for Claude** that plays back fixed answers, so they're free, fast and repeatable. A few runs against the real Claude are added when a key or login is ready (see below).

## Where the code goes

`protocol/` (the message definitions and test fixtures), `runner/` (the engine, in TypeScript on Bun), and a test suite in `runner/`. `AGENTS.md` and the repo map are updated the day each test command starts working.

## What I need from you

1. **Approve this plan,** or tell me what to change.
2. **Approve installing Bun,** the tool that runs and packages the runner (about 60 MB, from Homebrew: `brew install oven-sh/bun/bun`, version 1.4.2 or newer, because older versions break on macOS 27). Your Mac has Node 18 but no Bun.
3. **One decision on `git push`.** When an agent tries to push code to GitHub, should Companion:
   - **(A, my recommendation)** ask you with an approval card each time, or
   - **(B)** block it completely, so you always push yourself?

   Either way, it never pushes silently (rule 13). A is more useful for beginners finishing projects; B is stricter.
4. **Real Claude runs (not now).** To check the plumbing against the real thing, I'll need either an API key in your Keychain (you add it yourself) or a few small runs on your own Claude plan login. Neither is needed to start. I'll ask when we get there.

## Order and time

1. The message language and its tests.
2. Undo, the most risky logic, with its tests first (rule 17).
3. Safety rules and the spending limit.
4. Running agents with the stand in Claude, then the receipts and the task log.
5. The Keychain key handling, the fast lane and the vision lane plumbing.
6. A short demo you can watch: start a task from a command line, see the stream, undo it.

About **8 to 10 working days** of my time (the technical plan puts M1 at about one and a half weeks). You'd only be needed for the approvals above and the short demo at the end.

## Risks and plan B

- **The SDK changes under us.** We pin an exact version (0.3.293 today) and always run its bundled binary (rule 20).
- **The stand in Claude differs from the real one.** The few real runs at the end catch this.
- **Undo is slow in huge folders.** Large and generated folders are skipped, and there's a size cap on the snapshot store.

## Approval

Say **approved** (and your choice for `git push`: A or B), and I'll start with the message language and the undo tests.
