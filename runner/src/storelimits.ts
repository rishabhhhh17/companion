// M74: Safety copies in Settings (Privacy): how big the store of safety copies may grow and how old a copy may get. The
// usual values are what was built before: about 2 GB, and any age (only the newest 100 and what is still in use are kept).
const GB = 1024 * 1024 * 1024;
export const KEEP_SIZE_GB: Readonly<Record<string, number>> = { "1": 1, "2": 2, "5": 5 };
export const KEEP_AGE_DAYS: Readonly<Record<string, number | null>> = { "7": 7, "30": 30, "90": 90, any: null };

/** The store's limits from the two settings. Anything that is not one of the choices is the usual value. */
export function storeLimits(get: (key: string) => unknown): { capBytes: number; maxAgeDays: number | null } {
  const size = KEEP_SIZE_GB[String(get("undo.keepSize"))] ?? 2;
  const age = Object.hasOwn(KEEP_AGE_DAYS, String(get("undo.keepAge"))) ? KEEP_AGE_DAYS[String(get("undo.keepAge"))] : null;
  return { capBytes: size * GB, maxAgeDays: age };
}
