// A small local database of every task, for the timeline, Where was I and recaps.
// It holds a short redacted label, never the full prompt, screen content or secrets.
import type { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";
import { PRODUCT } from "./names.ts";

export type TaskRow = { id: number; project: string; agent: string; mode: string; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null };

export class TaskLog {
  private db: Database;
  constructor(path: string, onProblem?: (message: string) => void) {
    this.db = openDatabase(path, onProblem);
    // Opening can work and the first write still fail (a full disk, a file restored read-only). The engine must still start:
    // fall back to a log in memory, and say so, as when the file cannot be opened at all.
    try { this.setup(); }
    catch {
      try { this.db.close(); } catch { /* already unusable */ }
      onProblem?.(`Your task history could not be saved on this Mac, so it will be lost when ${PRODUCT} closes.`);
      this.db = openDatabase(":memory:");
      this.setup();
    }
  }
  private setup() {
    this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL,
      label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT)`);
    // Older log files get the new columns, and keep their tasks.
    const have = (this.db.query("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name);
    if (!have.includes("checkpoint")) this.db.run("ALTER TABLE tasks ADD COLUMN checkpoint TEXT");
    if (!have.includes("changed")) this.db.run("ALTER TABLE tasks ADD COLUMN changed INTEGER");
    if (!have.includes("proof")) this.db.run("ALTER TABLE tasks ADD COLUMN proof TEXT");
    // A task still marked "running" when the log opens was cut short by a crash or a forced quit.
    this.db.run("UPDATE tasks SET status = 'interrupted', ended_at = COALESCE(ended_at, started_at) WHERE status = 'running'");
  }
  // The Before snapshot is stored with the row at the start, so a task cut short by a crash or a forced quit still has its
  // Undo point (finish keeps it when it has no receipt of its own).
  start(r: { project: string; agent: string; mode: string; label: string; startedAt: string; checkpoint?: string }): number {
    const q = this.db.query("INSERT INTO tasks (project, agent, mode, label, status, started_at, checkpoint) VALUES (?, ?, ?, ?, 'running', ?, ?)");
    return Number(q.run(r.project, r.agent, r.mode, r.label, r.startedAt, r.checkpoint ?? null).lastInsertRowid);
  }
  finish(id: number, status: string, usd: number, endedAt: string, receipt?: { checkpoint: string; changed: number; proof: string }) {
    this.db.query("UPDATE tasks SET status = ?, usd = ?, ended_at = ?, checkpoint = COALESCE(?, checkpoint), changed = ?, proof = ? WHERE id = ?")
      .run(status, usd, endedAt, receipt?.checkpoint ?? null, receipt?.changed ?? null, receipt?.proof ?? null, id);
  }
  // Newest first. Pass a project to see only its tasks.
  list(project?: string, limit = 200): TaskRow[] {
    const rows = (project === undefined
      ? this.db.query("SELECT * FROM tasks ORDER BY id DESC LIMIT ?").all(limit)
      : this.db.query("SELECT * FROM tasks WHERE project = ? ORDER BY id DESC LIMIT ?").all(project, limit)) as any[];
    return rows.map((r) => ({
      id: r.id, project: r.project, agent: r.agent, mode: r.mode, label: r.label, status: r.status, usd: r.usd, startedAt: r.started_at, endedAt: r.ended_at,
      checkpoint: r.checkpoint ?? null, changed: r.changed ?? null, proof: r.proof ?? null,
    }));
  }
}
