// Safety lives here, in code, not in prompts (rule 12). Every tool call an agent
// makes is judged before it runs: allow, ask the user (an approval card), or deny.
// Conservative on purpose: when unsure, ask.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type Risk = "irreversible" | "git" | "outside_project" | "install" | "network";
export type Verdict = { decision: "allow" | "ask" | "deny"; risk?: Risk; reason: string; undoable: boolean };
export type ToolCall = { tool: string; input: Record<string, unknown> };
export type Context = { project: string; userAskedCommit?: boolean };

const allow = (reason = "ok"): Verdict => ({ decision: "allow", reason, undoable: true });
const ask = (risk: Risk, reason: string, undoable = true): Verdict => ({ decision: "ask", risk, reason, undoable });
const deny = (risk: Risk, reason: string): Verdict => ({ decision: "deny", risk, reason, undoable: true });
const rank = { allow: 0, ask: 1, deny: 2 } as const;
const worst = (a: Verdict, b: Verdict): Verdict => (rank[b.decision] > rank[a.decision] ? b : a);

// ---------- paths ----------

// Resolve through symlinks even when the file does not exist yet.
function realish(p: string): string {
  let cur = resolve(p);
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const up = dirname(cur);
    if (up === cur) break;
    tail.unshift(basename(cur));
    cur = up;
  }
  let real = cur;
  try { real = realpathSync(cur); } catch { /* keep */ }
  return join(real, ...tail);
}

function insideProject(project: string, file: string): { inside: boolean; inGit: boolean } {
  const root = realish(project);
  const abs = realish(isAbsolute(file) ? file : join(project, file));
  const rel = relative(root, abs);
  const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  return { inside, inGit: inside && rel.split(sep)[0] === ".git" };
}

const WRITE_TOOLS: Record<string, string> = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const SAFE_TOOLS = new Set(["Glob", "Grep", "LS", "TodoWrite", "Task", "WebSearch", "WebFetch", "NotebookRead", "Agent", "ExitPlanMode"]);

export function evaluate(call: ToolCall, ctx: Context): Verdict {
  const { tool, input } = call;
  if (tool in WRITE_TOOLS) {
    const p = input[WRITE_TOOLS[tool]] ?? input.file_path ?? input.path;
    if (typeof p !== "string" || !p) return deny("outside_project", "no file path given");
    const { inside, inGit } = insideProject(ctx.project, p);
    if (inGit) return deny("git", "agents never write the project's .git folder");
    if (!inside) return deny("outside_project", "writes must stay inside the project folder");
    return allow();
  }
  if (tool === "Read") {
    const p = input.file_path;
    if (typeof p !== "string") return ask("outside_project", "no file path given");
    return insideProject(ctx.project, p).inside ? allow() : ask("outside_project", "reading outside the project");
  }
  if (SAFE_TOOLS.has(tool)) return allow();
  if (tool === "Bash") {
    const cmd = input.command;
    if (typeof cmd !== "string") return ask("irreversible", "no command given");
    return evaluateBash(cmd, ctx, 0);
  }
  return ask("irreversible", `unknown tool "${tool}"`);
}

// ---------- shell commands ----------

// Split a command line into commands and words. Quote aware; `$(...)`, backticks,
// subshells and pipes all start a new command, even inside double quotes.
function parseShell(cmd: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = "";
  let has = false;
  let q: "" | "'" | '"' = "";
  const endWord = () => { if (has) words.push(word); word = ""; has = false; };
  const endCmd = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ""; else { word += c; has = true; } continue; }
    if (c === "$" && cmd[i + 1] === "(") { word += "$("; has = true; endCmd(); i++; continue; }
    if (c === "`") { endCmd(); continue; }
    if (q === '"') {
      if (c === '"') q = ""; else if (c === "\\" && i + 1 < cmd.length) { word += cmd[++i]; } else word += c;
      has = true; continue;
    }
    if (c === "'" || c === '"') { q = c; has = true; continue; }
    if (c === "\\" && i + 1 < cmd.length) { word += cmd[++i]; has = true; continue; }
    if (/\s/.test(c) && c !== "\n") { endWord(); continue; }
    if (c === "\n" || c === ";" || c === "|" || c === "&" || c === "(" || c === ")" || c === "{" || c === "}") { endCmd(); continue; }
    word += c; has = true;
  }
  endCmd();
  return commands.map((w) => w.map((x) => x.replace(/^\$\($/, "")).filter((x) => x.length > 0));
}

const WRAPPERS = new Set(["env", "command", "time", "nice", "nohup", "exec", "builtin", "stdbuf", "xargs", "then", "do", "else", "if", "while", "!"]);
const GIT_VALUE_OPTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--exec-path"]);

function evaluateBash(cmd: string, ctx: Context, depth: number): Verdict {
  if (depth > 4) return ask("irreversible", "command nests too deeply to check");
  let out = allow();
  for (const words of parseShell(cmd)) out = worst(out, evaluateCommand(words, ctx, depth));
  return out;
}

