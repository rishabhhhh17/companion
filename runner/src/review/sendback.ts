// M52: what the person can do with a review. "Send back to my AI" is a ready plain message they paste into Claude Code or
// Codex themselves (the page copies it; nothing is typed into their app). Fix it is the same review as the request of an
// ordinary task here, which keeps a safety copy first and can be undone. Both are built only from the review's own words
// (file names, line numbers and plain sentences), and every secret looking value is hidden again over the whole text at the
// end, so a key the model repeated in its words still never leaves.
import { clip, redact } from "../redact.ts";
import { listWords, touchWords, type FileChange, type Rating, type Reason, type Touch } from "./rate.ts";

export type ReviewWords = { rating: Rating; reasons: Reason[]; touches: Touch[]; files: FileChange[]; count: number; summary: string; notes: string[] };

const RATING_WORDS: Record<Rating, string> = { safe: "safe", worth_a_look: "worth a look", stop: "stop, something needs fixing first" };
const KIND_WORDS: Record<FileChange["kind"], string> = { added: "added", modified: "changed", deleted: "removed" };
const MAX_FILES = 20;
const MAX_TEXT = 6000;

const line = (s: string) => clip(s.replace(/\s+/g, " ").trim(), 300);
function fileLines(files: FileChange[], count: number): string[] {
  const shown = files.slice(0, MAX_FILES).map((f) => `- ${f.file} (${KIND_WORDS[f.kind]})`);
  const more = Math.max(0, count - shown.length);
  return more ? [...shown, `- and ${more} more`] : shown;
}
// No word in capitals can come back from a model and end up shouting at someone.
const calm = (s: string) => s.replace(/\b[A-Z]{4,}\b/g, (w) => w.toLowerCase()).replace(/[–—]/g, ",");
const finish = (parts: string[]) => clip(calm(redact(parts.filter((p) => p !== "").join("\n"))), MAX_TEXT);

/** The message to paste back into the coding tool that made the change. */
export function sendBackText(r: ReviewWords): string {
  const problems = r.reasons.map((x) => `- ${line(x.say)}`);
  const notes = r.notes.map((n) => `- ${line(n)}`);
  return finish([
    "A review of the changes you just made in this project found this.",
    "",
    `Rating: ${RATING_WORDS[r.rating]}.`,
    r.summary ? `What changed: ${line(r.summary)}` : "",
    r.touches.length ? `What it touches: ${listWords(r.touches.map(touchWords))}.` : "",
    "",
    "Files:",
    ...fileLines(r.files, r.count),
    ...(problems.length ? ["", "Please fix these:", ...problems] : []),
    ...(notes.length ? ["", "Also worth checking:", ...notes] : []),
    "",
    problems.length
      ? "Fix only these problems and keep the rest of the change as it is. Do not write keys or passwords into the code; read them from a settings file such as .env. When you are done, run the project's build and tests and show that they pass."
      : "If this is what was meant, nothing needs to change. Run the project's build and tests and show that they pass.",
  ]);
}

/** The request for Fix it: an ordinary task in this project, started with a safety copy and Undo like every other. */
export function fixPrompt(r: ReviewWords): string {
  const problems = r.reasons.map((x) => `- ${line(x.say)}`);
  const notes = r.notes.map((n) => `- ${line(n)}`);
  return finish([
    "Another AI tool just changed files in this project, and a review of that change found problems. Fix them.",
    r.summary ? `What changed: ${line(r.summary)}` : "",
    "",
    "Files in that change:",
    ...fileLines(r.files, r.count),
    "",
    "Problems to fix:",
    ...(problems.length ? problems : ["- Nothing was named. Check that the change works and fix only what is broken."]),
    ...(notes.length ? ["", "Also worth checking:", ...notes] : []),
    "",
    "Keep the person's other changes as they are. Never write a key or password into the code: read it from a settings file such as .env, and do not open or change that file. Prove the fix with the project's own build and tests.",
  ]);
}
