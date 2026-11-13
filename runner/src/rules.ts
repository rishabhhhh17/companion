// House rules: a short plain list per project (".companion/rules.txt"), enforced here in code (rule 12).
// A rule can only make things stricter than Companion's own safety rules, never looser.
// The agent can never change the rules file.

import { mkdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { resolveLinks, type ToolCall, type Verdict } from "./safety.ts";
import { commandsOf, redirectTargets } from "./shell.ts";
import { ruleOf, type RuleKind } from "../../protocol/settings.ts";
import { companionDirUsable, readCompanionFile } from "./companionfile.ts";
import { writeAtomic } from "./atomic.ts";

export const RULES_FILE = ".companion/rules.txt";
export type { RuleKind };
export type Rule = { kind: RuleKind; pattern: string; text: string };

// Each line is read the one way the shell's Settings row reads it too (protocol/settings.ts ruleOf, houserules.rs), so the
// rules the person sees in Settings are exactly the ones enforced here.
export function parseRules(text: string): { rules: Rule[]; problems: string[] } {
  const rules: Rule[] = [], problems: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.startsWith("#")) return;
    const r = ruleOf(line);
    if (r) rules.push(r); else problems.push(`Line ${i + 1} was not understood: "${line}"`);
  });
  return { rules, problems };
}

export type LoadedRules = { rules: Rule[]; problems: string[]; broken?: boolean };
// A rules file that exists but cannot be read is never treated as "no rules": the person wanted some, so risky things ask instead.
// It is read the one way the shell reads it (companionfile.ts, houserules.rs): never through a link, a plain file of at most
// 64 KB, text only. Anything else (a link, a pipe, a huge file) counts as a file that could not be read.
export function loadRules(project: string): LoadedRules {
  const r = readCompanionFile(project, "rules.txt");
  if (r.state === "none") return { rules: [], problems: [] };
  if (r.state === "ok") return parseRules(r.text);
  return { rules: [], problems: ["Your house rules file could not be read, so I will ask before anything that changes your project."], broken: true };
}

// ---- matching ----

const WRITE_TOOLS: Record<string, string> = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
// Capital letters do not matter (macOS treats FILE and file as the same file). A star matches anything, slashes included, so
// "config/*.json" also covers config/x/a.json: a rule protects more, never less.
function globToRegex(g: string): RegExp {
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { if (g[i + 2] === "/") { out += "(?:.*/)?"; i += 2; } else { out += ".*"; i++; } }
    else if (c === "*") out += ".*";
    else if (c === "?") out += "[^/]";
    else out += escape(c);
  }
  return new RegExp(`^${out}$`, "i");
}
// The same file spelled in different ways: as written, and with every link followed.
function relPaths(project: string, p: string): string[] {
  const root = resolve(project), rootReal = resolveLinks(project);
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const out = new Set<string>();
  for (const [base, path] of [[root, abs], [rootReal, resolveLinks(abs)]] as const) { const rel = relative(base, path); if (!rel.startsWith("..") && rel !== "") out.add(rel); }
  if (out.size === 0) out.add(p);
  return [...out];
}
/** Whether a rule's pattern covers a path from the project folder down: the file itself, or any folder above it. Also used
 *  by the review (M57) to check a change against "never edit" and "ask before editing" rules, in code. */
