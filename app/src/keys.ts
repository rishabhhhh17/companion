// Every Companion hotkey as the pages see it (M11 wave 4). The app keeps and registers the keys (app/src-tauri/src/keymap.rs):
// each job's keys in use now (none when another app holds them) and the ones the person picked. The pages only name them,
// fill them into every line that names a key, and offer the short list the app sends when Change is pressed. Nothing here
// reads key presses (rule 8).
import { S } from "./strings.ts";

export type Job = "card" | "problem" | "showme" | "read" | "accept" | "explain" | "secondlook" | "talk" | "stop";
/** In the order Settings shows them, the same as keymap.rs ACTIONS (hotkeys.test.ts checks). */
export const JOBS: readonly Job[] = ["card", "problem", "showme", "read", "accept", "explain", "secondlook", "talk", "stop"];
/** Each job's usual keys, the ones Companion always had; hotkeys.test.ts checks them against keymap.rs DEFAULTS. */
export const KEY_DEFAULTS: Readonly<Record<Job, string>> = {
  card: "control-option-command-k", problem: "control-option-command-f", showme: "control-option-command-s", read: "control-option-command-r",
  accept: "control-option-command-a", explain: "control-option-command-e", secondlook: "control-option-command-c", talk: "option-space", stop: "control-option-command-x",
};
export type Keys = { using: Record<Job, string | null>; picked: Record<Job, string> };
export const KEYS_START: Keys = { using: { ...KEY_DEFAULTS }, picked: { ...KEY_DEFAULTS } };

// A chord's id is keymap.rs's: the modifiers in the Mac's order (Control, Option, Shift, Command), then the key.
const MODS = ["control", "option", "shift", "command"] as const;
/** Every key a chord can end with (keymap.rs KEYS; keypick.test.ts checks), and the ones Settings offers in its list. */
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split(""), DIGITS = "0123456789".split("");
const KEYS = [...LETTERS, ...DIGITS, "space", "return"];
export const CUSTOM_KEYS: readonly string[] = [...LETTERS, ...DIGITS, "space"];
const keyWord = (k: string): string => (k.length === 1 ? k.toUpperCase() : (S.keyWords as Record<string, string>)[k] ?? "");

/** "Control, Option, Command and K", "Option and Space"; empty for anything not written exactly the way the app writes it. */
export function chordLabel(id: string): string {
  const parts = typeof id === "string" ? id.split("-") : [];
  const key = parts.pop() ?? "";
  if (parts.length === 0 || !KEYS.includes(key)) return "";
  let last = -1;
  for (const p of parts) { const i = MODS.indexOf(p as (typeof MODS)[number]); if (i <= last) return ""; last = i; }
  const words = parts.map((p) => (S.keyWords as Record<string, string>)[p]);
  return `${words.join(", ")} and ${keyWord(key)}`;
}
const isChord = (v: unknown): v is string => typeof v === "string" && chordLabel(v) !== "";

/** What the app answered, read safely, job by job: an answer that cannot be read keeps the usual keys, and only a clear
 *  null says a job has no keys (so the page never claims another app holds keys when it does not know). */
export function keysFrom(v: unknown): Keys {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const using = (typeof o.using === "object" && o.using !== null ? o.using : {}) as Record<string, unknown>;
  const picked = (typeof o.picked === "object" && o.picked !== null ? o.picked : {}) as Record<string, unknown>;
  const out: Keys = { using: { ...KEY_DEFAULTS }, picked: { ...KEY_DEFAULTS } };
  for (const j of JOBS) {
    if (using[j] === null) out.using[j] = null; else if (isChord(using[j])) out.using[j] = using[j];
    if (isChord(picked[j])) out.picked[j] = picked[j];
  }
  return out;
}

