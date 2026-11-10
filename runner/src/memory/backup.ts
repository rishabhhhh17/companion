// M78: export and restore, so notes are never lost. Export is one plain text file with every note of the project and of
// the person's profile, and the project's house rules, each line in the store's own form (its words, source, date and id),
// so the file reads back exactly. The person saves it where they choose (the shell's save dialog, save_notes).
// Restore reads such a file back on the person's yes: each line goes through the same filter as any new line (filter.ts),
// a line already there is skipped, a line the person forgot stays forgotten, and nothing is removed. A house rule is added
// back to rules.txt only when it reads as one of the five kinds of rule (rules only make things stricter).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic.ts";
import { companionDirUsable, readCompanionFile } from "../companionfile.ts";
import { ruleOf } from "../../../protocol/settings.ts";
import type { MemoryStore } from "./store.ts";
import { screenLine } from "./filter.ts";
import { PRODUCT } from "../names.ts";

/** The line that says a file is an export of this kind, whatever the product is called by then. */
export const EXPORT_MARK = "notes export, version 1.";
/** The largest file a restore reads (the shell refuses bigger ones too). */
export const RESTORE_MAX = 1024 * 1024;
const H = { project: "## About this project", profile: "## How you like to work", rules: "## House rules" } as const;

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function exportNotes(project: string, m: MemoryStore, now: Date = new Date()): string {
  const part = (head: string, lines: string[]) => [head, ...lines].join("\n");
  const rules = rulesOf(project);
  return [
    `# Everything ${PRODUCT} remembers`,
    "",
    `${PRODUCT} ${EXPORT_MARK} Saved ${day(now)}. Keep this file somewhere safe. On the Memory page, Restore from a file puts these lines back. Each line says where it came from and when.`,
    "",
    part(H.project, m.fileLines("project")),
    "",
    part(H.profile, m.fileLines("profile")),
    "",
    part(H.rules, rules.map((r) => `- ${r}`)),
    "",
  ].join("\n");
}

function rulesOf(project: string): string[] {
  if (!project) return [];
  const r = readCompanionFile(project, "rules.txt");
  return r.state === "ok" ? r.text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && !l.startsWith("#")) : [];
}

export type Parsed = { project: string[]; profile: string[]; rules: string[] };
/** The parts of an export, or null for a file that is not one. */
export function parseExport(text: string): Parsed | null {
  if (typeof text !== "string" || text.length > RESTORE_MAX || !text.includes(EXPORT_MARK)) return null;
  const out: Parsed = { project: [], profile: [], rules: [] };
  let at: keyof Parsed | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trimEnd();
    if (l === H.project) at = "project"; else if (l === H.profile) at = "profile"; else if (l === H.rules) at = "rules";
    else if (l.startsWith("## ")) at = null;
    else if (at && l.startsWith("- ")) out[at].push(l);
  }
  return out;
}

export type Restored = { added: number; skipped: number; forgotten: number; refused: number; problem?: string };

/** Puts an export's lines back. Never removes anything. */
export function restoreNotes(project: string, m: MemoryStore, text: string, now: Date = new Date()): Restored {
  const p = parseExport(text);
  if (!p) return { added: 0, skipped: 0, forgotten: 0, refused: 0, problem: `That file is not a notes export from ${PRODUCT}, so nothing was changed.` };
  const a = m.restoreLines("project", p.project, now), b = m.restoreLines("profile", p.profile, now), c = restoreRules(project, p.rules);
  const sum = (k: "added" | "skipped" | "forgotten" | "refused") => a[k] + b[k] + c[k];
  const problem = a.problem ?? b.problem ?? c.problem;
  return { added: sum("added"), skipped: sum("skipped"), forgotten: sum("forgotten"), refused: sum("refused"), ...(problem ? { problem } : {}) };
}

function restoreRules(project: string, lines: string[]): Restored {
  const out: Restored = { added: 0, skipped: 0, forgotten: 0, refused: 0 };
  if (!lines.length) return out;
  if (!project) return { ...out, refused: lines.length };
  const r = readCompanionFile(project, "rules.txt");
  if (r.state === "unreadable" || !companionDirUsable(project)) return { ...out, refused: lines.length, problem: "Your house rules file could not be changed here, so the rules were left as they are." };
  const now = r.state === "ok" ? r.text : "";
  const have = new Set(rulesOf(project).map((l) => l.toLowerCase()));
  const add: string[] = [];
  for (const l of lines) {
    const t = l.slice(2).replace(/\s+/g, " ").trim();
    const rule = ruleOf(t);
    if (!rule || !screenLine(t).ok) { out.refused++; continue; }
    if (have.has(rule.text.toLowerCase())) { out.skipped++; continue; }
    have.add(rule.text.toLowerCase()); add.push(rule.text); out.added++;
  }
  if (add.length) { mkdirSync(join(project, ".companion"), { recursive: true }); writeAtomic(join(project, ".companion", "rules.txt"), `${now.replace(/\n*$/, now ? "\n" : "")}${add.join("\n")}\n`, "keep"); }
  return out;
}
