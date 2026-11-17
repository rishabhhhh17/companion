// A small local database of every task, for the timeline, Where was I and recaps.
// It holds a short redacted label, never the full prompt, screen content or secrets.
import type { Database } from "bun:sqlite";
import { openDatabase } from "./db.ts";
import { PRODUCT } from "./names.ts";
import { CheckpointStore } from "./checkpoints.ts";
import { clip, redact } from "./redact.ts";
import { LIVE_TAIL } from "./livesystems.ts";
import { DONE_SIGNAL_TOOLS, MARK_KINDS, REVIEW_CHECKS, REVIEW_DID, REVIEW_RATINGS, REVIEW_TOUCHES, type MarkKind, type ReviewChecks, type ReviewRating, type ReviewRowView, type ReviewTouch, type SparedView, type WeekView } from "../../protocol/index.ts";

/** M57 feature 1: a review that ran, as it is kept. Names of files only, never their text. */
export type ReviewRowIn = { project: string; batch: string; at: string; files: string[]; count: number; rating: ReviewRating; touches: ReviewTouch[]; checks: ReviewChecks; summary: string;
  /** M77: the kinds of the review's reasons (names only, never their words), for the week's count. */
  kinds?: string[];
  /** M101: the batch's two versions in the engine's shadow store (ids only), so Put these files back works from History. */
  from?: string; to?: string;
  /** M101: when the batch's first change was written (ms), for the commit check after a restart. */
  began?: number };
/** M77: a saved copy taken before a destructive command of the person's own AI tool (guard.ts): its own row, never a task.
 *  command: the short, redacted command from the label. undone: an Undo went back to this copy or an earlier one. */
export type SavedRow = { id: number; at: string; checkpoint: string; command: string; undone: boolean };
/** M77: what the safety net caught in the last seven days, from real rows. Shown only when above zero (rule 16). */
export type Caught = { since: string; falseDones: number; keys: number; weakened: number; saved: number; undone: number };
const GUARD_MODE = "guard";
/** M101: a shadow store id, and a review batch's name. */
const CP_ID = /^cp_[A-Za-z0-9_-]{1,80}$/;
const REVIEW_BATCH = /^rv_[0-9a-f]{10}$/;
/** M85: the mode of an ask row, and its label's start. */
const ASK_MODE = "ask";
const ASKED_PREFIX = "Asked first: ";
/** M85: an ask as History shows it (protocol AskedRowView). */
export type AskedRow = { id: number; at: string; command: string; reason: string; by: "tool" | "squibby"; answer?: "once" | "always" | "no" | "expired"; kind?: "login"; outcome?: "asked" | "ran" | "blocked"; tool?: AiTool };
/** The M103 review: the person's own AI tools a row may name (protocol DONE_SIGNAL_TOOLS); kept as the row's agent, tool:<id>. */
type AiTool = (typeof DONE_SIGNAL_TOOLS)[number];
const TOOL_AGENT = "tool:";
/** M103: the status of a saved logins row: what happened in the person's own tool. */
const LOGIN_STATUS = { asked: "login_asked", ran: "login_ran", blocked: "login_blocked" } as const;
const SAVED_PREFIX = "Before Claude ran: ";
/** M94: what each kind of mark may say as its choice; anything else is dropped (never free text). */
const MARK_CHOICES: Record<MarkKind, readonly string[]> = { loop_stopped: [], cost_paused: ["keep", "stop", "undo"], bisect_found: [], drift: ["not_asked", "said_other"] };
/** M94: the review reasons that mean a wrong change (a loosened test, words that say the checks pass when they did not, checks
 *  that failed), and what the person did with it that counts: Fix it, or sent back to their own AI. */
