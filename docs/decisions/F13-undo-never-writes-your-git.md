# F13. Undo never writes your git

- **Status:** Fixed. Founder decision; do not reopen without the founder.
- **Date:** 2026-10-07
- **Source:** the founder's reply to M0 plan decision 3 (`docs/milestones/M0-spikes.md`), 7 Oct 2026
- **Related:** F11, T05, T06

## Decision
Companion's own machinery never writes the user's git: not their branch, their staging area or their history, and not even to undo an agent's work. The undo helper the research had planned (`git reset --soft` back to a recorded commit, then putting back a saved copy of `.git/index`) is dropped, and so are per agent git worktrees. When an agent made a commit during a step, Companion shows the exact git command to undo it so the user can run it themselves, or asks through an approval card, where it runs as an agent git command like any other.

## Why
- The rule that never bends says Companion's own machinery never writes the user's git (AGENTS.md rule 10). The helper and worktrees would each have needed an exception to it.
- Undo already works without touching git: whole tree snapshots in a separate shadow store (T06).
- An approval card keeps the user in control and leaves a receipt, the same as every other agent git change.

## What this means for the build
- Snapshots record the user's `HEAD` at each checkpoint, reading only, so the receipt can show the exact undo command.
- The approval card path reuses the normal agent git approval (technical_research.md sections 6 and 8). Nothing new runs on its own.
- No code path creates a git worktree in a user's project.

## What it rules out
- A one click "undo the agent's commit" that Companion runs by itself.
- Per agent git worktrees (Conductor's model).
- Saving and restoring the user's `.git/index`.

## Revisit only if
The founder decides to.
