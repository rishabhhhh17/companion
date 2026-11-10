// M75 (roadmap 19, F30): review the moment the other AI tool says it is done. With the person's yes on a card that shows
// exactly what is written where, Squibby adds one Stop hook to the project's own settings file of that tool:
//  - Claude Code: <project>/.claude/settings.local.json (code.claude.com/docs/en/hooks: "Stop" has no matcher and fires
//    each time Claude finishes responding; exit code 2 would keep it going, so the command always exits 0).
//  - Codex: <project>/.codex/hooks.json (Codex's lifecycle hooks, the same shape; a new project hook runs only after the
//    person trusts it with /hooks, and a Stop hook that exits 0 must print JSON, so the command prints {}). Codex's
//    `notify` is not used: it is user level only, takes one program, and hands it the turn's words.
// The hook's command only touches an empty file named by a random token in Squibby's own data folder. It never reads its
// input (the turn's JSON, with the last message in it), so no content travels (rules 5 and 6): only "done in this folder".
// M77 (the safety net): two more hooks for Claude Code, added the same way, each after its own yes:
//  - guard: a PreToolUse hook on Bash. It hands the tool call's JSON (which holds the command about to run) to Squibby's
//    own `guard` folder and waits up to 5 seconds for Squibby's answer file, then exits 0 whatever happened. Squibby takes
//    a snapshot first when the command is destructive (guard.ts). The hook never prints, never exits 2 and never changes
//    the command: a closed or slow Squibby never blocks Claude Code (the docs: a timed out PreToolUse hook does not block).
//  - waiting: a Notification hook for permission_prompt and idle_prompt. It hands Claude Code's own short notification
//    (message and type) to the same folder and exits 0. Squibby keeps only a short, redacted message (guard.ts).
//  Both start by checking that Squibby's engine is alive (its guard/pid file) and exit 0 at once when it is not.
// M78 (memory that is never lost): a fourth, start, a SessionStart hook for Claude Code (matcher startup|clear|compact). It
// prints <data>/start/<token>.md, the start block Squibby wrote earlier (memory/sessionstart.ts), and exits 0. Claude Code adds
// a SessionStart hook's plain stdout to Claude's context. It reads nothing else and needs no running engine.
// Nothing here runs git or writes the person's git (rule 10). Every other line of the file is kept as it was, a file that is
// not plain JSON is refused and left alone, and Remove takes out only Squibby's own entry (found by its marker path).
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, watch as fsWatch } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { writeAtomic } from "./atomic.ts";
import { PRODUCT } from "./names.ts";

export const DONE_TOOLS = ["claude", "codex"] as const;
export type DoneTool = (typeof DONE_TOOLS)[number];
/** M77: the kinds of hook. done: the Stop hook (both tools). guard and waiting: Claude Code only. M78: start, Claude Code
 *  only: the start block (memory/startblock.ts) printed as a session starts. */
export const HOOK_KINDS = ["done", "guard", "waiting", "start"] as const;
export type HookKind = (typeof HOOK_KINDS)[number];
/** The event each kind sits under in the tool's hooks file. */
export const HOOK_EVENT: Readonly<Record<HookKind, string>> = { done: "Stop", guard: "PreToolUse", waiting: "Notification", start: "SessionStart" };
/** The matcher of each kind (Stop has none). */
/** M78: SessionStart matches on how the session started. resume is left out: a resumed conversation already holds its
 *  block, and printing it again would change the start of the conversation ([verify] on a real Mac). */
