# M52: review every change your AI makes (plan, 1 Nov 2026; waiting for the founder's yes)

Decision: `docs/decisions/F30-a-companion-to-every-ai-coding-tool.md`. Nothing here is built until the founder approves this plan.

## What the person gets
- **It works next to any AI coding tool.** Claude Code in the terminal, the Claude desktop app, VS Code or Antigravity; Codex; Cursor; anything that changes files in the project folder. Squibby does not care which tool wrote the code.
- **It waits until the other tool is done.** When files in the project stop changing for a short while (usual 20 seconds, a setting), Squibby treats that as one batch of changes. It never checks half-written code.
- **The review card:**
  - **What changed**, in plain words, with the files listed.
  - **What it touches**, for example sign in, payments, your data, settings, or the look only.
  - **A rating:** safe, worth a look, or stop. Stop is for things like a key written into the code, a payment or sign in change that breaks the checks, or a file deleted that other files need.
  - **Proof:** the project's own build and tests, plus the browser check (T07, F14), with the result.
  - **Security:** secrets in code, a login page with no protection, a database opened to everyone, with the fix offered.
  - **House rules:** the person's own rules ("we use pnpm", "never touch payments") checked against the change.
- **What you can do from the card:**
  - **Fix it**, with a safety copy and Undo first.
  - **Send it back to my AI**: a ready message the person pastes into Claude Code or Codex (copied, never typed into their app without the hotkey and a yes).
  - **Looks fine**, which closes the card.
- **How often:**
  - **Ask** (usual): a quiet dot on the notch says there are new changes to review, and nothing runs until asked.
  - **Automatic**: reviews each batch by itself within the plan's limits.
  - **Off.**

## Privacy and safety (rules that never bend)
- **Only the folder the person granted** is watched, through macOS's file events. Never the screen, never other folders, nothing stored but the list of changed paths and the review (rules 5 and 6).
- **Changes are measured against Squibby's own shadow snapshot** (T06). Squibby never runs a git command that writes, and never reads the person's git history to do this (rule 10).
- **Secrets and settings files** (`.env`, keys) are never sent to a model; the card says only that one changed (the existing secret file rules).
- **Nothing goes live and nothing is sent anywhere without a tap** (rule 13).

## How it is built (reusing what exists)
1. **Runner:**
   - A watcher on the project folder: debounce, ignore lists (`node_modules`, `.git`, build folders), and a cap on how many files one batch may hold.
   - The diff against the last snapshot.
   - The batch as a new task kind, "review".
2. **Proof:** the existing ladder runs on the batch in the box. No new install permissions.
3. **The review itself:**
   - A cheap model writes the plain words and the touches.
   - A stronger model only when the batch hits a risky area.
   - Every review counts against the plan's limits (F29: Squibby pays).
4. **Rules for the rating:** pure functions with tests (risky paths, secrets patterns, failing checks, deleted imports).
5. **Pages:** the review card on Home, the "new changes" dot, and a Settings row for how often.
6. **Later, not in this milestone:**
   - Claude Code and Codex hooks that tell Squibby the moment the agent finishes, with the person's yes.
   - A command line `squibby review` for engineers.

## Tests first (rule 17)
Watcher debounce and ignore lists, the batch from snapshots, a review never starting while files still change, secrets never in a model request, the rating rules, the limits, the "send back" text never containing secrets.

## [verify] on a real Mac
- File events while Claude Code, Codex and Cursor write.
- A tool that rewrites many files at once.
- Battery with the watcher on all day.

## Order
After M51 (the look). Before M50's front door is switched on, because both need the plans and limits of F29.
