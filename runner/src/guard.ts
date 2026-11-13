// M77 (the safety net): a snapshot the instant before Claude Code runs a destructive command, and "Claude is waiting for
// you" in the notch. Both come through hooks the person said yes to (donesignal.ts), which write into Squibby's own
// `guard` folder; nothing here reads the person's screen, their tool's transcript or any file of theirs (rules 5 and 6).
//  - A guard request is the tool call's JSON as Claude Code gives it to the hook. Only `tool_name`, `tool_input.command` and
//    `cwd` are looked at; the file is removed as it is read, and the command is judged by the same lists the approval cards
//    use (safety.ts, dbsafety.ts). A destructive command gets a shadow snapshot (checkpoints.ts, T06) and a History row
//    named with a short, redacted form of it; then the answer file is written so the hook lets the command go. A harmless
//    command gets the answer at once. Whatever goes wrong, the answer is written: Squibby never blocks the person's own
//    Claude Code session, and never changes the command (the hook exits 0 whatever happens anyway).
//  - A waiting note is the notification's JSON. Only `message` (120 characters, redacted) and `notification_type` are kept,
//    and said as hook.waiting; it clears on the next hook event for that project or after a timer.
// Nothing here runs git or writes the person's git (rule 10): the snapshot is Squibby's own shadow copy, and Undo restores
// from it.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch as fsWatch, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { databaseProgram, databaseScript, databaseSetting, databaseTool } from "./dbsafety.ts";
import { liveCommand } from "./livesystems.ts";
import { GUARD_PID } from "./donesignal.ts";
import { clip, redact } from "./redact.ts";
import { commandsWithFolder, resolveLinks, whereIs } from "./safety.ts";

/** The History row's name: this, then the short command. The pages read the command back from after the colon. */
export const SAVED_LABEL = "Before Claude ran: ";
/** How much of the command the row keeps, in characters, after redaction and on one line. */
export const SHORT_COMMAND = 60;
/** How long the engine gives a snapshot before it lets the command go anyway (the hook itself waits 5 seconds). */
export const SNAPSHOT_WAIT_MS = 4000;
/** How long a "Claude is waiting" mark stays with no further hook event, by setting (notch.waitingMinutes). */
export const WAITING_MINUTES_CHOICES: readonly number[] = [5, 15, 60];
export const waitingMinutesOf = (v: unknown): number => { const n = Number(v); return WAITING_MINUTES_CHOICES.includes(n) ? n : 15; };
/** The notification types that mean Claude Code is waiting for the person (the hook's matcher names the same two). */
const WAITING_TYPES = new Set(["permission_prompt", "idle_prompt"]);
/** A request file: <token>.<pid>, with .note for a waiting note, or (M85) .ask from a hook that can ask the person first.
 *  Nothing else in the folder is touched. */
const REQUEST = /^([0-9a-f]{24})\.(\d{1,10})(\.note|\.ask)?$/;
/** M85: the History row's name for a command the person's own tool was asked to ask about first. */
export const ASKED_LABEL = "Asked first: ";
/** M85: the most a reason the hook carries may be, in characters. */
export const ASK_REASON = 300;
/** Requests older than this when the engine starts are from a Claude Code that gave up waiting: removed, never answered. */
const STALE_MS = 60_000;

/** The short form of a command for a row's name: one line, redacted, clipped. */
export function shortCommand(command: string): string {
  const one = redact(command).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(one).length > SHORT_COMMAND ? `${clip(one, SHORT_COMMAND - 1).trimEnd()}…` : one;
}

const GIT_PATH_RESET = new Set(["checkout", "restore"]);
const GIT_STASH_DROP = new Set(["drop", "clear", "pop"]);
/** A branch or revision name after `git checkout`: it only switches, so it is not a reset of files (checkout -- a.ts is). */
const looksLikeRef = (a: string) => /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(a) && !a.includes(".") && !a.endsWith("/");

/** Why one command of a line is destructive to the project's files or data, in a few plain words, or null. The lists are
 *  the approval cards' own (safety.ts for paths, dbsafety.ts for databases), with git's file resets and deletes named here:
 *  a plain `git status`, `git checkout main`, `rm notes.txt` or `npm test` are not destructive. */
