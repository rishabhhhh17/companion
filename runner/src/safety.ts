// Safety lives here, in code, not in prompts (rule 12). Every tool call an agent
// makes is judged before it runs: allow, ask the user (an approval card), or deny.
// Conservative on purpose: when unsure, ask.

import { lstatSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { commandsOf, hasAnsiQuote, hasDynamic, inputTargets, nestedStrings, parseShell, redirectTargets, unwrap } from "./shell.ts";
import { isSafeUrl } from "./research.ts";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { privateReason } from "./watchaddress.ts";
import { isEnvFile } from "./diagram.ts";
import { PRODUCT, PRODUCT_S } from "./names.ts";

export type Risk = "irreversible" | "git" | "outside_project" | "install" | "network" | "settings" | "house_rule";
export type Verdict = { decision: "allow" | "ask" | "deny"; risk?: Risk; reason: string; undoable: boolean };
export type ToolCall = { tool: string; input: Record<string, unknown> };
// started: the ids of the background commands this task's own shell commands reported starting.
export type Started = { shells: ReadonlySet<string> };
// webSearch: false when the person turned off Let tasks search the web (work.webSearch) for this task.
export type Context = { project: string; userAskedCommit?: boolean; started?: Started; claudeTemp?: string; webSearch?: boolean };
export const claudeTempRoot = (env: Record<string, string | undefined> = process.env): string => resolve(env.CLAUDE_CODE_TMPDIR || "/tmp", `claude-${process.getuid?.() ?? 0}`);

const allow = (reason = "ok", undoable = true): Verdict => ({ decision: "allow", reason, undoable });
// Undo puts back project files from a shadow snapshot. It never touches .git (rule 10) and never takes back anything that
// left the Mac, so an irreversible or git ask is never undoable, whatever a caller says (M45). Every caller says it out loud.
const ask = (risk: Risk, reason: string, undoable: boolean): Verdict =>
  ({ decision: "ask", risk, reason, undoable: risk === "irreversible" || risk === "git" ? false : undoable });
const deny = (risk: Risk, reason: string): Verdict => ({ decision: "deny", risk, reason, undoable: true });
const rank = { allow: 0, ask: 1, deny: 2 } as const;
// The stricter decision wins (on a tie, the first one's words stay). Whichever part wins, Undo can take the whole command
// back only if it can take back both parts (M45): a commit the person asked for (allowed, not undoable) next to a part that
// asks must not make the question say Undo can take it back.
const worst = (a: Verdict, b: Verdict): Verdict => {
  const w = rank[b.decision] > rank[a.decision] ? b : a;
  return w.undoable && !(a.undoable && b.undoable) ? { ...w, undoable: false } : w;
};

// ---------- paths ----------

// Follow links all the way, even through a link whose target does not exist yet (writing through such a link would create the target).
export function resolveLinks(input: string, depth = 0): string {
  const abs = resolve(input);
  if (depth > 25) return abs;
  const parts = abs.split(sep).filter(Boolean);
  let built: string = sep;
  for (let i = 0; i < parts.length; i++) {
    const next = join(built, parts[i]);
    let st;
    try { st = lstatSync(next); } catch { return join(next, ...parts.slice(i + 1)); }          // does not exist: the rest is just text
    if (st.isSymbolicLink()) {
      let t: string;
      try { t = readlinkSync(next); } catch { return join(next, ...parts.slice(i + 1)); }
      return resolveLinks(join(isAbsolute(t) ? t : join(built, t), ...parts.slice(i + 1)), depth + 1);
    }
    built = next;
  }
  return built;
}

// Folders Companion and Claude keep their own settings in, and git's own. An agent never writes into them, in any spelling.
// (The project's notes never import from them either: sandbox.ts.)
export const PROTECTED: ReadonlySet<string> = new Set([".git", ".claude", ".companion"]);

type Where = { inside: boolean; segments: string[]; protectedPart: string | null; abs: string };
// A file tool may be handed "~/.aws/credentials" or "$HOME/.ssh/id_rsa": those are the home folder, not a name inside the project.
const homeSpelling = (file: string): string => {
  const m = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/.exec(file);
  return m ? homedir() + file.slice(m[0].length) : file;
};
function whereIs(project: string, file: string, cwd?: string): Where {
  const root = resolveLinks(project);
  file = homeSpelling(file);
  const abs = resolveLinks(isAbsolute(file) ? file : join(cwd ?? project, file));
  const rel = relative(root, abs);
  const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  const segments = inside ? rel.split(sep).map((x) => x.toLowerCase()) : [];
  const part = segments.find((x) => PROTECTED.has(x)) ?? (segments[0] === ".gitmodules" ? ".gitmodules" : null);
  return { inside, segments, protectedPart: part, abs };
}
const insideProject = (project: string, file: string) => { const w = whereIs(project, file); return { inside: w.inside, inGit: w.segments.includes(".git") }; };

// ---------- private settings files (.env and its family) ----------
// T05: the hook asks before any write to a .env file (the real run of 22 Oct 2026 found it allowed every write). A card names the
// settings it touches and never shows a value. A key, token or password is never written for the person: Companion tells them to
// add that line themselves (rule: never ask for, make up or write a secret). Templates people share (.env.example) are free.
const SETTINGS_TEMPLATE = /\.(example|sample|template|dist|defaults)$/i;
/** A private settings file: .env, .env.local, .env.production, .env.<anything>, name.env. Not the shared templates. */
export const isSettingsFile = (p: string): boolean => {
  const b = basename(p).toLowerCase();
  return (/^\.env(\.[^/]*)?$/.test(b) || b === ".envrc" || /^[^/]+\.env$/.test(b)) && !SETTINGS_TEMPLATE.test(b);
};
const SECRET_NAME = /(SECRET|TOKEN|PASSW|PRIVATE|CREDENTIAL|AUTH|CERT|API_?KEY|ACCESS_?KEY|(^|_)KEY($|_))/i;
/** Setting names written in some text ("SITE_NAME=Demo" gives SITE_NAME). Names only, at most six; never a value. */
export function settingNames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|[\s"'`;&|>(])(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out.slice(0, 6);
}
function settingsVerdict(file: string, names: string[]): Verdict {
  const base = basename(file);
  const secret = names.find((n) => SECRET_NAME.test(n));
  if (secret) return deny("settings", `${PRODUCT} does not write a key, token or password for you. Add the ${secret} line to ${base} yourself`);
  return ask("settings", `changes your private settings file (${base})${names.length ? `: ${names.join(", ")}` : ""}`, true);
}
const SETTINGS_NOT_READ = `your private settings file can hold keys, so it is not read here. Which settings a project needs is in its .env.example or its README; to add or change one, ${PRODUCT} asks you first`;
// Commands that only change a file (a settings file named to them is a write, which asks) and so are not "reading" it.
const WRITE_ONLY = new Set(["rm", "unlink", "shred", "truncate", "touch", "chmod", "chown", "chgrp", "ln", "tee", "sponge", "ed", "ex", "vi", "vim", "nvim", "nano", "emacs", "patch", "mv", "mkdir", "split", "csplit", "dd", "echo", "printf"]);
// Commands that only look for a file or count it, which shows nothing of what is inside (wc -l, not wc's words).
const LOOKS_ONLY = new Set(["ls", "stat", "test", "[", "[[", "wc", "du"]);
const COPIERS = new Set(["cp", "rsync", "ditto", "install", "scp"]);
const GIT_LOOKS = new Set(["check-ignore", "ls-files", "status", "check-attr"]);
// What a word on a command line may name: the word itself, a value after =, a file after @ (curl -d @file), or after a one letter flag (-T file).
const namedPaths = (a: string): string[] => [a, a.slice(a.indexOf("=") + 1), a.replace(/^@/, ""), a.replace(/^-[A-Za-z]@?/, ""), a.slice(a.indexOf("=") + 1).replace(/^@/, ""), a.replace(/^[^=]*=@?/, "")];
function namesSettingsFile(a: string, ctx: Context, cwd: string): boolean {
  for (const c of namedPaths(a)) {
    if (!c || c.startsWith("-") && c.length < 2) continue;
    if (/[*?[]/.test(c)) { if (globMayMatchSettings(c)) return true; continue; }
    const w = whereIs(ctx.project, c, cwd);
    if (w.inside && isSettingsFile(w.abs)) return true;
  }
  return false;
}
// Does this folder, or any folder under it, hold a private settings file? A bounded look that skips installed packages and git.
function holdsSettingsFile(dir: string): boolean {
  const todo = [dir]; let seen = 0;
  while (todo.length && seen < 5000) {
    const d = todo.pop()!;
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      seen++;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") todo.push(join(d, e.name)); }
      else if (isSettingsFile(e.name)) return true;
    }
  }
  return false;
}
/** A command that would read a private settings file: refused. (Writing one is a tap, see pathVerdict.) */
function settingsReadVerdict(name: string, args: string[], ctx: Context, cwd: string): Verdict | null {
  if (WRITE_ONLY.has(name) || LOOKS_ONLY.has(name)) return null;
  if ((name === "sed" || name === "yq" || name === "awk" || name === "gawk" || name === "perl") && args.some((a) => /^-[A-Za-z]*i/.test(a) || /^--in-?place/.test(a))) return null;   // an in place edit is a write
  const refuse = deny("settings", SETTINGS_NOT_READ);
  if (name === "git") { const sub = args.find((a) => !a.startsWith("-")) ?? ""; if (GIT_LOOKS.has(sub)) return null; }
  // A recursive search of the whole project reaches a settings file that no pattern names (grep does not skip hidden files).
  if (["grep", "egrep", "fgrep"].includes(name) && args.some((a) => /^-[A-Za-z]*[rR]/.test(a) || a === "--recursive" || a === "--dereference-recursive" || /^(-d|--directories)(=|$)/.test(a) && /recurse/.test(args.join(" ")))
      && !args.some((a, i) => /^--exclude(=|$)/.test(a) && /env/i.test(a.includes("=") ? a : args[i + 1] ?? ""))) {
    // Only where it would really reach one: the folders it searches (the current folder when none is named) hold a settings file.
    const dirs = args.filter((a) => !a.startsWith("-")).map((a) => whereIs(ctx.project, a, cwd)).filter((w) => w.inside || w.abs === resolveLinks(ctx.project)).map((w) => w.abs).filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } });
    if ((dirs.length ? dirs : [resolveLinks(cwd)]).some((d) => holdsSettingsFile(d))) return refuse;
  }
  if (["rg", "ag"].includes(name) && args.some((a) => a === "--hidden" || /^-u{2,}$/.test(a) || /^-[A-Za-z]*uu/.test(a) || a === "-H" && name === "ag")) return refuse;
  // --exclude=.env* names a pattern to skip, not a file to read.
  const named = args.filter((a) => !/^--(exclude|include|exclude-dir)(=|$)/.test(a));
  const rest = COPIERS.has(name) ? named.filter((a) => !a.startsWith("-")).slice(0, -1) : named;   // a copy's last word is where it goes, judged as a write
  return rest.some((a) => namesSettingsFile(a, ctx, cwd)) ? refuse : null;
}
/** The text a file tool puts in a file, for its setting names only. */
const writtenText = (input: Record<string, unknown>): string => [input.new_string, input.content, ...(Array.isArray(input.edits) ? input.edits.map((e: any) => e?.new_string) : [])].filter((x): x is string => typeof x === "string").join("\n");

