// M58 (the shortlist, item 5, and item 8's words): Last working, a save point's name, the fixed line under Undo, and the
// sign in wall said as the person's turn. Pure. Rolling back to any save is the person's tap, and makes its own safety
// copy first (the engine's checkpoint.restore); these are shadow snapshots only, never git.
import { S } from "./strings.ts";

const timeOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "Last working, 2:14 pm", or just "Last working" when the time cannot be read. */
export function lastWorkingLabel(at: string | null | undefined, fmt: (d: Date) => string = timeOf): string {
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? S.fix.lastWorkingAt(fmt(d)) : S.fix.lastWorking;
}
/** Just the time, for the confirm question. Null when it cannot be read. */
export function lastWorkingTime(at: string | null | undefined, fmt: (d: Date) => string = timeOf): string | null {
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? fmt(d) : null;
}

/** The fixed, plain line under every Undo. When the receipt already names installed packages it is not said twice. */
export function undoLimitsLine(notUndoable: string[]): string {
  return notUndoable.some((x) => /node_modules|installed packages/i.test(x)) ? S.fix.undoLimitsShort : S.fix.undoLimits;
}

/** A save point's name as the engine keeps it (runner checkpoints.ts cleanSaveName): one line, at most 40 characters. */
export function saveName(t: string): string {
  return t.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
}

/** The browser check stopped at a sign in wall: the person's turn, never proven, never typed for them. Null otherwise. */
export function signInTurn(steps: { rung: string; status: string; needs?: string }[] | null | undefined): string | null {
  return (steps ?? []).some((s) => s.needs === "signIn") ? S.fix.signInTurn : null;
}
