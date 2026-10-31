// Opening a local database must never stop Companion. A damaged file is moved aside and a fresh one started; a busy file
// is waited for; a folder that cannot be written falls back to memory and says so.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { PRODUCT } from "./names.ts";

function open(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.run("PRAGMA busy_timeout = 5000");                 // wait a few seconds when another program has the file, instead of failing at once
  if (path !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  db.query("SELECT count(*) FROM sqlite_master").get();  // fails now, not later, if the file is not a database
  return db;
}

export function openDatabase(path: string, onProblem: (message: string) => void = () => {}): Database {
  try { return open(path); }
  catch (first) {
    if (existsSync(path)) {
      try {
        renameSync(path, `${path}.damaged-${Date.now()}`);
        const db = open(path);
        onProblem("Your saved task history was damaged, so a new one was started. The old file was kept next to it.");
        return db;
      } catch { /* fall through to memory */ }
    }
    void first;
    onProblem(`Your task history could not be saved on this Mac, so it will be lost when ${PRODUCT} closes.`);
    return open(":memory:");
  }
}

/** The free fix count (payments spec sections 2 and 9): one row per counted fix, in the same file as the task history
 *  (tasks.db), so Delete everything removes it with the rest of the engine's data and the count starts again. ticket: the
 *  admitted fix the row is for (plan.ts), so a follow up, a Try again or the steps of one plan count once; task: the task
 *  history row that proved it; month: this Mac's local month (YYYY-MM); at: when. It holds no key and nothing about the
 *  project. The table is made the first time it is used, so with payments off nothing is ever written. */
export class FreeFixes {
  private ready = false;
  constructor(private db: Database) {}
  private setup() {
    if (this.ready) return;
    this.db.run("CREATE TABLE IF NOT EXISTS free_fixes (ticket TEXT PRIMARY KEY, task INTEGER, month TEXT NOT NULL, at TEXT NOT NULL)");
    this.ready = true;
  }
  /** How many fixes were counted in this month (YYYY-MM). */
  count(month: string): number {
    this.setup();
    return Number((this.db.query("SELECT count(*) AS n FROM free_fixes WHERE month = ?").get(month) as { n: number }).n);
  }
  /** Counts the fix once: false when this ticket was counted already. */
  record(ticket: string, task: number | null, month: string, at: string): boolean {
    this.setup();
    return this.db.query("INSERT OR IGNORE INTO free_fixes (ticket, task, month, at) VALUES (?, ?, ?, ?)").run(ticket, task, month, at).changes > 0;
  }
  /** Whether any fix was ever counted here (since the last Delete everything). */
  any(): boolean {
    this.setup();
    return this.db.query("SELECT 1 FROM free_fixes LIMIT 1").get() != null;
  }
}
