// Groups of tools (F20, M12), the pages' side. protocol/groups.json is the one catalog of which tool belongs to which
// group; the shell (groups.rs) and the engine (runner/src/groups.ts) read the same file. This file answers, from the
// settings in force: is a group on, is a tool on, which buttons the pages draw, which tools were really tried, which one
// to invite, and which group is at work. Plain code (tested in groups.test.ts). Every name and sentence a person reads is
// in strings.ts, never here (rule 21), and nothing here is a score, a level or a streak (rule 16).
import { useSyncExternalStore } from "react";
import catalog from "../../protocol/groups.json";
import type { Model } from "./model.ts";
import { setting, subscribe } from "./settingsStore.ts";
import { S } from "./strings.ts";

export type GroupId = "flow" | "guide" | "voice" | "files" | "prompt" | "core";
export type SwitchedId = Exclude<GroupId, "core">;
export type Permission = "screenRecording" | "accessibility" | "microphone";
export type Group = { id: GroupId; switch: string | null; states: string[] };
export type Tool = {
  /** `switch`: the tool's own switch (F28), besides its group's. */
  id: ToolId; group: GroupId; switch?: string; hotkeys?: string[]; tried?: "page" | "shell"; permissions: Permission[]; settings: string[];
  commands: string[]; runner: string[]; agentModes?: string[]; stays?: string[];
};
export type ToolId =
  | "askBox" | "engine" | "stop" | "projects" | "account" | "settings" | "memory" | "ship" | "research"
  | "drive" | "followUp" | "rescue" | "findProblem" | "proof" | "undo" | "explain" | "drawIt" | "whichTask" | "watch" | "connections" | "whereWasI" | "review"
  | "showMe" | "lessons" | "yourTurn" | "practice"
  | "talk" | "speak" | "promptHelp" | "errorHelp" | "secondLook" | "convert";

export const GROUPS = catalog.groups as unknown as Group[];
export const SWITCHED = GROUPS.filter((g) => g.switch);
export const TOOLS = catalog.tools as unknown as Tool[];
const toolIndex = new Map<string, Tool>(TOOLS.map((t) => [t.id, t]));
const groupIndex = new Map<string, Group>(GROUPS.map((g) => [g.id, g]));
export const toolById = (id: string): Tool | undefined => toolIndex.get(id);
export const groupById = (id: string): Group | undefined => groupIndex.get(id);
export const groupOf = (tool: ToolId): GroupId => toolIndex.get(tool)!.group;
export const switchKey = (g: GroupId): string | null => groupIndex.get(g)?.switch ?? null;
/** The one plain line a command of a group that is switched off answers with (the shell says exactly this). */
export const offLine = (): string => catalog.offLine;

/** Where a setting's value comes from: the settings in force in this window, or a stand in for a test. */
export type Read = (key: string) => unknown;

/** A group is on unless its own switch says off. The core has no switch and is always on. */
export function groupOn(g: GroupId, read: Read = setting): boolean {
  const k = switchKey(g);
  return !k || read(k) !== false;
}
/** A tool is on while its group is on and its own switch (F28: Second Look, Type by voice, Draw it), if it has one, is not off. */
export const toolOn = (tool: ToolId, read: Read = setting): boolean => {
  const own = toolIndex.get(tool)?.switch;
  return groupOn(groupOf(tool), read) && (!own || read(own) !== false);
};
export const offGroups = (read: Read = setting): SwitchedId[] => SWITCHED.filter((g) => !groupOn(g.id, read)).map((g) => g.id as SwitchedId);
/** Every switch, a group's or a tool's own, that is off now. */
const offSwitches = (read: Read = setting): string[] => [...offGroups(read).map((g) => switchKey(g)!), ...TOOLS.filter((t) => t.switch && read(t.switch) === false).map((t) => t.switch!)];

/** Re-renders when a group or a tool's own switch is switched, and gives the reader for the groups as they are now. */
export function useGroups(): { on: (tool: ToolId) => boolean; groupOn: (g: GroupId) => boolean } {
  useSyncExternalStore(subscribe, () => offSwitches().join(","), () => "");
  return { on: (t) => toolOn(t), groupOn: (g) => groupOn(g) };
}

// ---- the buttons the pages draw ----

/** The buttons of Home's ask box and the other controls that start a tool, each with the tool it starts. A button of a
 *  group that is off is not drawn. */
