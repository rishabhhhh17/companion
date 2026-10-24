// The runner's own count of what each project spent today (an estimate, kept by us). It is only a guard on the
// user's own spend: we never pay for, resell or route anyone's Claude usage.
import type { Database } from "bun:sqlite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "./db.ts";
import { PRODUCT } from "./names.ts";

/** The stand in for "no folder chosen" (agent.ts NO_PROJECT, which imports this file, so it is not imported here). */
const STAND_IN = "no-project";
/** One folder, one day, however the folder is spelled: a trailing slash, a "." step, a link to it, or capital letters the disk
 *  does not care about all count as the same folder. The stand in and an empty name are kept as they are. */
export function projectKey(project: string): string {
  if (!project || project === STAND_IN) return project;
  const plain = resolve(project);
  try { return realpathSync.native(plain); } catch { return plain; }
}
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Ledger {
  private db: Database;
  constructor(path: string, private now: () => Date = () => new Date(), onProblem?: (message: string) => void) {
    this.db = openDatabase(path, onProblem);
    // As the task log: a first write that fails (a full disk, a read-only file) must not stop the engine from starting.
    try { this.setup(); }
    catch {
      try { this.db.close(); } catch { /* already unusable */ }
      onProblem?.(`Your spending count could not be saved on this Mac, so it will start again when ${PRODUCT} closes.`);
      this.db = openDatabase(":memory:");
      this.setup();
    }
  }
  private setup() {
    this.db.run("CREATE TABLE IF NOT EXISTS spend (project TEXT NOT NULL, day TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, PRIMARY KEY (project, day))");
  }
  // What could not be written to the file (a full disk, a read-only file) is still counted while Companion runs, so the daily
  // limit keeps guarding the person's spend.
  private unsaved = new Map<string, number>();
  add(project: string, usd: number) {
    if (!Number.isFinite(usd) || usd <= 0) return;
    const day = dayKey(this.now()), name = projectKey(project);
    try { this.db.query("INSERT INTO spend (project, day, usd) VALUES (?, ?, ?) ON CONFLICT(project, day) DO UPDATE SET usd = usd + excluded.usd").run(name, day, usd); }
    catch { this.unsaved.set(`${name}\n${day}`, (this.unsaved.get(`${name}\n${day}`) ?? 0) + usd); }
  }
  /** What the folder spent today: under its one true name, and under any plain spelling an earlier version booked it under. */
  spentToday(project: string): number {
    const day = dayKey(this.now());
    let total = 0;
    for (const name of new Set([projectKey(project), project])) {
      let saved = 0;
      try { saved = (this.db.query("SELECT usd FROM spend WHERE project = ? AND day = ?").get(name, day) as { usd: number } | null)?.usd ?? 0; } catch { /* unreadable: only what was counted here */ }
      total += saved + (this.unsaved.get(`${name}\n${day}`) ?? 0);
    }
    return total;
  }
}
