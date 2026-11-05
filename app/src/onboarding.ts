// The first run, as plain decisions: which step comes next, what each answer changes, and what a key must look like.
// Nothing here touches the screen, so every rule can be tested.
import type { Command } from "../../protocol/index.ts";
import { SWITCHED, switchKey, TOOLS, toolOn, type SwitchedId } from "./groups.ts";
import { setting } from "./settingsStore.ts";
import type { Liveliness } from "./lookfeel.ts";
import { numberWords } from "./settingsRows.ts";
import { S } from "./strings.ts";
import { cleanName } from "./notchHello.ts";
import type { Verdict } from "./verdict.ts";

// The first run (M49, three screens): Hello (the water and Flowflow, one line on what it does, and the recorded fix to
// watch again), Your Claude (the key, with the honest privacy, cost and plan lines), and Your project (a folder, GitHub or
// Lovable, or a practice). Then a first check of the real project: a safety copy first, installs set to ask, and the result
// in the verdict line. Every step can be skipped and has a way back. Flowflow's choices and the optional questions (F05)
// stay in the first run, folded on its last screen, until the founder says when they move. Permissions are asked when a
// feature first needs one, never here. The water at the foot rises with every step (LEVEL).
// M69 (F29, the YC benchmark spec 3.10): Squibby pays and picks the model, so there is no Your Claude step. Two counted
// screens, Welcome and Pick a project (or the practice), then the first check, the hands on part.
export const STEPS = ["hello", "project", "check"] as const;
export type Step = (typeof STEPS)[number];
/** The three screens, counted in words ("2 of 3"). The first check comes after them and is not counted. */
export const COUNTED: readonly Step[] = ["hello", "project"];
export function countOf(step: Step): { n: number; of: number } | null { const i = COUNTED.indexOf(step); return i < 0 ? null : { n: i + 1, of: COUNTED.length }; }
/** How high the water stands at each step, in percent of Home's height. The hello sits Flowflow in the surface; after it
 *  the water drops low, out of the way of the words, and rises with every step, Flowflow riding on it. */
export const LEVEL: Record<Step, number> = { hello: 34, project: 20, check: 24 };

/** Make it yours: the name (empty keeps the character's own), how lively, and which edge it lives on. Null: not chosen here,
 *  so the setting is left as it is (the person may have moved the character already). */
export type Edge = "left" | "right" | "top" | "bottom";
export type Follow = "eyes" | "drop" | "off";
/** `follow`: no longer asked in the first run (M46); kept so an old answer still reads, and null writes nothing. */
export type Yours = { name: string; lively: Liveliness | null; edge: Edge | null; follow?: Follow | null;
  /** M68: what to call the person, only for the hello in the notch (you.name). Optional; never read from the Mac. */
  you?: string };
export const DEFAULT_YOURS: Yours = { name: "", lively: null, edge: null, follow: null };
export const NAME_MAX = 24;
/** What Make it yours changes in Settings: its name (its own name, or nothing typed, is stored as empty), how lively
 *  (character.lively, M46), and the edge. Only what differs from `now`, the choices in force when the screen opened, so
 *  reading it again writes nothing until a choice is touched. Without `now` nothing is in force yet. */
export function yoursSettings(y: Yours, ownName: string, now: Pick<Yours, "name" | "lively" | "edge" | "you"> = { name: "", lively: null, edge: null }): [string, unknown][] {
  const out: [string, unknown][] = [];
  const typed = y.name.trim().slice(0, NAME_MAX), name = typed === ownName ? "" : typed;
  if (name !== now.name.trim()) out.push(["character.name", name]);
  if (y.lively && y.lively !== now.lively) out.push(["character.lively", y.lively]);
  if (y.edge && y.edge !== now.edge) out.push(["character.edge", y.edge]);
  // M68: the person's own name for the hello, written only when typed or changed.
  if (y.you !== undefined) { const you = cleanName(y.you); if (you !== cleanName(now.you ?? "")) out.push(["you.name", you]); }
  // Follow my pointer (M20): its eyes, a drop of water, or off; the person's choice.
  if (y.follow) out.push(["character.follow", y.follow]);
  return out;
}

/** Whether a key of the last screen's list is still worth showing: the groups switched off on that same screen are
 *  released as soon as the choices are saved, so their keys are not listed. A key no tool names stays. */
export function keyShownFirst(job: string, groupsOff: readonly string[], read: (key: string) => unknown = setting): boolean {
  const offKeys = SWITCHED.filter((g) => groupsOff.includes(g.id)).map((g) => switchKey(g.id));
  const reader = (k: string) => (offKeys.includes(k) ? false : read(k));
  const tools = TOOLS.filter((t) => t.hotkeys?.includes(job));
  return tools.length === 0 || tools.some((t) => toolOn(t.id, reader));
}

