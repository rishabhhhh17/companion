// M115 (docs/milestones/M115-every-tool-and-jump.md): Go to the session that needs you. Every request in Squibby's guard
// folder carries the process id of the hook that wrote it. At the moment it is read, before it is answered, the engine reads
// the process table once (`/bin/ps -axo pid=,ppid=,tty=,comm=`, run with no shell) and walks up from the hook to the
// outermost app above it (iTerm, Terminal, Visual Studio Code, Cursor, Claude), with the session's terminal (ttys004) when it
// has one. Only process ids, terminal names and program paths are read: never the hook's input, never anyone's environment,
// never a window's contents (rules 5 and 6). It is kept in memory per project and tool and never written anywhere (rule 15).
// Go to runs only on the person's press (tool.jump): `/usr/bin/open -a <app>` (with the project folder for an editor, so its
// window for that folder comes forward), then for Terminal and iTerm with a known tab and notch.jumpTab on, one osascript
// that selects the tab with that terminal. The first such press asks the Mac's Automation question (rule 8: on first use);
// with the setting off nothing is ever asked. The page names neither the app nor a path: the engine knows them already.
// Coucou (MIT, ClaudeHost.swift) brings the session's app forward from the hook's environment; it never finds the tab.
import { spawn } from "node:child_process";
import { basename } from "node:path";
import type { DoneTool } from "./donesignal.ts";
import list from "../../protocol/aitools.json";
import { OWN_APP_TOOLS } from "../../protocol/index.ts";

// The tools that are an app of their own (an editor), shared with the notch (protocol/index.ts OWN_APP_TOOLS): with no
// session seen yet, Go to opens that app on the project. A tool that runs in a terminal has no app to guess, so Go to
// waits until one of its hooks has run.
export function toolBundleOf(tool: DoneTool): string | null {
  if (!OWN_APP_TOOLS.includes(tool)) return null;
  return (list as { tools: { id: string; apps: string[] }[] }).tools.find((t) => t.id === tool)?.apps[0] ?? null;
}

export type PsRow = { pid: number; ppid: number; tty: string; comm: string };
/** Where a session runs: the outermost app's bundle path and name, the session's terminal when it has one, and whether its
 *  exact tab can be found (Terminal and iTerm, with a terminal). */
export type Where = { app: string; name: string; tty?: string; tab: boolean };

const ROW = /^\s*(\d{1,10})\s+(\d{1,10})\s+(\S+)\s+(.+?)\s*$/;
/** The process table as ps prints it, by pid. Lines that are not a row are skipped. */
export function parsePs(text: string): Map<number, PsRow> {
  const out = new Map<number, PsRow>();
  for (const line of text.split("\n")) {
    const m = ROW.exec(line);
    if (!m) continue;
    const pid = Number(m[1]), ppid = Number(m[2]);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid)) continue;
    out.set(pid, { pid, ppid, tty: m[3]!, comm: m[4]! });
  }
  return out;
}

/** A terminal's name as ps prints it: ttys004. Nothing else is ever put in a script. */
const TTY = /^ttys\d{3,4}$/;
export const isTty = (t: string | undefined): t is string => !!t && TTY.test(t);
/** The bundle a program path sits in: the path up to its first `.app`, or null for a program outside any app. */
export function bundleOf(comm: string): string | null {
  if (!comm.startsWith("/")) return null;
  const i = comm.indexOf(".app/");
  return i > 0 ? comm.slice(0, i + 4) : null;
}
/** An app bundle path Squibby may open: absolute, ending in .app, with no `..` and no line breaks. */
export const isAppPath = (p: string): boolean => p.startsWith("/") && p.endsWith(".app") && !p.split("/").includes("..") && !/[\n\r\0]/.test(p);
/** The app's own name: its bundle's name without .app. */
export const appNameOf = (app: string): string => basename(app).replace(/\.app$/, "");
/** The apps whose exact tab can be found by its terminal. */
const TAB_APPS: Readonly<Record<string, "terminal" | "iterm">> = { "Terminal": "terminal", "iTerm": "iterm", "iTerm2": "iterm" };
const tabKind = (app: string): "terminal" | "iterm" | null => TAB_APPS[appNameOf(app)] ?? null;
/** The editors that open a folder in its own window (so Go to brings that project's window forward). */
const EDITORS = new Set(["Visual Studio Code", "Visual Studio Code - Insiders", "Cursor", "Windsurf", "Zed", "Zed Preview", "Kiro", "Antigravity", "VSCodium", "Trae"]);
const JETBRAINS = /^(IntelliJ IDEA|WebStorm|PyCharm|GoLand|PhpStorm|RubyMine|CLion|Rider|DataGrip|RustRover|Fleet|Android Studio|Aqua)( (CE|Ultimate|Community Edition|Professional))?$/;
export const isEditorApp = (app: string): boolean => EDITORS.has(appNameOf(app)) || JETBRAINS.test(appNameOf(app));

