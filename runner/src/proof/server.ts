// Start the project's own server for the browser check, on a port nobody else is using, and stop it
// completely afterwards. A server that was already running is never mistaken for ours.
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";
import { minimalEnv } from "../env.ts";
import type { Start } from "./detect.ts";
import type { PythonServer } from "./python.ts";

export type Running = { ok: true; url: string; port: number; stop: () => Promise<void> };
// portBusy: the server stopped because its port is held by another program (often the person's own copy of the site, on a
// port the project hard codes), which says nothing about the project.
export type Failed = { ok: false; reason: string; notAServer?: boolean; aborted?: boolean; output?: string; portBusy?: number };
/** The port a server's output says is already in use (Node's EADDRINUSE, Bun's "Is port N in use?", Vite's and Next's own
 *  words), or null. 0 when it says so without naming the port. */
export function busyPort(output: string): number | null {
  const m = /address already in use[^\n]*?:(\d{2,5})\b|\bport (\d{2,5}) is (?:already )?in use|Is port (\d{2,5}) in use/i.exec(output);
  if (m) return Number(m[1] ?? m[2] ?? m[3]);
  return /\bEADDRINUSE\b|address already in use/i.test(output) ? 0 : null;
}

export function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
  });
}
const portBusy = (port: number) => new Promise<boolean>((res) => {
  const s = createServer();
  s.once("error", () => res(true));
  s.once("listening", () => s.close(() => res(false)));
  s.listen(port, "127.0.0.1");
});

// Dev servers that ignore the PORT variable get their port on the command line.
export function portArgs(scriptText: string, port: number): string {
  if (/\bvite\b/.test(scriptText)) return ` -- --port ${port} --strictPort --host 127.0.0.1`;
  if (/\bnext\b/.test(scriptText)) return ` -- -p ${port} -H 127.0.0.1`;
  return "";
}

// Python dev servers are told the host and port on the command line: only this Mac, on the port Companion chose.
export function pythonPortArgs(kind: PythonServer, port: number): string {
  switch (kind) {
    case "flask": case "uvicorn": return ` --host 127.0.0.1 --port ${port}`;
    case "django": return ` 127.0.0.1:${port}`;
    case "streamlit": return ` --server.address 127.0.0.1 --server.port ${port}`;
  }
}

// Where the server says it is listening ("Local: http://localhost:5173/"), for servers that ignore the port we gave them.
export function portsInOutput(text: string): number[] {
  const found: number[] = [];
  for (const m of text.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/gi)) {
    const n = Number(m[1]);
    if (n > 0 && n < 65536 && !found.includes(n)) found.push(n);
  }
  return found;
}
// The first address that answers: IPv4 first, then IPv6 (some servers listen only there).
async function answers(port: number): Promise<string | null> {
  for (const host of ["127.0.0.1", "[::1]"]) {
    const url = `http://${host}:${port}/`;
    try { await fetch(url, { signal: AbortSignal.timeout(500), redirect: "manual" }); return url; } catch { /* not here */ }
  }
  return null;
}

const tail = (s: string, n = 600) => s.trim().slice(-n);

export async function startServer(start: Start, o: { cwd: string; timeoutMs: number; scriptText?: string; signal?: AbortSignal }): Promise<Running | Failed> {
  if (start.kind === "static") return serveStatic(start.dir);

  const hinted = start.port && start.autoPort === false && !(await portBusy(start.port));
  const port = hinted ? start.port! : await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const command = start.command + (start.python ? pythonPortArgs(start.python, port) : portArgs(o.scriptText ?? "", port));
  const child = spawn("sh", ["-c", command], {
    cwd: o.cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...minimalEnv(), ...(start.env ?? {}), PORT: String(port), HOST: "127.0.0.1", BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  let output = "", exited = false, exitCode: number | null = null;
  const grab = (c: Buffer) => { output = (output + c.toString("utf8")).slice(-4000); };
  child.stdout!.on("data", grab); child.stderr!.on("data", grab);
  child.on("close", (code) => { exited = true; exitCode = code; });
  const kill = (sig: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, sig); } catch { /* gone */ } };
  const stop = async () => {
    kill("SIGTERM");
    for (let i = 0; i < 20 && !exited; i++) await Bun.sleep(100);
    kill("SIGKILL");
    for (let i = 0; i < 30 && (await portBusy(port)); i++) await Bun.sleep(100);
  };

  const deadline = Date.now() + o.timeoutMs;
  while (Date.now() < deadline) {
    if (o.signal?.aborted) { await stop(); return { ok: false, aborted: true, reason: "Stopped before the server was ready." }; }
    if (exited) {
      if (exitCode === 0) return { ok: false, notAServer: true, reason: `The start command finished without staying on, so it is a tool and not a website. ${tail(output)}`.trim() };
      const busy = busyPort(output);
      return { ok: false, reason: `The server stopped on its own (error code ${exitCode}). ${tail(output)}`.trim(), output, ...(busy !== null ? { portBusy: busy } : {}) };
    }
    for (const p of [port, ...portsInOutput(output).filter((x) => x !== port)]) {
      const found = await answers(p);
      if (found) {
        if (exited) return { ok: false, reason: `Something else answered on port ${p}, not this project's server. ${tail(output)}`.trim() };
        return { ok: true, url: found, port: p, stop };
      }
    }
    await Bun.sleep(150);
  }
  await stop();
  return { ok: false, reason: `The server did not start within ${Math.round(o.timeoutMs / 1000)} seconds. ${tail(output)}`.trim(), output };
}

// A plain folder of files, served from this process, only on this Mac, never above the folder.
async function serveStatic(dir: string): Promise<Running | Failed> {
  const root = resolve(dir);
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(req) {
      let p: string;
      try { p = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response("bad request", { status: 400 }); }
      let file = resolve(join(root, p));
      if (file !== root && !file.startsWith(root + sep)) return new Response("not found", { status: 404 });
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      return existsSync(file) && statSync(file).isFile() ? new Response(Bun.file(file)) : new Response("not found", { status: 404 });
    },
  });
  return { ok: true, url: `http://127.0.0.1:${server.port}/`, port: server.port ?? 0, stop: async () => { server.stop(true); } };
}