export type Answers = { explain: boolean; short: boolean; plain: boolean; autoSend: boolean };
export const DEFAULT_ANSWERS: Answers = { explain: true, short: false, plain: true, autoSend: false };

/** `claude`: whether Anthropic's Claude is installed (M22; false only while it is not, undefined when not asked). */
export type Context = { connected: boolean; project: string; claude?: boolean };

/// When Continue is offered: Your Claude once Claude is connected, Your project once a folder is chosen. Every step can
/// still be skipped (skipTo), so nothing is a dead end.
export function canContinue(step: Step, c: Context): boolean {
  if (step === "project") return c.project.length > 0;
  return true;
}
/** Where Skip goes: on to the next screen, or out of the first run ("done") where the next step needs what was skipped
 *  (the first check needs a project). Home then says what is still missing, with a button straight to it. */
export function skipTo(step: Step): Step | "done" {
  if (step === "hello") return "project";
  return "done";
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

/** Every question, as if each was answered (tests, and a caller that has nothing to narrow). */
export const ALL_ANSWERED: ReadonlySet<keyof Answers> = new Set(QUESTIONS.map((q) => q.key));
/// What the answers change in Settings (the registry, T16): Explain after a task for every project (yes is its usual,
/// reasons and a quick check question; no is off), and auto send. Only the questions the person answered (`picked`): a
/// pre-filled answer they never touched is not theirs (rule 15). Sent through the shell like any other change in Settings.
export function settingsFor(a: Answers, picked: ReadonlySet<keyof Answers> = ALL_ANSWERED): [string, unknown][] {
  const out: [string, unknown][] = [];
  if (picked.has("explain")) out.push(["explain.mode", a.explain ? "reasonsAndQuestion" : "off"]);
  if (picked.has("autoSend")) out.push(["talk.autoSend", a.autoSend]);
  return out;
}

/// The groups as the person left them in the first run (F20 item 6), as the settings Settings changes: only a group whose
/// switch now differs from the value in force (`read`). The first run starts from the values in force, so with F28 file
/// conversion shows off, and pressing Next changes nothing. Sent through the shell like any other change.
export function groupSettingsFor(off: readonly SwitchedId[], read: (key: string) => unknown = setting): [string, unknown][] {
  return SWITCHED.flatMap((g) => {
    const key = switchKey(g.id as SwitchedId)!, on = !off.includes(g.id as SwitchedId);
    return (read(key) !== false) === on ? [] : [[key, on] as [string, unknown]];
  });
}

export function effectsOf(a: Answers): string[] {
  return QUESTIONS.map((q) => (a[q.key] ? q.yesEffect : q.noEffect));
}

/// What the answers add to your profile, as commands for the engine (lines with the source "your answer at setup"). Only
/// the questions the person answered (`picked`): "your answer at setup" is never said of a pre-filled one (rule 15).
export function commandsFor(a: Answers, project: string, add: (scope: "profile", text: string, source: string) => Command, picked: ReadonlySet<keyof Answers> = ALL_ANSWERED): Command[] {
  const out: Command[] = [];
  if (a.short && picked.has("short")) out.push(add("profile", "Prefers short answers", "your answer at setup"));
  if (a.plain && picked.has("plain")) out.push(add("profile", "Prefers plain words, no jargon", "your answer at setup"));
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
/** Your Claude's one main button (the audit, item 38: Continue stayed off until a separate Save and test). With a key typed,
 *  Continue saves it and has it tested, then carries on once it works (goesOnAfterTest). While the test runs it waits. */
export type ClaudeMain = { act: "continue" | "saveThenGo" | "none"; disabled: boolean };
export function claudeMain(connected: boolean, typed: string, check: KeyTested["result"] | "checking" | null): ClaudeMain {
  if (check === "checking") return { act: "none", disabled: true };
  if (typed.trim()) return { act: "saveThenGo", disabled: false };
  if (connected && check !== "refused") return { act: "continue", disabled: false };
  return { act: "none", disabled: true };
}
/** After Continue saved a key: on to the next screen once the key is connected and Anthropic said it works. */
export const goesOnAfterTest = (wanted: boolean, connected: boolean, check: KeyTested["result"] | "checking" | null): boolean => wanted && connected && check === "works";

export function keyCheck(savedAt: number | null, tested: KeyTested | null): KeyTested["result"] | "checking" | null {
  if (savedAt === null) return null;
  return tested && tested.at >= savedAt ? tested.result : "checking";
}

/** The keys named on the last screen: the four that have keys by usual (F28): Fix it, Hold to talk, Prompt help and Stop
 *  everything. A job whose key the person took away is left out (only keys that can be pressed are named). */
export const FIRST_KEYS: readonly string[] = ["problem", "talk", "read", "stop"];

// ---------- Your Claude: the honest lines ----------

const stop = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
/** The three lines over the key field, each true of this Mac now: where the key goes (only to Claude, from the Keychain),
 *  what it costs (Anthropic bills the person directly; the daily limit in force, which Settings changes), and the plan,
 *  from the Plan card's own state (planCard: with payments off, early access and nothing charged). */
export function honestLines(o: { limitUsd: number; plan: { line: string; facts: readonly string[] } }): { privacy: string; cost: string; plan: string } {
  return {
    privacy: S.fr.keyPrivacy,
    cost: S.fr.keyCost(numberWords(o.limitUsd, "dollars")),
    plan: S.fr.keyPlan([o.plan.line, ...o.plan.facts].filter((t) => t.trim()).map(stop).join(" ")),
  };
}

// ---------- the first check ----------

/** The check as the first run sees it: the point state the engine's answer fills (model.ts point). */
export type PointNow = { stage: "checking" | "found" | "clear" | "gaps" | "nothing"; label?: string; message?: string; note?: string; problem?: { message?: string } & Record<string, unknown> } | null;
/** Where the first check is: not asked yet, running, waiting on an install question, answered, or ended with no answer
 *  (Stop, or refused). An answer from before this press is never this check's: the press sets the point to checking. */
export type CheckStage = "idle" | "checking" | "asking" | "done" | "stopped";
export function checkStage(asked: boolean, point: PointNow, asking: boolean): CheckStage {
  if (!asked) return "idle";
  if (point?.stage === "checking") return asking ? "asking" : "checking";
  return point ? "done" : "stopped";
}
/** The line under "Not checked yet" when the first check ended with no answer: "stopped" only after the person's own Stop
 *  (Stop the check, Back, Skip); otherwise why it could not run, from the engine or the shell (no Apple developer tools,
 *  already working, the engine not running, switched off), or a plain could not run when nothing said why. */
export function checkEndLine(stoppedByMe: boolean, why: string | null): string {
  if (stoppedByMe) return S.fr.checkStopped;
  return why?.trim() ? why.trim() : S.fr.checkCouldNot;
}
/** What the check screen's one live line says (it is always there, so VoiceOver hears each change): the check running,
 *  the install question, the verdict's own words (headline and line), or the line under Not checked yet. */
export function checkAnnounce(stage: CheckStage, name: string, result: Verdict | null, endLine: string): string {
  if (stage === "checking") return `${S.fr.checking(name)}. ${S.fr.checkPromise}`;
  if (stage === "asking") return S.fr.checkAsk;
  if (result) return result.say;
  if (stage === "stopped") return S.verdict.say(S.home.notChecked, endLine);
  return "";
}
/** The questions this check is waiting on, for the agent it runs on: an install card (risk "install"), a build's
 *  "Go online?" card (risk "network", a build that needs the internet, runner/src/proof/ladder.ts INTERNET_ASK), and any
 *  other question the check itself asks (check: true), such as running the project's scripts without the safety box
 *  (M67 review: the first run screen covers Home, so a question it left out waited unseen until it ran out). */
export function installAsks<T extends { risk: string; agent: string; check?: boolean }>(approvals: readonly T[], agent: string): T[] {
  return approvals.filter((a) => (a.risk === "install" || a.risk === "network" || a.check === true) && a.agent === agent);
}
/** The first check's result in the verdict line (ui/parts.tsx VerdictLine): the project's own checks, never a fix, so it is
 *  never "proven" (M45: only a fix's verdict can be). A tick only when every check that ran passed and nothing was left. */
export function firstCheckVerdict(point: Exclude<PointNow, null>, name: string): Verdict | null {
  const v = (kind: Verdict["kind"], headline: string, line: string | null, tone: Verdict["tone"], icon: Verdict["icon"]): Verdict =>
    ({ kind, headline, line, say: S.verdict.say(headline, line), tone, icon, offer: null, proven: false });
  switch (point.stage) {
    case "clear": return v("noChange", S.fr.checkClear(name), S.fr.checkClearLine, "good", "tick");
    // What could not run and how to fix it, from the engine's note, as Home's point card shows it (card.tsx point note).
    case "gaps": return v("partial", S.fr.checkGaps(name), [S.fr.checkGapsLine, point.note?.trim()].filter(Boolean).join(" "), "mixed", "wait");
    // m67 bug 28: checks the project has that could not run (packages not installed, pytest missing) come with the
    // engine's note: then it is partly checked, with the reason and the command, never "no build, tests or page".
    case "nothing": return point.note?.trim()
      ? v("partial", S.fr.checkPartly(name), `${S.fr.checkPartlyLine} ${point.note.trim()}`, "mixed", "wait")
      : v("noChange", S.fr.checkNothing(name), S.fr.checkNothingLine, "plain", "wait");
    // What broke in the check's own words (the audit, item 8), else the check that did not pass, by name.
    case "found": return v("failed", S.home.failing(name), point.problem?.message?.trim() || point.message?.trim() || (point.label ? S.fr.checkFoundAt(point.label) : S.fr.checkFoundLine), "bad", "cross");
    default: return null;
  }
}
