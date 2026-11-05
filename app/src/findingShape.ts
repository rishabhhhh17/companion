// M58 shortlist 3: a fixed shape for every finding, built on the page from the review's reason kinds (no protocol change,
// no model). One readiness line on top: Ready, Check these N things, or Not safe yet, and never Ready over a stop, failed
// checks or checks that did not run (rule 14). Each finding is at one level (Must fix, Should fix, Worth a look) with four
// short parts: what is wrong, what it means for you, how to fix it, and when it may be fine on purpose (left out for a Must
// fix that never is). No number score anywhere. Fixed sentences per kind live in strings.ts. Tested in findingShape.test.ts;
// reviewCard.tsx and shipPanels.tsx draw it.
import type { ReviewReasonKind } from "../../protocol/index.ts";
import { fixedSince, keyWarned, type ReviewCard } from "./review.ts";
import { S } from "./strings.ts";

export type Level = "must" | "should" | "look";
/** Must fix is the engine's own Fix this first kinds (runner/src/review/look.ts STOP_KINDS, pinned by the test). */
export const FINDING_LEVEL: Record<ReviewReasonKind, Level> = {
  secret_in_code: "must", key_in_page: "must", open_table: "must", removed_still_used: "must", house_rule: "must", checks_failed: "must", risky_with_failing_checks: "must",
  secret_file_changed: "should", touches_risky: "should", signed_in_open: "should", house_rule_ask: "should",
  files_removed: "look", too_many: "look", model_concern: "look",
};
const RANK: Record<Level, number> = { must: 0, should: 1, look: 2 };
// review.ts keyWarned is a type guard; as a plain yes or no it does not narrow the card away after it.
const warned = (r: ReviewCard): boolean => keyWarned(r);
export const levelRank = (k: ReviewReasonKind): number => RANK[FINDING_LEVEL[k]];

/** detail: the review's own sentence for this finding (its file, line or table; secrets already hidden). */
export type Parts = { wrong: string; means: string; how: string; fine?: string; detail?: string };
export function findingParts(kind: ReviewReasonKind, say: string): Parts {
  const head = S.homeNow.reviewHead[kind];
  const fine = S.finding.fineFor[kind];
  return { wrong: head[0], means: S.finding.meansFor[kind] ?? head[1], how: S.finding.howFor[kind], ...(fine ? { fine } : {}), ...(say ? { detail: say } : {}) };
}

/** checks_unchecked: the project's checks did not run on the change, or could not tell (never a reason the engine sends). */
export type Shaped = { i: number; kind: ReviewReasonKind | "checks_unchecked"; level: Level; file?: string; line?: number; parts: Parts; fixed: boolean };

/** The card's findings in their fixed shape, Must fix first, then Should fix, then Worth a look; one that a newer change
 *  fixed goes last. i is the reason's place in the review (Don't flag and Changed since use it), or -1 for one the page
 *  adds itself (checks that failed with no reason sent for them, or checks that did not run). */
export function shapeFindings(r: ReviewCard | null | undefined): Shaped[] {
  if (!r) return [];
  if (warned(r)) return r.keys!.map((k, i) => ({ i, kind: "secret_in_code" as const, level: "must" as const, file: k.file, line: k.line, parts: findingParts("secret_in_code", S.review.keyAt(k.file, k.line)), fixed: false }));
  const res = r.result;
  if (!res || r.stage !== "reviewed") return [];
  const out: Shaped[] = res.reasons.map((x, i) => ({ i, kind: x.kind, level: FINDING_LEVEL[x.kind], ...(x.file ? { file: x.file } : {}), ...(x.line ? { line: x.line } : {}), parts: findingParts(x.kind, x.say), fixed: fixedSince(r, i) }));
  if (res.checks === "failed" && !res.reasons.some((x) => x.kind === "checks_failed" || x.kind === "risky_with_failing_checks")) out.push({ i: -1, kind: "checks_failed", level: "must", parts: findingParts("checks_failed", res.checksNote ?? ""), fixed: false });
  if (res.checks === "not_run" || res.checks === "unknown") {
    const [wrong, means, how] = res.checks === "not_run" ? S.finding.unchecked : S.finding.uncheckedUnknown;
    out.push({ i: -1, kind: "checks_unchecked", level: "should", parts: { wrong, means, how, ...(res.checksNote ? { detail: res.checksNote } : {}) }, fixed: false });
  }
  // A stable sort: within a level, the review's own order stays.
  return out.map((x, n) => ({ x, n })).sort((a, b) => Number(a.x.fixed) - Number(b.x.fixed) || RANK[a.x.level] - RANK[b.x.level] || a.n - b.n).map((o) => o.x);
}

export type Readiness = { kind: "ready" | "check" | "notSafe" | "none"; n: number; words: string; line: string };
const said = (kind: "ready" | "check" | "notSafe", n = 0): Readiness => ({ kind, n, words: kind === "check" ? S.finding.ready.check(n) : S.finding.ready[kind], line: S.finding.readyLine[kind] });

/** The review card's readiness line. none: nothing was looked at yet (no review, no key warning), so nothing is said. */
export function readinessOf(r: ReviewCard | null | undefined): Readiness {
  if (!r) return { kind: "none", n: 0, words: "", line: "" };
  if (warned(r)) return said("notSafe", r.keys!.length);
  const res = r.result;
  if (!res || r.stage !== "reviewed") return { kind: "none", n: 0, words: "", line: "" };
  const open = shapeFindings(r).filter((x) => !x.fixed);
  if (open.some((x) => x.level === "must") || res.checks === "failed" || (res.rating === "stop" && res.reasons.length === 0)) return said("notSafe", open.length);
  if (open.length > 0) return said("check", open.length);
  return res.checks === "passed" ? said("ready") : said("check", 1);
}

type GateLike = { status: "passed" | "blocked" | "could_not_check" | "not_applicable" };
/** The check before going live's readiness line: Ready only when every gate passed or is not needed and the engine says it
 *  may ship; a blocked gate (or the engine saying no without a gate to show) is Not safe yet; a gate that could not check
 *  is a thing to check. */
export function gatesReadiness(report: { gates: GateLike[]; canShip: boolean }): Readiness {
  const gates = report.gates ?? [];
  if (gates.some((g) => g.status === "blocked")) return said("notSafe", gates.filter((g) => g.status === "blocked").length);
  const unsure = gates.filter((g) => g.status === "could_not_check").length;
  if (unsure > 0) return said("check", unsure);
  if (!report.canShip || gates.length === 0 || !gates.every((g) => g.status === "passed" || g.status === "not_applicable")) return said("notSafe");
  return said("ready");
}

/** The words on the button that closes a review whose change stays as it is. A key in the code is never fine, so that
 *  button names the consequence ("Leave the key in the code") instead of "Keep it anyway" (the review of 5 Nov). */
export function keepWords(r: ReviewCard | null | undefined): string {
  const key = !!r && (warned(r) || (r.result?.reasons ?? []).some((x) => x.kind === "secret_in_code"));
  return key ? S.review.leaveKey : S.review.keepAnyway;
}