export function destructiveCommand(command: string, project: string): string | null {
  let parts: { words: string[]; cwd: string }[];
  try { parts = commandsWithFolder(command, project); } catch { return null; }
  for (const { words, cwd } of parts) {
    const name = basename(words[0] ?? "");
    const args = words.slice(1);
    const why = destructiveWords(name, args, project, cwd);
    if (why) return why;
  }
  return null;
}

function destructiveWords(name: string, args: string[], project: string, cwd: string): string | null {
  // npx, bunx, pnpx, "npm exec" and "pnpm dlx" run another program: that program is judged (as safety.ts does).
  if (["npx", "bunx", "pnpx"].includes(name) || (["npm", "pnpm", "yarn", "bun"].includes(name) && ["exec", "dlx", "x"].includes(args[0] ?? ""))) {
    const rest = (["npx", "bunx", "pnpx"].includes(name) ? args : args.slice(1)).filter((a, i, all) => !(a.startsWith("-") && all.slice(0, i).every((x) => x.startsWith("-"))));
    return rest.length ? destructiveWords(basename(rest[0]), rest.slice(1), project, cwd) : null;
  }
  if (name === "git") {
    let i = 0;
    while (i < args.length && args[i].startsWith("-")) { if (["-C", "-c", "--git-dir", "--work-tree"].includes(args[i])) i++; i++; }
    const sub = args[i], rest = args.slice(i + 1), flags = rest.filter((a) => a.startsWith("-")), pos = rest.filter((a) => !a.startsWith("-"));
    if (sub === "reset" && flags.some((f) => f === "--hard" || f === "--merge" || f === "--keep")) return "git reset throws away uncommitted changes";
    if (sub === "clean") return "git clean deletes files git does not track";
    if (sub === "stash" && GIT_STASH_DROP.has(rest[0] ?? "")) return "git stash changes work git has set aside";
    if (GIT_PATH_RESET.has(sub ?? "")) {
      const dash = rest.indexOf("--");
      const paths = dash >= 0 ? rest.slice(dash + 1) : sub === "restore" ? pos : pos.filter((a) => !looksLikeRef(a));
      if (paths.length || flags.includes("--source") || flags.some((f) => f.startsWith("--source="))) return `git ${sub} replaces files with an earlier version`;
      if (sub === "checkout" && (flags.includes("-f") || flags.includes("--force"))) return "git checkout --force throws away uncommitted changes";
    }
    if (sub === "branch" && flags.some((f) => f === "-D" || (f === "--delete" && flags.includes("--force")))) return "git branch -D deletes a branch";
    if (sub === "push" && flags.some((f) => f === "-f" || f === "--force" || f.startsWith("--force-with-lease"))) return "git push --force rewrites history on another computer";
    return null;
  }
  if (name === "rm" || name === "rmdir" || name === "unlink" || name === "shred") {
    const flags = args.filter((a) => a.startsWith("-") && a !== "-");
    const recursive = flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === "--recursive");
    const force = flags.some((f) => /^-[a-zA-Z]*f/.test(f) || f === "--force");
    const paths = args.filter((a) => !a.startsWith("-") || a === "-");
    if (name === "rm" && !recursive && !force) return null;
    if (name !== "rm" && !paths.length) return null;
    // Only inside the project: a path elsewhere is the approval card's business (and outside every snapshot).
    const inside = paths.some((a) => { try { const w = whereIs(project, a, cwd); return w.inside || w.abs === resolveLinks(project); } catch { return false; } });
    return inside || !paths.length ? `${name} deletes files in the project` : null;
  }
  if (name === "find" && args.includes("-delete")) return "find -delete deletes files";
  if (name === "truncate") return "truncate empties files";
  // A database that is dropped, emptied or reset, or one on another computer written to: the same rule the cards use.
  // Only what deletes or empties data counts; a plain connection to a database (the cards' "network" ask) is not a loss.
  const d = databaseProgram(name, args, project, cwd) ?? databaseTool([name, ...args], project) ?? databaseScript(name, args, project, cwd) ?? databaseSetting([name, ...args]);
  if (d && d.risk === "irreversible") return d.reason;
  return null;
}

