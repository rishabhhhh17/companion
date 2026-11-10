// M78 (memory that is never lost): the start block on the Memory page, and the page's side of export and restore. Pure,
// tested in m78.test.ts; memoryStart.tsx draws it. The block is the engine's own text (memory.state.start), shown exactly
// as Claude Code prints it, line by line with each line's source and Forget. Nothing here is made up on the page.
import { S } from "./strings.ts";

export const START_KINDS = ["rule", "decision", "failed", "note", "code"] as const;
export type StartKind = (typeof START_KINDS)[number];
export type StartLine = { kind: StartKind; text: string; source: string; date: string; id?: string };
export type StartState = { hook: boolean; text: string; lines: StartLine[] };

/** The engine's start block, or null for anything that is not one. */
export function startFrom(v: unknown): StartState | null {
  const o = v as { hook?: unknown; text?: unknown; lines?: unknown } | null;
  if (!o || typeof o !== "object" || typeof o.hook !== "boolean" || typeof o.text !== "string" || !Array.isArray(o.lines)) return null;
  const lines = (o.lines as Record<string, unknown>[]).filter((l) => !!l && (START_KINDS as readonly unknown[]).includes(l.kind) && typeof l.text === "string" && typeof l.source === "string" && typeof l.date === "string" && (l.id === undefined || typeof l.id === "string"))
    .map((l) => ({ kind: l.kind as StartKind, text: l.text as string, source: l.source as string, date: l.date as string, ...(typeof l.id === "string" ? { id: l.id } : {}) }));
  return { hook: o.hook, text: o.text, lines };
}

/** What the part shows: its line under the title, the rows (each line of the block in its order, a house rule offering
 *  Change in Settings instead of Forget), and whether the search line is there. */
export function startView(st: StartState | null): { line: string; setUp: boolean; rows: (StartLine & { action: "forget" | "change" })[]; empty: boolean; search: boolean } {
  if (!st) return { line: S.m78.startOff, setUp: true, rows: [], empty: true, search: false };
  const rows = st.lines.map((l) => ({ ...l, action: (l.id ? "forget" : "change") as "forget" | "change" }));
  return { line: st.hook ? S.m78.startOn : S.m78.startOff, setUp: !st.hook, rows, empty: rows.length === 0, search: /\nMore notes: run /.test(`\n${st.text}`) };
}

/** How many note lines an export holds, read the way the engine reads it (backup.ts parseExport), for the yes before a
 *  restore. Null for a file that is not an export. */
export function exportCount(text: string): number | null {
  if (typeof text !== "string" || !text.includes("notes export, version 1.")) return null;
  let at = false, n = 0;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trimEnd();
    if (l.startsWith("## ")) at = l === "## About this project" || l === "## How you like to work" || l === "## House rules";
    else if (at && l.startsWith("- ")) n++;
  }
  return n;
}

/** The engine's answer to a restore, or null. */
export function restoredFrom(e: unknown, project: string): { added: number; skipped: number; forgotten: number; refused: number; problem?: string } | null {
  const o = e as Record<string, unknown> | null;
  if (!o || o.type !== "memory.restored" || o.project !== project) return null;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  return { added: n("added"), skipped: n("skipped"), forgotten: n("forgotten"), refused: n("refused"), ...(typeof o.problem === "string" && o.problem ? { problem: o.problem } : {}) };
}

/** The words after a restore. */
export const restoredWords = (r: NonNullable<ReturnType<typeof restoredFrom>>): string => r.problem ?? S.m78.restored(r);

/** The name the save dialog offers: the project's name and today's date. The shell keeps only letters, digits and dashes. */
export const exportName = (projectName: string, now: Date): string =>
  S.m78.fileName(projectName, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);

/** Where Set up in Settings and a house rule's Change go: the Start reviews sooner group on Fixing, and the house rules. */
export const START_SETTINGS = { hook: "fixing.done", rules: "rules.house" } as const;
