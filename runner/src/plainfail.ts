// One plain sentence for every failure from Squibby's own machinery (M15 wave 2): saving or reading an undo point, starting
// the helper that runs Claude, a mode that does not offer something. The person reads the sentence; the raw detail (an
// error name, a git line, a path) goes in its own `detail` field, which the shell takes off the event and writes to the log
// (app/src-tauri/src/runner.rs take_detail), so it is kept for a report and never shown.
import { PRODUCT } from "./names.ts";
import { clip, redact } from "./redact.ts";

export type FailKind = "undoPoint" | "undoRestore" | "undoGone" | "helperStart" | "notHere" | "other";

export const FAIL_WORDS: Record<FailKind, string> = {
  undoPoint: `${PRODUCT} could not save an undo point for this folder, so nothing was changed. Try again.`,
  undoRestore: `${PRODUCT} could not put the files back from the undo point. Try again.`,
  undoGone: "That undo point is not there any more, so nothing was put back.",
  helperStart: `${PRODUCT} could not start the helper that runs Claude. Quit and open ${PRODUCT} again.`,
  notHere: "That is not available here yet.",
  other: `Something went wrong inside ${PRODUCT}. Try again, and if it keeps happening, report a problem from Settings.`,
};

/** Which kind of failure a raw detail is, from its words alone. */
export function failKind(detail: string): FailKind {
  const d = String(detail ?? "");
  if (/Unknown checkpoint/i.test(d)) return "undoGone";
  if (/\bgit\b[^\n]*\bfailed\b|shadow store|checkpoint/i.test(d)) return "undoPoint";
  if (/\bspawn\b|ENOENT|EACCES[^\n]*claude|claude (binary|executable)|could not start the (engine|runner|helper)/i.test(d)) return "helperStart";
  if (/not available in this mode/i.test(d)) return "notHere";
  return "other";
}

// Reasons the page turns into its own words (app/src/model.ts plainError, claudeStopWords): passed on untouched.
const PAGE_CODES = /^(?:engine error:\s*)?(?:no_connection|claude_busy|claude_stopped:|daily_limit)|error_max_budget_usd|error_max_turns|Not connected:|unknown approval/i;
// The same test the page uses for a sentence written for a person (model.ts WRITTEN_FOR_A_PERSON): a capital first, a full
// stop last, and no error name, path, code or machine word.
const LOOKS_TECHNICAL = /(\b[A-Z][A-Za-z]*(Error|Exception)\b|\bE[A-Z]{3,}\b|\bat \/|\.(ts|js|tsx|rs):\d|\bundefined\b|\bnull\b|\bNaN\b|\[object|\bstack\b|\bgit [a-z-]+ failed|\bexit(ed)? (code|with)\b|\bstderr\b)/;
const MACHINE_WORDS = /\b(checkpoints?|shadow store|agent\.[a-z]+|the engine|hooks?|SDK|stderr|exit code)\b/i;
const WRITTEN_FOR_A_PERSON = (r: string) => /^[A-Z][^\n]{10,320}[.!?)]$/.test(r.trim()) && !LOOKS_TECHNICAL.test(r) && !MACHINE_WORDS.test(r);

/** What a person reads for a failure: the reason as it is when it was written for a person (or is a code the page
 *  translates), otherwise the plain sentence for its kind. */
export function plainFailure(detail: string, failed?: string): string {
  const d = String(detail ?? "").trim();
  if (PAGE_CODES.test(d) || WRITTEN_FOR_A_PERSON(d)) return d;
  const kind = failKind(d);
  // The undo point's machinery failing while putting files back (Undo), not while saving one before a task.
  return FAIL_WORDS[kind === "undoPoint" && /^(checkpoint\.|bisect\.undo)/.test(failed ?? "") ? "undoRestore" : kind];
}

const DETAIL_MAX = 400;
/** The fields of a protocol.error for a failure: the plain reason, what was being done (a command type, for the page's own
 *  logic), and the raw detail for the log (secrets hidden, short). */
export function failure(e: unknown, failed?: string): { reason: string; detail: string; failed?: string } {
  const raw = String((e as Error)?.message ?? e ?? "");
  return { reason: plainFailure(raw, failed), detail: clip(redact(raw).trim(), DETAIL_MAX), ...(failed ? { failed } : {}) };
}
