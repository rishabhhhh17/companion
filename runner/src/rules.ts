// House rules: a short plain list per project (".companion/rules.txt"), enforced here in code (rule 12).
// A rule can only make things stricter than Companion's own safety rules, never looser.
// The agent can never change the rules file.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { ToolCall, Verdict } from "./safety.ts";

export const RULES_FILE = ".companion/rules.txt";
export type RuleKind = "never_edit" | "never_run" | "ask_edit" | "ask_run" | "ask_install";
export type Rule = { kind: RuleKind; pattern: string; text: string };

const LINES: [RegExp, RuleKind][] = [
  [/^never\s+edit\s+(.+)$/i, "never_edit"],
  [/^never\s+run\s+(.+)$/i, "never_run"],
  [/^ask\s+before\s+editing\s+(.+)$/i, "ask_edit"],
  [/^ask\s+before\s+running\s+(.+)$/i, "ask_run"],
  [/^ask\s+before\s+installing\s+packages$/i, "ask_install"],
];

export function parseRules(text: string): { rules: Rule[]; problems: string[] } {
  const rules: Rule[] = [], problems: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || line.startsWith("#")) return;
    for (const [re, kind] of LINES) {
      const m = re.exec(line);
      if (m) { rules.push({ kind, pattern: (m[1] ?? "").trim(), text: line }); return; }
    }
    problems.push(`Line ${i + 1} was not understood: "${line}"`);
  });
  return { rules, problems };
}

export function loadRules(project: string): { rules: Rule[]; problems: string[] } {
  const f = join(project, RULES_FILE);
  if (!existsSync(f)) return { rules: [], problems: [] };
  try { return parseRules(readFileSync(f, "utf8")); } catch { return { rules: [], problems: [] }; }
}

// ---- matching ----

const WRITE_TOOLS: Record<string, string> = { Write: "file_path", Edit: "file_path", MultiEdit: "file_path", NotebookEdit: "notebook_path" };
const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
function globToRegex(g: string): RegExp {
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { out += ".*"; i++; }
    else if (c === "*") out += g[i + 1] === undefined && g[i - 1] === "/" ? ".*" : "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += escape(c);
  }
  return new RegExp(`^${out}$`);
}
function relPath(project: string, p: string): string {
  const abs = isAbsolute(p) ? p : resolve(project, p);
  const rel = relative(resolve(project), abs);
  return rel.startsWith("..") ? p : rel;
}
function pathMatches(pattern: string, rel: string): boolean {
  const re = globToRegex(pattern.replace(/^\.\//, ""));
  const clean = rel.replace(/^\.\//, "");
  if (pattern.includes("/")) return re.test(clean);
  return clean.split("/").some((seg) => re.test(seg));
}

const segments = (command: string) => command.split(/&&|\|\||;|\||\n/).map((s) => s.trim().split(/\s+/).filter(Boolean)).filter((t) => t.length);
const looksLikeWriting = (command: string) => />|\btee\b|\bsed\b\s+-i|\brm\b|\bmv\b|\bcp\b|\btruncate\b|\bdd\b|\bchmod\b|\bln\b/.test(command);
const tokensOf = (command: string) => command.split(/[\s'"`<>|;&()=]+/).filter(Boolean);
const INSTALL = /^(?:(?:npm|pnpm)\s+(?:install|i|add)|yarn\s+add|bun\s+(?:add|install|i)|pip3?\s+install|brew\s+install|cargo\s+(?:add|install)|gem\s+install)\b/;

function editedPaths(call: ToolCall, project: string): string[] {
  if (call.tool in WRITE_TOOLS) {
    const p = call.input[WRITE_TOOLS[call.tool]] ?? call.input.file_path ?? call.input.path;
    return typeof p === "string" && p ? [relPath(project, p)] : [];
  }
  if (call.tool === "Bash" && typeof call.input.command === "string" && looksLikeWriting(call.input.command)) {
    return tokensOf(call.input.command).map((t) => relPath(project, t));
  }
  return [];
}
function commandMatches(pattern: string, command: string): boolean {
  const want = pattern.split(/\s+/);
  return segments(command).some((t) => want.every((w, i) => t[i] === w));
}

const deny = (rule: Rule): Verdict => ({ decision: "deny", risk: "irreversible", reason: `House rule: "${rule.text}"`, undoable: true });
const ask = (rule: Rule): Verdict => ({ decision: "ask", risk: "irreversible", reason: `House rule: "${rule.text}"`, undoable: true });

// Returns a stricter verdict when a rule applies, otherwise null.
export function applyRules(rules: Rule[], call: ToolCall, project: string): Verdict | null {
  const edited = editedPaths(call, project);
  // Built in: the agent never changes the rules file, whatever the rules say.
  if (edited.some((p) => p === RULES_FILE)) return { decision: "deny", risk: "irreversible", reason: "House rules can only be changed by you, never by the agent", undoable: true };
  const command = call.tool === "Bash" && typeof call.input.command === "string" ? call.input.command : "";
  let found: Verdict | null = null;
  for (const r of rules) {
    let hit = false;
    if (r.kind === "never_edit" || r.kind === "ask_edit") hit = edited.some((p) => pathMatches(r.pattern, p));
    else if (r.kind === "never_run" || r.kind === "ask_run") hit = !!command && commandMatches(r.pattern, command);
    else if (r.kind === "ask_install") hit = !!command && segments(command).some((t) => INSTALL.test(t.join(" ")));
    if (!hit) continue;
    const v = r.kind.startsWith("never") ? deny(r) : ask(r);
    if (v.decision === "deny") return v;
    found = found ?? v;
  }
  return found;
}
