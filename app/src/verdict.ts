// M45, Tell the truth: what a finished task's result is, decided in one place. Every surface that shows a result (Home's
// big words, the receipt, the notch, What I did, the recent list, VoiceOver, speech, Copy) reads this and nothing else, so
// none of them can call a result proven on its own. Pure: it reads plain facts (the adapters that read the Model are in
// model.ts, receiptFacts and historyFacts) and never imports the Model, so there is no import cycle.
// The rows are the spec's truth table (docs/milestones/M45-spec.md, 1.2), evaluated top to bottom; the first match wins.
import { S } from "./strings.ts";

/** What the checks showed. "none": no check ran (proof "skipped", or no proof). */
export type ProofFact = "passed" | "partial" | "failed" | "none";
/** How the task ended. "unknown": the receipt did not say. Never read as done. */
export type EndFact = "done" | "stopped" | "limit" | "needsYou" | "failed" | "unknown";
export type LimitWhy = "spending" | "daily" | "turns";
export type FailWhy = "check" | "noConnection" | "claudeBusy" | "error";

export type Facts = {
  proof: ProofFact;
  ended: EndFact;
  limit?: LimitWhy;        // only read when ended === "limit"
  failWhy?: FailWhy;       // only read when ended === "failed"
  undone: boolean;         // an Undo put the files back after this task
  back?: boolean;          // and then "Bring the fix back" put them back again
  backPartly?: boolean;    // but left some fix files as the person changed them after the Undo
  changed: number;         // files the task changed (0 when unknown)
  missing: string[];       // display names of checks that could not run (partial). [] when unknown
  canBringBack?: boolean;  // the Undo's safety copy is known, so the fix can be brought back
  turnOpen?: boolean;      // a "your turn" has put old code back in one place
};

export type VerdictKind =
  | "proven" | "passes" | "partial" | "unchecked" | "noChange" | "turn"
  | "failed" | "stopped" | "limit" | "needsYou" | "error"
  | "undone" | "back";
export type Tone = "good" | "mixed" | "bad" | "plain" | "ask";
export type VerdictIcon = "tick" | "cross" | "wait" | "stop" | "undo";   // all exist in icons.tsx
export type Offer = "undo" | "bringBack" | null;

export type Verdict = {
  kind: VerdictKind;
  headline: string;        // short, no full stop: "Fixed and proven"
  line: string | null;     // one full sentence under it, or null
  say: string;             // headline and line as one sentence, for copy, VoiceOver, speech, notch
  tone: Tone;
  icon: VerdictIcon;
  offer: Offer;            // the one undo kind of button this result offers
  proven: boolean;         // true only for kind "proven", and "passes" (its checks passed on the project as it is). The only "proven" anywhere.
};

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The checks that could not run, as one sentence: "The tests and the browser check could not run." Three or more: "Some
 *  checks could not run." */
export function missingWords(names: string[]): string {
  const n = names.filter((x) => x.trim());
  if (n.length === 0 || n.length > 2) return S.verdict.someCouldNotRun;
  return S.verdict.couldNotRun(cap(n.length === 1 ? n[0] : `${n[0]} ${S.verdict.and} ${n[1]}`));
}

type Body = Pick<Verdict, "kind" | "headline" | "line" | "tone" | "icon">;

function body(f: Facts): Body {
  const V = S.verdict;
  const checked = f.proof === "passed" || f.proof === "partial";
  const hasFix = f.changed > 0 || checked;
  const finished = f.ended === "done" || f.ended === "unknown";
  const limit: LimitWhy = f.limit ?? "spending";
  // 1, 2: Undo put the files back (a read only answer has nothing to undo, so an Undo then is not the result).
  if (f.undone && f.back) return { kind: "back", headline: V.back, line: f.backPartly ? V.backPartlyLine : checked ? V.backLine : V.backLineUnchecked, tone: "plain", icon: "wait" };
  if (f.undone && hasFix) return { kind: "undone", headline: V.undone, line: checked ? V.undoneFix : V.undoneOther, tone: "plain", icon: "undo" };
  // 3: it waits for the person.
  if (f.ended === "needsYou") return { kind: "needsYou", headline: V.needsYou, line: f.proof === "failed" ? V.needsYouFailed : null, tone: "ask", icon: "wait" };
  // 4: a check failed, however it ended.
  if (f.proof === "failed") {
    const line = f.ended === "stopped" ? V.failedThenStopped : f.ended === "limit" ? V.failedThenLimit(V.limitWhere[limit]) : V.failedLine;
    return { kind: "failed", headline: V.failed, line, tone: "bad", icon: "cross" };
  }
  // 5, 6, 7: it stopped before it finished.
  if (f.ended === "stopped") return { kind: "stopped", headline: V.stopped, line: f.changed > 0 ? V.stoppedChanged : V.stoppedNothing, tone: "plain", icon: "stop" };
  if (f.ended === "limit") return { kind: "limit", headline: V.limit[limit], line: f.changed > 0 ? V.limitChanged : null, tone: "plain", icon: "stop" };
  if (f.ended === "failed") {
    const why = f.failWhy;
    if (why === "noConnection") return { kind: "error", headline: V.noConnection, line: null, tone: "bad", icon: "cross" };
    if (why === "claudeBusy") return { kind: "error", headline: V.claudeBusy, line: null, tone: "bad", icon: "cross" };
    return { kind: "error", headline: V.error, line: V.errorLine, tone: "bad", icon: "cross" };
  }
  // 8 to 12: it finished (or did not say, which counts only with a pass: the checks run only after a whole round).
  if (finished && f.proof === "passed") {
    if (f.turnOpen) return { kind: "turn", headline: V.turn, line: V.turnLine, tone: "mixed", icon: "wait" };
    // The checks passed but nothing was changed: nothing was fixed, so it is never "Fixed and proven" (must fix 7).
    if (f.changed === 0) return { kind: "passes", headline: V.passes, line: V.passesLine, tone: "good", icon: "tick" };
    return { kind: "proven", headline: V.proven, line: null, tone: "good", icon: "tick" };
  }
  if (f.proof === "partial") return { kind: "partial", headline: V.partial, line: missingWords(f.missing), tone: "mixed", icon: "wait" };
  if (f.changed > 0) return { kind: "unchecked", headline: V.unchecked, line: V.uncheckedLine, tone: "plain", icon: "wait" };
  return { kind: "noChange", headline: V.noChange, line: null, tone: "plain", icon: "wait" };
}

/** The one honest result for these facts. Bring the fix back is offered only where there was a fix to bring back (the same
 *  "has fix" as row 2): after an Undo of a task that changed nothing, the safety copy holds only the person's own work. */
export function verdictOf(f: Facts): Verdict {
  const b = body(f);
  const hasFix = f.changed > 0 || f.proof === "passed" || f.proof === "partial";
  const offer: Offer = f.changed > 0 && (!f.undone || !!f.back) ? "undo" : f.undone && !f.back && f.canBringBack && hasFix ? "bringBack" : null;
  return { ...b, say: S.verdict.say(b.headline, b.line), offer, proven: b.kind === "proven" || b.kind === "passes" };
}