const WRITE_TOOLS: Record<string, string> = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const READ_PATHS: Record<string, string> = { Read: "file_path", Grep: "path", Glob: "path", LS: "path", NotebookRead: "notebook_path" };
const SAFE_TOOLS = new Set(["TodoWrite", "WebSearch", "ExitPlanMode", "ToolSearch"]);
/** The Google tools (M21): their full names start with this, and these only read. */
const GOOGLE_PREFIX = "mcp__google__";
const GOOGLE_READS = new Set(["gmail_search", "gmail_read", "calendar_list", "calendar_free", "drive_search", "drive_read"]);
const WEB_SEARCH_OFF = `Web search is turned off for tasks in ${PRODUCT_S} Settings. Carry on without searching the web.`;

// Built in tools the pinned SDK (0.3.293) has that Companion never gives the engine (tools.ts lists what it does give). The
// engine is handed an exact list, so none of these should be asked for; if one is (an older or newer Claude, or the list
// not honoured), it is refused here with a plain reason, which Claude reads and the person never has to judge: before this,
// each one fell through to an approval card about an "unknown tool". A refusal only makes things stricter (rule 12).
const ASK_IN_WORDS = `${PRODUCT} does not let tasks ask questions in a pop up box. Do every part you can, then end your final message with one short question; the person answers it under the receipt.`;
const NOT_GIVEN_WHY = `${PRODUCT} does not let tasks use this. Carry on with what you have.`;
// A sub agent would run with no card for anything it does, and Agent can also start Claude in a git worktree written into
// the person's .git (rule 10), in a remote environment (the project leaves this Mac), or on a dearer model.
const NO_SUB_AGENTS = `${PRODUCT} does not let tasks hand work to helpers. Do the work yourself.`;
export const NOT_GIVEN: ReadonlyMap<string, string> = new Map<string, string>([
  ["AskUserQuestion", ASK_IN_WORDS],
  ["Agent", NO_SUB_AGENTS],
  ["Task", NO_SUB_AGENTS],
  ["EnterPlanMode", `${PRODUCT} does its own planning. Carry on with the task, or end your final message with one short question if you need the person to choose.`],
  ...[
    "Skill", "SlashCommand", "Monitor", "TaskCreate", "TaskGet", "TaskUpdate", "TaskList", "Workflow", "CronCreate", "CronDelete", "CronList",
    "ScheduleWakeup", "RemoteTrigger", "PushNotification", "EnterWorktree", "ExitWorktree", "ListMcpResourcesTool", "ReadMcpResourceTool",
    "ReadMcpResourceDirTool", "RefreshMcpTools", "SendFeedback", "ReportFindings", "ClaudeDesign", "ProposeSkills", "ProposeGoal", "OfferChromeSetup",
    "ReadNotifications", "ShowOnboardingRolePicker", "Artifact", "Projects", "SendUserMessage", "LSP", "EndConversation",
  ].map((t): [string, string] => [t, NOT_GIVEN_WHY]),
]);

const protectedWhy = (part: string): string => part.startsWith(".git") ? `${PRODUCT} does not let tasks change the project's .git folder or git settings` : `${PRODUCT_S} and Claude's own settings are not for a task to change`;

/** What the model is told when something is refused. The model repeats it to the person, so it is in everyday words, says
 *  who decided (never "blocked by a hook" or a rule's name), and asks for a plain answer that says what the person can do. */
export const refusal = (reason: string): string => `${reason.trim().startsWith(PRODUCT) ? "" : `${PRODUCT} does not allow this in a task: `}${reason.trim().replace(/\.+$/, "")}. Say so to the person in plain words, and tell them what they can do instead.`;

// Background commands, as the pinned SDK (0.3.293) names them. TaskStop stops one (KillShell and KillBash are its old names,
// which the SDK maps to it). Its output is read with the Read tool from Claude Code's own file, "<session>/tasks/<id>.output";
// the BashOutput and TaskOutput tools were removed, and are judged here the same way in case an older or newer Claude has them.
const STOP_SHELL = new Set(["TaskStop", "KillShell", "KillBash"]);
const READ_SHELL = new Set(["BashOutput", "TaskOutput"]);
const shellId = (input: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) if (typeof input[k] === "string" && input[k]) return input[k] as string;
  return null;
};
/** Is this file the output file of a background command this task started? Claude Code keeps it in its own temp folder
 *  (claudeTempRoot), exactly at "<project>/<session>/tasks/<id>.output". Nowhere else counts, and no part of the way from
 *  that folder to the file may be a link: the agent can make links with a script it runs without asking, and a link
 *  named like an output file must not reach a file outside the project. */
function startedOutput(file: string, ctx: Context): boolean {
  const s = ctx.started;
  if (!s || !isAbsolute(file)) return false;
  const n = resolve(file);
  const parts = n.split(sep).filter(Boolean);
  if (parts.length < 5) return false;
  const [slug, session, folder, name] = parts.slice(-4);
  if (folder !== "tasks" || !name.endsWith(".output") || !slug || !session || !s.shells.has(name.slice(0, -".output".length))) return false;
  const up = dirname(dirname(dirname(dirname(n))));
  const root = resolveLinks(ctx.claudeTemp ?? claudeTempRoot());
  // The folder above must be Claude's own (however it is spelled, "/tmp" or "/private/tmp"), and following every link
  // must land on the very same file below it.
  return resolveLinks(up) === root && resolveLinks(n) === join(root, slug, session, folder, name);
}

