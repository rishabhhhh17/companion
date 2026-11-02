// M52, the review of every change your AI makes (F30, docs/milestones/M52-review-every-change.md). The engine's side:
//  - It watches only the open project folder (the one the shell names in settings.apply), only while review.mode is not
//    off and Flow is on (batcher.ts). Never the screen, never another folder. Only changed paths are kept, in memory.
//  - A batch is everything that changed since the last review, or since the engine's own last work in the project,
//    measured against the engine's own shadow snapshots (checkpoints.ts, T06). No git command that writes the person's
//    git is ever run, and their history is never read: every git call is the shadow store's own.
//  - The rules (rate.ts) rate it; the words are written by the cheap lane, the stronger model only for a stop or a change
//    to sign in or payments (T10). Every model call asks the day's room first and is booked after (spending.ts).
//  - The project's own checks with the browser check (the proof ladder through agent.ts checkForReview, T07) run only when asked, or with
//    review.mode automatic.
//  - Settings and key files are never read, never sent to a model and never in an event, a log or the send back text:
//    only their names, in the batch's secretFiles. Every word that leaves is redacted again.
// While the engine's own work runs in the project (a task, an Undo, an install, a check), changes are not counted in a
// batch, and once it ends a new snapshot is the starting point; changes the other tool made just before are measured
// first, before the engine writes anything, so they are still reviewed on their own. When the other tool was still writing
// as that work began, its batch waits until the work has ended and the folder is quiet again, and holds the other tool's
// later writes to those files. Work that never edits code (a memory line, an install, a check) keeps aside what changes
// meanwhile, so the other tool's writes during it are reviewed too. A file that appears during a task of the engine
// cannot be told apart from the task's own: the task's receipt lists it, with Undo.
// Stop everything (rule 11) ends a review that runs, and no review that was about to start begins after it.
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { Command } from "../../../protocol/index.ts";
import { NEEDS_GIT, type CheckpointStore } from "../checkpoints.ts";
import type { FastLike } from "../lanes.ts";
import { PRODUCT, PRODUCT_S } from "../names.ts";
import { clip, redact, redactOutput } from "../redact.ts";
import { isEnvFile } from "../secretfiles.ts";
import { limitReached } from "../spending.ts";
import { diffForExplain, taskHunks, teachable, type Hunk } from "../teach.ts";
import { NO_PROJECT } from "../walk.ts";
import { ChangeBatcher, ignoredPath, type WatchFn } from "./batcher.ts";
import { importersOf, MAX_BATCH_FILES, needsStrongModel, rate, secretsInCode, touchesOf, type AddedLine, type Checks, type FileChange, type FileLines } from "./rate.ts";
import { fixPrompt, sendBackText, type ReviewWords } from "./sendback.ts";
import { parseWords, plainSummary, wordsRequest, type Words } from "./words.ts";

/** The commands whose work can write in the project (a task, a plan, Undo, an install, a check or a ship step that builds
 *  it, the shared memory files): main.ts wraps each in around(), so nothing they change is ever counted as the other
 *  tool's. Commands that only read are not here, so they never move the starting point on. */
export const OWN_WORK: ReadonlySet<string> = new Set([
  "agent.start", "agent.send", "drive.plan", "drive.approve", "rescue.diagnose", "research.ask", "problem.find", "bisect.start", "bisect.undo",
  "checkpoint.restore", "checkpoint.putBack", "teach.try", "teach.check", "project.install", "ship.check", "ship.preview", "ship.live", "ship.rollback",
  "memory.add", "memory.forget", "memory.edit", "memory.erase", "memory.agents", "watch.check",
]);
/** The engine's own work that never edits the person's code: what it writes is build output (ignored), a lock file or the
 *  memory notes (LIGHT_OWN_FILE). Anything else that changes while it runs is the other tool's, and is reviewed. */
