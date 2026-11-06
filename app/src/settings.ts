// Settings page helpers: plain words only, so they can be tested without a screen.
import { keyLooksRight } from "./onboarding.ts";
import { S, PRODUCT } from "./strings.ts";
import { canPick, chordLabel, hasKeys, JOBS, KEY_DEFAULTS, keyHint, keysNow, type Choices, type Job, type Keys } from "./keys.ts";
import type { Spending } from "./model.ts";
import { setting } from "./settingsStore.ts";

// receiptPictures: how many receipt pictures are kept now (wipe.rs), so lowering "Pictures to keep" can say first how many go.
// practiceCopies: how many practice copies Companion made and recorded are still in the home folder (practice.rs).
/** pro (data_inventory, wipe.rs pro_inventory): what Delete everything does with Pro, null while payments are off. */
// googleAccounts: how many Google accounts are connected (wipe.rs, data_inventory); Delete everything disconnects them too.
export type Inventory = { items: { id: string; label: string; bytes: number }[]; keySaved: boolean; projectsWithNotes: number; receiptPictures?: number; practiceCopies?: number; googleAccounts?: number; pro?: unknown };
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
  return [...inv.items.map((i) => `${i.label}: ${formatBytes(i.bytes)}`), ...(inv.keySaved ? ["Your saved Claude key (in your Keychain)"] : []), ...((inv.googleAccounts ?? 0) > 0 ? [S.deleteGoogleLine(inv.googleAccounts ?? 0)] : [])];
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
    // M57 feature 1: the review of changes. Counts only, never a streak.
    `Changes ready to review: ${t("review_batch")}, reviews run: ${t("review_run")}`,
    `Reviews that said Looks safe: ${t("review_safe")}, Worth a look: ${t("review_worth_a_look")}, Fix this first: ${t("review_stop")}`,
    `After a review: Fix it ${t("review_fix")}, Copy for my AI ${t("review_send_back")}, Looks fine ${t("review_looks_fine")}`,
    `Where you left off shown: ${t("where_opened")}, daily limit reached: ${t("daily_limit")}`,
    `Times you corrected a guess: ${s.rates.softRingCorrections ?? 0}`,
  ];
}

/** The shipped lesson that walks a person through allowing this permission (see lessons/). */
export const permissionLesson = (kind: PermissionKind): string => `companion-${kind.replace(/_/g, "-")}`;

// ---- the daily spending limit ----
const dollars = (n: number, cents: boolean) => `$${cents || !Number.isInteger(n) ? n.toFixed(2) : String(n)}`;

/** Today's spend for this project against its limit, in plain words. Always "about": it is Companion's own estimate. */
/** M74: the line under Review changes that says when a review starts, from the waits in force. With reviews off in force
 *  (this project's own choice, or the usual one), it says the folder is not watched. */
export function reviewStartLine(mode: unknown, quietSeconds: unknown, autoSeconds: unknown): string {
  if (mode === "off") return S.m74.reviewOff;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : d);
  return S.m74.reviewStarts(S.m74.seconds(n(quietSeconds, 20)), S.m74.seconds(n(autoSeconds, 60)));
}
/** M74: the Privacy page's line about review history, in the words the setting's own choice uses. */
export function reviewKeepLine(keepDays: unknown): string {
  const words = (S.set as Record<string, { options?: Record<string, string> }>)["review.keepDays"]?.options ?? {};
  return S.m74.reviewKeep((words[String(keepDays)] ?? words["90"] ?? "90 days").toLowerCase());
}
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
 *  hotkeys.test.ts checks that each names the keys keymap.rs registers for its job. A job with no keys picked (F28) is
 *  left out: there is nothing to press. */
export const keyHints = (k: Keys = keysNow()): string[] => ([
  ["card", keyHint("card", S.cardHint, k)], ["problem", keyHint("problem", S.pointHint, k)], ["showme", keyHint("showme", S.showMeKeyHint, k)],
  ["read", keyHint("read", S.phKeyHint, k)], ["explain", keyHint("explain", S.errKeyHint, k)], ["secondlook", keyHint("secondlook", S.slKeyHint, k)], ["talk", voiceHint(k)], ["dictate", keyHint("dictate", S.dictateHint, k)], ["stop", keyHint("stop", S.stopHint, k)],
] as [Job, string][]).filter(([j]) => hasKeys(j, k)).map(([, line]) => line);

