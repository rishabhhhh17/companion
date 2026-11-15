// M101: did a commit happen in the person's git since a batch of changes began? Only where .git/HEAD points and when that
// branch file (or packed-refs) last changed are read. Never the history, never an object, never a write, and no git command
// is run (rule 10, F13). A worktree's .git file (gitdir: ...) and its commondir are followed, inside reason. Anything odd
// answers false: the card then simply does not mention a commit.
import { lstatSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

/** The command the card shows when a commit was made (it is never run by Squibby): it moves the branch back one commit and
 *  keeps the files as they are now, which after a put back are the files from before the change. */
export const UNDO_COMMIT_COMMAND = "git reset HEAD~1";

const REF = /^refs\/[A-Za-z0-9._\/-]{1,200}$/;
const small = (p: string): string | null => { try { const st = lstatSync(p); if (!st.isFile() || st.size > 4096) return null; return readFileSync(p, "utf8"); } catch { return null; } };
const mtime = (p: string): number | null => { try { const st = statSync(p); return st.isFile() ? st.mtimeMs : null; } catch { return null; } };

/** The folder git keeps its files in for this project, or null. */
function gitDirOf(project: string): string | null {
  const dot = join(project, ".git");
  let st; try { st = lstatSync(dot); } catch { return null; }
  if (st.isDirectory()) return dot;
  if (!st.isFile()) return null;
  const m = /^gitdir:\s*(.+)\s*$/m.exec(small(dot) ?? "");
  if (!m) return null;
  const dir = isAbsolute(m[1]) ? m[1] : resolve(project, m[1]);
  try { return statSync(dir).isDirectory() ? dir : null; } catch { return null; }
}

/** True when the person's branch moved (a commit, most often) at or after sinceMs. */
export function committedSince(project: string, sinceMs: number): boolean {
  try {
    const git = gitDirOf(project);
    if (!git) return false;
    const head = small(join(git, "HEAD"));
    if (head === null) return false;
    const ref = /^ref:\s*(\S+)\s*$/.exec(head.trim());
    // A detached HEAD moves by rewriting HEAD itself.
    if (!ref) return /^[0-9a-f]{40,64}$/.test(head.trim()) && (mtime(join(git, "HEAD")) ?? 0) >= sinceMs;
    if (!REF.test(ref[1]) || ref[1].split("/").includes("..")) return false;
    // A worktree keeps its branches in the common folder.
    const common = (() => { const c = small(join(git, "commondir"))?.trim(); if (!c) return git; const d = isAbsolute(c) ? c : resolve(git, c); return d; })();
    for (const base of new Set([git, common])) {
      const file = resolve(base, ref[1]);
      if (!file.startsWith(resolve(base) + sep)) continue;
      const t = mtime(file);
      if (t !== null) return t >= sinceMs;
    }
    // Only in packed-refs: that file is rewritten when the branch moves there.
    for (const base of new Set([common, git])) {
      const packed = join(base, "packed-refs");
      const text = small(packed) === null ? (() => { try { return statSync(packed).size < 5_000_000 ? readFileSync(packed, "utf8") : null; } catch { return null; } })() : small(packed);
      if (text && text.split("\n").some((l) => l.endsWith(` ${ref[1]}`))) return (mtime(packed) ?? 0) >= sinceMs;
    }
    return false;
  } catch { return false; }
}
