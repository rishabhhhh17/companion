// Show the first run again (M18): from Settings, in Home or in its own window. The first run is remembered only on this Mac
// (Home's page storage, "companion.onboarded"); forgetting it brings the first run back in Home. Home hears it from its own
// page (an event) or from the Settings window (the storage event every other page of the app gets), and opens. Nothing
// else is touched: the key, the folder, the settings and memory stay as they are.
export const ONBOARDED_KEY = "companion.onboarded";
export const AGAIN_EVENT = "companion-first-run-again";

/** Whether the first run was finished on this Mac. Storage that cannot be read counts as finished, so it is never forced. */
export function onboardedNow(store: Pick<Storage, "getItem"> | null = safeStore()): boolean {
  try { return store ? store.getItem(ONBOARDED_KEY) === "1" : true; } catch { return true; }
}
/** Forget that the first run was finished, and tell this page. */
export function showFirstRunAgain(store: Pick<Storage, "removeItem"> | null = safeStore(), tell: (e: Event) => void = (e) => window.dispatchEvent(e)): void {
  try { store?.removeItem(ONBOARDED_KEY); } catch { /* storage may be unavailable */ }
  tell(new Event(AGAIN_EVENT));
}
function safeStore(): Storage | null { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } }
