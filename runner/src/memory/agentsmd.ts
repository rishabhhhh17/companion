// The shared AGENTS.md (and a CLAUDE.md that imports it), so any editor or command line tool a person codes with starts
// from the same project facts. Project facts and house rules only: never the personal profile, never a key or private line.
// Files the person already has are never changed without a yes, and then only one marked block is added, which can be removed.
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { writeAtomic } from "../atomic.ts";
import { screenLine } from "./filter.ts";
import { readCompanionFile } from "../companionfile.ts";
import type { MemoryStore } from "./store.ts";
import { NAMES, PRODUCT } from "../names.ts";

export type SyncResult = { status: "written" | "unchanged" | "needs_ask" | "declined" | "nothing_to_write" | "failed"; files: string[]; reason?: string };
const BEGIN = `<!-- companion:begin (kept up to date by ${PRODUCT}; delete this whole block to stop) -->`;
const END = "<!-- companion:end -->";
// Found by its opening mark alone, so a block written under an earlier name is still ours to update and to remove.
const BLOCK = new RegExp(`\\n?<!-- companion:begin[^\\n]*?-->[\\s\\S]*?${END}\\n?`);

/** True for a folder Squibby made for a request with no project open: it sits directly inside the one folder for all of them
 *  (protocol/names.json newFolderParent; the shell makes it, app/src-tauri/src/newfolder.rs). There the shared files are
 *  written only when the person asks (M14 real run: so that Undo of the first step gives back an empty folder). */
export function madeBySquibby(project: string): boolean {
  const inParent = (p: string) => basename(dirname(p)) === NAMES.newFolderParent;
  const plain = resolve(project);
  if (inParent(plain)) return true;
  // Reached through a link (the make folder, or a folder in it, opened by another path): where it really is decides.
  try { return inParent(realpathSync.native(plain)); } catch { return false; }
}

function ruleLines(project: string): string[] {
  const r = readCompanionFile(project, "rules.txt");   // never through a link (companionfile.ts)
  return r.state === "ok" ? r.text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).slice(0, 20) : [];
}

function section(project: string, m: MemoryStore): string | null {
  const facts = m.list("project").entries.map((e) => e.text).filter((t) => screenLine(t).ok);
  const rules = ruleLines(project).filter((t) => screenLine(t).ok);
  if (!facts.length && !rules.length) return null;
  return [BEGIN, `## Project notes (from ${PRODUCT})`, ...(facts.length ? facts.map((f) => `- ${f}`) : ["- Nothing yet."]), ...(rules.length ? ["", "## House rules", ...rules.map((r) => `- ${r}`)] : []), END].join("\n");
}

type State = { kind: "absent" } | { kind: "text"; text: string } | { kind: "unreadable" } | { kind: "link" };
// A link is never written through or over: CLAUDE.md pointing at AGENTS.md is the person's own setup (and a link in a project
// that came from the internet could point anywhere), so nothing is changed while either file is one.
const isLink = (file: string) => { try { return lstatSync(file).isSymbolicLink(); } catch { return false; } };
function stateOf(file: string): State {
  if (isLink(file)) return { kind: "link" };
  if (!existsSync(file)) return { kind: "absent" };
  try { return { kind: "text", text: readFileSync(file, "utf8") }; } catch { return { kind: "unreadable" }; }
}
// The new file keeps the old file's permissions.
const save = (file: string, text: string) => writeAtomic(file, text, "keep");
const withBlock = (text: string, block: string) => (BLOCK.test(text) ? text.replace(BLOCK, `\n${block}\n`) : `${text.replace(/\n*$/, "\n")}\n${block}\n`);

export function syncAgentsFiles(project: string, m: MemoryStore, o: { approved: boolean; declined?: boolean; onlyIfPresent?: boolean }): SyncResult {
  const block = section(project, m);
  const aPath = join(project, "AGENTS.md"), cPath = join(project, "CLAUDE.md");
  const a = stateOf(aPath), c = stateOf(cPath);
  const hasOurs = a.kind === "text" && BLOCK.test(a.text);
  // Keeping in step after a change: only where Companion already wrote its block, and a block with nothing left goes away.
  if (o.onlyIfPresent && !hasOurs) return { status: "unchanged", files: [] };
  if (!block) return hasOurs && removeSection(aPath) ? { status: "written", files: ["AGENTS.md"] } : { status: "nothing_to_write", files: [] };
  if (a.kind === "link" || c.kind === "link") return { status: "failed", files: [], reason: `${a.kind === "link" ? "AGENTS.md" : "CLAUDE.md"} in your project is a link to another file, so nothing was changed. ${PRODUCT} never writes through a link.` };
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
    return { status: "failed", files: [], reason: "Could not write the shared files. Try again." };
  }
}

// Takes our block out of a file and leaves everything else exactly as it was.
export function removeSection(file: string): boolean {
  if (isLink(file)) return false;
  try {
    const text = readFileSync(file, "utf8");
    if (!BLOCK.test(text)) return false;
    save(file, text.replace(BLOCK, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "\n"));
    return true;
  } catch { return false; }
}
