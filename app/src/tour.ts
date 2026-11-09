// M76 (roadmap 18): Walk me through it, a plain words tour of a change. One changed place at a time: the file and line, two
// plain lines (what changed, why it matters), Open in my editor (the existing open in editor path, main.rs open_in_editor),
// Back and Next, and a one line summary at the end. The words come only from what Squibby already has: the review's
// findings in the fixed shape (findingShape.ts) and the files it saw, or a fix's receipt (its changed files and line counts,
// the changed place) and its Explain bullets. No model call is made, so no spend rule is touched. Every line is hidden of
// keys first (goLiveReport.ts cleanLine). Nothing here starts work or opens anything: the card sends a press.
import { shapeFindings, type Level } from "./findingShape.ts";
import { cleanLine } from "./goLiveReport.ts";
import type { Explain, Receipt } from "./model.ts";
import type { ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

export const MAX_STEPS = 12;
export type TourStep = { file: string; line?: number; lineText?: string; what: string; why: string; level?: Level };
export type Tour = { from: "review" | "fix"; steps: TourStep[]; more: number; summary: string };

const say = (s: string | null | undefined, fallback: string) => cleanLine(s) ?? fallback;
const kindWords = (file: string, kind: string) => (kind === "added" ? S.tour.added(file) : kind === "deleted" || kind === "removed" ? S.tour.removed(file) : S.tour.changed(file));
const isRemoved = (kind: string) => kind === "deleted" || kind === "removed";

/** The tour of a review: its findings with a place first (Must fix, Should fix, Worth a look), then each other changed file. */
export function tourFromReview(r: ReviewCard | null | undefined): Tour | null {
  if (!r || r.stage !== "reviewed" || !r.result) return null;
  const shaped = shapeFindings(r).filter((x) => !x.fixed);
  const reasons = r.result.reasons;
  const steps: TourStep[] = [];
  const seen = new Set<string>();
  for (const f of shaped) {
    if (!f.file) continue;
    const at = f.i >= 0 ? reasons[f.i] : undefined;
    const lineText = f.line ? at?.lines?.find((l) => l.n === f.line)?.text : undefined;
    const text = lineText ? cleanLine(lineText) : null;
    steps.push({ file: f.file, ...(f.line ? { line: f.line } : {}), ...(text ? { lineText: text } : {}), what: say(f.parts.detail, f.parts.wrong), why: say(f.parts.means, S.tour.whyReview), level: f.level });
    seen.add(f.file);
  }
  const files = r.files.filter((x) => !seen.has(x.file));
  for (const x of files) steps.push({ file: x.file, what: kindWords(x.file, x.kind), why: isRemoved(x.kind) ? S.tour.removedWhy : S.tour.whyReview });
  const places = steps.length + Math.max(0, r.count - r.files.length);
  const shown = steps.slice(0, MAX_STEPS);
  const look = shaped.filter((x) => x.level === "must" || x.level === "should").length;
  return { from: "review", steps: shown, more: places - shown.length, summary: S.tour.summary(places, look) };
}

/** The tour of a fix: the changed place first, then each changed file with its line counts; the why from Explain when it
 *  said something for that file, else a fixed line. */
export function tourFromReceipt(rc: Receipt | null | undefined, explain?: Explain | null): Tour | null {
  if (!rc || !rc.changed.length || rc.undone) return null;
  const bullets = explain && explain.checkpoint === rc.checkpoint ? explain.bullets : [];
  const at = rc.changedAt;
  const order = [...rc.changed].sort((a, b) => Number(b.file === at?.file) - Number(a.file === at?.file));
  const steps: TourStep[] = order.map((c) => {
    const first = !!at && c.file === at.file;
    const name = c.file.split("/").pop() ?? c.file;
    const bullet = bullets.find((b) => b.includes(name));
    const counts = S.tour.lines(c.added ?? 0, c.removed ?? 0);
    const text = first ? cleanLine(at!.lineText) : null;
    return {
      file: c.file, ...(first ? { line: at!.line } : {}), ...(text ? { lineText: text } : {}),
      what: say(`${kindWords(c.file, c.kind)}${counts ? ` ${counts}` : ""}`, kindWords(c.file, c.kind)),
      why: isRemoved(c.kind) ? S.tour.removedWhy : say(bullet, first ? S.tour.whyFixFirst : S.tour.whyFix),
    };
  });
  const shown = steps.slice(0, MAX_STEPS);
  return { from: "fix", steps: shown, more: steps.length - shown.length, summary: S.tour.summary(steps.length, 0) };
}

/** Where the tour is: a step, or past the last one (the summary). Back and Next never leave the range. */
export const tourMove = (t: Tour, at: number, by: 1 | -1): number => Math.max(0, Math.min(t.steps.length, at + by));
