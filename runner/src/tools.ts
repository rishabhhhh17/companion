// The built in Claude Code tools Companion gives each kind of work, by the names the pinned SDK (0.3.293) uses
// (sdk-tools.d.ts). The engine is handed exactly these (sdkEngine.ts, the SDK's `tools` option), so each request to Claude
// carries only their definitions, not the whole Claude Code set, which on the person's own key is their money on every
// turn. The real run harness checks system/init against the same lists (scripts/realrun-harness.ts AGENT_TOOLS).
// Every other built in tool is left out. If one is ever asked for anyway (an older or newer Claude, or the list not
// honoured), safety.ts refuses most of them with a plain reason instead of showing the person a card about an unknown tool.
// A few it is not given are still judged by their path as before, as a second line of defence, never refused outright:
// MultiEdit and NotebookEdit (only inside the project, like Edit and Write), LS and NotebookRead (reads), BashOutput and
// TaskOutput (a background command this task started). So "left out" is true of what Claude is handed, not a promise that
// the hook refuses each of these.
// [verify] in the next real smoke test: that system/init lists exactly these; that ExitPlanMode in plan mode reaches the
// hook as a tool call with its plan in `plan` (agent.ts readOnly takes that as the answer); whether this binary still has TodoWrite or
// only the TaskCreate family; and whether, with an explicit list, Claude Code still holds WebFetch, WebSearch and TaskStop
// back behind ToolSearch.

/** A task that changes the project: read and search it, change files, run commands (each judged by safety.ts), stop a
 *  background command it started (a dev server), open a public web page, search the web (a paid search on the person's
 *  own key: on as before, Let tasks search the web in Settings turns it off, and the fix eval decides the usual value), and
 *  keep a short to do list. ToolSearch is how Claude Code loads a
 *  tool it holds back until needed (research reached web search through it, T05); with it, those tools stay reachable.
 *  No sub agents, no notebook editor, no question box of Claude's own (it asks in its final message, see sdkEngine.ts). */
export const TASK_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "Bash", "TaskStop", "WebFetch", "WebSearch", "TodoWrite", "ToolSearch"] as const;
/** Planning, Rescue's diagnosis: only look. ExitPlanMode is how plan mode hands back a plan. */
export const LOOK_TOOLS = ["Read", "Grep", "Glob", "TodoWrite", "ExitPlanMode"] as const;
/** Research: look, and use the web (safe addresses only, safety.ts and agent.ts), with ToolSearch as for a task. */
export const RESEARCH_TOOLS = [...LOOK_TOOLS, "WebSearch", "WebFetch", "ToolSearch"] as const;
/** The second model review only reads the text it is given. */
export const REVIEW_TOOLS = [] as const;

/** Every built in tool Companion gives in any flow. */
export const GIVEN_TOOLS: readonly string[] = [...new Set<string>([...TASK_TOOLS, ...LOOK_TOOLS, ...RESEARCH_TOOLS])];

/** A task's list, as Settings has it: without web search when Let tasks search the web is off (work.webSearch). */
export function taskTools(o: { webSearch?: boolean } = {}): string[] {
  return TASK_TOOLS.filter((t) => o.webSearch !== false || t !== "WebSearch");
}

/** The list for one session: the one the flow names, else the looking tools for planning and the task tools for a task. */
export function toolsFor(o: { planOnly?: boolean; tools?: readonly string[] }): string[] {
  return [...(o.tools ?? (o.planOnly ? LOOK_TOOLS : TASK_TOOLS))];
}
