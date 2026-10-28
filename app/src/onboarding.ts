// The first run, as plain decisions: which step comes next, what each answer changes, and what a key must look like.
// Nothing here touches the screen, so every rule can be tested.
import type { Command } from "../../protocol/index.ts";
import { switchKey, type SwitchedId } from "./groups.ts";

// The first run (M18, 28 Oct 2026, the whole flow): a hello, then see it work before anything is asked (F17, F05: a demo runs
// before anything is connected), then choose your companion and make it yours, say what it should help with, connect Claude,
// pick a folder, and a last screen with the real shortcuts, the practice project and the optional questions (F05). "look" is
// a recording of the signup practice (firstLook.ts): it spends nothing and needs no key, no Node and no folder. Permissions
// are asked when a feature first needs one, never here. The water at the foot of Home rises with every step (LEVEL).
export const STEPS = ["hello", "look", "pick", "yours", "powers", "connect", "folder", "ready"] as const;
/** The steps that must be done; the rest can be skipped. */
export const REQUIRED: readonly Step[] = ["connect", "folder"];
export type Step = (typeof STEPS)[number];
/** The steps counted in words ("2 of 5"): the hello and the recording come before the count, the last screen after it. */
export const COUNTED: readonly Step[] = ["pick", "yours", "powers", "connect", "folder"];
export function countOf(step: Step): { n: number; of: number } | null { const i = COUNTED.indexOf(step); return i < 0 ? null : { n: i + 1, of: COUNTED.length }; }
/** How high the water stands at each step, in percent of Home's height: it rises as you go and is nearly full at the end. The
 *  hello sits Flowflow in the surface; the recording keeps it low, out of the way. */
export const LEVEL: Record<Step, number> = { hello: 34, look: 10, pick: 24, yours: 36, powers: 48, connect: 60, folder: 72, ready: 86 };

/** Make it yours: the name (empty keeps the character's own), how lively, and which edge it lives on. Null: not chosen here,
 *  so the setting is left as it is (the person may have moved the character already). */
export type Lively = "lively" | "calm";
export type Edge = "left" | "right" | "top" | "bottom";
export type Follow = "eyes" | "drop" | "off";
export type Yours = { name: string; lively: Lively | null; edge: Edge | null; follow?: Follow | null };
export const DEFAULT_YOURS: Yours = { name: "", lively: null, edge: null, follow: null };
export const NAME_MAX = 24;
/** What Make it yours changes in Settings: its name (its own name, or nothing typed, is stored as empty), the reactions for
 *  how lively, and the edge. Only what was chosen. */
export function yoursSettings(y: Yours, ownName: string): [string, unknown][] {
  const out: [string, unknown][] = [];
  const name = y.name.trim().slice(0, NAME_MAX);
  if (name && name !== ownName) out.push(["character.name", name]);
  if (y.lively) out.push(["fun.reactions", y.lively === "lively"]);
  if (y.edge) out.push(["character.edge", y.edge]);
  // Follow my pointer (M20): its eyes, a drop of water, or off; the person's choice.
  if (y.follow) out.push(["character.follow", y.follow]);
  return out;
}

export type Answers = { explain: boolean; short: boolean; plain: boolean; autoSend: boolean };
export const DEFAULT_ANSWERS: Answers = { explain: true, short: false, plain: true, autoSend: false };

export type Context = { connected: boolean; project: string };

/// A step you cannot leave yet: Companion cannot work without Claude connected or a folder to work in.
export function canContinue(step: Step, c: Context): boolean {
  if (step === "connect") return c.connected;
  if (step === "folder") return c.project.length > 0;
  return true;
}

export function next(step: Step): Step | null { const i = STEPS.indexOf(step); return i < 0 || i === STEPS.length - 1 ? null : STEPS[i + 1]; }
export function back(step: Step): Step | null { const i = STEPS.indexOf(step); return i <= 0 ? null : STEPS[i - 1]; }

/// The questions are optional (the person can skip them all), and each answer says out loud what it changes.
export const QUESTIONS: { key: keyof Answers; ask: string; yes: string; no: string; yesEffect: string; noEffect: string }[] = [
  { key: "explain", ask: "After a task, should I explain why I did it?", yes: "Yes, briefly", no: "No, just do it", yesEffect: "I will add two or three short reasons under each result.", noEffect: "I will skip the explanations." },
  { key: "short", ask: "How long should my answers be?", yes: "As short as possible", no: "A normal amount", yesEffect: "I will keep answers short.", noEffect: "I will answer in a normal amount of words." },
  { key: "plain", ask: "How should I talk?", yes: "Plain words, no jargon", no: "Technical is fine", yesEffect: "I will use plain words and explain terms.", noEffect: "I will use the usual technical words." },
  { key: "autoSend", ask: "When you talk to me, should I send it as soon as you let go?", yes: "Yes, send it", no: "No, let me check it first", yesEffect: "Spoken requests for work of three words or more are sent straight away. Words that mean wait or stop, and questions about your screen, still wait in the box.", noEffect: "Your words wait in the box until you press Start." },
];

/// What the answers change in Settings (the registry, T16): Explain after a task for every project (yes is its usual,
/// reasons and a quick check question; no is off), and auto send. Sent through the shell like any other change in Settings.
export function settingsFor(a: Answers): [string, unknown][] {
  return [["explain.mode", a.explain ? "reasonsAndQuestion" : "off"], ["talk.autoSend", a.autoSend]];
}

/// The groups the person switched off in the first run (F20 item 6), as the settings Settings changes: a group left on
/// changes nothing. Sent through the shell like any other change.
export function groupSettingsFor(off: readonly SwitchedId[]): [string, unknown][] {
  return off.map((g) => [switchKey(g)!, false] as [string, unknown]);
}

export function effectsOf(a: Answers): string[] {
  return QUESTIONS.map((q) => (a[q.key] ? q.yesEffect : q.noEffect));
}

/// What the answers add to your profile, as commands for the engine (lines with the source "your answer at setup").
export function commandsFor(a: Answers, project: string, add: (scope: "profile", text: string, source: string) => Command): Command[] {
  const out: Command[] = [];
  if (a.short) out.push(add("profile", "Prefers short answers", "your answer at setup"));
  if (a.plain) out.push(add("profile", "Prefers plain words, no jargon", "your answer at setup"));
  void project;
  return out;
}

/// An Anthropic key: starts "sk-ant-", no spaces, long enough. The same rule the Mac side applies.
export function keyLooksRight(raw: string): string | null {
  const k = raw.trim();
  if (!k) return "Paste your key first.";
  if (!k.startsWith("sk-ant-")) return "That does not look like an Anthropic key. It starts with sk-ant-.";
  if (k.length < 40 || k.length > 400) return "That key looks too short or too long. Copy the whole key.";
  if (!/^[A-Za-z0-9_-]+$/.test(k)) return "That key has characters a key should not have. Copy it again without spaces.";
  return null;
}

/** Where a person makes an Anthropic key (opened only from the Get a key button). */
export const KEY_PAGE = "https://console.anthropic.com/settings/keys";

export type KeyTested = { result: "works" | "refused" | "no_connection" | "unknown"; at: number };
/** What setup says about the key it just saved: "checking" until Anthropic's answer for this save arrives (an answer from
 *  before the save is someone else's), then that answer. Null before anything was saved. */
export function keyCheck(savedAt: number | null, tested: KeyTested | null): KeyTested["result"] | "checking" | null {
  if (savedAt === null) return null;
  return tested && tested.at >= savedAt ? tested.result : "checking";
}
