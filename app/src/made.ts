// The made folders list (M14): the page side of the list in Settings. The shell (app/src-tauri/src/made.rs) lists the folders
// "make me something" made and moves one to the Trash; this file only reads its answer, checks it, and puts it in plain
// words (a rough size, a date, the marks). The rows come from one shared fixture (protocol/fixtures/made-list.jsonl) that
// the shell's tests also run, so the two always agree on the shape. Every word is in strings.ts (S.made), the product's
// names in protocol/names.json. madePanel.tsx draws it with the plain rows and buttons the practice list uses.
import { S } from "./strings.ts";

export type MadeFolder = { name: string; madeMs: number | null; bytes: number | null; rough: boolean; open: boolean; working: boolean; git: boolean };
export type MadeList = { where: string; busy: boolean; folders: MadeFolder[]; more: number };

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isRow = (v: unknown): v is MadeFolder => {
  const r = v as Record<string, unknown> | null;
  return !!r && typeof r === "object" && typeof r.name === "string" && r.name.length > 0
    && (r.madeMs === null || isNum(r.madeMs)) && (r.bytes === null || isNum(r.bytes))
    && typeof r.rough === "boolean" && typeof r.open === "boolean" && typeof r.working === "boolean" && typeof r.git === "boolean";
};

/** The shell's answer to list_made, or null when it is not one (the page then says the list could not be read). */
export function madeFrom(v: unknown): MadeList | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.where !== "string" || typeof o.busy !== "boolean" || !Array.isArray(o.folders) || !isNum(o.more)) return null;
  if (!o.folders.every(isRow)) return null;
  return { where: o.where, busy: o.busy, folders: o.folders as MadeFolder[], more: o.more };
}

const MB = 1_000_000, GB = 1_000_000_000;
/** A rough size in plain words, the way Finder counts (1 MB is a million bytes). A count that stopped early says at least. */
export function sizeWords(bytes: number | null, rough: boolean): string {
  if (bytes === null) return S.made.sizeUnknown;
  if (bytes === 0 && !rough) return S.made.sizeEmpty;
  if (bytes < MB && !rough) return S.made.sizeUnder;
  const n = bytes >= GB ? `${(Math.round(bytes / GB * 10) / 10).toString()} GB` : `${Math.max(1, Math.round(bytes / MB))} MB`;
  return S.made.size(n, rough);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** When it was made, in plain words: today, yesterday, a few days ago, then the date. `now` is passed in so a test fixes it. */
export function whenWords(ms: number | null, now: number): string {
  if (ms === null) return S.made.dateUnknown;
  const day = (t: number) => { const d = new Date(t); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000; };
  const ago = day(now) - day(ms);
  if (ago <= 0) return S.made.today;
  if (ago === 1) return S.made.yesterday;
  if (ago < 7) return S.made.daysAgo(ago);
  const d = new Date(ms);
  return S.made.on(`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
}

/** The marks on a row, in the order they are drawn: the project open now, something working in it, git history. */
export function marks(f: MadeFolder): string[] {
  const out: string[] = [];
  if (f.open) out.push(S.made.openNow);
  if (f.working) out.push(S.made.working);
  if (f.git) out.push(S.made.git);
  return out;
}

/** Open as project and Move to the Trash wait while anything works or waits (the shell refuses too). The project open now is
 *  already the project, and is never moved. */
export const canOpen = (f: MadeFolder, busy: boolean): boolean => !busy && !f.open;
export const canTrash = (f: MadeFolder, busy: boolean): boolean => !busy && !f.open;

/** The question before Move to the Trash, and its Yes. A folder with git history gets the longer question, and its Yes is
 *  what tells the shell the person confirmed that too (trash_made git). */
export function trashAsk(f: MadeFolder): { question: string; yes: string; git: boolean } {
  return f.git ? { question: S.made.sureGit(f.name), yes: S.made.yesGit, git: true } : { question: S.made.sure(f.name), yes: S.made.yes, git: false };
}