const WRONG_KINDS = ["weakened_check", "claimed_passed", "checks_failed"];
const WRONG_DID = ["fix", "sent_back"];
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
    // M85: why an ask was asked (its plain reason, redacted), for an ask row.
    if (!have.includes("note")) this.db.run("ALTER TABLE tasks ADD COLUMN note TEXT");
    // M94: 1 when an ask was about a live system (a copy on this Mac can't bring it back), for What Squibby saved you.
    if (!have.includes("live")) this.db.run("ALTER TABLE tasks ADD COLUMN live INTEGER NOT NULL DEFAULT 0");
    // M94 (What Squibby saved you): one row per real event that stopped waste, as it happened. kind: the event; ref: what it
    // was about (a task's id, or the version Which task broke it? found), so one event is counted once however often it is
    // written; choice: the person's answer where there is one (a known word only). No words, no amounts.
    this.db.run(`CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, choice TEXT)`);
    // M57 feature 1: one row per review that ran. Names of files only, the summary with secrets hidden, and what the person
    // did with it. No file text, no diff and no reasons' words are ever kept here.
    this.db.run(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, batch TEXT NOT NULL, at TEXT NOT NULL, files TEXT NOT NULL,
      count INTEGER NOT NULL, rating TEXT NOT NULL, touches TEXT NOT NULL, checks TEXT NOT NULL, did TEXT NOT NULL DEFAULT 'open', summary TEXT NOT NULL)`);
    // M77: the kinds of each review's reasons (names only), for the week's count.
    const rhave = (this.db.query("PRAGMA table_info(reviews)").all() as { name: string }[]).map((c) => c.name);
    if (!rhave.includes("kinds")) this.db.run("ALTER TABLE reviews ADD COLUMN kinds TEXT NOT NULL DEFAULT '[]'");
    // M101: the batch's two versions (shadow store ids only) and the safety copy of its put back, when there was one.
    if (!rhave.includes("from_cp")) this.db.run("ALTER TABLE reviews ADD COLUMN from_cp TEXT");
    if (!rhave.includes("to_cp")) this.db.run("ALTER TABLE reviews ADD COLUMN to_cp TEXT");
    if (!rhave.includes("undone_by")) this.db.run("ALTER TABLE reviews ADD COLUMN undone_by TEXT");
    if (!rhave.includes("began_ms")) this.db.run("ALTER TABLE reviews ADD COLUMN began_ms INTEGER");
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
  /** M85: an ask, as its own finished row (mode ask): the person's own tool was told to ask (agent "tool", status asked),
   *  or Squibby's own card asked and the person answered (agent "squibby", status once, always, no or expired). Never a
   *  task, so nothing reads a verdict from it. */
  asked(r: { project: string; command: string; reason: string; at: string; by: "tool" | "squibby"; answer?: "once" | "always" | "no" | "expired"; live?: boolean; kind?: "login"; outcome?: "asked" | "ran" | "blocked"; tool?: AiTool }): number {
    // M103: a read of saved logins in the person's own tool: its own status says what happened, and it is never a live ask.
    const login = r.by === "tool" && r.kind === "login" ? LOGIN_STATUS[r.outcome ?? "ran"] ?? LOGIN_STATUS.ran : null;
    // M94: live, the ask was about a live system. The person's own tool is otherwise only told to ask about one (guard.ts).
    const live = login ? false : r.live ?? (r.by === "tool" || r.reason.includes(LIVE_TAIL));
    const q = this.db.query("INSERT INTO tasks (project, agent, mode, label, status, started_at, ended_at, note, live) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    // The M103 review: which AI tool, only one of the known seven; any other is kept as just "tool".
    const agent = r.by === "tool" && (DONE_SIGNAL_TOOLS as readonly unknown[]).includes(r.tool) ? `${TOOL_AGENT}${r.tool}` : r.by;
    return Number(q.run(r.project, agent, ASK_MODE, clip(redact(`${ASKED_PREFIX}${r.command}`), 120), login ?? (r.by === "tool" ? "asked" : r.answer ?? "no"), r.at, r.at, clip(redact(r.reason), 300), live ? 1 : 0).lastInsertRowid);
  }
  /** M94: one real event that stopped waste (MARK_KINDS), as it happened. Never in the way: a write that fails is dropped. */
  mark(r: { project: string; kind: MarkKind; ref: string | number; at: string; choice?: string }): void {
    try {
      if (!(MARK_KINDS as readonly string[]).includes(r.kind)) return;
      const ref = String(r.ref);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(ref)) return;
      const choice = r.choice && MARK_CHOICES[r.kind].includes(r.choice) ? r.choice : null;
      this.db.query("INSERT INTO marks (project, at, kind, ref, choice) VALUES (?, ?, ?, ?, ?)").run(r.project, r.at, r.kind, ref, choice);
    } catch { /* never in the way */ }
  }
  /** M94 (What Squibby saved you): the same seven days as week(), counted from real rows only, each event once.
   *  loopsStopped: tasks the fix loop breaker stopped and asked about. paused: tasks the cost pause stopped to ask about;
   *  pausedStopped: those the person then stopped or undid (Stop everything ends a pause as a stop). foundNoModel: the
   *  versions Which task broke it? named (it runs the checks only, never a model). wrongCaught: reviews that flagged a
   *  loosened test, a done that was not done or failed checks and that the person then fixed (Fix it, or sent back to their
   *  AI), and Squibby's own tasks flagged Not what you asked for or Said one thing, ran another that the person undid.
   *  liveAsks: asks before a command that touches a live system. Counts only: no amount ever (F29, M69). */
  spared(project: string, now: Date = new Date()): SparedView {
    const since = new Date(now.getTime() - WEEK_MS).toISOString(), until = now.toISOString();
    const n = (sql: string, ...args: unknown[]): number => { try { return Number((this.db.query(sql).get(...(args as never[])) as { n: number } | null)?.n ?? 0); } catch { return 0; } };
    const marks = (kind: MarkKind, extra = "") => n(`SELECT COUNT(DISTINCT ref) AS n FROM marks WHERE project = ? AND kind = ? AND at >= ? AND at <= ?${extra}`, project, kind, since, until);
    const reviews = (() => { try { return this.db.query("SELECT checks, kinds, did FROM reviews WHERE project = ? AND at >= ? AND at <= ?").all(project, since, until) as { checks: string; kinds: string; did: string }[]; } catch { return []; } })();
    const kindsOf = (t: string): string[] => { try { const v = JSON.parse(t); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
    const reviewsFixed = reviews.filter((r) => WRONG_DID.includes(r.did) && (r.checks === "failed" || kindsOf(r.kinds).some((k) => WRONG_KINDS.includes(k)))).length;
    const driftUndone = n(`SELECT COUNT(DISTINCT m.ref) AS n FROM marks m JOIN tasks t ON t.id = CAST(m.ref AS INTEGER) AND t.project = m.project
      WHERE m.project = ? AND m.kind = 'drift' AND m.at >= ? AND m.at <= ? AND t.mode != ? AND t.mode != ? AND t.undone_by IS NOT NULL`, project, since, until, GUARD_MODE, ASK_MODE);
    return {
      loopsStopped: marks("loop_stopped"),
      paused: marks("cost_paused"),
      pausedStopped: marks("cost_paused", " AND choice IN ('stop', 'undo')"),
      foundNoModel: marks("bisect_found"),
      wrongCaught: reviewsFixed + driftUndone,
      liveAsks: n("SELECT COUNT(*) AS n FROM tasks WHERE project = ? AND mode = ? AND started_at >= ? AND started_at <= ? AND (live = 1 OR note LIKE ?)", project, ASK_MODE, since, until, `%${LIVE_TAIL}%`),
    };
  }
  /** M85: the project's asks, newest first, at most 50. */
  askedRows(project: string, limit = 50): AskedRow[] {
    const rows = this.db.query("SELECT id, agent, label, status, started_at, note FROM tasks WHERE project = ? AND mode = ? ORDER BY started_at DESC, id DESC LIMIT ?").all(project, ASK_MODE, Math.min(50, limit)) as any[];
    return rows.map((r) => {
      const by: "tool" | "squibby" = r.agent === "squibby" ? "squibby" : "tool";
      const label = String(r.label);
      const command = clip(label.startsWith(ASKED_PREFIX) ? label.slice(ASKED_PREFIX.length) : label, 80);
      const answer = ["once", "always", "no", "expired"].includes(r.status) ? (r.status as AskedRow["answer"]) : undefined;
      const login = by === "tool" && typeof r.status === "string" && r.status.startsWith("login_") ? (r.status.slice(6) as "asked" | "ran" | "blocked") : null;
      const tool = typeof r.agent === "string" && r.agent.startsWith(TOOL_AGENT) ? r.agent.slice(TOOL_AGENT.length) : null;
      return { id: r.id, at: r.started_at, command, reason: clip(String(r.note ?? ""), 300), by, ...(by === "squibby" && answer ? { answer } : {}), ...(login && ["asked", "ran", "blocked"].includes(login) ? { kind: "login" as const, outcome: login } : {}), ...(tool && (DONE_SIGNAL_TOOLS as readonly string[]).includes(tool) ? { tool: tool as AiTool } : {}) };
    });
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
  /** M79: the weekly summary's counts for the seven days before now, from real rows only (the decisions come from memory,
   *  added by the caller). It reuses the M77 counts for keys, weakened checks and false dones. */
  week(project: string, now: Date = new Date()): Omit<WeekView, "decisions"> {
    const c = this.caught(project, now);
    const since = c.since;
    const n = (sql: string, ...args: unknown[]): number => { try { return Number((this.db.query(sql).get(...(args as never[])) as { n: number } | null)?.n ?? 0); } catch { return 0; } };
    const reviews = (() => { try { return this.db.query("SELECT count, kinds FROM reviews WHERE project = ? AND at >= ?").all(project, since) as { count: number; kinds: string }[]; } catch { return []; } })();
    const kindsOf = (t: string): string[] => { try { const v = JSON.parse(t); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
    let files = 0, packages = 0, againstRules = 0;
    for (const r of reviews) {
      files += Math.max(0, Number(r.count) || 0);
      const k = kindsOf(r.kinds);
      if (k.includes("package_critical") || k.includes("package_high")) packages++;
      if (k.includes("house_rule") || k.includes("house_rule_ask")) againstRules++;
    }
    return {
      since, until: now.toISOString(), reviews: reviews.length, files,
      caught: { keys: c.keys, weakened: c.weakened, falseDones: c.falseDones, packages },
      // A fix is proven when its checks passed on a change (a passed check that changed nothing fixed nothing, must fix 7).
      proven: n("SELECT COUNT(*) AS n FROM tasks WHERE project = ? AND mode != ? AND proof = 'passed' AND COALESCE(changed, 0) > 0 AND COALESCE(ended_at, started_at) >= ?", project, GUARD_MODE, since),
      undone: c.undone,
      saved: n("SELECT COUNT(*) AS n FROM tasks WHERE project = ? AND mode = ? AND started_at >= ?", project, GUARD_MODE, since),
      savedUsed: c.saved,
      againstRules,
    };
  }
  /** M88 (Your numbers): two more counts for the same seven days, from real rows only. jobs: tasks Squibby ran for the
   *  person (not a saved copy, not an ask). days: the days on this Mac's clock with any row at all (a task, a saved copy,
   *  an ask or a review). Counts only: no label, file or word goes with them. */
  usage(project: string, now: Date = new Date()): { jobs: number; days: number } {
    const since = new Date(now.getTime() - WEEK_MS).toISOString(), until = now.toISOString();
    const all = <T,>(sql: string, ...args: unknown[]): T[] => { try { return this.db.query(sql).all(...(args as never[])) as T[]; } catch { return []; } };
    const tasks = all<{ mode: string; at: string }>("SELECT mode, started_at AS at FROM tasks WHERE project = ? AND started_at >= ? AND started_at <= ?", project, since, until);
    const reviews = all<{ at: string }>("SELECT at FROM reviews WHERE project = ? AND at >= ? AND at <= ?", project, since, until);
    const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
    const days = new Set([...tasks.map((t) => day(t.at)), ...reviews.map((r) => day(r.at))].filter(Boolean));
    return { jobs: tasks.filter((t) => t.mode !== GUARD_MODE && t.mode !== ASK_MODE).length, days: days.size };
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
      const rows = this.db.query("SELECT checkpoint, undone_by FROM tasks WHERE project = ? AND mode != 'ask' ORDER BY id DESC LIMIT ?").all(p, limit) as { checkpoint: string | null; undone_by: string | null }[];
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
      const cp = (v: unknown) => (typeof v === "string" && CP_ID.test(v) ? v : null);
      const began = typeof r.began === "number" && Number.isFinite(r.began) && r.began > 0 ? Math.floor(r.began) : null;
      const q = this.db.query("INSERT INTO reviews (project, batch, at, files, count, rating, touches, checks, summary, kinds, from_cp, to_cp, began_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      return Number(q.run(r.project, r.batch, r.at, JSON.stringify(files), Math.max(0, Math.floor(r.count)), rating, JSON.stringify(touches), checks, clip(redact(r.summary).replace(/\s+/g, " ").trim(), ROW_SUMMARY), JSON.stringify(kinds), cp(r.from), cp(r.to), began).lastInsertRowid);
    } catch { return 0; }
  }
  /** M101: a review's two versions and the safety copy of its put back (null when it was not put back). Null when no row
   *  knows the batch or it was kept before M101. */
  reviewPoints(project: string, batch: string): { from: string; to: string; undoneBy: string | null; began: number | null } | null {
    try {
      const r = this.db.query("SELECT from_cp, to_cp, undone_by, began_ms FROM reviews WHERE project = ? AND batch = ? ORDER BY id DESC LIMIT 1").get(project, batch) as { from_cp: string | null; to_cp: string | null; undone_by: string | null; began_ms: number | null } | null;
      return r && r.from_cp && r.to_cp ? { from: r.from_cp, to: r.to_cp, undoneBy: r.undone_by ?? null, began: typeof r.began_ms === "number" ? r.began_ms : null } : null;
    } catch { return null; }
  }
  /** M101: the link record. The review's files were put back; safety is the copy taken just before. Only the first is kept. */
  reviewUndone(project: string, batch: string, safety: string): void {
    if (!CP_ID.test(safety)) return;
    try { this.db.query("UPDATE reviews SET undone_by = ? WHERE project = ? AND batch = ? AND undone_by IS NULL").run(safety, project, batch); } catch { /* never in the way */ }
  }
  /** M101, for M94: how many reviews of this project were put back since then. A count only. */
  reviewUndos(project: string, since: string): number {
    try { return (this.db.query("SELECT COUNT(*) AS n FROM reviews WHERE project = ? AND undone_by IS NOT NULL AND at >= ?").get(project, since) as { n: number }).n; } catch { return 0; }
  }
  /** M101: the versions the newest reviews point at, so the undo store keeps them for History's Put these files back. */
  recentReviewPoints(project: string, n: number): string[] {
    try {
      const rows = this.db.query("SELECT from_cp, to_cp FROM reviews WHERE project = ? AND from_cp IS NOT NULL AND undone_by IS NULL ORDER BY id DESC LIMIT ?").all(project, Math.max(0, Math.floor(n))) as { from_cp: string; to_cp: string | null }[];
      return rows.flatMap((r) => [r.from_cp, ...(r.to_cp ? [r.to_cp] : [])]);
    } catch { return []; }
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
      // M101: the batch, for Put these files back. Whether its versions are still kept is the engine's to say (agent.ts).
      ...(typeof r.batch === "string" && REVIEW_BATCH.test(r.batch) ? { batch: r.batch } : {}), ...(r.undone_by ? { undo: "done" as const } : {}),
    }));
  }
  // Newest first. Pass a project to see only its tasks.
  list(project?: string, limit = 200): TaskRow[] {
    // M77: a saved copy (mode guard) is its own kind of row (savedRows), never a task here.
    const rows = (project === undefined
      ? this.db.query("SELECT * FROM tasks WHERE mode != ? AND mode != ? ORDER BY id DESC LIMIT ?").all(GUARD_MODE, ASK_MODE, limit)
      : this.db.query("SELECT * FROM tasks WHERE project = ? AND mode != ? AND mode != ? ORDER BY id DESC LIMIT ?").all(project, GUARD_MODE, ASK_MODE, limit)) as any[];
    return rows.map((r) => ({
      id: r.id, project: r.project, agent: r.agent, mode: r.mode, label: r.label, status: r.status, usd: r.usd, startedAt: r.started_at, endedAt: r.ended_at,
      checkpoint: r.checkpoint ?? null, changed: r.changed ?? null, proof: r.proof ?? null, undone: r.undone_by != null, back: r.undone_by != null && r.brought_back === 1,
      ...(r.failed_check && RUNGS.includes(r.failed_check) ? { failedCheck: r.failed_check as string } : {}),
    }));
  }
}
