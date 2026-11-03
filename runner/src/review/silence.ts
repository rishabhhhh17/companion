// M57 feature 7, "Don't flag this kind here again", made safe (review finding, 4 Nov 2026). The line itself lives in the
// project's memory (What I remember, <project>/.companion/project.md), so the person can read and forget it. But that file
// is inside the project: the tool being reviewed, or a repo the person cloned, can write the same words there, and the
// watcher ignores .companion, so that change would never be reviewed. So a line silences its kind only when the person
// pressed the button for it, as recorded here, in Squibby's own data folder, outside every project. A line forgotten in
// memory is dropped from the record too, so writing it back by hand does not bring the silence back.
// Only the kinds of REVIEW_SILENCE_LINES are ever recorded; a key, a settings or key file, open data and any Fix this first
// are never in that list (and applyStrictness refuses them anyway). The file holds project paths and kind names only.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REVIEW_SILENCE_LINES, type ReviewReasonKind } from "../../../protocol/index.ts";

const kindOf = (line: string): ReviewReasonKind | null => {
  const t = line.trim().toLowerCase();
  for (const [k, l] of Object.entries(REVIEW_SILENCE_LINES)) if (l && l.toLowerCase() === t) return k as ReviewReasonKind;
  return null;
};
const has = (lines: readonly string[], kind: ReviewReasonKind): boolean => lines.some((l) => kindOf(l) === kind);
const key = (project: string): string => { try { return resolve(project); } catch { return project; } };

export class SilenceLedger {
  constructor(private file: string) {}

  private read(): Record<string, ReviewReasonKind[]> {
    try {
      const j = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!j || typeof j !== "object" || Array.isArray(j)) return {};
      const out: Record<string, ReviewReasonKind[]> = {};
      for (const [p, ks] of Object.entries(j as Record<string, unknown>)) {
        if (Array.isArray(ks)) out[p] = ks.filter((k): k is ReviewReasonKind => typeof k === "string" && !!REVIEW_SILENCE_LINES[k as ReviewReasonKind]);
      }
      return out;
    } catch { return {}; }
  }
  private write(all: Record<string, ReviewReasonKind[]>): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch { /* not recorded: the line then silences nothing, the safe side */ }
  }

  /** The person pressed "Don't flag this kind here again" and its line was saved. lines: the project's memory lines after
   *  the save; nothing is recorded when the line is not among them (the save was refused) or is not a silence line. */
  pressed(project: string, line: string, lines: readonly string[]): void {
    const k = kindOf(line);
    if (!k || !has(lines, k)) return;
    const all = this.read(), p = key(project);
    const now = new Set(all[p] ?? []);
    if (now.has(k)) return;
    now.add(k);
    all[p] = [...now];
    this.write(all);
  }
  /** Drops every recorded kind whose line is no longer in the project's memory (forgotten, edited or erased). */
  prune(project: string, lines: readonly string[]): void {
    const all = this.read(), p = key(project);
    const before = all[p] ?? [];
    const kept = before.filter((k) => has(lines, k));
    if (kept.length === before.length) return;
    if (kept.length) all[p] = kept; else delete all[p];
    this.write(all);
  }
  /** The memory lines that silence a kind in this project: a silence line the person pressed for, still in memory. */
  lines(project: string, lines: readonly string[]): string[] {
    this.prune(project, lines);
    const marked = new Set(this.read()[key(project)] ?? []);
    return lines.filter((l) => { const k = kindOf(l); return !!k && marked.has(k); });
  }
}
