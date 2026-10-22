// Settings page helpers: plain words only, so they can be tested without a screen.
import { keyLooksRight } from "./onboarding.ts";
import { S, PRODUCT } from "./strings.ts";
import { canPick, chordLabel, JOBS, KEY_DEFAULTS, keyHint, keysNow, type Choices, type Job, type Keys } from "./keys.ts";
import type { Spending } from "./model.ts";
import { setting } from "./settingsStore.ts";

// receiptPictures: how many receipt pictures are kept now (wipe.rs), so lowering "Pictures to keep" can say first how many go.
// practiceCopies: how many practice copies Companion made and recorded are still in the home folder (practice.rs).
export type Inventory = { items: { id: string; label: string; bytes: number }[]; keySaved: boolean; projectsWithNotes: number; receiptPictures?: number; practiceCopies?: number };
export type PermissionKind = "screen_recording" | "accessibility" | "microphone";
/** What the app reports (permissions.rs, page_word). "off" is for Accessibility and Screen Recording, where macOS cannot
 * tell never asked from said no; the microphone reports which one it is ("not_asked", "not_allowed", "restricted"). */
export type PermissionState = "allowed" | "off" | "not_allowed" | "not_asked" | "restricted" | "unknown";

// Your turn teaching (offer to make the second of two identical changes yourself): teach.yourTurn in the registry (T16),
// off unless the person turns it on, read through settingsStore.ts and changed only in Settings.
export const yourTurnOn = (): boolean => setting("teach.yourTurn") === true;

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
  screen_recording: { label: "Screen Recording", why: `Lets ${PRODUCT} look at your screen once when you press its key, so it can point at what is wrong. Asked the first time you use that.` },
  accessibility: { label: "Accessibility", why: `Lets ${PRODUCT} find the exact button or line you need and, if you ask, click it for you. Asked the first time you use that.` },
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
    `Times you used ${PRODUCT}: ${t("session")}`,
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

// ---- keys (M11 wave 4): every job's keys, each changeable; hold to talk (F18.3) is one of them ----
// The app keeps and registers them (app/src-tauri/src/keymap.rs); keys.ts holds the keys in use on the page.
export const TALK_DEFAULT = KEY_DEFAULTS.talk;
const TALK_COSTS: Record<string, string> = S.talkKeyCosts;
const jobName = (j: Job): string => (S.keyJobs as Record<Job, string>)[j];
/** What a hold to talk chord gives up while it is hold to talk, said beside the picker; empty for the default and anything else. */
export const talkCost = (id: string): string => TALK_COSTS[id] ?? "";
/** The hold to talk hint: the keys in use, or where to pick keys when another app holds them. */
export const voiceHint = (k: Keys = keysNow()): string => keyHint("talk", S.voiceHint, k, S.voiceHintOff);
/** The first run's warning that Alfred, Raycast and ChatGPT may share Option and Space with no notice (macOS lets both
 *  have them unless the other app took them alone), only while hold to talk uses them. */
export const talkSharedNote = (k: Keys = keysNow()): string => (k.using.talk === TALK_DEFAULT ? S.talkKeysShared : "");

/** Every hotkey a person can press at any time, in words, with the keys in use now (shown at the end of the first run).
 *  hotkeys.test.ts checks that each names the keys keymap.rs registers for its job. */
export const keyHints = (k: Keys = keysNow()): string[] => [
  keyHint("card", S.cardHint, k), keyHint("problem", S.pointHint, k), keyHint("showme", S.showMeKeyHint, k),
  keyHint("read", S.phKeyHint, k), keyHint("explain", S.errKeyHint, k), keyHint("secondlook", S.slKeyHint, k), voiceHint(k), keyHint("stop", S.stopHint, k),
];

/** One row of Keys to remember in Settings: the job, its keys now, and a line when something needs saying. `problem` when
 *  the job has no keys, or is not on the ones the person picked. */
