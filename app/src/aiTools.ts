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
/** M115: via names the tool whose connection covers this one (Claude Desktop runs Claude Code). */
type ListTool = { id: string; via?: string; apps: string[]; programs: string[]; folders: string[] };
export const LIST: readonly ListTool[] = (list as { tools: ListTool[] }).tools;

/** The hooks Connect adds for each tool, in the order they are added. The start block stays its own row in Settings. */
/** M105: Codex's waiting signal (its PermissionRequest hook) is added by Connect too, but a Codex connected before it existed
 *  still counts as connected (OPTIONAL_HOOKS): its row in Settings offers it. */
/** M113: and the live feed, for the tools with an after edit event; a tool connected before it still counts as connected
 *  (OPTIONAL_HOOKS), and its row in Settings offers it. */
/** M114: and the notch's answers (approve for Claude Code and Codex, answer for Claude Code), optional the same way. */
export const CONNECT_HOOKS: Readonly<Record<ToolId, readonly HookKind[]>> = {
  claude: ["done", "guard", "waiting", "feed", "approve", "answer"], codex: ["done", "guard", "waiting", "feed", "approve"], cursor: ["done", "guard", "feed"], copilot: ["done", "guard", "feed"], antigravity: ["done", "guard"], gemini: ["done", "guard", "feed"], windsurf: ["done", "guard"],
  // M115: Copilot CLI's own hook file, one file of Squibby's own for OpenCode, Amp, Cline and Kiro, and the folder for the tools
  // with no hooks. The open tag (any) has nothing to connect: Your AI tools shows its line instead.
  copilotcli: ["done", "guard"], opencode: ["done"], amp: ["done"], cline: ["done"], kiro: ["done"], zed: ["watch"], junie: ["watch"], jetbrains: ["watch"], xcode: ["watch"], any: [],
};
/** M115: the tools listed through another tool's connection (aitools.json via): their row shows that tool's state, and its
 *  Connect connects that tool. */
export type ViaTool = { id: string; via: ToolId; name: string };
export const VIA_TOOLS: readonly ViaTool[] = LIST.flatMap((t) => (t.via && (DONE_TOOLS as readonly string[]).includes(t.via) && Object.hasOwn(S.m115.via, t.id) ? [{ id: t.id, via: t.via as ToolId, name: S.m115.via[t.id as keyof typeof S.m115.via] }] : []));
/** M115: one plain line of what Squibby does with this tool, by what its hooks can do. */
export function supportsLine(tool: ToolId): string {
  if (tool === "claude" || tool === "codex") return S.m115.supports[tool];
  const k = CONNECT_HOOKS[tool];
  if (k.includes("watch")) return S.m115.supports.watch;
  return k.includes("guard") ? S.m115.supports.doneGuard : S.m115.supports.done;
}
/** M115 review: a watch tool's changes come only from the review's folder watch (runner/src/review/service.ts), which runs
 *  only while reviews are not Off for the project and Fix (flow.on) is on. Its row and card say so then; null otherwise. */
export function watchNote(tool: ToolId, reviewMode: string, flowOn: unknown): string | null {
  if (!CONNECT_HOOKS[tool].includes("watch")) return null;
  if (flowOn === false) return S.m115.watchOff.flow;
  return reviewMode === "off" ? S.m115.watchOff.reviews : null;
}
/** M115: the open tag's line for this project (donesignal.anyLine), only as the touch line; null for anything else. */
export function anyLineFrom(e: unknown, project: string): string | null {
  const o = e as { type?: unknown; project?: unknown; line?: unknown } | null;
  return o && o.type === "donesignal.anyLine" && o.project === project && typeof o.line === "string" && o.line.startsWith("/usr/bin/touch -- '") && !o.line.includes("\n") ? o.line : null;
}

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
/** M115: also the tools listed through another one (Claude Desktop), found the same way. The open tag is never listed. */
export function findTools(found: Found): { here: ToolId[]; notHere: ToolId[]; via: ViaTool[] } {
  const here: ToolId[] = [], notHere: ToolId[] = [];
  const isHere = (t: ListTool | undefined) => !!t && (t.apps.some((a) => found.apps.includes(a)) || t.programs.some((p) => found.programs.includes(p)) || t.folders.some((f) => found.folders.includes(f)));
  for (const id of DONE_TOOLS) {
    if (id === "any") continue;
    (isHere(LIST.find((x) => x.id === id)) ? here : notHere).push(id);
  }
  return { here, notHere, via: VIA_TOOLS.filter((v) => isHere(LIST.find((x) => x.id === v.id))) };
}