// What a yes "for the rest of this task" may cover: only asks whose repeat sends nothing, publishes nothing, runs nothing
// new and changes nothing a snapshot cannot undo. That is a file tool reading outside the project, and a file edit or read
// inside it that only a house rule asks about. Never a command (a script can change between runs, and git, installs and
// deploys are not repeat safe), never a web fetch, never any other tool (some send or publish), never a refusal.
const FILE_READ_TOOLS = new Set(Object.keys(READ_PATHS));
const FILE_EDIT_TOOLS = new Set(Object.keys(WRITE_TOOLS));
export function taskScopeCovers(call: ToolCall, v: Verdict, byHouseRule: boolean): boolean {
  if (v.decision !== "ask" || !v.undoable) return false;
  if (v.risk === "settings") return false;   // a settings file is its own tap every time
  if (FILE_READ_TOOLS.has(call.tool)) return v.risk === "outside_project" || byHouseRule;
  if (FILE_EDIT_TOOLS.has(call.tool)) return byHouseRule;
  return false;
}

export function evaluate(call: ToolCall, ctx: Context): Verdict {
  const { tool, input } = call;
  if (STOP_SHELL.has(tool) || READ_SHELL.has(tool)) {
    const id = shellId(input, STOP_SHELL.has(tool) ? ["task_id", "shell_id"] : ["bash_id", "task_id", "shell_id"]);
    const stopping = STOP_SHELL.has(tool);
    if (id && ctx.started?.shells.has(id)) return allow(stopping ? "stops a command this task started" : "reads a command this task started");
    // Reading another program's output changes nothing, so it is a read like any outside the project; stopping one is not.
    return stopping ? ask("irreversible", "This stops a program that this task did not start.", false) : ask("outside_project", "This reads the output of a program this task did not start.", true);
  }
  if (tool === "Read" && typeof input.file_path === "string" && startedOutput(input.file_path, ctx)) return allow("reads the output of a command this task started");
  if (tool in WRITE_TOOLS) {
    const p = input[WRITE_TOOLS[tool]] ?? input.file_path ?? input.path;
    if (typeof p !== "string" || !p) return deny("outside_project", "no file path given");
    const w = whereIs(ctx.project, p);
    if (w.protectedPart) return deny(w.protectedPart.startsWith(".git") ? "git" : "outside_project", protectedWhy(w.protectedPart));
    if (!w.inside) return deny("outside_project", "writes must stay inside the project folder");
    if (isSettingsFile(w.abs)) return settingsVerdict(w.abs, settingNames(writtenText(input)));
    return allow();
  }
  if (tool in READ_PATHS) {
    // Reading outside the project asks, for every way of reading.
    const p = input[READ_PATHS[tool]];
    if (tool === "Read" && typeof p !== "string") return ask("outside_project", "This read does not say which file it wants.", true);
    const candidates: string[] = [];
    if (typeof p === "string" && p) candidates.push(p);
    if (tool === "Glob" && typeof input.pattern === "string") {
      // The fixed part of a pattern can climb out of the project too ("../../**/.env", "~/x/*").
      const prefix = input.pattern.replace(/[*?[{].*$/, "");
      if (isAbsolute(prefix) || prefix.startsWith("~") || /(^|\/)\.\.(\/|$)/.test(prefix)) candidates.push(isAbsolute(prefix) || prefix.startsWith("~") ? (prefix || "/") : join(typeof p === "string" && p ? p : ".", prefix));
    }
    for (const q of candidates) { const w = whereIs(ctx.project, q); if (!w.inside && w.abs !== resolveLinks(ctx.project)) return ask("outside_project", "This reads a file outside your project folder.", true); }
    // A private settings file can hold keys, so no task reads one (which names exist is not what is in them: Glob and LS are fine).
    if (tool !== "Glob" && tool !== "LS" && typeof p === "string" && p && isSettingsFile(whereIs(ctx.project, p).abs)) return deny("settings", SETTINGS_NOT_READ);
    return allow();
  }
  if (tool === "WebFetch") {
    const url = String(input.url ?? "");
    if (!isSafeUrl(url)) return deny("network", "only public web pages may be opened, never this computer or a private network");
    const why = carriesData(url);
    if (why === "invalid") return deny("network", "that is not a web address");
    return why ? ask("network", why, false) : allow();
  }
  if (tool === "WebSearch" && ctx.webSearch === false) return deny("network", WEB_SEARCH_OFF);
  if (SAFE_TOOLS.has(tool)) return allow();
  const notGiven = NOT_GIVEN.get(tool);
  if (notGiven) return deny("irreversible", notGiven);
  // Google (M21, google/tools.ts): reading a connected account and making a Gmail draft run when the person asked for the
  // task; adding a calendar event, which can email the people invited, waits for a tap every time and is never covered for
  // the rest of a task (rule 13). Any other Google tool is unknown and asks.
  if (tool.startsWith(GOOGLE_PREFIX)) {
    const name = tool.slice(GOOGLE_PREFIX.length);
    if (GOOGLE_READS.has(name)) return allow("reads from a connected Google account");
    if (name === "gmail_draft") return { decision: "allow", reason: "makes a Gmail draft; nothing is sent", undoable: false };
    if (name === "calendar_create") return ask("network", "adds an event to your Google Calendar, and invites anyone it names", false);
    return ask("irreversible", `This uses a Google tool that has not been checked yet (${name}). It might send or change something.`, false);
  }
  if (tool === "Bash") {
    const cmd = input.command;
    if (typeof cmd !== "string") return ask("irreversible", "This command is empty, so there is nothing to check.", false);
    return evaluateBash(cmd, ctx);
  }
  return ask("irreversible", `This uses a tool that has not been checked yet (${tool}). It might send or change something.`, false);
}

// A piece of an address (split at every character that is not a letter or a digit) that reads like code rather than a
// word: letters and digits mixed, or a capital letter after the first one in a long piece (base64, a key). A word with a
// capital first letter ("Reference") is a word.
const codeLike = (t: string) => (/[0-9]/.test(t) && /[A-Za-z]/.test(t)) || (t.length >= 6 && /[a-z]/.test(t) && /^.+[A-Z]/.test(t));
/** Can data leave inside this web address? Returns the reason, "invalid", or null when it looks like an ordinary page. */
/** Launch check (15 Oct 2026, "a website that resolves to a private address could slip past the network check"): a web
 *  address whose name looks public but leads to this Mac or a private network (a name pointed home, DNS rebinding). The name
 *  is looked up once, every answer judged; any private answer refuses. Null when it leads only to public addresses, or
 *  when the name cannot be looked up in time (the fetch then fails on its own). A second lookup by the fetch could still
 *  answer differently; this closes the plain case, not every rebinding race. */
export const LOOKUP_MS = 3_000;
export async function leadsHome(url: string, lookup: (host: string) => Promise<string[]> = async (h) => (await dnsLookup(h, { all: true })).map((a) => a.address)): Promise<string | null> {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ""); } catch { return null; }
  if (!host || isIP(host)) return null;   // a number was already judged by isSafeUrl
  let addresses: string[];
  try { addresses = await Promise.race([lookup(host), new Promise<string[]>((_, no) => setTimeout(() => no(new Error("slow")), LOOKUP_MS))]); } catch { return null; }
  for (const a of addresses) { const why = privateReason(a); if (why) return `that address leads to ${why}, so it is not opened`; }
  return null;
}
/** The network verdict for a web address after its name was looked up: refused when it leads home, else the verdict as it was.
 *  A fetch that asks is not looked up yet: its name may be the very data that made it ask, and a lookup would send that
 *  name out before the person answered. It is looked up after a yes (agent.ts), and refused then if it leads home. */
export async function withLookup(v: Verdict, tool: string, input: Record<string, unknown>, lookup?: (host: string) => Promise<string[]>): Promise<Verdict> {
  if (tool !== "WebFetch" || v.decision !== "allow") return v;
  const why = await leadsHome(String(input.url ?? ""), lookup);
  return why ? deny("network", why) : v;
}

