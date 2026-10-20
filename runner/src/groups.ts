// Groups of tools (F20, M12), the engine's side. protocol/groups.json is the one catalog of which tool belongs to which
// group (the shell reads it in groups.rs, the pages in app/src/groups.ts). The shell already refuses a command of a group
// that is switched off before it reaches here; this is the second check, for a command that comes some other way, and
// the place where a group that has just been switched off stops the work it was doing. The switches reach the engine
// as settings (flow.on, guide.on, voice.on, files.on), in settings.apply, like every setting it applies (T16).
import catalog from "../../protocol/groups.json";

type Tool = { id: string; group: string; runner: string[]; agentModes?: string[]; stays?: string[] };
type Group = { id: string; switch: string | null };
export const GROUPS = catalog.groups as Group[];
export const TOOLS = catalog.tools as unknown as Tool[];
/** The one plain line a refused command answers with (the shell says exactly this). */
export const OFF_LINE: string = catalog.offLine;

const byType = new Map<string, Tool>();
const byMode = new Map<string, Tool>();
for (const t of TOOLS) { for (const r of t.runner) byType.set(r, t); for (const m of t.agentModes ?? []) byMode.set(m, t); }
const switchOf = (t: Tool): string | null => GROUPS.find((g) => g.id === t.group)?.switch ?? null;

/** Where a switch's value comes from: the engine's settings in force (RunnerSettings.get). */
export type Get = (key: string) => unknown;
export const isOff = (get: Get, key: string): boolean => get(key) === false;
/** The groups that are switched off now, by id. */
export const groupsOff = (get: Get): string[] => GROUPS.filter((g) => g.switch && isOff(get, g.switch)).map((g) => g.id);

/** The tool a command belongs to (agent.start by its mode), or none for a command this catalog does not know. */
export function toolOf(cmd: { type: string; mode?: unknown }): Tool | undefined {
  return cmd.type === "agent.start" ? (typeof cmd.mode === "string" ? byMode.get(cmd.mode) : undefined) : byType.get(cmd.type);
}

/** The plain line to answer with when this command's group is switched off, else null. What only ends or takes back
 *  something (Undo, a lesson's Stop, which task broke it's Undo) and everything in the core still goes through. */
export function refusal(get: Get, cmd: { type: string; mode?: unknown }): string | null {
  const t = toolOf(cmd);
  const sw = t && switchOf(t);
  if (!t || !sw || !isOff(get, sw)) return null;
  return (t.stays ?? []).includes(cmd.type) ? null : OFF_LINE;
}

/** The groups switched off now that were not before: they stop what they were doing. */
export const newlyOff = (before: string[], after: string[]): string[] => after.filter((g) => !before.includes(g));

/** The agent modes (what agent.start says it is doing) that belong to a group's tools, from the catalog. */
export const agentModesOf = (group: string): Set<string> => new Set(TOOLS.filter((t) => t.group === group).flatMap((t) => t.agentModes ?? []));

/** What a group that has just been switched off must end, and nothing else. The parts are the engine's own services; the
 *  shell stops its own (microphone, speech, the pointer, a conversion). Flow ends its tasks and checks (the runner knows
 *  which are Flow's) and the browser download; Guide the lessons and the Show me questions (the screen); Voice Prompt help
 *  and the error explainer. A task of Research or Ship is never ended by any of them. */
export type Parts = {
  runner: { stopGroup(g: "flow" | "voice"): Promise<void> | void };
  walks: { stopAll(): void };
  browser: { stop(): unknown };
  assist?: { cancel(g: "guide" | "voice"): void } | null;
};
export function stopGroupWork(groups: string[], p: Parts): void {
  if (groups.includes("flow")) { void p.runner.stopGroup("flow"); void p.browser.stop(); }
  if (groups.includes("guide")) { p.walks.stopAll(); p.assist?.cancel("guide"); }
  if (groups.includes("voice")) { p.assist?.cancel("voice"); void p.runner.stopGroup("voice"); }
}
