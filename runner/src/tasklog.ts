// A small local database of every task, for the timeline, Where was I and recaps.
// It holds a short redacted label, never the full prompt, screen content or secrets.
import type { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";
import { PRODUCT } from "./names.ts";
import { CheckpointStore } from "./checkpoints.ts";

export type TaskRow = { id: number; project: string; agent: string; mode: string; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null;
  /** M45: an Undo put the project back to before this task. back: and then "Bring the fix back" put the task's files back
   *  again (undone stays true, so What I did can say "The fix is back", never "Fixed and proven": nothing was checked since). */
  undone?: boolean; back?: boolean };

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
  /** The open file, for the free fix count (db.ts FreeFixes), which lives beside the tasks so it goes wherever they go. */
  get database(): Database { return this.db; }
  private setup() {
    this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL,
      label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT)`);
    // Older log files get the new columns, and keep their tasks.
    const have = (this.db.query("PRAGMA table_info(tasks)").all() as { name: string }[]).map((c) => c.name);
    if (!have.includes("checkpoint")) this.db.run("ALTER TABLE tasks ADD COLUMN checkpoint TEXT");
    if (!have.includes("changed")) this.db.run("ALTER TABLE tasks ADD COLUMN changed INTEGER");
    if (!have.includes("proof")) this.db.run("ALTER TABLE tasks ADD COLUMN proof TEXT");
    // M45: the safety copy of the Undo that took this task back, or null; and brought_back, 1 once Bring back restored that
    // same copy. A later Undo marks the row again (and clears brought_back).
    if (!have.includes("undone_by")) this.db.run("ALTER TABLE tasks ADD COLUMN undone_by TEXT");
    if (!have.includes("brought_back")) this.db.run("ALTER TABLE tasks ADD COLUMN brought_back INTEGER NOT NULL DEFAULT 0");
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
  // An Undo back to checkpoint number fromN took back every task of this project that started there or later (upToN: only
  // up to that number, for an Undo of one task). Each is marked with the Undo's safety copy, unless an earlier Undo already
  // marked it and nothing brought it back since. A task that changed nothing (no undo point of its own, or a receipt with no
  // changed files) has nothing to take back, and is never marked. A task whose count is unknown (cut short) may have changed
  // files, so it is marked.
  markUndone(project: string, fromN: number, safetyId: string, upToN = Infinity) {
    const rows = this.db.query("SELECT id, checkpoint FROM tasks WHERE project = ? AND (undone_by IS NULL OR brought_back = 1) AND checkpoint IS NOT NULL AND COALESCE(changed, 1) > 0").all(project) as { id: number; checkpoint: string }[];
    const mark = this.db.query("UPDATE tasks SET undone_by = ?, brought_back = 0 WHERE id = ?");
    for (const r of rows) { const n = CheckpointStore.num(r.checkpoint); if (n > 0 && n >= fromN && n <= upToN) mark.run(safetyId, r.id); }
  }
  // "Bring the fix back" restored that safety copy: the tasks its Undo took back are back. They stay marked with that Undo, so
  // the history can say they are back (and were not checked since). Nothing happens for any other id.
  bringBack(project: string, safetyId: string) {
    this.db.query("UPDATE tasks SET brought_back = 1 WHERE project = ? AND undone_by = ?").run(project, safetyId);
  }
  /** The undo points the project's newest tasks point at (their Before, and the Undo that took each back), so the undo store
   *  never prunes one a History row can still use (must fix 26). projects: the folder as it may have been written. */
  checkpointsOf(projects: string[], limit = 200): string[] {
    const out = new Set<string>();
    for (const p of new Set(projects)) {
      const rows = this.db.query("SELECT checkpoint, undone_by FROM tasks WHERE project = ? ORDER BY id DESC LIMIT ?").all(p, limit) as { checkpoint: string | null; undone_by: string | null }[];
      for (const r of rows) { if (r.checkpoint) out.add(r.checkpoint); if (r.undone_by) out.add(r.undone_by); }
    }
    return [...out];
  }
  // Newest first. Pass a project to see only its tasks.
  list(project?: string, limit = 200): TaskRow[] {
    const rows = (project === undefined
      ? this.db.query("SELECT * FROM tasks ORDER BY id DESC LIMIT ?").all(limit)
      : this.db.query("SELECT * FROM tasks WHERE project = ? ORDER BY id DESC LIMIT ?").all(project, limit)) as any[];
    return rows.map((r) => ({
      id: r.id, project: r.project, agent: r.agent, mode: r.mode, label: r.label, status: r.status, usd: r.usd, startedAt: r.started_at, endedAt: r.ended_at,
      checkpoint: r.checkpoint ?? null, changed: r.changed ?? null, proof: r.proof ?? null, undone: r.undone_by != null, back: r.undone_by != null && r.brought_back === 1,
    }));
  }
}
