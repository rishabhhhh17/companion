// M95, a light tutor: the kinds of problem the person has met and handled, for Learn's What you have learned and Practise
// next. Part of memory (rule 15, memory you can read and edit): it lives in the profile's own folder (memoryDir, beside
// profile.md), never in the project, is never told to Claude, and learns only from explicit signals inside Squibby: a
// practice project finished, an Explain check question answered (a wrong answer is kept as missed, only so Practise next
// can suggest it), a Your turn change of the person's own that the checks proved, and a problem a review found that a
// later change took out. Only a fix counts (kindOfTask): a feature task's question or Your turn is never noted. Each signal is a kind, a source and a day, under a hashed key so the same event
// counts once. Never words, files, paths, scores, streaks or levels (rule 16). Pause memory stops new signals too; every
// line can be forgotten, and a forgotten signal is not learned again. Delete everything removes the file (wipe.rs: memory).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic.ts";
import { FOUND_INTRO } from "../fixfound.ts";
import { REVIEW_FIX_INTRO } from "../review/sendback.ts";
import { LEARNED_KINDS, LEARNED_SOURCES, MAX_LEARNED, PRACTICE_LEARNED, type LearnedKind, type LearnedSignal, type LearnedSource } from "../../../protocol/index.ts";

export const LEARNED_FILE = "learned.json";
const DAMAGED_FILE = "learned.damaged.json";
const MAX_FORGOTTEN = 2000;

type Kept = { id: string; kind: LearnedKind; source: LearnedSource; date: string; missed?: true };
type File = { version: 1; signals: Kept[]; forgotten: string[]; damaged?: boolean };
export type NoteResult = { ok: true; added: boolean } | { ok: false; reason: string };

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The key a signal is kept under: a hash, so a project path or a checkpoint never lands in the file as it is. */
export const signalId = (key: string) => "t_" + createHash("sha256").update(key).digest("hex").slice(0, 20);
const isKind = (v: unknown): v is LearnedKind => (LEARNED_KINDS as readonly unknown[]).includes(v);
const isSource = (v: unknown): v is LearnedSource => (LEARNED_SOURCES as readonly unknown[]).includes(v);
/** One kept signal as read back: only a known kind, source and day under a key of the store's own shape, and only those
 *  fields (anything else a hand edit added is dropped, never shown or sent). */