// The keys in use, shared by every line on the page. The card asks the app at start (key_map) and after every change.
let now: Keys = KEYS_START;
const listeners = new Set<() => void>();
export const keysNow = (): Keys => now;
export function setKeysNow(k: Keys): void { now = k; for (const f of listeners) f(); }
export function onKeys(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

/** How a line names a job ("Point at the problem"). */
const jobName = (j: Job): string => (S.keyJobs as Record<Job, string>)[j];
/** The keys a job uses now, in words; empty when another app holds them. */
export const keysOf = (job: Job, k: Keys = now): string => { const id = k.using[job]; return id ? chordLabel(id) : ""; };
/** A line that names a job's keys ("{keys}"), filled with the keys in use. A line said after the keys were pressed names
 *  "its keys" in the rare case they changed since. */
export const withKeys = (template: string, job: Job, k: Keys = now): string => template.replace("{keys}", keysOf(job, k) || S.itsKeys);
/** A hint about a job: filled with its keys, or, when another app holds them, where to pick others (never keys that do
 *  not work). `off` replaces that line where something better fits. */
export const keyHint = (job: Job, template: string, k: Keys = now, off?: string): string =>
  (k.using[job] ? withKeys(template, job, k) : off ?? S.keyHintOff.replace("{job}", jobName(job)));

/** The Prompt help result's line: its use keys only when the app could take them for this result (ph_ready answers;
 *  another app may have taken them since launch), else only Esc. */
/** How long the shell holds a Prompt help result's keys (main.rs arm_now gives them back after a minute and a half). */
export const PH_KEYS_MS = 90_000;
export const acceptHint = (armed: boolean, k: Keys = now): string => (armed ? keyHint("accept", S.phHotkeys, k, S.phHotkeysOff) : S.phHotkeysOff);
/** What ph_ready answers: the keys the app took for this result, or null when another app holds them all. The app tries
 *  again for each result (keymap.rs arm), so they can be keys the page did not know: keys another app held at launch, or
 *  the usual ones in place of picked keys another app took since. The keys in use follow, so the line names them. */
export function armedFor(v: unknown): boolean {
  if (!isChord(v)) return false;
  if (now.using.accept !== v) setKeysNow({ ...now, using: { ...now.using, accept: v } });
  return true;
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Text written with the usual keys (lessons, lines from the engine) with the keys in use instead, each job's once, in a
 *  single pass. Called each time the text is shown or said, so a change in Settings shows at once. A job without keys is
 *  named by its job ("the keys for Point at the problem"), and the text ends with where to pick others (keyHint's words,
 *  once per job), so it never asks for keys that do not work. */
export function keysIn(text: string, k: Keys = now): string {
  if (typeof text !== "string") return text;
  const jobOf = new Map<string, Job>();
  for (const j of JOBS) if (k.using[j] !== KEY_DEFAULTS[j]) jobOf.set(chordLabel(KEY_DEFAULTS[j]), j);
  if (jobOf.size === 0) return text;
  const off: Job[] = [];
  const re = new RegExp(`(?:${[...jobOf.keys()].map(escape).join("|")})(?![A-Za-z])`, "g");
  const out = text.replace(re, (m) => {
    const j = jobOf.get(m);
    if (!j) return m;
    const label = chordLabel(k.using[j] ?? "");
    if (label) return label;
    if (!off.includes(j)) off.push(j);
    return S.keysForJob.replace("{job}", jobName(j));
  });
  return [out, ...off.map((j) => S.keyHintOff.replace("{job}", jobName(j)))].join(" ");
}

/** What the app sends when Change is pressed (key_choices): the job's short list, the chords that can be pressed now, and
 *  which of Companion's other jobs has the rest. An answer that cannot be read, or about another job, offers nothing. */
export type Choices = { job: Job; choices: string[]; free: string[]; ours: Record<string, Job> };
export function choicesFrom(v: unknown, job: Job): Choices {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  if (o.action !== job) return { job, choices: [], free: [], ours: {} };
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter(isChord) : []);
  const choices = ids(o.choices);
  const ours: Record<string, Job> = {};
  if (typeof o.ours === "object" && o.ours !== null) for (const [id, j] of Object.entries(o.ours as Record<string, unknown>)) if (choices.includes(id) && JOBS.includes(j as Job)) ours[id] = j as Job;
  return { job, choices, free: ids(o.free).filter((id) => choices.includes(id)), ours };
}
/** Whether a chord's button can be pressed: one the app says is free on this Mac now, that no other job has. The app's
 *  answer decides, not the keys the page knows: it counts the keys registered for the job as free (so the keys in use
 *  after a fall back can be pressed to keep them), and it really tries use a suggestion's keys, which are registered only
 *  while a result shows, so keys another app took since show as taken instead of a button that can only fail. */
export const canPick = (c: Choices, id: string): boolean => c.choices.includes(id) && c.free.includes(id) && !c.ours[id];

// ---- picking any chord (finding L) ----
// Without reading a key press (rule 8): the person ticks the modifiers and chooses the key from CUSTOM_KEYS. The app checks the
// same rules again (keymap.rs why_not); these only tell the person why a button cannot be pressed.
/** The Mac's own shortcuts, never offered: screenshots, log out, lock screen, hide the Dock, emoji picker and Finder search. */
export const MAC_OWN: readonly string[] = ["shift-command-3", "shift-command-4", "shift-command-5", "shift-command-q", "control-command-q", "option-command-d", "control-command-space", "option-command-space"];
export type Ticked = Record<(typeof MODS)[number], boolean>;
/** The chord's id, or why it cannot be one: not_enough (fewer than two modifiers, or neither Control nor Command), reserved
 *  (the Mac uses it), unknown (not a key in the list). */
export function customChord(t: Ticked, key: string): { id: string } | { problem: "not_enough" | "reserved" | "unknown" } {
  if (!CUSTOM_KEYS.includes(key)) return { problem: "unknown" };
  const mods = MODS.filter((m) => t[m]);
  if (mods.length < 2 || !(t.control || t.command)) return { problem: "not_enough" };
  const id = [...mods, key].join("-");
  return MAC_OWN.includes(id) ? { problem: "reserved" } : { id };
}

/** Why the keys did not change, from the code the app sends (keymap.rs NotChanged, and the commands in main.rs). */
export function keyProblem(code: string): string {
  if (code === "taken") return S.keysTaken;
  if (code === "in_use") return S.keysInUse;
  if (code === "not_saved") return S.keysNotSaved;
  if (code === "not_enough") return S.keysNotEnough;
  if (code === "reserved") return S.keysReserved;
  return S.keysFailed;
}
