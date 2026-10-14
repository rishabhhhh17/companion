// Walkthroughs: a lesson is a plain data file (steps, what to look for, how to prove each step worked), checked hard
// before it is used. A walkthrough keeps a progress log, checks the real result after each step, never shows a step
// that just failed again, and picks up where it left off after a pause. The runner decides; the app draws the ring and
// notices the click (mouse position and button only), exactly as in Your turn.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { isEnvFile } from "./diagram.ts";
import { envNames } from "./proof/intake.ts";

export const MAX_STEPS = 15;

export type Check =
  | { kind: "ask" }
  | { kind: "env_name"; name: string }
  | { kind: "file_exists"; path: string }
  | { kind: "file_contains"; path: string; text: string };
export type Way = { say: string; find: string };
export type Step = Way & { id: string; check: Check; instead?: Way };
// draft: written from the maker's own docs, not tried by a person yet. tried: someone walked it on a real screen.
export type LessonStatus = "draft" | "tried";
export type Lesson = { id: string; title: string; app: string; goal: string; status: LessonStatus; steps: Step[] };
export type Checker = (c: Check) => Promise<boolean>;

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const plain = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s.length <= max && !/[<>\u0000-\u001f\u007f]/.test(s) ? s : null;
};
const relPath = (v: unknown): string | null => {
  const s = plain(v, 160);
  if (!s || s.startsWith("/") || s.startsWith("~") || /(^|[\\/])\.\.([\\/]|$)/.test(s) || s.includes("\\")) return null;
  return s;
};

function parseWay(w: any, what: string): { ok: true; way: Way } | { ok: false; error: string } {
  const say = plain(w?.say, 200), find = plain(w?.find, 120);
  if (!say) return { ok: false, error: `${what}: "say" must be plain words (up to 200 letters)` };
  if (!find) return { ok: false, error: `${what}: "find" must be plain words (up to 120 letters)` };
  return { ok: true, way: { say, find } };
}

function parseCheck(c: any, what: string): { ok: true; check: Check } | { ok: false; error: string } {
  switch (c?.kind) {
    case "ask": return { ok: true, check: { kind: "ask" } };
    case "env_name": return /^[A-Z][A-Z0-9_]{1,63}$/.test(c.name) ? { ok: true, check: { kind: "env_name", name: c.name } } : { ok: false, error: `${what}: a setting name is capital letters, digits and underscores` };
    case "file_exists": { const p = relPath(c.path); return p ? { ok: true, check: { kind: "file_exists", path: p } } : { ok: false, error: `${what}: a file check needs a path inside the project` }; }
    case "file_contains": {
      const p = relPath(c.path), t = plain(c.text, 120);
      if (!p || !t) return { ok: false, error: `${what}: a file check needs a path inside the project and the words to look for` };
      if (isEnvFile(p)) return { ok: false, error: `${what}: settings and key files are never read` };
      return { ok: true, check: { kind: "file_contains", path: p, text: t } };
    }
    default: return { ok: false, error: `${what}: unknown check "${String(c?.kind)}"` };
  }
}

export function parseLesson(raw: unknown): { ok: true; lesson: Lesson } | { ok: false; error: string } {
  const r = raw as any;
  if (!r || typeof r !== "object" || Array.isArray(r)) return { ok: false, error: "a lesson is an object" };
  const id = typeof r.id === "string" && ID.test(r.id) ? r.id : null, title = plain(r.title, 80), app = plain(r.app, 60), goal = plain(r.goal, 200);
  if (!id) return { ok: false, error: 'the lesson needs an "id" (letters, digits, - and _)' };
  if (!title || !app || !goal) return { ok: false, error: 'the lesson needs plain "title", "app" and "goal"' };
  if (!Array.isArray(r.steps) || r.steps.length === 0) return { ok: false, error: "the lesson needs at least one step" };
  if (r.steps.length > MAX_STEPS) return { ok: false, error: `a lesson has at most ${MAX_STEPS} steps` };
  const steps: Step[] = [];
  for (const [i, s] of r.steps.entries()) {
    const what = `step ${i + 1}`;
    if (typeof s?.id !== "string" || !ID.test(s.id)) return { ok: false, error: `${what}: needs an "id"` };
    if (steps.some((x) => x.id === s.id)) return { ok: false, error: `${what}: the id "${s.id}" is used twice` };
    const way = parseWay(s, what); if (!way.ok) return way;
    const check = parseCheck(s.check ?? { kind: "ask" }, what); if (!check.ok) return check;
    let instead: Way | undefined;
    if (s.instead !== undefined) { const w = parseWay(s.instead, `${what} instead`); if (!w.ok) return w; instead = w.way; }
    steps.push({ id: s.id, ...way.way, check: check.check, ...(instead ? { instead } : {}) });
  }
  if (r.status !== undefined && r.status !== "draft" && r.status !== "tried") return { ok: false, error: 'the "status" is "draft" or "tried"' };
  return { ok: true, lesson: { id, title, app, goal, status: r.status === "tried" ? "tried" : "draft", steps } };
}

