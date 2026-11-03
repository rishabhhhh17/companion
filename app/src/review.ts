// M52 (F30): the review card on Home, from the engine's review events (runner/src/review/service.ts). Plain code, tested in
// review.test.ts; reviewCard.tsx only draws what this decides. The card follows one batch of changes at a time: a batch that
// grew comes again under a new id and takes the card's place, and a late event for an older batch is left out. A review
// that found something (stop, worth a look) is never replaced before the person closes it: newer changes wait behind it
// (later), with their own review if one ran, and take its place once it is closed. Nothing here
// starts work: Review them, Fix it and Looks fine are the person's presses (card.tsx sends them), and Fix it asks first.
import { REVIEW_AWAY, REVIEW_CHECKS, REVIEW_CLOSED_HOW, REVIEW_LANES, REVIEW_RATINGS, REVIEW_REASONS, REVIEW_SILENCE_LINES, REVIEW_TOUCHES, type Command, type ReviewChecks, type ReviewFile, type ReviewKeyPlace, type ReviewRating, type ReviewReason, type ReviewReasonKind, type ReviewTouch } from "../../protocol/index.ts";
import { addMemory } from "./commands.ts";
import { redact } from "../../runner/src/redact.ts";
import type { IconName } from "./icons.tsx";
import type { Stamp } from "./itemLook.ts";
import { S } from "./strings.ts";

/** The most files and reasons a card holds, whatever an event carries (the engine sends at most 50 files). */
export const MAX_FILES = 50;
export const MAX_REASONS = 20;
const MAX_NOTES = 10;
const MAX_SECRET_FILES = 20;
const MAX_TEXT = 4000;
/** A batch's name: "rv_" and 10 hex characters (the engine's batcher.ts). Anything else is not a batch. */
const BATCH = /^rv_[0-9a-f]{10}$/;
const FILE_KINDS = ["added", "modified", "deleted"];

/** What a review that ran said. */
export type ReviewDone = {
  rating: ReviewRating; touches: ReviewTouch[]; summary: string; notes: string[]; reasons: ReviewReason[];
  checks: ReviewChecks; checksNote?: string; sendBack: string; lane: (typeof REVIEW_LANES)[number]; usdEstimate: number;
  /** Why no model wrote the words (the day's limit, no Claude connected, Claude not reached). */
  note?: string;
  /** M57: the project's notes for AI tools the words were written with, by name (read as notes only). */
  ruleFiles?: string[];
  /** M57: how many smaller reasons were not shown (how strict, or a kind not to flag here). */
  hidden?: number;
  /** M57: the places of reasons that no longer hold, checked again after a newer change ("Changed since"). */
  fixed?: number[];
};
/** The card. stage: ready (changes wait to be reviewed), reviewing, or reviewed (result is there). asked: Review them was
 *  pressed and the engine has not started yet. fix: Fix it's question is open, or its task was asked for. note: one plain
 *  line from the engine about the last press (a review that did not run, a refused Fix it). */
export type ReviewCard = {
  project: string; batch: string; stage: "ready" | "reviewing" | "reviewed";
  files: ReviewFile[]; count: number; capped: boolean; secretFiles: string[]; auto: boolean; proof: boolean;
  /** Must fix 8: these changes were made while the engine was closed, or not watching this project. */
  away?: (typeof REVIEW_AWAY)[number];
  asked: boolean; fix: "confirm" | "sent" | null; note: string | null; result: ReviewDone | null;
  /** Newer changes waiting behind a review that found something, until it is closed. */
  later?: ReviewCard | null;
  /** M57: the kinds Don't flag this kind here again was pressed for on this card (saved in What I remember). */
  silenced?: ReviewReasonKind[];
  /** M57 feature 5: the instant key warning, where a key was written (file and line only), before any review ran. */
  keys?: ReviewKeyPlace[];
  /** M57 feature 1: Copy for my AI was pressed on this card, so closing it is "sent back" in History. */
  sentBack?: boolean;
};