export function carriesData(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return "invalid"; }
  if (u.search.length > 1) return "this web address carries data in it";
  // Data can ride in the path and in the host name as well ("/aGVsbG8gc2VjcmV0", "/sk-ant/api03/...", "<data>.example.com"):
  // an unusually long address, a long code-like name before the site's own name, code-like pieces that add up to a long run
  // anywhere in it, or more free text in the path and names than a documentation page has, is not how a page is named.
  // Every piece is counted, however short and whatever it is cut by (a slash, a dot, a dash), so cutting or punctuating the
  // data differently does not hide it. Plain words under that limit still pass: a page name cannot be told from a sentence.
  const labels = u.hostname.split(".").slice(0, -2);
  const free = `${labels.join(".")}${u.pathname}`;
  const coded = free.split(/[^A-Za-z0-9]+/).filter(codeLike).reduce((n, t) => n + t.length, 0);
  if (url.length > 300 || free.length > 120 || coded >= 24 || labels.some((l) => l.length >= 20 && /[0-9]/.test(l) && /^[A-Za-z0-9-]+$/.test(l))) return "this web address looks like it carries data in it";
  return null;
}

/** Plan, Rescue and Research only look. Whatever the normal rules would ask about, they refuse (there is nobody to ask), and
 *  settings and key files inside the project are not read at all. */
export function evaluateReadOnly(call: ToolCall, ctx: Context): Verdict {
  const v = evaluate(call, ctx);
  if (v.decision === "deny") return v;
  if (v.decision === "ask") return deny(v.risk ?? "outside_project", `${v.reason.replace(/\.+$/, "")}. This part of ${PRODUCT} only looks inside your project`);
  const target = call.input.file_path ?? call.input.notebook_path;
  if ((call.tool === "Read" || call.tool === "NotebookRead") && typeof target === "string") {
    const w = whereIs(ctx.project, target);
    if (isEnvFile(target) || isEnvFile(w.abs)) return deny("outside_project", "settings and key files are not read here");
  }
  return v;
}

// ---------- shell commands ----------

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
// Reasons shared by several checks. They reach the approval card and Claude's refusal message, so they are plain sentences.
const SCRIPT = "This runs a script. What a script does can't be checked first.";
const INLINE = "This runs code typed into the command itself, which can't be checked first.";
const LISTED = "This reads a list of files from somewhere else, and that list can't be checked first.";
const INLINE_CODE: Record<string, RegExp> = {
  python: /^-[A-Za-z]*c/, python2: /^-[A-Za-z]*c/, python3: /^-[A-Za-z]*c/, node: /^(-e|-p|--eval|--print|-pe)$/, nodejs: /^(-e|-p|--eval)$/, deno: /^(eval)$/, bun: /^(-e|--eval)$/,
  ruby: /^-[A-Za-z]*e/, perl: /^-[A-Za-z]*[eE]/, php: /^-r$/, osascript: /^-e$/, lua: /^-e$/, Rscript: /^-e$/, swift: /^-e$/,
  // awk programs can run commands and write files: `system("...")`, `"cmd" | getline`, `print > "file"`.
  awk: /system\s*\(|\|\s*getline|getline\s*<|"\s*\|\s*"|\bprint[^;}]*>/, gawk: /system\s*\(|\|\s*getline|getline\s*<|\bprint[^;}]*>/,
};
// Also here: looking at the screen (rule 5: only on the person's own key press), searching the whole Mac, timers that run
// later, disk tools. None of these is needed to build a project.
const SYSTEM_TOOLS = new Set(["screencapture", "mdfind", "mdls", "tmutil", "crontab", "at", "atq", "atrm", "hdiutil", "dtrace", "fs_usage", "newfs_hfs", "newfs_apfs", "newfs_msdos", "security", "launchctl", "csrutil", "spctl", "tccutil", "dscl", "sysadminctl", "systemsetup", "networksetup", "pmset", "nvram", "diskutil", "kextload", "kextunload", "dseditgroup"]);
const ACCOUNT_AND_NETWORK_TOOLS = new Set(["aws", "gcloud", "gsutil", "az", "terraform", "tofu", "pulumi", "kubectl", "helm", "doctl", "stripe", "eas", "ibmcloud", "oci", "ansible", "vagrant", "mysql", "mariadb", "mysqldump", "pg_dump", "pg_restore", "pg_dumpall", "redis-cli", "mongosh", "mongo", "mongodump", "mongorestore", "psql", "ssh", "scp", "sftp", "rsync", "nc", "ncat", "netcat", "telnet", "ftp", "tailscale", "ngrok", "open", "say", "pbpaste", "pbcopy", "afplay", "ping", "nslookup", "dig", "host", "traceroute", "whois"]);
const DOCKER_READ = new Set(["ps", "images", "logs", "inspect", "version", "info", "stats", "top", "port", "history", "search", "ls", "--version", "-v"]);
// Words that make a command with dynamic parts (like $(...)) too risky to guess.
const DANGEROUS_WORDS = new Set(["rm", "rmdir", "mv", "cp", "ln", "tee", "dd", "chmod", "chown", "chgrp", "truncate", "find", "xargs", "rsync", "git", "curl", "wget", "sh", "bash", "zsh", "dash", "ksh", "eval", "python", "python3", "node", "perl", "ruby", "php", "security", "osascript", "open", "npm", "npx", "pnpm", "yarn", "bun", "vercel", "wrangler", "gh", "docker", "kubectl", "aws", "gcloud", "terraform", "psql", "mysql", "ssh", "scp", "sudo", "su", "install", "touch", "mkdir", "tar", "unzip", "sed", "launchctl", "defaults"]);
// Commands that write to the files named in their arguments.
const WRITERS: Record<string, { all?: boolean; flags?: string[] }> = {
  cp: { all: true, flags: ["-t", "--target-directory"] }, mv: { all: true, flags: ["-t", "--target-directory"] }, ln: { all: true }, install: { all: true, flags: ["-t"] }, rsync: { all: true },
  sponge: { all: true }, ex: { all: true }, vi: { all: true }, vim: { all: true }, nvim: { all: true }, ed: { all: true }, nano: { all: true }, emacs: { all: true }, patch: { all: true }, touch: { all: true }, mkdir: { all: true }, chmod: { all: true }, chown: { all: true }, chgrp: { all: true }, truncate: { all: true }, tee: { all: true }, rm: { all: true }, rmdir: { all: true }, unlink: { all: true }, shred: { all: true },
  ditto: { all: true }, unzip: { flags: ["-d"] }, curl: { flags: ["-o", "--output", "--output-dir"] }, wget: { flags: ["-O", "-P", "--output-document", "--directory-prefix"] }, sort: { flags: ["-o"] }, tar: { flags: ["-C", "--directory"] },
};

// Does a path written in a command land outside the project (or in a place agents may not write)?
function pathVerdict(arg: string, ctx: Context, cwd: string): Verdict | null {
  if (!arg || arg === "-" || /^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) return null;
  if (arg.startsWith("~")) return deny("outside_project", `${arg} is outside the project`);
  if (/^\/dev\/(null|stdout|stderr|tty|zero)$/.test(arg)) return null;
  const w = whereIs(ctx.project, arg, cwd);
  if (w.protectedPart) return deny(w.protectedPart.startsWith(".git") ? "git" : "outside_project", protectedWhy(w.protectedPart));
  if (!w.inside) return deny("outside_project", `${arg} is outside the project`);
  if (isSettingsFile(w.abs) || globMayMatchSettings(arg)) return ask("settings", `changes your private settings file (${isSettingsFile(w.abs) ? basename(w.abs) : ".env"})`, true);
  return null;
}