/** Every lesson file in these folders (the first folder wins when an id repeats). Bad files are named, never fatal. */
export function loadLessons(dirs: string[]): { lessons: Lesson[]; problems: { file: string; error: string }[] } {
  const lessons: Lesson[] = [], problems: { file: string; error: string }[] = [];
  for (const dir of dirs) {
    let names: string[]; try { names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort(); } catch { continue; }
    for (const n of names) {
      try {
        const p = join(dir, n);
        if (statSync(p).size > 100_000) { problems.push({ file: n, error: "the file is too big" }); continue; }
        const r = parseLesson(JSON.parse(readFileSync(p, "utf8")));
        if (!r.ok) problems.push({ file: n, error: r.error });
        else if (!lessons.some((l) => l.id === r.lesson.id)) lessons.push(r.lesson);
      } catch { problems.push({ file: n, error: "the file could not be read as a lesson" }); }
    }
  }
  return { lessons, problems };
}

export type Outcome = "clicked" | "done_for_you" | "passed" | "failed" | "skipped" | "asked_yes" | "asked_no" | "already_done";
export type LogEntry = { step: string; outcome: Outcome; at: string };
export type Progress = { version: 1; shape: string; lesson: string; project: string; index: number; log: LogEntry[]; failed: string[]; usedInstead: string[]; blocked: string | null; done: boolean };
export type Settled = "advance" | "done" | "instead" | "help" | "stopped";

export class Walkthrough {
  private p: Progress;
  private stopped = false;
  constructor(private lesson: Lesson, saved: Progress | null, private o: { now: () => string; project: string }) {
    const shape = lesson.steps.map((x) => x.id).join(",");
    const goodLog = (l: unknown) => !!l && typeof l === "object" && typeof (l as LogEntry).step === "string" && typeof (l as LogEntry).outcome === "string" && typeof (l as LogEntry).at === "string";
    // Saved progress counts only for this very lesson, this project and this list of steps (a changed lesson starts over).
    const ok = saved && saved.version === 1 && saved.shape === shape && saved.lesson === lesson.id && saved.project === o.project && Array.isArray(saved.log) && saved.log.every(goodLog) && Array.isArray(saved.failed) && Array.isArray(saved.usedInstead) && Number.isInteger(saved.index) && saved.index >= 0;
    const n = lesson.steps.length;
    this.p = ok
      ? { version: 1, shape, lesson: lesson.id, project: o.project, index: Math.min(saved.index, n), log: saved.log.slice(-200), failed: saved.failed.filter((x) => typeof x === "string"), usedInstead: saved.usedInstead.filter((x) => typeof x === "string"), blocked: typeof saved.blocked === "string" ? saved.blocked : null, done: saved.done === true || saved.index >= n }
      : { version: 1, shape, lesson: lesson.id, project: o.project, index: 0, log: [], failed: [], usedInstead: [], blocked: null, done: false };
  }

  progress(): Progress { return JSON.parse(JSON.stringify(this.p)); }
  private get step(): Step | null { return this.stopped || this.p.done || this.p.blocked ? null : this.lesson.steps[this.p.index] ?? null; }
  private log(step: string, outcome: Outcome) { this.p.log.push({ step, outcome, at: this.o.now() }); if (this.p.log.length > 200) this.p.log.shift(); }

  /** What to show now: the step's words and what to look for. Null when finished, stopped, or waiting for words from help. */
  current(): { index: number; total: number; variant: "main" | "instead"; step: { id: string; say: string; find: string; check: Check } } | null {
    const s = this.step; if (!s) return null;
    const instead = this.p.usedInstead.includes(s.id) && s.instead;
    return { index: this.p.index, total: this.lesson.steps.length, variant: instead ? "instead" : "main", step: { id: s.id, say: instead ? s.instead!.say : s.say, find: instead ? s.instead!.find : s.find, check: s.check } };
  }
  /** "ask" when only the person can say whether the step worked; "verify" when the project can prove it. */
  needs(): "ask" | "verify" | null { const s = this.step; return s ? (s.check.kind === "ask" ? "ask" : "verify") : null; }

  private advance(): Settled {
    this.p.index++;
    if (this.p.index >= this.lesson.steps.length) { this.p.done = true; return "done"; }
    return "advance";
  }
  private fail(s: Step): Settled {
    const instead = this.p.usedInstead.includes(s.id);
    this.p.failed.push(instead ? `${s.id}:instead` : s.id);
    this.log(s.id, "failed");
    if (!instead && s.instead) { this.p.usedInstead.push(s.id); return "instead"; }
    this.p.blocked = s.id;   // nothing is shown again; the person gets words
    return "help";
  }