export type KeyRow = { job: Job; name: string; keys: string; line: string; problem: boolean };
export function keyRows(k: Keys = keysNow()): KeyRow[] {
  return JOBS.map((job) => {
    const using = k.using[job], picked = k.picked[job];
    const row = (line: string, problem: boolean): KeyRow => ({ job, name: jobName(job), keys: using ? chordLabel(using) : S.keysNone, line, problem });
    if (!using) return row((job === "stop" ? S.keysStopOff : job === "talk" ? S.talkKeysOff : S.keysOff).replace("{keys}", chordLabel(picked)), true);
    if (using !== picked) return row((job === "talk" ? S.talkKeysFellBack : S.keysFellBack).replace("{picked}", chordLabel(picked)).replace("{using}", chordLabel(using)), true);
    if (job === "talk") return row(using === TALK_DEFAULT ? S.talkKeysNowDefault : S.talkKeysNow, false);
    // Registered only while a Prompt help suggestion shows (keymap.rs armed_only), so say when they work.
    if (job === "accept") return row(S.keysAcceptWhen, false);
    return row("", false);
  });
}
/** The lines under a job's short list once Change is pressed: its picked keys free again (another app let go since
 *  launch), and one plain reason each for keys another app has and keys another job has. Not for the keys the row above
 *  already names. */
export function pickerLines(c: Choices, k: Keys = keysNow()): string[] {
  const out: string[] = [];
  const using = k.using[c.job], picked = k.picked[c.job];
  if (!using && canPick(c, picked)) out.push(S.keysFreeNow.replace("{keys}", chordLabel(picked)));
  const said = using !== picked ? picked : null;
  if (c.choices.some((id) => id !== said && !c.ours[id] && !canPick(c, id))) out.push(S.keysNotFree);
  if (c.choices.some((id) => c.ours[id])) out.push(S.keysOurs);
  return out;
}
/** The one line after a change in Settings: what the job uses now. Empty when it has no keys (the row says why). */
export const keyChangedLine = (job: Job, k: Keys = keysNow()): string => {
  const id = k.using[job];
  return id ? S.keysChanged(jobName(job), chordLabel(id)) : "";
};
/** What Reset to the usual keys says, from the app's answer: each job that kept its keys because another app has its usual ones. */
export function resetLine(v: unknown): string {
  const raw = typeof v === "object" && v !== null ? (v as { kept?: unknown }).kept : undefined;
  const kept = (Array.isArray(raw) ? raw : []).filter((j): j is Job => JOBS.includes(j as Job));
  return kept.length ? S.keysResetKept(kept.map(jobName).join(", ")) : S.keysResetDone;
}

/** The exact words Settings sends to remove the key (the app checks the same words, keystore::REMOVE_PHRASE). */
export const REMOVE_KEY_PHRASE = "remove the key";

export const keyStatus = (saved: boolean): string => (saved ? S.keySaved : S.keyNone);

/** Pressing Save on a new key in Settings: the box is emptied at once whatever happens, and the key is sent only when it
 * passes the same checks as the first run (the app checks it again before it goes into the Keychain). */
export function submitKey(raw: string): { clear: true; send: string | null; problem: string | null } {
  const problem = keyLooksRight(raw);
  return { clear: true, send: problem ? null : raw.trim(), problem };
}

// Screen sharing and calls (rule 7) and Come to what it is about (F18 item 2) are settings in the registry (T16), kept by
// the app (presentation.json, dock.json) and shown as its rows; nothing about them is kept or worked out here.

// ---- Show me on all screens ----
/** Off unless the person turns it on: Show me looks only at the display under the mouse pointer (product doc sections 5
 *  and 10). On, the same press looks at every display, with the light on first and secrets covered on each. */
// showme.allScreens in the registry (T16), read through settingsStore.ts.
export const allScreensOn = (): boolean => setting("showme.allScreens") === true;
