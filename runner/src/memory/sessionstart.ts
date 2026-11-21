// M78: the start block's file for Claude Code's SessionStart hook (donesignal.ts, kind "start"), and the project's search
// index (notesindex.ts). Both are written only while the person has the start hook set up in that project, and both are
// copies: the notes files stay the truth. With the hook gone, both files go at the next look (refresh) or the next start of
// the engine (sweep). Delete everything removes Squibby's whole data folder, these with it.
// The file is written again whenever the notes might have changed; Claude Code reads it once as a session starts, so an
// open session keeps the block it started with and prompt caching keeps working.
// M108: Codex, Gemini CLI and Antigravity can have the start hook too. Each tool's file is written only while that tool's hook
// is set up here: the plain block for Claude Code and Codex (one shared file), JSON around it for Gemini CLI and Antigravity.
// Claude Code and Codex read AGENTS.md themselves, so the lines of Squibby's shared block there are not said twice; Gemini CLI
// and Antigravity may not read AGENTS.md (Gemini CLI reads GEMINI.md unless told otherwise), so they are handed those too.
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic.ts";
import { START_TOOLS, startFileName, type DoneSignals, type DoneTool } from "../donesignal.ts";
import { MemoryStore } from "./store.ts";
import { NotesIndex } from "./notesindex.ts";
import { pickNotes, sharedLinesOf, startBlock, type Picked, type StartBlock } from "./startblock.ts";

/** M108 review: forms is what each tool set up here is handed, in START_TOOLS order, exactly its file's text before any JSON
 *  around it, so the Memory page can show each one. text stays Claude Code's view; lines are every line any tool is handed. */
export type StartForm = { tool: DoneTool; text: string };
export type StartView = { hook: boolean; text: string; lines: Picked[]; forms: StartForm[] };
/** M108: every start file of a token: <token>.md (Claude Code and Codex), <token>.gemini.json, <token>.antigravity.json. */
const TOKEN_FILE = /^([0-9a-f]{24})\.(?:md|gemini\.json|antigravity\.json)$/;
/** M108: the forms of the start file, each with the tools that print it. */
const FORMS: readonly { tools: readonly DoneTool[]; full: boolean }[] = [{ tools: ["claude", "codex"], full: false }, { tools: ["gemini"], full: true }, { tools: ["antigravity"], full: true }];

/** M108: what a tool's start file holds for a block: the block itself for Claude Code and Codex; Gemini CLI's SessionStart
 *  answer (hookSpecificOutput.additionalContext, geminicli.com/docs/hooks/reference); Antigravity's injectSteps with one
 *  system message (antigravity.google/docs/hooks, the SessionStart example; [verify] the inner form on a real Mac). */
export function startPayload(tool: DoneTool, text: string): string {
  if (tool === "gemini") return JSON.stringify({ hookSpecificOutput: { additionalContext: text } });
  if (tool === "antigravity") return JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: text } }] });
  return text;
}

/** A plain file's text, never through a link, at most 1 MB; null otherwise. */
function plainText(file: string): string | null {
  try { const st = lstatSync(file); if (!st.isFile() || st.size > 1024 * 1024) return null; return readFileSync(file, "utf8"); } catch { return null; }
}

/** The lines Claude Code already reads from Squibby's block in AGENTS.md: when CLAUDE.md imports AGENTS.md, or there is
 *  no CLAUDE.md (then Claude Code reads AGENTS.md itself). A link is never read. */
export function sharedForClaude(project: string): Set<string> {
  const agents = plainText(join(project, "AGENTS.md"));
  if (agents === null) return new Set();
  let claudeMissing = false;
  try { lstatSync(join(project, "CLAUDE.md")); } catch { claudeMissing = true; }
  const claude = claudeMissing ? null : plainText(join(project, "CLAUDE.md"));
  const imports = claudeMissing || (claude !== null && /^@AGENTS\.md\s*$/m.test(claude));
  return imports ? sharedLinesOf(agents) : new Set();
}

/** M108: the lines Codex already reads from Squibby's block in AGENTS.md (Codex always reads AGENTS.md). A link is never read. */
export function sharedForCodex(project: string): Set<string> {
  const agents = plainText(join(project, "AGENTS.md"));
  return agents === null ? new Set() : sharedLinesOf(agents);
}

