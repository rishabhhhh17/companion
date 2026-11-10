// M75 (roadmap 19, F30): the Settings rows for the other tool's done signal, from the engine's donesignal.state. Pure, tested
// in m75.test.ts; settingsPage.tsx draws it. The card before the yes shows exactly the file and the lines (adds).
import { S } from "./strings.ts";

export type DoneTool = "claude" | "codex";
/** M77: which hook a row is: the done signal (M75), or Claude Code's guard (a snapshot before a destructive command) and
 *  waiting (Claude is waiting for you) hooks. M78: start (Claude Code is given the start block of notes as a session
 *  starts). Absent in an older engine's event means done. */
export type HookKind = "done" | "guard" | "waiting" | "start";
export type DoneRow = { tool: DoneTool; hook: HookKind; on: boolean; file: string; adds: string; creates: boolean; problem?: string };
export type DoneState = { project: string; tools: DoneRow[]; problem?: string };

/** The engine's state for this project, or null for anything else. */
export function doneStateFrom(e: unknown, project: string): DoneState | null {
  const o = e as { type?: unknown; project?: unknown; tools?: unknown; problem?: unknown } | null;
  if (!o || o.type !== "donesignal.state" || o.project !== project || !Array.isArray(o.tools)) return null;
  const tools = (o.tools as Record<string, unknown>[]).filter((t) => !!t && (t.tool === "claude" || t.tool === "codex") && typeof t.on === "boolean" && typeof t.file === "string" && typeof t.adds === "string" && (t.hook === undefined || t.hook === "done" || t.hook === "guard" || t.hook === "waiting" || t.hook === "start"))
    .map((t) => ({ ...(t as Omit<DoneRow, "hook">), hook: (t.hook ?? "done") as HookKind }));
  return { project, tools, ...(typeof o.problem === "string" && o.problem ? { problem: o.problem } : {}) };
}

/** The words of the card that asks before anything is written. M77: the guard and waiting hooks have their own title and
 *  their own line about what travels. */
export function doneAsk(row: DoneRow): { title: string; where: string; what: string; notes: string[] } {
  const tool = S.doneSignal.tool[row.tool];
  const title = row.hook === "done" ? S.doneSignal.askTitle(tool) : S.doneSignal.askTitleFor[row.hook];
  const what = row.hook === "done" ? S.doneSignal.askWhat : S.doneSignal.askWhatFor[row.hook];
  return { title, where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [what, S.doneSignal.askGit, ...(row.tool === "codex" ? [S.doneSignal.askCodex] : [])] };
}
/** M77: a row's label and its line in Settings: the done signal rows are named by tool, the others by what they do. */
export function hookLabel(row: Pick<DoneRow, "tool" | "hook">): { label: string; line: string | null } {
  if (row.hook === "done") return { label: S.doneSignal.tool[row.tool], line: null };
  return { label: S.doneSignal.hookTitle[row.hook], line: S.doneSignal.hookLine[row.hook] };
}
