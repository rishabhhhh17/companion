# T06. Undo: shadow git snapshots outside the project

- **Status:** Accepted from research; open items checked in M1 snapshot tests. Updated 7 Oct 2026 after desk research, review and the founder's decision (F13).
- **Date:** 2026-10-06
- **Source:** technical_research.md section 1, row 6; section 6 (also section 1 prototype lessons two and three, section 19 pitfalls 9 to 12, section 20 question 11); product_research.md sections 6 and 11
- **Related:** T05, T07, T14

## Decision
Companion takes whole tree snapshots into its own shadow git repository under Application Support, before and after every agent turn. It uses a temporary index and never writes the user's `.git`.

## Why
- Founder rule: Companion's own machinery never writes the user's git (branch, staging area or history).
- SDK file checkpointing tracks only `Write`, `Edit` and `NotebookEdit`. It misses Bash changes and most subagent edits, rewinds only in the same session and does not undo directory moves (section 6).
- The prototype's `git init` plus `git add -A` wrote into the user's history and could commit `.env` and `node_modules`; its `git reset -q` silently discarded staged work (lessons two and three).
- Codex ghost commits, Docker Agent and Roo Code all converge on a shadow repo (section 6).

## Alternatives considered
- Refs inside the user's repo (the prototype): polluted history and committed `.env` files.
- SDK file checkpointing alone: kept on as a fast partial layer, not the source of truth.
- A git worktree per agent: writes into the user's `.git`; dropped by the founder (F13).

## Founder decision (7 Oct 2026, F13)
The research had planned two things that write the user's git: a user clicked undo helper (`git reset --soft` to the recorded `HEAD` and putting back the saved `.git/index`) and a git worktree per agent. The founder dropped both. When an agent made a commit during a step, the receipt shows the exact git command to undo it for the user to run, or offers it as an approval card, where it runs as an agent git command like any other. Companion never creates per agent worktrees.

## What this means for the build
Commands and edge cases are in technical_research.md section 6. Rules a coding agent must never miss:
- One bare repo per project at `~/Library/Application Support/Companion/shadow/<projectId>.git`. Every call uses `--git-dir`, `--work-tree` and `GIT_INDEX_FILE=<tmp>`. Non git folders work without `git init`.
- Honor `.gitignore`, copy `.git/info/exclude`, and add our own excludes (`node_modules/`, `.next/`, `dist/`, `build/`, `.turbo/`, caches).
- Snapshot when a turn starts (`UserPromptSubmit`) and when it ends, so every receipt diff is exact. Restore through a temporary index, and snapshot first so undo is undoable.
- Record the user's `HEAD` at each checkpoint, reading only, so the receipt can show the exact undo command if an agent committed (F13).
- Skip new files over 2 MiB and list them on the receipt. Warn per nested repo. Keep a `0600` copy of any changed `.env*` file.
- Cap the store (about 2 GB per project, the latest 100 checkpoints, weekly `gc`). A per project lock serializes snapshots; one agent per project by default.
- Network side effects cannot be undone: flag deploys, pushes and similar actions `undoable: false` and list them under "not undoable".
- M1 tests: the prototype's 8 tests ported, staged index kept after undo, no `.git` in a non git folder, a Bash created file undone, a 3 MB new file skipped and reported, a `.env` change restorable, undo of an undo (section 18).

