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

## No Git on the Mac (audit fix, 20 Oct 2026)
Every snapshot needs Git, so the Mac check now says Git is needed ("Companion needs Git to keep undo points, so no task or check can start without it", with `xcode-select --install`), not that some projects need it. It runs `git --version` only when that git is not Apple's stand in at `/usr/bin/git`, or when Apple's developer tools are there (`xcode-select -p`), so the check never opens Apple's install window by itself [verify on a fresh Mac]. xcrun's own words ("invalid active developer path") are mapped to the same plain line as the other missing tool messages, and a task, Point at the problem, Rescue, Which task broke it and Your turn say that line whole instead of clipped inside another sentence.

## Undo never overwrites your own edits (21 Oct 2026, tested with stand ins and temporary folders, not tried on a Mac)
- **The gap the audit found.** When a Drive plan was paused ("Take the wheel"), the person edited files themselves and resumed, Undo of an earlier step put back the saved version and replaced those edits. The same happened for edits made after a task, before Undo.
- **What is recorded** (`own.json` in the shadow store, kept apart from the checkpoints). The project as our last step left it: a tree (no undo point is made for it) and a hash of each `.env` file, written when a task or step ends and after Your turn puts its change back. The files the plan watcher saw the person change while no tool of ours ran (and not in the half second after), each with the number of the newest undo point at that moment. The files found changed at the start of the next task (they differ from what our last step left). The list of files the last Undo left alone.
- **What Undo does** (a whole task, one step of a plan, or the undo of the undo). After it saves the project as it is, it works out which files it would change that the person changed themselves: a file whose content is not what our step left, or that the watcher saw changed after the undo point being returned to. Those files are left exactly as they are: not put back, not removed if the person made them, not recreated if the person deleted them. `.env` files count too. Everything else is as before: what we changed goes back, files we made are removed, the person's git and ignored folders are never touched, and the project as it was just before is saved so Undo is undoable.
- **Told in plain words.** The `checkpoint.restored` event carries `yours`. The card says "Undone, except 2 files you changed yourself: a.js, b.css. They were left as you have them." and offers "Put those back too".
- **Put those back too** is a separate command (`checkpoint.putBack`) with its own confirm step and a `confirm: true` the runner insists on. It can name only files the last Undo left alone. It saves the project first, copies the person's version of each file into `recovered/<undo point>/`, then puts the old version back (or removes a file the person made, or brings back one they deleted). A file with no room to copy aside, or behind a link, is left as it is and said so.
- **The switch** `undo.protectMyEdits` (Settings, Work; on by default). Off, only the hash check is dropped: Undo replaces edits made after a task, as it did before (the person's versions are still in the safety copy and can be restored by undoing the undo). Files the person changed while a plan was paused are kept whatever the switch says, and the confirm text says so.
- **Undoing one task in the middle** (Which task broke it) already refused when later work touched the same files and changed nothing; it now says when those files are the person's own, and keeps what it left in step with what our work left.
- **Review fixes (21 Oct 2026).** (1) "Put my fix back" in Your turn sends `checkpoint.restore` with `force: true`: the person asked for their attempt to be replaced, so nothing is kept back, and their version is still in the safety copy. No other button sends `force`. (2) The baseline moves on however a task ends: `runInner` calls `noteAgentEnd` in a `finally` if the usual call was skipped by an error, and an install records only the files it wrote (`writesStart` and `noteAgentWrites`, so a lock file is ours and an earlier edit of the person stays theirs). (3) `own.json` is changed only through `updateOwn`, one read, change and write with nothing awaited between, so a watcher note that lands while git runs is never lost. (4) The help text for the switch now says the person's versions are kept in the safety copy (which is true for every file); only files over 2 MiB are also copied to `recovered/`. (5) A file over 2 MiB is in no snapshot, so the baseline also records its size and time when a step ends; a big file that no longer matches (or that the watcher saw changed) is the person's: Undo leaves it alone and names it. (6) A new task drops the "Put those back too" offer (the files were built on), and a put back refreshes the baseline for the files it wrote, so the next Undo does not take them for the person's.
- **Known limit.** An edit the person makes in the middle of a single task, with no plan watcher, is not seen and counts as the task's own work. Edits at any other time are.

## Revisit if
SDK file checkpointing closes its gaps (Bash edits, subagent edits, directory moves, rewind across sessions). Until then the shadow store is the source of truth.

## Added 30 Oct 2026: undo covers ignored files a task edits (launch check of 15 Oct)
- **Kept before the first edit.** Just before a task's Write, Edit, MultiEdit or NotebookEdit changes a file git ignores, the file is kept under the checkpoint the task started from (`checkpoints.ts` `keepIgnored`):
  - a private 0600 copy, or a note that it was not there
  - only the state before the first edit after each checkpoint
- **Undo to a checkpoint puts each one back,** or removes one the task made (`restoreIgnored`). The safe copy taken before the undo first keeps each one as it is, so the undo can itself be undone.
- **Left out:**
  - `.env` files, which have their own copies
  - anything through a link or outside the project
  - files over 2 MiB, which the receipt names as not covered
- **Still not covered:** ignored files a shell command changes, such as `npm install` writing `node_modules`. Undo of a single step (undoOne) does not touch ignored files.

## Fixed 3 Nov 2026: the store is capped, and keeps no plain .env copy it does not need (must fix 26, an incident under bar rule 9; tested with temporary folders, not tried on a Mac)
- **What was wrong.** The cap above was never built: `gc.auto` was off, nothing was pruned and every snapshot named the one before it as its parent, so nothing could ever be freed. Every checkpoint kept a 0600 copy of every `.env` file, not only changed ones, and since M52 every review batch adds one or two checkpoints. The store sits in the data folder, which Time Machine backed up.
- **The cap now** (`checkpoints.ts`):
  - The newest 100 checkpoints per project are kept, pruned ten at a time. So is every checkpoint something still points at, asked at each prune through `guard`: the project's newest 50 History rows (all that History shows, and more than Which task broke it searches) and the Undo that took each back (`TaskLog.checkpointsOf`), the Bring back point of the latest Undos, Your turn, the latest proof, the preview and Which task broke it (`agent.ts pointedAt`), and the open and reviewed batches of the review of changes and its newest 20 versions (`review/service.ts inUse`). A task's After version stays with its kept Before. When a guard cannot answer (the task log cannot be read), nothing is removed.
  - A pruned checkpoint goes with its notes and its private `.env` copies. What Undo saved aside of the person's own files (`recovered/`) is kept, and not counted toward the cap (pruning cannot shrink it). It is still never cleared: a known gap.
  - New snapshots have no parent, so gc can free a pruned one. Nothing read the chain. Old chains are freed as their refs are pruned.
  - gc (`--prune=now`, refs left as files, since `refs()` reads them that way) runs about weekly, two minutes after the store was last used, and only on power (`pmset`). The size is measured at most hourly. Over about 2 GB, gc runs when idle whatever the power, more is pruned (down to the newest 20 and what is pointed at), and if it is still over, the store says it is full and the review of changes pauses for that project, says so on its card, and starts again from a fresh starting point once there is room. Tasks still take their safety copies when full; Undo is never switched off.
  - The store folder carries the Time Machine exclusion flag (the one `tmutil addexclusion` sets, written with `xattr`, because `tmutil` itself waited about 11 seconds on the backup service each time on this Mac).
  - The build folders the review ignores are excluded too: `.nuxt`, `.output`, `.svelte-kit`, `.vercel`, `.netlify`, `.vite`, `.parcel-cache`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.expo`, `.angular`, `.docusaurus`, `.pnpm-store` and `.yarn/cache`. `out` is not (it can be a real source folder). A store made before this keeps files it already held in those folders.
- **What Undo can and cannot restore for secret files.**
  - A task's versions (Before, After, the safety copy before an Undo, Your turn, the checks' versions) still keep a 0600 copy of each `.env*` file, because Undo puts `.env` back from it. These copies are pruned with their checkpoint, so at most about 100 versions hold one.
  - A review's versions only need to tell whether a `.env` file changed, so they keep a salted hash of it (HMAC SHA-256 with the store's own random 32 byte salt in `env-salt`, 0600), never a copy. Undo to such a version puts the code back but leaves `.env` exactly as it is (never removed, never replaced); undoing one task from such a version refuses and changes nothing; "Put those back too" leaves such a `.env` as it is.
  - What our last step left (`own.json`) now records a salted hash of each `.env` too. A plain hash written before this change is still understood, so an untouched `.env` is not taken for the person's own edit on the first Undo after the upgrade.
  - Not covered, as before: `.env` files more than three folders deep and `.env` files behind a link get no copy. Other key files (`*.pem`, `credentials.json`), and a `.env` file the project's own `.gitignore` does not leave out, are saved as ordinary files in every version, like the rest of the code, and are pruned with it.
- **Not built yet.** A line in Settings that shows the store's size and says when it is full (today the review card says so). A shared copy per distinct `.env` content instead of one per task version.
