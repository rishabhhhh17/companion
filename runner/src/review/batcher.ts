// M52, the review of every change (F30): the watcher on the open project folder, and only that folder. It uses the folder's
// own file events (macOS FSEvents through Bun's recursive fs.watch, the same as take the wheel in watcher.ts): no
// permission, nothing from the screen, nothing that anyone types. It keeps only the list of changed paths, in memory. A
// batch is ready once nothing has changed for the quiet time (review.quietSeconds), so a tool still writing is never
// looked at half way. While the engine's own work runs in the project, changes are not counted in a batch: their paths are
// kept aside (takeOwnSeen), so the review can tell which of them the engine's work could not have made. For a moment after
// that work, late file events are its own. One batch holds at most a fixed number of paths.
import { lstatSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { coveredBy } from "../pathglob.ts";

/** Folders nobody writes by hand: git's, installed packages, build output and caches, the engine's own and Claude's. */
const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", ".nuxt", "out", "target", "coverage", ".cache", ".turbo", ".venv", "venv",
  "__pycache__", ".claude", ".vite", ".parcel-cache", ".svelte-kit", ".output", ".vercel", ".netlify", ".companion", ".gradle",
  ".build", ".idea", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".expo", ".angular", ".docusaurus", ".yarn", ".pnpm-store",
]);
/** Scratch files editors write while saving (vim's swap and test files, emacs' locks and backups), the Finder's notes,
 *  TypeScript's build notes (a check of the project writes them), and the temporary name a tool writes before renaming it
 *  over the file (file.tmp.<pid>.<time>, seen on this Mac in M57 step 1). */
