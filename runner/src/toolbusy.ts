// M90 (F32, Flowflow peeks out of the notch): the person's own AI tool is working. Its guard hook writes a request into
// Squibby's own guard folder each time it runs a command (guard.ts, after the person's yes); this turns those into
// hook.busy for the pages, at most once every REPEAT_MS per project, and says busy false when the tool's done hook fires
// (donesignal.ts onDone) or on Stop everything (rule 11). Only the project is said: never the command, never a file.
// No timer runs here: the pages count a busy tool as quiet once BUSY_HOLD_MS (app/src/peekOut.ts) passes with nothing new.

/** At most one busy event per project this often, however many commands the tool runs. */
export const REPEAT_MS = 15_000;

export type ToolBusyDeps = { emit: (e: Record<string, unknown>) => void; now?: () => number };

export class ToolBusy {
  private said = new Map<string, number>();
  constructor(private o: ToolBusyDeps) {}
  private now(): number { return (this.o.now ?? Date.now)(); }
  /** The tool ran a command in `project`. */
  seen(project: string): void {
    const t = this.now(), last = this.said.get(project);
    if (last !== undefined && t - last < REPEAT_MS) return;
    this.said.set(project, t);
    this.o.emit({ type: "hook.busy", project, busy: true });
  }
  /** The tool's done hook fired for `project`: said once, only if it was said busy. */
  done(project: string): void {
    if (!this.said.delete(project)) return;
    this.o.emit({ type: "hook.busy", project, busy: false });
  }
  /** Stop everything: every busy project is said done. The person's own tools keep running (they are theirs). */
  stop(): void { for (const p of [...this.said.keys()]) this.done(p); }
  /** For tests: the projects said busy now. */
  busy(): string[] { return [...this.said.keys()]; }
}