const keptOf = (x: unknown): Kept[] => {
  const o = x as Record<string, unknown>;
  if (!o || typeof o !== "object" || typeof o.id !== "string" || !/^t_[0-9a-f]{20}$/.test(o.id) || !isKind(o.kind) || !isSource(o.source) || typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return [];
  return [{ id: o.id, kind: o.kind, source: o.source, date: o.date, ...(o.missed === true ? { missed: true as const } : {}) }];
};

export class LearnedStore {
  constructor(private o: { dir: string; paused?: () => boolean }) {}
  private file() { return join(this.o.dir, LEARNED_FILE); }

  // A file that is there but cannot be understood is kept aside once, as learned.damaged.json, and learning starts again
  // empty; it is never written over before that copy exists. Lines a hand edit added that Squibby does not know are dropped.
  private read(): File {
    const empty: File = { version: 1, signals: [], forgotten: [] };
    const f = this.file();
    if (!existsSync(f)) return empty;
    try {
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("not an object");
      return { version: 1, signals: (Array.isArray(j.signals) ? j.signals : []).flatMap(keptOf), forgotten: (Array.isArray(j.forgotten) ? j.forgotten : []).filter((x: unknown): x is string => typeof x === "string" && /^t_[0-9a-f]{20}$/.test(x)) };
    } catch {
      const keep = join(this.o.dir, DAMAGED_FILE);
      try { if (!existsSync(keep)) copyFileSync(f, keep); } catch { return { ...empty, damaged: true }; }
      return empty;
    }
  }
  private write(f: File) {
    mkdirSync(this.o.dir, { recursive: true });
    writeAtomic(this.file(), JSON.stringify({ version: 1, signals: f.signals.slice(-MAX_LEARNED), forgotten: f.forgotten.slice(-MAX_FORGOTTEN) }), 0o600);
  }

  /** What is kept, oldest first: kinds, sources and days only. */
  list(): LearnedSignal[] {
    return this.read().signals.map((s) => ({ kind: s.kind, source: s.source, date: s.date, ...(s.missed ? { missed: true as const } : {}) }));
  }

  /** One signal. `key` names the event (the same event twice counts once); it is kept only as a hash. */
  note(s: { key: string; kind: LearnedKind; source: LearnedSource; missed?: boolean }, now: Date = new Date()): NoteResult {
    if (this.o.paused?.() === true) return { ok: false, reason: "Learning is paused." };
    if (!isKind(s.kind) || !isSource(s.source) || !s.key) return { ok: false, reason: "That is not something the tutor keeps." };
    const f = this.read();
    if (f.damaged) return { ok: false, reason: "The tutor's file could not be read, so it was left alone." };
    const id = signalId(s.key);
    if (f.forgotten.includes(id)) return { ok: false, reason: "You asked me to forget that." };
    if (f.signals.some((x) => x.id === id)) return { ok: true, added: false };
    f.signals.push({ id, kind: s.kind, source: s.source, date: localDay(now), ...(s.missed ? { missed: true as const } : {}) });
    this.write(f);
    return { ok: true, added: true };
  }

  /** Erase everything learned (the Memory page's Erase for the profile). Each signal is kept as forgotten, so a practice
   *  the record still says is done is not learned again; what happens next is learned as usual. */
  clear(): void {
    const f = this.read();
    if (f.damaged || !f.signals.length) return;
    this.write({ version: 1, signals: [], forgotten: [...new Set([...f.forgotten, ...f.signals.map((s) => s.id)])] });
  }

  /** Forget one line of What you have learned (part learned), or what a Practise next suggestion was made from (part
   *  missed). The signals go, and stay forgotten. */
  forget(kind: LearnedKind, part: "learned" | "missed"): void {
    const f = this.read();
    if (f.damaged) return;
    const gone = f.signals.filter((s) => s.kind === kind && (part === "missed" ? s.missed === true : !s.missed));
    if (!gone.length) return;
    this.write({ version: 1, signals: f.signals.filter((s) => !gone.includes(s)), forgotten: [...new Set([...f.forgotten, ...gone.map((s) => s.id)])] });
  }
}

/** The kind each practice project is about (protocol PRACTICE_LEARNED), or null for an id not in the catalog. */
export const kindOfPractice = (id: unknown): LearnedKind | null => (typeof id === "string" && Object.hasOwn(PRACTICE_LEARNED, id) ? PRACTICE_LEARNED[id] : null);

/** A review reason's kind of problem, only where the problem is clear; the rest (too many files, risky places, a model's
 *  concern, house rules) are not problems a person learns from, so they give nothing. */
const REASON_KIND: Readonly<Record<string, LearnedKind>> = {
  secret_in_code: "key_in_code", key_in_page: "key_in_code", open_table: "open_table", signed_in_open: "open_table",
  weakened_check: "weakened_check", claimed_passed: "done_not_done", removed_still_used: "renamed_file",
};
export const kindOfReason = (kind: unknown): LearnedKind | null => (typeof kind === "string" && Object.hasOwn(REASON_KIND, kind) ? REASON_KIND[kind] : null);

/** Fixed rules, in order, from the words of a fix request or a failing check. Never a model. Only the kind is kept. Each
 *  rule needs an error's own words or a fix's words, never a bare mention: "a password reset page", "an /api/ route", "a
 *  link that goes to /" or "when the name is not set" are ordinary features, not problems (the M95 review). */
const RULES: [LearnedKind, RegExp][] = [
  ["renamed_file", /cannot find module|module not found|can't resolve|could not resolve|err_module_not_found|\bwas (moved|renamed|removed)\b.{0,80}\b(still uses|old name)|no such file or directory/i],
  // A setting: a named variable (in capitals) that is not set or missing, or the words of a missing environment variable.
  ["missing_setting", /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b (is )?(not set|missing|undefined|not defined)|\b(missing|undefined|unset) (env|environment) (variable|setting)|\benvironment variable\b.{0,40}\b(is )?(not set|missing|undefined)/],
  ["key_in_code", /\b(api[ _-]?key|secret key|secret|private key|access token|password|token)\b.{0,60}\b(hard ?coded|written (in|into) the code|exposed in the (code|page)|leaked)|\b(hard ?coded|written into the code)\b.{0,60}\b(key|secret|password|token)\b|\b(a )?key( or password)? is written into\b|reads a secret setting|\bsk_(live|test)_|secret_in_code/i],
  ["open_table", /row level security|\brls\b.{0,30}\b(off|missing|not (on|enabled))|anyone (can|could) read (the|this|every|all|its)\b.{0,40}\b(table|rows|data)|\btable\b.{0,40}\bopen to (anyone|everyone|strangers)/i],
  ["broken_link", /\b404\b.{0,40}\b(not found|error|missing|page is)|page not found|\bbroken link|link .{0,40}(goes nowhere|missing page|to a page that is not there)|\bis a 404\b|answered 404|returned 404/i],
  // A review's own words for a check made weaker, and for a done that the checks did not back (review/weakened.ts).
  ["weakened_check", /\bso it proves less\b|\bcan no longer fail\b|no longer proves anything|will no longer be caught|test was made to agree|\bcannot fail, so\b/i],
  ["done_not_done", /\bthe words say the checks pass\b/i],
  ["failing_request", /\b(answered|returned|responded with|status|got|gives?|error)\s*:?\s*50[0-4]\b|\b50[0-4] (error|internal|bad gateway)|internal server error|request failed|fetch failed|failed to fetch|something went wrong/i],
];
export function kindFromText(...texts: (string | undefined)[]): LearnedKind {
  const t = texts.filter((x): x is string => typeof x === "string").join("\n").slice(0, 4000);
  for (const [k, re] of RULES) if (re.test(t)) return k;
  return "other";
}

/** The quoted lines under "Problems to fix:" in a review's Fix it request (review/sendback.ts fixPrompt). */
const reviewProblems = (prompt: string): string => {
  const lines = prompt.split("\n");
  const at = lines.indexOf("Problems to fix:");
  if (at < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) { if (!l.startsWith(">")) break; out.push(l); }
  return out.join("\n");
};
/** What a task was, for the light tutor. failed: the check that failed during the task, when its proof then passed. */
export type TaskForKind = { practice?: string; mode?: string; prompt: string; label?: string; failed?: { label: string; detail: string } };
/** The kind of problem a task fixed, or null when it was not a fix (nothing is noted then). A fix is a practice, a Rescue,
 *  the fix of a problem Squibby's own check found (fixfound.ts), a review's Fix it, or a task whose proof first failed and
 *  then passed. The first four are fixes by what they are, so "other" is kept for them; for the last the failing check
 *  must name a kind, since the request itself was most likely a feature. The person's own words alone never make a fix. */
export function kindOfTask(t: TaskForKind): LearnedKind | null {
  const p = kindOfPractice(t.practice);
  if (p) return p;
  // A review's Fix it: only the problems the review named (its quoted lines), never the request's own fixed words.
  if (t.prompt.startsWith(REVIEW_FIX_INTRO)) return kindFromText(reviewProblems(t.prompt));
  if (t.mode === "rescue" || t.prompt.startsWith(FOUND_INTRO)) return kindFromText(t.prompt);
  if (t.failed) { const k = kindFromText(t.failed.label, t.failed.detail); return k === "other" ? null : k; }
  return null;
}