export const LIGHT_WORK: ReadonlySet<string> = new Set([
  "research.ask", "problem.find", "teach.check", "project.install", "ship.check", "ship.preview", "ship.live", "ship.rollback",
  "memory.add", "memory.forget", "memory.edit", "memory.erase", "memory.agents", "watch.check",
]);
const LIGHT_OWN_FILE = /(^|\/)(AGENTS\.md|CLAUDE\.md|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|uv\.lock|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/;

/** What the project's own checks said (agent.ts checkForReview): a result, a reason it was not run, or stopped (null). */
export type CheckOutcome = { outcome: "ok" | "failing" | "unknown"; reason: string } | { skip: string } | null;
type AgentStart = Extract<Command, { type: "agent.start" }>;
type ReviewCmd = Extract<Command, { type: "review.now" | "review.dismiss" | "review.fix" }>;

export type ReviewDeps = {
  /** Says an event; the caller adds v, id and ts. */
  emit: (e: Record<string, unknown>) => void;
  /** A setting's value in force (RunnerSettings.get): review.mode, review.quietSeconds, flow.on. */
  setting: (key: string) => unknown;
  /** The engine's own shadow store for a project (the same one every task uses). */
  store: (project: string) => CheckpointStore;
  /** The cheap lane (T10), and the stronger model for a stop or a change to sign in or payments. */
  cheap?: FastLike | null;
  strong?: FastLike | null;
  /** The day's room and the booking of what a model call cost (agent.ts roomFor and bookSpend). */
  spend: { room(project: string): number; book(project: string, usd: number): void };
  /** The project's own build, tests and browser check, no model, nothing changed (agent.ts checkForReview). asked: the
   *  person pressed Review them, which is their yes to running the project's scripts in the safety box. */
  check?: (project: string, signal: AbortSignal, o: { asked: boolean }) => Promise<CheckOutcome>;
  /** Starts Fix it: an ordinary task, admitted by the plan gate and run by the agent runner (main.ts). */
  fix?: (cmd: AgentStart) => Promise<unknown> | unknown;
  /** Other work of the engine in the project that is not wrapped in around() (a watch's check): batches wait for it. */
  busy?: (project: string) => boolean;
  watch?: WatchFn;
  graceMs?: number;
  /** For tests: the quiet time in milliseconds, instead of review.quietSeconds. */
  quietMs?: () => number;
  modelTimeoutMs?: number;
  checkTimeoutMs?: number;
};

type Batch = { id: string; project: string; from: string; to: string; files: FileChange[]; count: number; capped: boolean; secretFiles: string[]; frozen: boolean };
/** Changes of the other tool set aside while the engine's own work, a review or an earlier batch was in the way: said as
 *  their own batch once that is over. to: null while the engine's work still runs. only: the files that are the other
 *  tool's (null: every file from..to). quiet: wait for the folder to be quiet first. stops: Stop everything's count when
 *  they were set aside; after a Stop they are said, but not reviewed by themselves. */
type Held = { from: Promise<string | null>; to: Promise<string | null> | null; only: Promise<string[]>[] | null; capped: boolean; quiet: boolean; stops: number };
type Reviewed = { batch: Batch; words: ReviewWords };

const SHOWN_FILES = 50;          // files named in an event
const READ_FILES = 60;           // files whose text the rules and the model look at
const DIFF_CHARS = 12_000;       // the most of the change a model is shown
const KEEP_REVIEWED = 5;         // reviews kept for Fix it until the card is closed
const LABEL_START = "Review: the starting point";
const LABEL_BATCH = "Review: the changes to look at";
const LABEL_AFTER = `Review: after ${PRODUCT_S} own work`;
const OFF_REASON = "Reviews of changes are off. Turn them on in Settings.";
const NOT_OPEN = "Open this project first, then review its changes.";
const BUSY_REASON = "A review is already running. It will finish in a moment.";
const MOVED_ON = "Those changes were already reviewed or have moved on. Review the newest ones.";
const NOTHING = "Nothing has changed since the last review.";
const STOPPED = "The review was stopped.";
const COULD_NOT = `${PRODUCT} could not look at those changes just now. Try again.`;
const HIDDEN_LINE = "[a line with a key or password, hidden]";
const NO_COPY = `${PRODUCT} could not keep a copy of this project to compare with, so its changes cannot be reviewed. Try opening the project again.`;

const later = <T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> => new Promise<T>((ok, no) => {
  if (signal.aborted) { no(new Error("stopped")); return; }
  const t = setTimeout(() => no(new Error("timed out")), ms);
  const stop = () => no(new Error("stopped"));
  signal.addEventListener("abort", stop, { once: true });
  p.then((v) => { clearTimeout(t); signal.removeEventListener("abort", stop); ok(v); }, (e) => { clearTimeout(t); signal.removeEventListener("abort", stop); no(e); });
});

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro|css|scss|sass|less|py)$/i;
/** The project's code as it is now, for "a removed file still used": only code files, never a settings or key file,
 *  nothing ignored, no links followed, bounded in count and size. Read on this Mac only, never sent. */
