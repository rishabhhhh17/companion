// M117: "I set this up outside the code", made safe the way "Don't flag this kind here again" is (review/silence.ts). The
// line lives in the project's memory (What I remember), so the person can read and forget it; but that file is inside the
// project, where the tool being checked could write the same words. So a told line counts only when the person pressed the
// button for it, as recorded here in Squibby's own data folder, outside every project. A line forgotten in memory is dropped
// from the record, so writing it back by hand brings nothing back. A told finding is still shown: it is never a pass.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { moneyToldOf } from "../../../protocol/index.ts";

const key = (project: string): string => { try { return resolve(project); } catch { return project; } };
const MAX_PER_PROJECT = 200;

export class ToldLedger {
  constructor(private file: string) {}
  private read(): Record<string, string[]> {
    try {
      const j = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!j || typeof j !== "object" || Array.isArray(j)) return {};
      const out: Record<string, string[]> = {};
      for (const [p, ls] of Object.entries(j as Record<string, unknown>)) if (Array.isArray(ls)) out[p] = ls.filter((l): l is string => typeof l === "string" && moneyToldOf([l]).length === 1);
      return out;
    } catch { return {}; }
  }
  private write(all: Record<string, string[]>): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(all), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch { /* not recorded: the line then counts for nothing, the safe side */ }
  }
  /** The person pressed the button and its line was saved. lines: the project's memory lines after the save. */
  pressed(project: string, line: string, lines: readonly string[]): void {
    const t = line.trim();
    if (moneyToldOf([t]).length !== 1 || !lines.some((l) => l.trim() === t)) return;
    const all = this.read(), p = key(project);
    const now = all[p] ?? [];
    if (now.includes(t)) return;
    all[p] = [...now, t].slice(-MAX_PER_PROJECT);
    this.write(all);
  }
  /** Drops every recorded line no longer in the project's memory. */
  prune(project: string, lines: readonly string[]): void {
    const all = this.read(), p = key(project);
    const before = all[p] ?? [];
    const have = new Set(lines.map((l) => l.trim()));
    const kept = before.filter((l) => have.has(l));
    if (kept.length === before.length) return;
    if (kept.length) all[p] = kept; else delete all[p];
    this.write(all);
  }
  /** The told lines that count in this project: pressed for, and still in memory. */
  lines(project: string, lines: readonly string[]): string[] {
    this.prune(project, lines);
    const marked = new Set(this.read()[key(project)] ?? []);
    return lines.map((l) => l.trim()).filter((l) => marked.has(l));
  }
}