export const ASK_BUTTONS: { id: string; tool: ToolId }[] = [
  { id: "start", tool: "drive" }, { id: "plan", tool: "drive" }, { id: "rescue", tool: "rescue" }, { id: "research", tool: "research" },
  { id: "shipCheck", tool: "ship" }, { id: "online", tool: "ship" }, { id: "showMe", tool: "showMe" }, { id: "drawIt", tool: "drawIt" },
];
const OTHER_ENTRIES: { id: string; tool: ToolId }[] = [
  { id: "whichTask", tool: "whichTask" }, { id: "findProblem", tool: "findProblem" }, { id: "autoSend", tool: "talk" }, { id: "voiceTry", tool: "speak" },
  // A practice (Guide) leans on three Flow tools: its check (Point at the problem), its fix (a task) and its drawing (Draw it for me).
  { id: "practiceFind", tool: "findProblem" }, { id: "practiceFix", tool: "drive" }, { id: "practiceWhy", tool: "drawIt" },
  // Draw why on Point at the problem's result (the hero Fix it card) is Draw it for me too.
  { id: "pointWhy", tool: "drawIt" },
  // M55, adapts to you: Home's main Carry on is a follow up (Try again's own command), and Explain an error is the explainer.
  { id: "carryOn", tool: "followUp" }, { id: "explainError", tool: "errorHelp" },
];
const ENTRY = new Map<string, ToolId>([...ASK_BUTTONS, ...OTHER_ENTRIES].map((b) => [b.id, b.tool]));
export const buttonShown = (id: string, read: Read = setting): boolean => { const t = ENTRY.get(id); return !t || toolOn(t, read); };
export const askButtons = (read: Read = setting): string[] => ASK_BUTTONS.filter((b) => toolOn(b.tool, read)).map((b) => b.id);
/** The Learn tab holds lessons and practice, which are Guide. */
export const learnShown = (read: Read = setting): boolean => groupOn("guide", read);

/** A permission is asked for only by a tool that is on: with every group that may ask for it off, nothing asks and
 *  Settings says so. */
export const permissionNeeded = (p: Permission, read: Read = setting): boolean => TOOLS.some((t) => t.permissions.includes(p) && toolOn(t.id, read));

// ---- tried: a real use only ----

/** The tools the person has really used (groups.tried): only ids the catalog knows, only ones that can be tried. */
export function triedList(read: Read = setting): ToolId[] {
  const v = read("groups.tried");
  return Array.isArray(v) ? v.filter((x): x is ToolId => typeof x === "string" && !!toolIndex.get(x)?.tried) : [];
}
export const untriedIn = (g: GroupId, read: Read = setting): Tool[] => {
  const done = new Set<string>(triedList(read));
  return TOOLS.filter((t) => t.group === g && t.tried && !done.has(t.id));
};

type Ev = { type?: unknown; [k: string]: unknown };
const isEv = (v: unknown): v is Ev => typeof v === "object" && v !== null && typeof (v as Ev).type === "string";
/** A receipt is a real try only when the task finished (it is done, or stopped to ask something) in the Drive mode and
 *  something happened (a file changed or a check ran). A task the person stopped, one that failed or ran out of money, an
 *  empty one and one of another mode count for nothing. A receipt that does not say how it ended is not trusted. */
const realTask = (ev: Ev): boolean => {
  if (ev.ended !== "done" && ev.ended !== "needs_you") return false;
  if (ev.mode !== undefined && ev.mode !== "drive") return false;
  const changed = Array.isArray(ev.changed) && ev.changed.length > 0;
  return changed || (typeof ev.proof === "string" && ev.proof !== "skipped");
};

/** Whether the next task is still waiting to be told apart as a follow up: it stops waiting when that task ended (its
 *  receipt) or the follow up itself was refused. Pure, so a refused follow up never turns the next new task into one. */
export const followPendingAfter = (ev: unknown, pending: boolean): boolean => {
  if (!pending || !isEv(ev)) return pending;
  if (ev.type === "receipt") return false;
  return !(ev.type === "protocol.error" && (ev.line === "agent.send" || ev.reason === offLine()));
};

/** The plain line to show when a command was refused because its group is off (the shell says exactly offLine()), or none
 *  for any other failure. */
export function refusalNotice(e: unknown): string | null {
  const text = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return text === offLine() ? text : null;
}

/** Which tool an engine event shows was really used. A finished task, a diagnosis, a check that ran, an undo, a lesson
 *  step, a Show me answer, an improved prompt or an explained error each count. A try that was cancelled, refused or
 *  found nothing counts for nothing, and neither does a tool that is switched off. `followUp`: that task was a follow up.
 *  `walk`: a pointer inside a lesson is the lesson's. */
export function usedBy(ev: unknown, ctx: { followUp?: boolean; walk?: boolean; read?: Read } = {}): ToolId[] {
  if (!isEv(ev)) return [];
  const read = ctx.read ?? setting;
  const t = ev.type as string;
  let tool: ToolId | null = null;
  switch (t) {
    case "receipt": tool = realTask(ev) ? (ctx.followUp ? "followUp" : "drive") : null; break;
    case "rescue.report": tool = "rescue"; break;
    case "proof.result": tool = ev.verdict === "passed" || ev.verdict === "passed_with_gaps" || ev.verdict === "failed" ? "proof" : null; break;
    case "checkpoint.restored": tool = "undo"; break;
    case "explain.ready": tool = "explain"; break;
    case "diagram.ready": tool = ev.made === true ? "drawIt" : null; break;
    case "bisect.result": tool = ["found", "not_failing", "already_failing", "after_last_task", "outside_change", "unsure"].includes(String(ev.outcome)) ? "whichTask" : null; break;
    case "problem.found": tool = ev.verdict && ev.verdict !== "cancelled" ? "findProblem" : null; break;
    case "walk.step": tool = "lessons"; break;
    // Watch routines (F21): a watch that really ran, Fix it's evidence, and Where was I's answer.
    case "watch.state": tool = typeof ev.lastCheckedAt === "string" && ev.checking !== true ? "watch" : null; break;
    case "watch.evidence": tool = "connections"; break;
    case "where.ready": tool = "whereWasI"; break;
    // M52: a review of another tool's change that really ran (not one refused, stopped or with nothing to look at).
    case "review.result": tool = ev.ok === true ? "review" : null; break;
    case "teach.result": tool = ev.verdict === "passed" || ev.verdict === "passed_with_gaps" || ev.verdict === "failed" ? "yourTurn" : null; break;
    case "assist.point": tool = ctx.walk ? null : "showMe"; break;
    case "assist.prompt.done": tool = "promptHelp"; break;
    case "error.explained": tool = ev.ok === true ? "errorHelp" : null; break;
    case "secondlook.result": tool = ev.ok === true ? "secondLook" : null; break;
  }
  return tool && toolOn(tool, read) ? [tool] : [];
}