export function liveCode(project: string, maxFiles = 3000, maxBytes = 300_000, maxTotal = 24_000_000): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0, total = 0;
  const walk = (dir: string, rel: string, depth: number) => {
    if (depth > 12 || n >= maxFiles) return;
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names.sort()) {
      if (n >= maxFiles) return;
      const r = rel ? `${rel}/${name}` : name;
      if (ignoredPath(r) || isEnvFile(r)) continue;
      const p = join(dir, name);
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { walk(p, r, depth + 1); continue; }
      if (!st.isFile() || !CODE.test(name) || st.size > maxBytes || total + st.size > maxTotal) continue;
      try { out[r] = readFileSync(p, "utf8"); n++; total += st.size; } catch { /* unreadable: left out */ }
    }
  };
  walk(project, "", 0);
  return out;
}

/** The change as the model is shown it: every line the review's own rule calls a key in code (and any removed or nearby
 *  line like it) is replaced before the text is made, so the rule and the redaction can never disagree on what leaves. */
function withoutKeys(hunks: Hunk[]): Hunk[] {
  const hide = (file: string) => (t: string) => (secretsInCode([{ file, line: 1, text: t }]).length ? HIDDEN_LINE : t);
  return hunks.map((h) => ({ ...h, before: h.before.map(hide(h.file)), after: h.after.map(hide(h.file)), context: h.context.map(hide(h.file)) }));
}

