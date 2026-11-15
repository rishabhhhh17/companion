// M100 (F29): where Squibby's own fixing loop runs the tools the model asks for. No new sandbox: every command runs in the
// safety box the proof checks use (proof/box.ts, the sandbox.ts rules), and the file tools stay inside the project in code.
// The order for every call is:
//   1. screen() here, before the person is asked anything: a tool this loop does not have, a file outside the project or in
//      git's, Claude's or Squibby's own folders, a settings or key file, and any command that would change the person's git
//      (rule 10) are refused outright, so no card ever asks about them.
//   2. The runner's own judge (agent.ts authorizeTool): safety.ts's deny rules and allowlists (with livesystems.ts, dbsafety.ts
//      and secretfiles.ts inside them), the house rules, and the approval cards, exactly as for a Claude Code task (rule 12).
//   3. This executor, which runs only what got through both, and judges the file paths again in code at the moment of use.
// A command never runs outside the box: when the box cannot be made here, nothing runs. Its environment is the short allow
// list every check gets (env.ts minimalEnv), so no key, token or account setting can reach it, whatever it is called.
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, writeSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { ToolExecutor, ToolResult, ToolUse } from "../../engine.ts";
import { boxReady } from "../../proof/box.ts";
import { runCommand, shq, type RunOptions, type RunResult } from "../../proof/exec.ts";
import { clip, redactOutput } from "../../redact.ts";
import { commandsWithFolder, evaluate, isSettingsFile, PROTECTED, whereIs } from "../../safety.ts";
import { commandsOf } from "../../shell.ts";
import { isEnvFile } from "../../secretfiles.ts";
import { PRODUCT, PRODUCT_S } from "../../names.ts";
import { LOOP_TOOLS } from "./tools.ts";

/** What the model is told for each refusal. It repeats them to the person, so they are plain and say what to do instead. */
export const NOT_THIS_LOOP = `${PRODUCT} does not let this fix use that. Carry on with reading, searching, editing files and running commands in the project.`;
export const GIT_REFUSED = `${PRODUCT}'s own fixing never changes the project's git (its history, branches, staging or settings). Change the files only, and leave git to the person.`;
export const OUTSIDE = "This fix can only look at and change files inside the project folder.";
export const KEPT_FOLDER = `Git's folder and ${PRODUCT_S} and Claude's own settings folders are not for a fix to read or change.`;
export const SECRET_FILE = "Settings and key files can hold passwords and keys, so this fix never reads or writes them. Which settings a project needs is in its .env.example or its README.";
export const NO_BOX = `The safety box for commands could not be set up on this Mac, so ${PRODUCT} did not run this command. Change the files only.`;

/** The longest file read in one go, and the longest file written. */
const MAX_READ_BYTES = 512 * 1024;
const MAX_WRITE_BYTES = 2 * 1024 * 1024;
/** How much of a tool's output goes back to the model: the end of a long command's output, where the error usually is. */
export const MAX_OUTPUT = 20_000;
const DEFAULT_LINES = 2000;
const MAX_LIST = 300, MAX_MATCHES = 200, MAX_WALK = 20_000;
/** Most seconds one command may take, whatever the model asks. */
export const MAX_COMMAND_S = 600;
const USUAL_COMMAND_S = 120;
/** Folders never walked by Glob and Grep: installed packages, build output caches, and the kept folders. */
const SKIP_DIRS = new Set(["node_modules", ".venv", "venv", "__pycache__", ".next", ".turbo", ".cache", "dist", "build", "target", ...PROTECTED]);

// ---------- 1. the screen ----------

/** Words for git that change it. A part of a command that runs git with any other first word is only looking (status, diff,
 *  log, show, ls-files and the like). */