export const HOOK_MATCHER: Readonly<Partial<Record<HookKind, string>>> = { guard: "Bash", waiting: "permission_prompt|idle_prompt", start: "startup|clear|compact" };
/** The hooks each tool may have. Codex's PreToolUse and Notification contracts are not checked, so only done ([verify]). */
export const TOOL_HOOKS: Readonly<Record<DoneTool, readonly HookKind[]>> = { claude: ["done", "guard", "waiting", "start"], codex: ["done"] };
/** Where each tool's project hook file lives, from the project folder down. */
export const HOOK_FILE: Readonly<Record<DoneTool, string>> = { claude: ".claude/settings.local.json", codex: ".codex/hooks.json" };
/** The folder in Squibby's data folder the hooks touch, and the file that names each project's token. */
export const DONE_DIR = "done";
export const DONE_INDEX = "done-signals.json";
/** M77: the folder the guard and waiting hooks write to, and the file that says the engine is alive (its pid). */
export const GUARD_DIR = "guard";
export const GUARD_PID = "pid";
/** M77: how long the guard hook waits for Squibby's answer, in tenths of a second, and the Claude Code timeouts (seconds). */
export const GUARD_WAIT_TENTHS = 50;
export const GUARD_TIMEOUT_S = 10;
export const WAITING_TIMEOUT_S = 5;
/** M78: the folder of start blocks (one <token>.md per project), and the start hook's Claude Code timeout (seconds). */
export const START_DIR = "start";
export const START_TIMEOUT_S = 5;
const TOKEN = /^[0-9a-f]{24}$/;

/** A path inside single quotes for /bin/sh: a quote in it is closed, escaped and opened again. */
const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
/** The hook's whole command. It touches the marker, says nothing on error, prints {} and always ends with 0. */
export const hookCommand = (marker: string): string => `/usr/bin/touch -- ${shQuote(marker)} 2>/dev/null; printf '{}'`;
/** The entry added to the file's hooks.Stop list. */
export const hookEntry = (marker: string) => ({ hooks: [{ type: "command", command: hookCommand(marker) }] });
/** M77: the first words of the guard and waiting commands: Squibby's guard folder, and the check that its engine is alive.
 *  Remove finds Squibby's entries by this opening. */
const guardOpening = (guardDir: string) => `d=${shQuote(guardDir)}; p=$(cat "$d/${GUARD_PID}" 2>/dev/null) && kill -0 "$p" 2>/dev/null || exit 0;`;
/** M77: the guard hook's command. Its input (the tool call's JSON) goes to <guardDir>/<token>.<pid> through a temporary
 *  name, then it waits for <that>.ok up to GUARD_WAIT_TENTHS tenths of a second, removes both and exits 0. */
export const guardCommand = (guardDir: string, token: string): string =>
  `${guardOpening(guardDir)} r="$d/${token}.$$"; cat >"$r.tmp" 2>/dev/null && mv "$r.tmp" "$r" 2>/dev/null || { rm -f "$r.tmp"; exit 0; }; i=0; while [ ! -e "$r.ok" ] && [ $i -lt ${GUARD_WAIT_TENTHS} ]; do sleep 0.1; i=$((i+1)); done; rm -f "$r" "$r.ok"; exit 0`;
/** M77: the waiting hook's command. Its input (the notification's JSON) goes to <guardDir>/<token>.<pid>.note. */
export const waitingCommand = (guardDir: string, token: string): string =>
  `${guardOpening(guardDir)} n="$d/${token}.$$.note"; cat >"$n.tmp" 2>/dev/null && mv "$n.tmp" "$n" 2>/dev/null || rm -f "$n.tmp"; exit 0`;
/** M77: the entry added under PreToolUse (guard) or Notification (waiting). */
/** M78: the start hook's command: it prints the project's start block, a file Squibby wrote earlier, and always ends with 0.
 *  It reads nothing else and needs no running engine, so the block reaches Claude while Squibby is closed too. Claude Code
 *  adds a SessionStart hook's plain stdout to Claude's context (code.claude.com/docs/en/hooks). */
export const startCommand = (startDir: string, token: string): string =>
  `s=${shQuote(startDir)}; f="$s/${token}.md"; [ -f "$f" ] && /bin/cat -- "$f" 2>/dev/null; exit 0`;
export const startEntry = (startDir: string, token: string) => ({ matcher: HOOK_MATCHER.start, hooks: [{ type: "command", command: startCommand(startDir, token), timeout: START_TIMEOUT_S }] });
export const guardEntry = (guardDir: string, token: string) => ({ matcher: HOOK_MATCHER.guard, hooks: [{ type: "command", command: guardCommand(guardDir, token), timeout: GUARD_TIMEOUT_S }] });
export const waitingEntry = (guardDir: string, token: string) => ({ matcher: HOOK_MATCHER.waiting, hooks: [{ type: "command", command: waitingCommand(guardDir, token), timeout: WAITING_TIMEOUT_S }] });

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const commandsOf = (entry: unknown): string[] =>
  isObj(entry) && Array.isArray(entry.hooks) ? entry.hooks.flatMap((h) => (isObj(h) && typeof h.command === "string" ? [h.command] : [])) : [];