const SCRATCH = /(^|\/)(\.DS_Store|4913|\.#[^/]*|[^/]*~|\.[^/]*\.sw[a-p]|[^/]*\.tmp|[^/]*\.tmp(\.\d+)+|[^/]*\.tsbuildinfo)$/;

/** A path the review never counts: ignored, scratch, or one that would leave the folder. M74: `own` is the person's own
 *  list (review.ignore, as pathglob.ts tests), checked after the built in one, so it can only add to it. */
export function ignoredPath(rel: string, own: readonly RegExp[] = []): boolean {
  if (!rel || rel.startsWith("/") || rel.includes("\0")) return true;
  const parts = rel.split("/");
  if (parts.some((p) => p === "..")) return true;
  if (parts.some((p) => IGNORED_DIRS.has(p))) return true;
  return SCRATCH.test(rel) || coveredBy(rel, own);
}

/** How the folder's file events are listened to (the real one, or a test's own). It names paths relative to the folder. */
export type WatchFn = (dir: string, onChange: (rel: string) => void) => { close(): void };
export const folderEvents: WatchFn = (dir, onChange) => {
  const w = fsWatch(dir, { recursive: true }, (_ev, name) => { if (name) onChange(String(name)); });
  w.on("error", () => { /* a folder that vanished: nothing more to watch */ });
  return { close: () => w.close() };
};

/** At most this many paths in one batch; past it the batch is marked capped (rate.ts says too many to look at one by one). */
export const MAX_PATHS = 1000;
const GRACE_MS = 1500;

export type BatcherOptions = {
  project: string;
  /** The quiet time, read each time a batch is armed, so a change in Settings reaches the next batch. */
  quietMs: () => number;
  onReady: (paths: string[], capped: boolean) => void;
  /** Other work of the engine in the project that does not go through holdOwn (a watch's check): the batch waits for it. */
  busy?: () => boolean;
  maxPaths?: number;
  /** M74: the person's own names and paths to skip (review.ignore), read at each change so a new list counts at once. */
  ignore?: () => readonly RegExp[];
  graceMs?: number;
  watch?: WatchFn;
};

export class ChangeBatcher {
  private w: { close(): void } | null = null;
  private paths = new Set<string>();
  /** Folders whose own event came (made, removed, coalesced): they wake the batch but take no place under the cap, and are
   *  handed over only when no file came (M57 step 1: 1500 files in 15 new folders gave 1516 paths). */
  private dirs = new Set<string>();
  private capped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private own = 0;
  private quietUntil = 0;
  private on = false;
  private ownSeen = new Set<string>();
  private ownCapped = false;
  private poked = false;
  constructor(private o: BatcherOptions) {}

  /** Starts listening. False when the folder cannot be watched (then nothing is ever ready). */
  start(): boolean {
    if (this.on) return true;
    try { this.w = (this.o.watch ?? folderEvents)(this.o.project, (rel) => this.seen(rel)); } catch { this.w = null; return false; }
    this.on = true;
    return true;
  }
  /** Stops listening and forgets what was waiting. */
  stop(): void {
    this.on = false;
    this.clearTimer();
    try { this.w?.close(); } catch { /* already closed */ }
    this.w = null;
    this.paths.clear(); this.dirs.clear(); this.capped = false;
    this.ownSeen.clear(); this.ownCapped = false; this.poked = false;
  }
  /** The engine's own work in the project begins: what changes now is not counted in a batch, only kept aside. */
  holdOwn(): void { if (this.own === 0) { this.ownSeen.clear(); this.ownCapped = false; } this.own++; }
  /** That work ended. Once all of it has, changes count again after a short grace, for file events that arrive late. */
  releaseOwn(): void {
    if (this.own > 0) this.own--;
    if (this.own === 0) this.quietUntil = Date.now() + (this.o.graceMs ?? GRACE_MS);
  }
  /** What is waiting now, handed over and forgotten (Review now, or the engine's own work about to start). */
  take(): { paths: string[]; capped: boolean } {
    this.clearTimer();
    const out = { paths: [...(this.paths.size ? this.paths : this.dirs)].sort(), capped: this.capped };
    this.paths.clear(); this.dirs.clear(); this.capped = false; this.poked = false;
    return out;
  }
  /** The paths that changed while the engine's own work ran, handed over and forgotten. */
  takeOwnSeen(): { paths: string[]; capped: boolean } {
    const out = { paths: [...this.ownSeen].sort(), capped: this.ownCapped };
    this.ownSeen.clear(); this.ownCapped = false;
    return out;
  }
  /** Says ready (with no paths, if none came) once the folder has been quiet for the quiet time from now. */
  poke(): void { if (!this.on) return; this.poked = true; this.arm(); }
  /** Paths waiting for the quiet time to end. */
  waiting(): number { return this.paths.size; }
  private isDir(rel: string): boolean { try { return lstatSync(join(this.o.project, rel)).isDirectory(); } catch { return false; } }

  private holding(): boolean { return this.own > 0 || Date.now() < this.quietUntil; }
  private seen(raw: string): void {
    if (!this.on) return;
    const rel = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (ignoredPath(rel, this.o.ignore?.() ?? [])) return;
    if (this.own > 0) {
      if (!this.ownSeen.has(rel)) { if (this.ownSeen.size >= (this.o.maxPaths ?? MAX_PATHS)) this.ownCapped = true; else this.ownSeen.add(rel); }
      return;
    }
    if (this.holding()) return;
    if (this.isDir(rel)) { this.dirs.add(rel); this.arm(); return; }
    if (!this.paths.has(rel)) {
      if (this.paths.size >= (this.o.maxPaths ?? MAX_PATHS)) this.capped = true;
      else this.paths.add(rel);
    }
    this.arm();
  }
  private arm(): void {
    this.clearTimer();
    const ms = Math.max(0, Number(this.o.quietMs()) || 0);
    this.timer = setTimeout(() => this.fire(), ms);
  }
  private fire(): void {
    this.timer = null;
    if (!this.on || (!this.paths.size && !this.dirs.size && !this.capped && !this.poked)) return;
    // Other work of the engine, or its own work, is busy in the project: look again in a moment instead of now.
    if (this.holding() || this.o.busy?.()) { this.timer = setTimeout(() => this.fire(), Math.max(50, Math.min(1000, Number(this.o.quietMs()) || 0))); return; }
    const out = this.take();
    this.o.onReady(out.paths, out.capped);
  }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
