// M77 (the safety net): the pages' side of the saved copies, the week's count, "Claude is waiting for you" and what the
// changes did not tell you. Pure: card.tsx, homeRest.ts and reviewCard.tsx only draw what this says. Honest words (never
// "Claude did"), a count only when it is above zero and never praise (rule 16), at most three untold lines.
import type { AskedRowView, CaughtView, ReviewUntold, SavedRowView } from "../../protocol/index.ts";
import { REVIEW_CHECKS } from "../../protocol/index.ts";
import { redact } from "../../runner/src/redact.ts";
import { S } from "./strings.ts";

/** The most saved copies History shows, whatever an event carries. */
const MAX_SAVED = 50;

/** The saved copies that keep to the protocol (tasks.list saved), at most 50; anything else is left out. */
export function savedRowsOf(v: unknown): SavedRowView[] {
  if (!Array.isArray(v)) return [];
  const out: SavedRowView[] = [];
  for (const x of v as Record<string, unknown>[]) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    if (!Number.isInteger(x.id) || typeof x.at !== "string" || Number.isNaN(Date.parse(x.at)) || typeof x.checkpoint !== "string" || !/^cp_/.test(x.checkpoint) || typeof x.command !== "string" || typeof x.undone !== "boolean") continue;
    out.push({ id: x.id as number, at: x.at, checkpoint: x.checkpoint, command: redact(x.command).slice(0, 80), undone: x.undone });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

/** The week's count as the engine sent it, or null for anything else or a count of nothing (it is never shown then). */
export function caughtOf(v: unknown): CaughtView | null {
  const c = v as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.since !== "string") return null;
  const n = (k: string) => (Number.isInteger(c[k]) && (c[k] as number) >= 0 ? (c[k] as number) : 0);
  const out: CaughtView = { since: c.since, falseDones: n("falseDones"), keys: n("keys"), weakened: n("weakened"), saved: n("saved"), undone: n("undone") };
  return caughtTotal(out) > 0 ? out : null;
}
export const caughtTotal = (c: CaughtView): number => c.falseDones + c.keys + c.weakened + c.saved + c.undone;

/** The parts of the week's line, only those above zero, in a fixed order; "" when there is nothing (then no line shows). */
export function caughtParts(c: CaughtView | null | undefined): string[] {
  if (!c) return [];
  const w = S.guard.caughtPart;
  const out: string[] = [];
  if (c.falseDones) out.push(w.falseDones(c.falseDones));
  if (c.keys) out.push(w.keys(c.keys));
  if (c.weakened) out.push(w.weakened(c.weakened));
  if (c.saved) out.push(w.saved(c.saved));
  if (c.undone) out.push(w.undone(c.undone));
  return out;
}
export const thisWeekLine = (c: CaughtView | null | undefined, on = true): string => (on && c && caughtParts(c).length ? S.guard.thisWeek(caughtParts(c)) : "");

/** The saved copy's row as History draws it. Undo is offered only while nothing works on the project and no Undo is under
 *  way; a copy an Undo already went back to says so instead. */
export function savedRowLook(r: SavedRowView, o: { running: boolean; undoing: boolean }): { title: string; line: string; mark: string; undo: boolean } {
  return { title: S.guard.savedRow(r.command), line: r.undone ? S.guard.savedUsed : S.guard.savedLine, mark: S.guard.savedMark, undo: !r.undone && !o.running && !o.undoing };
}