/** Where the process with this pid runs: walk up the table (at most 64 steps, never round a loop) and take the outermost app
 *  above it, and the first real terminal on the way. Null when the pid is gone or no app is above it (tmux, a launchd job). */
export function whereOf(table: Map<number, PsRow>, pid: number): Where | null {
  let row = table.get(pid);
  if (!row) return null;
  let app: string | null = null, tty: string | undefined;
  const seen = new Set<number>();
  for (let i = 0; row && i < 64 && !seen.has(row.pid); i++) {
    seen.add(row.pid);
    if (!tty && isTty(row.tty)) tty = row.tty;
    const b = bundleOf(row.comm);
    if (b) app = b;
    if (row.ppid <= 1 || row.ppid === row.pid) { row = undefined; break; }
    row = table.get(row.ppid);
  }
  // A loop in the table (a process its own ancestor) is never trusted.
  if (row && seen.has(row.pid)) return null;
  if (!app || !isAppPath(app)) return null;
  const kind = tabKind(app);
  return { app, name: appNameOf(app), ...(tty ? { tty } : {}), tab: !!kind && !!tty };
}

/** The AppleScript that selects the tab whose terminal is this one, or null for anything that is not a terminal's name. */
export function tabScript(kind: "terminal" | "iterm", tty: string): string | null {
  if (!isTty(tty)) return null;
  const dev = JSON.stringify(`/dev/${tty}`);
  if (kind === "iterm") return `tell application "iTerm2"\n  repeat with w in windows\n    repeat with t in tabs of w\n      repeat with s in sessions of t\n        if tty of s is ${dev} then\n          select w\n          tell t to select\n          tell s to select\n          activate\n          return\n        end if\n      end repeat\n    end repeat\n  end repeat\nend tell`;
  return `tell application "Terminal"\n  repeat with w in windows\n    repeat with t in tabs of w\n      if tty of t is ${dev} then\n        set selected of t to true\n        set index of w to 1\n        activate\n        return\n      end if\n    end repeat\n  end repeat\nend tell`;
}

/** The commands Go to runs, as argv lists (no shell). With a session seen: open its app (an editor on the project), then
 *  for Terminal and iTerm with a terminal and tab finding on, the script that selects the tab. With none: the tool's own
 *  app on the project when it has one (`bundle`), else nothing. */
export function jumpPlan(where: Where | null, project: string, o: { tab: boolean; bundle?: string | null }): string[][] {
  if (!where) return o.bundle && /^[A-Za-z0-9.-]{3,200}$/.test(o.bundle) ? [["/usr/bin/open", "-b", o.bundle, project]] : [];
  if (!isAppPath(where.app)) return [];
  const out: string[][] = [["/usr/bin/open", "-a", where.app, ...(isEditorApp(where.app) ? [project] : [])]];
  const kind = tabKind(where.app), script = kind && where.tty && o.tab ? tabScript(kind, where.tty) : null;
  if (script) out.push(["/usr/bin/osascript", "-e", script]);
  return out;
}

/** How often the table is read again for a session already known (a permission request or a question always looks). */
export const WHERE_FRESH_MS = 30_000;
/** At most this many sessions kept (the oldest goes). */
const KEEP = 64;
export type WhereEvent = { type: "tool.where"; project: string; tool: DoneTool; app: string; tab: boolean };
export type JumpResult = { ok: true; app?: string } | { ok: false; why: "unknown" | "failed" };

/** M115 review: how long a Go to's step may take. The tab's script waits while the Mac asks its Automation question on the
 *  first press, so it gets a minute; it never holds the engine up meanwhile (everything here is asynchronous). */
export const OPEN_MS = 15_000, SCRIPT_MS = 60_000, PS_MS = 2_000;
const PS_MAX = 8 * 1024 * 1024;

