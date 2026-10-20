// Watch routines (F21). A watch is one project, one kind of check, a target and a schedule. They are read only checks that
// run only while the engine runs, on a schedule the person chose, and never call Claude. Each keeps its latest result and
// a short history of the states it has been in (never page content or logs) in watch.json in the engine's data folder.
//
// The scheduler is plain code: tick() looks at the clock it was given and starts every check that is due. A real timer calls
// tick() every half minute; tests call it with a clock they control. A check that was missed (the Mac was asleep) is run
// once when the engine is next awake, never once for every missed time. No two checks of one watch run at once.
import { randomBytes } from "node:crypto";
import { existsSync, renameSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "../../protocol/index.ts";
import { writeAtomic } from "./atomic.ts";
import { clip, redact } from "./redact.ts";
import type { CheckResult } from "./watchsite.ts";
import { parseTarget } from "./watchaddress.ts";

export const KINDS = ["site_up", "deploy_status", "ci_status", "project_checks"] as const;
export type Kind = (typeof KINDS)[number];
export const STATES = ["ok", "failing", "unknown", "paused"] as const;
export type WatchState = (typeof STATES)[number];
export const WATCH_FILE = "watch.json";
export const MAX_PER_PROJECT = 10;
export const MAX_TOTAL = 30;
export const HISTORY = 20;
export const MAX_PARALLEL = 3;
export const NOT_CHECKED = "Not checked yet.";

const MIN = 60_000;
const FIXED: Record<string, number> = { "5m": 5 * MIN, "15m": 15 * MIN, "30m": 30 * MIN, "1h": 60 * MIN };
/** A schedule: every 5, 15 or 30 minutes, hourly, or daily at an hour (daily@9). Nothing shorter than 5 minutes exists. */
export type Parsed = { every: number } | { dailyAt: number };
export function parseSchedule(s: unknown): Parsed | null {
  if (typeof s !== "string") return null;
  if (Object.hasOwn(FIXED, s)) return { every: FIXED[s] };
  const m = /^daily@(\d{1,2})$/.exec(s);
  if (m && Number(m[1]) >= 0 && Number(m[1]) <= 23) return { dailyAt: Number(m[1]) };
  return null;
}
/** The first moment after `after` this schedule is due (local time for a daily one). */
export function nextRun(s: Parsed, after: number): number {
  if ("every" in s) return after + s.every;
  const d = new Date(after);
  d.setHours(s.dailyAt, 0, 0, 0);
  if (d.getTime() <= after) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export type HistoryItem = { at: string; state: Exclude<WatchState, "paused"> | "paused" };
export type Watch = {
  id: string; project: string; kind: Kind; target: string; schedule: string; state: WatchState; since: string; reason: string;
  lastCheckedAt: string | null; alerted: boolean; history: HistoryItem[]; createdAt: string;
};

/** What a check answers: a result, null (it was stopped, which says nothing), or skip (it could not run now; try again soon). */
export type Answer = CheckResult | { skip: string } | null;
export type Checks = {
  site(target: string, signal: AbortSignal, timeoutMs: number): Promise<Answer>;
  deploy(project: string, signal: AbortSignal): Promise<Answer>;
  ci(project: string, signal: AbortSignal): Promise<Answer>;
  project(project: string, signal: AbortSignal): Promise<Answer>;
};
export type EvidenceMaker = (w: Watch, signal: AbortSignal) => Promise<string | null>;
type Emit = (e: Record<string, unknown>) => void;
export type Opts = {
  file: string; emit: Emit; checks: Checks; evidence?: EvidenceMaker;
  /** A setting's value in force (RunnerSettings.get), read each time. */
  get: (key: string) => unknown;
  now?: () => number; random?: () => number; onProblem?: (message: string) => void;
  /** The longest each kind may take before it is stopped (tests make these short). */
  timeouts?: Partial<Record<Kind, number>>;
};
const TIMEOUTS: Record<Kind, number> = { site_up: 20_000, deploy_status: 120_000, ci_status: 120_000, project_checks: 15 * MIN };
const SKIP_RETRY_MS = 2 * MIN;

const isIso = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));

