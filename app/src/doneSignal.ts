// M75 (roadmap 19, F30): the Settings rows for the other tool's done signal, from the engine's donesignal.state. Pure, tested
// in m75.test.ts; settingsPage.tsx draws it. The card before the yes shows exactly the file and the lines (adds).
import { S } from "./strings.ts";

/** M80: Cursor, the VS Code agent (GitHub Copilot) and Antigravity have the done signal and the guard too. */
export const DONE_TOOLS = ["claude", "codex", "cursor", "copilot", "antigravity", "gemini", "windsurf"] as const;
export type DoneTool = (typeof DONE_TOOLS)[number];
/** M77: which hook a row is: the done signal (M75), or Claude Code's guard (a snapshot before a destructive command) and
 *  waiting (Claude is waiting for you) hooks. M78: start (Claude Code is given the start block of notes as a session
 *  starts). Absent in an older engine's event means done. */
/** M113: feed, the live feed after each edit (Claude Code, Codex, Cursor, the VS Code agent and Gemini CLI). */
/** M114: approve (Claude Code's and Codex's permission requests) and answer (Claude Code's questions), from the notch. */
export type HookKind = "done" | "guard" | "waiting" | "start" | "feed" | "approve" | "answer";
const HOOK_KINDS: readonly unknown[] = ["done", "guard", "waiting", "start", "feed", "approve", "answer"];
/** M85: stale, Squibby's line is there but older than today's (a guard written before it could ask): Update shows the
 *  same card with today's lines, and only the yes writes them. */
export type DoneRow = { tool: DoneTool; hook: HookKind; on: boolean; file: string; adds: string; creates: boolean; problem?: string; stale?: boolean };
export type DoneState = { project: string; tools: DoneRow[]; problem?: string };

/** The engine's state for this project, or null for anything else. */
export function doneStateFrom(e: unknown, project: string): DoneState | null {
  const o = e as { type?: unknown; project?: unknown; tools?: unknown; problem?: unknown } | null;
  if (!o || o.type !== "donesignal.state" || o.project !== project || !Array.isArray(o.tools)) return null;
  const tools = (o.tools as Record<string, unknown>[]).filter((t) => !!t && (DONE_TOOLS as readonly unknown[]).includes(t.tool) && typeof t.on === "boolean" && typeof t.file === "string" && typeof t.adds === "string" && (t.hook === undefined || HOOK_KINDS.includes(t.hook)))
    .map(({ stale, ...t }) => ({ ...(t as Omit<DoneRow, "hook" | "stale">), hook: (t.hook ?? "done") as HookKind, ...(stale === true && t.on === true ? { stale: true } : {}) }));
  return { project, tools, ...(typeof o.problem === "string" && o.problem ? { problem: o.problem } : {}) };
}

/** The words of the card that asks before anything is written. M77: the guard and waiting hooks have their own title and
 *  their own line about what travels. */
