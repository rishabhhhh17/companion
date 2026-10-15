// Teaching from the change itself (F16: teaching rides inside the fix). The real change a task made, cut into the places
// that changed, is used three ways: Explain is shown it so its "why" is about the work and not about Claude's own summary;
// "Show me what changed" rings the first changed line in the person's editor; and "your turn" finds the same small change
// made in two places, so the person can make the second one themselves. Plain code, no model, nothing read from the screen.
// Settings and key files, Companion's, Claude's and git's own folders, installed packages, build output and lock files are
// never used, and every secret looking value is hidden before any of it leaves this file.
import { isEnvFile } from "./diagram.ts";
import { clip, label, redact } from "./redact.ts";
import { PROTECTED } from "./safety.ts";

export type Changed = { file: string; kind: string };
/** One place that changed. beforeAt and afterAt are 1-based line numbers in the file before and after; context is up to two
 *  unchanged lines just above the place, as they are after. */
export type Hunk = { file: string; beforeAt: number; before: string[]; afterAt: number; after: string[]; context: string[]; next?: string };
/** A line in the project as it is now, to ring in the person's editor. */
export type ChangeAt = { file: string; line: number; lineText: string };
/** The same change made in two places. was and now are the changed words, cut to the whole word around them. */
export type Repeat = { first: Hunk; second: Hunk; was: string; now: string };

// Folders the person did not write (the same list Point at the problem uses), and files no one learns from.
const NOT_THEIRS = new Set(["node_modules", "dist", "build", ".next", ".nuxt", ".svelte-kit", ".output", "coverage", ".vercel", ".turbo", ".cache", "__pycache__", ".venv", "venv"]);
const LOCK_OR_MINIFIED = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock)$|\.min\.(js|css)$|\.map$/i;

/** May this file be shown to the fast model or rung on screen? */
export function teachable(file: string): boolean {
  if (!file || isEnvFile(file) || LOCK_OR_MINIFIED.test(file)) return false;
  const parts = file.split("/").map((p) => p.toLowerCase());
  if (parts.some((p) => PROTECTED.has(p) || NOT_THEIRS.has(p)) || parts[0] === ".gitmodules") return false;
  return true;
}

type Op = "=" | "-" | "+";
// Past this many changed lines the work of finding the smallest difference is not worth it: the middle is one place.
const MAX_EDITS = 1500;

/** The smallest set of lines removed and added (Myers' method), after the lines the two have in common at the start and
 *  the end are set aside. Gives null when the two differ in too many places to be worth the work. */
function middleOps(a: string[], b: string[]): Op[] | null {
  const n = a.length, m = b.length, max = n + m;
  if (max === 0) return [];
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, MAX_EDITS); d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));   // the state before this round, for k from -d-1 to d+1
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) {
        // Walk back through the rounds to read off the edits.
        const ops: Op[] = [];
        let cx = n, cy = m;
        for (let e = d; e > 0; e--) {
          const pv = trace[e], get = (kk: number) => pv[kk + e + 1];
          const ck = cx - cy;
          const pk = ck === -e || (ck !== e && get(ck - 1) < get(ck + 1)) ? ck + 1 : ck - 1;
          const px = get(pk), py = px - pk;
          while (cx > px && cy > py) { ops.push("="); cx--; cy--; }
          if (cx === px) { ops.push("+"); cy--; } else { ops.push("-"); cx--; }
        }
        while (cx > 0 && cy > 0) { ops.push("="); cx--; cy--; }
        return ops.reverse();
      }
    }
  }
  return null;
}

// A file's lines. The empty piece after a last line break is not a line of its own.
function rowsOf(text: string): { rows: string[]; endsWithBreak: boolean } {
  if (text === "") return { rows: [], endsWithBreak: false };
  const rows = text.split("\n");
  const endsWithBreak = rows.at(-1) === "";
  if (endsWithBreak) rows.pop();
  return { rows, endsWithBreak };
}

/** The places that changed between two versions of one file. Lines are split on "\n" only, so a Windows "\r" stays part of
 *  its line and nothing about the file's own line endings is lost. */
export function hunksOf(file: string, before: string, after: string): Hunk[] {
  const a = rowsOf(before).rows, b = rowsOf(after).rows;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const am = a.slice(p, a.length - s), bm = b.slice(p, b.length - s);
  const mid = middleOps(am, bm) ?? [...am.map(() => "-" as Op), ...bm.map(() => "+" as Op)];
  const ops: Op[] = [...Array<Op>(p).fill("="), ...mid, ...Array<Op>(s).fill("=")];
  const out: Hunk[] = [];
  let ia = 0, ib = 0, cur: Hunk | null = null;
  for (const op of ops) {
    if (op === "=") { cur = null; ia++; ib++; continue; }
    if (!cur) { cur = { file, beforeAt: ia + 1, before: [], afterAt: ib + 1, after: [], context: b.slice(Math.max(0, ib - 2), ib) }; out.push(cur); }
    if (op === "-") { cur.before.push(a[ia]); ia++; } else { cur.after.push(b[ib]); ib++; }
  }
  // A place that only took lines away: the line that now stands where they were, so it can still be pointed at.
  for (const h of out) if (h.after.length === 0 && h.afterAt - 1 < b.length) h.next = b[h.afterAt - 1];
  return out;
}

/** Every place a task changed, file by file in the receipt's order (by name), from the files' text before and after. A file that is not
 *  teachable, looks binary, or was too big to be read (so it is missing from the texts) is left out. */
