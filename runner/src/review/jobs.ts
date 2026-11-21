// M106 (docs/milestones/M106-background-jobs.md): Claude Code's background jobs. Its agent view runs each job in its own
// folder inside the project, .claude/worktrees/<name>/ (a git worktree, with a .git file). The project's own review leaves
// those folders out (the shadow store skips every folder with its own git), so each job is followed here on its own:
//  - Only a job folder that is really inside the open project is read: never one that is a link, or behind one.
//  - Its starting point is a copy in the engine's own shadow store for that folder (GIT_DIR is the shadow's, as for every
//    project): no git command ever runs in the person's repo or the job's folder, so nothing writes their git (rule 10).
//    A folder there when the project opens is copied at once; a new one is first left to settle, so Claude Code's checkout
//    is the starting point and not a change.
//  - After that, once the job's folder has been quiet for the quiet time, what changed since the starting point is one batch,
//    labelled with the job's name. The service says it, reviews it and closes it; closing moves the starting point on.
//  - What each job changed since its starting point is kept (names only), for the note when two jobs changed the same file.
//  - A job's shadow store is a full copy of its folder: once the folder is gone it is removed, at once while the project is
//    open, or the next time it opens (the names of the jobs followed are kept in the project's own store notes).
// Nothing is simulated or merged: Squibby does not compete as an orchestrator (F13).
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { REVIEW_JOB_NAME, type ReviewKeyPlace, type ReviewOverlap } from "../../../protocol/index.ts";
import type { CheckpointStore } from "../checkpoints.ts";
import { coveredBy } from "../pathglob.ts";
import { isEnvFile } from "../secretfiles.ts";
import { JOB_DIR } from "./batcher.ts";
import type { FileChange } from "./rate.ts";

/** How long a new job's folder must be still before its starting point is taken (Claude Code's checkout lands first). */
export const JOB_SETTLE_MS = 3000;
/** At most this many jobs are followed at once (2 to 4 run in parallel, Augment's guide, seen 15 Nov 2026). */
export const MAX_JOBS = 8;
/** At most this many files in the overlap note. */
export const MAX_OVERLAP = 5;
const KEEP_CLOSED = 10;
const LABEL_START = "Review: a background job's starting point";
const LABEL_CHANGES = "Review: a background job's changes";

/** A batch of one job: the service's own batch, with the job's folder (dir) and name (job). */
export type JobBatch = {
  id: string; project: string; dir: string; job: string; from: string; to: string; files: FileChange[]; count: number; capped: boolean;
  secretFiles: string[]; frozen: boolean; keys?: ReviewKeyPlace[];
  /** Stop everything's count when it was measured: Automatic reviews it by itself only if Stop was not pressed since. */
  stops: number;
};

type Job = {
  name: string; dir: string; store: CheckpointStore;
  /** The starting point; null while a new folder settles. */
  base: Promise<string | null> | null; baseId: string | null;
  settle: ReturnType<typeof setTimeout> | null; timer: ReturnType<typeof setTimeout> | null;
  dirty: boolean; open: JobBatch | null; said: boolean; at: number;
  /** Files this job changed since it was first seen (closed batches), for the overlap note. */
  changed: Set<string>;
  kept: string[]; unguard: (() => void) | null;
};

export type JobDeps = {
  project: string;
  store: (dir: string) => CheckpointStore;
  quietMs: () => number;
  settleMs?: number;
  ignore: () => readonly RegExp[];
  maxFiles: () => number;
  /** A review runs: measuring waits for it. */
  busy: () => boolean;
  /** A job's folder has been quiet for the quiet time: the service measures it (measure). */
  ready: (job: string) => void;
  /** A job's waiting batch no longer applies (its folder went away, or nothing differs any more). */
  closed: (b: JobBatch) => void;
  /** Removes the shadow store of a job folder that is gone. Absent: the store is kept. */
  remove?: (dir: string) => Promise<void> | void;
  /** The names of the jobs followed in this project, kept across restarts, so a store left behind is removed later. */
  known?: { get(): string[]; set(names: string[]): void };
};

/** The project's own store notes, as the list of the jobs followed there (knownJobs.get and set). */
export function knownJobs(store: Pick<CheckpointStore, "note" | "setNote">): { get(): string[]; set(names: string[]): void } {
  return {
    get: () => { try { const v = JSON.parse(store.note("jobs") ?? "[]"); return Array.isArray(v) ? v.filter((n): n is string => typeof n === "string" && REVIEW_JOB_NAME.test(n)) : []; } catch { return []; } },
    set: (names) => { try { store.setNote("jobs", names.length ? JSON.stringify([...new Set(names)].sort()) : null); } catch { /* a nicety: the store then stays until the next time */ } },
  };
}

/** M106: a job's own folder, when it is really inside the project: .claude, worktrees and the job's folder are each a
 *  folder, never a link, and the real path is where it should be. Null for anything else; nothing behind it is read. */