type Ev = Record<string, unknown> & { type?: string };

const str = (v: unknown, max = MAX_TEXT): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const isBatch = (v: unknown): v is string => typeof v === "string" && BATCH.test(v);
const isProject = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const whole = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const strings = (v: unknown, max: number): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]).slice(0, max).map((x) => x.slice(0, MAX_TEXT)) : null);
function filesOf(v: unknown): ReviewFile[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every((f) => !!f && typeof f === "object" && typeof (f as ReviewFile).file === "string" && (f as ReviewFile).file.length > 0 && FILE_KINDS.includes((f as ReviewFile).kind));
  return ok ? (v as ReviewFile[]).slice(0, MAX_FILES).map((f) => ({ file: f.file.slice(0, 1000), kind: f.kind })) : null;
}
function reasonsOf(v: unknown): ReviewReason[] | null {
  if (!Array.isArray(v)) return null;
  const out: ReviewReason[] = [];
  for (const r of v as Record<string, unknown>[]) {
    if (!r || typeof r !== "object" || !(REVIEW_REASONS as readonly string[]).includes(r.kind as string) || typeof r.say !== "string" || !r.say) return null;
    const line = typeof r.line === "number" && Number.isInteger(r.line) && r.line >= 1 ? r.line : undefined;
    out.push({ kind: r.kind as ReviewReason["kind"], say: r.say.slice(0, MAX_TEXT), ...(typeof r.file === "string" && r.file ? { file: r.file.slice(0, 1000) } : {}), ...(line ? { line } : {}) });
  }
  return out.slice(0, MAX_REASONS);
}

/** M57 feature 5: the instant key warning's places, a file from the project folder down and a line from 1, at most 10.
 *  Anything else, and the whole list is left out. */
function keysOf(v: unknown): ReviewKeyPlace[] | undefined {
  if (!Array.isArray(v) || !v.length || v.length > 10) return undefined;
  const ok = v.every((k) => {
    const o = k as Record<string, unknown> | null;
    const f = o?.file;
    return !!o && typeof o === "object" && typeof f === "string" && f.length > 0 && f.length <= 1000 && !f.startsWith("/") && !f.includes("\\") && !f.split("/").some((x) => x === ".." || x === "")
      && typeof o.line === "number" && Number.isInteger(o.line) && o.line >= 1;
  });
  return ok ? (v as ReviewKeyPlace[]).map((k) => ({ file: k.file, line: k.line })) : undefined;
}

/** What a review that ran said, or null when the event does not keep to the protocol (an unknown rating, touch or check). */
function doneOf(e: Ev): (ReviewDone & { files: ReviewFile[]; count: number; capped: boolean; secretFiles: string[] }) | null {
  if (!(REVIEW_RATINGS as readonly string[]).includes(e.rating as string)) return null;
  if (!(REVIEW_CHECKS as readonly string[]).includes(e.checks as string)) return null;
  if (!Array.isArray(e.touches) || !e.touches.every((t) => (REVIEW_TOUCHES as readonly string[]).includes(t as string))) return null;
  const files = filesOf(e.files), reasons = reasonsOf(e.reasons), notes = strings(e.notes ?? [], MAX_NOTES), summary = str(e.summary), sendBack = str(e.sendBack, 20_000);
  if (!files || !reasons || !notes || summary === null || sendBack === null) return null;
  const lane = (REVIEW_LANES as readonly string[]).includes(e.lane as string) ? (e.lane as ReviewDone["lane"]) : "none";
  const checksNote = str(e.checksNote), note = str(e.note);
  const ruleFiles = strings(e.ruleFiles, 10), hidden = whole(e.hidden);
  return {
    rating: e.rating as ReviewRating, touches: [...new Set(e.touches as ReviewTouch[])], summary, notes, reasons, checks: e.checks as ReviewChecks,
    ...(checksNote ? { checksNote } : {}), sendBack, lane, usdEstimate: typeof e.usdEstimate === "number" && e.usdEstimate >= 0 ? e.usdEstimate : 0, ...(note ? { note } : {}),
    ...(ruleFiles?.length ? { ruleFiles: ruleFiles.map((f) => f.slice(0, 200)) } : {}), ...(hidden ? { hidden } : {}),
    files, count: whole(e.count) ?? files.length, capped: e.capped === true, secretFiles: strings(e.secretFiles ?? [], MAX_SECRET_FILES) ?? [],
  };
}