const GIT_WRITES = /\bgit\b(?:\s+-[A-Za-z]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+(?:commit|add|push|pull|fetch|config|update-ref|update-index|tag|reset|rebase|merge|cherry-pick|revert|am|apply|stash|checkout|switch|branch|rm|mv|restore|symbolic-ref|notes|filter-branch|filter-repo|gc|prune|init|clone|remote|submodule|worktree|clean|replace|lfs|hooks?|commit-tree|write-tree|read-tree|hash-object|mktag|mktree|bisect|sparse-checkout|maintenance|credential)\b/;

/** Why the loop refuses this call before anyone is asked, or null when it goes on to the runner's own judge. */
export function screen(call: ToolUse, project: string): string | null {
  if (!LOOP_TOOLS.includes(call.name)) return NOT_THIS_LOOP;
  const i = call.input ?? {};
  if (call.name === "Bash") return typeof i.command === "string" ? gitWrite(i.command, project) : null;
  const p = call.name === "Glob" || call.name === "Grep" ? i.path : i.file_path;
  if (p === undefined && (call.name === "Glob" || call.name === "Grep")) return null;   // the whole project
  if (typeof p !== "string" || !p.trim()) return null;   // safety.ts names what is missing
  return pathRefusal(project, p, call.name === "Glob" || call.name === "Grep");
}

/** Why a path is refused for a file tool, or null when it is inside the project and is not a kept or secret file. */
export function pathRefusal(project: string, p: string, folderOk = false): string | null {
  const w = whereIs(project, p);
  if (w.protectedPart) return KEPT_FOLDER;
  // The project folder itself is a place to list or search, never a file to read or write.
  if (!w.inside) return folderOk && w.abs === whereIs(project, ".").abs ? null : OUTSIDE;
  if (isEnvFile(w.segments.join("/")) || isSettingsFile(w.abs)) return SECRET_FILE;
  return null;
}

/** Programs that run code given as text (an inline -e or -c, or what is piped into them). The words in that text are read as
 *  git words, since the code can run git; in any other program's words (grep, echo, cat) "git commit" is only text. */
const RUNS_TEXT = new Set(["node", "nodejs", "bun", "deno", "python", "python2", "python3", "ruby", "perl", "php", "lua", "osascript", "tclsh", "sh", "bash", "zsh", "dash", "ksh", "fish", "eval", "source", "."]);

/** A command that would change the person's git, in any part of it, or in a script it runs (safety.ts reads those). Each part
 *  is read on its own, fully unwrapped (env, xargs, nice, sh -c, eval and $(...) taken apart, shell.ts commandsOf), so a git
 *  write is found wherever git runs, and a search or a message that only mentions git is not refused. */
function gitWrite(command: string, project: string): string | null {
  let all: string[][] | null;
  try { all = commandsOf(command); } catch { all = null; }
  // Could not be read part by part: the whole text is read as git words, stricter on purpose.
  if (!all || all.some((w) => w[0] === "<too deep>")) return GIT_WRITES.test(command) ? GIT_REFUSED : null;
  for (const words of all) {
    if (!words.length) continue;
    const name = basename(words[0]);
    // git as a word of its own anywhere in the part: run directly, or handed to xargs, find -exec, watch and the like.
    for (let k = 0; k < words.length; k++) if (basename(words[k]) === "git" && GIT_WRITES.test(["git", ...words.slice(k + 1)].join(" "))) return GIT_REFUSED;
    if (RUNS_TEXT.has(name)) {
      // Code in the part's own words (node -e "...git commit..."), or a shell with no script that reads the rest of the line
      // (`echo "git commit" | sh`): the whole line, since what it runs comes from the other parts.
      if (GIT_WRITES.test(words.slice(1).join(" "))) return GIT_REFUSED;
      if (words.length === 1 || words.slice(1).every((a) => a.startsWith("-"))) { if (GIT_WRITES.test(command)) return GIT_REFUSED; }
    }
  }
  // Each part alone, so a git part beside a part that asks for something else is never hidden behind that other question.
  let parts: { words: string[]; cwd: string }[] = [];
  try { parts = commandsWithFolder(command, project); } catch { parts = []; }
  for (const part of parts) {
    if (!part.words.length) continue;
    const v = evaluate({ tool: "Bash", input: { command: part.words.map(shq).join(" ") } }, { project: part.cwd });
    if (v.risk === "git") return GIT_REFUSED;
  }
  const whole = evaluate({ tool: "Bash", input: { command } }, { project });
  return whole.risk === "git" ? GIT_REFUSED : null;
}

// ---------- 2. files, never through a link ----------

type Inside = { abs: string; rel: string };
/** The path as a place inside the project, walked part by part with no link anywhere on the way. Null for anything else. */
function inside(project: string, p: string, o: { create?: boolean; folder?: boolean } = {}): Inside | null {
  const root = whereIs(project, ".").abs;
  const abs0 = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const rel = relative(root, abs0);
  if (rel === "" ? !o.folder : rel.startsWith("..") || isAbsolute(rel)) return null;
  const parts = normalize(rel).split(sep).filter((x) => x && x !== ".");
  let at = root;
  for (let k = 0; k < parts.length; k++) {
    if (PROTECTED.has(parts[k].toLowerCase())) return null;
    at = join(at, parts[k]);
    let st;
    try { st = lstatSync(at); } catch {
      if (!o.create) return null;
      // Missing: made one folder at a time below a real folder, for a write.
      if (k < parts.length - 1) { try { mkdirSync(at); } catch { return null; } continue; }
      return { abs: at, rel: parts.join("/") };
    }
    if (st.isSymbolicLink()) return null;
    if (k < parts.length - 1 && !st.isDirectory()) return null;
  }
  return { abs: at, rel: parts.join("/") };
}

function readText(abs: string, max: number): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(abs, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    const n0 = Math.min(st.size, max);
    const buf = Buffer.alloc(n0);
    let n = 0;
    while (n < n0) { const got = readSync(fd, buf, n, n0 - n, n); if (got <= 0) break; n += got; }
    const b = buf.subarray(0, n);
    if (b.includes(0)) return "\u0000";
    return b.toString("utf8");
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* closed */ } }
}
function writeText(abs: string, text: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(abs, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    if (!fstatSync(fd).isFile()) return false;
    const b = Buffer.from(text, "utf8");
    let n = 0;
    while (n < b.length) n += writeSync(fd, b, n, b.length - n);
    return true;
  } catch { return false; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* closed */ } }
}