export function jobFolder(project: string, name: string): string | null {
  if (!REVIEW_JOB_NAME.test(name)) return null;
  try {
    const root = realpathSync(project);
    let at = root;
    for (const part of [...JOB_DIR.split("/").filter(Boolean), name]) {
      at = join(at, part);
      const st = lstatSync(at);
      if (st.isSymbolicLink() || !st.isDirectory()) return null;
    }
    return realpathSync(at) === at ? at : null;
  } catch { return null; }
}

export class JobWatch {
  private jobs = new Map<string, Job>();
  private on = true;
  constructor(private d: JobDeps) {}

  /** The jobs already there when the project opens: each is copied at once as its starting point. */
  scan(): void {
    let names: string[] = [];
    this.sweep();
    if (!this.rootOk()) return;
    try { names = readdirSync(join(realpathSync(this.d.project), JOB_DIR)).filter((n) => REVIEW_JOB_NAME.test(n)).sort(); } catch { return; }
    for (const n of names) { if (this.jobs.size >= MAX_JOBS) break; if (!this.jobs.has(n) && jobFolder(this.d.project, n)) this.start(n, true); }
  }
  /** The stores of jobs followed before whose folders are gone now (removed while Squibby was closed) are removed. A name
   *  whose path is still there, even as something else, is left alone. */
  private sweep(): void {
    const known = this.d.known;
    if (!known) return;
    let root: string;
    try { root = realpathSync(this.d.project); } catch { return; }
    const keep: string[] = [];
    for (const n of known.get()) {
      const dir = join(root, JOB_DIR, n);
      let there = true;
      try { there = existsSync(dir) || lstatSync(dir).isSymbolicLink(); } catch { there = false; }
      if (there) { keep.push(n); continue; }
      this.removeStore(dir);
    }
    known.set(keep);
  }
  private removeStore(dir: string): void {
    try { void Promise.resolve(this.d.remove?.(dir)).catch(() => undefined); } catch { /* a nicety: it is tried again next time */ }
  }
  private remember(name: string, on: boolean): void {
    const known = this.d.known;
    if (!known) return;
    const names = new Set(known.get());
    if (on === names.has(name)) return;
    if (on) names.add(name); else names.delete(name);
    known.set([...names]);
  }
  private rootOk(): boolean {
    try {
      let at = realpathSync(this.d.project);
      for (const part of JOB_DIR.split("/").filter(Boolean)) { at = join(at, part); const st = lstatSync(at); if (st.isSymbolicLink() || !st.isDirectory()) return false; }
      return true;
    } catch { return false; }
  }
  /** A file event in a job's folder (batcher.ts onJob): rest "" is the folder itself. */
  notice(name: string, rest: string): void {
    if (!this.on) return;
    let j = this.jobs.get(name);
    const dir = jobFolder(this.d.project, name);
    if (!dir) { if (j) this.drop(j); return; }
    if (!j) {
      if (this.jobs.size >= MAX_JOBS) return;
      j = this.start(name, false);
      return;
    }
    if (j.base === null) { this.armSettle(j); return; }
    if (rest === "") return;
    j.dirty = true;
    this.arm(j);
  }
  private start(name: string, now: boolean): Job {
    const dir = jobFolder(this.d.project, name)!;
    const store = this.d.store(dir);
    const j: Job = { name, dir, store, base: null, baseId: null, settle: null, timer: null, dirty: false, open: null, said: false, at: 0, changed: new Set(), kept: [], unguard: null };
    try { j.unguard = store.guard(() => [j.baseId, j.open?.from, j.open?.to, ...j.kept].filter((x): x is string => !!x)); } catch { j.unguard = null; }
    this.jobs.set(name, j);
    this.remember(name, true);
    if (now) this.takeBase(j); else this.armSettle(j);
    return j;
  }
  private takeBase(j: Job): void {
    j.base = j.store.snapshot(LABEL_START, { envCopies: false }).then((c) => { j.baseId = c.id; return c.id; }, () => null);
  }
  private armSettle(j: Job): void {
    if (j.settle) clearTimeout(j.settle);
    j.settle = setTimeout(() => {
      j.settle = null;
      if (!this.on || this.jobs.get(j.name) !== j) return;
      if (!jobFolder(this.d.project, j.name)) { this.drop(j); return; }
      this.takeBase(j);
    }, Math.max(0, this.d.settleMs ?? JOB_SETTLE_MS));
  }
  private arm(j: Job): void {
    if (j.timer) clearTimeout(j.timer);
    j.timer = setTimeout(() => {
      j.timer = null;
      if (!this.on || this.jobs.get(j.name) !== j) return;
      if (this.d.busy()) { this.arm(j); return; }
      this.d.ready(j.name);
    }, Math.max(1, Number(this.d.quietMs()) || 0));
  }
  /** What changed in the job since its starting point (or since its open batch began, which then grows), as a new batch.
   *  Null when nothing is waiting or nothing differs. stops: Stop everything's count now. */
  async measure(name: string, stops: number): Promise<JobBatch | null> {
    const j = this.jobs.get(name);
    if (!j || !j.dirty || !j.base) return null;
    if (this.d.busy()) { this.arm(j); return null; }
    j.dirty = false;
    const base = await j.base;
    if (!base || this.jobs.get(name) !== j) return null;
    const from = j.open?.from ?? base;
    const to = (await j.store.snapshot(LABEL_CHANGES, { envCopies: false })).id;
    if (this.jobs.get(name) !== j) return null;
    const own = this.d.ignore();
    const changed = (await j.store.diff(from, to)).filter((c) => isEnvFile(c.file) || !coveredBy(c.file, own));
    const env = (await j.store.envChanged(from, to)).filter((f) => !changed.some((c) => c.file === f));
    const files: FileChange[] = [...changed, ...env.map((file) => ({ file, kind: "modified" as const }))].sort((a, b) => a.file.localeCompare(b.file));
    const old = j.open;
    if (!files.length) {
      j.open = null; j.base = Promise.resolve(to); j.baseId = to;
      if (old) this.d.closed(old);
      return null;
    }
    const b: JobBatch = { id: `rv_${randomBytes(5).toString("hex")}`, project: this.d.project, dir: j.dir, job: name, from, to, files, count: files.length,
      capped: files.length > this.d.maxFiles(), secretFiles: files.filter((f) => isEnvFile(f.file)).map((f) => f.file), frozen: true, stops };
    j.open = b; j.said = false; j.at = old ? j.at : Date.now();
    return b;
  }
  /** The open batch of this id, if it is one. */
  find(id: string): JobBatch | null {
    for (const j of this.jobs.values()) if (j.open?.id === id) return j.open;
    return null;
  }
  /** The next job batch to say: the oldest open one not said yet. */
  next(): JobBatch | null {
    const open = [...this.jobs.values()].filter((j) => j.open && !j.said).sort((a, b) => a.at - b.at);
    return open[0]?.open ?? null;
  }
  /** The oldest open job batch, said or not (Review now with no batch named). */
  oldest(): JobBatch | null {
    const open = [...this.jobs.values()].filter((j) => j.open).sort((a, b) => a.at - b.at);
    return open[0]?.open ?? null;
  }
  /** Review findings: how many jobs' changes wait for a review, besides the batch of this id (none named: all of them). */
  waiting(except?: string): number { return [...this.jobs.values()].filter((j) => j.open && j.open.id !== except).length; }
  /** A job batch is on the page now (said, and not reviewed or closed yet): the next one waits behind it. */
  showing(): boolean { return [...this.jobs.values()].some((j) => j.open && j.said); }
  said(id: string): void { for (const j of this.jobs.values()) if (j.open?.id === id) j.said = true; }
  /** The project's own card took the page: every job batch is said again once it is closed. */
  unsay(): void { for (const j of this.jobs.values()) j.said = false; }
  /** The batch was reviewed or closed: the job's next batch starts where it ended. */
  close(id: string): void {
    for (const j of this.jobs.values()) {
      if (j.open?.id !== id) continue;
      const b = j.open;
      for (const f of b.files) j.changed.add(f.file);
      j.kept.push(b.from, b.to); if (j.kept.length > KEEP_CLOSED * 2) j.kept.splice(0, j.kept.length - KEEP_CLOSED * 2);
      j.base = Promise.resolve(b.to); j.baseId = b.to;
      j.open = null;
      if (j.dirty) this.arm(j);
    }
  }
  /** M106: the files of this batch that other open jobs changed too (since their starting points), with their names. */
  overlap(b: { job?: string; files: FileChange[] }): ReviewOverlap[] {
    const out: ReviewOverlap[] = [];
    for (const f of b.files) {
      const jobs = [...this.jobs.values()].filter((j) => j.name !== b.job && (j.changed.has(f.file) || !!j.open?.files.some((x) => x.file === f.file))).map((j) => j.name).sort().slice(0, 7);
      if (jobs.length) out.push({ file: f.file, jobs });
      if (out.length >= MAX_OVERLAP) break;
    }
    return out;
  }
  /** Every starting point taken (for tests and the engine's own start). */
  async ready(): Promise<void> { await Promise.all([...this.jobs.values()].map((j) => j.base ?? Promise.resolve(null))); }
  /** Stop everything: nothing is measured by itself until the next change; what is waiting stays waiting. */
  pause(): void { for (const j of this.jobs.values()) { if (j.timer) clearTimeout(j.timer); j.timer = null; } }
  stop(): void {
    this.on = false;
    for (const j of this.jobs.values()) this.forget(j);
    this.jobs.clear();
  }
  private forget(j: Job): void {
    if (j.timer) clearTimeout(j.timer);
    if (j.settle) clearTimeout(j.settle);
    j.timer = j.settle = null;
    try { j.unguard?.(); } catch { /* a nicety */ }
  }
  private drop(j: Job): void {
    this.forget(j);
    this.jobs.delete(j.name);
    if (j.open) this.d.closed(j.open);
    // Only once the folder is really gone: a folder that became a link stays named, and its store waits for the sweep.
    let gone = false;
    try { gone = !existsSync(j.dir) && !lstatSync(j.dir, { throwIfNoEntry: false }); } catch { gone = true; }
    if (gone) { this.remember(j.name, false); this.removeStore(j.dir); }
  }
}
