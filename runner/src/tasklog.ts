// A small local database of every task, for the timeline, Where was I and recaps.
// It holds a short redacted label, never the full prompt, screen content or secrets.
import type { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";
import { PRODUCT } from "./names.ts";
import { CheckpointStore } from "./checkpoints.ts";
import { clip, redact } from "./redact.ts";
import { REVIEW_CHECKS, REVIEW_DID, REVIEW_RATINGS, REVIEW_TOUCHES, type ReviewChecks, type ReviewRating, type ReviewRowView, type ReviewTouch } from "../../protocol/index.ts";

/** M57 feature 1: a review that ran, as it is kept. Names of files only, never their text. */
export type ReviewRowIn = { project: string; batch: string; at: string; files: string[]; count: number; rating: ReviewRating; touches: ReviewTouch[]; checks: ReviewChecks; summary: string;
  /** M77: the kinds of the review's reasons (names only, never their words), for the week's count. */
  kinds?: string[] };
/** M77: a saved copy taken before a destructive command of the person's own AI tool (guard.ts): its own row, never a task.
 *  command: the short, redacted command from the label. undone: an Undo went back to this copy or an earlier one. */
export type SavedRow = { id: number; at: string; checkpoint: string; command: string; undone: boolean };
/** M77: what the safety net caught in the last seven days, from real rows. Shown only when above zero (rule 16). */
export type Caught = { since: string; falseDones: number; keys: number; weakened: number; saved: number; undone: number };
const GUARD_MODE = "guard";
const SAVED_PREFIX = "Before Claude ran: ";
const WEEK_MS = 7 * 86_400_000;
export type ReviewDid = (typeof REVIEW_DID)[number];
/** The most file names a row keeps, and how long its summary may be. */
const ROW_FILES = 20;
const ROW_SUMMARY = 400;
const DAY_MS = 86_400_000;

export type TaskRow = { id: number; project: string; agent: string; mode: string; label: string; status: string; usd: number; startedAt: string; endedAt: string | null; checkpoint: string | null; changed: number | null; proof: string | null;
  /** M45: an Undo put the project back to before this task. back: and then "Bring the fix back" put the task's files back
   *  again (undone stays true, so What I did can say "The fix is back", never "Fixed and proven": nothing was checked since). */
  undone?: boolean; back?: boolean;
  /** M72: the rung of the check that failed (the ladder's own id: install, checks, tests, start, browser, review), so a page
   *  can say which check failed. Never the check's output. */
  failedCheck?: string };
/** The rungs a task may keep as its failed check: anything else is dropped (never free text). */
const RUNGS = ["install", "checks", "tests", "start", "browser", "review"];

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
    // M72: which check failed (a rung's id), for a failed task.
    if (!have.includes("failed_check")) this.db.run("ALTER TABLE tasks ADD COLUMN failed_check TEXT");
    // M57 feature 1: one row per review that ran. Names of files only, the summary with secrets hidden, and what the person
    // did with it. No file text, no diff and no reasons' words are ever kept here.
    this.db.run(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, batch TEXT NOT NULL, at TEXT NOT NULL, files TEXT NOT NULL,
      count INTEGER NOT NULL, rating TEXT NOT NULL, touches TEXT NOT NULL, checks TEXT NOT NULL, did TEXT NOT NULL DEFAULT 'open', summary TEXT NOT NULL)`);
    // M77: the kinds of each review's reasons (names only), for the week's count.
    const rhave = (this.db.query("PRAGMA table_info(reviews)").all() as { name: string }[]).map((c) => c.name);
    if (!rhave.includes("kinds")) this.db.run("ALTER TABLE reviews ADD COLUMN kinds TEXT NOT NULL DEFAULT '[]'");
    // A task still marked "running" when the log opens was cut short by a crash or a forced quit.
    this.db.run("UPDATE tasks SET status = 'interrupted', ended_at = COALESCE(ended_at, started_at) WHERE status = 'running'");
  }
  // The Before snapshot is stored with the row at the start, so a task cut short by a crash or a forced quit still has its
  // Undo point (finish keeps it when it has no receipt of its own).
  start(r: { project: string; agent: string; mode: string; label: string; startedAt: string; checkpoint?: string }): number {
    const q = this.db.query("INSERT INTO tasks (project, agent, mode, label, status, started_at, checkpoint) VALUES (?, ?, ?, ?, 'running', ?, ?)");
    return Number(q.run(r.project, r.agent, r.mode, r.label, r.startedAt, r.checkpoint ?? null).lastInsertRowid);
  }
  /** M77: a saved copy before a destructive command, as its own finished row (mode guard, status saved). It is never in
   *  list(): nothing reads a verdict from it. */
  saved(r: { project: string; label: string; checkpoint: string; at: string }): number {
    const q = this.db.query("INSERT INTO tasks (project, agent, mode, label, status, started_at, ended_at, checkpoint, changed) VALUES (?, 'guard', ?, ?, 'saved', ?, ?, ?, NULL)");
    return Number(q.run(r.project, GUARD_MODE, clip(redact(r.label), 120), r.at, r.at, r.checkpoint).lastInsertRowid);
  }
  /** M77: the project's saved copies, newest first. */
  savedRows(project: string, limit = 50): SavedRow[] {
    const rows = this.db.query("SELECT id, label, started_at, checkpoint, undone_by FROM tasks WHERE project = ? AND mode = ? AND checkpoint IS NOT NULL ORDER BY started_at DESC, id DESC LIMIT ?").all(project, GUARD_MODE, limit) as any[];
    return rows.map((r) => ({ id: r.id, at: r.started_at, checkpoint: r.checkpoint, command: String(r.label).startsWith(SAVED_PREFIX) ? String(r.label).slice(SAVED_PREFIX.length) : String(r.label), undone: r.undone_by != null }));
  }
  /** M77: what was caught in the last seven days, counted from real rows only. */
  caught(project: string, now: Date = new Date()): Caught {
    const since = new Date(now.getTime() - WEEK_MS).toISOString();
    const n = (sql: string, ...args: unknown[]): number => { try { return Number((this.db.query(sql).get(...(args as never[])) as { n: number } | null)?.n ?? 0); } catch { return 0; } };
    const reviews = (() => { try { return this.db.query("SELECT checks, kinds FROM reviews WHERE project = ? AND at >= ?").all(project, since) as { checks: string; kinds: string }[]; } catch { return []; } })();
    const kindsOf = (t: string): string[] => { try { const v = JSON.parse(t); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
    let falseDones = 0, keys = 0, weakened = 0;
    for (const r of reviews) {
      const k = kindsOf(r.kinds);
      if (r.checks === "failed" || k.includes("claimed_passed")) falseDones++;
      if (k.includes("secret_in_code") || k.includes("key_in_page")) keys++;
      if (k.includes("weakened_check")) weakened++;
    }
    return {
      since, falseDones, keys, weakened,
      saved: n("SELECT COUNT(*) AS n FROM tasks WHERE project = ? AND mode = ? AND undone_by IS NOT NULL AND started_at >= ?", project, GUARD_MODE, since),
      undone: n("SELECT COUNT(*) AS n FROM tasks WHERE project = ? AND mode != ? AND undone_by IS NOT NULL AND COALESCE(ended_at, started_at) >= ?", project, GUARD_MODE, since),
    };
  }
  finish(id: number, status: string, usd: number, endedAt: string, receipt?: { checkpoint: string; changed: number; proof: string; failedCheck?: string }) {
    const failed = receipt?.proof === "failed" && receipt.failedCheck && RUNGS.includes(receipt.failedCheck) ? receipt.failedCheck : null;
    this.db.query("UPDATE tasks SET status = ?, usd = ?, ended_at = ?, checkpoint = COALESCE(?, checkpoint), changed = ?, proof = ?, failed_check = ? WHERE id = ?")
      .run(status, usd, endedAt, receipt?.checkpoint ?? null, receipt?.changed ?? null, receipt?.proof ?? null, failed, id);
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
  /** M57 feature 1: keeps one review that ran. Only names of files (at most 20) and the summary, with secrets hidden again
   *  and cut short. Rows older than keepDays go first. Never in the way of the review: a write that fails is dropped. */
  addReview(r: ReviewRowIn, o: { keepDays?: number; now?: Date } = {}): number {
    try {
      this.pruneReviews(o.keepDays, o.now);
      const files = r.files.filter((f) => typeof f === "string" && f.length > 0).slice(0, ROW_FILES).map((f) => clip(f, 300));
      const touches = r.touches.filter((t) => (REVIEW_TOUCHES as readonly string[]).includes(t));
      const rating = (REVIEW_RATINGS as readonly string[]).includes(r.rating) ? r.rating : "worth_a_look";
      const checks = (REVIEW_CHECKS as readonly string[]).includes(r.checks) ? r.checks : "unknown";
      const kinds = (r.kinds ?? []).filter((k) => typeof k === "string" && /^[a-z_]{1,40}$/.test(k)).slice(0, 40);
      const q = this.db.query("INSERT INTO reviews (project, batch, at, files, count, rating, touches, checks, summary, kinds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      return Number(q.run(r.project, r.batch, r.at, JSON.stringify(files), Math.max(0, Math.floor(r.count)), rating, JSON.stringify(touches), checks, clip(redact(r.summary).replace(/\s+/g, " ").trim(), ROW_SUMMARY), JSON.stringify(kinds)).lastInsertRowid);
    } catch { return 0; }
  }
  /** What the person did with a review (or that a newer change made it go away). Only the first close is kept. */
  reviewDid(project: string, batch: string, did: ReviewDid) {
    if (!(REVIEW_DID as readonly string[]).includes(did) || did === "open") return;
    try { this.db.query("UPDATE reviews SET did = ? WHERE project = ? AND batch = ? AND did = 'open'").run(did, project, batch); } catch { /* never in the way */ }
  }
  /** Removes the review rows older than keepDays (review.keepDays). Nothing for a limit that is not a whole number of days. */
  pruneReviews(keepDays?: number, now: Date = new Date()) {
    if (typeof keepDays !== "number" || !Number.isFinite(keepDays) || keepDays < 1) return;
    try { this.db.query("DELETE FROM reviews WHERE at < ?").run(new Date(now.getTime() - Math.floor(keepDays) * DAY_MS).toISOString()); } catch { /* never in the way */ }
  }
  /** The project's review rows, newest first, as History shows them. */
  reviews(project: string, limit = 50, o: { keepDays?: number; now?: Date } = {}): ReviewRowView[] {
    this.pruneReviews(o.keepDays, o.now);
    const rows = this.db.query("SELECT * FROM reviews WHERE project = ? ORDER BY at DESC, id DESC LIMIT ?").all(project, limit) as any[];
    const parse = (t: string): unknown[] => { try { const v = JSON.parse(t); return Array.isArray(v) ? v : []; } catch { return []; } };
    return rows.map((r) => ({
      id: r.id, at: r.at, count: r.count, files: parse(r.files).filter((f): f is string => typeof f === "string" && f.length > 0).slice(0, ROW_FILES),
      rating: r.rating, touches: parse(r.touches).filter((t): t is ReviewTouch => (REVIEW_TOUCHES as readonly string[]).includes(t as string)), checks: r.checks, did: r.did, summary: r.summary,
    }));
  }
  // Newest first. Pass a project to see only its tasks.
  list(project?: string, limit = 200): TaskRow[] {
    // M77: a saved copy (mode guard) is its own kind of row (savedRows), never a task here.
    const rows = (project === undefined
      ? this.db.query("SELECT * FROM tasks WHERE mode != ? ORDER BY id DESC LIMIT ?").all(GUARD_MODE, limit)
      : this.db.query("SELECT * FROM tasks WHERE project = ? AND mode != ? ORDER BY id DESC LIMIT ?").all(project, GUARD_MODE, limit)) as any[];
    return rows.map((r) => ({
      id: r.id, project: r.project, agent: r.agent, mode: r.mode, label: r.label, status: r.status, usd: r.usd, startedAt: r.started_at, endedAt: r.ended_at,
      checkpoint: r.checkpoint ?? null, changed: r.changed ?? null, proof: r.proof ?? null, undone: r.undone_by != null, back: r.undone_by != null && r.brought_back === 1,
      ...(r.failed_check && RUNGS.includes(r.failed_check) ? { failedCheck: r.failed_check as string } : {}),
    }));
  }
}