/** The tools whose invitation points at a finished task ("under a finished task", "on a finished task", "after a fix"). */
export const NEEDS_FINISHED: readonly string[] = ["followUp", "undo", "yourTurn"];
/** The one invitation Home may show: the first tool not tried yet in a group that is on, in the catalog's order. Nothing
 *  with Home's setting off, while work is going on (`busy`), or when everything has been tried. `finished`: whether a task
 *  in this project has finished; until one has, a tool that needs one is passed over (M51 polish). */
export function invitation(read: Read = setting, busy = false, finished = true): { tool: ToolId; group: GroupId; line: string } | null {
  if (busy || read("groups.showUntried") === false) return null;
  for (const g of SWITCHED) {
    if (!groupOn(g.id, read)) continue;
    const t = untriedIn(g.id, read).find((x) => finished || !NEEDS_FINISHED.includes(x.id));
    if (t) return { tool: t.id, group: g.id, line: S.groups.tools[t.id as keyof typeof S.groups.tools].invite };
  }
  return null;
}

/** What Settings shows of one group besides its switch: whether it is on, the permissions its tools may ask for (each named
 *  once, in the order they are first needed), and the tools not tried yet (none when Home's invitations are off). */
export function groupView(g: SwitchedId, read: Read = setting): { id: SwitchedId; on: boolean; permissions: Permission[]; untried: ToolId[] } {
  const permissions: Permission[] = [];
  for (const t of TOOLS) if (t.group === g) for (const p of t.permissions) if (!permissions.includes(p)) permissions.push(p);
  const untried = read("groups.showUntried") === false ? [] : untriedIn(g, read).map((t) => t.id);
  return { id: g, on: groupOn(g, read), permissions, untried };
}

// ---- the group at work, for the island and the character ----

const RUNNING = ["thinking", "working", "checking"];
/** Which group the thing going on belongs to, or none. `drop`: a file is being converted. */
export function activeGroup(m: Model, drop = false): GroupId | null {
  if (m.voice && ["listening", "transcribing"].includes(m.voice.stage)) return "voice";
  // The keys that read text you select: Prompt help, split out of Voice (the overhaul spec, 3.4).
  if ((m.ph && ["reading", "thinking"].includes(m.ph.stage)) || (m.eh && ["reading", "thinking"].includes(m.eh.stage)) || (m.sl && ["reading", "thinking"].includes(m.sl.stage))) return "prompt";
  if (m.walk || m.practice || (m.showme && ["looking", "thinking", "pointing", "pointing_roughly"].includes(m.showme.stage))) return "guide";
  if (m.diagram?.stage === "asking" || m.point?.stage === "checking" || m.bisect?.stage === "running") return "flow";
  if (m.runnerUp && Object.values(m.agents).some((s) => RUNNING.includes(s))) return "flow";
  return drop ? "files" : null;
}

/** The named look a group's character is in, as data for the art (F20 item 4): Flow is water, clearer when the checks
 *  pass and murkier when they fail; the others have one placeholder state each. Reduced motion is the art's to respect:
 *  these are names, not motion. */
export function groupLook(m: Model, g: GroupId | null, drop = false): { group: GroupId | null; state: string } {
  if (!g) return { group: null, state: "calm" };
  if (g === "flow") {
    const verdict = m.receipt?.proof ?? m.task?.proof?.verdict;
    if (m.character === "error" || verdict === "failed") return { group: g, state: "murky" };
    if (verdict === "passed") return { group: g, state: "clear" };
    return { group: g, state: "calm" };
  }
  if (g === "guide") return { group: g, state: m.showme && ["pointing", "pointing_roughly"].includes(m.showme.stage) ? "lit" : "calm" };
  if (g === "voice") return { group: g, state: m.voice?.stage === "listening" ? "listening" : "calm" };
  if (g === "files") return { group: g, state: drop ? "busy" : "calm" };
  if (g === "prompt") return { group: g, state: [m.ph?.stage, m.eh?.stage, m.sl?.stage].includes("reading") ? "reading" : "calm" };
  return { group: g, state: "calm" };
}
