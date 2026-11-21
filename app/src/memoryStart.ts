// M78 (memory that is never lost): the start block on the Memory page, and the page's side of export and restore. Pure,
// tested in m78.test.ts; memoryStart.tsx draws it. The block is the engine's own text (memory.state.start), shown exactly
// as Claude Code prints it, line by line with each line's source and Forget. Nothing here is made up on the page.
import { S } from "./strings.ts";

export const START_KINDS = ["rule", "decision", "failed", "note", "code"] as const;
export type StartKind = (typeof START_KINDS)[number];
export type StartLine = { kind: StartKind; text: string; source: string; date: string; id?: string };
/** M108 review: what each AI tool set up here is handed, exactly (memory.state.start.forms). */
export const START_FORM_TOOLS = ["claude", "codex", "antigravity", "gemini"] as const;
export type StartFormTool = (typeof START_FORM_TOOLS)[number];
export type StartForm = { tool: StartFormTool; text: string };
export type StartState = { hook: boolean; text: string; lines: StartLine[]; forms?: StartForm[] };

/** The engine's start block, or null for anything that is not one. */
export function startFrom(v: unknown): StartState | null {
  const o = v as { hook?: unknown; text?: unknown; lines?: unknown } | null;
  if (!o || typeof o !== "object" || typeof o.hook !== "boolean" || typeof o.text !== "string" || !Array.isArray(o.lines)) return null;
  const lines = (o.lines as Record<string, unknown>[]).filter((l) => !!l && (START_KINDS as readonly unknown[]).includes(l.kind) && typeof l.text === "string" && typeof l.source === "string" && typeof l.date === "string" && (l.id === undefined || typeof l.id === "string"))
    .map((l) => ({ kind: l.kind as StartKind, text: l.text as string, source: l.source as string, date: l.date as string, ...(typeof l.id === "string" ? { id: l.id } : {}) }));
  const raw = Array.isArray((o as { forms?: unknown }).forms) ? ((o as { forms: unknown[] }).forms as Record<string, unknown>[]) : [];
  const forms = raw.filter((f) => !!f && (START_FORM_TOOLS as readonly unknown[]).includes(f.tool) && typeof f.text === "string").map((f) => ({ tool: f.tool as StartFormTool, text: f.text as string }));
  return { hook: o.hook, text: o.text, lines, forms };
}

/** M108 review: the "Show it exactly" views under the rows: one per different text the tools set up are handed, named for
 *  those tools, in the engine's order; a tool handed nothing has none. From an older engine, or before any tool is set up,
 *  the one view of the block as it would be. */
export function startSeen(st: StartState | null): { label: string; text: string }[] {
  if (!st) return [];
  const forms = st.forms ?? [];
  if (!forms.length) return st.text ? [{ label: S.m78.startAsSeen, text: st.text }] : [];
  const groups: { tools: StartFormTool[]; text: string }[] = [];
  for (const f of forms) {
    if (!f.text) continue;
    const g = groups.find((x) => x.text === f.text);
    if (g) g.tools.push(f.tool); else groups.push({ tools: [f.tool], text: f.text });
  }
  return groups.map((g) => ({ label: S.m78.startAsSeenBy(g.tools.map((t) => S.doneSignal.tool[t])), text: g.text }));
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

/** Where Set up in Settings and a house rule's Change go: the Your notes at the start group on Fixing (M108 review: the
 *  start rows have their own group), and the house rules. */
export const START_SETTINGS = { hook: "fixing.start", rules: "rules.house" } as const;
