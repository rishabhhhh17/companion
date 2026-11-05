// F13 and rule 10: Companion never writes the person's git, and never runs a git command on their history. To tell them when
// git moved during a task (a command they said yes to), it reads only the files that say where HEAD is (.git/HEAD, the
// branch's ref, packed-refs) and HEAD's own log (logs/HEAD), with no git process. The receipt shows the exact command to
// take a commit back only when the log shows plain commits on the same branch; anything else (a branch switch, a pull, a
// merge, a rebase, an amend) is said plainly, with no reset that could drop work.
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** Where HEAD is: the commit (null in a new repository with no commit yet), the branch it is on (null when detached), and
 *  the folder that holds this checkout's git files. */
export type HeadState = { sha: string | null; ref: string | null; dir: string };

const SHA = /^[0-9a-f]{40,64}$/;
const ZERO = /^0+$/;

/** Where HEAD is in this folder's own git, or null (no git here, or it cannot be read). */
export function headOf(project: string): HeadState | null {
  try {
    let dir = join(project, ".git");
    // A worktree or a submodule has a .git file that names the real folder.
    if (statSync(dir).isFile()) { const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dir, "utf8")); if (!m) return null; dir = isAbsolute(m[1].trim()) ? m[1].trim() : resolve(project, m[1].trim()); }
    const head = readFileSync(join(dir, "HEAD"), "utf8").trim();
    if (SHA.test(head)) return { sha: head, ref: null, dir };
    const ref = /^ref:\s*(refs\/\S+)$/.exec(head)?.[1];
    if (!ref || ref.includes("..")) return null;
    // A worktree keeps its branches in the main folder (commondir).
    let common = dir;
    try { const c = readFileSync(join(dir, "commondir"), "utf8").trim(); if (c) common = isAbsolute(c) ? c : resolve(dir, c); } catch { /* not a worktree */ }
    for (const d of [dir, common]) { try { const v = readFileSync(join(d, ref), "utf8").trim(); if (SHA.test(v)) return { sha: v, ref, dir }; } catch { /* packed */ } }
    for (const d of [dir, common]) {
      try { for (const line of readFileSync(join(d, "packed-refs"), "utf8").split("\n")) { const [sha, name] = line.split(" "); if (name === ref && SHA.test(sha)) return { sha, ref, dir }; } } catch { /* none */ }
    }
    return { sha: null, ref, dir };   // a new repository with no commit yet
  } catch { return null; }
}

/** The commit HEAD points at in this folder's own git, or null (no git here, no commit yet, or it cannot be read). */
export function gitHead(project: string): string | null { return headOf(project)?.sha ?? null; }

/** Whether HEAD's own log shows it went from `from` (null: no commit yet) to `to` by plain commits only, one after another.
 *  The person's own commits look the same, so the receipt's words leave room for that. No log, or anything else: false. */
function plainCommits(dir: string, from: string | null, to: string): boolean {
  let lines: string[];
  try { lines = readFileSync(join(dir, "logs", "HEAD"), "utf8").split("\n").filter(Boolean); } catch { return false; }
  let cur = to;
  for (let i = lines.length - 1, steps = 0; i >= 0 && steps < 50; i--, steps++) {
    const tab = lines[i].indexOf("\t");
    const [old, now] = lines[i].split(" ");
    const why = tab >= 0 ? lines[i].slice(tab + 1) : "";
    if (now !== cur) return false;
    const first = ZERO.test(old);
    if (!(first ? /^commit \(initial\): / : /^commit: /).test(why)) return false;
    if (first) return from === null;
    if (old === from) return true;
    cur = old;
  }
  return false;
}

const branch = (ref: string | null): string | null => (ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null);
const short = (sha: string) => sha.slice(0, 12);

/** The receipt's line when git moved during a task: what happened, and the command that takes it back only when that
 *  command is safe (plain commits on the same branch: a soft reset keeps the changes). null when nothing moved. */
export function headMovedLine(before: HeadState | null, after: HeadState | null): string | null {
  if (!after?.sha) return null;
  if (before && before.sha === after.sha && before.ref === after.ref) return null;
  if (before && before.ref !== after.ref) {
    const was = branch(before.ref), now = branch(after.ref);
    const to = now ? `branch ${now}` : `commit ${short(after.sha)}`;
    if (was) return `Git in your project moved from branch ${was} to ${to} during this task. Undo does not touch Git. To go back, run: git switch ${was}`;
    return `Git in your project moved from ${before.sha ? `commit ${short(before.sha)}` : "no commit"} to ${to} during this task. Undo does not touch Git.`;
  }
  const from = before?.sha ?? null;
  if (plainCommits(after.dir, from, after.sha)) {
    if (!from) return "A first Git commit was made in your project during this task. Undo does not touch Git. If you did not make it yourself, this takes it back and keeps the changes: git update-ref -d HEAD";
    return `A Git commit was made in your project during this task. Undo does not touch Git. If you did not make it yourself, this takes it back and keeps the changes: git reset --soft ${short(from)}`;
  }
  return `Git history in your project moved during this task (from ${from ? short(from) : "no commit"} to ${short(after.sha)}), by something other than a plain commit, such as a pull, a merge, a rebase or an amend. Undo does not touch Git. To see what changed, run: git log --oneline -5`;
}
