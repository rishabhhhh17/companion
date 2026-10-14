// Safety lives here, in code, not in prompts (rule 12). Every tool call an agent
// makes is judged before it runs: allow, ask the user (an approval card), or deny.
// Conservative on purpose: when unsure, ask.

import { lstatSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { commandsOf, hasDynamic, redirectTargets, unwrap } from "./shell.ts";
import { isSafeUrl } from "./research.ts";

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
const PROTECTED = new Set([".git", ".claude", ".companion"]);

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

const WRITE_TOOLS: Record<string, string> = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const READ_PATHS: Record<string, string> = { Read: "file_path", Grep: "path", Glob: "path", LS: "path", NotebookRead: "notebook_path" };
const SAFE_TOOLS = new Set(["TodoWrite", "Task", "WebSearch", "Agent", "ExitPlanMode", "ToolSearch"]);

const protectedWhy = (part: string): string => part.startsWith(".git") ? "agents never write the project's .git folder or git settings" : "Companion's and Claude's own settings are not for the agent to change";

export function evaluate(call: ToolCall, ctx: Context): Verdict {
  const { tool, input } = call;
  if (tool in WRITE_TOOLS) {
    const p = input[WRITE_TOOLS[tool]] ?? input.file_path ?? input.path;
    if (typeof p !== "string" || !p) return deny("outside_project", "no file path given");
    const w = whereIs(ctx.project, p);
    if (w.protectedPart) return deny(w.protectedPart.startsWith(".git") ? "git" : "outside_project", protectedWhy(w.protectedPart));
    if (!w.inside) return deny("outside_project", "writes must stay inside the project folder");
    return allow();
  }
  if (tool in READ_PATHS) {
    // Reading outside the project asks, for every way of reading.
    const p = input[READ_PATHS[tool]];
    if (tool === "Read" && typeof p !== "string") return ask("outside_project", "no file path given");
    const pattern = tool === "Glob" && typeof input.pattern === "string" && isAbsolute(input.pattern) ? input.pattern : undefined;
    const candidates: string[] = [];
    if (typeof p === "string" && p) candidates.push(p);
    if (pattern) candidates.push(pattern.replace(/[*?[].*$/, "") || "/");
    for (const q of candidates) { const w = whereIs(ctx.project, q); if (!w.inside && w.abs !== resolveLinks(ctx.project)) return ask("outside_project", "reading outside the project"); }
    return allow();
  }
  if (tool === "WebFetch") {
    const url = String(input.url ?? "");
    if (!isSafeUrl(url)) return deny("network", "only public web pages may be opened, never this computer or a private network");
    try {
      const u = new URL(url);
      if (u.search.length > 1) return ask("network", "this web address carries data in it", false);
      // Data can ride in the path as well ("/aGVsbG8gc2VjcmV0"): an unusually long address, or a long run of code-like
      // letters in one part of it, is not how a documentation page is named.
      if (url.length > 300 || u.pathname.split("/").some((part) => part.length >= 40 && /^[A-Za-z0-9+_=%-]+$/.test(part) && /[0-9]/.test(part) && /[A-Za-z]/.test(part))) return ask("network", "this web address looks like it carries data in it", false);
    } catch { return deny("network", "that is not a web address"); }
    return allow();
  }
  if (SAFE_TOOLS.has(tool)) return allow();
  if (tool === "Bash") {
    const cmd = input.command;
    if (typeof cmd !== "string") return ask("irreversible", "no command given");
    return evaluateBash(cmd, ctx);
  }
  return ask("irreversible", `unknown tool "${tool}"`);
}

// ---------- shell commands ----------

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const INLINE_CODE: Record<string, RegExp> = {
  python: /^-[A-Za-z]*c/, python2: /^-[A-Za-z]*c/, python3: /^-[A-Za-z]*c/, node: /^(-e|-p|--eval|--print|-pe)$/, nodejs: /^(-e|-p|--eval)$/, deno: /^(eval)$/, bun: /^(-e|--eval)$/,
  ruby: /^-[A-Za-z]*e/, perl: /^-[A-Za-z]*[eE]/, php: /^-r$/, osascript: /^-e$/, lua: /^-e$/, Rscript: /^-e$/, swift: /^-e$/, awk: /^$never/,
};
// Also here: looking at the screen (rule 5: only on the person's own key press), searching the whole Mac, timers that run
// later, disk tools. None of these is needed to build a project.
const SYSTEM_TOOLS = new Set(["screencapture", "mdfind", "mdls", "tmutil", "crontab", "at", "atq", "atrm", "hdiutil", "dtrace", "fs_usage", "newfs_hfs", "newfs_apfs", "newfs_msdos", "security", "launchctl", "csrutil", "spctl", "tccutil", "dscl", "sysadminctl", "systemsetup", "networksetup", "pmset", "nvram", "diskutil", "kextload", "kextunload", "dseditgroup"]);
const ACCOUNT_AND_NETWORK_TOOLS = new Set(["aws", "gcloud", "gsutil", "az", "terraform", "tofu", "pulumi", "kubectl", "helm", "doctl", "stripe", "eas", "ibmcloud", "oci", "ansible", "vagrant", "mysql", "mariadb", "mysqldump", "pg_dump", "pg_restore", "pg_dumpall", "redis-cli", "mongosh", "mongo", "mongodump", "mongorestore", "psql", "ssh", "scp", "sftp", "rsync", "nc", "ncat", "netcat", "telnet", "ftp", "tailscale", "ngrok", "open", "say", "pbpaste", "pbcopy", "afplay"]);
const DOCKER_READ = new Set(["ps", "images", "logs", "inspect", "version", "info", "stats", "top", "port", "history", "search", "ls", "--version", "-v"]);
// Words that make a command with dynamic parts (like $(...)) too risky to guess.
const DANGEROUS_WORDS = new Set(["rm", "rmdir", "mv", "cp", "ln", "tee", "dd", "chmod", "chown", "chgrp", "truncate", "find", "xargs", "rsync", "git", "curl", "wget", "sh", "bash", "zsh", "dash", "ksh", "eval", "python", "python3", "node", "perl", "ruby", "php", "security", "osascript", "open", "npm", "npx", "pnpm", "yarn", "bun", "vercel", "wrangler", "gh", "docker", "kubectl", "aws", "gcloud", "terraform", "psql", "mysql", "ssh", "scp", "sudo", "su", "install", "touch", "mkdir", "tar", "unzip", "sed", "launchctl", "defaults"]);
// Commands that write to the files named in their arguments.
const WRITERS: Record<string, { all?: boolean; flags?: string[] }> = {
  cp: { all: true, flags: ["-t", "--target-directory"] }, mv: { all: true, flags: ["-t", "--target-directory"] }, ln: { all: true }, install: { all: true, flags: ["-t"] }, rsync: { all: true },
  touch: { all: true }, mkdir: { all: true }, chmod: { all: true }, chown: { all: true }, chgrp: { all: true }, truncate: { all: true }, tee: { all: true }, rm: { all: true }, rmdir: { all: true }, unlink: { all: true }, shred: { all: true },
  unzip: { flags: ["-d"] }, curl: { flags: ["-o", "--output", "--output-dir"] }, wget: { flags: ["-O", "-P", "--output-document", "--directory-prefix"] }, sort: { flags: ["-o"] }, tar: { flags: ["-C", "--directory"] },
};

// Does a path written in a command land outside the project (or in a place agents may not write)?
function pathVerdict(arg: string, ctx: Context, cwd: string): Verdict | null {
  if (!arg || arg === "-" || /^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) return null;
  if (arg.startsWith("~")) return deny("outside_project", `${arg} is outside the project`);
  if (/^\/dev\/(null|stdout|stderr|tty|zero)$/.test(arg)) return null;
  const w = whereIs(ctx.project, arg, cwd);
  if (w.protectedPart) return deny(w.protectedPart.startsWith(".git") ? "git" : "outside_project", protectedWhy(w.protectedPart));
  if (!w.inside) return deny("outside_project", `${arg} is outside the project`);
  return null;
}

function evaluateBash(cmd: string, ctx: Context): Verdict {
  let out = allow();
  const commands = commandsOf(cmd);
  const dynamic = hasDynamic(cmd);
  if (commands.some((w) => w[0] === "<too deep>")) return ask("irreversible", "command nests too deeply to check");

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
  // Where output is written with > and >>.
  for (const t of redirectTargets(cmd)) {
    if (t.includes("$") || t.includes("`")) { out = worst(out, ask("irreversible", "this command writes to a place it works out while it runs")); continue; }
    const v = pathVerdict(t, ctx, cwd);
    if (v) out = worst(out, v);
  }
  // Last, so a specific reason (like "git push") is shown in preference to this general one.
  if (dynamic && out.decision === "allow" && commands.some((w) => w.some((x) => DANGEROUS_WORDS.has(basename(x))))) out = ask("irreversible", "this command builds part of itself while it runs, so I cannot check it");
  return out;
}

function evaluateCommand(words: string[], ctx: Context, cwd: string): Verdict {
  const name = basename(words[0]);
  const args = words.slice(1);
  if (words[0].includes("$") || words[0].startsWith("`")) return ask("irreversible", "the command is worked out while it runs, so I cannot check it");
  if (["sudo", "doas", "su"].includes(name)) return deny("install", "commands may not use administrator rights");
  if (name === "screencapture") return deny("irreversible", "commands may not look at your screen; only your own key press does");
  if (name.startsWith("mkfs")) return deny("irreversible", "this would erase a disk");
  if (["kill", "killall", "pkill"].includes(name)) return ask("irreversible", "this stops programs running on your Mac", false);
  if (SYSTEM_TOOLS.has(name) || (name === "defaults" && ["write", "delete", "import", "rename"].includes(args[0] ?? ""))) return deny("irreversible", "this changes your Mac's settings or reads its secrets");
  if (SHELLS.has(name) || name === "source" || name === ".") return ask("irreversible", "a script I cannot read");
  if (words[0].endsWith(".sh") || words[0].endsWith(".bash") || words[0].endsWith(".zsh")) return ask("irreversible", "a script I cannot read");
  if (name === "xargs") {
    const rest = (() => { const w = [...args]; while (w.length && w[0].startsWith("-")) { const o = w.shift()!; if (["-I", "-n", "-P", "-s", "-L", "-d", "-E"].includes(o) && w.length) w.shift(); } return w; })();
    const inner = unwrap(rest).words;
    if (!inner.length || DANGEROUS_WORDS.has(basename(inner[0]))) return ask("irreversible", "xargs runs another command on many things at once");
    return allow();
  }
  if (name === "find") return evaluateFind(args, ctx, cwd);
  if (name === "git") return evaluateGit(args, ctx);
  if (name === "mv" || name === "rm" || name === "rmdir" || name === "unlink" || name === "shred") { const r = evaluateRm(args, ctx, cwd); if (r.decision !== "allow") return r; }
  // npx, bunx, pnpx, "npm exec" and "pnpm dlx" run another program: judge that program.
  if (["npx", "bunx", "pnpx"].includes(name) || (["npm", "pnpm", "yarn", "bun"].includes(name) && ["exec", "dlx", "x"].includes(args[0] ?? ""))) {
    const rest = ["npx", "bunx", "pnpx"].includes(name) ? args : args.slice(1);
    const i = rest.findIndex((x) => !x.startsWith("-"));
    if (i >= 0) return evaluateCommand(unwrap(rest.slice(i)).words.length ? unwrap(rest.slice(i)).words : rest.slice(i), ctx, cwd);
    return allow();
  }
  if (["npm", "pnpm", "yarn", "bun"].includes(name)) return evaluatePackageManager(name, args);
  if (["brew", "port", "apt", "apt-get", "gem", "pip", "pip3", "cargo"].includes(name)) {
    if (["install", "upgrade", "uninstall", "remove", "tap", "untap", "update"].includes(args[0] ?? "") && !(name === "pip" || name === "pip3" || name === "cargo")) return ask("install", `${name} ${args[0]} changes your Mac`);
    if ((name === "pip" || name === "pip3") && args[0] === "install" && !args.includes("--target") && !process.env.VIRTUAL_ENV) return ask("install", "pip install may change your Mac");
    return allow();
  }
  if (["wrangler", "vercel", "netlify", "firebase", "fly", "flyctl", "railway", "heroku", "supabase", "prisma", "gh"].includes(name)) return evaluateService(name, args);
  if (name === "docker" || name === "podman") return DOCKER_READ.has(args.find((a) => !a.startsWith("-")) ?? "") ? allow() : ask("irreversible", `${name} changes containers or sends images away`, false);
  if (ACCOUNT_AND_NETWORK_TOOLS.has(name)) return ask(name === "open" ? "irreversible" : "network", `${name} reaches outside your project`, false);
  let out: Verdict = allow();
  if (name === "curl" || name === "wget") out = evaluateCurl(args);
  // Commands that write: every path they name must stay in the project.
  const writer = WRITERS[name] ?? (name === "sed" && args.some((a) => /^-[A-Za-z]*i/.test(a)) ? { all: true } : name === "perl" && args.some((a) => /^-[A-Za-z]*i/.test(a)) ? { all: true } : name === "dd" ? {} : undefined);
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
  // A program that is handed code to run can do anything that code says.
  const inline = INLINE_CODE[name.replace(/\.[0-9]+$/, "")];
  if (inline && args.some((a) => inline.test(a))) out = worst(out, ask("irreversible", `${name} would run code I cannot check`));
  return out;
}

function evaluateFind(args: string[], ctx: Context, cwd: string): Verdict {
  const roots: string[] = [];
  for (const a of args) { if (a.startsWith("-") || a === "(" || a === "!") break; roots.push(a); }
  const risky = args.some((a) => ["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"].includes(a));
  if (!risky) return allow();
  for (const r of roots) { const v = pathVerdict(r, ctx, cwd); if (v) return v; }
  return ask("irreversible", "find can delete things or run commands on everything it finds");
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
  if (global && !["list", "ls", "view", "info", "outdated", "bin", "root", "prefix"].includes(sub)) return ask("install", "a global install changes your Mac");
  if (sub === "publish" || (name === "yarn" && sub === "npm" && args.includes("publish"))) return ask("irreversible", "publishing a package cannot be undone", false);
  if (["unpublish", "login", "adduser", "logout", "token", "owner", "access", "dist-tag", "deprecate", "profile", "team", "star", "unstar", "set", "trust"].includes(sub)) return ask("irreversible", `${name} ${sub} changes your account or your published packages`, false);
  if (sub === "config" && ["set", "delete", "edit"].includes(args.filter((a) => !a.startsWith("-"))[1] ?? "")) return ask("irreversible", "changes package manager settings");
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
  return mutating ? ask("network", "sends data to another computer", false) : allow();
}

const GIT_VALUE_OPTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--exec-path"]);

// ---------- the environment agents run in ----------

// Account switching and code injection: none of these may reach Claude Code or anything it starts.
const STRIP_EXACT = new Set(["AWS_BEARER_TOKEN_BEDROCK", "NODE_OPTIONS", "BASH_ENV", "ENV", "LD_PRELOAD", "LD_LIBRARY_PATH", "PYTHONSTARTUP", "RUBYOPT", "PERL5OPT"]);
const STRIP_PREFIX = ["ANTHROPIC_", "CLAUDE_CODE_USE_", "CLAUDE_CODE_OAUTH", "CLAUDE_CODE_SKIP_", "CLAUDE_CODE_API_KEY", "DYLD_"];
const stripped = (k: string) => STRIP_EXACT.has(k) || STRIP_PREFIX.some((p) => k.startsWith(p));

export type Route = { route: "api_key"; apiKey?: string } | { route: "plan" };

// The environment for Claude Code: the user's variables, minus anything that could
// switch accounts, plus our own. The key comes only from the Keychain, never the shell.
export function buildChildEnv(parent: Record<string, string | undefined>, r: Route): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(parent)) if (v !== undefined && !stripped(k)) e[k] = v;
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