// sed can write files itself: `w file` and `W file` as commands, and the w flag of s///. They name files the command line does not.
function sedWriteTargets(args: string[]): string[] {
  const programs: string[] = [];
  let usedE = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "-e" || a === "--expression") && args[i + 1] !== undefined) { programs.push(args[++i]); usedE = true; }
    else if (a.startsWith("--expression=")) { programs.push(a.slice(13)); usedE = true; }
    else if (a.startsWith("-") && a !== "-") continue;
    else if (!usedE && programs.length === 0) programs.push(a);
  }
  const out: string[] = [];
  for (const p of programs) {
    for (const m of p.matchAll(/\/[gpiIme0-9]*w\s*([^\s;}]+)/g)) out.push(m[1]);
    for (const m of p.matchAll(/(?:^|[;{}\n])\s*(?:[0-9$]+|\/[^/]*\/)?\s*[wW]\s*([^\s;}]+)/g)) out.push(m[1]);
  }
  return out.filter((t) => !/^\/dev\/(stdout|stderr|null)$/.test(t));
}
// Could a pattern like .e* or .env? name a private settings file? (A leading * or ? never matches a leading dot, as in a shell.)
function globMayMatchSettings(arg: string): boolean {
  const b = basename(arg);
  if (!/[*?[]/.test(b)) return false;
  let re: RegExp;
  try { re = new RegExp(`^${b.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`); } catch { return true; }
  const dotted = [".env", ".env.local", ".env.production", ".env.development.local"];
  const names = /^[*?[]/.test(b) ? (/env/i.test(b) ? ["x.env", "prod.env"] : []) : dotted;
  return names.some((n) => re.test(n));
}

function evaluateBash(cmd: string, ctx: Context): Verdict {
  // $'...' quoting is read the way the shell reads it (shell.ts), so what it would hide is judged below. Its escapes can still
  // spell a word no reader sees ($'\x63at'), so such a line never runs without a tap, here or inside sh -c, eval or env -S.
  let out = [cmd, ...nestedStrings(cmd)].some(hasAnsiQuote) ? ask("irreversible", "This command uses a kind of quoting that can't be fully checked first.", false) : allow();
  const commands = commandsOf(cmd);
  const dynamic = hasDynamic(cmd);
  if (commands.some((w) => w[0] === "<too deep>")) return ask("irreversible", "This command is too tangled to check first.", false);

  // Walk the commands in order, keeping track of where `cd` has moved to. Leaving the project is not allowed.
  let cwd = ctx.project;
  for (const words of commands) {
    const name = basename(words[0]);
    if (name === "cd" || name === "pushd") {
      const target = words.slice(1).find((a) => !a.startsWith("-"));
      if (!target || target === "-" || target.startsWith("~") || target.includes("$")) return deny("outside_project", "moving out of the project folder is not allowed");
      const w = whereIs(ctx.project, target, cwd);
      if (!w.inside && w.abs !== resolveLinks(ctx.project)) return deny("outside_project", "moving out of the project folder is not allowed");
      cwd = w.abs;
      continue;
    }
    out = worst(out, evaluateCommand(words, ctx, cwd));
  }
  const gitEnv = gitEnvVerdict(cmd, ctx);
  if (gitEnv) out = worst(out, gitEnv);
  // Where input is read from with <: reading outside the project asks, whatever the command (the Read tool always did).
  for (const t of inputTargets(cmd)) {
    if (t.includes("$") || t.includes("`")) { out = worst(out, ask("outside_project", "This command decides while it runs which files to read, so it can't be checked first.", true)); continue; }
    const w = whereIs(ctx.project, t, cwd);
    if (!w.inside && w.abs !== resolveLinks(ctx.project)) out = worst(out, ask("outside_project", `${t} is outside your project folder.`, true));
    else if (isSettingsFile(w.abs)) out = worst(out, deny("settings", SETTINGS_NOT_READ));
  }
  // Where output is written with > and >>.
  // Also the redirects written inside nested shells (`sh -c "echo x >> .env"`), whose quotes hide them from a scan of the outer line.
  for (const t of [...redirectTargets(cmd), ...nestedStrings(cmd).flatMap((n) => redirectTargets(n))]) {
    if (t.includes("$") || t.includes("`")) { out = worst(out, ask("irreversible", "This command decides while it runs where to save, so it can't be checked first.", false)); continue; }
    const v = pathVerdict(t, ctx, cwd);
    if (v) out = worst(out, v);
  }
  // A write to a settings file names the settings in the command (never the values), and refuses a key, token or password.
  if (out.decision === "ask" && out.risk === "settings") {
    const names = settingNames(cmd);
    const secret = names.find((n) => SECRET_NAME.test(n));
    out = secret ? deny("settings", `${PRODUCT} does not write a key, token or password for you. Add the ${secret} line to your settings file yourself`) : names.length ? { ...out, reason: `${out.reason}: ${names.join(", ")}` } : out;
  }
  // Last, so a specific reason (like "git push") is shown in preference to this general one.
  if (dynamic && out.decision === "allow" && commands.some((w) => w.some((x) => DANGEROUS_WORDS.has(basename(x))))) out = ask("irreversible", "This command puts itself together while it runs, so it can't be checked first.", false);
  return out;
}

function evaluateCommand(words: string[], ctx: Context, cwd: string): Verdict {
  // Reading a private settings file is judged first, whatever else the command is: some command families return early below.
  const secretRead = words.length ? settingsReadVerdict(basename(words[0]), words.slice(1), ctx, cwd) : null;
  const v = evaluateCommandBody(words, ctx, cwd);
  return secretRead ? worst(v, secretRead) : v;
}
function evaluateCommandBody(words: string[], ctx: Context, cwd: string): Verdict {
  const name = basename(words[0]);
  const args = words.slice(1);
  if (words[0].includes("$") || words[0].startsWith("`")) return ask("irreversible", "This command's name is decided while it runs, so it can't be checked first.", false);
  if (["sudo", "doas", "su"].includes(name)) return deny("install", "commands may not use administrator rights");
  if (name === "screencapture") return deny("irreversible", "commands may not look at your screen; only your own key press does");
  if (name.startsWith("mkfs")) return deny("irreversible", "this would erase a disk");
  if (["kill", "killall", "pkill"].includes(name)) return ask("irreversible", "this stops programs running on your Mac", false);
  if (SYSTEM_TOOLS.has(name) || (name === "defaults" && ["write", "delete", "import", "rename"].includes(args[0] ?? ""))) return deny("irreversible", "this changes your Mac's settings or reads its secrets");
  // Reading the Mac's settings of other apps is reading outside the project.
  if (name === "defaults" && ["read", "export", "find", "read-type", "domains"].includes(args[0] ?? "")) return ask("outside_project", "this reads your Mac's settings, outside the project", true);
  // cpio reads the files it is handed on its input, which cannot be checked here.
  if (name === "cpio" && args.some((a) => /^-[A-Za-z]*[op]/.test(a) || a === "--create" || a === "--pass-through")) return ask("outside_project", "This copies whatever files it is given, and that list can't be checked first.", true);
  if (SHELLS.has(name) || name === "source" || name === ".") return ask("irreversible", SCRIPT, false);
  if (words[0].endsWith(".sh") || words[0].endsWith(".bash") || words[0].endsWith(".zsh")) return ask("irreversible", SCRIPT, false);
  if (name === "xargs") {
    const rest = (() => { const w = [...args]; while (w.length && w[0].startsWith("-")) { const o = w.shift()!; if (["-I", "-n", "-P", "-s", "-L", "-d", "-E"].includes(o) && w.length) w.shift(); } return w; })();
    const inner = unwrap(rest).words;
    if (!inner.length || DANGEROUS_WORDS.has(basename(inner[0]))) return ask("irreversible", "This runs another command on many files at once.", false);
    return allow();
  }
  if (name === "find") return evaluateFind(args, ctx, cwd);
  if (name === "git") return evaluateGit(args, ctx, cwd);
  if (name === "mv" || name === "rm" || name === "rmdir" || name === "unlink" || name === "shred") { const r = evaluateRm(args, ctx, cwd); if (r.decision !== "allow") return r; }
  // npx, bunx, pnpx, "npm exec" and "pnpm dlx" run another program: judge that program.
  if (["npx", "bunx", "pnpx"].includes(name) || (["npm", "pnpm", "yarn", "bun"].includes(name) && ["exec", "dlx", "x"].includes(args[0] ?? ""))) {
    const rest = ["npx", "bunx", "pnpx"].includes(name) ? args : args.slice(1);
    const i = rest.findIndex((x) => !x.startsWith("-"));
    if (i >= 0) return evaluateCommand(unwrap(rest.slice(i)).words.length ? unwrap(rest.slice(i)).words : rest.slice(i), ctx, cwd);
    return allow();
  }
  if (name === "bun" && args.some((a) => /^(-e|--eval|-p|--print)$/.test(a))) return ask("irreversible", INLINE, false);
  // node with no file to run reads its code from the input (a here document, a pipe): code nobody can check here. node --test and --version are fine.
  if ((name === "node" || name === "nodejs") && !args.some((a) => !a.startsWith("-") && !a.startsWith("<") && !a.startsWith(">")) && !args.some((a) => /^(-v|--version|-h|--help|-c|--check|--test.*)$/.test(a))) return ask("irreversible", INLINE, false);
  if (["npm", "pnpm", "yarn", "bun"].includes(name)) return evaluatePackageManager(name, args);
  if (["brew", "port", "apt", "apt-get", "gem", "pip", "pip3", "cargo"].includes(name)) {
    // Outside the project, so Undo cannot take these back (technical_research section 6). These tools take flags before the
    // subcommand (brew --verbose install, apt -y install, cargo -q install), so the subcommand is looked for among all the
    // words before a "--", never only the first. A word that merely matches (cargo test install) asks once too many, which is safe.
    const before = args.indexOf("--") >= 0 ? args.slice(0, args.indexOf("--")) : args;
    if (before.some((a) => ["install", "upgrade", "uninstall", "remove", "tap", "untap", "update"].includes(a)) && !(name === "pip" || name === "pip3" || name === "cargo")) return ask("install", "This changes software installed on your Mac, not just your project.", false);
    // cargo install and uninstall write the tool into ~/.cargo/bin, for the whole Mac and outside every snapshot.
    if (name === "cargo" && before.some((a) => a === "install" || a === "uninstall")) return ask("install", "This installs a tool for your whole Mac, not just this project.", false);
    if ((name === "pip" || name === "pip3") && args[0] === "install" && !args.includes("--target") && !process.env.VIRTUAL_ENV) return ask("install", "This installs Python packages for your whole Mac, not just this project.", false);
    return allow();
  }
  if (["wrangler", "vercel", "netlify", "firebase", "fly", "flyctl", "railway", "heroku", "supabase", "prisma", "gh"].includes(name)) return evaluateService(name, args);
  if (name === "docker" || name === "podman") return DOCKER_READ.has(args.find((a) => !a.startsWith("-")) ?? "") ? allow() : ask("irreversible", "This changes Docker containers, or sends images to another computer.", false);
  if (ACCOUNT_AND_NETWORK_TOOLS.has(name)) return ask(name === "open" ? "irreversible" : "network", `${name} reaches outside your project`, false);
  let out: Verdict = allow();
  if (name === "curl" || name === "wget") out = evaluateCurl(args);
  // Commands that write: every path they name must stay in the project.
  const writer = WRITERS[name] ?? ((name === "sed" && args.some((a) => /^-[A-Za-z]*i/.test(a) || /^--in-place/.test(a))) || (name === "yq" && args.some((a) => /^-[A-Za-z]*i/.test(a) || /^--inplace/.test(a))) || ((name === "awk" || name === "gawk") && args.some((a, k) => /^--inplace|^-i(nplace)?$/.test(a) && (a !== "-i" || args[k + 1] === "inplace"))) ? { all: true } : name === "perl" && args.some((a) => /^-[A-Za-z]*i/.test(a)) ? { all: true } : name === "dd" ? {} : undefined);
  if (writer) {
    const paths: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (name === "dd" && a.startsWith("of=")) paths.push(a.slice(3));
      else if (writer.flags?.includes(a) && args[i + 1] !== undefined) { paths.push(args[i + 1]); i++; }
      else if (writer.flags?.some((f) => f.startsWith("--") && a.startsWith(`${f}=`))) paths.push(a.slice(a.indexOf("=") + 1));
      else if (writer.all && !a.startsWith("-")) paths.push(a);
    }
    // Reading an archive from somewhere else is fine; making one somewhere else is not.
    const tarReads = name === "tar" && args.some((a) => /^-?[A-Za-z]*x[A-Za-z]*$/.test(a)) && !args.some((a) => /^-?[A-Za-z]*c[A-Za-z]*$/.test(a));
    for (const p of paths) { const v = pathVerdict(p, ctx, cwd); if (v) out = worst(out, v); }
    void tarReads;
  }
  // split and csplit write files named after their last argument (the prefix); what they read is judged as a read.
  if (name === "split" || name === "csplit") { const pos = args.filter((a) => !a.startsWith("-")); if (pos.length >= 2) { const v = pathVerdict(pos[pos.length - 1], ctx, cwd); if (v) out = worst(out, v); } }
  if (name === "sed") for (const t of sedWriteTargets(args)) { const v = pathVerdict(t, ctx, cwd); if (v) out = worst(out, v); }
  // Programs that read files: any file outside the project asks first (the Read tool always did).
  const reads = readerVerdict(name, args, ctx, cwd) ?? archiveReads(name, args, ctx, cwd);
  if (reads) out = worst(out, reads);
  // Archives: where the archive is written is a write, wherever its contents come from.
  const archive = archiveOutput(name, args);
  if (archive) { const v = pathVerdict(archive, ctx, cwd); if (v) out = worst(out, v); }
  // A program that is handed code to run can do anything that code says.
  const inline = INLINE_CODE[name.replace(/\.[0-9]+$/, "")];
  if (inline && args.some((a) => inline.test(a))) out = worst(out, ask("irreversible", INLINE, false));
  return out;
}

// Programs that print or search what is in files. Their file arguments are judged like the Read tool's.
const READERS = new Set(["cat", "head", "tail", "less", "more", "grep", "egrep", "fgrep", "rg", "ag", "ls", "wc", "sort", "uniq", "cut", "diff", "cmp", "file", "stat", "du", "tree", "xxd", "hexdump", "od", "strings", "nl", "tac", "rev", "fold", "column", "bat", "jq", "yq", "sed", "awk", "gawk", "mawk", "base64", "shasum", "md5", "md5sum", "sha256sum", "cksum", "sqlite3", "realpath", "readlink", "zcat", "gzcat", "bzcat", "nm", "otool", "split", "iconv", "openssl"]);
const PATTERN_FIRST = new Set(["grep", "egrep", "fgrep", "rg", "ag", "sed", "awk", "gawk", "mawk", "jq", "yq"]);   // their first argument is a pattern or a program, not a file
const looksOutside = (a: string) => a.startsWith("/") || a.startsWith("~") || a.startsWith("$HOME") || a.startsWith("${HOME}") || a === ".." || a.startsWith("../") || a.includes("/../");
function readerVerdict(name: string, args: string[], ctx: Context, cwd: string): Verdict | null {
  if (!READERS.has(name)) return null;
  const given = args.some((a) => a === "-e" || a === "-f" || a.startsWith("--regexp") || a.startsWith("--file"));
  let skipped = !PATTERN_FIRST.has(name) || given;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (PATTERN_FIRST.has(name) && (a === "-e" || a === "--regexp" || a === "-f" || a === "--file")) { i++; continue; }   // the next word is the pattern
    if (a.startsWith("-") && a !== "-") continue;
    if (!skipped) { skipped = true; continue; }
    if (!looksOutside(a) || /^\/dev\/(null|stdin|stdout|stderr|tty|zero|urandom)$/.test(a)) continue;
    const w = whereIs(ctx.project, a, cwd);
    if (!w.inside && w.abs !== resolveLinks(ctx.project)) return ask("outside_project", `${a} is outside your project folder.`, true);
  }
  return null;
}

