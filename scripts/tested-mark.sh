#!/bin/sh
# Must fix 6: a note that the whole gate (test-all.sh) passed on one exact commit, so release.sh never ships code nobody
# tested. It uses only git commands that read (never one that changes a branch, the staging area or history, rule 10).
# The note is .tested-head at the top of the repo (ignored by git), holding the commit's full id.
#   tested-mark.sh clear    forget any earlier note (test-all.sh does this first, so a failed run leaves none)
#   tested-mark.sh write    note HEAD, only if nothing is uncommitted (otherwise the tests ran on code HEAD does not have)
#   tested-mark.sh check    exit 0 only if the note names HEAD and nothing is uncommitted now
set -eu
cd "$(dirname "$0")/.."
MARK=".tested-head"
# --no-optional-locks: even git status must not write the index while it looks.
dirty() { [ -n "$(git --no-optional-locks status --porcelain 2>/dev/null)" ]; }
head_id() { git rev-parse --verify -q HEAD 2>/dev/null || true; }
case "${1:-}" in
  clear) rm -f "$MARK" ;;
  write)
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo "Not a git checkout, so no tested commit was noted."; exit 0; fi
    if dirty; then rm -f "$MARK"; echo "Not noted as tested for a release: there are uncommitted changes, so these tests did not run on a commit."; exit 0; fi
    H="$(head_id)"; [ -n "$H" ] || { echo "No commit yet, so nothing was noted."; exit 0; }
    printf '%s\n' "$H" > "$MARK"
    echo "Noted: every suite passed on commit $H."
    ;;
  check)
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "FAIL: this is not a git checkout, so the commit cannot be known"; exit 1; }
    if dirty; then echo "FAIL: there are uncommitted changes. A release is built only from a commit: commit or put them aside first."; exit 1; fi
    H="$(head_id)"
    [ -f "$MARK" ] && [ "$(cat "$MARK")" = "$H" ] || { echo "FAIL: the full test suite has not passed on commit ${H:-none} (run scripts/test-all.sh)"; exit 1; }
    echo "Tested: every suite passed on commit $H, and nothing is uncommitted."
    ;;
  *) echo "usage: tested-mark.sh clear|write|check"; exit 2 ;;
esac
