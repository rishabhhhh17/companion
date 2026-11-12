// M82, Part 1: Your AI tools. Which AI tools are on this Mac (from what the shell found, aitools.rs, against the one list in
// protocol/aitools.json), and what Connect and Disconnect send for each. Plain code, tested in m82.test.ts; aiToolsScreen.tsx
// draws it. Connect adds a tool's hooks (its done signal and its saved copy; for Claude Code also the waiting signal) with the
// engine's own donesignal.add, one command per hook, and only after the one yes on the card that shows every file and line.
import list from "../../protocol/aitools.json";
import type { Command } from "../../protocol/index.ts";
import { addDoneSignal, removeDoneSignal } from "./commands.ts";
import { DONE_TOOLS, type DoneRow, type DoneState, type DoneTool, type HookKind } from "./doneSignal.ts";
import { S } from "./strings.ts";

export type ToolId = DoneTool;
/** What the shell found: installed bundle ids, program names, and the project's tool folders. */
export type Found = { apps: string[]; programs: string[]; folders: string[] };
type ListTool = { id: string; apps: string[]; programs: string[]; folders: string[] };
export const LIST: readonly ListTool[] = (list as { tools: ListTool[] }).tools;

/** The hooks Connect adds for each tool, in the order they are added. The start block stays its own row in Settings. */
export const CONNECT_HOOKS: Readonly<Record<ToolId, readonly HookKind[]>> = {
  claude: ["done", "guard", "waiting"], codex: ["done", "guard"], cursor: ["done", "guard"], copilot: ["done", "guard"], antigravity: ["done", "guard"], gemini: ["done", "guard"], windsurf: ["done", "guard"],
};

/** The tool's name as people know it. */
export const toolName = (t: ToolId): string => S.doneSignal.tool[t];

/** Whether a found value is a plain list of strings (anything else counts as nothing found). */
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
/** The shell's answer, or nothing found for anything else. */
export function foundFrom(v: unknown): Found {
  const o = (v ?? {}) as Record<string, unknown>;
  return { apps: strings(o.apps), programs: strings(o.programs), folders: strings(o.folders) };
}

/** The tools on this Mac, in the list's order, each once, and the rest ("Not on this Mac"). A tool counts as here when its
 *  app is installed, its program was found, or the project has its own folder. Only tools of the done signal are listed. */
export function findTools(found: Found): { here: ToolId[]; notHere: ToolId[] } {
  const here: ToolId[] = [], notHere: ToolId[] = [];
  for (const id of DONE_TOOLS) {
    const t = LIST.find((x) => x.id === id);
    const on = !!t && (t.apps.some((a) => found.apps.includes(a)) || t.programs.some((p) => found.programs.includes(p)) || t.folders.some((f) => found.folders.includes(f)));
    (on ? here : notHere).push(id);
  }
  return { here, notHere };
}

/** The rows of one tool that Connect owns, from the engine's state. */
export const connectRows = (st: DoneState | null, tool: ToolId): DoneRow[] => (st?.tools ?? []).filter((r) => r.tool === tool && CONNECT_HOOKS[tool].includes(r.hook));

/** A tool is connected when every hook Connect adds is on; partly when some are. */
export function connection(st: DoneState | null, tool: ToolId): "on" | "partly" | "off" {
  const rows = connectRows(st, tool);
  const on = rows.filter((r) => r.on).length;
  return rows.length > 0 && on === CONNECT_HOOKS[tool].length ? "on" : on > 0 ? "partly" : "off";
}
/** Whether any tool is connected (the Now row shows only while none is). */
export const anyConnected = (st: DoneState | null): boolean => DONE_TOOLS.some((t) => connection(st, t) === "on");

/** A file of this tool that is not plain JSON: Connect and Disconnect are both refused, and the problem is said. */
export const connectProblem = (st: DoneState | null, tool: ToolId): string | null => connectRows(st, tool).find((r) => r.problem)?.problem ?? null;

/** The one card before the yes: the tool, and for each hook still to add its file and the exact lines, then the notes. */
export type ConnectAsk = { title: string; parts: { hook: HookKind; label: string; where: string; what: string }[]; notes: string[] };
export function connectAsk(st: DoneState | null, tool: ToolId): ConnectAsk | null {
  if (connectProblem(st, tool)) return null;
  const rows = connectRows(st, tool).filter((r) => !r.on);
  if (rows.length === 0) return null;
  const name = toolName(tool);
  const toolNote = tool === "codex" ? S.doneSignal.askCodex : tool === "claude" ? null : S.doneSignal.askTool[tool];
  return {
    title: S.m82.connectTitle(name),
    parts: CONNECT_HOOKS[tool].flatMap((h) => { const r = rows.find((x) => x.hook === h); return r ? [{ hook: h, label: S.m82.partLabel[h](name), where: S.doneSignal.askWhere(r.file, r.creates), what: r.adds }] : []; }),
    notes: [S.m82.connectWhat(name), S.doneSignal.askGit, ...(toolNote ? [toolNote] : [])],
  };
}

/** What the one yes sends: an add for each of the tool's hooks that is not on yet, in order. Nothing for a refused file. */
export function connectCommands(project: string, st: DoneState | null, tool: ToolId): Command[] {
  if (!project || connectProblem(st, tool)) return [];
  const on = new Set(connectRows(st, tool).filter((r) => r.on).map((r) => r.hook));
  return CONNECT_HOOKS[tool].filter((h) => !on.has(h)).map((h) => addDoneSignal(project, tool, h));
}
/** What Disconnect sends: a remove for each of the tool's hooks Connect owns that is on. Nothing for a refused file. */
export function disconnectCommands(project: string, st: DoneState | null, tool: ToolId): Command[] {
  if (!project || connectProblem(st, tool)) return [];
  return connectRows(st, tool).filter((r) => r.on).map((r) => removeDoneSignal(project, tool, r.hook));
}

/** The bundle ids of a tool's app (Put it in brings one of them to the front). */
export const appsOf = (tool: ToolId): readonly string[] => LIST.find((x) => x.id === tool)?.apps ?? [];
/** Whether the tool's app is on this Mac (Put it in is offered only then). */
export const hasApp = (found: Found | null, tool: ToolId): boolean => !!found && appsOf(tool).some((a) => found.apps.includes(a));
