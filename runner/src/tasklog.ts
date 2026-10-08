// A small local database of every task, for the timeline, Where was I and recaps.
// It holds a short redacted label, never the full prompt, screen content or secrets.
import { Database } from "bun:sqlite";

export type TaskRow = { id: number; project: string; agent: string; mode: string; label: string; status: string; usd: number; startedAt: string; endedAt: string | null };

export class TaskLog {
  private db: Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL,
      label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT)`);
  }
  start(r: { project: string; agent: string; mode: string; label: string; startedAt: string }): number {
    const q = this.db.query("INSERT INTO tasks (project, agent, mode, label, status, started_at) VALUES (?, ?, ?, ?, 'running', ?)");
    return Number(q.run(r.project, r.agent, r.mode, r.label, r.startedAt).lastInsertRowid);
  }
  finish(id: number, status: string, usd: number, endedAt: string) {
    this.db.query("UPDATE tasks SET status = ?, usd = ?, ended_at = ? WHERE id = ?").run(status, usd, endedAt, id);
  }
  list(): TaskRow[] {
    return (this.db.query("SELECT * FROM tasks ORDER BY id DESC").all() as any[]).map((r) => ({
      id: r.id, project: r.project, agent: r.agent, mode: r.mode, label: r.label, status: r.status, usd: r.usd, startedAt: r.started_at, endedAt: r.ended_at,
    }));
  }
}