/** Whether a Stop entry is Squibby's own: one of its commands names this marker. */
const ours = (entry: unknown, marker: string): boolean => commandsOf(entry).some((c) => c.includes(marker));
/** Whether an entry is any Squibby signal of this data folder (any marker in it), for a token that changed: a done touch of
 *  the done folder, or a guard or waiting command that opens with the guard folder. */
const anyOurs = (entry: unknown, dir: string, guardDir: string, startDir: string): boolean =>
  isObj(entry) && Array.isArray(entry.hooks) && entry.hooks.some((h) => isObj(h) && typeof h.command === "string" && ((h.command.includes(`${dir}/`) && h.command.startsWith("/usr/bin/touch -- ")) || h.command.startsWith(`d=${shQuote(guardDir)};`) || h.command.startsWith(`s=${shQuote(startDir)};`)));

export const NOT_JSON = (file: string) => `${file} is not in a form ${PRODUCT} can change safely, so nothing was written. Nothing in it was changed.`;
export const NOT_A_FOLDER = "That folder could not be found, so nothing was written.";
export const NOT_FOR_TOOL = "That tool does not have this signal.";

/** Reads the hook file: null when there is none, the object when it is plain JSON, or "bad" for anything else. */
function readHooks(file: string): Json | null | "bad" {
  let text: string;
  try { if (!lstatSync(file).isFile()) return "bad"; text = readFileSync(file, "utf8"); } catch (e) { return (e as NodeJS.ErrnoException).code === "ENOENT" ? null : "bad"; }
  if (!text.trim()) return {};
  try { const j = JSON.parse(text); return isObj(j) ? j : "bad"; } catch { return "bad"; }
}

type Rec = { token: string; made?: DoneTool[]; folders?: DoneTool[] };
export type DonePlan = { tool: DoneTool; hook: HookKind; file: string; rel: string; on: boolean; creates: boolean; adds: string; problem?: string };

/** The tokens of each project, kept in Squibby's own data folder. One random token per project, made when first needed. */
export class DoneSignals {
  private dir: string;
  private guardDir: string;
  private startDir: string;
  private index: string;
  private w: { close(): void } | null = null;
  constructor(private data: string, private o: { onDone?: (project: string) => void; watch?: typeof fsWatch } = {}) {
    this.dir = join(resolve(data), DONE_DIR);
    this.guardDir = join(resolve(data), GUARD_DIR);
    this.startDir = join(resolve(data), START_DIR);
    this.index = join(resolve(data), DONE_INDEX);
  }
  /** M77: the folder the guard and waiting hooks write to (guard.ts watches it). */
  get guardFolder(): string { return this.guardDir; }
  /** M78: the folder of start blocks the start hook prints (main.ts writes them). */
  get startFolder(): string { return this.startDir; }
  private read(): Record<string, Rec> {
    try { const j = JSON.parse(readFileSync(this.index, "utf8")); return isObj(j) ? (j as never) : {}; } catch { return {}; }
  }
  private save(all: Record<string, Rec>) {
    mkdirSync(resolve(this.data), { recursive: true, mode: 0o700 });
    writeAtomic(this.index, JSON.stringify(all, null, 2), 0o600);
  }
  /** The project's token (made if asked and there is none yet). */
  tokenFor(project: string, make = true): string | null {
    const p = resolve(project), all = this.read();
    let t = all[p]?.token;
    if (!t || !TOKEN.test(t)) {
      if (!make) return null;
      t = randomBytes(12).toString("hex");
      all[p] = { token: t, made: all[p]?.made ?? [], folders: all[p]?.folders ?? [] };
      this.save(all);
    }
    return t;
  }
  /** The marker file the project's hook touches (made with a new token if there is none yet). */
  markerFor(project: string, make = true): string | null {
    const t = this.tokenFor(project, make);
    return t ? join(this.dir, t) : null;
  }
  /** The project a marker's file name belongs to, or null. */
  projectOf(name: string): string | null {
    if (!TOKEN.test(name)) return null;
    for (const [p, v] of Object.entries(this.read())) if (v.token === name) return p;
    return null;
  }
  /** M77: the entry of one kind for a project, as it is written (the guard and waiting entries name the token itself). */
  private entryOf(kind: HookKind, token: string | null): unknown {
    const t = token ?? "<made when you say yes>";
    if (kind === "guard") return guardEntry(this.guardDir, t);
    if (kind === "waiting") return waitingEntry(this.guardDir, t);
    if (kind === "start") return startEntry(this.startDir, t);
    return hookEntry(join(this.dir, t));
  }
  /** Whether an entry under an event is Squibby's own of this kind for this project. */
  private oursOf(entry: unknown, kind: HookKind, token: string): boolean {
    if (kind === "done") return ours(entry, join(this.dir, token));
    if (kind === "start") return commandsOf(entry).some((c) => c.startsWith(`s=${shQuote(this.startDir)};`) && c.includes(`/${token}.md"`));
    return commandsOf(entry).some((c) => c.startsWith(`d=${shQuote(this.guardDir)};`) && c.includes(`/${token}.`));
  }