/** M85: the tools whose guard hook can have the tool ask the person first (each tool's own hook docs, read 14 Nov 2026). */
const CAN_ASK: readonly string[] = ["claude", "cursor", "copilot", "antigravity"];
/** M103: the other tools whose guard hook also hands over a file read tool's file name (runner donesignal.ts matchers). */
const READS: readonly string[] = ["copilot", "antigravity", "gemini"];
export function doneAsk(row: DoneRow): { title: string; where: string; what: string; notes: string[]; yes: string } {
  const tool = S.doneSignal.tool[row.tool];
  // M85 review: Update on an older line of Squibby's says it replaces that line, and what the new one does.
  if (row.on && row.stale) return { title: S.doneSignal.updateTitle(row.file), where: S.doneSignal.updateWhere(row.file), what: row.adds, notes: [row.hook !== "guard" ? S.doneSignal.updatePlain : CAN_ASK.includes(row.tool) ? S.doneSignal.updateAsks(tool) : S.doneSignal.updateSame(tool), S.doneSignal.askGit], yes: S.doneSignal.updateYes };
  // M114: approve and answer from the notch: their own cards (Squibby answers only on the person's press).
  if (row.hook === "approve") return { title: S.m114.askTitle(tool), where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [S.m114.askWhat(tool), S.doneSignal.askGit, ...(row.tool === "codex" ? [S.doneSignal.askCodex] : [])], yes: S.doneSignal.yes };
  if (row.hook === "answer") return { title: S.m114.answerTitle, where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [S.m114.answerWhat, S.doneSignal.askGit], yes: S.doneSignal.yes };
  // M113: the live feed: its own card (only the file's name and the counts are read, then the note is removed).
  if (row.hook === "feed") return { title: S.m113.askTitle(tool), where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [S.m113.askWhat(tool), S.doneSignal.askGit, ...(row.tool === "codex" ? [S.doneSignal.askCodex] : row.tool !== "claude" ? [S.doneSignal.askTool[row.tool]] : [])], yes: S.doneSignal.yes };
  // M105: Codex's waiting signal: its own card (it touches an empty file; nothing of the question travels).
  if (row.hook === "waiting" && row.tool !== "claude") return { title: S.m105.askTitle(tool), where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [S.m105.askWhat(tool), S.doneSignal.askGit, ...(row.tool === "codex" ? [S.doneSignal.askCodex] : [])], yes: S.doneSignal.yes };
  // M80: another tool's guard names that tool; Claude Code's keeps its own words.
  const other = row.hook === "guard" && row.tool !== "claude";
  const title = row.hook === "done" ? S.doneSignal.askTitle(tool) : other ? S.doneSignal.guardOther.askTitle(tool) : S.doneSignal.askTitleFor[row.hook];
  // The M103 review: another tool's guard says what its hook can do (ask, or block when chosen) and whether it hands over
  // file reads too.
  const reads = READS.includes(row.tool);
  const what = row.hook === "done" ? S.doneSignal.askWhat : other ? (CAN_ASK.includes(row.tool) ? S.doneSignal.guardOther.askWhat(tool, reads) : S.doneSignal.guardOther.askWhatBlock(tool, reads)) : S.doneSignal.askWhatFor[row.hook];
  const toolNote = row.tool === "codex" ? S.doneSignal.askCodex : row.tool === "claude" ? null : S.doneSignal.askTool[row.tool];
  return { title, where: S.doneSignal.askWhere(row.file, row.creates), what: row.adds, notes: [what, S.doneSignal.askGit, ...(toolNote ? [toolNote] : [])], yes: S.doneSignal.yes };
}
/** M80 walk: what Remove says, by the kind of row. */
export function removedLine(row: Pick<DoneRow, "tool" | "hook">): string {
  const tool = S.doneSignal.tool[row.tool];
  if (row.hook === "waiting" && row.tool !== "claude") return S.m105.removed(tool);
  if (row.hook === "feed") return S.m113.removed(tool);
  if (row.hook === "approve" || row.hook === "answer") return S.m114.removed(tool);
  return row.hook === "done" ? S.doneSignal.removed(tool) : row.hook === "guard" ? S.doneSignal.removedGuard(tool) : S.doneSignal.removedOther;
}
/** M77: a row's label and its line in Settings: the done signal rows are named by tool, the others by what they do. */
export function hookLabel(row: Pick<DoneRow, "tool" | "hook">): { label: string; line: string | null } {
  // M80 walk: each row says what it does in its label; the saved copy is explained once, in the group's own line.
  if (row.hook === "done") return { label: S.doneSignal.guardOther.doneRow(S.doneSignal.tool[row.tool]), line: null };
  if (row.hook === "guard") return { label: row.tool === "claude" ? S.doneSignal.hookTitle.guard : S.doneSignal.guardOther.title(S.doneSignal.tool[row.tool]), line: null };
  // M105: Codex's waiting row, in its name.
  if (row.hook === "waiting" && row.tool !== "claude") return { label: S.m105.waitTitle(S.doneSignal.tool[row.tool]), line: S.m105.waitRowLine(S.doneSignal.tool[row.tool]) };
  // M113: the live feed row, in the tool's name.
  if (row.hook === "feed") return { label: S.m113.rowTitle(S.doneSignal.tool[row.tool]), line: S.m113.rowLine(S.doneSignal.tool[row.tool]) };
  // M114: the notch's answer rows.
  if (row.hook === "approve") return { label: S.m114.rowTitle(S.doneSignal.tool[row.tool]), line: S.m114.rowLine(S.doneSignal.tool[row.tool]) };
  if (row.hook === "answer") return { label: S.m114.answerRowTitle, line: S.m114.answerRowLine };
  return { label: S.doneSignal.hookTitle[row.hook], line: S.doneSignal.hookLine[row.hook] };
}
