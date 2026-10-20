// Memory, Explain and teaching settings the pages apply (the registry, T16), as plain code so each is tested without a
// screen: Start every task off the record, how long "Remembered" stays with Undo, and when Where was I is shown. Each
// usual value is what Home did before these were settings.
import { setting } from "./settingsStore.ts";

const MIN = 60_000;

/** Start every task off the record (task.offRecordByDefault): the box starts ticked, and is ticked again after each send.
 *  What off the record keeps (nothing) is not a setting. */
export const offRecordAtStart = (): boolean => setting("task.offRecordByDefault") === true;

/** The Off the record box after the setting arrives or changes, or after Rescue (which leaves the words in the box): ticked
 *  whenever the setting is on. With it off, the box is unticked only while it is empty. Turning the setting off (on the
 *  Settings tab, inside Home, where the box keeps its words), Reset all, Reset this section, Undo, or a settings file that
 *  could not be read never unticks a box with words in it, so words typed off the record are never kept on this Mac
 *  (askbox.ts draftToKeep). Only the person unticks it then. */
export function offBoxAfter(ticked: boolean, boxText: string, offDefault: boolean = offRecordAtStart()): boolean {
  if (offDefault) return true;
  return ticked && typeof boxText === "string" && boxText.trim() !== "";
}

const TOAST: Record<string, number | null> = { "5": 5_000, "10": 10_000, "20": 20_000, "60": 60_000, untilClosed: null };
/** How long the "Remembered" note stays, with Undo (memory.toastSeconds), in milliseconds; null keeps it until it is
 *  closed. Anything else is the usual ten seconds. */
export function toastMs(choice: unknown = setting("memory.toastSeconds")): number | null {
  const k = typeof choice === "string" ? choice : "";
  return Object.hasOwn(TOAST, k) ? TOAST[k] : 10_000;
}

/** Whether Where was I is asked for when Home opens (where.after): after a break of 30 minutes (usual), 2 hours, or when
 *  the last visit was before today began on this Mac's clock; never when off, or with no last visit. Times are in
 *  milliseconds; anything else is the usual. */
export function recapDue(last: number, now: number, choice: unknown = setting("where.after")): boolean {
  if (!last) return false;
  switch (choice) {
    case "off": return false;
    case "2h": return now - last >= 120 * MIN;
    case "nextDay": { const d = new Date(now); d.setHours(0, 0, 0, 0); return last < d.getTime(); }
    default: return now - last >= 30 * MIN;
  }
}
