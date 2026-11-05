// M69 step 2, the review card's head (the YC benchmark spec 3.3): plain words before code. The tag ("Fix this first · 1 of
// 2"), the two tone headline (what is wrong, then why it matters), the place Squibby points at (a file and a line, never
// its text: M57 keeps every line of the person's code and every key off the page), the reassurance under the buttons, and
// the other findings as one line cards (Then, Fine). The words are fixed sentences per reason kind in strings.ts: no model
// writes them, none names a value, and none says who changed a file (M57's honest words). Plain code, tested in
// reviewHead.test.ts; reviewCard.tsx draws it.
import type { CodeLine, ReviewReason } from "../../protocol/index.ts";
import { fixedSince, keyWarned, type ReviewCard } from "./review.ts";
import { levelRank } from "./findingShape.ts";
import { S } from "./strings.ts";

/** lines (M69): the pointed line and the lines either side of it, masked by the engine and again by review.ts. */
export type Pointed = { file: string; line: number; lines?: CodeLine[] };
export type Finding = { id: string; tag: "then" | "fine"; title: string; line: string; at: Pointed | null; act: "look" | "see" };
export type ReviewHead = {
  /** stop: red, Fix this first. look: amber, Worth a look. */
  tone: "stop" | "look";
  tag: string;
  headline: string;
  why: string;
  /** What Why does this matter? says first (M69 step 3): a fixed sentence for the kind, else the why again. */
  whyMore: string;
  pointed: Pointed | null;
  reassure: string;
  others: Finding[];
  /** How many things wait (the count on Now in the side list). */
  count: number;
};

const place = (file?: string, line?: number, lines?: CodeLine[]): Pointed | null => (file && line ? { file, line, ...(lines?.length ? { lines } : {}) } : null);
// A key that can really spend money: a live secret or restricted payments key (sk_live_…, rk_live_…), said as a password
// for your payments. Only on the pointed line itself: a neighbour's key is not this finding. A publishable key (pk_…) is
// public by design, a test key (…_test_…) cannot spend, and a webhook secret (whsec_…) cannot either: those are a plain
// secret in the code.
const PAY = /\b[sr]k_live_/;
const keyKind = (p: Pointed | null): string => (p?.lines?.some((l) => l.n === p.line && PAY.test(l.text)) ? "secret_in_code_pay" : "secret_in_code");
const words = (kind: string, say: string): [string, string] => {
  const w = S.homeNow.reviewHead[kind];
  // The review's own concern has no fixed sentence of its own: its words (secrets already hidden) are the why.
  return kind === "model_concern" ? [w[0], say || w[1]] : [w[0], w[1]];
};
const tagOf = (tone: "stop" | "look", i: number, n: number) => (n > 1 ? `${S.homeNow.reviewTag[tone]} · ${S.homeNow.of(i, n)}` : S.homeNow.reviewTag[tone]);

/** The head for a card that leads Now: a key warning before any review, or a review that found something. Null for a card
 *  that only waits to be reviewed, is being reviewed, or found nothing (those keep their own short card). */
export function reviewHead(r: ReviewCard | null | undefined): ReviewHead | null {
  if (!r) return null;
  if (keyWarned(r as ReviewCard | null)) {
    const keys = r.keys!;
    const pointed = place(keys[0].file, keys[0].line, keys[0].lines);
    const [headline, why] = words(keyKind(pointed), "");
    const others: Finding[] = keys.slice(1).map((k, i) => ({ id: `key:${i}`, tag: "then", title: S.homeNow.reviewHead.secret_in_code[0], line: S.review.keyAt(k.file, k.line), at: place(k.file, k.line), act: "look" }));
    const n = keys.length;
    return { tone: "stop", tag: tagOf("stop", 1, n), headline, why, whyMore: S.homeNow.whyMore[keyKind(pointed)] ?? why, pointed, reassure: S.homeNow.reassureLook, others, count: n };
  }
  const res = r.result;
  if (!res || r.stage !== "reviewed" || res.rating === "safe") return null;
  // The first reason that still holds leads, Must fix first (M58, findingShape.ts); one that a newer change fixed goes last.
  const order = res.reasons.map((x, i) => ({ x, i })).sort((a, b) => Number(fixedSince(r, a.i)) - Number(fixedSince(r, b.i)) || levelRank(a.x.kind) - levelRank(b.x.kind) || a.i - b.i);
  const tone = res.rating === "stop" ? "stop" : "look";
  const lead: ReviewReason | undefined = order[0]?.x;
  const pointed = lead ? place(lead.file, lead.line, lead.lines) : null;
  const [headline, why] = lead ? words(lead.kind === "secret_in_code" ? keyKind(pointed) : lead.kind, lead.say) : [S.review.rating[res.rating], S.review.ratingLine[res.rating]];
  const others: Finding[] = order.slice(1).map(({ x, i }) => ({ id: `reason:${i}`, tag: "then", title: x.say, line: x.file ? S.review.at(x.file, x.line) : "", at: place(x.file, x.line), act: "look" }));
  const named = res.reasons.map((x) => x.file).filter((f): f is string => !!f);
  const kind = lead ? (lead.kind === "secret_in_code" ? keyKind(pointed) : lead.kind) : "";
  return { tone, tag: tagOf(tone, 1, Math.max(1, res.reasons.length)), headline, why, whyMore: S.homeNow.whyMore[kind] ?? why, pointed,
    reassure: r.fix === "sent" ? "" : S.homeNow.reassure, others: withFine(others, r, named, res.checksNote), count: Math.max(1, res.reasons.length) };
}

/** The files no finding names, as one Fine card: how many, and what the checks said. Only after a review ran and its checks
 *  did not fail: before that, nobody looked at them, so they are never called fine. */
function withFine(others: Finding[], r: ReviewCard, named: string[], note?: string): Finding[] {
  const rest = r.count - new Set(named).size;
  if (rest <= 0 || !r.result || r.result.checks === "failed") return others;
  return [...others, { id: "fine", tag: "fine", title: S.homeNow.otherFiles(rest), line: note ?? "", at: null, act: "see" }];
}