  /** Is this the step a command was meant for? A late command for an earlier step is dropped. */
  at(index?: number): boolean { return index === undefined || index === this.p.index; }

  /** The person clicked (or it was clicked for them): prove the real result, then move on, try the other way, or ask for words. */
  async settle(how: "clicked" | "done_for_you", check: Checker): Promise<Settled> {
    const s = this.step; if (!s) return this.p.blocked ? "help" : "stopped";
    this.log(s.id, how);
    let ok = false;
    try { ok = (await check(s.check)) === true; } catch { ok = false; }
    if (this.stopped) return "stopped";
    if (!ok) return this.fail(s);
    this.log(s.id, "passed");
    return this.advance();
  }
  /** The person's own answer to "did that work?". */
  async answer(worked: boolean): Promise<Settled> {
    const s = this.step; if (!s) return this.p.blocked ? "help" : "stopped";
    if (!worked) { this.log(s.id, "asked_no"); return this.fail(s); }
    this.log(s.id, "asked_yes");
    return this.advance();
  }
  skip() {
    if (this.stopped || this.p.done) return;
    const s = this.p.blocked ? this.lesson.steps[this.p.index] : this.step;   // after words only, the person says they did it themselves
    if (!s) return;
    this.p.blocked = null; this.log(s.id, "skipped"); this.advance();
  }
  stop() { this.stopped = true; }

  /** After a pause: steps the project can prove are looked at again. A finished step that has come undone is shown
   *  again (not a failure); steps done while away are skipped; a step that failed before stays blocked. */
  async resume(check: Checker): Promise<void> {
    if (this.stopped || this.p.blocked || this.p.done) return;
    const prove = async (s: Step) => { if (s.check.kind === "ask") return null; try { return (await check(s.check)) === true; } catch { return false; } };
    for (let i = 0; i < this.p.index; i++) {
      const s = this.lesson.steps[i];
      if (!this.p.log.some((l) => l.step === s.id && (l.outcome === "passed" || l.outcome === "already_done"))) continue;
      if ((await prove(s)) === false) { this.p.index = i; this.p.usedInstead = this.p.usedInstead.filter((x) => x !== s.id); return; }
    }
    while (this.p.index < this.lesson.steps.length) {
      const s = this.lesson.steps[this.p.index];
      if ((await prove(s)) !== true) break;
      this.log(s.id, "already_done");
      this.advance();
    }
  }
}

/** Saves a walkthrough's place. Only step ids, outcomes and times: never what was on the screen. */
export class FileWalkStore {
  constructor(private dir: string) {}
  private file(project: string, lesson: string) { return join(this.dir, createHash("sha256").update(`${project}\n${lesson}`).digest("hex").slice(0, 24) + ".json"); }
  save(project: string, p: Progress) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const f = this.file(project, p.lesson), tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(p), { mode: 0o600 }); renameSync(tmp, f);
  }
  load(project: string, lesson: string): Progress | null {
    try {
      const p = JSON.parse(readFileSync(this.file(project, lesson), "utf8"));
      return p && p.version === 1 && p.lesson === lesson && p.project === project && Array.isArray(p.log) ? p as Progress : null;
    } catch { return null; }
  }
  forget(project: string, lesson: string) { try { rmSync(this.file(project, lesson), { force: true }); } catch { /* nothing to forget */ } }
}

/** Proves a step from the project itself. Setting names only (never values); files only inside the project, never a
 *  settings or key file's contents, never through a link that leads out. */
export function projectChecker(project: string): Checker {
  return async (c) => {
    const root = realpathSync(project);
    const inside = (rel: string): string | null => {
      try { const real = realpathSync(join(root, rel)); return real.startsWith(root + sep) ? real : null; } catch { return null; }
    };
    switch (c.kind) {
      case "env_name": {
        for (const f of [".env", ".env.local", ".env.development", ".env.development.local"]) {
          const p = inside(f); if (!p) continue;
          try { if (statSync(p).size < 200_000 && envNames(readFileSync(p, "utf8")).includes(c.name)) return true; } catch { /* unreadable */ }
        }
        return false;
      }
      case "file_exists": { const p = inside(c.path); return !!p && existsSync(p); }
      case "file_contains": {
        const p = inside(c.path);
        if (!p || isEnvFile(c.path) || isEnvFile(p)) return false;
        try { const st = statSync(p); return st.isFile() && st.size <= 400_000 && readFileSync(p, "utf8").includes(c.text); } catch { return false; }
      }
      default: return false;
    }
  };
}