function evaluateCommand(words: string[], ctx: Context, depth: number): Verdict {
  let w = [...words];
  // strip VAR=value prefixes and wrappers like env, command, time
  while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || WRAPPERS.has(w[0]) || (w[0].startsWith("-") && w.length > 1))) w.shift();
  if (!w.length) return allow();
  const name = basename(w[0]);
  const args = w.slice(1);

  if (["sudo", "doas", "su"].includes(name)) return deny("install", "commands may not use administrator rights");
  if (["sh", "bash", "zsh", "dash", "ksh"].includes(name)) {
    const i = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    if (i >= 0 && args[i + 1] !== undefined) return evaluateBash(args[i + 1], ctx, depth + 1);
    return ask("irreversible", "a shell script we cannot read");
  }
  if (name === "eval") return evaluateBash(args.join(" "), ctx, depth + 1);
  if (name === "git") return evaluateGit(args, ctx);
  if (name === "rm" || name === "rmdir" || name === "unlink" || name === "mv" || name === "shred") return evaluateRm(args, ctx);
  // npx, bunx, pnpx, "npm exec" and "pnpm dlx" run another program: judge that program.
  if (["npx", "bunx", "pnpx"].includes(name) || (["npm", "pnpm", "yarn", "bun"].includes(name) && ["exec", "dlx", "x"].includes(args[0] ?? ""))) {
    const rest = ["npx", "bunx", "pnpx"].includes(name) ? args : args.slice(1);
    const i = rest.findIndex((x) => !x.startsWith("-"));
    if (i >= 0) return evaluateCommand(rest.slice(i), ctx, depth + 1);
    return allow();
  }
  if (["npm", "pnpm", "yarn", "bun"].includes(name)) return evaluatePackageManager(name, args);
  if (["brew", "port", "apt", "apt-get", "gem", "pip", "pip3", "cargo"].includes(name)) {
    if (["install", "upgrade", "uninstall", "remove", "tap", "untap", "update"].includes(args[0] ?? "") && !(name === "pip" || name === "pip3" || name === "cargo")) return ask("install", `${name} ${args[0]} changes your Mac`);
    if ((name === "pip" || name === "pip3") && args[0] === "install" && !args.includes("--target") && !process.env.VIRTUAL_ENV) return ask("install", "pip install may change your Mac");
    return allow();
  }
  if (["wrangler", "vercel", "netlify", "firebase", "fly", "flyctl", "railway", "heroku", "supabase", "prisma", "gh", "psql"].includes(name)) return evaluateService(name, args);
  if (name === "curl" || name === "wget") return evaluateCurl(args);
  return allow();
}

function evaluateGit(args: string[], ctx: Context): Verdict {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (GIT_VALUE_OPTS.has(a)) { i += 2; continue; }
    if (a.startsWith("-")) { i += 1; continue; }
    break;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!sub) return allow();
  const flags = rest.filter((a) => a.startsWith("-"));
  const positional = rest.filter((a) => !a.startsWith("-"));
  const mutates = (reason: string, undoable = true): Verdict => ask("git", reason, undoable);

  if (ctx.userAskedCommit && (sub === "add" || sub === "commit")) return allow("the user asked for a commit in this task");
  switch (sub) {
    case "push": return mutates("git push sends your work to a remote", false);
    case "status": case "diff": case "log": case "show": case "blame": case "grep": case "ls-files": case "ls-tree": case "rev-parse":
    case "describe": case "shortlog": case "reflog": case "cat-file": case "fetch": case "whatchanged": case "show-ref": case "diff-tree": case "rev-list":
      return allow();
    case "remote": return rest.some((a) => ["add", "remove", "rm", "rename", "set-url", "prune", "set-head"].includes(a)) ? mutates("changes remotes") : allow();
    case "branch": {
      const write = flags.some((f) => /^(-d|-D|-m|-M|-c|-C|-f|-u|--delete|--move|--copy|--force|--set-upstream-to|--unset-upstream|--edit-description)/.test(f));
      return write || positional.length > 0 ? mutates("changes branches") : allow();
    }
    case "tag": return flags.some((f) => /^(-d|-a|-s|-f|-m|--delete|--annotate|--sign|--force)/.test(f)) || (positional.length > 0 && !flags.some((f) => /^(-l|--list)/.test(f))) ? mutates("changes tags") : allow();
    case "stash": return ["list", "show"].includes(rest[0] ?? "") ? allow() : mutates("changes the stash");
    case "config": return rest.some((a) => ["--get", "--get-all", "--list", "-l", "--get-regexp"].includes(a)) ? allow() : mutates("changes git settings");
    default: return mutates(`git ${sub} changes your repository`);
  }
}