const fail = (output: string): ToolResult => ({ ok: false, output });
const okOut = (output: string): ToolResult => ({ ok: true, output: clip(redactOutput(output), MAX_OUTPUT) });

function readTool(project: string, i: Record<string, unknown>): ToolResult {
  const p = String(i.file_path ?? "");
  const why = pathRefusal(project, p); if (why) return fail(why);
  const at = inside(project, p); if (!at) return fail("That file was not found in the project (a link to somewhere else is never followed).");
  const text = readText(at.abs, MAX_READ_BYTES);
  if (text === null) return fail("That is not a file that can be read.");
  if (text === "\u0000") return fail("That file is not text, so it is not read.");
  const lines = text.split("\n");
  const from = Math.max(1, Number.isInteger(i.offset) ? (i.offset as number) : 1);
  const count = Math.max(1, Number.isInteger(i.limit) ? (i.limit as number) : DEFAULT_LINES);
  const shown = lines.slice(from - 1, from - 1 + count).map((l, k) => `${String(from + k).padStart(6)}\t${l}`).join("\n");
  const more = from - 1 + count < lines.length ? `\n[${lines.length - (from - 1 + count)} more lines: read on with offset ${from + count}]` : "";
  return okOut((shown || "[the file is empty]") + more);
}

function writeTool(project: string, i: Record<string, unknown>): ToolResult {
  const p = String(i.file_path ?? "");
  const why = pathRefusal(project, p); if (why) return fail(why);
  const content = typeof i.content === "string" ? i.content : "";
  if (Buffer.byteLength(content) > MAX_WRITE_BYTES) return fail("That is too much to write in one file at once.");
  const at = inside(project, p, { create: true }); if (!at) return fail(OUTSIDE);
  return writeText(at.abs, content) ? { ok: true, output: `Wrote ${at.rel}.` } : fail("That file could not be written.");
}

