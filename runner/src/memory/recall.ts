// How much of what Companion remembers Claude is told (the settings memory.tellClaude and memory.recallLength, T16): a
// number of words for a task (and its planning) and for Prompt help. Off, nothing is told, and the lines are still kept
// (pausing is separate: it stops only new lines). The usual choice is today's: 1500 words for a task, 300 for Prompt help.
import { MemoryStore } from "./store.ts";

export const RECALL_WORDS = { short: { task: 500, help: 100 }, normal: { task: 1500, help: 300 }, long: { task: 3000, help: 600 } } as const;
type Use = "task" | "help";
type Get = (key: string) => unknown;

/** The words Claude may be told for one task or one Prompt help request; 0 when the person turned telling Claude off. */
export function recallWords(get: Get, use: Use): number {
  if (get("memory.tellClaude") === false) return 0;
  const r = (RECALL_WORDS as Record<string, { task: number; help: number }>)[String(get("memory.recallLength"))] ?? RECALL_WORDS.normal;
  return r[use];
}

/** What Prompt help is told, read for each request (so a change in Settings reaches the next one). Without settings, the
 *  usual values. */
export function promptHelpMemory(settings: { get(key: string): unknown } | undefined, profileDir: string): (project?: string) => string {
  return (project) => {
    const words = recallWords((k) => settings?.get(k), "help");
    return words > 0 ? new MemoryStore({ project: project ?? "", profileDir }).forAgent(words) : "";
  };
}