/** What the changes did not tell you, as up to three plain lines: beyond the usual files, skipped, left broken. */
export function untoldLines(u: ReviewUntold | null | undefined): string[] {
  if (!u) return [];
  const out: string[] = [];
  if (u.beyond.length) out.push(S.guard.untold.beyond(u.beyond.join(", "), u.beyondMore));
  const notRun = u.checks === "not_run" || u.checks === "unknown";
  if (notRun && u.todos) out.push(S.guard.untold.skippedBoth(u.todos));
  else if (notRun) out.push(S.guard.untold.skippedChecks);
  else if (u.todos) out.push(S.guard.untold.skippedTodos(u.todos));
  if (u.checks === "failed") out.push(S.guard.untold.broken);
  return out.slice(0, 3);
}
/** The untold part of a review.result as the page keeps it, or undefined for anything that does not keep to the protocol. */
export function untoldOf(v: unknown): ReviewUntold | undefined {
  const u = v as Record<string, unknown> | null;
  if (!u || typeof u !== "object" || Array.isArray(u) || !Array.isArray(u.beyond) || !(REVIEW_CHECKS as readonly string[]).includes(u.checks as string)) return undefined;
  const beyond = (u.beyond as unknown[]).filter((f): f is string => typeof f === "string" && f.length > 0).slice(0, 5).map((f) => redact(f).slice(0, 200));
  return { beyond, beyondMore: Number.isInteger(u.beyondMore) && (u.beyondMore as number) > 0 ? (u.beyondMore as number) : 0, todos: Number.isInteger(u.todos) && (u.todos as number) > 0 ? (u.todos as number) : 0, checks: u.checks as ReviewUntold["checks"] };
}

/** The project's short name for the waiting line. */
export const projectName = (project: string | null | undefined): string => (project ?? "").split("/").filter(Boolean).at(-1) ?? "";

/** M85: the asks that keep to the protocol (tasks.list asked), at most 50, secrets hidden again; anything else is left out. */
export function askedRowsOf(v: unknown): AskedRowView[] {
  if (!Array.isArray(v)) return [];
  const out: AskedRowView[] = [];
  for (const x of v as Record<string, unknown>[]) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    if (!Number.isInteger(x.id) || typeof x.at !== "string" || Number.isNaN(Date.parse(x.at)) || typeof x.command !== "string" || typeof x.reason !== "string" || (x.by !== "tool" && x.by !== "squibby")) continue;
    const answer = ["once", "always", "no", "expired"].includes(x.answer as string) ? (x.answer as AskedRowView["answer"]) : undefined;
    out.push({ id: x.id as number, at: x.at, command: redact(x.command).slice(0, 80), reason: redact(x.reason).slice(0, 300), by: x.by, ...(answer ? { answer } : {}) });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}
/** M85: an ask's row as History draws it: the command, who asked and what was answered, and the reason under it. */
export function askedRowLook(r: AskedRowView): { title: string; lead: string; command: string; line: string; mark: string; tone: "blue" | "orange" | "red" } {
  const a = S.guard.asked;
  const mark = r.by === "tool" ? a.byTool : r.answer === "always" ? a.always : r.answer === "once" ? a.once : r.answer === "expired" ? a.expired : a.no;
  return { title: a.row(r.command), lead: a.lead, command: r.command, line: r.reason, mark, tone: r.by === "tool" ? "blue" : r.answer === "no" || r.answer === "expired" ? "red" : "orange" };
}
/** M85 review: the longest word of a command History keeps whole on one line; a longer one (a long path) may break. */
export const WHOLE_WORD = 40;
/** M85 review: a command's words for History, so a line breaks only between words ("--linked" never splits after its
 *  dashes); a word longer than WHOLE_WORD may still break, so nothing runs off the row. */
export function commandParts(command: string): { text: string; whole: boolean }[] {
  return command.split(/\s+/).filter(Boolean).map((text) => ({ text, whole: Array.from(text).length <= WHOLE_WORD }));
}
/** M85: the receipt's flags that keep to the protocol, as the receipt keeps them; nothing when there are none. */
export function flagsOf(v: unknown): { flags?: { kind: "not_asked" | "said_other"; say: string }[] } {
  if (!Array.isArray(v)) return {};
  const out = v.filter((f): f is { kind: "not_asked" | "said_other"; say: string } => !!f && typeof f === "object" && (f.kind === "not_asked" || f.kind === "said_other") && typeof f.say === "string" && f.say.length > 0)
    .slice(0, 2).map((f) => ({ kind: f.kind, say: redact(f.say).slice(0, 400) }));
  return out.length ? { flags: out } : {};
}
