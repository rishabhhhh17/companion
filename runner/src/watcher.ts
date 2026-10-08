// "Take the wheel": notice when the person changes a project file while the agent is not itself running a tool.
// Uses the folder's own file events (no permission needed) and never sees what anyone types.
import { statSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

const IGNORED = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", "out", "target", "coverage", ".cache", ".turbo", ".venv", "__pycache__", ".claude", ".DS_Store", ".vite", ".parcel-cache"]);
const GRACE_MS = 500;   // file events can arrive a little after the tool that caused them ended
const DEDUPE_MS = 1000; // many quick saves of one file count once

export class ProjectWatcher {
  private fsw?: FSWatcher;
  private tools = new Map<string, number>();
  private lastEnd = 0;
  private recent = new Map<string, number>();
  private startedAt = 0;
  constructor(private project: string, private onForeign: (path: string) => void, private o: { maxBusyMs?: number } = {}) {}

  // The agent is running a tool (or the checks): changes now are its own.
  begin(id: string) { this.tools.set(id, Date.now()); }
  // A tool that was stopped partway may never report back. Forget all of them so the person's next edit is noticed again.
  clearTools() { this.tools.clear(); this.lastEnd = Date.now(); }
  end(id: string) { if (this.tools.delete(id)) this.lastEnd = Date.now(); }
  private busy(): boolean {
    const max = this.o.maxBusyMs ?? 10 * 60_000, now = Date.now();
    for (const [id, t] of this.tools) { if (now - t > max) this.tools.delete(id); }
    return this.tools.size > 0 || now - this.lastEnd < GRACE_MS;
  }

  start() {
    this.startedAt = Date.now();
    try {
      this.fsw = watch(this.project, { recursive: true }, (_ev, name) => {
        if (!name) return;
        const rel = String(name);
        if (rel.split("/").some((seg) => IGNORED.has(seg))) return;
        if (this.busy()) return;
        try {
          const st = statSync(join(this.project, rel));
          if (st.isDirectory()) return;
          // The system sometimes replays changes from just before we started looking. A real change has a new time on it.
          if (st.mtimeMs < this.startedAt - 20) return;
        } catch { if (Date.now() - this.startedAt < 600) return; /* deleted: still a change, once we are settled */ }
        const now = Date.now(), last = this.recent.get(rel);
        if (last && now - last < DEDUPE_MS) return;
        this.recent.set(rel, now);
        this.onForeign(rel);
      });
      this.fsw.on("error", () => { /* a folder that vanished: nothing to watch */ });
    } catch { /* cannot watch: take the wheel simply does not trigger on files */ }
  }
  stop() { this.fsw?.close(); this.fsw = undefined; this.recent.clear(); }
}
