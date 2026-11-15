// M100 (F29): the tools Squibby's own fixing loop gives the model. The same set a Claude Code task gets for reading and
// changing a project (tools.ts TASK_TOOLS), by the same names and with the same input fields, so safety.ts judges a call
// from this loop exactly as it judges one from Claude Code. Left out on purpose: sub agents and worktrees (safety.ts
// NOT_GIVEN), the web (a fix works on the project in front of it; Research stays on its own flow), background commands and
// the to do list. Plain data with no imports, so the usage server (usage-proxy/src/filter.ts) can hold every request to
// exactly these definitions.

export type ToolDef = { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false } };

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description, minimum: 1 });

export const LOOP_TOOL_DEFS: readonly ToolDef[] = [
  {
    name: "Read",
    description: "Read a text file in the project. Paths are relative to the project folder. Long files come back in parts: use offset and limit (line numbers start at 1).",
    input_schema: { type: "object", properties: { file_path: str("The file, relative to the project folder."), offset: int("The first line to read."), limit: int("How many lines to read.") }, required: ["file_path"], additionalProperties: false },
  },
  {
    name: "Glob",
    description: "List the project's files whose paths match a pattern, such as src/**/*.ts. Folders of installed packages and git's own folder are left out.",
    input_schema: { type: "object", properties: { pattern: str("The pattern, relative to the project folder."), path: str("A folder inside the project to look in (optional).") }, required: ["pattern"], additionalProperties: false },
  },
  {
    name: "Grep",
    description: "Search the project's text files for a regular expression. Gives the matching lines with their file and line number.",
    input_schema: { type: "object", properties: { pattern: str("The regular expression."), path: str("A file or folder inside the project to search (optional)."), glob: str("Only files whose paths match this pattern (optional).") }, required: ["pattern"], additionalProperties: false },
  },
  {
    name: "Edit",
    description: "Replace one exact piece of text in a file in the project with new text. The old text must appear exactly once; read the file first.",
    input_schema: { type: "object", properties: { file_path: str("The file, relative to the project folder."), old_string: str("The exact text to replace."), new_string: str("The text to put in its place.") }, required: ["file_path", "old_string", "new_string"], additionalProperties: false },
  },
  {
    name: "Write",
    description: "Write a whole file in the project, replacing it if it exists. Prefer Edit for a small change to an existing file.",
    input_schema: { type: "object", properties: { file_path: str("The file, relative to the project folder."), content: str("Everything the file should hold.") }, required: ["file_path", "content"], additionalProperties: false },
  },
  {
    name: "Bash",
    description: "Run one shell command in the project folder, such as the project's tests. It runs in a safety box: no changes outside the project, never git changes, and no internet. To add a package, write it into the project's package list; the checks afterwards install packages once the person says yes.",
    input_schema: { type: "object", properties: { command: str("The command."), timeout: int("Most seconds it may take (at most 600).") }, required: ["command"], additionalProperties: false },
  },
];

/** Every tool name this loop has. */
export const LOOP_TOOLS: readonly string[] = LOOP_TOOL_DEFS.map((t) => t.name);
/** The tools for looking only (planning, Rescue's look): reading and searching, nothing that changes anything. */
export const LOOP_LOOK_TOOLS: readonly string[] = ["Read", "Glob", "Grep"];

/** The definitions to send for one session: those of the names the flow asked for that this loop has (never one it lacks),
 *  and only the looking tools when the session may only look. In this file's order, so every request is byte for byte the
 *  same for the same list (the usage server compares them, and the prompt cache keys on them). */
export function loopToolsFor(o: { planOnly?: boolean; tools?: readonly string[] }): ToolDef[] {
  const asked = o.tools ? new Set(o.tools) : null;
  return LOOP_TOOL_DEFS.filter((t) => (!asked || asked.has(t.name)) && (!o.planOnly || LOOP_LOOK_TOOLS.includes(t.name)));
}

/** A key that is the same for two definitions exactly when they say the same thing (keys sorted at every level). */
export function defKey(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v));
}
const KNOWN = new Map(LOOP_TOOL_DEFS.map((t) => [t.name, defKey(t)]));
/** Whether a request's tools are this loop's own client tools and nothing else: each one exactly as defined here (no field
 *  added, none changed), each name at most once. The usage server forwards only such a list (or Second Look's search). */
export function isLoopToolList(tools: unknown): boolean {
  if (!Array.isArray(tools) || tools.length === 0 || tools.length > LOOP_TOOL_DEFS.length) return false;
  const seen = new Set<string>();
  for (const t of tools) {
    if (!t || typeof t !== "object" || Array.isArray(t)) return false;
    const name = (t as { name?: unknown }).name;
    if (typeof name !== "string" || seen.has(name) || KNOWN.get(name) !== defKey(t)) return false;
    seen.add(name);
  }
  return true;
}
