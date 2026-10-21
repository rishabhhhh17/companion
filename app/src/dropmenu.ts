// F19, drop a file on the companion. The shell sees the drop on Companion's own windows (the character's window and the
// island), checks the files and decides what they may get (convert.rs); it sends this page the menu with the files' names
// only, never their paths, and runs the Mac's own tools when an action is chosen. This file is the page's part: the menu's
// state (one reducer for the ring by the character and the list in Home), its keys, the ring's places and its words.
import { S } from "./strings.ts";

export type Kind = "image" | "pdf" | "document" | "audio" | "video" | "archive" | "folder" | "other";
export type Menu = { id: number; names: string[]; kind: Kind | null; actions: string[]; refused: string | null; at: "dock" | "island" };
export type Made = { name: string; i: number };
export type Job =
  | { id: number; phase: "running"; done: number; of: number; percent: number | null }
  // failed: how many files could not be converted (the others were still made), with the first one's name and reason.
  | { id: number; phase: "done"; made: Made[]; why: string | null; skipped: number; failed?: number; failedName?: string; failedWhy?: string }
  | { id: number; phase: "failed"; why: string; made: Made[] }
  // Stopped part way: what was made before the Stop is new, replaces nothing, and stays, so it is named.
  | { id: number; phase: "stopped"; made: Made[] };
export type DropState = { hover: boolean; menu: Menu | null; focus: number; trim: boolean; job: Job | null };
export type Move = "next" | "prev" | "first" | "last";
export type DropAction =
  | { type: "hover"; over: boolean }
  | { type: "menu"; menu: Menu | null }
  | { type: "move"; to: Move }
  | { type: "focus"; i: number }
  | { type: "trim"; open: boolean }
  | { type: "job"; job: Job | null }
  | { type: "close" };

export const EMPTY: DropState = { hover: false, menu: null, focus: 0, trim: false, job: null };

const KINDS: readonly Kind[] = ["image", "pdf", "document", "audio", "video", "archive", "folder", "other"];
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string";

/** The words for an action, or null for one this page does not know (it is then never shown). */
export function actionWords(id: string): { short: string; label: string } | null {
  return (S.drop.actions as Record<string, { short: string; label: string }>)[id] ?? null;
}

/** The menu the shell sent, checked; anything else is no menu. */
export function menuFrom(v: unknown): Menu | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !num(o.id) || !Array.isArray(o.names) || !o.names.every(str) || !Array.isArray(o.actions)) return null;
  if (o.at !== "dock" && o.at !== "island") return null;
  const kind = KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : null;
  return { id: o.id, names: o.names as string[], kind, actions: (o.actions as unknown[]).filter(str).filter((a) => actionWords(a) !== null), refused: str(o.refused) ? o.refused : null, at: o.at };
}

const madeFrom = (v: unknown): Made[] => (Array.isArray(v) ? v.filter((m) => m && str(m.name) && num(m.i)).map((m) => ({ name: m.name as string, i: m.i as number })) : []);

/** A job's news, checked. */
export function jobFrom(v: unknown): Job | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !num(o.id)) return null;
  switch (o.phase) {
    case "running": return { id: o.id, phase: "running", done: num(o.done) ? o.done : 0, of: num(o.of) ? o.of : 1, percent: num(o.percent) ? o.percent : null };
    case "done": return {
      id: o.id, phase: "done", made: madeFrom(o.made), why: str(o.why) ? o.why : null, skipped: num(o.skipped) && o.skipped > 0 ? o.skipped : 0,
      ...(num(o.failed) && o.failed > 0 && str(o.failedName) ? { failed: o.failed, failedName: o.failedName, ...(str(o.failedWhy) ? { failedWhy: o.failedWhy } : {}) } : {}),
    };
    case "failed": return { id: o.id, phase: "failed", why: str(o.why) ? o.why : "other", made: madeFrom(o.made) };
    case "stopped": return { id: o.id, phase: "stopped", made: madeFrom(o.made) };
    default: return null;
  }
}

/** The new files a job made, for Show in Finder: also those made before it was stopped or failed part way. */
export const madeOf = (j: Job): Made[] => (j.phase === "running" ? [] : j.made);

/** Whether a job's news means a line said while it ran (a refused second drop, a double click) is out of date. */
export const clearsSaid = (j: Job | null): boolean => j?.phase !== "running";

/** Whether a job is still going (the menu then cannot be closed: Stop ends it). */
export const running = (s: DropState): boolean => s.job?.phase === "running";

