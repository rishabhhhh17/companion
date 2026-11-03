// Start the project's own server for the browser check, on a port nobody else is using, and stop it
// completely afterwards. A server that was already running is never mistaken for ours.
import { spawn } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve, sep } from "node:path";
import { minimalEnv } from "../env.ts";
import { openBox, SANDBOX_EXEC, type Box } from "./box.ts";
import type { Start } from "./detect.ts";
import { LIFELINE } from "./exec.ts";
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

/** What the server rung says when the safety box for checks could not be set up on this Mac. */
export const BOX_NOT_STARTED = "The safety box for checks could not be set up on this Mac, so the project was not started.";

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

// box: the project's server runs in the safety box for proof checks (box.ts). It may listen and answer on this Mac, and
// Companion reaches it from outside; with net "local" it reaches nothing beyond this Mac. A box that cannot be made starts
// nothing.
// borrowedFrom: for a static folder, the project a copy borrows its installed packages from by links (before.ts); files
// whose real place is in that project's installed packages (a node_modules folder) may be served too, and nothing else of it.
export async function startServer(start: Start, o: { cwd: string; timeoutMs: number; scriptText?: string; signal?: AbortSignal; box?: Box; borrowedFrom?: string }): Promise<Running | Failed> {
  if (start.kind === "static") return serveStatic(start.dir, [o.cwd], o.borrowedFrom ? [o.borrowedFrom] : []);

  const hinted = start.port && start.autoPort === false && !(await portBusy(start.port));
  const port = hinted ? start.port! : await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const command = start.command + (start.python ? pythonPortArgs(start.python, port) : portArgs(o.scriptText ?? "", port));
  const env: Record<string, string> = { ...minimalEnv(), ...(start.env ?? {}), PORT: String(port), HOST: "127.0.0.1", BROWSER: "none", FORCE_COLOR: "0", NO_COLOR: "1" };
  const box = o.box ? openBox(o.box, env.HOME) : null;
  if (o.box && !box) return { ok: false, reason: BOX_NOT_STARTED, output: BOX_NOT_STARTED };
  if (box) env.TMPDIR = `${box.tmp}/`;
  // Must fix 14: the server ends with the engine however the engine ends (exec.ts LIFELINE), so a check's server never
  // keeps its port, a file watcher and memory after the engine was killed by force. It still gets empty input.
  const args = ["-c", LIFELINE, "sh", command];
  const child = box
    ? spawn(SANDBOX_EXEC, [...box.args, "/bin/sh", ...args], { cwd: o.cwd, detached: true, stdio: ["pipe", "pipe", "pipe"], env })
    : spawn("sh", args, { cwd: o.cwd, detached: true, stdio: ["pipe", "pipe", "pipe"], env });
  child.stdin?.on("error", () => { /* the server's side closed first; nothing is ever written */ });
  let output = "", exited = false, exitCode: number | null = null;
  const grab = (c: Buffer) => { output = (output + c.toString("utf8")).slice(-4000); };
  child.stdout!.on("data", grab); child.stderr!.on("data", grab);
  child.on("close", (code) => { exited = true; exitCode = code; child.stdin?.destroy(); box?.close(); });
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

// A plain folder of files, served from this process, only on this Mac, never above the folder. Only a file whose real
// place (every link followed) is inside the folder, the project folder it sits in, or the installed packages (a
// node_modules folder) of the project a copy borrows them from (`packagesOf`), is served; never a dotfile or anything in a dot folder (.env, .git, .claude), by the address
// asked for or by where a link really leads, except inside installed packages (node_modules/.pnpm); and only to a
// request for this server's own address, so another name pointed at this Mac (a rebinding web page) gets nothing.
async function serveStatic(dir: string, also: string[] = [], packagesOf: string[] = []): Promise<Running | Failed> {
  const root = resolve(dir);
  const real = (p: string) => { try { return realpathSync(p); } catch { return null; } };
  const roots = [root, ...also].map(real).filter((r): r is string => !!r).map((r) => ({ r, packagesOnly: false }));
  roots.push(...packagesOf.map(real).filter((r): r is string => !!r).map((r) => ({ r, packagesOnly: true })));
  if (!roots.length) return { ok: false, reason: "The folder to show is not there." };
  const dotted = (segs: string[]) => { const nm = segs.indexOf("node_modules"); return segs.some((s, i) => s.startsWith(".") && (nm < 0 || i < nm)); };
  const allowed = (file: string) => roots.some(({ r, packagesOnly }) => {
    if (file !== r && !file.startsWith(r + sep)) return false;
    const segs = relative(r, file).split(sep).filter(Boolean);
    return !dotted(segs) && (!packagesOnly || segs.includes("node_modules"));
  });
  const notFound = () => new Response("not found", { status: 404 });
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(req) {
      const host = req.headers.get("host") ?? "";
      if (host !== `127.0.0.1:${server.port}` && host !== `localhost:${server.port}`) return new Response("not this server", { status: 421 });
      let p: string;
      try { p = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response("bad request", { status: 400 }); }
      if (p.split(/[\\/]/).some((s) => s.startsWith("."))) return notFound();
      let file = resolve(join(root, p));
      if (file !== root && !file.startsWith(root + sep)) return notFound();
      let at = real(file);
      if (at && statSync(at).isDirectory()) at = real(join(at, "index.html"));
      if (!at || !allowed(at) || !statSync(at).isFile()) return notFound();
      return new Response(Bun.file(at));
    },
  });
  return { ok: true, url: `http://127.0.0.1:${server.port}/`, port: server.port ?? 0, stop: async () => { server.stop(true); } };
}
