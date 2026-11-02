// M52 (F30): the review card on Home, from the engine's review events (runner/src/review/service.ts). Plain code, tested in
// review.test.ts; reviewCard.tsx only draws what this decides. The card follows one batch of changes at a time: a batch that
// grew comes again under a new id and takes the card's place, and a late event for an older batch is left out. A review
// that found something (stop, worth a look) is never replaced before the person closes it: newer changes wait behind it
// (later), with their own review if one ran, and take its place once it is closed. Nothing here
// starts work: Review them, Fix it and Looks fine are the person's presses (card.tsx sends them), and Fix it asks first.
import { REVIEW_CHECKS, REVIEW_LANES, REVIEW_RATINGS, REVIEW_REASONS, REVIEW_TOUCHES, type ReviewChecks, type ReviewFile, type ReviewRating, type ReviewReason, type ReviewTouch } from "../../protocol/index.ts";
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
};
/** The card. stage: ready (changes wait to be reviewed), reviewing, or reviewed (result is there). asked: Review them was
 *  pressed and the engine has not started yet. fix: Fix it's question is open, or its task was asked for. note: one plain
 *  line from the engine about the last press (a review that did not run, a refused Fix it). */
export type ReviewCard = {
  project: string; batch: string; stage: "ready" | "reviewing" | "reviewed";
  files: ReviewFile[]; count: number; capped: boolean; secretFiles: string[]; auto: boolean; proof: boolean;
  asked: boolean; fix: "confirm" | "sent" | null; note: string | null; result: ReviewDone | null;
  /** Newer changes waiting behind a review that found something, until it is closed. */
  later?: ReviewCard | null;
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

/** What a review that ran said, or null when the event does not keep to the protocol (an unknown rating, touch or check). */
function doneOf(e: Ev): (ReviewDone & { files: ReviewFile[]; count: number; capped: boolean; secretFiles: string[] }) | null {
  if (!(REVIEW_RATINGS as readonly string[]).includes(e.rating as string)) return null;
  if (!(REVIEW_CHECKS as readonly string[]).includes(e.checks as string)) return null;
  if (!Array.isArray(e.touches) || !e.touches.every((t) => (REVIEW_TOUCHES as readonly string[]).includes(t as string))) return null;
  const files = filesOf(e.files), reasons = reasonsOf(e.reasons), notes = strings(e.notes ?? [], MAX_NOTES), summary = str(e.summary), sendBack = str(e.sendBack, 20_000);
  if (!files || !reasons || !notes || summary === null || sendBack === null) return null;
  const lane = (REVIEW_LANES as readonly string[]).includes(e.lane as string) ? (e.lane as ReviewDone["lane"]) : "none";
  const checksNote = str(e.checksNote), note = str(e.note);
  return {
    rating: e.rating as ReviewRating, touches: [...new Set(e.touches as ReviewTouch[])], summary, notes, reasons, checks: e.checks as ReviewChecks,
    ...(checksNote ? { checksNote } : {}), sendBack, lane, usdEstimate: typeof e.usdEstimate === "number" && e.usdEstimate >= 0 ? e.usdEstimate : 0, ...(note ? { note } : {}),
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
      return { ...base, project: e.project, files, count, capped: e.capped === true, secretFiles, auto: e.auto === true };
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

/** The review's badge in the list on the left: working while it runs, needs you on a stop or worth a look, else new. */
export function reviewStamp(r: ReviewCard): Stamp {
  if (r.stage === "reviewing" || r.asked || r.fix === "sent") return "working";
  if (r.result && r.result.rating !== "safe") return "needsYou";
  return "new";
}

/** A reason's sentence already names its file, so its place in mono under it would say it twice (the audit, item 53). */
export function placeSaid(r: { say: string; file?: string | null; line?: number | null }): boolean {
  const name = (r.file ?? "").split("/").filter(Boolean).at(-1) ?? "";
  return !!name && r.say.includes(name);
}
