// Settings page helpers: plain words only, so they can be tested without a screen.
import { keyLooksRight } from "./onboarding.ts";
import { S } from "./strings.ts";
import type { Spending } from "./model.ts";

export type Inventory = { items: { id: string; label: string; bytes: number }[]; keySaved: boolean; projectsWithNotes: number };
export type PermissionKind = "screen_recording" | "accessibility" | "microphone";
/** What the app reports (permissions.rs, page_word). "off" is for Accessibility and Screen Recording, where macOS cannot
 * tell never asked from said no; the microphone reports which one it is ("not_asked", "not_allowed", "restricted"). */
export type PermissionState = "allowed" | "off" | "not_allowed" | "not_asked" | "restricted" | "unknown";

// Your turn teaching (offer to make the second of two identical changes yourself). Off unless the person turns it on, kept
// only in this Mac's page storage; with no storage it stays off.
const YOUR_TURN_KEY = "companion.yourTurn";
export function yourTurnOn(): boolean { try { return localStorage.getItem(YOUR_TURN_KEY) === "on"; } catch { return false; } }
export function setYourTurn(on: boolean): void { try { localStorage.setItem(YOUR_TURN_KEY, on ? "on" : "off"); } catch { /* storage may be unavailable */ } }

/** The exact words the app is given to delete everything. A different string deletes nothing. */
export const DELETE_PHRASE = "delete everything";

export function formatBytes(n: number): string {
  if (n <= 0) return "nothing";
  if (n < 1024) return "under 1 KB";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const ROWS: Record<PermissionKind, { label: string; why: string }> = {
  screen_recording: { label: "Screen Recording", why: "Lets Companion look at your screen once when you press its key, so it can point at what is wrong. Asked the first time you use that." },
  accessibility: { label: "Accessibility", why: "Lets Companion find the exact button or line you need and, if you ask, click it for you. Asked the first time you use that." },
  microphone: { label: "Microphone", why: "Lets you hold the talk keys and speak. It listens only while you hold them. Asked the first time you use that." },
};
/** One permission in words: its state, what to do about it (empty when nothing), and whether System Settings can help. */
export function permissionRow(kind: PermissionKind, s: PermissionState): { label: string; why: string; state: string; todo: string; button: boolean } {
  const [state, todo] = ({
    allowed: [S.permAllowed, ""], off: [S.permOff, S.permOffTodo], not_asked: [S.permNotAsked, S.permNotAskedTodo],
    not_allowed: [S.permRefused, S.permRefusedTodo], restricted: [S.permRestricted, S.permRestrictedTodo], unknown: [S.permUnknown, ""],
  } as Record<PermissionState, [string, string]>)[s] ?? [S.permUnknown, ""];
  return { ...ROWS[kind], state, todo, button: s === "not_allowed" || s === "off" };
}

export function deletableLines(inv: Inventory): string[] {
  return [...inv.items.map((i) => `${i.label}: ${formatBytes(i.bytes)}`), ...(inv.keySaved ? ["Your saved Claude key (in your Keychain)"] : [])];
}

export type NumbersSummary = { enabled: boolean; totals: Record<string, number>; rates: Record<string, number | null> };
const pct = (r: number | null | undefined) => (typeof r === "number" ? `${Math.round(r * 100)}%` : "not enough yet");

/** The numbers in plain words, to read here or copy and send by hand. Counts only. */
export function numbersLines(s: NumbersSummary): string[] {
  const t = (k: string) => s.totals[k] ?? 0;
  return [
    `Times you used Companion: ${t("session")}`,
    `Times you pressed the key for a problem: ${t("hero_press")}`,
    `Lessons started: ${t("walk_started")}, finished: ${t("walk_done")} (${pct(s.rates.walkCompletion)})`,
    `Lesson steps that worked the first way: ${pct(s.rates.stepSuccess)}`,
    `Checks that passed: ${pct(s.rates.proofPass)}`,
    `Pointing in other apps compared with builder tools: ${pct(s.rates.anywhereShare)}`,
    `Times you corrected a guess: ${s.rates.softRingCorrections ?? 0}`,
  ];
}

/** The shipped lesson that walks a person through allowing this permission (see lessons/). */
export const permissionLesson = (kind: PermissionKind): string => `companion-${kind.replace(/_/g, "-")}`;

// ---- the daily spending limit ----
const dollars = (n: number, cents: boolean) => `$${cents || !Number.isInteger(n) ? n.toFixed(2) : String(n)}`;

/** Today's spend for this project against its limit, in plain words. Always "about": it is Companion's own estimate. */
export function spendingLine(s: Spending): string {
  const line = S.spendingToday.replace("{spent}", dollars(s.spentUsd, true)).replace("{limit}", dollars(s.limitUsd, false));
  return s.spentUsd >= s.limitUsd ? `${line} ${S.spendingOver}` : line;
}

/** What the person typed as a new limit: dollars (a "$" in front is fine, at most two places after the point) within the
 *  bounds. Anything else is not an amount, and nothing is sent. */
export function limitFromText(text: string, min: number, max: number): number | null {
  const t = text.trim().replace(/^\$\s*/, "");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Every hotkey a person can press at any time, in words (shown at the end of the first run and in Settings). The keys
 * named here are checked against the ones the app registers (hotkeys.test.ts). */
export const keyHints = (): string[] => [S.cardHint, S.pointHint, S.showMeKeyHint, S.phKeyHint, S.errKeyHint, S.voiceHint, S.stopHint];

/** The exact words Settings sends to remove the key (the app checks the same words, keystore::REMOVE_PHRASE). */
export const REMOVE_KEY_PHRASE = "remove the key";

export const keyStatus = (saved: boolean): string => (saved ? S.keySaved : S.keyNone);

/** Pressing Save on a new key in Settings: the box is emptied at once whatever happens, and the key is sent only when it
 * passes the same checks as the first run (the app checks it again before it goes into the Keychain). */
export function submitKey(raw: string): { clear: true; send: string | null; problem: string | null } {
  const problem = keyLooksRight(raw);
  return { clear: true, send: problem ? null : raw.trim(), problem };
}

// ---- screen sharing and calls (rule 7) ----
/** Both on unless the person turned them off; the app keeps them (app/src-tauri/src/presentation.rs). */
export type Presentation = { hideFromSharing: boolean; quietOnCalls: boolean };
export const PRESENTATION_DEFAULT: Presentation = { hideFromSharing: true, quietOnCalls: true };
/** What the app answered, read safely: anything that is not a clear "off" counts as on. */
export function presentationFrom(v: unknown): Presentation {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return { hideFromSharing: o.hideFromSharing !== false, quietOnCalls: o.quietOnCalls !== false };
}

// ---- Show me on all screens ----
/** Off unless the person turns it on: Show me looks only at the display under the mouse pointer (product doc sections 5
 *  and 10). On, the same press looks at every display, with the light on first and secrets covered on each. */
const ALL_SCREENS_KEY = "companion.showmeAllScreens";
export function allScreensOn(): boolean { try { return localStorage.getItem(ALL_SCREENS_KEY) === "1"; } catch { return false; } }
export function setAllScreens(on: boolean) { try { localStorage.setItem(ALL_SCREENS_KEY, on ? "1" : "0"); } catch { /* storage may be unavailable */ } }
