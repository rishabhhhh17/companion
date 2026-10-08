// The runner's own count of what each project spent today (an estimate, kept by us). It is only a guard on the
// user's own spend: we never pay for, resell or route anyone's Claude usage.
import type { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Ledger {
  private db: Database;
  constructor(path: string, private now: () => Date = () => new Date(), onProblem?: (message: string) => void) {
    this.db = openDatabase(path, onProblem);
    this.db.run("CREATE TABLE IF NOT EXISTS spend (project TEXT NOT NULL, day TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, PRIMARY KEY (project, day))");
  }
  add(project: string, usd: number) {
    if (!Number.isFinite(usd) || usd <= 0) return;
    this.db.query("INSERT INTO spend (project, day, usd) VALUES (?, ?, ?) ON CONFLICT(project, day) DO UPDATE SET usd = usd + excluded.usd").run(project, dayKey(this.now()), usd);
  }
  spentToday(project: string): number {
    const r = this.db.query("SELECT usd FROM spend WHERE project = ? AND day = ?").get(project, dayKey(this.now())) as { usd: number } | null;
    return r?.usd ?? 0;
  }
}