const fresh = (project: string, batch: string): ReviewCard => ({ project, batch, stage: "ready", files: [], count: 0, capped: false, secretFiles: [], auto: false, proof: false, asked: false, fix: null, note: null, result: null, later: null });
const norm = (p: string) => p.replace(/\/+$/, "");

/** A review that found something and is not closed yet: newer changes wait behind it instead of taking its place. */
const warns = (r: ReviewCard | null): r is ReviewCard => !!r && r.stage === "reviewed" && !!r.result && r.result.rating !== "safe";

/** The card after one event (an engine event or the page's own ui.review* press). Returns the same card when nothing
 *  changes, and null when there is no card (closed, never opened, or its changes went away). */
export function reviewReduce(r: ReviewCard | null, e: Ev): ReviewCard | null {
  if (warns(r) && isProject(e.project) && isBatch(e.batch) && e.batch !== r.batch) {
    // The newer batch is said first; its review's start and result follow it. Anything else for another batch is late.
    const ours = e.type === "review.batch" || ((e.type === "review.started" || e.type === "review.result") && r.later?.batch === e.batch);
    if (!ours) return e.type === "review.batch" || e.type === "review.started" || e.type === "review.result" ? r : reduceOne(r, e);
    const later = reduceOne(r.later ?? null, e);
    return later === (r.later ?? null) ? r : { ...r, later };
  }
  return reduceOne(r, e);
}

