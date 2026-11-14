// M89: a job saved for after the usage reset. When the person's Claude limit is near, Hand Squibby the job and Rescue ask
// first, and "Save for after the reset" keeps the job here so one tap starts it later. Kept beside the task history (so Delete
// everything removes it with the rest), at most MAX_SAVED per project. The words are the person's own request, kept only
// because they asked to keep it, with anything shaped like a key hidden first (redact.ts) and at most MAX_PROMPT characters.
// Off the record, nothing is saved: only the page stops it (it does not offer Save off the record). jobs.save carries no
// off the record field and the runner keeps no per project off the record state, so the runner saves whatever it is sent.
import type { Database } from "bun:sqlite";
import { redact } from "./redact.ts";

export const MAX_SAVED = 10;
export const MAX_PROMPT = 4000;
export type SavedJobKind = "job" | "rescue";
export type SavedJob = { id: string; kind: SavedJobKind; prompt: string; savedAt: string; resetsAt?: string };

export class SavedJobs {
  constructor(private db: Database) {
    this.db.run(`CREATE TABLE IF NOT EXISTS saved_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, kind TEXT NOT NULL, prompt TEXT NOT NULL, saved_at TEXT NOT NULL, resets_at TEXT)`);
  }
  /** Keeps a job. A job with no words is kept only for Rescue (which needs none). The oldest go past MAX_SAVED. */
  save(project: string, kind: SavedJobKind, prompt: string, at: string, resetsAt?: string): SavedJob | null {
    const words = redact(prompt.replace(/\r\n?/g, "\n").trim()).slice(0, MAX_PROMPT);
    if (kind === "job" && !words) return null;
    const reset = resetsAt && !Number.isNaN(Date.parse(resetsAt)) ? new Date(resetsAt).toISOString() : null;
    const r = this.db.query("INSERT INTO saved_jobs (project, kind, prompt, saved_at, resets_at) VALUES (?, ?, ?, ?, ?) RETURNING id").get(project, kind, words, at, reset) as { id: number };
    const extra = this.db.query("SELECT id FROM saved_jobs WHERE project = ? ORDER BY id DESC LIMIT -1 OFFSET ?").all(project, MAX_SAVED) as { id: number }[];
    for (const e of extra) this.db.run("DELETE FROM saved_jobs WHERE id = ?", [e.id]);
    return { id: `sj_${r.id}`, kind, prompt: words, savedAt: at, ...(reset ? { resetsAt: reset } : {}) };
  }
  /** The project's saved jobs, newest first. */
  list(project: string): SavedJob[] {
    const rows = this.db.query("SELECT id, kind, prompt, saved_at, resets_at FROM saved_jobs WHERE project = ? ORDER BY id DESC LIMIT ?").all(project, MAX_SAVED) as { id: number; kind: string; prompt: string; saved_at: string; resets_at: string | null }[];
    return rows.map((r) => ({ id: `sj_${r.id}`, kind: r.kind === "rescue" ? "rescue" : "job", prompt: r.prompt, savedAt: r.saved_at, ...(r.resets_at ? { resetsAt: r.resets_at } : {}) }));
  }
  /** Removes one (started, or removed by the person). Only this project's. True when there was one. */
  drop(project: string, id: string): boolean {
    const n = /^sj_(\d{1,12})$/.exec(id);
    if (!n) return false;
    return this.db.run("DELETE FROM saved_jobs WHERE project = ? AND id = ?", [project, Number(n[1])]).changes > 0;
  }
}
