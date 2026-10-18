// The "before" picture for a visual receipt: the project as it was before the task, copied into a private folder in
// Companion's own data (never the project), started on its own port, opened once in the hidden browser, then deleted.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCommand, shq } from "./exec.ts";
import type { CheckpointStore } from "../checkpoints.ts";
import { browserCheck, type BrowserOptions, type BrowserResult, type PageShot } from "./browser.ts";
import { detectProject, withStartScript } from "./detect.ts";
import { startServer } from "./server.ts";

// no_page: the earlier version had nothing to open. crashed: its server stopped with an error. not_pictured: it could
// not be photographed for some other reason (too slow, a port in use), which says nothing about whether it worked.
export type Before = { shot: PageShot } | { none: "no_page" | "crashed" | "not_pictured" | "cancelled" };

export async function captureBefore(o: {
  store: CheckpointStore; beforeId: string; project: string; workDir: string; signal?: AbortSignal;
  startMs?: number; browserMs?: number; browser?: (url: string, b: BrowserOptions) => Promise<BrowserResult>;
  // How this project is checked (Settings): its start script ("auto" is the one found) and the page size of the picture.
  start?: string; viewport?: { width: number; height: number };
}): Promise<Before> {
  mkdirSync(o.workDir, { recursive: true, mode: 0o700 });
  const dir = mkdtempSync(join(o.workDir, "before-"));
  try {
    await o.store.exportTo(o.beforeId, dir);
    borrowPackages(join(o.project, "node_modules"), join(dir, "node_modules"));
    borrowVenv(o.project, dir);
    if (o.signal?.aborted) return { none: "cancelled" };
    const det = withStartScript(detectProject(dir), dir, o.start).det;
    if (!det.start) return { none: "no_page" };
    let scriptText = "";
    try { const m = /(?:npm|pnpm|yarn|bun) run (\S+)/.exec(det.start.kind === "server" ? det.start.command : ""); if (m) scriptText = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.[m[1]] ?? ""; } catch { /* no script text */ }
    const srv = await startServer(det.start, { cwd: dir, timeoutMs: o.startMs ?? 60_000, scriptText, signal: o.signal });
    // A package that is not installed says nothing about whether the earlier version worked.
    const missing = /No module named|Couldn't import Django/.test(srv.ok ? "" : srv.output ?? srv.reason);
    if (!srv.ok) return { none: srv.aborted ? "cancelled" : srv.notAServer ? "no_page" : /^The server stopped on its own/.test(srv.reason) && !missing ? "crashed" : "not_pictured" };
    // Stop ends the earlier version's server at once, not after the browser gives up.
    const onAbort = () => { void srv.stop(); };
    o.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (o.signal?.aborted) return { none: "cancelled" };
      const b = await (o.browser ?? browserCheck)(srv.url, { shot: true, clickButtons: false, timeoutMs: o.browserMs ?? 20_000, signal: o.signal, ...(o.viewport ? { viewport: o.viewport } : {}) });
      if (o.signal?.aborted) return { none: "cancelled" };
      return b.shot ? { shot: b.shot } : { none: "not_pictured" };
    } finally { o.signal?.removeEventListener("abort", onAbort); await srv.stop(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// The installed packages are borrowed, not copied (the earlier version almost always used the same ones). Each package
// is linked one by one inside a real node_modules folder of the copy, so tool caches (node_modules/.vite, .cache) are
// written into the copy, never into the person's project.
export function borrowPackages(from: string, to: string) {
  let names: string[];
  try { if (!lstatSync(from).isDirectory()) return; names = readdirSync(from); } catch { return; }
  mkdirSync(to, { recursive: true });
  for (const n of names) {
    if (n === ".vite" || n === ".cache" || n === ".vite-temp" || existsSync(join(to, n))) continue;
    try { symlinkSync(join(from, n), join(to, n)); } catch { /* one package that cannot be linked is not worth stopping for */ }
  }
}

/** The installed packages as a copy of their own, for a check that runs builds and tests on an earlier version: whatever it
 *  writes inside them (generated code, a cache) stays in the copy and never reaches the person's own packages. On the Mac's
 *  usual disk the copy is a clone (`cp -c`): about a second, and no extra space until something is written. Across disks it
 *  is a plain copy. "none" when there are no installed packages to copy; "failed" when no copy could be made. */
export async function ownPackages(from: string, to: string, signal?: AbortSignal): Promise<"none" | "cloned" | "copied" | "failed" | "cancelled"> {
  try { if (!lstatSync(from).isDirectory()) return "none"; } catch { return "none"; }
  for (const [how, flags] of [["cloned", "-cR"], ["copied", "-R"]] as const) {
    rmSync(to, { recursive: true, force: true });
    const r = await runCommand(`/bin/cp ${flags} ${shq(from)} ${shq(to)}`, { cwd: dirname(to), timeoutMs: 3 * 60_000, signal });
    if (r.aborted || signal?.aborted) { rmSync(to, { recursive: true, force: true }); return "cancelled"; }
    if (r.code === 0 && !r.timedOut) return how;
  }
  rmSync(to, { recursive: true, force: true });
  return "failed";
}

// Folders never looked inside for more installed packages: tools, build output and the packages themselves.
const NOT_SEARCHED = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", ".output", "coverage", ".turbo", ".cache", ".vercel", "__pycache__", ".venv", "venv", "target"]);

/** Every folder of installed packages in the project, relative to it: node_modules at the top and, in a workspace, each
 *  package's own (packages/ui/node_modules). Never one inside another, never through a link. A few folders deep, bounded. */
export function packageFolders(project: string, maxDepth = 4, maxDirs = 5000): string[] {
  const out: string[] = [];
  let seen = 0;
  const walk = (rel: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(rel ? join(project, rel) : project); } catch { return; }
    for (const n of names.sort()) {
      if (++seen > maxDirs) return;
      const r = rel ? `${rel}/${n}` : n;
      let dir = false;
      try { dir = lstatSync(join(project, r)).isDirectory(); } catch { continue; }   // a link is never followed
      if (!dir) continue;
      if (n === "node_modules") { out.push(r); continue; }
      if (depth < maxDepth && !n.startsWith(".") && !NOT_SEARCHED.has(n)) walk(r, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

// A Python project's virtual environment is borrowed too, by one link (the snapshot never holds it): the earlier version
// then runs with the same packages. Nothing is written through it (Python is told not to write bytecode), and removing
// the copy removes only the link.
export function borrowVenv(project: string, copy: string) {
  for (const v of [".venv", "venv"]) {
    try { if (lstatSync(join(project, v)).isDirectory() && !existsSync(join(copy, v))) symlinkSync(join(project, v), join(copy, v)); } catch { /* none, or it cannot be linked */ }
  }
}

/** Anything left from a run that was cut off (the app quit mid picture): emptied when the runner starts. */
export function sweepWork(workDir: string) {
  try { for (const n of readdirSync(workDir)) if (n.startsWith("before-")) rmSync(join(workDir, n), { recursive: true, force: true }); } catch { /* nothing there */ }
}
