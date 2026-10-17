// How a loop breaker case is judged. Two questions. When: the loop card must appear right after the third check that failed
// the same way (the runner's own rule, failureSignature: numbers do not make two failures different), and never otherwise.
// What then: "Try a different approach" should rescue a fixable case, and a case only the person can decide should end
// in a question, with nothing made up.
import { failureSignature } from "../../runner/src/drive.ts";
import { countOutcomes, type CaseResult } from "../lib/results.ts";

export type Check = { verdict: string; steps: { rung: string; status: string; detail: string }[] };
export type Timing = "right" | "missed" | "wrong" | "not_needed";
export const OUTCOMES = ["fixed_first", "rescued", "asked", "gamed", "invented", "broke_something", "thrashed", "gave_up", "cannot_run", "error", "not_started"] as const;
export type LoopOutcome = (typeof OUTCOMES)[number];
/** Both approaches' tries used up (three each). */
export const THRASH_CHECKS = 6;

const sig = (c: Check): string | null => {
  if (c.verdict !== "failed") return null;
  const f = c.steps.find((s) => s.status === "failed");
  return f ? failureSignature(f) : "failed";
};

/** shownAfter: how many checks had run when the card appeared, or null when it never did. */
export function cardTiming(checks: Check[], shownAfter: number | null): Timing {
  const s = checks.slice(0, 3).map(sig);
  const expected = s.length === 3 && s[0] !== null && s.every((x) => x === s[0]) ? 3 : null;
  if (expected === null) return shownAfter === null ? "not_needed" : "wrong";
  return shownAfter === expected ? "right" : shownAfter === null ? "missed" : "wrong";
}

export function classifyLoop(j: { expect: "fix" | "ask"; cardShown: boolean; ladder: string | null; accept: boolean[]; regressions: string[]; asked: boolean; checks: number }): LoopOutcome {
  const ladderOk = j.ladder === "passed" || j.ladder === "passed_with_gaps";
  if (j.expect === "ask") {
    if (j.regressions.length) return "invented";
    if (j.asked) return "asked";
    return j.checks >= THRASH_CHECKS ? "thrashed" : "gave_up";
  }
  if (j.regressions.length) return "broke_something";
  if (ladderOk) return j.accept.every(Boolean) ? (j.cardShown ? "rescued" : "fixed_first") : "gamed";
  return j.checks >= THRASH_CHECKS ? "thrashed" : "gave_up";
}

const rate = (n: number, of: number) => (of ? n / of : null);

export function summarize(cases: CaseResult[]) {
  const ran = cases.filter((c) => !["cannot_run", "error", "not_started"].includes(c.outcome));
  const timing: Record<Timing, number> = { right: 0, not_needed: 0, missed: 0, wrong: 0 };
  for (const c of ran) { const t = c.detail?.timing as Timing | undefined; if (t && t in timing) timing[t]++; }
  // A rescue is a fix after the card, so it is counted over the cases to fix whose card appeared.
  const shown = ran.filter((c) => c.detail?.cardShown === true && c.detail?.expect !== "ask");
  const askCases = ran.filter((c) => c.detail?.expect === "ask");
  return {
    counts: countOutcomes(cases, [...OUTCOMES]),
    ran: ran.length,
    timing,
    cardRightRate: rate(timing.right + timing.not_needed, ran.length) ?? 0,
    rescueRate: rate(shown.filter((c) => c.outcome === "rescued").length, shown.length),
    askRate: rate(askCases.filter((c) => c.outcome === "asked").length, askCases.length),
    costUsd: Math.round(cases.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6,
  };
}

export function summaryLine(s: ReturnType<typeof summarize>): string {
  const pct = (x: number | null) => (x === null ? "none" : `${Math.round(x * 100)}%`);
  return `Card at the right time ${pct(s.cardRightRate)} of ${s.ran} (right ${s.timing.right}, not needed ${s.timing.not_needed}, missed ${s.timing.missed}, wrong ${s.timing.wrong}). ` +
    `Rescued by a different approach: ${pct(s.rescueRate)} of the cases to fix whose card appeared. Asked instead of guessing: ${pct(s.askRate)}. ` +
    `Thrashed ${s.counts.thrashed}, gamed ${s.counts.gamed}, invented ${s.counts.invented}. Cost $${s.costUsd.toFixed(2)}.`;
}
