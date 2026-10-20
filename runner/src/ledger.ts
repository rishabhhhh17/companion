// The runner's own count of what each project spent today (an estimate, kept by us). It is only a guard on the
// user's own spend: we never pay for, resell or route anyone's Claude usage.
import type { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Ledger {
  private db: Database;
  constructor(path: string, private now: () => Date = () => new Date(), onProblem?: (message: string) => void) {
    this.db = openDatabase(path, onProblem);
    // As the task log: a first write that fails (a full disk, a read-only file) must not stop the engine from starting.
    try { this.setup(); }
    catch {
      try { this.db.close(); } catch { /* already unusable */ }
      onProblem?.("Your spending count could not be saved on this Mac, so it will start again when Companion closes.");
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
    const day = dayKey(this.now());
    try { this.db.query("INSERT INTO spend (project, day, usd) VALUES (?, ?, ?) ON CONFLICT(project, day) DO UPDATE SET usd = usd + excluded.usd").run(project, day, usd); }
    catch { this.unsaved.set(`${project}\n${day}`, (this.unsaved.get(`${project}\n${day}`) ?? 0) + usd); }
  }
  spentToday(project: string): number {
    const day = dayKey(this.now());
    let saved = 0;
    try { saved = (this.db.query("SELECT usd FROM spend WHERE project = ? AND day = ?").get(project, day) as { usd: number } | null)?.usd ?? 0; } catch { /* unreadable: only what was counted here */ }
    return saved + (this.unsaved.get(`${project}\n${day}`) ?? 0);
  }
}