function editTool(project: string, i: Record<string, unknown>): ToolResult {
  const p = String(i.file_path ?? "");
  const why = pathRefusal(project, p); if (why) return fail(why);
  const at = inside(project, p); if (!at) return fail("That file was not found in the project. Use Write to make a new one.");
  const from = typeof i.old_string === "string" ? i.old_string : "", to = typeof i.new_string === "string" ? i.new_string : "";
  if (!from) return fail("Say which text to replace (old_string).");
  const text = readText(at.abs, MAX_WRITE_BYTES);
  if (text === null || text === "\u0000") return fail("That file cannot be edited as text.");
  const n = text.split(from).length - 1;
  if (n === 0) return fail("The text to replace was not found. Read the file again and copy the text exactly.");
  if (n > 1) return fail(`The text to replace appears ${n} times. Give more of the text around it, so it appears once.`);
  const out = text.replace(from, () => to);
  if (Buffer.byteLength(out) > MAX_WRITE_BYTES) return fail("That would make the file too big.");
  return writeText(at.abs, out) ? { ok: true, output: `Edited ${at.rel}.` } : fail("That file could not be written.");
}

/** Every file below `dir` (inside the project), by its project relative path, never through a link, skipping SKIP_DIRS. */
function walk(project: string, dir: Inside, each: (rel: string, abs: string) => boolean): void {
  let seen = 0;
  const go = (abs: string, rel: string): boolean => {
    let names: string[];
    try { names = readdirSync(abs).sort(); } catch { return true; }
    for (const n of names) {
      if (++seen > MAX_WALK) return false;
      const a = join(abs, n), r = rel ? `${rel}/${n}` : n;
      let st; try { st = lstatSync(a); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (SKIP_DIRS.has(n) || SKIP_DIRS.has(n.toLowerCase())) continue; if (!go(a, r)) return false; }
      else if (st.isFile() && !each(r, a)) return false;
    }
    return true;
  };
  go(dir.abs, dir.rel);
}

function folderOf(project: string, i: Record<string, unknown>): Inside | ToolResult {
  const p = typeof i.path === "string" && i.path.trim() ? i.path : ".";
  if (p !== ".") { const why = pathRefusal(project, p, true); if (why) return fail(why); }
  return inside(project, p, { folder: true }) ?? fail("That folder was not found in the project.");
}
const isResult = (x: Inside | ToolResult): x is ToolResult => "ok" in x;

