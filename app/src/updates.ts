// Updates on the card: what to say, and when the daily check is due. The check itself and the install are in the Mac
// side (updates.rs); nothing happens without a press except the daily check, which only looks and never installs.
export const DAY_MS = 24 * 60 * 60 * 1000;
/** An update the daily check found, kept so Settings can offer Install without asking again. In memory only. */
export const found: { update: UpdateState | null } = { update: null };
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
  // M69 (spec 3.9): never "Version ." when the shell has not said its version yet. Every word is in strings.ts.
  const w = S.updateWords, v = current.trim() ? w.version(current.trim()) : "";
  const and = (t: string) => (v ? `${v} ${t}` : t);
  // M69 step 3: said so the switch under it reads right: it is the daily check that starts once updates are set up.
  if (!configured) return and(w.notSetUp);
  switch (s.stage) {
    case "checking": return w.checking;
    case "none": return and(w.newest);
    case "found": return w.found(s.version, current);
    case "installing": return w.installing;
    case "failed": return s.reason;
    default: return v;
  }
}

/** An install that failed (the Wi-Fi dropped, a task started): the shell kept the update, so the page puts it back as found,
 *  Install shows again, and the reason sits beside it. With no update known, the failure is simply shown. */
export function afterInstallFailed(prev: UpdateState | null, reason: string): { update: UpdateState | null; state: UpdateState; note: string } {
  if (prev && prev.stage === "found") return { update: prev, state: prev, note: reason };
  return { update: null, state: { stage: "failed", reason }, note: "" };
}

/** Installing restarts Companion, which would stop anything running, so it waits until nothing is running. */
export const canInstall = (working: boolean) => !working;

import { waitsForAnswer, type Model } from "./model.ts";
import { S } from "./strings.ts";

type Busy = { character?: string; task?: unknown; receipt?: unknown; agents?: unknown; plan?: unknown; paused?: unknown; agentsAsk?: unknown; drive?: unknown; stuck?: unknown; approvals?: unknown[]; install?: { stage?: string } | null; practice?: { stage?: string } | null; shipFlow?: { stage?: string } | null; diagram?: { stage?: string } | null; point?: { stage?: string } | null };

/** Anything under way that a restart would cut off. When in doubt it says busy: the person can wait a minute. */
export function isBusy(m: Busy): boolean {
  // A task that ended on a question has nothing running (it waits for an answer in the follow up box): a restart cuts nothing off.
  const asked = m.character === "needsYou" && !!m.receipt && !!m.task && !!m.agents && Array.isArray(m.approvals) && waitsForAnswer(m as unknown as Model);
  if (!asked && ["thinking", "working", "checking", "needsYou"].includes(m.character ?? "")) return true;
  // A Drive plan that has finished is not running (its panel stays until closed).
  if ((m.drive && !(m.drive as { finished?: unknown }).finished) || m.stuck || (m.approvals && m.approvals.length > 0)) return true;
  if (m.install?.stage === "installing" || m.practice?.stage === "fixing") return true;
  if (m.shipFlow && !["ready", "live", "rolled_back", "failed", "refused", "not_signed_in"].includes(m.shipFlow.stage ?? "")) return true;
  if (m.diagram?.stage === "asking" || m.point?.stage === "checking") return true;
  return false;
}
/** May Install be pressed now? The one guard every Install button and its busy line ask: only when nothing runs. */
export const installAllowed = (m: Busy): boolean => canInstall(isBusy(m));

/** The version in the shell's "update-ready" (a check found one), or null when there is none any more. Only a plain
 *  version is taken: digits, letters, dots, dashes and plus, at most 40 characters. */
export function readyVersion(v: unknown): string | null {
  const x = (v as { version?: unknown } | null)?.version;
  return typeof x === "string" && /^[0-9A-Za-z.+-]{1,40}$/.test(x) ? x : null;
}

// ---------- M89: updates that install while the person is away ----------
// The shell decides the quiet part (updates.rs quiet_install_ok: 5 minutes with no input, nothing running, no call, no
// screen look, not listening or speaking) and then asks this page with "update-quiet-ready". The page adds what only it
// knows (isBusy: a deploy, an install, a practice, a Draw it or Point at the problem under way) and the person's switch,
// then asks the shell to install with quiet: true, which checks its own conditions again before anything is taken.
type Quiet = Busy & { voice?: { stage?: string } | null; speaking?: unknown };
/** May an update install by itself right now, as far as this page can tell. Off when Install updates while away is off. */
export function quietInstallOk(m: Quiet, settingOn: unknown): boolean {
  if (settingOn === false) return false;
  if (!installAllowed(m)) return false;
  // Listening, turning speech into words, or a question asked by voice: the person is here, whatever the clock says.
  if (m.voice?.stage && !["idle", "model_ready", "error", "silent", "blocked"].includes(m.voice.stage)) return false;
  return true;
}
/** The note after a quiet install (the shell's update_note_take, read once after the restart): the version it went to, or
 *  null when there is none. Only a plain version is taken, as readyVersion does. */
export function updatedWords(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const ver = readyVersion(v);
  return ver ? S.m89.updated(ver) : (v as { updated?: unknown }).updated === true ? S.m89.updatedPlain : null;
}