// Archive and compression tools read the files they are given: tar's and zip's sources, the archive tar, unzip and the
// decompressors open, dd's if=, plutil's files. Reading outside the project asks, as for the readers above.
const COMPRESSORS = new Set(["gzip", "gunzip", "bzip2", "bunzip2", "xz", "unxz", "lzma", "unlzma", "zstd", "unzstd", "lz4", "compress", "uncompress", "brotli", "plutil", "7z", "7za", "rar", "unrar", "ar"]);
const VALUE_FLAGS: Record<string, Set<string>> = { tar: new Set(["-C", "--directory", "-T", "--files-from", "-X", "--exclude-from", "--exclude"]), zip: new Set(["-x", "-i", "-b", "-n", "-t", "-tt"]), unzip: new Set(["-d", "-x"]) };
function archiveReads(name: string, args: string[], ctx: Context, cwd: string): Verdict | null {
  const reads: string[] = [];
  if (name === "dd") for (const a of args) if (a.startsWith("if=")) reads.push(a.slice(3));
  const isTar = name === "tar" || name === "bsdtar" || name === "gtar";
  if (isTar || name === "zip" || name === "unzip" || COMPRESSORS.has(name)) {
    const takes = VALUE_FLAGS[isTar ? "tar" : name] ?? new Set<string>();
    // Files named in a list (tar -T or --files-from, zip -@ from its input) cannot be checked before they are read, as for
    // cpio. When tar only unpacks, -T names what to take out of the archive, so only the list itself is read.
    const creating = isTar && (args.some((a) => /^-?[A-Za-z]*[cru][A-Za-z]*$/.test(a) && !a.startsWith("--")) || args.some((a) => ["--create", "--append", "--update"].includes(a)));
    if (isTar && creating && args.some((a) => a === "--files-from" || a.startsWith("--files-from=") || (/^-[A-Za-z]*T/.test(a) && !a.startsWith("--")))) return ask("outside_project", LISTED, true);
    if (name === "zip" && args.includes("-@")) return ask("outside_project", LISTED, true);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (isTar && (a === "-T" || a === "--files-from")) { if (args[i + 1] !== undefined) reads.push(args[i + 1]); i++; continue; }
      if (isTar && a.startsWith("--files-from=")) { reads.push(a.slice(13)); continue; }
      if (isTar && a.startsWith("@") && a.length > 1) { reads.push(a.slice(1)); continue; }   // another archive whose contents are copied in
      if (name === "zip" && /^-[ix]@./.test(a)) { reads.push(a.slice(3)); continue; }          // the list of names to take or leave
      if (takes.has(a)) { i++; continue; }
      if (a.startsWith("--") && a.includes("=")) { const v = a.slice(a.indexOf("=") + 1); if (a.startsWith("--file=")) reads.push(v); continue; }
      if (a.startsWith("-") && a !== "-") continue;
      reads.push(a);
    }
    // tar's -f names the archive: written when it makes one (archiveOutput judges that), read otherwise. Its value is a word
    // after the flags, so it is in the list above already.
  }
  for (const r of reads) {
    if (!looksOutside(r) || /^\/dev\/(null|stdin|zero|urandom)$/.test(r)) continue;
    const w = whereIs(ctx.project, r, cwd);
    if (!w.inside && w.abs !== resolveLinks(ctx.project)) return ask("outside_project", `${r} is outside your project folder.`, true);
  }
  return null;
}