/** The rows of one tool that Connect owns, from the engine's state. */
export const connectRows = (st: DoneState | null, tool: ToolId): DoneRow[] => (st?.tools ?? []).filter((r) => r.tool === tool && CONNECT_HOOKS[tool].includes(r.hook));

export const OPTIONAL_HOOKS: Readonly<Partial<Record<ToolId, readonly HookKind[]>>> = { claude: ["feed", "approve", "answer"], codex: ["waiting", "feed", "approve"], cursor: ["feed"], copilot: ["feed"], gemini: ["feed"] };
/** A tool is connected when every hook Connect adds is on (an optional one aside, M105); partly when some are. */
export function connection(st: DoneState | null, tool: ToolId): "on" | "partly" | "off" {
  const rows = connectRows(st, tool);
  const optional = OPTIONAL_HOOKS[tool] ?? [];
  const on = rows.filter((r) => r.on).length;
  const needed = CONNECT_HOOKS[tool].filter((h) => !optional.includes(h));
  const neededOn = rows.filter((r) => r.on && needed.includes(r.hook)).length;
  return rows.length > 0 && neededOn === needed.length ? "on" : on > 0 ? "partly" : "off";
}
/** M113 review: a connected tool whose live feed is off (it was connected before M113): its feed row, for the tool's own
 *  Show edits live button in Your AI tools; null when it is on, not offered, or the tool is not fully connected. */
export function feedOffRow(st: DoneState | null, tool: ToolId): DoneRow | null {
  if (connection(st, tool) !== "on" || connectProblem(st, tool)) return null;
  return connectRows(st, tool).find((r) => r.hook === "feed" && !r.on && !r.problem) ?? null;
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
  const toolNote = tool === "codex" ? S.doneSignal.askCodex : tool === "claude" ? null : S.doneSignal.askTool[tool] || null;
  // M115: a tool with no hooks: one part that writes nothing, and its own words.
  if (CONNECT_HOOKS[tool].includes("watch")) return { title: S.m82.connectTitle(name), parts: rows.map((r) => ({ hook: r.hook, label: S.m82.partLabel[r.hook](name), where: S.m115.watchWhere, what: "" })), notes: [S.m115.watchWhat(name)] };
  return {
    title: S.m82.connectTitle(name),
    parts: CONNECT_HOOKS[tool].flatMap((h) => { const r = rows.find((x) => x.hook === h); return r ? [{ hook: h, label: S.m82.partLabel[h](name), where: S.doneSignal.askWhere(r.file, r.creates), what: r.adds }] : []; }),
    // M114: with the notch's answers, the card also says the tool waits a moment for a press, and that it never answers alone.
    // M115: a tool with only the done signal says only that.
    notes: [CONNECT_HOOKS[tool].includes("guard") ? S.m82.connectWhat(name, rows.some((r) => r.hook === "feed")) : S.m115.connectDoneOnly(name), ...(rows.some((r) => r.hook === "approve" || r.hook === "answer") ? [S.m114.connectNote(name)] : []), S.doneSignal.askGit, ...(toolNote ? [toolNote] : [])],
  };
}

/** What the one yes sends: an add for each of the tool's hooks that is not on yet, in order. Nothing for a refused file. */
export function connectCommands(project: string, st: DoneState | null, tool: ToolId): Command[] {
  if (!project || connectProblem(st, tool)) return [];
  // M113: only the hooks the card showed (a row the engine listed that is not on yet), so an engine that does not know a hook
  // (the feed, before M113) is never sent it, and the yes never writes more than the card said.
  const off = new Set(connectRows(st, tool).filter((r) => !r.on).map((r) => r.hook));
  return CONNECT_HOOKS[tool].filter((h) => off.has(h)).map((h) => addDoneSignal(project, tool, h));
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
