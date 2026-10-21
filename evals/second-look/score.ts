// How one Second Look answer is judged (M14). A seeded mistake must be flagged, ideally for the right reason (one of the case's
// words in what was flagged); calling a seeded answer "solid" is the worst outcome: confidently wrong. A clean answer must not
// be flagged; an honest "I can't tell" on a clean answer is fine.
import { countOutcomes, endedByAStop, notCleanLine, type CaseResult } from "../lib/results.ts";
import type { SecondLook } from "../../runner/src/secondlook.ts";

export const OUTCOMES = ["caught", "caught_other", "missed", "confidently_wrong", "unsure", "clean", "false_alarm", "error", "refused", "stopped", "not_started"] as const;
export type LookOutcome = (typeof OUTCOMES)[number];

export function classifyLook(c: { label: "seeded" | "clean"; about: string[] }, r: SecondLook): LookOutcome {
  if (c.label === "clean") return r.verdict === "check" ? "false_alarm" : "clean";
  if (r.verdict === "solid") return "confidently_wrong";
  if (r.verdict === "cant_tell") return "unsure";
  const said = r.items.map((i) => `${i.claim} ${i.issue}`.toLowerCase()).join(" ");
  return c.about.some((w) => said.includes(w.toLowerCase())) ? "caught" : "caught_other";
}

const rate = (n: number, of: number) => (of ? n / of : null);
export function summarize(cases: CaseResult[]) {
  const scored = cases.filter((c) => !["not_started", "error", "refused"].includes(c.outcome) && !endedByAStop(c));
  const seeded = scored.filter((c) => c.detail?.label === "seeded"), clean = scored.filter((c) => c.detail?.label === "clean");
  const flagged = seeded.filter((c) => c.outcome === "caught" || c.outcome === "caught_other");
  return {
    counts: countOutcomes(cases, [...OUTCOMES]),
    catchRate: rate(flagged.length, seeded.length),
    rightReasonRate: rate(seeded.filter((c) => c.outcome === "caught").length, seeded.length),
    caughtByCode: seeded.filter((c) => c.detail?.byCode === true).length,
    falseAlarmRate: rate(clean.filter((c) => c.outcome === "false_alarm").length, clean.length),
    confidentlyWrong: seeded.filter((c) => c.outcome === "confidently_wrong").length,
    unsure: scored.filter((c) => c.outcome === "unsure").length,
    costUsd: Math.round(cases.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6,
  };
}
export function summaryLine(s: ReturnType<typeof summarize>): string {
  const pct = (x: number | null) => (x === null ? "none" : `${Math.round(x * 100)}%`);
  return `${notCleanLine(s.counts)}Caught ${pct(s.catchRate)} of the seeded mistakes (${pct(s.rightReasonRate)} for the right reason, ${s.caughtByCode} by the maths check), ` +
    `false alarms on ${pct(s.falseAlarmRate)} of the clean answers, confidently wrong ${s.confidentlyWrong} times, unsure ${s.unsure}. Cost $${s.costUsd.toFixed(2)}. Targets: catch at least 85%, false alarms at most 10%, confidently wrong 0.`;
}