export function dropReduce(s: DropState, a: DropAction): DropState {
  switch (a.type) {
    case "hover": return { ...s, hover: a.over };
    case "menu":
      if (!a.menu) return running(s) ? s : { ...EMPTY };
      // A new drop starts again at the top, with nothing running and the drag over.
      return { hover: false, menu: a.menu, focus: 0, trim: false, job: null };
    case "move": {
      const n = s.menu?.actions.length ?? 0;
      if (!n) return s;
      const focus = a.to === "first" ? 0 : a.to === "last" ? n - 1 : (s.focus + (a.to === "next" ? 1 : -1) + n) % n;
      return { ...s, focus };
    }
    case "focus": return s.menu && Number.isInteger(a.i) && a.i >= 0 && a.i < s.menu.actions.length ? { ...s, focus: a.i } : s;
    case "trim": return s.menu ? { ...s, trim: a.open } : s;
    case "job":
      if (!a.job || !s.menu || a.job.id !== s.menu.id) return s;
      return { ...s, job: a.job, trim: a.job.phase === "running" ? false : s.trim };
    case "close": return running(s) ? s : { ...EMPTY };
  }
}

/** What a key does in the menu. */
export function keyMove(key: string): Move | "close" | "pick" | null {
  switch (key) {
    case "ArrowRight": case "ArrowDown": return "next";
    case "ArrowLeft": case "ArrowUp": return "prev";
    case "Home": return "first";
    case "End": return "last";
    case "Escape": return "close";
    case "Enter": case " ": return "pick";
    default: return null;
  }
}

/** Where each of `n` buttons goes on a ring of radius `r` around the middle: the first at the top, then clockwise. */
export function ringSpots(n: number, r: number): { x: number; y: number }[] {
  const round = (v: number) => Math.round(v * 1000) / 1000 + 0;   // + 0 turns -0 into 0
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: round(r * Math.sin(a)), y: round(-r * Math.cos(a)) };
  });
}

/** A time typed for a trim: seconds ("90", "2.5"), minutes and seconds ("1:30") or hours too ("1:02:03"). Only the seconds
 *  (the last part) may have a decimal: "1.5:30" is not a time, so a clip is never cut at a place the person did not mean. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length > 3 || !parts.every((p, i) => (i === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p))) return null;
  const n = parts.map(Number);
  if (n.slice(1).some((v) => v >= 60)) return null;
  return n.reduce((sum, v) => sum * 60 + v, 0);
}

/** The two times of a trim; an empty start is the beginning. Null unless the end comes after the start. */
export function trimFrom(start: string, end: string): { start: number; end: number } | null {
  const s = start.trim() === "" ? 0 : parseTime(start);
  const e = parseTime(end);
  return s !== null && e !== null && e > s ? { start: s, end: e } : null;
}

/** The one line that says how a job is going or how it ended. */
export function jobLine(j: Job): string {
  switch (j.phase) {
    case "running": return j.percent !== null && j.of <= 1 ? S.drop.working(Math.round(j.percent)) : S.drop.workingOf(Math.min(j.done + 1, j.of), j.of);
    case "done": {
      const made = j.made.length === 1 ? S.drop.made(j.made[0].name) : S.drop.madeMany(j.made.length);
      const rest = [j.skipped > 0 ? S.drop.skipped(j.skipped) : "", j.failed && j.failedName ? S.drop.failedSome(j.failed, j.failedName) : ""].filter(Boolean);
      return [made, ...rest].join(" ");
    }
    case "failed": return (S.drop.why as Record<string, string>)[j.why] ?? S.drop.why.other;
    case "stopped": return j.made.length > 0 ? S.drop.stoppedMade(j.made.length) : S.drop.stopped;
  }
}

/** Why a drop got no actions, in plain words. */
export const refusedLine = (code: string): string => (S.drop.refused as Record<string, string>)[code] ?? S.drop.refused.unknownKind;

/** What the menu is about: the file's name, or how many files. */
export const namesLine = (m: Menu): string => (m.names.length === 1 ? m.names[0] : S.drop.files(m.names.length));

/** A true word of warning for a kind of file, said before an action is chosen: what the Mac's own tools leave out. */
export const kindNote = (kind: Kind | null): string | null => (kind === "document" ? S.drop.noPictures : kind === "image" ? S.drop.imageNote : kind === "archive" ? S.drop.zipNote : null);