## Added 16 Oct 2026: Which task broke it, and undoing one task (M11, built and tested with stand ins, not tried on a Mac)
- When a check fails, the saved versions before and after each recent task (the last 14 that changed something, from the task log) are checked in a binary search, to name the first task after which the same step fails. At most 6 checks, the check of the project as it is now included; each uses the proof ladder's own time limits and Stop ends it. A version that fails at an earlier step says nothing either way and is stepped round; running out of checks says "could not pin it to one task", never a guess.
- Every check runs on a private copy in `<data>/work/bisect-*` (`exportTo`, with the version's own `.env` copies), never in the project. The installed packages get a copy of their own (`ownPackages`: an APFS clone with `cp -c`, about a second for 330 MB, or a plain copy across disks), never links, so a build of an earlier version that writes inside them (a generated client) cannot reach the person's own packages. Found by a test while building: links let such a write through. Each copy is deleted after its check and swept when the engine starts.
- When files changed between two tasks that no task made (the person's own edits, an undo, or a `.env` change, which `differs` counts too), the version from just before the later task decides whether that task or the change before it broke it.
- Undoing one task in the middle (`undoOne`) puts back only the files that task changed, and its `.env` changes. It saves the project first (so it can be undone too) and checks again against that: if any of those files changed since (a later task or the person), or one is behind a link, too big for a saved copy, or inside a folder with its own git history, it refuses and changes nothing, and the card offers only to show what the task changed. Later tasks' changes to other files are kept. Undoing the single task undo from the card is not built yet (the saved version exists for it).

## Fixed 16 Oct 2026 after review (M11, tested with stand ins)
- A file with no saved copy in the version before the task (over 2 MiB, or unreadable when it was saved) also makes the task show only. Before this, a big file that the task shrank looked added, so undoing the task deleted a file that was there before it; and a file present only as an older small copy got that old copy put back. `restore` already guarded the second case.
- The installed packages in each copy are today's, so a version whose package lists (in any `package.json`, scripts and names left out) or lockfiles differ from today's is never checked: it could fail only because of the packages and an innocent task would be blamed. Such versions are stepped round without spending a check, and an unclear answer says why. In a workspace, each package's own `node_modules` gets its copy too (`packageFolders`, a few folders deep).
- No task starts in the project while a search, a Point at the problem check, an install or a ship step runs on it (`run` refuses, changing nothing). Before this, the ask box could start a task mid search, which wrote into the project while its packages were being copied.
- A Python virtual environment is still not copied into the checks of earlier versions; a Python project whose checks need one may fail every version the same way and be reported as already failing. Not fixed here. (Fixed 18 Oct 2026: each copy borrows the virtual environment by one link, the requirement files decide which versions can use it, and a step that could not run says nothing; see T07.)

## Fixed 18 Oct 2026 (tested with a stand in git that fails on purpose)
- Reading a file back from a saved version (`readFiles`, used by the proof ladder's test guard and package check, Which task broke it and the receipts) reads only files, tries a failed read once more, and then fails with the file's name. It used to take whatever a failed read printed (nothing, or the start of the file) as the file's text, so one bad read on a busy Mac could make an unchanged project look broken, or hide a test file a task deleted.

## Open [verify] items
- None marked [verify]. A fresh Mac's `/usr/bin/git` stub would block the first checkpoint (pitfall 12; T04).

## Settled by desk research (7 Oct 2026)
- Bundled git (dugite-native) is GPL-2.0 and needs our signature inside, so the alpha uses an environment doctor (T04).

## Your turn writes one place back (16 Oct 2026, M11)
- "Your turn" (off by default) is, besides Undo, the only Companion feature that changes the person's own code (Companion's notes in `.companion/` and the shared `AGENTS.md` block are not code). On the person's press it snapshots the project ("Before your turn: the whole fix"), then puts back only the second of two identical changes the task made, and only when that file is still exactly the task's version (otherwise nothing is written and the card says why). It snapshots again ("Your turn"), so the proof ladder's test tamper guard compares only the person's own change. "Put my fix back" is an ordinary restore to the first of those snapshots, and stays on the card until the person's change passes or the fix is back: the turn has no Close while that place has the old code, only "Leave it as it is", which says the place is not fixed. "Check my change" judges only that place, from its own snapshot, so a place the person has not touched is said as that and no check runs. The person's git is never touched.

## Revisit if
SDK file checkpointing closes its gaps (Bash edits, subagent edits, directory moves, rewind across sessions). Until then the shadow store is the source of truth.
