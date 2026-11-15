// M95, a light tutor on Learn: What you have learned (one line per kind of problem the person has met and handled, each
// with its source, each can be forgotten) and Practise next (one practice or lesson, with a one line why). Pure functions of
// the signals the engine keeps (runner/src/memory/learned.ts), the practice record and the lessons: no model, no engine,
// tested in tutor.test.ts; tutorPanel.tsx only draws what this decides. The words are in strings.ts (S.tutor).
import { learnedSignalOk, LEARNED_KINDS, PRACTICE_LEARNED, type LearnedKind, type LearnedSignal, type LearnedSource } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { CATALOG, type PracticeRecord, type RowState } from "./practice.ts";
import type { LessonItem } from "./model.ts";

export type Learned = { on: boolean; paused: boolean; signals: LearnedSignal[] };
/** tutor.learned, checked. Anything that is not a kind, a source and a day drops the whole list, never a made up line. */
export function learnedFrom(e: unknown): Learned | null {
  const o = e as { type?: unknown; on?: unknown; paused?: unknown; signals?: unknown } | null;
  if (!o || typeof o !== "object" || o.type !== "tutor.learned" || typeof o.on !== "boolean" || typeof o.paused !== "boolean" || !Array.isArray(o.signals) || !o.signals.every(learnedSignalOk)) return null;
  return { on: o.on, paused: o.paused, signals: (o.signals as LearnedSignal[]).map((s) => ({ ...s })) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-14" as "14 Nov": the day the engine kept, on this Mac's own calendar. */
export const dayWords = (d: string): string => { const [, m, day] = d.split("-").map(Number); return `${day} ${MONTHS[m - 1] ?? ""}`.trim(); };
export const timesWords = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

export type LearnedLine = { kind: LearnedKind; text: string; from: string; last: string; n: number; sources: { source: LearnedSource; date: string; n: number }[] };
/** One line per kind handled (a missed check question is not a line), newest first, each with where it came from. */
export function learnedLines(signals: readonly LearnedSignal[]): LearnedLine[] {
  const by = new Map<LearnedKind, LearnedSignal[]>();
  for (const s of signals) if (!s.missed) by.set(s.kind, [...(by.get(s.kind) ?? []), s]);
  const lines = [...by].map(([kind, list]): LearnedLine => {
    const src = new Map<LearnedSource, { source: LearnedSource; date: string; n: number }>();
    for (const s of list) { const was = src.get(s.source); src.set(s.source, { source: s.source, date: !was || s.date > was.date ? s.date : was.date, n: (was?.n ?? 0) + 1 }); }
    const sources = [...src.values()].sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1));
    const w = S.tutor.kinds[kind];
    // Worded from the strongest source: what the checks proved (a practice, a Your turn change), else what a review saw go,
    // else a check question answered. The count is of that source only, so a review never adds to "found and moved".
    const count = (...of: LearnedSource[]) => list.filter((s) => of.includes(s.source)).length;
    const proven = count("practice", "yourTurn"), reviewed = count("review");
    const text = proven ? `${w.title}: ${w.handled}, ${timesWords(proven)}` : reviewed ? `${w.title}: ${S.tutor.byReview}, ${timesWords(reviewed)}` : `${S.tutor.byCheck(w.asked)}, ${timesWords(count("check"))}`;
    return { kind, n: list.length, last: sources[0].date, sources, text, from: `${S.tutor.from}: ${sources.map((x) => `${S.tutor.sources[x.source]}, ${dayWords(x.date)}`).join("; ")}` };
  });
  return lines.sort((a, b) => (a.last !== b.last ? (a.last > b.last ? -1 : 1) : LEARNED_KINDS.indexOf(a.kind) - LEARNED_KINDS.indexOf(b.kind)));
}

export type Suggestion =
  | { kind: "practice"; id: string; about: LearnedKind; why: string; forget?: LearnedKind; needsNode?: true }
  | { kind: "lesson"; id: string; title: string; why: string };
