// M75 (roadmap 19, F30): the Settings rows for the other tool's done signal, from the engine's donesignal.state. Pure, tested
// in m75.test.ts; settingsPage.tsx draws it. The card before the yes shows exactly the file and the lines (adds).
import { S } from "./strings.ts";

export type DoneTool = "claude" | "codex";
export type DoneRow = { tool: DoneTool; on: boolean; file: string; adds: string; creates: boolean; problem?: string };
export type DoneState = { project: string; tools: DoneRow[]; problem?: string };

/** The engine's state for this project, or null for anything else. */
export function doneStateFrom(e: unknown, project: string): DoneState | null {
  const o = e as { type?: unknown; project?: unknown; tools?: unknown; problem?: unknown } | null;
  if (!o || o.type !== "donesignal.state" || o.project !== project || !Array.isArray(o.tools)) return null;
  const tools = o.tools.filter((t): t is DoneRow => !!t && (t.tool === "claude" || t.tool === "codex") && typeof t.on === "boolean" && typeof t.file === "string" && typeof t.adds === "string");
  return { project, tools, ...(typeof o.problem === "string" && o.problem ? { problem: o.problem } : {}) };
}

/** The words of the card that asks before anything is written. */
export function doneAsk(row: DoneRow): { title: string; where: string; what: string; notes: string[] } {
  const tool = S.doneSignal.tool[row.tool];
  return { title: S.doneSignal.askTitle(tool), where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [S.doneSignal.askWhat, S.doneSignal.askGit, ...(row.tool === "codex" ? [S.doneSignal.askCodex] : [])] };
}
