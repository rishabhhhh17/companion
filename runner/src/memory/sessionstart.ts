// M78: the start block's file for Claude Code's SessionStart hook (donesignal.ts, kind "start"), and the project's search
// index (notesindex.ts). Both are written only while the person has the start hook set up in that project, and both are
// copies: the notes files stay the truth. With the hook gone, both files go at the next look (refresh) or the next start of
// the engine (sweep). Delete everything removes Squibby's whole data folder, these with it.
// The file is written again whenever the notes might have changed; Claude Code reads it once as a session starts, so an
// open session keeps the block it started with and prompt caching keeps working.
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic.ts";
import type { DoneSignals } from "../donesignal.ts";
import { MemoryStore } from "./store.ts";
import { NotesIndex } from "./notesindex.ts";
import { pickNotes, sharedLinesOf, startBlock, type Picked } from "./startblock.ts";

export type StartView = { hook: boolean; text: string; lines: Picked[] };
const TOKEN_FILE = /^([0-9a-f]{24})\.md$/;

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

export class SessionStartNotes {
  readonly index: NotesIndex;
  constructor(private o: { data: string; signals: DoneSignals; memoryDir: string }) { this.index = new NotesIndex(o.data); }

  private fileOf(token: string) { return join(this.o.signals.startFolder, `${token}.md`); }
  private hookOn(project: string): boolean { try { return this.o.signals.plan(project, "claude", "start").on; } catch { return false; } }

  /** The block as Claude Code would be handed it now. Written to its file, with the index rebuilt, only while the hook is
   *  set up; otherwise any old copy is removed. Never throws: memory is never worth stopping anything for. */
  refresh(project: string, m?: MemoryStore): StartView {
    try {
      const store = m ?? new MemoryStore({ project, profileDir: this.o.memoryDir });
      const hook = this.hookOn(project);
      const token = this.o.signals.tokenFor(project, hook);
      const view = { hook, ...startBlock(pickNotes(project, store), { shared: sharedForClaude(project), ...(token ? { search: this.index.command(token) } : {}) }) };
      if (token && hook) {
        mkdirSync(this.o.signals.startFolder, { recursive: true, mode: 0o700 });
        writeAtomic(this.fileOf(token), view.text, 0o600);
        this.index.rebuild(project, store, token);
      } else if (token) this.drop(token);
      return view;
    } catch { return { hook: false, text: "", lines: [] }; }
  }

  /** Removes a project's start file and index (the hook was removed). */
  forget(project: string) { const t = this.o.signals.tokenFor(project, false); if (t) this.drop(t); }
  private drop(token: string) { try { rmSync(this.fileOf(token), { force: true }); } catch { /* gone */ } this.index.remove(token); }

  /** At the engine's start: the start files of projects whose hook is gone (removed by Delete everything's helper, leaving a
   *  project, or by hand) are removed, with their index. */
  sweep() {
    let names: string[] = [];
    try { names = readdirSync(this.o.signals.startFolder); } catch { return; }
    for (const n of names) {
      const t = TOKEN_FILE.exec(n)?.[1];
      if (!t) continue;
      const p = this.o.signals.projectOf(t);
      if (!p || !this.hookOn(p)) this.drop(t);
    }
  }
}