function globTool(project: string, i: Record<string, unknown>): ToolResult {
  const pattern = String(i.pattern ?? "").replace(/^\.\//, "");
  if (!pattern || isAbsolute(pattern) || pattern.startsWith("~") || /(^|\/)\.\.(\/|$)/.test(pattern)) return fail(OUTSIDE);
  const dir = folderOf(project, i); if (isResult(dir)) return dir;
  const g = new Bun.Glob(pattern), out: string[] = [];
  walk(project, dir, (rel) => { const local = dir.rel ? rel.slice(dir.rel.length + 1) : rel; if (g.match(local) || g.match(rel)) out.push(rel); return out.length < MAX_LIST; });
  return okOut(out.length ? out.join("\n") + (out.length >= MAX_LIST ? `\n[stopped at ${MAX_LIST}: narrow the pattern]` : "") : "No files match.");
}

function grepTool(project: string, i: Record<string, unknown>): ToolResult {
  let re: RegExp;
  try { re = new RegExp(String(i.pattern ?? "")); } catch { return fail("That is not a regular expression that can be read."); }
  const only = typeof i.glob === "string" && i.glob ? new Bun.Glob(i.glob) : null;
  const target = typeof i.path === "string" && i.path.trim() ? i.path : ".";
  const out: string[] = [];
  const look = (rel: string, abs: string): boolean => {
    if (isEnvFile(rel) || isSettingsFile(abs) || (only && !only.match(rel) && !only.match(rel.split("/").pop()!))) return true;
    const text = readText(abs, 1024 * 1024);
    if (text === null || text === "\u0000") return true;
    const lines = text.split("\n");
    for (let k = 0; k < lines.length; k++) if (re.test(lines[k])) { out.push(`${rel}:${k + 1}: ${clip(lines[k], 300)}`); if (out.length >= MAX_MATCHES) return false; }
    return true;
  };
  if (target !== ".") {
    const why = pathRefusal(project, target, true); if (why) return fail(why);
    const at = inside(project, target, { folder: true }); if (!at) return fail("That file or folder was not found in the project.");
    let st; try { st = lstatSync(at.abs); } catch { return fail("That file or folder was not found in the project."); }
    if (st.isFile()) look(at.rel, at.abs); else walk(project, at, look);
  } else walk(project, inside(project, ".", { folder: true })!, look);
  return okOut(out.length ? out.join("\n") + (out.length >= MAX_MATCHES ? `\n[stopped at ${MAX_MATCHES} matches: narrow the search]` : "") : "No matches.");
}

// ---------- 3. commands, in the box ----------

export type ExecutorDeps = {
  /** How a command is run (runCommand); tests pass a stand in that records what it was given. */
  run?: (command: string, o: RunOptions) => Promise<RunResult>;
  /** Whether the box can be made on this Mac (box.ts boxReady); tests may say no. */
  boxReady?: () => boolean;
};

/** The executor for the loop. The runner passes the task's stop signal, so Stop and Stop everything end a command at once. */
export function boxedExecutor(d: ExecutorDeps = {}): ToolExecutor {
  const run = d.run ?? runCommand, ready = d.boxReady ?? boxReady;
  return async (call, ctx) => {
    const project = ctx.project;
    // Judged again here, as the call is run: the runner's yes never widens what this loop may do.
    const why = screen(call, project);
    if (why) return fail(why);
    const i = call.input ?? {};
    try {
      switch (call.name) {
        case "Read": return readTool(project, i);
        case "Write": return writeTool(project, i);
        case "Edit": return editTool(project, i);
        case "Glob": return globTool(project, i);
        case "Grep": return grepTool(project, i);
        case "Bash": {
          const command = typeof i.command === "string" ? i.command : "";
          if (!command.trim()) return fail("The command is empty.");
          if (!ready()) return fail(NO_BOX);
          // The internet only for an install the person was asked about and said yes to (safety.ts asks for those first);
          // everything else gets this Mac's own addresses only. A project's own package install (npm install) is allowed by
          // safety.ts without a card, so it gets no internet here: the proof ladder's install step asks and installs.
          const v = evaluate({ tool: "Bash", input: { command } }, { project });
          const net = v.decision === "ask" && v.risk === "install" ? "open" : "local";
          const secs = Math.min(MAX_COMMAND_S, Number.isInteger(i.timeout) && (i.timeout as number) > 0 ? (i.timeout as number) : USUAL_COMMAND_S);
          const r = await run(command, { cwd: project, timeoutMs: secs * 1000, box: { project, net }, ...(ctx.signal ? { signal: ctx.signal } : {}) });
          const said = `${r.stdout}${r.stderr ? (r.stdout ? "\n" : "") + r.stderr : ""}`;
          const end = r.aborted ? "\n[stopped]" : r.timedOut ? `\n[stopped after ${secs} seconds]` : `\n[exit code ${r.code ?? "none"}]`;
          const text = redactOutput(said);
          return { ok: r.code === 0 && !r.timedOut && !r.aborted, output: (text.length > MAX_OUTPUT ? `[the start was cut]\n${text.slice(-MAX_OUTPUT)}` : text) + end };
        }
      }
    } catch (e) { return fail(clip(redactOutput(String((e as Error)?.message ?? e)), 300)); }
    return fail(NOT_THIS_LOOP);
  };
}