type Add = Extract<Command, { type: "watch.add" }>;

export class WatchEngine {
  private watches: Watch[] = [];
  private due = new Map<string, number>();
  private running = new Map<string, { abort: AbortController; timedOut: boolean }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly timeouts: Record<Kind, number>;

  constructor(private o: Opts) {
    this.now = o.now ?? Date.now;
    this.random = o.random ?? Math.random;
    this.timeouts = { ...TIMEOUTS, ...(o.timeouts ?? {}) };
    this.load();
  }

  // ---------- the file ----------
  private load() {
    const f = this.o.file;
    let text: string;
    try { if (!existsSync(f)) return; if (!statSync(f).isFile()) throw new Error("not a file"); text = readFileSync(f, "utf8"); }
    catch { this.o.onProblem?.("Your watch list could not be read, so no watches are running."); return; }
    let j: any;
    try { j = JSON.parse(text); if (typeof j !== "object" || j === null || !Array.isArray(j.watches)) throw new Error("not a list"); }
    catch {
      try { renameSync(f, f.replace(/\.json$/, ".damaged.json")); } catch { /* it stays where it is and is written over by the next save */ }
      this.o.onProblem?.("Your watch list was damaged, so it starts empty. The old file was kept as watch.damaged.json.");
      return;
    }
    const seen = new Set<string>();
    for (const x of j.watches) {
      const w = this.sane(x);
      if (!w || seen.has(w.id) || this.watches.length >= MAX_TOTAL || this.watches.filter((y) => resolve(y.project) === resolve(w.project)).length >= MAX_PER_PROJECT) continue;
      seen.add(w.id);
      this.watches.push(w);
    }
    // Every watch is due once the engine starts if its time has passed (once, not once for each missed time), with a small stagger.
    const t = this.now();
    for (const w of this.watches) if (w.state !== "paused") this.due.set(w.id, this.firstDue(w, t));
  }
  private sane(x: any): Watch | null {
    try {
      if (typeof x !== "object" || x === null) return null;
      if (typeof x.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(x.id)) return null;
      if (typeof x.project !== "string" || !x.project) return null;
      if (!KINDS.includes(x.kind) || !parseSchedule(x.schedule) || !STATES.includes(x.state)) return null;
      let target = typeof x.target === "string" ? x.target : "";
      if (x.kind === "site_up") { const t = parseTarget(target); if (!t.ok) return null; target = t.url; } else target = "";
      const created = isIso(x.createdAt) ? x.createdAt : new Date(this.now()).toISOString();
      const history: HistoryItem[] = Array.isArray(x.history) ? x.history.filter((h: any) => isIso(h?.at) && STATES.includes(h?.state)).slice(-HISTORY).map((h: any) => ({ at: h.at, state: h.state })) : [];
      return {
        id: x.id, project: x.project, kind: x.kind, target, schedule: x.schedule, state: x.state, since: isIso(x.since) ? x.since : created,
        reason: clip(redact(typeof x.reason === "string" && x.reason ? x.reason : NOT_CHECKED), 240), lastCheckedAt: isIso(x.lastCheckedAt) ? x.lastCheckedAt : null,
        alerted: x.alerted === true && x.state === "failing", history, createdAt: created,
      };
    } catch { return null; }
  }
  private save() {
    try { writeAtomic(this.o.file, JSON.stringify({ version: 1, watches: this.watches }, null, 2) + "\n", 0o600); }
    catch { this.o.onProblem?.("Your watch list could not be saved on this Mac, so it will be lost when Companion closes."); }
  }