/** What a guard request carries that the engine reads: nothing else of the JSON is kept. */
export type GuardRequest = { token: string; command: string; cwd?: string };
export type WaitingNote = { token: string; message: string; type: string };

export type GuardDeps = {
  /** The project a token names (donesignal.ts projectOf), or null. */
  projectOf: (token: string) => string | null;
  /** Takes the snapshot; the id comes back. The engine's own shadow store for the project. */
  snapshot: (project: string, label: string) => Promise<{ id: string }>;
  /** Says an event; the caller adds v, id and ts. */
  emit: (e: Record<string, unknown>) => void;
  /** Keeps the History row (the task log). */
  row?: (r: { project: string; label: string; checkpoint: string; at: string }) => void;
  /** For tests: which commands are destructive. */
  destructive?: (command: string, project: string) => string | null;
  /** M85: which commands touch a live system (livesystems.ts), for tests. */
  live?: (command: string, project: string) => string | null;
  /** M85: whether the person's own tool is asked to ask first about a live command (safety.askBeforeLive), read each time. */
  askLive?: () => boolean;
  /** M85: keeps the History row of an ask (the task log), with the reason. */
  asked?: (r: { project: string; command: string; reason: string; at: string }) => void;
  /** How long a "waiting" mark stays with no further event, in minutes (read each time). */
  waitingMinutes?: () => number;
  snapshotWaitMs?: number;
  watch?: typeof fsWatch;
  now?: () => number;
};

/** Watches Squibby's own guard folder and answers each request. */
export class HookGuard {
  private w: { close(): void } | null = null;
  private pid: string;
  private inFlight = new Map<string, Promise<unknown>>();
  private waitingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private waitingNow = new Set<string>();
  /** Guard requests waiting for their snapshot: Stop everything lets each command go at once (the snapshot still finishes). */
  private releases = new Set<() => void>();
  constructor(private dir: string, private o: GuardDeps) {
    this.dir = resolve(dir);
    this.pid = join(this.dir, GUARD_PID);
  }
  /** Starts: the pid file says the engine is alive (the hooks check it first), stale requests go, and the folder is watched. */
  start(): boolean {
    if (this.w) return true;
    try { mkdirSync(this.dir, { recursive: true, mode: 0o700 }); writeFileSync(this.pid, String(process.pid), { mode: 0o600 }); } catch { return false; }
    this.sweep();
    try {
      const w = (this.o.watch ?? fsWatch)(this.dir, (_ev, name) => { if (name) void this.take(basename(String(name))); });
      w.on?.("error", () => { /* the folder went away */ });
      this.w = { close: () => w.close() };
    } catch { return false; }
    return true;
  }
  /** Stops: the pid file goes first, so a hook that fires after this exits at once. Waiting marks are cleared. */
  stop(): void {
    try { rmSync(this.pid, { force: true }); } catch { /* gone */ }
    try { this.w?.close(); } catch { /* closed */ }
    this.w = null;
    for (const t of this.waitingTimers.values()) clearTimeout(t);
    this.waitingTimers.clear();
    this.waitingNow.clear();
  }
  /** Requests and notes left from a Claude Code that gave up waiting (older than a minute) are removed, never answered. */
  private sweep(): void {
    const now = (this.o.now ?? Date.now)();
    for (const n of this.names()) {
      const m = REQUEST.exec(n.replace(/\.(tmp|ok)$/, ""));
      if (!m && !/\.(tmp|ok)$/.test(n)) continue;
      const f = join(this.dir, n);
      try { if (now - statSync(f).mtimeMs > STALE_MS) rmSync(f, { force: true }); } catch { /* gone */ }
    }
  }
  private names(): string[] { try { return readdirSync(this.dir); } catch { return []; } }
  /** For tests: the pending work. */
  async idle(): Promise<void> { await Promise.allSettled([...this.inFlight.values()]); }