function expandsOutside(arg: string, ctx: Context): boolean {
  if (/^\$|^\$\{|^~/.test(arg) || arg.includes("$HOME") || arg.includes("${HOME}")) return true;       // home or unknown variable
  if (arg === "/" || arg === "." || arg === "..") return arg !== "." ? true : false;
  const target = isAbsolute(arg) ? arg : join(ctx.project, arg);
  return !insideProject(ctx.project, target).inside;
}

function evaluateRm(args: string[], ctx: Context): Verdict {
  for (const a of args) {
    if (a.startsWith("-")) continue;
    if (expandsOutside(a, ctx)) return deny("outside_project", `${a} is outside the project`);
    if (insideProject(ctx.project, isAbsolute(a) ? a : join(ctx.project, a)).inGit) return deny("git", "never touch the project's .git folder");
  }
  return allow();
}

function evaluatePackageManager(name: string, args: string[]): Verdict {
  const sub = args.find((a) => !a.startsWith("-")) ?? "";
  const global = args.some((a) => a === "-g" || a === "--global") || (name === "yarn" && sub === "global");
  if (global && ["install", "i", "add", "global", "update", "upgrade", "uninstall", "remove", "link"].includes(sub)) return ask("install", "a global install changes your Mac");
  if (sub === "publish" || (name === "yarn" && sub === "npm" && args.includes("publish"))) return ask("irreversible", "publishing a package cannot be undone", false);
  return allow();
}

function evaluateService(name: string, args: string[]): Verdict {
  const sub = args.find((a) => !a.startsWith("-")) ?? "";
  const sub2 = args.filter((a) => !a.startsWith("-"))[1] ?? "";
  const irreversible = (why: string) => ask("irreversible", why, false);
  switch (name) {
    case "wrangler": return ["deploy", "publish", "delete", "rollback", "secret"].includes(sub) ? irreversible("deploys or changes your live site") : allow();
    case "vercel": return ["dev", "build", "whoami", "list", "ls", "inspect", "logs"].includes(sub) ? allow() : irreversible("deploys or changes your live site");
    case "netlify": return ["dev", "build", "status", "open", "watch"].includes(sub) ? allow() : irreversible("deploys or changes your live site");
    case "firebase": case "fly": case "flyctl": case "railway": case "heroku":
      return ["deploy", "launch", "up", "release", "destroy", "delete", "scale"].includes(sub) ? irreversible("deploys or changes your live app") : allow();
    case "supabase": return sub === "db" && ["push", "reset", "remote"].includes(sub2) || ["functions", "secrets", "projects"].includes(sub) && ["deploy", "set", "delete"].includes(sub2) ? irreversible("changes your live database") : allow();
    case "prisma": return sub === "migrate" && ["deploy", "reset"].includes(sub2) || sub === "db" && ["push", "execute"].includes(sub2) ? irreversible("changes your database") : allow();
    case "gh": return ["view", "list", "status", "diff", "checks", "browse"].includes(sub2) || ["status", "auth"].includes(sub) ? allow() : irreversible("changes something on GitHub");
    case "psql": {
      const text = args.join(" ");
      let url: string | undefined;
      for (const t of args) if (/^postgres(ql)?:\/\//i.test(t)) { try { url = new URL(t).hostname || "localhost"; } catch { url = "unparsed"; } }
      void text;
      const hostFlag = args.findIndex((a) => a === "-h" || a === "--host");
      const host = url ?? (hostFlag >= 0 ? args[hostFlag + 1] : undefined) ?? args.find((a) => a.startsWith("--host="))?.slice(7);
      if (!host || ["localhost", "127.0.0.1", "::1"].includes(host) || host.startsWith("/")) return allow();
      return irreversible("talks to a database that is not on your Mac");
    }
  }
  return allow();
}

function evaluateCurl(args: string[]): Verdict {
  const mutating = args.some((a, i) =>
    /^(-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|-T|--upload-file|--json)(=|$)/.test(a) || /^-d./.test(a) ||
    ((a === "-X" || a === "--request") && /^(POST|PUT|DELETE|PATCH)$/i.test(args[i + 1] ?? "")) || /^(-X|--request=)(POST|PUT|DELETE|PATCH)$/i.test(a));
  return mutating ? ask("network", "sends data to another computer", false) : allow();
}

// ---------- the environment agents run in ----------

const STRIP = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_CUSTOM_HEADERS", "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_VERTEX_PROJECT_ID",
  "ANTHROPIC_VERTEX_BASE_URL", "CLAUDE_CODE_SKIP_BEDROCK_AUTH", "CLAUDE_CODE_SKIP_VERTEX_AUTH",
];

export type Route = { route: "api_key"; apiKey?: string } | { route: "plan" };

// The environment for Claude Code: the user's variables, minus anything that could
// switch accounts, plus our own. The key comes only from the Keychain, never the shell.
export function buildChildEnv(parent: Record<string, string | undefined>, r: Route): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(parent)) if (v !== undefined && !STRIP.includes(k)) e[k] = v;
  if (r.route === "api_key") {
    if (!r.apiKey) throw new Error("The API key route needs a key from the Keychain");
    e.ANTHROPIC_API_KEY = r.apiKey;
  }
  e.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1";   // commands Claude Code starts never see the key
  e.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";    // memory stays in files the user can read
  e.DISABLE_UPDATES = "1";                    // the shipped binary never updates itself
  return e;
}

export const HOME = homedir();
