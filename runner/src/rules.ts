// House rules: a short plain list per project (".companion/rules.txt"), enforced here in code (rule 12).
// A rule can only make things stricter than Companion's own safety rules, never looser.
// The agent can never change the rules file.

import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { resolveLinks, type ToolCall, type Verdict } from "./safety.ts";
import { commandsOf, redirectTargets } from "./shell.ts";
import { ruleOf, type RuleKind } from "../../protocol/settings.ts";

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
export function loadRules(project: string): LoadedRules {
  const f = join(project, RULES_FILE);
  if (!existsSync(f)) return { rules: [], problems: [] };
  try { return parseRules(readFileSync(f, "utf8")); } catch { return { rules: [], problems: ["Your house rules file could not be read, so I will ask before anything that changes your project."], broken: true }; }
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
function pathMatches(pattern: string, rel: string): boolean {
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

function editedPaths(call: ToolCall, project: string): string[] {
  if (call.tool in WRITE_TOOLS) {
    const p = call.input[WRITE_TOOLS[call.tool]] ?? call.input.file_path ?? call.input.path;
    return typeof p === "string" && p ? relPaths(project, p) : [];
  }
  if (call.tool === "Bash" && typeof call.input.command === "string") {
    const cmd = call.input.command;
    const found: string[] = [...redirectTargets(cmd)];
    for (const w of commandsOf(cmd)) {
      const name = basename(w[0]);
      const sedI = (name === "sed" || name === "perl") && w.some((a) => /^-[A-Za-z]*i/.test(a));
      const gitChange = name === "git" && w.some((a) => GIT_CHANGES.has(a));
      if (WRITE_VERBS.has(name) || sedI || gitChange || INTERPRETERS.has(name.replace(/\.[0-9]+$/, ""))) found.push(...w.slice(1).flatMap((a) => (a.startsWith("-") ? [] : [a.replace(/^of=/, "")])));
    }
    return found.flatMap((t) => relPaths(project, t));
  }
  return [];
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

const deny = (rule: Rule): Verdict => ({ decision: "deny", risk: "irreversible", reason: `House rule: "${rule.text}"`, undoable: true });
const ask = (rule: Rule): Verdict => ({ decision: "ask", risk: "irreversible", reason: `House rule: "${rule.text}"`, undoable: true });

// Returns a stricter verdict when a rule applies, otherwise null.
export function applyRules(rules: Rule[], call: ToolCall, project: string): Verdict | null {
  const edited = editedPaths(call, project);
  // Built in: the agent never changes the rules file, or anything beside it, whatever the rules say.
  if (edited.some((p) => /^\.(companion|claude)(\/|$)/i.test(p))) return { decision: "deny", risk: "irreversible", reason: "House rules can only be changed by you, never by the agent", undoable: true };
  const command = call.tool === "Bash" && typeof call.input.command === "string" ? call.input.command : "";
  let found: Verdict | null = null;
  for (const r of rules) {
    let hit = false;
    if (r.kind === "never_edit" || r.kind === "ask_edit") hit = edited.some((p) => pathMatches(r.pattern, p));
    else if (r.kind === "never_run" || r.kind === "ask_run") hit = !!command && commandMatches(r.pattern, command);
    else if (r.kind === "ask_install") hit = !!command && installs(command);
    if (!hit) continue;
    const v = r.kind.startsWith("never") ? deny(r) : ask(r);
    if (v.decision === "deny") return v;
    found = found ?? v;
  }
  return found;
}