  /** A file appeared (or changed) in the folder: a request is answered, a note is said. Anything else is left alone. */
  async take(name: string): Promise<void> {
    const m = REQUEST.exec(name);
    if (!m) return;
    const file = join(this.dir, name);
    if (!existsSync(file)) return;
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { return; }
    try { rmSync(file, { force: true }); } catch { /* gone */ }
    const token = m[1];
    const project = this.o.projectOf(token);
    if (m[3] === ".note") { if (project) this.note(project, text); return; }
    // The answer file: empty lets the command go; M85: for a hook that can ask, a reason (a JSON string) has its tool ask.
    // It is written exactly once, whatever goes wrong.
    let written = false;
    const done = (answer: string): boolean => {
      if (written) return false;
      written = true;
      try { writeFileSync(`${file}.ok`, answer, { mode: 0o600 }); return true; } catch { return false; /* the hook gives up on its own */ }
    };
    if (!project) { done(""); return; }
    this.activity(project);
    const p = this.answer(project, text, m[3] === ".ask", done).catch(() => undefined).finally(() => done("")).finally(() => this.inFlight.delete(name));
    this.inFlight.set(name, p);
    await p;
  }
  /** Judges the request and takes the snapshot when it must, then answers through `done`: "" lets the command go once the
   *  snapshot is taken (or SNAPSHOT_WAIT_MS has passed). M85: only for a hook that can ask, with safety.askBeforeLive on, a
   *  live command is answered at once with its reason as a JSON string, and the snapshot finishes on its own (M85 review: a
   *  slow snapshot of a big project must never outlast the hook's own wait and lose the ask). The person still has to answer
   *  in their tool. The ask is said and kept in History only once its answer file is written. */
  private async answer(project: string, text: string, canAsk: boolean, done: (answer: string) => boolean): Promise<void> {
    const req = parseRequest(text);
    if (!req) { done(""); return; }
    let reason: string | null = null;
    if (canAsk && (this.o.askLive?.() ?? true)) {
      try { reason = (this.o.live ?? liveCommand)(req.command, project); } catch { reason = null; }
    }
    // The snapshot starts first, before any answer, so a destructive command is being saved before the tool can ask.
    const saving = this.save(project, req.command);
    if (reason) {
      const said = clip(redact(reason).replace(/\s+/g, " ").trim(), ASK_REASON);
      if (done(JSON.stringify(said))) {
        const command = shortCommand(req.command);
        const at = new Date((this.o.now ?? Date.now)()).toISOString();
        try { this.o.asked?.({ project, command, reason: said, at }); } catch { /* the row is a nicety */ }
        this.o.emit({ type: "guard.asked", project, command, reason: said });
      }
    }
    await saving;
    done("");
  }
  /** Takes the snapshot before a destructive command, waiting at most SNAPSHOT_WAIT_MS. */
  private async save(project: string, command: string): Promise<void> {
    const req = { command };
    const why = (this.o.destructive ?? destructiveCommand)(req.command, project);
    if (!why) return;
    const label = SAVED_LABEL + shortCommand(req.command);
    const at = new Date((this.o.now ?? Date.now)()).toISOString();
    const snap = this.o.snapshot(project, label).then((c) => {
      try { this.o.row?.({ project, label, checkpoint: c.id, at }); } catch { /* the row is a nicety */ }
      this.o.emit({ type: "guard.saved", project, checkpoint: c.id, command: label.slice(SAVED_LABEL.length) });
    });
    snap.catch(() => undefined);
    // The command goes after SNAPSHOT_WAIT_MS at most; a slow snapshot still finishes on its own.
    let release!: () => void, timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<void>((r) => { release = r; });
    this.releases.add(release);
    try { await Promise.race([snap, stopped, new Promise<void>((r) => { timer = setTimeout(r, this.o.snapshotWaitMs ?? SNAPSHOT_WAIT_MS); })]); }
    finally { if (timer) clearTimeout(timer); this.releases.delete(release); }
  }
  /** A waiting note: Claude Code is waiting for the person (a permission or its idle prompt). Said once per note. */
  private note(project: string, text: string): void {
    let j: unknown;
    try { j = JSON.parse(text); } catch { return; }
    if (!j || typeof j !== "object") return;
    const o = j as Record<string, unknown>;
    const type = typeof o.notification_type === "string" ? o.notification_type : "";
    if (!WAITING_TYPES.has(type)) return;
    const message = clip(redact(typeof o.message === "string" ? o.message : "").replace(/\s+/g, " ").trim(), 120);
    this.waitingNow.add(project);
    this.o.emit({ type: "hook.waiting", project, waiting: true, ...(message ? { message } : {}) });
    this.arm(project);
  }
  private arm(project: string): void {
    const old = this.waitingTimers.get(project);
    if (old) clearTimeout(old);
    const minutes = this.o.waitingMinutes?.() ?? 15;
    const t = setTimeout(() => this.clear(project), Math.max(1, minutes) * 60_000);
    t.unref?.();
    this.waitingTimers.set(project, t);
  }
  /** Must fix 28, Stop everything (rule 11): every guard request still waiting for its snapshot lets its command go now,
   *  and every Claude is waiting mark ends (said as waiting: false) with its timer. The folder is still watched; a new
   *  request or note after the stop is answered as usual. */
  stopWaits(): void {
    for (const r of [...this.releases]) r();
    this.releases.clear();
    for (const p of [...this.waitingNow, ...this.waitingTimers.keys()]) this.clear(p);
  }
  /** For tests: how many waits are running now (guard requests and waiting marks). */
  waits(): { requests: number; marks: number; timers: number } { return { requests: this.releases.size, marks: this.waitingNow.size, timers: this.waitingTimers.size }; }
  /** The next hook event for a project (a guard request, the done marker) ends its waiting mark. */
  activity(project: string): void { this.clear(resolve(project)); }
  private clear(project: string): void {
    const t = this.waitingTimers.get(project);
    if (t) { clearTimeout(t); this.waitingTimers.delete(project); }
    if (!this.waitingNow.delete(project)) return;
    this.o.emit({ type: "hook.waiting", project, waiting: false });
  }
}