/** Where an archive command writes its archive (tar -f, zip's first name), when it makes one. */
function archiveOutput(name: string, args: string[]): string | null {
  if (name === "zip") return args.find((a) => !a.startsWith("-")) ?? null;
  if (name !== "tar") return null;
  const creating = args.some((a) => /^-?[A-Za-z]*[cru][A-Za-z]*$/.test(a) && !a.startsWith("--")) || args.includes("--create");
  if (!creating) return null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--file=")) return a.slice(7);
    if (a === "--file" || (/^-?[A-Za-z]*f[A-Za-z]*$/.test(a) && !a.startsWith("--"))) return args[i + 1] ?? null;
  }
  return null;
}

function evaluateFind(args: string[], ctx: Context, cwd: string): Verdict {
  const roots: string[] = [];
  for (const a of args) { if (a.startsWith("-") || a === "(" || a === "!") break; roots.push(a); }
  const risky = args.some((a) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(a));
  if (!risky) return allow();
  for (const r of roots) { const v = pathVerdict(r, ctx, cwd); if (v) return v; }
  return ask("irreversible", "This can delete files, or run a command on every file it finds.", false);
}

// A folder given to git that is outside the project (or worked out while the command runs, or under ~).
function gitElsewhere(v: string | undefined, ctx: Context, cwd: string): boolean {
  if (v === undefined || v === "") return false;
  if (v.includes("$") || v.includes("`") || v.startsWith("~")) return true;
  const w = whereIs(ctx.project, v, cwd);
  return !w.inside && w.abs !== resolveLinks(ctx.project);
}
// Not undoable: what a git command does in another folder is outside every snapshot of this project (M45).
const OTHER_FOLDER = ask("outside_project", "This points Git at a folder outside your project.", false);

// git's own environment variables do what its options do. Those naming a folder or a file of git's (GIT_DIR and the like)
// are judged like -C and --git-dir; those that make git run a program or read other settings ask like -c. They are looked
// for in every word of the line, inside sh -c text too, before VAR=value prefixes and env are peeled off.
const GIT_PLACE_VARS = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE"]);
const GIT_PROGRAM_VARS = /^GIT_(?:EXTERNAL_DIFF|SSH|SSH_COMMAND|PAGER|EDITOR|SEQUENCE_EDITOR|ASKPASS|EXEC_PATH|PROXY_COMMAND|CONFIG|CONFIG_GLOBAL|CONFIG_SYSTEM|CONFIG_COUNT|CONFIG_PARAMETERS|CONFIG_KEY_\d+|CONFIG_VALUE_\d+|TEMPLATE_DIR|ALLOW_PROTOCOL)$/;
function gitEnvVerdict(cmd: string, ctx: Context, depth = 0): Verdict | null {
  if (depth > 4) return null;
  for (const words of parseShell(cmd)) {
    for (const w of words) {
      const m = /^(GIT_[A-Z0-9_]+)=([\s\S]*)$/.exec(w);
      if (m && GIT_PLACE_VARS.has(m[1])) {
        // Several folders may be listed, as GIT_ALTERNATE_OBJECT_DIRECTORIES does.
        if (m[2].split(":").some((v) => gitElsewhere(v, ctx, ctx.project))) return OTHER_FOLDER;
      } else if (m && GIT_PROGRAM_VARS.test(m[1])) return ask("git", "This changes how Git behaves for one command, and that can run another program.", false);
      else if (/\s/.test(w) && w !== cmd) { const v = gitEnvVerdict(w, ctx, depth + 1); if (v) return v; }
    }
  }
  return null;
}

