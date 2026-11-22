// M104, fixed and proven, finding by finding. After Fix it, each problem the review found is checked again by the same rules
// that found it (look.ts recheckHolds), against what the fix left: never a model, so it costs nothing and says only what a
// rule can see. Three answers, and nothing in between is rounded up:
//   gone:   checked again, it is not there (a key's line is gone, the import is gone, the table is closed, the files are
//           back as they were, or a failing check now passes).
//   still:  checked again, it is still there; or the fix never touched the files it is about.
//   unsure: the fix changed the files it is about, but no rule can check this kind of problem, so the person looks.
// Pure: the caller reads the files (service.ts), so this module never opens anything.
import { FIX_OUTCOMES, RECHECKED_MAX, RECHECKED_SAY_MAX, type FixOutcome } from "../../../protocol/index.ts";
import { recheckHolds, type Recheck, type RecheckState } from "./look.ts";

export { FIX_OUTCOMES };
export type { FixOutcome };
export type FixFinding = { say: string; outcome: FixOutcome };
/** What the proof ladder said about the fix: the review's own "the checks failed" problems are answered by it. */
export type FixProof = "passed" | "partial" | "failed" | "skipped";
/** What Fix it hands the task that runs it: called once the fix's last change is saved (after), with its proof. */
/** Null: nothing to check. "unchecked": there was something to check but the recheck could not run (a version gone, a
 *  read failed), so the fix must not count as proven on it (hunt 20 Nov). */
export type FixCheck = (o: { after: string; proof: FixProof }) => Promise<{ batch: string; findings: FixFinding[] } | null | "unchecked">;

/** Problems that are about the checks, not a place in the code: the fix's own proof answers them. */
const ABOUT_CHECKS = new Set(["checks_failed", "risky_with_failing_checks", "claimed_passed"]);

/** One problem's answer. fixedBefore: a newer change or an earlier fix had already taken it out (M57 feature 4, M104).
 *  byFix: the files the fix itself changed (from the review's after version to the fix's after version). A rule that looks
 *  at the code (a line, an import, a table) always looks again, so a Try again that puts a problem back shows it Still
 *  there; fixedBefore keeps Gone only for a problem about the change as a whole, which no rule can look at again. */
export function outcomeOf(o: { kind: string; recheck: Recheck; state: RecheckState; byFix: ReadonlySet<string>; proof: FixProof; fixedBefore: boolean }): FixOutcome {
  if (ABOUT_CHECKS.has(o.kind)) return o.proof === "passed" ? "gone" : o.proof === "failed" ? "still" : "unsure";
  if (!recheckHolds(o.recheck, o.state)) return "gone";
  // A rule that looks at the code itself (a line, an import, a table) and still finds it: still there.
  if (o.recheck.how !== "files") return "still";
  if (o.fixedBefore) return "gone";
  // About the change as a whole: a rule can only tell whether its files are back as they were. Changed again by the fix:
  // the person looks. Not touched by the fix at all: nothing about it changed, so it is still there.
  return o.recheck.files.some((f) => o.byFix.has(f)) ? "unsure" : "still";
}

/** The receipt's lines, in the review's order, clipped to what the protocol carries. */
export function findingsOf(says: string[], outcomes: FixOutcome[]): FixFinding[] {
  return says.slice(0, RECHECKED_MAX).map((say, i) => ({ say: Array.from(say.trim() || "A problem the review found").slice(0, RECHECKED_SAY_MAX).join(""), outcome: outcomes[i] ?? "unsure" }));
}

/** How many are still there: any one means the fix is not proven. */
export const stillCount = (f: readonly FixFinding[] | null | undefined): number => (f ?? []).filter((x) => x.outcome === "still").length;