  // ---------- views ----------
  private view(w: Watch) {
    const due = this.due.get(w.id);
    return {
      project: w.project, watch: w.id, kind: w.kind, ...(w.target ? { target: clip(redact(w.target), 300) } : {}), schedule: w.schedule, state: w.state, since: w.since,
      reason: w.reason, ...(w.lastCheckedAt ? { lastCheckedAt: w.lastCheckedAt } : {}), ...(due !== undefined && w.state !== "paused" ? { nextAt: new Date(due).toISOString() } : {}),
      checking: this.running.has(w.id), history: w.history.slice(-HISTORY),
    };
  }
  private say(w: Watch) { this.o.emit({ type: "watch.state", ...this.view(w) }); }
  private sayList(project: string) {
    this.o.emit({ type: "watch.list", project, watches: this.in(project).map((w) => this.view(w)) });
  }
  private in(project: string): Watch[] { const p = resolve(project); return this.watches.filter((w) => resolve(w.project) === p); }
  private find(project: string, id: string): Watch | undefined { return this.in(project).find((w) => w.id === id); }
  private fail(reason: string) { this.o.emit({ type: "protocol.error", reason }); }
  /** A project's watches in the shape Where was I reads. */
  forProject(project: string): { id: string; kind: string; target?: string; state: string; since: string; reason: string; history: { at: string; state: string }[] }[] {
    return this.in(project).map((w) => ({ id: w.id, kind: w.kind, ...(w.target ? { target: w.target } : {}), state: w.state, since: w.since, reason: w.reason, history: [...w.history] }));
  }
  /** Every watch, as the engine holds them (tests). */
  all(): Watch[] { return this.watches.map((w) => ({ ...w, history: [...w.history] })); }

  // ---------- the clock ----------
  private jitter(s: Parsed): number { return Math.floor(this.random() * ("every" in s ? Math.min(60_000, s.every / 10) : 5 * MIN)); }
  private firstDue(w: Watch, t: number): number {
    const s = parseSchedule(w.schedule)!;
    const last = w.lastCheckedAt ? Date.parse(w.lastCheckedAt) : null;
    const planned = last === null ? t : nextRun(s, last);
    return planned <= t ? t + Math.floor(this.random() * 30_000) : planned + this.jitter(s);
  }
  private quiet(t: number): boolean {
    if (this.o.get("watch.quiet") !== true) return false;
    const from = Number(this.o.get("watch.quietFrom")), to = Number(this.o.get("watch.quietTo"));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;
    const h = new Date(t).getHours();
    return from < to ? h >= from && h < to : h >= from || h < to;
  }
  /** Scheduled checks run only while Flow and Watch routines are on. A check the person asks for by pressing does not need the second. */
  private scheduling(): boolean { return this.o.get("flow.on") !== false && this.o.get("watch.on") !== false; }