/** The practice that goes through each kind of problem (the inverse of PRACTICE_LEARNED), in the list's order. */
const practiceFor = (k: LearnedKind): string | null => CATALOG.find((e) => PRACTICE_LEARNED[e.id] === k)?.id ?? null;

/** Practise next, in this order: a practice not done about the kind of the newest check question whose answer was not the
 *  reason; else the first practice, in the list's order, about a kind not met yet; else the first practice not done; else
 *  a lesson made from the project not tried yet; else nothing. A practice that needs Node while Node is missing is passed
 *  over; when only those are not done, the first is suggested, saying it needs Node. */
export function practiseNext(signals: readonly LearnedSignal[], rows: readonly { id: string; state: RowState; needsNode?: boolean }[], lessons: readonly LessonItem[] | null): Suggestion | null {
  const notDone = (id: string) => rows.find((r) => r.id === id)?.state !== "done";
  // A practice that needs Node while Node is missing cannot be started, so it is passed over (said only when it is all that is left).
  const ready = (id: string) => rows.find((r) => r.id === id)?.needsNode !== true;
  const missed = [...signals].filter((s) => s.missed).sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1));
  for (const m of missed) {
    const id = practiceFor(m.kind);
    if (id && notDone(id) && ready(id)) return { kind: "practice", id, about: m.kind, why: S.tutor.why.missed(S.tutor.kinds[m.kind].about), forget: m.kind };
  }
  const met = new Set(signals.filter((s) => !s.missed).map((s) => s.kind));
  const notDoneYet = CATALOG.filter((e) => notDone(e.id));
  const open = notDoneYet.filter((e) => ready(e.id));
  const fresh = open.find((e) => !met.has(PRACTICE_LEARNED[e.id]));
  if (fresh) return { kind: "practice", id: fresh.id, about: PRACTICE_LEARNED[fresh.id], why: S.tutor.why.notMet(S.tutor.kinds[PRACTICE_LEARNED[fresh.id]].about) };
  if (open[0]) return { kind: "practice", id: open[0].id, about: PRACTICE_LEARNED[open[0].id], why: S.tutor.why.again(S.tutor.kinds[PRACTICE_LEARNED[open[0].id]].about) };
  if (notDoneYet[0]) return { kind: "practice", id: notDoneYet[0].id, about: PRACTICE_LEARNED[notDoneYet[0].id], why: S.practiceNeedsNode, needsNode: true };
  const lesson = (lessons ?? []).find((l) => l.status !== "tried");
  return lesson ? { kind: "lesson", id: lesson.id, title: lesson.title, why: S.tutor.why.lesson } : null;
}

/** Practise next when it comes from a check question answered with a different reason, else null. Learn's practice list
 *  leads with it (practicePanel.tsx), so the page never suggests two practices. */
export function missedLead(signals: readonly LearnedSignal[], rows: readonly { id: string; state: RowState; needsNode?: boolean }[]): { id: string; why: string; forget: LearnedKind } | null {
  const s = practiseNext(signals, rows, null);
  return s?.kind === "practice" && s.forget ? { id: s.id, why: s.why, forget: s.forget } : null;
}

/** The practices the record says are done that the engine has no practice signal for yet (a practice finished before
 *  this version, or while the engine was away), and that were not sent this session already. None with the tutor off or
 *  memory paused. The engine keeps each once and never one the person forgot. */
export function practiceNotesDue(l: Learned | null, rec: PracticeRecord, sent: ReadonlySet<string>): string[] {
  if (!l || !l.on || l.paused) return [];
  const have = new Set(l.signals.filter((s) => s.source === "practice" && !s.missed).map((s) => s.kind));
  return rec.rows.filter((r) => r.done && Object.hasOwn(PRACTICE_LEARNED, r.id) && !have.has(PRACTICE_LEARNED[r.id]) && !sent.has(r.id)).map((r) => r.id);
}
