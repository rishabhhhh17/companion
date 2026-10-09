// The shared AGENTS.md (and a CLAUDE.md that imports it), so any editor or command line tool a person codes with starts
// from the same project facts. Project facts and house rules only: never the personal profile, never a key or private line.
// Files the person already has are never changed without a yes, and then only one marked block is added, which can be removed.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { screenLine } from "./filter.ts";
import type { MemoryStore } from "./store.ts";

export type SyncResult = { status: "written" | "unchanged" | "needs_ask" | "declined" | "nothing_to_write" | "failed"; files: string[]; reason?: string };
const BEGIN = "<!-- companion:begin (kept up to date by Companion; delete this whole block to stop) -->";
const END = "<!-- companion:end -->";
const BLOCK = new RegExp(`\\n?${BEGIN.replace(/[()]/g, "\\$&")}[\\s\\S]*?${END}\\n?`);

function ruleLines(project: string): string[] {
  try { return readFileSync(join(project, ".companion", "rules.txt"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).slice(0, 20); } catch { return []; }
}

function section(project: string, m: MemoryStore): string | null {
  const facts = m.list("project").entries.map((e) => e.text).filter((t) => screenLine(t).ok);
  const rules = ruleLines(project).filter((t) => screenLine(t).ok);
  if (!facts.length && !rules.length) return null;
  return [BEGIN, "## Project notes (from Companion)", ...(facts.length ? facts.map((f) => `- ${f}`) : ["- Nothing yet."]), ...(rules.length ? ["", "## House rules", ...rules.map((r) => `- ${r}`)] : []), END].join("\n");
}

type State = { kind: "absent" } | { kind: "text"; text: string } | { kind: "unreadable" };
function stateOf(file: string): State {
  if (!existsSync(file)) return { kind: "absent" };
  try { return { kind: "text", text: readFileSync(file, "utf8") }; } catch { return { kind: "unreadable" }; }
}
function save(file: string, text: string) {
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
const withBlock = (text: string, block: string) => (BLOCK.test(text) ? text.replace(BLOCK, `\n${block}\n`) : `${text.replace(/\n*$/, "\n")}\n${block}\n`);

export function syncAgentsFiles(project: string, m: MemoryStore, o: { approved: boolean; declined?: boolean; onlyIfPresent?: boolean }): SyncResult {
  const block = section(project, m);
  const aPath = join(project, "AGENTS.md"), cPath = join(project, "CLAUDE.md");
  const a = stateOf(aPath), c = stateOf(cPath);
  const hasOurs = a.kind === "text" && BLOCK.test(a.text);
  // Keeping in step after a change: only where Companion already wrote its block, and a block with nothing left goes away.
  if (o.onlyIfPresent && !hasOurs) return { status: "unchanged", files: [] };
  if (!block) return hasOurs && removeSection(aPath) ? { status: "written", files: ["AGENTS.md"] } : { status: "nothing_to_write", files: [] };
  if (a.kind === "unreadable" || c.kind === "unreadable") return { status: "failed", files: [], reason: "A file in your project could not be read, so nothing was changed." };

  const ours = (s: State) => s.kind === "text" && BLOCK.test(s.text);
  const importsAgents = (s: State) => s.kind === "text" && /^@AGENTS\.md\s*$/m.test(s.text);
  const askAgents = a.kind === "text" && !ours(a);
  const askClaude = c.kind === "text" && !ours(c) && !importsAgents(c);
  if (askAgents || askClaude) {
    const files = [...(askAgents ? ["AGENTS.md"] : []), ...(askClaude ? ["CLAUDE.md"] : [])];
    if (o.declined) return { status: "declined", files: [] };
    if (!o.approved) return { status: "needs_ask", files };
  }
  try {
    const changed: string[] = [];
    const put = (file: string, name: string, next: string, prev: string | null) => { if (prev !== next) { save(file, next); changed.push(name); } };
    // AGENTS.md: ours or absent we manage; theirs only after a yes.
    if (a.kind === "absent") put(aPath, "AGENTS.md", `# AGENTS.md\n\nFacts about this project for any AI coding tool.\n\n${block}\n`, null);
    else put(aPath, "AGENTS.md", withBlock(a.text, block), a.text);
    // CLAUDE.md: Claude Code reads it, so it must import AGENTS.md.
    if (c.kind === "absent") put(cPath, "CLAUDE.md", "@AGENTS.md\n", null);
    else if (!importsAgents(c) && !ours(c)) put(cPath, "CLAUDE.md", withBlock(c.text, `${BEGIN}\n@AGENTS.md\n${END}`), c.text);
    return changed.length ? { status: "written", files: changed } : { status: "unchanged", files: [] };
  } catch (e) {
    return { status: "failed", files: [], reason: `Could not write the shared files (${(e as Error).message}).` };
  }
}

// Takes our block out of a file and leaves everything else exactly as it was.
export function removeSection(file: string): boolean {
  try {
    const text = readFileSync(file, "utf8");
    if (!BLOCK.test(text)) return false;
    save(file, text.replace(BLOCK, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "\n"));
    return true;
  } catch { return false; }
}
