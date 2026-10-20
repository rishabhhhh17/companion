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

export type GroupId = "flow" | "guide" | "voice" | "files" | "core";
export type SwitchedId = Exclude<GroupId, "core">;
export type Permission = "screenRecording" | "accessibility" | "microphone";
export type Group = { id: GroupId; switch: string | null; states: string[] };
export type Tool = {
  id: ToolId; group: GroupId; hotkeys?: string[]; tried?: "page" | "shell"; permissions: Permission[]; settings: string[];
  commands: string[]; runner: string[]; agentModes?: string[]; stays?: string[];
};
export type ToolId =
  | "askBox" | "engine" | "stop" | "projects" | "account" | "settings" | "memory" | "ship" | "research"
  | "drive" | "followUp" | "rescue" | "findProblem" | "proof" | "undo" | "explain" | "whichTask"
  | "showMe" | "lessons" | "yourTurn" | "practice"
  | "talk" | "speak" | "promptHelp" | "errorHelp" | "convert";

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
export const toolOn = (tool: ToolId, read: Read = setting): boolean => groupOn(groupOf(tool), read);
export const offGroups = (read: Read = setting): SwitchedId[] => SWITCHED.filter((g) => !groupOn(g.id, read)).map((g) => g.id as SwitchedId);

/** Re-renders when a group is switched, and gives the reader for the groups as they are now. */
export function useGroups(): { on: (tool: ToolId) => boolean; groupOn: (g: GroupId) => boolean } {
  useSyncExternalStore(subscribe, () => offGroups().join(","), () => "");
  return { on: (t) => toolOn(t), groupOn: (g) => groupOn(g) };
}

// ---- the buttons the pages draw ----

/** The buttons of Home's ask box and the other controls that start a tool, each with the tool it starts. A button of a
 *  group that is off is not drawn. */
export const ASK_BUTTONS: { id: string; tool: ToolId }[] = [
  { id: "start", tool: "drive" }, { id: "plan", tool: "drive" }, { id: "rescue", tool: "rescue" }, { id: "research", tool: "research" },
  { id: "shipCheck", tool: "ship" }, { id: "online", tool: "ship" }, { id: "showMe", tool: "showMe" }, { id: "drawIt", tool: "explain" },
];
const OTHER_ENTRIES: { id: string; tool: ToolId }[] = [
  { id: "whichTask", tool: "whichTask" }, { id: "findProblem", tool: "findProblem" }, { id: "autoSend", tool: "talk" }, { id: "voiceTry", tool: "speak" },
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
    case "receipt": tool = ctx.followUp ? "followUp" : "drive"; break;
    case "rescue.report": tool = "rescue"; break;
    case "proof.result": tool = ev.verdict === "passed" || ev.verdict === "passed_with_gaps" || ev.verdict === "failed" ? "proof" : null; break;
    case "checkpoint.restored": tool = "undo"; break;
    case "explain.ready": tool = "explain"; break;
    case "diagram.ready": tool = ev.made === true ? "explain" : null; break;
    case "bisect.result": tool = ["found", "not_failing", "already_failing", "after_last_task", "outside_change", "unsure"].includes(String(ev.outcome)) ? "whichTask" : null; break;
    case "problem.found": tool = ev.verdict && ev.verdict !== "cancelled" ? "findProblem" : null; break;
    case "walk.step": tool = "lessons"; break;
    case "teach.result": tool = ev.verdict === "passed" || ev.verdict === "passed_with_gaps" || ev.verdict === "failed" ? "yourTurn" : null; break;
    case "assist.point": tool = ctx.walk ? null : "showMe"; break;
    case "assist.prompt.done": tool = "promptHelp"; break;
    case "error.explained": tool = ev.ok === true ? "errorHelp" : null; break;
  }
  return tool && toolOn(tool, read) ? [tool] : [];
}

/** The one invitation Home may show: the first tool not tried yet in a group that is on, in the catalog's order. Nothing
 *  with Home's setting off, while work is going on (`busy`), or when everything has been tried. */
export function invitation(read: Read = setting, busy = false): { tool: ToolId; group: GroupId; line: string } | null {
  if (busy || read("groups.showUntried") === false) return null;
  for (const g of SWITCHED) {
    if (!groupOn(g.id, read)) continue;
    const t = untriedIn(g.id, read)[0];
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
  if ((m.ph && ["reading", "thinking"].includes(m.ph.stage)) || (m.eh && ["reading", "thinking"].includes(m.eh.stage))) return "voice";
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
  return { group: g, state: "calm" };
}