  // ---------- running ----------
  start(everyMs = 30_000) { this.stop(); this.timer = setInterval(() => this.tick(), everyMs); (this.timer as { unref?: () => void }).unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Starts every check that is due. Cheap: nothing runs while the schedule is off. */
  tick(): void {
    if (!this.scheduling()) return;
    const t = this.now();
    for (const w of this.watches) {
      if (this.running.size >= MAX_PARALLEL) return;
      if (w.state === "paused" || this.running.has(w.id)) continue;
      const d = this.due.get(w.id);
      if (d !== undefined && d <= t) void this.run(w);
    }
  }

  private run(w: Watch): Promise<void> {
    if (this.running.has(w.id)) return Promise.resolve();
    const abort = new AbortController();
    const slot = { abort, timedOut: false };
    this.running.set(w.id, slot);
    const limit = this.timeouts[w.kind];
    const timer = setTimeout(() => { slot.timedOut = true; abort.abort(); }, limit);
    this.say(w);
    const s = parseSchedule(w.schedule)!;
    return (async () => {
      let answer: Answer = null;
      try {
        const sig = abort.signal;
        answer = w.kind === "site_up" ? await this.o.checks.site(w.target, sig, Math.max(1, limit - 2000))
          : w.kind === "deploy_status" ? await this.o.checks.deploy(w.project, sig)
          : w.kind === "ci_status" ? await this.o.checks.ci(w.project, sig)
          : await this.o.checks.project(w.project, sig);
      } catch (e) { answer = { outcome: "unknown", reason: `The check itself stopped (${clip(redact(String((e as Error)?.message ?? e)), 80)}).` }; }
      finally { clearTimeout(timer); }
      // The watch was removed or paused while the check ran: its answer is dropped.
      if (this.running.get(w.id) !== slot) return;
      this.running.delete(w.id);
      if (!this.watches.includes(w) || w.state === "paused") return;
      const t = this.now();
      if (slot.timedOut) answer = w.kind === "site_up" ? { outcome: "failing", reason: `The site did not answer within ${Math.round(limit / 1000)} seconds.` } : { outcome: "unknown", reason: "The check took too long, so I stopped it." };
      if (answer === null) { this.due.set(w.id, nextRun(s, t) + this.jitter(s)); this.say(w); return; }   // stopped: no news about the watch
      if ("skip" in answer) { this.due.set(w.id, t + SKIP_RETRY_MS); this.say(w); return; }
      this.due.set(w.id, nextRun(s, t) + this.jitter(s));
      this.apply(w, answer, t);
    })();
  }

  /** The state machine. ok, failing or unknown; a change to failing raises one alert and nothing more until it is ok again. */
  private apply(w: Watch, r: CheckResult, t: number) {
    const at = new Date(t).toISOString();
    const changed = r.outcome !== w.state;
    w.lastCheckedAt = at;
    if (changed) { w.since = at; w.history = [...w.history, { at, state: r.outcome }].slice(-HISTORY); }
    w.state = r.outcome;
    w.reason = clip(redact(r.reason), 240) || NOT_CHECKED;
    const quiet = this.quiet(t);
    let alert: "failing" | "recovered" | null = null;
    if (r.outcome === "failing") { if (!w.alerted && !quiet) { w.alerted = true; alert = "failing"; } }
    else if (r.outcome === "ok" && w.alerted) { w.alerted = false; if (!quiet) alert = "recovered"; }
    this.save();
    this.say(w);
    if (alert) this.o.emit({ type: "watch.alert", project: w.project, watch: w.id, what: alert, kind: w.kind, ...(w.target ? { target: clip(redact(w.target), 300) } : {}), reason: w.reason, since: w.since });
  }

  /** Stop everything (and a group switched off): every running check ends. Their schedules are not touched; each is next due at its normal time. */
  stopAll() {
    for (const [id, s] of [...this.running]) {
      s.abort.abort();
      const w = this.watches.find((x) => x.id === id);
      this.running.delete(id);
      if (w) { this.due.set(id, nextRun(parseSchedule(w.schedule)!, this.now())); this.say(w); }
    }
  }
  /** Whether any check is running (tests). */
  busy(): number { return this.running.size; }
  /** Waits for the checks now running (tests, and the engine's exit). */
  async idle(): Promise<void> { for (let i = 0; i < 50 && this.running.size; i++) await new Promise((r) => setTimeout(r, 5)); }

  // ---------- the commands ----------
  handle(cmd: Command): Promise<void> | void {
    switch (cmd.type) {
      case "watch.add": return this.add(cmd);
      case "watch.list": return this.sayList(cmd.project);
      case "watch.remove": return this.remove(cmd.project, cmd.watch);
      case "watch.pause": return this.pause(cmd.project, cmd.watch, cmd.paused);
      case "watch.check": return this.checkNow(cmd.project, cmd.watch);
      case "watch.fix": return this.fix(cmd.project, cmd.watch);
      default: return;
    }
  }

  private add(cmd: Add) {
    const project = cmd.project;
    if (!existsSync(project)) { this.fail("That project folder is not there, so nothing was added."); return; }
    if (!KINDS.includes(cmd.kind)) { this.fail("That is not a kind of watch."); return; }
    const s = parseSchedule(cmd.schedule);
    if (!s) { this.fail("Choose how often to check: every 5, 15 or 30 minutes, every hour, or once a day. Nothing shorter than 5 minutes."); return; }
    let target = "";
    if (cmd.kind === "site_up") {
      const t = parseTarget(cmd.target ?? "");
      if (!t.ok) { this.fail(t.reason); return; }
      target = t.url;
    }
    if (this.in(project).length >= MAX_PER_PROJECT) { this.fail(`A project can have at most ${MAX_PER_PROJECT} watches. Remove one first.`); return; }
    if (this.watches.length >= MAX_TOTAL) { this.fail(`Companion can run at most ${MAX_TOTAL} watches in all. Remove one first.`); return; }
    if (this.in(project).some((x) => x.kind === cmd.kind && x.target === target)) { this.fail("You are already watching that."); return; }
    const t = this.now();
    const at = new Date(t).toISOString();
    const w: Watch = { id: `w_${randomBytes(5).toString("hex")}`, project, kind: cmd.kind, target, schedule: cmd.schedule, state: "unknown", since: at, reason: NOT_CHECKED, lastCheckedAt: null, alerted: false, history: [], createdAt: at };
    this.watches.push(w);
    this.due.set(w.id, t);
    this.save();
    this.sayList(project);
    // The first look happens now, so a new watch is not blank for a whole schedule. Not while scheduled checks are off.
    if (this.scheduling()) void this.run(w); else this.say(w);
  }
  private remove(project: string, id: string) {
    const w = this.find(project, id);
    if (!w) { this.fail("That watch is not there any more."); return; }
    this.running.get(id)?.abort.abort();
    this.running.delete(id);
    this.due.delete(id);
    this.watches = this.watches.filter((x) => x !== w);
    this.save();
    this.sayList(project);
  }
  private pause(project: string, id: string, paused: boolean) {
    const w = this.find(project, id);
    if (!w) { this.fail("That watch is not there any more."); return; }
    const at = new Date(this.now()).toISOString();
    if (paused && w.state !== "paused") {
      this.running.get(id)?.abort.abort();
      this.running.delete(id);
      this.due.delete(id);
      Object.assign(w, { state: "paused" as const, since: at, reason: "Paused. Nothing is checked until you resume it.", alerted: false, history: [...w.history, { at, state: "paused" as const }].slice(-HISTORY) });
    } else if (!paused && w.state === "paused") {
      Object.assign(w, { state: "unknown" as const, since: at, reason: NOT_CHECKED, history: [...w.history, { at, state: "unknown" as const }].slice(-HISTORY) });
      this.due.set(id, this.now());
    }
    this.save();
    this.say(w);
    if (!paused && w.state === "unknown" && this.scheduling()) void this.run(w);
  }
  private checkNow(project: string, id: string) {
    const w = this.find(project, id);
    if (!w) { this.fail("That watch is not there any more."); return; }
    if (w.state === "paused") { this.fail("That watch is paused. Resume it first."); return; }
    if (this.running.has(id)) { this.say(w); return; }
    return this.run(w);
  }
  private async fix(project: string, id: string) {
    const w = this.find(project, id);
    if (!w) { this.fail("That watch is not there any more."); return; }
    const ac = new AbortController();
    const slot = { abort: ac, timedOut: false };
    const key = `fix:${id}`;
    this.running.set(key, slot);
    let text: string | null = null;
    try { text = (await this.o.evidence?.(w, ac.signal)) ?? null; } catch { text = null; } finally { this.running.delete(key); }
    if (ac.signal.aborted) return;
    const body = clip(redact(text ?? w.reason), 6000);
    this.o.emit({ type: "watch.evidence", project: w.project, watch: w.id, kind: w.kind, ...(w.target ? { target: clip(redact(w.target), 300) } : {}), text: body });
  }
}