export function pathMatches(pattern: string, rel: string): boolean {
  const pat = pattern.replace(/^\.\//, "").replace(/\/+$/, "");                 // "src/" means the folder src
  const clean = rel.replace(/^\.\//, "");
  const re = globToRegex(pat);
  if (pat.includes("/")) {
    const parts = clean.split("/");
    return parts.some((_, i) => re.test(parts.slice(0, i + 1).join("/")));        // the file itself, or any folder above it
  }
  return clean.split("/").some((seg) => re.test(seg));
}

const WRITE_VERBS = new Set(["cp", "mv", "ln", "install", "rsync", "touch", "mkdir", "chmod", "chown", "chgrp", "truncate", "tee", "rm", "rmdir", "unlink", "shred", "dd", "sort", "tar", "unzip", "curl", "wget", "patch"]);
const INTERPRETERS = new Set(["python", "python3", "node", "ruby", "perl", "php", "osascript", "deno", "bun", "lua", "sh", "bash", "zsh"]);
const GIT_CHANGES = new Set(["checkout", "restore", "reset", "stash", "rm", "mv", "apply", "clean", "merge", "rebase", "cherry-pick", "revert", "pull", "switch", "am"]);
const INSTALL = [
  /^(?:npm|pnpm)\s+(?:install|i|add|ci|update|up)\b/, /^yarn(?:\s+(?:add|install|up|upgrade))?$/, /^yarn\s+(?:add|install|up|upgrade)\b/, /^bun\s+(?:add|install|i|update)\b/,
  /^(?:pip3?|python3?\s+-m\s+pip)\s+install\b/, /^brew\s+install\b/, /^cargo\s+(?:add|install)\b/, /^gem\s+install\b/, /^go\s+(?:get|install)\b/,
  /^npx\s+(?:--yes\s+|-y\s+)?create-/, /^(?:pnpm|npm)\s+(?:dlx|create|init)\b/, /^npm\s+exec\b/, /^bunx\b/, /^pnpx\b/,
];

// Tools that rewrite the files they are given in place, when told to (a formatter's write flag, a linter's fix flag), run
// directly, from node_modules/.bin, or through npx, bunx, pnpx, npm exec, pnpm dlx or yarn dlx.
const has = (a: string[], ...f: string[]) => a.some((x) => f.includes(x) || f.some((y) => y.startsWith("--") && x.startsWith(`${y}=`)));
const FIXERS: Record<string, { writes: (a: string[]) => boolean; words?: number }> = {
  prettier: { writes: (a) => has(a, "--write", "-w") }, eslint: { writes: (a) => has(a, "--fix") }, stylelint: { writes: (a) => has(a, "--fix") },
  standard: { writes: (a) => has(a, "--fix") }, xo: { writes: (a) => has(a, "--fix") }, "ts-standard": { writes: (a) => has(a, "--fix") },
  biome: { writes: (a) => has(a, "--write", "--apply", "--apply-unsafe", "--fix", "--unsafe"), words: 1 },
  black: { writes: (a) => !has(a, "--check", "--diff") }, isort: { writes: (a) => !has(a, "--check", "--check-only", "-c", "--diff") },
  ruff: { writes: (a) => (a[0] === "format" && !has(a, "--check", "--diff")) || has(a, "--fix"), words: 1 },
  autopep8: { writes: (a) => has(a, "-i", "--in-place") }, gofmt: { writes: (a) => has(a, "-w") }, rustfmt: { writes: (a) => !has(a, "--check") },
  "clang-format": { writes: (a) => has(a, "-i") }, dprint: { writes: (a) => a[0] === "fmt", words: 1 }, "sort-package-json": { writes: (a) => !has(a, "--check", "-c") },
  markdownlint: { writes: (a) => has(a, "--fix") }, "markdownlint-cli2": { writes: (a) => has(a, "--fix") },
};
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];
const PM_EDITS = new Set(["install", "i", "add", "remove", "rm", "uninstall", "un", "update", "up", "upgrade", "ci", "link", "unlink", "dedupe", "prune"]);
// The program a runner of packages runs (npx prettier, pnpm dlx biome), as its own words.
function programOf(w: string[]): string[] {
  const name = basename(w[0]);
  const rest = ["npx", "bunx", "pnpx"].includes(name) ? w.slice(1) : ["npm", "pnpm", "yarn", "bun"].includes(name) && ["exec", "dlx", "x"].includes(w[1] ?? "") ? w.slice(2) : null;
  if (!rest) return w;
  const out = [...rest];
  while (out.length && out[0].startsWith("-")) { const o = out.shift()!; if (["-p", "--package", "-c", "--call"].includes(o)) out.shift(); }
  return out;
}
// "@biomejs/biome@1.9" -> "biome"; "./node_modules/.bin/prettier" -> "prettier".
const programName = (word: string) => basename(word.replace(/@[^/@]*$/, "") || word).replace(/^@[^/]+\//, "");
// Folders a tool is pointed at (".", "src", "**/*.json"): every protected file in them may change. A name with no file
// ending ("src", "lib") is taken as a folder too, since that is how these tools are usually pointed at one.
const isFolder = (project: string, a: string) => a === "." || a === "./" || a.endsWith("/") || /[*?[{]/.test(a) || !/\.[^/.]+$/.test(a) || (() => { try { return statSync(resolve(project, a)).isDirectory(); } catch { return false; } })();

type Edited = { files: string[]; folders: string[] };
function editedPaths(call: ToolCall, project: string): Edited {
  if (call.tool in WRITE_TOOLS) {
    const p = call.input[WRITE_TOOLS[call.tool]] ?? call.input.file_path ?? call.input.path;
    return { files: typeof p === "string" && p ? relPaths(project, p) : [], folders: [] };
  }
  if (call.tool === "Bash" && typeof call.input.command === "string") {
    const cmd = call.input.command;
    const found: string[] = [...redirectTargets(cmd)], folders: string[] = [];
    for (const w of commandsOf(cmd)) {
      const name = basename(w[0]);
      const sedI = (name === "sed" || name === "perl") && w.some((a) => /^-[A-Za-z]*i/.test(a));
      const gitChange = name === "git" && w.some((a) => GIT_CHANGES.has(a));
      // awk and gawk with the inplace extension rewrite their files (gawk -i inplace).
      const awkI = (name === "awk" || name === "gawk") && w.some((a, i) => (a === "-i" && w[i + 1] === "inplace") || a === "-iinplace" || a === "--include=inplace");
      if (WRITE_VERBS.has(name) || sedI || gitChange || awkI || INTERPRETERS.has(name.replace(/\.[0-9]+$/, ""))) found.push(...w.slice(1).flatMap((a) => (a.startsWith("-") || a === "inplace" ? [] : [a.replace(/^of=/, "")])));
      // A package manager writes package.json and its lock file when it adds, removes or changes packages, sets a field
      // (npm pkg set, delete, fix) or bumps the version.
      if (["npm", "pnpm", "yarn", "bun"].includes(name)) {
        const args = w.slice(1).filter((a) => !a.startsWith("-"));
        const sub = args[0] ?? (name === "yarn" ? "install" : "");
        if (sub === "pkg" && ["set", "delete", "fix"].includes(args[1] ?? "")) found.push("package.json");
        else if (sub === "version" || sub === "init" || (name === "bun" && sub === "pm" && args[1] === "version")) found.push("package.json");
        else if (PM_EDITS.has(sub)) found.push(...(args.length > 1 ? ["package.json", ...LOCKFILES] : LOCKFILES));
      }
      // Formatters and fixers told to write: every file they are given, and every folder.
      const prog = programOf(w);
      const fixer = prog.length ? FIXERS[programName(prog[0])] : undefined;
      if (fixer && fixer.writes(prog.slice(1))) {
        for (const a of prog.slice(1 + (fixer.words ?? 0))) {
          if (a.startsWith("-")) continue;
          (isFolder(project, a) ? folders : found).push(a);
        }
      }
    }
    return { files: found.flatMap((t) => relPaths(project, t)), folders: folders.map((f) => (f === "." || f === "./" ? "" : (relPaths(project, f.replace(/\/+$/, ""))[0] ?? f))) };
  }
  return { files: [], folders: [] };
}
// Could a rule's pattern match something inside this folder (relative to the project, "" for the whole project)?
function folderMayHold(folder: string, pattern: string): boolean {
  const f = folder.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!f || /[*?[{]/.test(f)) return true;
  const pat = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!pat.includes("/")) return true;   // a name with no folder matches inside any folder
  const fixed = pat.replace(/[*?[{].*$/, "").replace(/\/[^/]*$/, "");
  const a = f.toLowerCase(), b = fixed.toLowerCase();
  return !b || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
// "never run npm publish" is the command npm with the word publish in it, however it is written: env, a full path, a shell, flags between.
function commandMatches(pattern: string, command: string): boolean {
  const want = pattern.split(/\s+/).filter(Boolean);
  // npx, bunx and pnpx run another program: "never run npm publish" means that program too.
  const forms = (t: string[]): string[][] => { const n = basename(t[0]); if (["npx", "bunx", "pnpx"].includes(n)) { const rest = t.slice(1).filter((x, i, a) => !x.startsWith("-") || a.slice(0, i).every((y) => y.startsWith("-"))); const k = rest.findIndex((x) => !x.startsWith("-")); return k >= 0 ? [t, rest.slice(k)] : [t]; } return [t]; };
  return commandsOf(command).flatMap(forms).some((t) => {
    if (basename(t[0]) !== want[0] && t[0] !== want[0]) return false;
    let at = 1;
    for (let w = 1; w < want.length; w++) { const i = t.indexOf(want[w], at); if (i < 0) return false; at = i + 1; }
    return true;
  });
}
function installs(command: string): boolean {
  return commandsOf(command).some((t) => { const line = [basename(t[0]), ...t.slice(1)].join(" "); return INSTALL.some((re) => re.test(line)); });
}

const deny = (rule: Rule): Verdict => ({ decision: "deny", risk: "house_rule", reason: `Your house rule says: "${rule.text}"`, undoable: true });
const ask = (rule: Rule): Verdict => ({ decision: "ask", risk: "house_rule", reason: `Your house rule says: "${rule.text}"`, undoable: true });
const RANK = { allow: 0, ask: 1, deny: 2 } as const;

/** The verdict for a call once house rules are applied: the rule's when it is stricter than the base, else the base. A rule
 *  can never turn something Undo cannot take back into something it can (M45), so the base's undo fact always holds.
 *  byHouseRule: the rule decided, which taskScopeCovers needs to know. */
export function withHouseRule(base: Verdict, ruled: Verdict | null): { verdict: Verdict; byHouseRule: boolean } {
  if (!ruled || RANK[ruled.decision] <= RANK[base.decision]) return { verdict: base, byHouseRule: false };
  return { verdict: { ...ruled, undoable: ruled.undoable && base.undoable }, byHouseRule: true };
}

// Returns a stricter verdict when a rule applies, otherwise null.
export function applyRules(rules: Rule[], call: ToolCall, project: string): Verdict | null {
  const { files: edited, folders } = editedPaths(call, project);
  // Built in: the agent never changes the rules file, or anything beside it, whatever the rules say.
  if (edited.some((p) => /^\.(companion|claude)(\/|$)/i.test(p))) return { decision: "deny", risk: "irreversible", reason: "House rules can only be changed by you, never by the agent", undoable: true };
  const command = call.tool === "Bash" && typeof call.input.command === "string" ? call.input.command : "";
  let found: Verdict | null = null;
  for (const r of rules) {
    let hit = false;
    if (r.kind === "never_edit" || r.kind === "ask_edit") {
      hit = edited.some((p) => pathMatches(r.pattern, p));
      // A tool pointed at a whole folder that may hold a protected file: which files it changes is not known in advance,
      // so it asks (never refused outright: the folder may hold no such file).
      if (!hit && folders.some((f) => folderMayHold(f, r.pattern))) { found = found ?? ask(r); continue; }
    }
    else if (r.kind === "never_run" || r.kind === "ask_run") hit = !!command && commandMatches(r.pattern, command);
    else if (r.kind === "ask_install") hit = !!command && installs(command);
    if (!hit) continue;
    const v = r.kind.startsWith("never") ? deny(r) : ask(r);
    if (v.decision === "deny") return v;
    found = found ?? v;
  }
  return found;
}

// ---- M85: Always allow for this project ----

/** The tools a plain read of one file uses: Always allow is only ever offered for these. */
const ONE_FILE_READS: Record<string, string> = { Read: "file_path", NotebookRead: "notebook_path" };
/** The longest a house rule line may be (rules.house item maxLength). */
const RULE_MAX = 200;

/** M85: the house rule line Always allow for this project would save for this question, or null when it does not fit. It
 *  fits only a plain read of one named file outside the project that Squibby asks about (undoable, never refused), never a
 *  command, an edit, anything live or destructive, and never a path the line could not hold exactly. */
export function alwaysLineFor(call: ToolCall, v: Verdict, live: boolean): string | null {
  if (live || v.decision !== "ask" || v.risk !== "outside_project" || !v.undoable) return null;
  const key = ONE_FILE_READS[call.tool];
  const p = key ? call.input[key] : undefined;
  if (typeof p !== "string" || !isAbsolute(p) || /[\s\u0000-\u001f\u007f]/.test(p)) return null;
  const line = `allow reading ${p}`;
  return line.length <= RULE_MAX && ruleOfLine(line)?.kind === "allow_read" ? line : null;
}
const ruleOfLine = (line: string) => parseRules(line).rules[0] ?? null;

/** M85: whether an "allow reading" house rule answers this question already: the same plain read of the same file (links
 *  followed), asked only because the file is outside the project. A refusal, a command, an edit and anything else are never
 *  touched: such a rule only ever skips this one question. */
export function allowedByAlways(rules: Rule[], call: ToolCall, v: Verdict): boolean {
  if (v.decision !== "ask" || v.risk !== "outside_project" || !v.undoable) return false;
  const key = ONE_FILE_READS[call.tool];
  const p = key ? call.input[key] : undefined;
  if (typeof p !== "string" || !isAbsolute(p)) return false;
  const want = resolveLinks(p);
  return rules.some((r) => r.kind === "allow_read" && isAbsolute(r.pattern) && resolveLinks(r.pattern) === want);
}

/** The most rules the file may hold (the registry's rules.house maxItems): a full file gets no new one. */
const RULES_MAX = 50;

/** M85 review: Always allow for this project adds its one "allow reading <file>" line to the rules file as it is on disk
 *  at this moment, so a rule written by hand since any page last read the file is never lost. Every other line (rules,
 *  notes, empty lines, its line ending) stays exactly as it was. Never through a link (companionfile.ts), never into a file
 *  that cannot be read, and never a 51st rule. True when the line is in the file afterwards. */
export function addHouseRule(project: string, line: string): boolean {
  const rule = ruleOfLine(line);
  if (!rule || rule.kind !== "allow_read" || !isAbsolute(rule.pattern) || rule.text.length > RULE_MAX) return false;
  if (!project || !companionDirUsable(project)) return false;
  const r = readCompanionFile(project, "rules.txt");
  if (r.state === "unreadable") return false;
  const now = r.state === "ok" ? r.text : "";
  const have = parseRules(now).rules;
  if (have.some((x) => x.text.toLowerCase() === rule.text.toLowerCase())) return true;
  if (have.length >= RULES_MAX) return false;
  const nl = now.includes("\r\n") ? "\r\n" : "\n";
  const text = `${now}${now && !now.endsWith("\n") ? nl : ""}${rule.text}${nl}`;
  try {
    mkdirSync(join(project, ".companion"), { recursive: true });
    if (!companionDirUsable(project)) return false;
    writeAtomic(join(project, RULES_FILE), text, "keep");
  } catch { return false; }
  return true;
}