/** The process table, read without holding the engine up: a hook's answer never waits for it. "" when ps fails. */
export function readPs(timeoutMs = PS_MS): Promise<string> {
  return new Promise((res) => {
    let out = "", size = 0, done = false;
    const end = (v: string) => { if (!done) { done = true; clearTimeout(t); res(v); } };
    let p: ReturnType<typeof spawn>;
    try { p = spawn("/bin/ps", ["-axo", "pid=,ppid=,tty=,comm="], { stdio: ["ignore", "pipe", "ignore"] }); } catch { res(""); return; }
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } end(""); }, timeoutMs);
    p.stdout!.setEncoding("utf8");
    p.stdout!.on("data", (d: string) => { size += d.length; if (size > PS_MAX) { try { p.kill("SIGKILL"); } catch { /* gone */ } end(""); } else out += d; });
    p.on("error", () => end(""));
    p.on("close", (code) => end(code === 0 ? out : ""));
  });
}
/** Runs one argv (no shell) without holding the engine up; true when it exited 0 within timeoutMs. */
export function runArgv(argv: string[], timeoutMs = argv[0] === "/usr/bin/osascript" ? SCRIPT_MS : OPEN_MS): Promise<boolean> {
  return new Promise((res) => {
    let done = false;
    const end = (v: boolean) => { if (!done) { done = true; clearTimeout(t); res(v); } };
    let p: ReturnType<typeof spawn>;
    try { p = spawn(argv[0]!, argv.slice(1), { stdio: "ignore" }); } catch { res(false); return; }
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } end(false); }, timeoutMs);
    p.on("error", () => end(false));
    p.on("close", (code) => end(code === 0));
  });
}

/** Where each session runs, per project and tool, in memory only. */
export class SessionWhere {
  private known = new Map<string, { where: Where; at: number }>();
  /** The sessions whose table read is under way, so a burst of hooks reads it once. */
  private reading = new Set<string>();
  constructor(private o: {
    emit: (e: WhereEvent) => void;
    /** The process table (ps's output); a stand in in tests. Never awaited on a hook's answer. */
    ps?: () => string | Promise<string>;
    /** Runs one argv (no shell); true when it went well. A stand in in tests. */
    run?: (argv: string[]) => boolean | Promise<boolean>;
    /** notch.jumpTab, read each time. */
    tab?: () => boolean;
    /** The tool's own app's bundle id, when it has one (protocol/aitools.json). */
    bundleOf?: (tool: DoneTool) => string | null;
    now?: () => number;
  }) {}
  private key = (project: string, tool: DoneTool) => `${tool}\u0000${project}`;
  /** A hook of this tool ran in this project with this pid. The table is read at once (the hook is still there), without
   *  waiting: the hook's answer goes on meanwhile (M115 review). A session known less than WHERE_FRESH_MS ago is not read
   *  again unless `always` (a permission request or a question). tool.where is said when the app changes, on every ask, and
   *  on each fresh read (at most every WHERE_FRESH_MS while the tool works), so a page opened since hears it soon. Never
   *  throws; the promise is for tests. */
  seen(project: string, tool: DoneTool, pid: number, always = false): Promise<void> {
    try {
      const k = this.key(project, tool), now = (this.o.now ?? Date.now)(), was = this.known.get(k);
      if (!always && was && now - was.at < WHERE_FRESH_MS) return Promise.resolve();
      if (!always && this.reading.has(k)) return Promise.resolve();
      this.reading.add(k);
      let text: string | Promise<string>;
      try { text = (this.o.ps ?? readPs)(); } catch { text = ""; }
      return Promise.resolve(text).catch(() => "").then((t) => this.found(k, project, tool, pid, t)).catch(() => undefined).finally(() => this.reading.delete(k));
    } catch { return Promise.resolve(); /* Go to is a nicety; the hook is answered whatever happens */ }
  }
  private found(k: string, project: string, tool: DoneTool, pid: number, text: string): void {
    const now = (this.o.now ?? Date.now)(), was = this.known.get(k);
    const where = whereOf(parsePs(text), pid);
    if (!where) { if (was) this.known.set(k, { ...was, at: now }); return; }
    this.known.delete(k);
    this.known.set(k, { where, at: now });
    while (this.known.size > KEEP) this.known.delete(this.known.keys().next().value!);
    this.o.emit({ type: "tool.where", project, tool, app: where.name, tab: where.tab });
  }
  get(project: string, tool: DoneTool): Where | null { return this.known.get(this.key(project, tool))?.where ?? null; }
  /** The person pressed Go to. Asynchronous: the engine answers hooks, asks and the feed while the Mac brings the app
   *  forward or asks its Automation question (M115 review). */
  async jump(project: string, tool: DoneTool): Promise<JumpResult> {
    const where = this.get(project, tool);
    const plan = jumpPlan(where, project, { tab: this.o.tab?.() ?? true, bundle: this.o.bundleOf?.(tool) ?? null });
    if (plan.length === 0) return { ok: false, why: "unknown" };
    const run = this.o.run ?? runArgv;
    // The app first: when the tab cannot be selected (the Automation question said no), the app is still in front.
    if (!(await run(plan[0]!))) return { ok: false, why: "failed" };
    for (const argv of plan.slice(1)) await run(argv);
    // A tool's own app opened by its bundle id has no name here: the page says the tool's name.
    return where ? { ok: true, app: where.name } : { ok: true };
  }
}