function reduceOne(r: ReviewCard | null, e: Ev): ReviewCard | null {
  switch (e.type) {
    case "review.batch": {
      if (!isProject(e.project) || !isBatch(e.batch)) return r;
      const files = filesOf(e.files), count = whole(e.count), secretFiles = strings(e.secretFiles ?? [], MAX_SECRET_FILES);
      if (!files || count === null || !secretFiles) return r;
      // count 0: the changes went away again. Only the card's own batch closes (or none is opened).
      if (count === 0) return !r || r.batch === e.batch ? null : r;
      const same = r?.batch === e.batch;
      const base = same ? r! : fresh(e.project, e.batch);
      const away = (REVIEW_AWAY as readonly unknown[]).includes(e.away) ? (e.away as ReviewCard["away"]) : undefined;
      const keys = keysOf(e.keys);
      const { away: _was, keys: _k, ...rest } = base;
      return { ...rest, project: e.project, files, count, capped: e.capped === true, secretFiles, auto: e.auto === true, ...(away ? { away } : {}), ...(keys ? { keys } : {}) };
    }
    case "review.started": {
      if (!isProject(e.project) || !isBatch(e.batch)) return r;
      if (r && r.batch !== e.batch) return r;
      const base = r ?? fresh(e.project, e.batch);
      return { ...base, stage: "reviewing", proof: e.proof === true, asked: false, note: null };
    }
    case "review.result": {
      if (!isProject(e.project)) return r;
      if (e.ok !== true) {
        const reason = str(e.reason, 500);
        if (!r || !reason) return r;
        if (e.batch !== undefined && e.batch !== r.batch) return r;
        return { ...r, stage: r.result ? "reviewed" : "ready", asked: false, note: reason };
      }
      if (!isBatch(e.batch)) return r;
      if (r && r.batch !== e.batch) return r;
      const d = doneOf(e);
      if (!d) return r;
      const { files, count, capped, secretFiles, ...result } = d;
      const base = r ?? fresh(e.project, e.batch);
      return { ...base, stage: "reviewed", files, count, capped, secretFiles, asked: false, fix: null, note: null, result };
    }
    // M57 feature 4: the rules looked again after a newer change. The places that no longer hold are marked; a card with
    // nothing left closes, and the newer review waiting behind it (later) takes its place.
    case "review.recheck": {
      if (!r?.result || !isProject(e.project) || norm(e.project) !== norm(r.project) || e.batch !== r.batch) return r;
      const n = r.result.reasons.length;
      if (!Array.isArray(e.fixed) || !e.fixed.length || !e.fixed.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n)) return r;
      if (e.closed === true) return r.later ?? null;
      return { ...r, result: { ...r.result, fixed: [...new Set([...(r.result.fixed ?? []), ...(e.fixed as number[])])].sort((a, b) => a - b) } };
    }
    // M57 feature 7: Don't flag this kind here again was pressed (card.tsx sends the memory line).
    case "ui.reviewSilenced": {
      if (!r || e.batch !== r.batch || !REVIEW_SILENCE_LINES[e.kind as ReviewReasonKind]) return r;
      const k = e.kind as ReviewReasonKind;
      return (r.silenced ?? []).includes(k) ? r : { ...r, silenced: [...(r.silenced ?? []), k] };
    }
    // M57 feature 1: Copy for my AI was pressed (and the text reached the clipboard).
    case "ui.reviewSentBack": return r && e.batch === r.batch && r.result && !r.sentBack ? { ...r, sentBack: true } : r;
    // The person's presses on the card (card.tsx), each naming the card's batch.
    case "ui.reviewAsked": return r && e.batch === r.batch ? { ...r, asked: true, note: null } : r;
    case "ui.reviewFixAsked": return r && e.batch === r.batch && canFix(r) ? { ...r, fix: "confirm", note: null } : r;
    case "ui.reviewFixCancelled": return r?.fix === "confirm" ? { ...r, fix: null } : r;
    case "ui.reviewFixSent": return r && r.fix === "confirm" && e.batch === r.batch ? { ...r, fix: "sent" } : r;
    case "ui.reviewDismissed": return r && e.batch === r.batch ? (r.later ?? null) : r;
    // The shell did not take a press (the group was switched off, the engine stopped): the card stops waiting and says why.
    case "ui.reviewRefused": return r && e.batch === r.batch ? { ...r, asked: false, fix: null, note: str(e.reason, 500) || S.review.notSent } : r;
    // Fix it's task started: the task's own card (its steps, its receipt with Undo) takes over.
    case "agent.state": return r?.fix === "sent" && (e.state === "thinking" || e.state === "working") ? null : r;
    case "protocol.error": return r && e.failed === "review.fix" ? { ...r, fix: null, note: str(e.reason, 500) || null } : r;
    // At the plan's limit the limit card says so; the review card only stops waiting.
    case "plan.limit": return r?.fix && e.command === "review.fix" ? { ...r, fix: null } : r;
    case "app.stop_everything": return r && (r.asked || r.fix) ? { ...r, asked: false, fix: null } : r;
    case "ui.projectChanged": return !r || (typeof e.project === "string" && norm(e.project) === norm(r.project)) ? r : null;
    case "runner.hello": case "app.runner_down": return null;
    default: return r;
  }
}

/** Whether Home draws the card: for the open folder only, with reviews not off and Flow on. */
export function reviewShown(r: ReviewCard | null | undefined, folder: string, mode: unknown, flowOn: boolean): r is ReviewCard {
  return !!r && !!folder && norm(folder) === norm(r.project) && mode !== "off" && flowOn;
}

/** M55 (the character reacts): changes wait for the person: the card offers Review them and it has not been pressed. Not
 *  while the review runs or once it is in, and never for a card that is not shown (the caller checks reviewShown). */
export function changesWait(r: ReviewCard | null | undefined): boolean {
  return !!r && r.stage === "ready" && !r.asked;
}

