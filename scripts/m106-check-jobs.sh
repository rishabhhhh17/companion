#!/bin/sh
# M106 [verify] on a real Mac (docs/milestones/M106-background-jobs.md): are Claude Code's background jobs where Squibby
# looks, and does nothing touch git?
#   scripts/m106-check-jobs.sh steps                 what to do, in order
#   scripts/m106-check-jobs.sh list <folder>         the job folders under .claude/worktrees, and whether Squibby follows each
#   scripts/m106-check-jobs.sh before <folder>       notes a fingerprint of .git and each job's .git file
#   scripts/m106-check-jobs.sh after <folder>        says whether any of them changed since "before"
# Only a throwaway practice folder (never a real project). This script never runs git, calls no model and sends nothing.
set -eu
name_ok() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'; }
print() {
  dir=$1
  { [ -d "$dir/.git" ] && find "$dir/.git" -type f | LC_ALL=C sort | while IFS= read -r f; do shasum -a 256 "$f"; done
    for j in "$dir"/.claude/worktrees/*/.git; do [ -f "$j" ] && shasum -a 256 "$j"; done; } 2>/dev/null || true
}
case "${1:-}" in
  steps)
    cat <<'EOF'
1. Make a practice folder with a small app, make it a git repo yourself, and open it in Squibby (Fixing: reviews on).
2. scripts/m106-check-jobs.sh before <folder>
3. In that folder, start a Claude Code background job (agent view, or claude --worktree) and ask it to change one file.
4. scripts/m106-check-jobs.sh list <folder>    (item a: the folder is there, its name is followed)
5. Watch Home: the card says "N files changed in Claude's background job "name"." after the quiet time (items b, c).
6. Press Review them on that card (item e). Then start a second job that changes the same file, review it (item f).
7. scripts/m106-check-jobs.sh after <folder>   (item g: nothing in .git changed because of Squibby)
   Claude Code itself writes .git when it makes a worktree or a commit, so run "before" after the jobs exist to check
   only Squibby's review.
Write down what you saw for (a) to (g) in the milestone doc. Delete the practice folder when done.
EOF
    ;;
  list)
    dir=${2:?the practice folder}
    [ -L "$dir/.claude" ] && { echo ".claude is a link: Squibby follows no job here."; exit 0; }
    [ -L "$dir/.claude/worktrees" ] && { echo ".claude/worktrees is a link: Squibby follows no job here."; exit 0; }
    found=0
    for j in "$dir"/.claude/worktrees/*; do
      [ -e "$j" ] || continue
      found=1; n=$(basename "$j")
      if [ -L "$j" ]; then echo "$n: a link, not followed"
      elif ! name_ok "$n"; then echo "$n: a name Squibby does not follow"
      elif [ -f "$j/.git" ]; then echo "$n: followed (has its .git file)"
      else echo "$n: followed (no .git file: not a git worktree?)"; fi
    done
    [ "$found" = 1 ] || echo "No job folder under $dir/.claude/worktrees yet."
    ;;
  before)
    dir=${2:?the practice folder}
    print "$dir" > "$dir/../.m106-git-before"
    echo "Noted $(wc -l < "$dir/../.m106-git-before" | tr -d ' ') files."
    ;;
  after)
    dir=${2:?the practice folder}
    [ -f "$dir/../.m106-git-before" ] || { echo "Run before first."; exit 2; }
    if print "$dir" | cmp -s - "$dir/../.m106-git-before"; then echo "Same: nothing in .git or the jobs' .git files changed."; else echo "Changed:"; print "$dir" | diff "$dir/../.m106-git-before" - || true; fi
    ;;
  *) echo "Usage: $0 steps | list <folder> | before <folder> | after <folder>"; exit 2;;
esac