/** One row of Keys to remember in Settings: the job, its keys now, and a line when something needs saying. `problem` when
 *  the job has no keys because another app holds them, or is not on the ones the person picked. `none`: no keys picked
 *  yet (F28), which is no problem: the row offers Add a key. */
export type KeyRow = { job: Job; name: string; keys: string; line: string; problem: boolean; none?: boolean };
export function keyRows(k: Keys = keysNow()): KeyRow[] {
  return JOBS.map((job) => {
    const using = k.using[job], picked = k.picked[job];
    if (picked === null) return { job, name: jobName(job), keys: S.keysNoKeyYet, line: "", problem: false, none: true };
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
  if (!using && picked && canPick(c, picked)) out.push(S.keysFreeNow.replace("{keys}", chordLabel(picked)));
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
/** The one calm line Settings says once after the update to F28's four keys: the jobs on this Mac that lost their old
 *  usual keys. Empty when there is nothing to say. Never a key the person picked (keymap.rs dropped_by_new_usual). */
export const droppedLine = (k: Keys = keysNow()): string => (k.dropped?.length ? S.keysDropped(k.dropped.map(jobName).join(", ")) : "");
/** The one calm line Settings says once after the launch cut (F28; settings.rs launch_cut): the tools on this Mac that now
 *  start off and that the person had not used. Never one they used, picked a key for or set up: those stayed on. Empty when
 *  there is nothing to say (a new Companion, or once seen). */
export function cutNoticeLine(read: (key: string) => unknown = setting): string {
  const v = read("groups.cutNotice");
  const tools = S.groups.tools as Record<string, { name: string }>;
  const names = (Array.isArray(v) ? v : []).filter((t): t is string => typeof t === "string" && !!tools[t]).map((t) => tools[t].name);
  return names.length ? S.cutNotice(names.join(", ")) : "";
}
/** What the Google section shows (M21, F28). Connecting a new account is part of watch routines (watch.on, usually off), but
 *  an account already kept always shows, so it can be seen and disconnected (rule 6): it keeps working until then. */
export function googleParts(accounts: readonly { signin?: boolean; apps: readonly string[] }[], connecting: boolean): { section: boolean; signIn: boolean; connect: boolean } {
  if (connecting) return { section: true, signIn: true, connect: true };
  const signIn = accounts.some((a) => a.signin);
  return { section: signIn || accounts.some((a) => a.apps.length > 0), signIn, connect: false };
}
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

// ---- Forget everything (the danger zone) ----
/** The two erases Forget everything sends (project, then profile), by command id, and what the engine has answered so
 *  far. The runner answers each command with a memory.state that names it ("answers") and carries its refusal ("refused"),
 *  before the separate memory.refused the Memory page shows (runner/src/agent.ts memoryCommand). An erase can also be
 *  answered by a protocol.error when the erase itself failed. Any other memory.state (a listing, a line an agent saved) is
 *  not an answer. Forgotten is said only once both are answered and none was refused. */
export type ForgetTally = { waiting: string[]; refused: string[] };
export const forgetStart = (ids: string[]): ForgetTally => ({ waiting: [...ids], refused: [] });
/** How long the page waits for both answers before it says none came. */
export const FORGET_WAIT_MS = 10_000;
export function forgetStep(t: ForgetTally, ev: unknown): ForgetTally {
  const e = (ev ?? {}) as { type?: unknown; reason?: unknown; failed?: unknown; answers?: unknown; refused?: unknown };
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  if (e.type === "memory.state") {
    if (typeof e.answers !== "string" || !t.waiting.includes(e.answers)) return t;
    const why = text(e.refused);
    return { waiting: t.waiting.filter((w) => w !== e.answers), refused: why ? [...t.refused, why] : t.refused };
  }
  // A protocol.error names the command's type, not its id: it answers the first erase still waiting.
  if (e.type === "protocol.error" && e.failed === "memory.erase" && t.waiting.length) {
    const why = text(e.reason);
    return { waiting: t.waiting.slice(1), refused: why ? [...t.refused, why] : t.refused };
  }
  return t;
}
/** null while an erase is still unanswered; then done, or why not (each reason once). */
export function forgetOutcome(t: ForgetTally): null | { ok: true } | { ok: false; reason: string } {
  if (t.waiting.length) return null;
  return t.refused.length ? { ok: false, reason: [...new Set(t.refused)].join(" ") } : { ok: true };
}
