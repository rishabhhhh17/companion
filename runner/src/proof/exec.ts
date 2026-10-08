// Run one command for a proof rung: in the project folder, with a time limit, with the account
// variables removed, and with its whole process group stopped on timeout so no server is left behind.
import { spawn } from "node:child_process";
import { buildChildEnv } from "../safety.ts";

export type RunResult = { code: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean; ms: number };
const TAIL = 8000;   // the end of the output is where the error usually is

export function runCommand(command: string, o: { cwd: string; timeoutMs: number; env?: Record<string, string> }): Promise<RunResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const env = { ...buildChildEnv(process.env, { route: "plan" }), CI: "1", FORCE_COLOR: "0", NO_COLOR: "1", ...(o.env ?? {}) };
    const child = spawn("sh", ["-c", command], { cwd: o.cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", timedOut = false, settled = false;
    const keep = (s: string, chunk: Buffer) => { const n = s + chunk.toString("utf8"); return n.length > TAIL * 2 ? n.slice(-TAIL) : n; };
    child.stdout!.on("data", (c: Buffer) => { out = keep(out, c); });
    child.stderr!.on("data", (c: Buffer) => { err = keep(err, c); });
    const killGroup = (sig: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, sig); } catch { /* already gone */ } };
    const timer = setTimeout(() => { timedOut = true; killGroup("SIGTERM"); setTimeout(() => killGroup("SIGKILL"), 400); }, o.timeoutMs);
    const done = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup("SIGKILL");   // anything the command left running goes with it
      resolve({ code, signal, stdout: out.slice(-TAIL), stderr: err.slice(-TAIL), timedOut, ms: Date.now() - t0 });
    };
    child.on("close", done);
    child.on("error", (e) => { err += String(e.message); done(127, null); });
  });
}