function evaluateGit(args: string[], ctx: Context, cwd: string = ctx.project): Verdict {
  let i = 0;
  // git pointed at another folder (-C, --git-dir, --work-tree) reads that folder's history and files, which is reading
  // outside the project: it asks, as any other way of reading does.
  const elsewhere = (v: string | undefined) => gitElsewhere(v, ctx, cwd);
  while (i < args.length) {
    const a = args[i];
    // Global options that make git run a program or behave differently for one command: -c core.fsmonitor=..., --exec-path=...
    if (a === "-c" || a.startsWith("--config-env") || a.startsWith("--exec-path")) return ask("git", "This changes how Git behaves for one command, and that can run another program.", false);
    if (a === "-C" || a === "--git-dir" || a === "--work-tree") { if (elsewhere(args[i + 1])) return OTHER_FOLDER; i += 2; continue; }
    if (a.startsWith("--git-dir=") || a.startsWith("--work-tree=")) { if (elsewhere(a.slice(a.indexOf("=") + 1))) return OTHER_FOLDER; i += 1; continue; }
    if (GIT_VALUE_OPTS.has(a)) { i += 2; continue; }
    if (a.startsWith("-")) { i += 1; continue; }
    break;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return allow();
  const flags = rest.filter((a) => a.startsWith("-"));
  // Options that write to a file or run a program, whatever the command: --output=file, --upload-pack=..., --ext-diff.
  // git grep -O (--open-files-in-pager) runs the program it names on the files it finds.
  if (flags.some((f) => f === "--output" || f.startsWith("--output=") || f.startsWith("--upload-pack") || f.startsWith("--receive-pack") || f === "--ext-diff" || f.startsWith("--exec") || /^-O/.test(f) || f.startsWith("--open-files-in-pager"))) return ask("git", "this makes git write to a file or run a program", false);
  const positional = rest.filter((a) => !a.startsWith("-"));
  // A file named to a reading command (diff --no-index, blame, show, log, grep) outside the project is read like any other.
  if (["diff", "blame", "show", "log", "grep", "whatchanged", "shortlog", "annotate"].includes(sub)) {
    for (const p of positional) {
      if (!looksOutside(p)) continue;
      const w = whereIs(ctx.project, homeSpelling(p), cwd);
      if (!w.inside && w.abs !== resolveLinks(ctx.project)) return ask("outside_project", `${p} is outside your project folder.`, true);
    }
  }
  // Undo never touches .git (rule 10), so no change to the person's git is ever undoable.
  const mutates = (reason: string): Verdict => ask("git", reason, false);

  // A commit the person asked for runs without a card, and still lands in the receipt's "Cannot be undone" list.
  if (ctx.userAskedCommit && (sub === "add" || sub === "commit")) return allow("the user asked for a commit in this task", false);
  switch (sub) {
    // The command itself is on the card under "What will happen", so the reason does not repeat it in machine words.
    case "push": return mutates("This sends your work to another computer.");
    case "status": case "diff": case "log": case "show": case "blame": case "grep": case "ls-files": case "ls-tree": case "rev-parse":
    case "describe": case "shortlog": case "check-ignore": case "check-attr": case "cat-file": case "fetch": case "whatchanged": case "show-ref": case "diff-tree": case "rev-list":
      return allow();
    case "reflog": return rest.some((a) => ["expire", "delete"].includes(a)) ? mutates("This deletes Git's saved history.") : allow();
    case "remote": return rest.some((a) => ["add", "remove", "rm", "rename", "set-url", "prune", "set-head"].includes(a)) ? mutates("This changes where Git sends your work.") : allow();
    case "branch": {
      const write = flags.some((f) => /^(-d|-D|-m|-M|-c|-C|-f|-u|--delete|--move|--copy|--force|--set-upstream-to|--unset-upstream|--edit-description)/.test(f));
      return write || positional.length > 0 ? mutates("This changes your Git branches.") : allow();
    }
    case "tag": return flags.some((f) => /^(-d|-a|-s|-f|-m|--delete|--annotate|--sign|--force)/.test(f)) || (positional.length > 0 && !flags.some((f) => /^(-l|--list)/.test(f))) ? mutates("This changes your Git tags.") : allow();
    case "stash": return ["list", "show"].includes(rest[0] ?? "") ? allow() : mutates("This changes work Git has set aside.");
    case "config": return rest.some((a) => ["--get", "--get-all", "--list", "-l", "--get-regexp"].includes(a)) ? allow() : mutates("This changes your Git settings.");
    default: return mutates("This changes your project's Git history.");
  }
}

// Hidden things a wildcard would reach if it starts with a dot: .git, and ".." (the folder above).
function globReachesHidden(arg: string): boolean {
  if (!/[*?[]/.test(arg)) return false;
  const last = arg.split("/").pop() ?? arg;
  if (!last.startsWith(".")) return false;                          // a wildcard that does not start with a dot never matches hidden names
  const re = new RegExp("^" + last.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  return [".git", "..", ".claude", ".companion"].some((n) => re.test(n));
}

function evaluateRm(args: string[], ctx: Context, cwd: string): Verdict {
  for (const a of args) {
    if (a.startsWith("-")) continue;
    if (/^\$|^\$\{|^~/.test(a) || a.includes("$HOME") || a.includes("${HOME}")) return deny("outside_project", `${a} is outside the project`);
    if (globReachesHidden(a)) return deny("git", "a pattern like that could reach your .git folder or the folder above");
    if (a === "/" || a === "..") return deny("outside_project", `${a} is outside the project`);
    const v = pathVerdict(a, ctx, cwd);
    if (v) return v;
  }
  return allow();
}

function evaluatePackageManager(name: string, args: string[]): Verdict {
  const sub = args.find((a) => !a.startsWith("-")) ?? "";
  const global = args.some((a) => a === "-g" || a === "--global" || a === "--global=true" || a === "--location=global" || (a === "--location" && args[args.indexOf(a) + 1] === "global")) || (name === "yarn" && sub === "global");
  if (global && !["list", "ls", "view", "info", "outdated", "bin", "root", "prefix"].includes(sub)) return ask("install", "This installs a tool for your whole Mac, not just this project.", false);
  if (sub === "publish" || (name === "yarn" && sub === "npm" && args.includes("publish"))) return ask("irreversible", "publishing a package cannot be undone", false);
  if (["unpublish", "login", "adduser", "logout", "token", "owner", "access", "dist-tag", "deprecate", "profile", "team", "star", "unstar", "set", "trust"].includes(sub)) return ask("irreversible", `${name} ${sub} changes your account or your published packages`, false);
  if (sub === "config" && ["set", "delete", "edit"].includes(args.filter((a) => !a.startsWith("-"))[1] ?? "")) return ask("irreversible", "This changes package manager settings for your whole Mac.", false);
  // A version bump makes a git commit and a tag in a git project (npm, pnpm, yarn version; bun pm version), unless it is
  // told not to.
  const bumps = sub === "version" || (name === "bun" && sub === "pm" && args.includes("version"));
  // The package manager reads its flags in order and the last one wins, so only a last word that turns git off counts.
  let tags = true;
  for (const a of args) {
    if (a === "--git-tag-version") tags = true;
    else if (a.startsWith("--git-tag-version=")) tags = a.slice(18) !== "false";
    else if (a === "--no-git-tag-version") tags = false;
    else if (a.startsWith("--no-git-tag-version=")) tags = a.slice(21) === "false";
  }
  if (bumps && tags) return ask("git", `${name} version makes a git commit and a tag in your project`, false);
  return allow();
}

function evaluateService(name: string, args: string[]): Verdict {
  const sub = args.find((a) => !a.startsWith("-")) ?? "";
  const sub2 = args.filter((a) => !a.startsWith("-"))[1] ?? "";
  const irreversible = (why: string) => ask("irreversible", why, false);
  switch (name) {
    case "wrangler": return ["dev", "whoami", "types", "init", "login", "docs"].includes(sub) ? allow() : irreversible("deploys or changes your live site");
    case "vercel": return ["dev", "build", "whoami", "list", "ls", "inspect", "logs"].includes(sub) ? allow() : irreversible("deploys or changes your live site");
    case "netlify": return ["dev", "build", "status", "open", "watch"].includes(sub) ? allow() : irreversible("deploys or changes your live site");
    case "firebase": case "fly": case "flyctl": case "railway": case "heroku":
      return ["deploy", "launch", "up", "release", "destroy", "delete", "scale"].includes(sub) ? irreversible("deploys or changes your live app") : allow();
    case "supabase": return sub === "db" && ["push", "reset", "remote"].includes(sub2) || ["functions", "secrets", "projects"].includes(sub) && ["deploy", "set", "delete"].includes(sub2) ? irreversible("changes your live database") : allow();
    case "prisma": return sub === "migrate" && ["deploy", "reset"].includes(sub2) || sub === "db" && ["push", "execute"].includes(sub2) ? irreversible("changes your database") : allow();
    case "gh": return ["view", "list", "status", "diff", "checks", "browse"].includes(sub2) || ["status", "auth"].includes(sub) ? allow() : irreversible("changes something on GitHub");
  }
  return allow();
}

function evaluateCurl(args: string[]): Verdict {
  const mutating = args.some((a, i) =>
    /^(-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|-T|--upload-file|--json)(=|$)/.test(a) || /^-d./.test(a) ||
    ((a === "-X" || a === "--request") && /^(POST|PUT|DELETE|PATCH)$/i.test(args[i + 1] ?? "")) || /^(-X|--request=)(POST|PUT|DELETE|PATCH)$/i.test(a));
  if (mutating) return ask("network", "sends data to another computer", false);
  // A plain GET can carry data out in its address, exactly like a web page fetch does.
  for (const a of args) { if (/^https?:\/\//i.test(a)) { const why = carriesData(a); if (why) return ask("network", why === "invalid" ? "that is not a web address" : why, false); } }
  return allow();
}

const GIT_VALUE_OPTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--exec-path"]);

// ---------- the environment agents run in ----------

// Account switching and code injection: none of these may reach Claude Code or anything it starts.
const STRIP_EXACT = new Set(["AWS_BEARER_TOKEN_BEDROCK", "NODE_OPTIONS", "BASH_ENV", "ENV", "LD_PRELOAD", "LD_LIBRARY_PATH", "PYTHONSTARTUP", "RUBYOPT", "PERL5OPT"]);
const STRIP_PREFIX = ["ANTHROPIC_", "CLAUDE_CODE_USE_", "CLAUDE_CODE_OAUTH", "CLAUDE_CODE_SKIP_", "CLAUDE_CODE_API_KEY", "DYLD_"];
const stripped = (k: string) => STRIP_EXACT.has(k) || STRIP_PREFIX.some((p) => k.startsWith(p));

// `configDir` (API key route only): Claude Code's own folder, where it keeps saved conversations and file history.
// The plan route takes none: there that folder decides which Keychain entry holds the person's login (T03).
export type Route = { route: "api_key"; apiKey?: string; configDir?: string } | { route: "plan" };

// The environment for Claude Code: the user's variables, minus anything that could
// switch accounts, plus our own. The key comes only from the Keychain, never the shell.
export function buildChildEnv(parent: Record<string, string | undefined>, r: Route): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(parent)) if (v !== undefined && !stripped(k)) e[k] = v;
  if (r.route === "api_key") {
    if (!r.apiKey) throw new Error("The API key route needs a key from the Keychain");
    e.ANTHROPIC_API_KEY = r.apiKey;
    // A folder set on purpose (a test, or the person's own shell) is kept. The default ~/.claude is never named
    // explicitly, because naming it picks a different Keychain entry than leaving it unset.
    const home = parent.HOME || homedir();
    if (!e.CLAUDE_CONFIG_DIR && r.configDir && isAbsolute(r.configDir) && resolve(r.configDir) !== resolve(home, ".claude")) e.CLAUDE_CONFIG_DIR = r.configDir;
  }
  e.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1";   // commands Claude Code starts never see the key
  e.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";    // memory stays in files the user can read
  e.DISABLE_UPDATES = "1";                    // the shipped binary never updates itself
  return e;
}

export const HOME = homedir();
