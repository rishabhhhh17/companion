// Updates on the card: what to say, and when the daily check is due. The check itself and the install are in the Mac
// side (updates.rs); nothing happens without a press except the daily check, which only looks and never installs.
export const DAY_MS = 24 * 60 * 60 * 1000;
export type UpdateState =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "none" }
  | { stage: "found"; version: string; notes: string }
  | { stage: "installing" }
  | { stage: "failed"; reason: string };

/** The daily check: on by default, off if the person turned it off, at most once a day, never when not set up. */
export function autoCheckDue(o: { configured: boolean; enabled: boolean; lastMs: number | null; nowMs: number }): boolean {
  return o.configured && o.enabled && (o.lastMs === null || !Number.isFinite(o.lastMs) || o.nowMs - o.lastMs >= DAY_MS || o.nowMs < o.lastMs - DAY_MS);
}

export function updateLine(s: UpdateState, current: string, configured: boolean): string {
  if (!configured) return `Version ${current}. Updates are not set up in this build yet.`;
  switch (s.stage) {
    case "checking": return "Looking for a new version…";
    case "none": return `Version ${current}. You have the newest version.`;
    case "found": return `Version ${s.version} is ready. You have ${current}.`;
    case "installing": return "Downloading and installing. Companion will restart in a moment.";
    case "failed": return s.reason;
    default: return `Version ${current}.`;
  }
}

/** Installing restarts Companion, which would stop anything running, so it waits until nothing is running. */
export const canInstall = (working: boolean) => !working;

type Busy = { character?: string; drive?: unknown; stuck?: unknown; approvals?: unknown[]; install?: { stage?: string } | null; practice?: { stage?: string } | null; shipFlow?: { stage?: string } | null; diagram?: { stage?: string } | null; point?: { stage?: string } | null };

/** Anything under way that a restart would cut off. When in doubt it says busy: the person can wait a minute. */
export function isBusy(m: Busy): boolean {
  if (["thinking", "working", "checking", "needsYou"].includes(m.character ?? "")) return true;
  if (m.drive || m.stuck || (m.approvals && m.approvals.length > 0)) return true;
  if (m.install?.stage === "installing" || m.practice?.stage === "fixing") return true;
  if (m.shipFlow && !["ready", "live", "rolled_back", "failed", "refused", "not_signed_in"].includes(m.shipFlow.stage ?? "")) return true;
  if (m.diagram?.stage === "asking" || m.point?.stage === "checking") return true;
  return false;
}