export class ReviewService {
  private project: string | null = null;     // the open project, as the shell last named it
  private watching: string | null = null;    // the project being watched now
  private batcher: ChangeBatcher | null = null;
  private baseline: Promise<string | null> = Promise.resolve(null);
  /** Why the starting point could not be taken (no git on this Mac, a folder that cannot be copied), in plain words. */
  private startProblem: string | null = null;
  private open: Batch | null = null;
  private dirty = new Set<string>();
  private dirtyCapped = false;
  private reviewing: { batch: string; abort: AbortController } | null = null;
  private reviewed = new Map<string, Reviewed>();
  private ownBy = new Map<string, number>();
  private ownEpoch = 0;
  /** Changes of the other tool set aside (Held). At most one is held; later ones join it. */
  private held: Held | null = null;
  /** The engine's own work in the watched project now: Stop's count as it began, whether any of it may edit code (heavy),
   *  and the state of the folder as it began. */
  private win: { stops: number; heavy: boolean; pre: Promise<string | null> } | null = null;
  /** How many times Stop everything was pressed. Work that was about to start checks it did not change meanwhile. */
  private stops = 0;
  private gen = 0;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private deps: ReviewDeps) {}

  // ---------- what is watched ----------

  /** The project folder the shell named (settings.apply). Anything else, the stand in or nothing: nothing is watched. */
  setProject(project?: string): void {
    let p: string | null = null;
    if (project && project !== NO_PROJECT) { try { const r = resolve(project); if (statSync(r).isDirectory()) p = r; } catch { p = null; } }
    this.project = p;
    this.sync();
  }
  /** Settings were applied: the watcher runs only while review.mode is not off and Flow is on. */
  sync(): void {
    const want = this.project && this.on() ? this.project : null;
    if (this.watching && this.watching !== want) this.stopWatching();
    if (want && !this.watching) this.startWatching(want);
  }
  /** The starting point is taken (or could not be). For tests and for the engine's own start. */
  async ready(): Promise<void> { await this.baseline; await this.chain.catch(() => undefined); }
  private on(): boolean { return this.deps.setting("review.mode") !== "off" && this.deps.setting("flow.on") !== false; }
  private auto(): boolean { return this.deps.setting("review.mode") === "automatic"; }
  private quietMs(): number { return this.deps.quietMs ? this.deps.quietMs() : Math.max(1, Number(this.deps.setting("review.quietSeconds")) || 20) * 1000; }
  private ownOf(p: string): number { return this.ownBy.get(p) ?? 0; }

  private startWatching(p: string): void {
    let store: CheckpointStore;
    try { store = this.deps.store(p); } catch { return; }   // a folder too broad to keep a copy of: nothing is watched
    const gen = ++this.gen;
    const b = new ChangeBatcher({ project: p, quietMs: () => this.quietMs(), onReady: (paths, capped) => this.ready_(gen, paths, capped), busy: () => this.deps.busy?.(p) === true, watch: this.deps.watch, graceMs: this.deps.graceMs });
    if (!b.start()) return;
    for (let i = 0; i < this.ownOf(p); i++) b.holdOwn();
    this.batcher = b; this.watching = p;
    this.open = null; this.dirty.clear(); this.dirtyCapped = false; this.reviewed.clear();
    this.startProblem = null;
    this.baseline = this.serial(() => store.snapshot(LABEL_START).then((c) => c.id)).catch((e: unknown) => {
      if (gen === this.gen) this.startProblem = String((e as Error)?.message ?? e) === NEEDS_GIT ? NEEDS_GIT : NO_COPY;
      return null;
    });
  }
  private stopWatching(): void {
    this.gen++;
    this.batcher?.stop();
    this.batcher = null; this.watching = null; this.open = null;
    this.dirty.clear(); this.dirtyCapped = false; this.held = null; this.win = null;
    this.reviewing?.abort.abort();
    this.reviewed.clear();
    this.baseline = Promise.resolve(null);
  }
  /** The engine is closing. */
  stop(): void { this.project = null; this.stopWatching(); }
  /** Stop everything (rule 11): a review or its checks that are running end now; a review about to start (a press still
   *  waiting for its snapshot, a batch being measured, changes set aside) does not start after it; and the batch still
   *  waiting for the quiet time is not said or reviewed by itself. Its paths are kept, so the next batch (or Review now)
   *  still holds them. The watcher keeps watching. */
  stopAll(): void {
    this.stops++;
    this.reviewing?.abort.abort();
    if (!this.batcher) return;
    const waiting = this.batcher.take();
    for (const x of waiting.paths) this.dirty.add(x);
    if (waiting.capped) this.dirtyCapped = true;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  // ---------- the engine's own work ----------

  /** The engine's own work in a project (main.ts wraps every command that can write there, naming it): not counted in a
   *  batch while it runs, and a new starting point once it ends. Called before the work starts, so what the other tool
   *  changed just before is measured first. kind: the command; work not in LIGHT_WORK (or unnamed) may edit code. */
  around(project: string, work: Promise<unknown>, kind?: string): void {
    const p = resolve(project);
    this.ownStart(p, kind);
    const end = () => this.ownEnd(p);
    void work.then(end, end);
  }
  private ownStart(p: string, kind?: string): void {
    const n = this.ownOf(p);
    this.ownBy.set(p, n + 1);
    this.ownEpoch++;
    if (p !== this.watching || !this.batcher) return;
    this.batcher.holdOwn();
    const heavy = !kind || !LIGHT_WORK.has(kind);
    if (n > 0) { if (this.win) this.win.heavy ||= heavy; return; }
    const waiting = this.batcher.take();
    // The other tool was still writing (its batch had not been quiet for the quiet time yet): half written.
    const half = waiting.paths.length > 0 || waiting.capped;
    for (const x of waiting.paths) this.dirty.add(x);
    if (waiting.capped) this.dirtyCapped = true;
    const stops = this.stops;
    const from = this.open && !this.open.frozen ? Promise.resolve(this.open.to) : this.baseline;
    let pre = from;
    if (this.dirty.size || this.dirtyCapped) {
      // Taken now, before the engine writes anything: the store runs one step at a time, so this snapshot comes first.
      const store = this.deps.store(p);
      const snap = store.snapshot(LABEL_BATCH);
      snap.catch(() => undefined);
      pre = snap.then((c) => c.id, () => null);
      const gen = this.gen, capped = this.dirtyCapped;
      this.dirty.clear(); this.dirtyCapped = false;
      if (half) {
        // Never said or reviewed half written: set aside until the engine's work has ended and the folder is quiet, and
        // then measured to the end of that work, for the files the other tool was writing (its later writes to them too).
        this.hold(from, pre, null, capped, true, stops);
      } else if (!this.reviewing && !this.open?.frozen) {
        void this.serial(async () => {
          const to = await snap;
          const start = this.open ? this.open.from : await this.baseline;
          if (gen !== this.gen || !start) return;
          await this.announce(store, start, to.id, capped || !!this.open?.capped, true, stops);
        }).catch(() => undefined);
      } else {
        // A review runs, or an earlier batch waits to be closed: these changes start where that one ends, and are said
        // once it is closed.
        this.hold(from, pre, pre, capped, false, stops);
      }
    }
    this.win = { stops, heavy, pre };
    if (this.open) this.open.frozen = true;
  }
  /** Sets changes from..to aside (to null: up to the end of the engine's work, only for the files changed from..upTo), or
   *  adds them to what is already set aside. */
  private hold(from: Promise<string | null>, upTo: Promise<string | null>, to: Promise<string | null> | null, capped: boolean, quiet: boolean, stops: number): void {
    const store = this.deps.store(this.watching!);
    const h = this.held;
    if (!h) { this.held = { from, to, only: to === null ? [this.filesBetween(store, from, upTo)] : null, capped, quiet, stops }; return; }
    h.only = [...(h.only ?? [this.filesBetween(store, h.from, h.to)]), this.filesBetween(store, from, upTo)];
    h.to = to;
    h.capped ||= capped; h.quiet ||= quiet;
    if (h.stops !== stops) h.stops = -1;
  }
  private ownEnd(p: string): void {
    const n = Math.max(0, this.ownOf(p) - 1);
    if (n) this.ownBy.set(p, n); else this.ownBy.delete(p);
    if (p !== this.watching || !this.batcher) return;
    this.batcher.releaseOwn();
    if (n > 0) return;
    const w = this.win;
    this.win = null;
    const seen = this.batcher.takeOwnSeen();
    // A new starting point: what the engine's work left. Changes made after it are the next batch.
    const store = this.deps.store(p);
    const gen = this.gen;
    this.dirty.clear(); this.dirtyCapped = false;
    const next = this.serial(async () => (gen === this.gen ? (await store.snapshot(LABEL_AFTER)).id : null)).catch(() => null);
    this.baseline = next.then(async (id) => id ?? null);
    // Work that never edits code: what else changed meanwhile is the other tool's.
    const during = w && !w.heavy ? seen.paths.filter((x) => !LIGHT_OWN_FILE.test(x)) : [];
    const duringCapped = !!w && !w.heavy && seen.capped;
    const h = this.held;
    if (h && h.to === null) {
      h.to = this.baseline;
      if (during.length) h.only = [...(h.only ?? []), Promise.resolve(during)];
      h.capped ||= duringCapped;
    } else if (during.length || duringCapped) {
      if (h) { h.only = [...(h.only ?? [this.filesBetween(store, h.from, h.to)]), Promise.resolve(during)]; h.to = this.baseline; h.quiet = true; h.capped ||= duringCapped; if (h.stops !== w!.stops) h.stops = -1; }
      else this.held = { from: w!.pre, to: this.baseline, only: [Promise.resolve(during)], capped: duringCapped, quiet: true, stops: w!.stops };
    }
    if (!this.held) return;
    if (this.held.quiet) this.batcher.poke(); else this.tryRelease();
  }
  private filesBetween(store: CheckpointStore, a: Promise<string | null>, b: Promise<string | null> | null): Promise<string[]> {
    return Promise.all([a, b]).then(async ([x, y]) => (x && y ? (await store.diff(x, y)).map((c) => c.file) : []), () => []);
  }

  // ---------- batches ----------

  private ready_(gen: number, paths: string[], capped: boolean): void {
    if (gen !== this.gen) return;
    for (const x of paths) this.dirty.add(x);
    if (capped) this.dirtyCapped = true;
    // The folder is quiet: changes set aside until then can be said now; what came since is measured after them.
    if (this.held?.quiet) this.held.quiet = false;
    if (this.tryRelease()) return;
    void this.measure(gen).catch(() => undefined);
  }
  /** Measures what changed since the starting point (or since the open batch began, which then grows). Null when nothing
   *  can be measured now: a review or the engine's own work is running, the open batch waits to be closed, or Stop
   *  everything was pressed since it was asked for (then its paths wait for the next batch). */
  private measure(gen: number, o: { noAuto?: boolean } = {}): Promise<Batch | null> {
    const stops = this.stops;
    return this.serial(async () => {
      const p = this.watching;
      if (gen !== this.gen || !p || this.reviewing || this.open?.frozen || this.ownOf(p) > 0 || stops !== this.stops) return null;
      if (!this.dirty.size && !this.dirtyCapped) return null;
      const from = this.open ? this.open.from : await this.baseline;
      if (!from || gen !== this.gen || stops !== this.stops) return null;
      const taken = [...this.dirty], wasCapped = this.dirtyCapped;
      const capped = this.dirtyCapped || !!this.open?.capped;
      this.dirty.clear(); this.dirtyCapped = false;
      const store = this.deps.store(p);
      const epoch = this.ownEpoch;
      const to = await store.snapshot(LABEL_BATCH);
      if (gen !== this.gen) return null;
      if (stops !== this.stops) { for (const x of taken) this.dirty.add(x); if (wasCapped) this.dirtyCapped = true; return null; }
      return this.announce(store, from, to.id, capped, this.ownEpoch !== epoch, o.noAuto ? null : stops);
    });
  }
  /** Makes the open batch from..to and says so. An empty one says count 0 for the open batch, if there was one, and moves
   *  the starting point on. frozen: the engine's own work began since, so the batch cannot grow any more. auto: Stop's
   *  count when it was asked for; with review.mode automatic it is reviewed by itself only if Stop was not pressed since
   *  (null: never by itself). only: just these files (changes set aside while the engine worked). */
  private async announce(store: CheckpointStore, from: string, to: string, capped: boolean, frozen: boolean, auto: number | null, only: Set<string> | null = null): Promise<Batch | null> {
    const p = this.watching!;
    const changed = (await store.diff(from, to)).filter((c) => !only || only.has(c.file));
    const env = (await store.envChanged(from, to)).filter((f) => (!only || only.has(f)) && !changed.some((c) => c.file === f));
    const files: FileChange[] = [...changed, ...env.map((file) => ({ file, kind: "modified" as const }))].sort((a, b) => a.file.localeCompare(b.file));
    const old = this.open;
    if (!files.length) {
      this.open = null;
      if (!frozen) this.baseline = Promise.resolve(to);
      if (old) this.deps.emit({ type: "review.batch", project: p, batch: old.id, files: [], count: 0, capped: false, secretFiles: [], auto: this.auto() });
      return null;
    }
    const b: Batch = { id: `rv_${randomBytes(5).toString("hex")}`, project: p, from, to, files, count: files.length, capped: capped || files.length > MAX_BATCH_FILES, secretFiles: files.filter((f) => isEnvFile(f.file)).map((f) => f.file), frozen };
    this.open = b;
    this.deps.emit({ type: "review.batch", project: p, batch: b.id, files: b.files.slice(0, SHOWN_FILES), count: b.count, capped: b.capped, secretFiles: b.secretFiles.slice(0, 20), auto: this.auto() });
    if (this.auto() && auto !== null && auto === this.stops) void this.reviewBatch(b, true, auto, false).catch(() => undefined);
    return b;
  }
  /** The open batch is closed (reviewed, or Looks fine): the next one starts where it ended. */
  private close(b: Batch): void {
    if (this.open?.id === b.id) {
      if (!this.open.frozen) this.baseline = Promise.resolve(this.open.to);
      this.open = null;
    }
    if (this.tryRelease()) return;
    if (this.dirty.size || this.dirtyCapped) void this.measure(this.gen).catch(() => undefined);
  }
  /** Says the changes set aside, once nothing is in their way: the engine's work has ended, the folder is quiet (when
   *  they wait for that), and no review runs and no batch is open. True when they are being said. */
  private tryRelease(): boolean {
    const h = this.held, p = this.watching;
    if (!h || !p || h.to === null || h.quiet || this.reviewing || this.open || this.ownOf(p) > 0) return false;
    void this.releaseHeld(true).catch(() => undefined);
    return true;
  }
  /** Says the changes set aside as their own batch, which can no longer grow. auto: it may be reviewed by itself. */
  private releaseHeld(auto: boolean): Promise<Batch | null> {
    const h = this.held, gen = this.gen, p = this.watching;
    if (!h || !p || h.to === null) return Promise.resolve(null);
    this.held = null;
    const toP = h.to;
    return this.serial(async () => {
      const [to, from] = [await toP, await h.from];
      if (gen !== this.gen || !from || !to) return null;
      if (this.open) { if (!this.held) this.held = h; return null; }
      const only = h.only ? new Set((await Promise.all(h.only)).flat()) : null;
      const b = await this.announce(this.deps.store(p), from, to, h.capped, true, auto && h.stops === this.stops ? h.stops : null, only);
      if (!b && (this.dirty.size || this.dirtyCapped)) queueMicrotask(() => void this.measure(gen).catch(() => undefined));
      return b;
    });
  }

  // ---------- commands ----------

  async handle(cmd: ReviewCmd): Promise<void> {
    if (cmd.type === "review.now") return this.reviewNow(cmd);
    if (cmd.type === "review.dismiss") {
      const b = this.open?.id === cmd.batch ? this.open : this.reviewed.get(cmd.batch)?.batch;
      this.reviewed.delete(cmd.batch);
      if (b && b.id === this.open?.id) this.close(b);
      return;
    }
    return this.fix(cmd);
  }

  private notReviewed(project: string, reason: string, batch?: string): void {
    this.deps.emit({ type: "review.result", project, ...(batch ? { batch } : {}), ok: false, reason, usdEstimate: 0 });
  }
  private async reviewNow(cmd: Extract<ReviewCmd, { type: "review.now" }>): Promise<void> {
    if (!this.on()) { this.notReviewed(cmd.project, OFF_REASON, cmd.batch); return; }
    const p = resolve(cmd.project);
    if (p !== this.watching || !this.batcher) { this.notReviewed(cmd.project, NOT_OPEN, cmd.batch); return; }
    if (this.reviewing) { this.notReviewed(cmd.project, BUSY_REASON, cmd.batch); return; }
    const stops = this.stops;
    const stopped = () => { if (this.stops === stops) return false; this.notReviewed(cmd.project, STOPPED, cmd.batch); return true; };
    await this.baseline;
    if (stopped()) return;
    if (this.startProblem && !this.open) { this.notReviewed(cmd.project, this.startProblem, cmd.batch); return; }
    let b: Batch | null | undefined;
    if (cmd.batch) {
      b = this.open?.id === cmd.batch ? this.open : this.reviewed.get(cmd.batch)?.batch;
      if (!b) { this.notReviewed(cmd.project, MOVED_ON, cmd.batch); return; }
    } else {
      if (!this.open && this.held && !this.reviewing) b = await this.releaseHeld(false).catch(() => null);
      if (stopped()) return;
      // Review now, before the quiet time ends: whatever changed so far is measured at once.
      const waiting = this.batcher.take();
      for (const x of waiting.paths) this.dirty.add(x);
      if (waiting.capped) this.dirtyCapped = true;
      // A press with no file event seen yet (an editor that saves in a way the folder's events miss) still measures.
      if (!this.dirty.size && !this.open) this.dirty.add(".");
      const measured = b ? null : await this.measure(this.gen, { noAuto: true }).catch(() => null);
      if (stopped()) return;
      b = b ?? measured ?? this.open;
      if (!b) { this.notReviewed(cmd.project, NOTHING); return; }
    }
    await this.reviewBatch(b, cmd.proof === true || this.auto(), stops, cmd.proof === true);
  }

  private async fix(cmd: Extract<ReviewCmd, { type: "review.fix" }>): Promise<void> {
    const rec = this.reviewed.get(cmd.batch);
    const fail = (reason: string) => this.deps.emit({ type: "protocol.error", reason, failed: "review.fix" });
    if (!rec || rec.batch.project !== resolve(cmd.project)) { fail("Review these changes first, then press Fix it."); return; }
    if (!this.deps.fix) { fail("Fixing is not available here."); return; }
    this.reviewed.delete(cmd.batch);
    // An ordinary task: it keeps a safety copy first and can be undone, like every fix. The plan gate admits it in main.ts.
    await this.deps.fix({ v: 1, id: cmd.id, type: "agent.start", project: cmd.project, agent: cmd.agent, mode: "drive", prompt: fixPrompt(rec.words), model: cmd.model, budgetUsd: cmd.budgetUsd });
  }

  // ---------- the review ----------

  /** stops: Stop everything's count when this review was asked for; a Stop since means it does not start. asked: the
   *  person pressed Review them (their yes to running the project's scripts in the safety box). */
  private async reviewBatch(b: Batch, proof: boolean, stops: number, asked: boolean): Promise<void> {
    if (stops !== this.stops) { this.notReviewed(b.project, STOPPED, b.id); return; }
    if (this.reviewing) { this.notReviewed(b.project, BUSY_REASON, b.id); return; }
    const abort = new AbortController();
    this.reviewing = { batch: b.id, abort };
    const gen = this.gen;
    this.deps.emit({ type: "review.started", project: b.project, batch: b.id, proof });
    let usd = 0;
    try {
      const store = this.deps.store(b.project);
      // The text of the files that changed, from the two snapshots. Settings and key files, lock files, installed packages
      // and build output are never read (teach.ts teachable).
      const readable = b.files.filter((f) => teachable(f.file)).slice(0, READ_FILES);
      const names = new Set(readable.map((f) => f.file));
      const [before, after] = [await store.readFiles(b.from, (x) => names.has(x)), await store.readFiles(b.to, (x) => names.has(x))];
      const hunks = taskHunks(readable, before, after);
      const lines: FileLines[] = [];
      const added: AddedLine[] = [];
      for (const h of hunks) {
        let l = lines.find((x) => x.file === h.file);
        if (!l) { l = { file: h.file, added: [], removed: [] }; lines.push(l); }
        l.added.push(...h.after); l.removed.push(...h.before);
        h.after.forEach((text, i) => added.push({ file: h.file, line: h.afterAt + i, text }));
      }
      const secrets = secretsInCode(added);
      const deleted = b.files.filter((f) => f.kind === "deleted").map((f) => f.file);
      const stillUsed = deleted.length ? importersOf(deleted, liveCode(b.project)) : [];
      const touches = touchesOf(b.files, lines, b.secretFiles);
      if (abort.signal.aborted) throw new Error("stopped");

      // The project's own checks, only when asked (or automatic), never beside the engine's other work in the project.
      let checks: Checks = "not_run", checksNote: string | undefined;
      if (proof) {
        if (!this.deps.check) { checks = "unknown"; checksNote = "The project's checks cannot run here."; }
        else if (this.ownOf(b.project) > 0 || this.deps.busy?.(b.project)) { checks = "unknown"; checksNote = `${PRODUCT} is working on this project right now, so its checks were not run.`; }
        else {
          // Not the engine's own work in the folder: the checks only build (their output folders are ignored), and what the
          // other tool changes meanwhile must still be counted. A batch waits while a review runs.
          let r: CheckOutcome;
          try { r = await later(this.deps.check(b.project, abort.signal, { asked }), this.deps.checkTimeoutMs ?? 10 * 60_000, abort.signal); }
          catch { r = abort.signal.aborted ? null : { outcome: "unknown", reason: "The checks took too long, so they were stopped." }; }
          if (abort.signal.aborted || r === null) throw new Error("stopped");
          if ("skip" in r) { checks = "unknown"; checksNote = r.skip; }
          else { checks = r.outcome === "ok" ? "passed" : r.outcome === "failing" ? "failed" : "unknown"; checksNote = r.reason; }
          checksNote = checksNote ? clip(redactOutput(checksNote).replace(/\s+/g, " ").trim(), 200) : undefined;
        }
      }
      const input = { changes: b.files, touches, secrets, stillUsed, secretFiles: b.secretFiles, checks, checksNote, count: b.count, capped: b.capped };
      let rated = rate(input);

      // The words: the cheap lane, or the stronger model for a stop, sign in or payments. Only with room left today.
      let lane: "cheap" | "strong" | "none" = "none", note: string | undefined, words: Words | null = null;
      const strong = needsStrongModel(rated.rating, touches);
      const model = strong && this.deps.strong ? this.deps.strong : this.deps.cheap;
      if (!model) note = "No Claude is connected, so these are the rules' own words.";
      else if (this.deps.spend.room(b.project) <= 0) note = limitReached(b.project);
      else {
        lane = model === this.deps.strong && strong ? "strong" : "cheap";
        const req = wordsRequest({ files: b.files, count: b.count, touches, reasons: rated.reasons, diff: diffForExplain(withoutKeys(hunks), DIFF_CHARS), checks: checks === "not_run" ? "not run" : checks });
        // The call has its own stop switch: Stop ends it, and so does waiting too long, so no Claude process is left
        // running. Whatever it cost is booked when it answers (F29), even after the review stopped waiting for it.
        const call = new AbortController();
        const endCall = () => call.abort();
        abort.signal.addEventListener("abort", endCall, { once: true });
        const answer = model.run(req, () => {}, call.signal).then((r) => {
          const u = Math.max(0, Number(r.costUsd) || 0);
          this.deps.spend.book(b.project, u);
          return { text: r.text, usd: u };
        });
        answer.catch(() => undefined);
        try {
          const r = await later(answer, this.deps.modelTimeoutMs ?? 90_000, abort.signal);
          usd = r.usd;
          words = parseWords(r.text);
        } catch {
          call.abort();
          if (abort.signal.aborted) throw new Error("stopped");
          lane = "none"; note = "Claude could not be reached, so these are the rules' own words.";
        } finally { abort.signal.removeEventListener("abort", endCall); }
      }
      if (words?.concern) rated = rate({ ...input, concern: true, concernSay: words.concernSay });
      const summary = words?.summary ?? plainSummary(b.files, b.count);
      const notes = (words?.notes ?? []).map((n) => clip(redact(n), 200));
      const review: ReviewWords = { rating: rated.rating, reasons: rated.reasons, touches, files: b.files, count: b.count, summary, notes };
      if (gen !== this.gen || abort.signal.aborted) throw new Error("stopped");
      this.deps.emit({
        type: "review.result", project: b.project, batch: b.id, ok: true, rating: rated.rating, touches, summary: clip(redact(summary), 400), notes,
        reasons: rated.reasons, files: b.files.slice(0, SHOWN_FILES), count: b.count, capped: b.capped, secretFiles: b.secretFiles.slice(0, 20),
        checks, ...(checksNote ? { checksNote } : {}), sendBack: sendBackText(review), lane, usdEstimate: Math.round(usd * 1e6) / 1e6, ...(note ? { note } : {}),
      });
      this.reviewed.set(b.id, { batch: b, words: review });
      while (this.reviewed.size > KEEP_REVIEWED) this.reviewed.delete(this.reviewed.keys().next().value as string);
      this.reviewing = null;
      this.close(b);
    } catch (e) {
      const stopped = abort.signal.aborted || /stopped/.test(String((e as Error)?.message ?? e));
      if (gen === this.gen) this.notReviewed(b.project, stopped ? STOPPED : COULD_NOT, b.id);
    } finally {
      if (this.reviewing?.batch === b.id) this.reviewing = null;
    }
  }
}