/** Fix it is offered after a review that ran and found something, and only once. */
export function canFix(r: ReviewCard | null | undefined): boolean {
  if (!r?.result || r.stage !== "reviewed" || r.fix === "sent") return false;
  return r.result.rating !== "safe" || r.result.reasons.length > 0;
}

/** The text Send back to my AI copies: the engine's ready message, with anything that looks like a key hidden again. */
export function sendBackCopy(r: ReviewCard | null | undefined): string {
  const t = r?.result?.sendBack;
  return t ? redact(t) : "";
}

export type Tone = "good" | "mixed" | "bad";
const RATING_ICON: Record<ReviewRating, IconName> = { safe: "shield", worth_a_look: "warn", stop: "halt" };
const RATING_TONE: Record<ReviewRating, Tone> = { safe: "good", worth_a_look: "mixed", stop: "bad" };
/** A rating's words, its own drawing and its tone. The words and the drawing carry it; the colour is never the only sign. */
export function ratingLook(k: ReviewRating): { words: string; line: string; icon: IconName; tone: Tone } {
  return { words: S.review.rating[k], line: S.review.ratingLine[k], icon: RATING_ICON[k], tone: RATING_TONE[k] };
}

/** The project's checks as a chip: passed and failed are marks; not run and could not tell are dashed. */
export function checksLook(c: ReviewChecks): { label: string; kind: "pass" | "fail" | "notRun" } {
  return { label: S.review.checks[c], kind: c === "passed" ? "pass" : c === "failed" ? "fail" : "notRun" };
}

/** M57 feature 5: the instant key warning shows: a key was written into the code, and no review has run on it yet (once
 *  one has, its own reasons say it). */
export function keyWarned(r: ReviewCard | null | undefined): r is ReviewCard {
  return !!r && !r.result && r.stage !== "reviewed" && (r.keys?.length ?? 0) > 0;
}

/** M57 feature 1: how a closed card was closed, for its row in History. Nothing for a batch skipped before any review. */
export function dismissHow(r: ReviewCard | null | undefined): (typeof REVIEW_CLOSED_HOW)[number] | undefined {
  if (!r?.result) return undefined;
  return r.sentBack ? "sentBack" : "looksFine";
}

/** The review's badge in the list on the left: working while it runs, needs you on a stop or worth a look, else new. */
export function reviewStamp(r: ReviewCard): Stamp {
  if (r.stage === "reviewing" || r.asked || r.fix === "sent") return "working";
  if (r.result && r.result.rating !== "safe") return "needsYou";
  if (keyWarned(r)) return "needsYou";
  return "new";
}

/** A reason's sentence already names its file, so its place in mono under it would say it twice (the audit, item 53). */
export function placeSaid(r: { say: string; file?: string | null; line?: number | null }): boolean {
  const name = (r.file ?? "").split("/").filter(Boolean).at(-1) ?? "";
  return !!name && r.say.includes(name);
}

/** M57 feature 4: the reason at this place no longer holds after a newer change. */
export function fixedSince(r: ReviewCard | null | undefined, i: number): boolean {
  return !!r?.result?.fixed?.includes(i);
}

/** M57 feature 7: Don't flag this kind here again is offered on a worth a look reason of a kind it may silence (the
 *  protocol's REVIEW_SILENCE_LINES): never on a key, a settings or key file, open data or a Fix this first, never on one
 *  that no longer holds, and once pressed, not again. */
export function silenceOffered(r: ReviewCard | null | undefined, i: number): boolean {
  const x = r?.result?.reasons[i];
  return !!x && r!.stage === "reviewed" && !!REVIEW_SILENCE_LINES[x.kind] && !fixedSince(r, i) && !(r!.silenced ?? []).includes(x.kind);
}

/** The memory line that silences a kind in this project, with its source (What I remember shows both and can forget it).
 *  Null for a kind that may never be silenced. */
export function silenceCommand(project: string, kind: ReviewReasonKind): Command | null {
  const line = REVIEW_SILENCE_LINES[kind];
  return line ? addMemory(project, "project", line, S.review.silenceSource) : null;
}
