// A zero cost warm up, so the first reply comes sooner. When Home opens or the ask box gets the keyboard, the page sends
// engine.warm and the engine reads the bundled Claude binary through once (in 4 MB pieces into one buffer that is thrown
// away), so its pages are already in the Mac's memory when the first task starts it. Nothing is run, no prompt is sent,
// the key is not read and nothing goes on the network. At most once every 15 minutes, one read at a time, and Stop
// everything ends a read under way. The Agent SDK's own way to start a parked Claude Code process before a prompt
// (prewarm, alpha in the pinned SDK) is not used: it starts the real process, signs in, and fixes its hooks and settings
// before the project is known, which needs a real run to prove safe (docs/architecture.md, the warm row).
import { open } from "node:fs/promises";

export const CHUNK = 4 * 1024 * 1024;
export const WARM_EVERY_MS = 15 * 60 * 1000;
export type WarmResult = { read: boolean; bytes: number; ms: number; why?: "recent" | "busy" | "no_binary" | "failed" | "stopped" };

/** Reads the whole file once and keeps nothing. Returns how many bytes were read. Rejects when stopped or unreadable. */
export async function readThrough(path: string, signal: AbortSignal): Promise<number> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    let total = 0;
    for (;;) {
      if (signal.aborted) throw new Error("stopped");
      const { bytesRead } = await fh.read(buf, 0, CHUNK, total);
      if (bytesRead <= 0) return total;
      total += bytesRead;
    }
  } finally { await fh.close(); }
}

export class Warmer {
  private last = Number.NEGATIVE_INFINITY;
  private busy = false;
  private ac: AbortController | null = null;
  constructor(private o: { binary: () => string | null; now?: () => number; everyMs?: number; read?: (path: string, signal: AbortSignal) => Promise<number> }) {}

  async warm(): Promise<WarmResult> {
    const now = this.o.now ?? Date.now;
    const t0 = now();
    if (this.busy) return { read: false, bytes: 0, ms: 0, why: "busy" };
    if (t0 - this.last < (this.o.everyMs ?? WARM_EVERY_MS)) return { read: false, bytes: 0, ms: 0, why: "recent" };
    let path: string | null;
    try { path = this.o.binary(); } catch { path = null; }
    if (!path) return { read: false, bytes: 0, ms: 0, why: "no_binary" };
    this.busy = true; this.last = t0;
    const ac = new AbortController(); this.ac = ac;
    try {
      const bytes = await (this.o.read ?? readThrough)(path, ac.signal);
      return { read: true, bytes, ms: Math.max(0, now() - t0) };
    } catch {
      return { read: false, bytes: 0, ms: Math.max(0, now() - t0), why: ac.signal.aborted ? "stopped" : "failed" };
    } finally { this.busy = false; if (this.ac === ac) this.ac = null; }
  }

  /** Stop everything: a read under way ends at its next piece. */
  stop() { this.ac?.abort(); }
}