export function taskHunks(changed: Changed[], before: Record<string, string>, after: Record<string, string>): Hunk[] {
  const out: Hunk[] = [];
  for (const c of [...changed].sort((x, y) => x.file.localeCompare(y.file))) {   // the receipt's order
    if (!teachable(c.file)) continue;
    const hasB = Object.hasOwn(before, c.file), hasA = Object.hasOwn(after, c.file);
    if ((c.kind !== "added" && !hasB) || (c.kind !== "deleted" && !hasA)) continue;
    const bt = hasB ? before[c.file] : "", at = hasA ? after[c.file] : "";
    if (bt.includes("\u0000") || at.includes("\u0000")) continue;
    out.push(...hunksOf(c.file, bt, at));
  }
  return out;
}

const LINE_MAX = 200;
/** The change in a plain form for Explain: per file, where each place is, then lines taken away (-) and added (+). Every
 *  secret looking value is hidden over the whole text first (a key can span lines), then lines and the whole are cut. */
export function diffForExplain(hunks: Hunk[], maxChars = 6000): string {
  const rows: string[] = [];
  let file = "";
  for (const h of hunks) {
    if (h.file !== file) { file = h.file; rows.push(`--- ${h.file}`); }
    rows.push(`@@ line ${h.afterAt}`);
    for (const c of h.context) rows.push(`  ${c}`);
    for (const l of h.before) rows.push(`- ${l}`);
    for (const l of h.after) rows.push(`+ ${l}`);
  }
  const hidden = redact(rows.join("\n")).split("\n").map((r) => clip(r.replace(/\r$/, ""), LINE_MAX));
  const out: string[] = [];
  let size = 0;
  for (const r of hidden) {
    if (size + r.length + 1 > maxChars) { out.push("[... cut: the change is longer than what was sent ...]"); break; }
    out.push(r); size += r.length + 1;
  }
  return out.join("\n");
}

const hasWords = (l: string) => /\S/.test(l);
/** The first line to ring: the first added or changed line with words on it, in the file as it is now. When a place only
 *  took lines away, the line now standing where they were. Nothing for a deleted file or no places at all. */
export function changeTarget(hunks: Hunk[]): ChangeAt | null {
  for (const h of hunks) {
    const i = h.after.findIndex(hasWords);
    if (i >= 0) return { file: h.file, line: h.afterAt + i, lineText: label(h.after[i], LINE_MAX) };
  }
  // Only removals: the line that now stands in their place, or the one just above, if the file still has one with words.
  for (const h of hunks) {
    if (h.after.length) continue;
    if (h.next !== undefined && hasWords(h.next)) return { file: h.file, line: h.afterAt, lineText: label(h.next, LINE_MAX) };
    const above = h.context.at(-1);
    if (above !== undefined && hasWords(above)) return { file: h.file, line: h.afterAt - 1, lineText: label(above, LINE_MAX) };
  }
  return null;
}

const WORD = /[A-Za-z0-9_$]/;
/** What a small change did, as the words that changed: common text at both ends is set aside, then the cut is widened to
 *  whole words, so "user.name" to "user?.name" reads as "user" to "user?". */
export function changeCore(before: string, after: string): { was: string; now: string } | null {
  if (before === after) return null;
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  while (p > 0 && WORD.test(before[p - 1])) p--;
  while (s > 0 && WORD.test(before[before.length - s])) s--;
  const was = before.slice(p, before.length - s), now = after.slice(p, after.length - s);
  return /\S/.test(was + now) ? { was, now } : null;
}

const small = (h: Hunk) => h.before.length >= 1 && h.before.length <= 3 && h.after.length >= 1 && h.after.length <= 3 && (h.before.join("").length + h.after.join("").length) <= 400;
const trimmed = (l: string[]) => l.map((x) => x.trim()).join("\n");
/** The same small change made in two places: the first pair found, in order. Each place must change existing lines (not
 *  only add or only remove some), be at most three lines, and change more than spacing. */
export function repeatedChange(hunks: Hunk[]): Repeat | null {
  const sigs = hunks.map((h) => {
    if (!small(h)) return null;
    const c = changeCore(trimmed(h.before), trimmed(h.after));
    return c ? { ...c, key: JSON.stringify([c.was, c.now]) } : null;
  });
  for (let i = 0; i < hunks.length; i++) {
    const a = sigs[i];
    if (!a) continue;
    for (let j = i + 1; j < hunks.length; j++) {
      const b = sigs[j];
      if (b && b.key === a.key) return { first: hunks[i], second: hunks[j], was: label(a.was, 80), now: label(a.now, 80) };
    }
  }
  return null;
}

/** The file's text with one place put back the way it was before the task, or null when the text no longer has the task's
 *  version at that place (the person or something else changed it since). */
export function revertHunk(text: string, h: Hunk): string | null {
  const { rows, endsWithBreak } = rowsOf(text);
  const at = h.afterAt - 1;
  if (at < 0 || at + h.after.length > rows.length) return null;
  for (let i = 0; i < h.after.length; i++) if (rows[at + i] !== h.after[i]) return null;
  const out = [...rows.slice(0, at), ...h.before, ...rows.slice(at + h.after.length)];
  return out.join("\n") + (endsWithBreak && out.length ? "\n" : "");
}

const squash = (l: string[]) => l.join("\n").replace(/\s+/g, "");
/** Did the person make the task's change at this place? Spacing does not count, and the place may have moved a few lines. */
export function madeSameChange(text: string, h: Hunk, reach = 10): boolean {
  const rows = rowsOf(text).rows, want = squash(h.after), n = h.after.length;
  if (!want) return false;
  for (let at = Math.max(0, h.afterAt - 1 - reach); at <= Math.min(rows.length - n, h.afterAt - 1 + reach); at++) {
    if (squash(rows.slice(at, at + n)) === want) return true;
  }
  return false;
}