export class SessionStartNotes {
  readonly index: NotesIndex;
  constructor(private o: { data: string; signals: DoneSignals; memoryDir: string }) { this.index = new NotesIndex(o.data); }

  private fileOf(token: string, tool: DoneTool = "claude") { return join(this.o.signals.startFolder, startFileName(token, tool)); }
  /** M108: the tools whose start hook is set up in this project. */
  private hooksOn(project: string): DoneTool[] { return START_TOOLS.filter((t) => { try { return this.o.signals.plan(project, t, "start").on; } catch { return false; } }); }

  /** The block as Claude Code would be handed it now. Written to its file, with the index rebuilt, only while the hook is
   *  set up; otherwise any old copy is removed. Never throws: memory is never worth stopping anything for. */
  refresh(project: string, m?: MemoryStore): StartView {
    try {
      const store = m ?? new MemoryStore({ project, profileDir: this.o.memoryDir });
      const on = this.hooksOn(project), hook = on.length > 0;
      const token = this.o.signals.tokenFor(project, hook);
      // M79 (the memory lab, 11 Nov 2026): no search line in the block. It cost about 100 tokens a session and was used in
      // 0 of 18 sessions. The index is still rebuilt below, so the search command keeps working for anyone who calls it.
      const picked = pickNotes(project, store);
      const claude = startBlock(picked, { shared: sharedForClaude(project) });
      const blockOf = (tool: DoneTool): StartBlock => {
        if (FORMS.find((x) => x.tools.includes(tool))!.full) return startBlock(picked);
        // Codex only (no Claude Code here): the lines of AGENTS.md's shared block are left out, as Codex reads AGENTS.md.
        return tool === "codex" && !on.includes("claude") ? startBlock(picked, { shared: sharedForCodex(project) }) : claude;
      };
      const blocks = on.map((tool) => ({ tool, b: blockOf(tool) }));
      const forms: StartForm[] = blocks.map(({ tool, b }) => ({ tool, text: b.text }));
      // The rows: every line that at least one tool set up is handed, in the notes' own order.
      const handed = new Set(blocks.flatMap(({ b }) => b.lines));
      const lines = hook ? picked.filter((p) => handed.has(p)) : claude.lines;
      const view: StartView = { hook, text: claude.text, lines, forms };
      if (token && hook) {
        mkdirSync(this.o.signals.startFolder, { recursive: true, mode: 0o700 });
        for (const f of FORMS) {
          const tool = f.tools.find((t) => on.includes(t));
          if (!tool) { this.dropFile(token, f.tools[0]!); continue; }
          const text = forms.find((x) => x.tool === tool)!.text;
          // A tool's JSON with nothing in it is not written: the hook then prints nothing at all.
          if (f.full && !text) this.dropFile(token, tool); else writeAtomic(this.fileOf(token, tool), startPayload(tool, text), 0o600);
        }
        this.index.rebuild(project, store, token);
      } else if (token) this.drop(token);
      return view;
    } catch { return { hook: false, text: "", lines: [], forms: [] }; }
  }

  /** Removes a project's start file and index (the hook was removed). */
  forget(project: string) { const t = this.o.signals.tokenFor(project, false); if (t) this.drop(t); }
  private dropFile(token: string, tool: DoneTool) { try { rmSync(this.fileOf(token, tool), { force: true }); } catch { /* gone */ } }
  private drop(token: string) { for (const f of FORMS) this.dropFile(token, f.tools[0]!); this.index.remove(token); }

  /** At the engine's start: the start files of projects whose hook is gone (removed by Delete everything's helper, leaving a
   *  project, or by hand) are removed, with their index. */
  sweep() {
    let names: string[] = [];
    try { names = readdirSync(this.o.signals.startFolder); } catch { return; }
    for (const n of names) {
      const t = TOKEN_FILE.exec(n)?.[1];
      if (!t) continue;
      const p = this.o.signals.projectOf(t);
      if (!p) { this.drop(t); continue; }
      // M108: each tool's file by its own hook; the index goes once no tool has one.
      const on = this.hooksOn(p);
      if (!on.length) { this.drop(t); continue; }
      const form = FORMS.find((f) => startFileName(t, f.tools[0]!) === n)!;
      if (!form.tools.some((x) => on.includes(x))) this.dropFile(t, form.tools[0]!);
    }
  }
}