  /** What would be written, or what is there, for one tool and hook: the exact entry the card shows before the yes. */
  plan(project: string, tool: DoneTool, hook: HookKind = "done"): DonePlan {
    const p = resolve(project), rel = HOOK_FILE[tool], file = join(p, rel);
    const token = this.tokenFor(p, false);
    const adds = JSON.stringify({ hooks: { [HOOK_EVENT[hook]]: [this.entryOf(hook, token)] } }, null, 2);
    const now = readHooks(file);
    const on = isObj(now) && this.isOn(now, p, hook);
    const base: DonePlan = { tool, hook, file, rel, on, creates: now === null, adds };
    if (!TOOL_HOOKS[tool].includes(hook)) return { ...base, problem: NOT_FOR_TOOL };
    return now === "bad" ? { ...base, problem: NOT_JSON(rel) } : base;
  }
  private isOn(j: Json, project: string, hook: HookKind): boolean {
    const t = this.tokenFor(project, false);
    const list = isObj(j.hooks) && Array.isArray(j.hooks[HOOK_EVENT[hook]]) ? (j.hooks[HOOK_EVENT[hook]] as unknown[]) : [];
    return !!t && list.some((e) => this.oursOf(e, hook, t));
  }

  /** Adds the hook after the person's yes. Every other key and hook stays. Adding twice adds once. */
  add(project: string, tool: DoneTool, hook: HookKind = "done"): DonePlan {
    const p = resolve(project);
    if (!TOOL_HOOKS[tool].includes(hook)) return { ...this.plan(p, tool, hook), problem: NOT_FOR_TOOL };
    try { if (!statSync(p).isDirectory()) return { ...this.plan(p, tool, hook), problem: NOT_A_FOLDER }; } catch { return { ...this.plan(p, tool, hook), problem: NOT_A_FOLDER }; }
    const rel = HOOK_FILE[tool], file = join(p, rel), event = HOOK_EVENT[hook];
    const now = readHooks(file);
    if (now === "bad") return { ...this.plan(p, tool, hook), problem: NOT_JSON(rel) };
    const token = this.tokenFor(p)!;
    try { mkdirSync(this.dir, { recursive: true, mode: 0o700 }); mkdirSync(this.guardDir, { recursive: true, mode: 0o700 }); mkdirSync(this.startDir, { recursive: true, mode: 0o700 }); } catch { /* start() makes them too */ }
    const j: Json = now ?? {};
    const hooks: Json = isObj(j.hooks) ? { ...j.hooks } : {};
    if (j.hooks !== undefined && !isObj(j.hooks)) return { ...this.plan(p, tool, hook), problem: NOT_JSON(rel) };
    const list: unknown[] = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) return { ...this.plan(p, tool, hook), problem: NOT_JSON(rel) };
    // Already there: nothing to write. An older Squibby entry (a token made again after Delete everything) is replaced,
    // never left beside the new one.
    if (list.some((e) => this.oursOf(e, hook, token))) return this.plan(p, tool, hook);
    hooks[event] = [...list.filter((e) => !anyOurs(e, this.dir, this.guardDir, this.startDir)), this.entryOf(hook, token)];
    const folder = join(p, rel.split("/")[0]!);
    const madeFolder = !existsSync(folder);
    mkdirSync(folder, { recursive: true });
    writeAtomic(file, JSON.stringify({ ...j, hooks }, null, 2) + "\n", "keep");
    // Remember what Squibby made itself, so Remove can take away a file or folder that held nothing else.
    const all = this.read(), rec = all[p]!;
    all[p] = { ...rec, made: now === null ? [...new Set([...(rec.made ?? []), tool])] : rec.made ?? [], folders: madeFolder ? [...new Set([...(rec.folders ?? []), tool])] : rec.folders ?? [] };
    this.save(all);
    return this.plan(p, tool, hook);
  }

  /** Removes only Squibby's own entry of this kind. A file Squibby made and that is now empty is removed, and its folder if
   *  it made it. */
  remove(project: string, tool: DoneTool, hook: HookKind = "done"): DonePlan {
    const p = resolve(project), rel = HOOK_FILE[tool], file = join(p, rel), event = HOOK_EVENT[hook];
    const now = readHooks(file);
    if (now === "bad") return { ...this.plan(p, tool, hook), problem: NOT_JSON(rel) };
    if (now && isObj(now.hooks) && Array.isArray(now.hooks[event])) {
      const hooks: Json = { ...now.hooks };
      // Every Squibby entry under this event goes (an older token's too), nothing of anyone else's.
      const kept = (hooks[event] as unknown[]).filter((e) => !anyOurs(e, this.dir, this.guardDir, this.startDir));
      if (kept.length) hooks[event] = kept; else delete hooks[event];
      const out: Json = { ...now };
      if (Object.keys(hooks).length) out.hooks = hooks; else delete out.hooks;
      const all = this.read(), rec = all[p];
      const folder = join(p, rel.split("/")[0]!);
      if (Object.keys(out).length === 0 && rec?.made?.includes(tool)) {
        rmSync(file, { force: true });
        if (rec.folders?.includes(tool)) { try { if (readdirSync(folder).length === 0) rmdirSync(folder); } catch { /* not empty, or gone */ } }
        all[p] = { ...rec, made: (rec.made ?? []).filter((t) => t !== tool), folders: (rec.folders ?? []).filter((t) => t !== tool) }; this.save(all);
      } else writeAtomic(file, JSON.stringify(out, null, 2) + "\n", "keep");
    }
    return this.plan(p, tool, hook);
  }

  /** Every tool's and hook's state for a project, for the Settings rows: the done signals first, then Claude Code's guard
   *  and waiting hooks. */
  state(project: string): DonePlan[] {
    const out: DonePlan[] = DONE_TOOLS.map((t) => this.plan(project, t, "done"));
    for (const t of DONE_TOOLS) for (const k of TOOL_HOOKS[t]) if (k !== "done") out.push(this.plan(project, t, k));
    return out;
  }

  /** Starts listening to Squibby's own done folder (only that folder). Markers left from while Squibby was closed are
   *  removed first: changes made then are the "changed while closed" batch's, not a signal. */
  start(): boolean {
    if (this.w) return true;
    try { mkdirSync(this.dir, { recursive: true, mode: 0o700 }); } catch { return false; }
    for (const n of this.names()) this.take(n, false);
    try {
      const w = (this.o.watch ?? fsWatch)(this.dir, (_ev, name) => { if (name) this.take(basename(String(name)), true); });
      w.on?.("error", () => { /* the folder went away */ });
      this.w = { close: () => w.close() };
    } catch { return false; }
    return true;
  }
  stop() { try { this.w?.close(); } catch { /* closed */ } this.w = null; }
  private names(): string[] { try { return readdirSync(this.dir); } catch { return []; } }
  /** A marker arrived: it is removed, and its project is told. Anything else in the folder is left alone. */
  private take(name: string, tell: boolean) {
    if (!TOKEN.test(name)) return;
    const f = join(this.dir, name);
    if (!existsSync(f)) return;
    try { rmSync(f, { force: true }); } catch { /* gone already */ }
    const p = this.projectOf(name);
    if (tell && p) this.o.onDone?.(p);
  }
}