/** M80: the shell tools whose calls the guard reads, by the name each AI tool gives them: Claude Code and Codex (Bash), the
 *  VS Code agent (run_in_terminal, or bash and shell in the Copilot runtime), Antigravity (run_command), and (M81) Gemini CLI
 *  (run_shell_command) and Windsurf and Devin (exec). Cursor's
 *  beforeShellExecution has no tool name: its command is at the top. */
const SHELL_TOOLS = new Set(["Bash", "run_in_terminal", "runInTerminal", "bash", "shell", "run_command", "run_shell_command", "exec"]);
const objOf = (v: unknown): Record<string, unknown> | null => {
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
};
const textOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The request as the engine reads it: a shell command and its folder, in any of the tools' shapes, or null for anything
 *  else. Only the tool's name, the command and the folder are looked at. */
export function parseRequest(text: string): { command: string; cwd?: string } | null {
  const o = objOf(text);
  if (!o) return null;
  const out = (command: string | null, cwd: unknown) => (command ? { command, ...(typeof cwd === "string" && cwd ? { cwd } : {}) } : null);
  // Antigravity: toolCall.name and toolCall.args, with CommandLine and Cwd; the first workspace path otherwise.
  const call = objOf(o.toolCall);
  if (call) {
    if (call.name !== "run_command") return null;
    const args = objOf(call.args);
    const ws = Array.isArray(o.workspacePaths) ? o.workspacePaths.find((w) => typeof w === "string") : undefined;
    return args ? out(textOf(args.CommandLine), args.Cwd ?? ws) : null;
  }
  // Claude Code, Codex and the VS Code agent: tool_name and tool_input, or toolName and toolArgs (an object or JSON text).
  const name = o.tool_name ?? o.toolName;
  if (name !== undefined) {
    if (typeof name !== "string" || !SHELL_TOOLS.has(name)) return null;
    const input = objOf(o.tool_input ?? o.toolArgs);
    return input ? out(textOf(input.command), o.cwd ?? input.cwd) : null;
  }
  // Cursor's beforeShellExecution: the command and its folder at the top.
  return out(textOf(o.command), o.cwd);
}
