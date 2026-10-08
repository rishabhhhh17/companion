// A small local database of every task, for the timeline, Where was I and recaps.
// It holds a short redacted label, never the full prompt, screen content or secrets.
import { Database } from "bun:sqlite";

export type TaskRow = { id: number; project: string; agent: string; mode: string; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null };

export class TaskLog {
  private db: Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL,
      label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT)`);
    // Older log files get the new columns, and keep their tasks.
    const have = (this.db.query("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name);
    if (!have.includes("checkpoint")) this.db.run("ALTER TABLE tasks ADD COLUMN checkpoint TEXT");
    if (!have.includes("changed")) this.db.run("ALTER TABLE tasks ADD COLUMN changed INTEGER");
    if (!have.includes("proof")) this.db.run("ALTER TABLE tasks ADD COLUMN proof TEXT");
  }
  start(r: { project: string; agent: string; mode: string; label: string; startedAt: string }): number {
    const q = this.db.query("INSERT INTO tasks (project, agent, mode, label, status, started_at) VALUES (?, ?, ?, ?, 'running', ?)");
    return Number(q.run(r.project, r.agent, r.mode, r.label, r.startedAt).lastInsertRowid);
  }
  finish(id: number, status: string, usd: number, endedAt: string, receipt?: { checkpoint: string; changed: number; proof: string }) {
    this.db.query("UPDATE tasks SET status = ?, usd = ?, ended_at = ?, checkpoint = ?, changed = ?, proof = ? WHERE id = ?")
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
