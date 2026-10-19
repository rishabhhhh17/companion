// The first run, as plain decisions: which step comes next, what each answer changes, and what a key must look like.
// Nothing here touches the screen, so every rule can be tested.
import type { Command } from "../../protocol/index.ts";

export const STEPS = ["welcome", "connect", "folder", "questions", "permissions", "first"] as const;
export type Step = (typeof STEPS)[number];
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
  { key: "autoSend", ask: "When you talk to me, should I send it as soon as you let go?", yes: "Yes, send it", no: "No, let me check it first", yesEffect: "Spoken requests of three words or more are sent straight away.", noEffect: "Your words wait in the box until you press Start." },
];

/// What the answers change in Settings (the registry, T16): Explain after a task for every project (yes is its usual,
/// reasons and a quick check question; no is off), and auto send. Sent through the shell like any other change in Settings.
export function settingsFor(a: Answers): [string, unknown][] {
  return [["explain.mode", a.explain ? "reasonsAndQuestion" : "off"], ["talk.autoSend", a.autoSend]];
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

export const FIRST_TASKS = [
  { label: "Make a tiny website", prompt: "Make a simple one page website for my project with a title, a short description and a contact line." },
  { label: "Explain this project to me", prompt: "Look at this project and explain in plain words what it is and how it is organised. Change nothing." },
];
