// Run one command for a proof rung: in the project folder, with a time limit, with a short allow-list environment (no keys),
// stoppable from outside, and with everything it started stopped afterwards, even a program that tried to hide by detaching.
import { spawn } from "node:child_process";
import { minimalEnv } from "../env.ts";

export type RunResult = { code: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean; ms: number; aborted?: boolean; matched?: boolean };
const TAIL = 8000;   // the end of the output is where the error usually is
const GRACE_MS = 1000;   // after the command itself ends, how long to wait for its output to finish before giving up on the pipes

// onOutput: each piece of output as it arrives (both streams), for a command whose progress is shown while it runs.
export type RunOptions = { cwd: string; timeoutMs: number; env?: Record<string, string>; signal?: AbortSignal; stopWhen?: RegExp; onOutput?: (text: string) => void };
export function runCommand(command: string, o: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    if (o.signal?.aborted) return resolve({ code: null, signal: "SIGTERM", stdout: "", stderr: "", timedOut: false, ms: 0, aborted: true });
    const env = { ...minimalEnv(), FORCE_COLOR: "0", NO_COLOR: "1", ...(o.env ?? {}) };
    const child = spawn("sh", ["-c", command], { cwd: o.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false, aborted = false, settled = false, matched = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const keep = (s: string, chunk: Buffer) => { const n = s + chunk.toString("utf8"); return n.length > TAIL * 2 ? n.slice(-TAIL) : n; };
    const watch = () => { if (o.stopWhen && !matched && (o.stopWhen.test(out) || o.stopWhen.test(err))) { matched = true; stopEverything(); } };
    const tell = (c: Buffer) => { if (o.onOutput) try { o.onOutput(c.toString("utf8")); } catch { /* a listener that breaks must not break the command */ } };
    child.stdout!.on("data", (c: Buffer) => { out = keep(out, c); watch(); tell(c); });
    child.stderr!.on("data", (c: Buffer) => { err = keep(err, c); watch(); tell(c); });
    const killGroup = (sig: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, sig); } catch { /* already gone */ } };
    const stopEverything = () => { killGroup("SIGTERM"); setTimeout(() => killGroup("SIGKILL"), 300); };
    const timer = setTimeout(() => { timedOut = true; stopEverything(); }, o.timeoutMs);
    const onAbort = () => { aborted = true; stopEverything(); };
    o.signal?.addEventListener("abort", onAbort, { once: true });
    const done = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(graceTimer);
      o.signal?.removeEventListener("abort", onAbort);
      child.stdout?.destroy(); child.stderr?.destroy();
      killGroup("SIGKILL");   // everything in the command's group goes with it (a program that starts its own session is out of reach)
      resolve({ code, signal, stdout: out.slice(-TAIL), stderr: err.slice(-TAIL), timedOut, ms: Date.now() - t0, ...(aborted ? { aborted } : {}), ...(matched ? { matched } : {}) });
    };
    child.on("exit", (code, signal) => { graceTimer = setTimeout(() => done(code, signal), GRACE_MS); });   // a child that kept the pipe open must not hang us
    child.on("close", done);
    child.on("error", (e) => { err += String(e.message); done(127, null); });
  });
}

/** One word for the shell, single quoted, so nothing in it ($, backticks, quotes) is ever expanded. */
export const shq = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;
