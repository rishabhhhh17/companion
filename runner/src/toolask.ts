// M114 (docs/milestones/M114-approve-from-notch.md): approve and answer from the notch. The approve and answer hooks
// (donesignal.ts) hand a tool's permission request, or Claude Code's question, to Squibby's guard folder and wait for an
// answer file; the guard (guard.ts) hands each one here. Each becomes one ask, said as toolask.request with only the card's
// words: what the tool wants in short redacted words, the rule Always would write, or the questions and their choices.
// Rules:
//  - Squibby never answers for the person (rule 13). Only toolask.answer, from the person's press, writes a reply, and the
//    reply is one of the fixed shapes in replyFor. A press that cannot be honoured hands the ask back to the tool (an empty
//    answer, said as inTool), so the card never goes quiet; a press for an ask the engine no longer has is said as gone.
//  - With both hooks on, a question that also reaches PermissionRequest is handed back at once while its own card waits or
//    just after it ended, so it never shows twice or doubles the wait ([verify] (e)).
//  - A closed, slow or stopped Squibby never blocks the tool: the wait set (notch.askWait), the hook going away (answered in
//    the tool), the tool's done signal and Stop everything each end the ask with an empty answer, which the hook prints as
//    nothing, so the tool asks in its own window as it always does. Never a deny on the person's behalf.
//  - Always writes only the tool's own allow rule, shown first: one addRules suggestion with behavior allow, written by the
//    tool itself to its project's local settings. Mode changes, new folders and deny rules are never handed back.
//  - Nothing is kept: the request lives in memory only while its card shows (its questions are needed for the reply); no
//    History row, no log line. The guard removed the request file as it read it.
// Nothing here runs git or writes the person's git (rule 10).
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AskExt, DoneTool } from "./donesignal.ts";
import { shortCommand } from "./guard.ts";
import { shownPath } from "./livefeed.ts";
import { PRODUCT } from "./names.ts";
import { clip, redact } from "./redact.ts";

/** The tools whose hooks can be answered from the notch (TOOL_HOOKS has approve for these). */
export const ASK_TOOLS: readonly DoneTool[] = ["claude", "codex"];
/** How long a card waits before the tool asks in its own window (notch.askWait), in seconds. The hook itself waits a little
 *  longer (ASK_WAIT_TENTHS), so the engine always ends it first. */
export const ASK_WAIT_CHOICES: readonly number[] = [30, 60, 120];
export const askWaitOf = (v: unknown): number => { const n = Number(v); return v !== null && v !== undefined && ASK_WAIT_CHOICES.includes(n) ? n : 60; };
/** At most this many asks wait at once; one more is handed back to its tool at once. */
export const ASK_MAX = 8;
/** How long after a question's card ends a PermissionRequest copy of it is still handed back at once, in ms. */
export const ASK_ECHO_MS = 5000;
/** The id of an ask (the protocol's own shape). */
const ASK_ID = /^ta_[0-9a-f]{12}$/;
/** How often the engine checks the waits and whether each hook is still there (answered in the tool), in ms. */
export const ASK_POLL_MS = 500;
/** The card's limits, in characters (the protocol checks the same). */
export const ASK_TARGET_MAX = 80, ASK_RULE_MAX = 120, ASK_QUESTION_MAX = 300, ASK_HEADER_MAX = 30, ASK_LABEL_MAX = 80, ASK_ABOUT_MAX = 160;
/** Claude Code's AskUserQuestion: 1 to 4 questions of 2 to 4 choices ([verify] the most; up to 6 are taken). */
export const ASK_QUESTIONS_MAX = 4, ASK_OPTIONS_MAX = 6;

export type AskKind = "permission" | "question" | "plan";
export type AskAction = "run" | "edit" | "read" | "fetch" | "tool";
export type AskOption = { label: string; about?: string };
export type AskQuestion = { header?: string; question: string; multi: boolean; options: AskOption[] };
/** What the card shows. */
export type AskView = { kind: AskKind; action?: AskAction; target?: string; always?: string; questions?: AskQuestion[] };
/** The rule Always would write: shown as `shown`, handed back as `rule` (exactly one, as the tool suggested it). */
export type AlwaysRule = { shown: string; rule: { toolName: string; ruleContent?: string } };
/** One parsed request: the card's words, and what the reply needs (kept in memory only). */
export type ParsedAsk = AskView & { input?: Record<string, unknown>; rawQuestions?: unknown[]; labels?: string[][]; texts?: string[]; rule?: AlwaysRule["rule"] };
export type AskChoice = "allow" | "always" | "deny" | "tool" | "answer";
export type AskAnswer = { choice: AskChoice; picks?: number[][] };
export type AskOutcome = "allowed" | "always" | "denied" | "answered" | "inTool" | "expired" | "elsewhere" | "done" | "stopped";
export type AskEvent =
  | ({ type: "toolask.request"; ask: string; project: string; tool: DoneTool; expiresAt: string } & AskView)
  | { type: "toolask.resolved"; ask: string; outcome: AskOutcome };

type Obj = Record<string, unknown>;
const objOf = (v: unknown): Obj | null => {
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
};
const textOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
/** One line, redacted, clipped with an ellipsis. */
const said = (v: string, max: number): string => {
  const one = redact(v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(one).length > max ? `${clip(one, max - 1).trimEnd()}…` : one;
};

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"]);
const READ_TOOLS = new Set(["Read", "Glob", "Grep", "LS"]);

/** The rule Always would write, or null. Only one addRules suggestion with behavior allow and exactly one rule, whose words
 *  are shown as they are written (nothing redacted out of them, and short enough to read). Everything else is dropped. */
export function alwaysRuleOf(req: unknown): AlwaysRule | null {
  const o = objOf(req);
  const list = o && Array.isArray(o.permission_suggestions) ? o.permission_suggestions : [];
  for (const s of list) {
    const x = objOf(s);
    if (!x || x.type !== "addRules" || x.behavior !== "allow" || !Array.isArray(x.rules) || x.rules.length !== 1) continue;
    const r = objOf(x.rules[0]);
    const tool = r && textOf(r.toolName);
    if (!r || !tool || !/^[A-Za-z0-9_.:-]{1,64}$/.test(tool)) continue;
    const content = r.ruleContent === undefined ? undefined : textOf(r.ruleContent);
    if (r.ruleContent !== undefined && !content) continue;
    const shown = content ? `${tool}(${content})` : tool;
    // Shown exactly as written: a rule with a secret in it, a line break, or one too long to read is never offered.
    if (redact(shown) !== shown || /[\u0000-\u001f\u007f]/.test(shown) || Array.from(shown).length > ASK_RULE_MAX) continue;
    return { shown, rule: { toolName: tool, ...(content ? { ruleContent: content } : {}) } };
  }
  return null;
}

/** The questions of AskUserQuestion, or null when they are not the shape the card can show and answer. */
function questionsOf(input: Obj | null): { view: AskQuestion[]; labels: string[][]; texts: string[]; raw: unknown[] } | null {
  const qs = input && Array.isArray(input.questions) ? input.questions : null;
  if (!qs || qs.length < 1 || qs.length > ASK_QUESTIONS_MAX) return null;
  const view: AskQuestion[] = [], labels: string[][] = [], texts: string[] = [];
  for (const q of qs) {
    const o = objOf(q);
    const text = o && textOf(o.question);
    const opts = o && Array.isArray(o.options) ? o.options : null;
    if (!o || !text || !opts || opts.length < 2 || opts.length > ASK_OPTIONS_MAX) return null;
    const options: AskOption[] = [], ls: string[] = [];
    for (const x of opts) {
      const p = objOf(x);
      const label = p && textOf(p.label);
      if (!p || !label) return null;
      const about = textOf(p.description);
      options.push({ label: said(label, ASK_LABEL_MAX), ...(about ? { about: said(about, ASK_ABOUT_MAX) } : {}) });
      ls.push(label);
    }
    if (new Set(ls).size !== ls.length) return null;
    const header = textOf(o.header);
    view.push({ ...(header ? { header: said(header, ASK_HEADER_MAX) } : {}), question: said(text, ASK_QUESTION_MAX), multi: o.multiSelect === true, options });
    labels.push(ls); texts.push(text);
  }
  if (new Set(texts).size !== texts.length) return null;
  return { view, labels, texts, raw: qs };
}

/** A command exactly as it will run, or null when the card could not show all of it: a secret redacted, more than one
 *  line, or longer than the card holds. Allow must never approve text the person could not see (rule 13, hunt 20 Nov). */
function wholeCommand(command: string): string | null {
  const t = command.trim();
  if (!t || /[\u0000-\u001f\u007f]/.test(t) || redact(t) !== t || Array.from(t).length > ASK_TARGET_MAX) return null;
  return shortCommand(t) === t ? t : null;
}
/** A file for the card: inside the project, its path there; outside it, the whole path (home as ~), so it never looks like
 *  the project's own file. Null when an outside path is too long to show whole or holds a secret (the tool asks itself). */
function askPath(project: string, path: string, cwd?: string): string | null {
  const root = resolve(project);
  const abs = isAbsolute(path) ? resolve(path) : resolve(cwd ?? root, path);
  const rel = relative(root, abs);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return shownPath(project, path, cwd);
  const home = homedir();
  const out = abs === home || abs.startsWith(home + sep) ? `~${abs.slice(home.length)}` : abs;
  if (/[\u0000-\u001f\u007f]/.test(out) || redact(out) !== out || Array.from(out).length > ASK_TARGET_MAX) return null;
  return out;
}

/** A request as the card shows it, or null for anything the card cannot show (the tool then asks in its own window). ext
 *  is the hook it came through: perm (PermissionRequest) or question (PreToolUse on AskUserQuestion, questions only). */
export function parseAsk(text: string, ext: AskExt, project: string): ParsedAsk | null {
  const o = objOf(text);
  if (!o) return null;
  const name = textOf(o.tool_name ?? o.toolName);
  const input = objOf(o.tool_input ?? o.toolArgs);
  if (!name) return null;
  if (name === "AskUserQuestion") {
    const q = questionsOf(input);
    return q ? { kind: "question", questions: q.view, labels: q.labels, texts: q.texts, rawQuestions: q.raw, input: input! } : null;
  }
  if (ext !== "perm") return null;
  const rule = alwaysRuleOf(o);
  const always = rule ? { always: rule.shown, rule: rule.rule } : {};
  const cwd = typeof o.cwd === "string" ? o.cwd : undefined;
  if (name === "ExitPlanMode") return { kind: "plan", input: input ?? {}, ...always };
  if (name === "Bash" || name === "shell" || name === "exec_command") {
    const command = input && textOf(input.command);
    const shown = command ? wholeCommand(command) : null;
    return shown ? { kind: "permission", action: "run", target: shown, ...always } : null;
  }
  const rawPath = input ? textOf(input.file_path ?? input.notebook_path ?? input.path) : null;
  const shownFile = rawPath ? askPath(project, rawPath, cwd) : null;
  if (rawPath && !shownFile && (EDIT_TOOLS.has(name) || READ_TOOLS.has(name))) return null;
  const pathOf = () => shownFile;
  if (EDIT_TOOLS.has(name)) { const p = pathOf(); return { kind: "permission", action: "edit", ...(p ? { target: p } : {}), ...always }; }
  if (READ_TOOLS.has(name)) { const p = pathOf() ?? (input && textOf(input.pattern) ? said(input.pattern as string, ASK_TARGET_MAX) : null); return { kind: "permission", action: "read", ...(p ? { target: p } : {}), ...always }; }
  if (name === "WebFetch" || name === "WebSearch") {
    let target: string | null = null;
    if (input && textOf(input.url)) { try { target = new URL(input.url as string).host || null; } catch { target = null; } }
    else if (input && textOf(input.query)) target = said(input.query as string, ASK_TARGET_MAX);
    return { kind: "permission", action: "fetch", ...(target ? { target: said(target, ASK_TARGET_MAX) } : {}), ...always };
  }
  return { kind: "permission", action: "tool", target: said(name, ASK_TARGET_MAX), ...always };
}

/** The answers by question, each the label picked (several joined with ", "), or null when a pick is not one of the
 *  choices, a question has no pick, or a one pick question has more than one. */
function answersOf(a: ParsedAsk, picks: unknown): Record<string, string> | null {
  if (!a.labels || !a.texts || !Array.isArray(picks) || picks.length !== a.labels.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.labels.length; i++) {
    const p = picks[i];
    const labels = a.labels[i]!;
    if (!Array.isArray(p) || p.length < 1 || new Set(p).size !== p.length || (!a.questions![i]!.multi && p.length !== 1)) return null;
    if (!p.every((n) => Number.isInteger(n) && n >= 0 && n < labels.length)) return null;
    out[a.texts[i]!] = (p as number[]).map((n) => labels[n]!).join(", ");
  }
  return out;
}

/** What the person told the tool when they said no from the notch (the tool's model reads it). */
const DENIED = `The person said no from ${PRODUCT}.`;
/** The reply the hook prints for the person's press, in the tool's own shape, or "" (the hook prints nothing and the tool
 *  asks in its own window). From the tools' hook docs (code.claude.com/docs/en/hooks: PermissionRequest decision.behavior,
 *  updatedInput and updatedPermissions; PreToolUse permissionDecision and updatedInput) and Codex's, the same shape
 *  ([verify] on a real Mac). Codex has no Always. */
export function replyFor(tool: DoneTool, ext: AskExt, a: ParsedAsk, ans: AskAnswer): string {
  if (!ASK_TOOLS.includes(tool)) return "";
  const perm = (decision: Obj) => JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } });
  if (a.kind === "question") {
    if (ans.choice !== "answer" || tool !== "claude") return "";
    const answers = answersOf(a, ans.picks);
    if (!answers) return "";
    const updatedInput = { ...(a.input ?? {}), questions: a.rawQuestions, answers };
    return ext === "question"
      ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput } })
      : perm({ behavior: "allow", updatedInput });
  }
  if (ext !== "perm") return "";
  if (ans.choice === "deny") return perm({ behavior: "deny", message: DENIED });
  if (ans.choice === "always") {
    if (tool !== "claude" || !a.rule || a.kind !== "permission") return "";
    return perm({ behavior: "allow", updatedPermissions: [{ type: "addRules", rules: [a.rule], behavior: "allow", destination: "localSettings" }] });
  }
  if (ans.choice === "allow") return perm(a.kind === "plan" ? { behavior: "allow", updatedInput: a.input ?? {} } : { behavior: "allow" });
  return "";
}

type Pending = { id: string; project: string; tool: DoneTool; ext: AskExt; file: string; pid: number; ask: ParsedAsk; deadline: number };
export type ToolAsksDeps = {
  /** Says an event; the caller adds v, id and ts. */
  emit: (e: AskEvent) => void;
  /** How long a card waits, in ms (notch.askWait), read for each new ask. */
  waitMs: () => number;
  /** Whether the waiting hook's process is still there (it goes when the tool ends it: answered in the tool). */
  alive?: (pid: number) => boolean;
  now?: () => number;
  /** For tests: no timer; tick() checks by hand. */
  timers?: boolean;
  pollMs?: number;
};

const aliveDefault = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
};

/** The asks waiting for the person. */
export class ToolAsks {
  private asks = new Map<string, Pending>();
  /** When the last question card of each project and tool ended (`${tool} ${project}`), for its PermissionRequest copy. */
  private questionEnded = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private o: ToolAsksDeps) {}
  private now(): number { return (this.o.now ?? Date.now)(); }
  /** How many wait now. */
  pending(): number { return this.asks.size; }
  /** A request from the guard folder (the file is already removed; the hook waits for `${file}.ok`). A request that is no
   *  ask, or one past ASK_MAX, is answered empty at once and never said. */
  take(project: string, tool: DoneTool, ext: AskExt, file: string, pid: number, text: string): void {
    let ask: ParsedAsk | null = null;
    try { ask = ASK_TOOLS.includes(tool) ? parseAsk(text, ext, project) : null; } catch { ask = null; }
    // Codex has no Always and no question card.
    if (ask && tool !== "claude") { if (ask.kind === "question") ask = null; else { delete ask.always; delete ask.rule; } }
    if (!ask || this.asks.size >= ASK_MAX || (ext === "perm" && ask.kind === "question" && this.questionShown(project, tool))) { this.write(file, ""); return; }
    const id = `ta_${randomBytes(6).toString("hex")}`;
    const deadline = this.now() + Math.max(1000, this.o.waitMs());
    this.asks.set(id, { id, project, tool, ext, file, pid, ask, deadline });
    const { kind, action, target, always, questions } = ask;
    this.o.emit({ type: "toolask.request", ask: id, project, tool, kind, ...(action ? { action } : {}), ...(target ? { target } : {}), ...(always ? { always } : {}), ...(questions ? { questions } : {}), expiresAt: new Date(deadline).toISOString() });
    this.arm();
  }
  /** The person's press. True when it was honoured (its reply written); false when the ask is gone or the press cannot be
   *  honoured (a wrong pick, Always with no rule), which leaves the ask waiting. Answer in the tool is always honoured. */
  answer(a: { ask: string; choice: AskChoice; picks?: number[][] }): boolean {
    const p = this.asks.get(a.ask);
    // Gone (answered, ended, or the engine restarted since): said, so the card in the notch goes too.
    if (!p) { if (ASK_ID.test(a.ask)) this.o.emit({ type: "toolask.resolved", ask: a.ask, outcome: "elsewhere" }); return false; }
    if (a.choice === "tool") { this.end(p, "", "inTool"); return true; }
    const reply = replyFor(p.tool, p.ext, p.ask, { choice: a.choice, ...(a.picks ? { picks: a.picks } : {}) });
    // A press that cannot be honoured: the tool asks in its own window (never a deny), and the card goes.
    if (!reply) { this.end(p, "", "inTool"); return false; }
    this.end(p, reply, a.choice === "allow" ? "allowed" : a.choice === "always" ? "always" : a.choice === "deny" ? "denied" : "answered");
    return true;
  }
  /** The tool's done signal: its turn ended, so no ask of it in that project still waits (null: any tool there). */
  done(project: string, tool: DoneTool | null): void {
    for (const p of [...this.asks.values()]) if (p.project === project && (tool === null || p.tool === tool)) this.end(p, "", "done");
  }
  /** Checks each wait and each hook. */
  tick(): void {
    const now = this.now(), alive = this.o.alive ?? aliveDefault;
    for (const p of [...this.asks.values()]) {
      if (now >= p.deadline) this.end(p, "", "expired");
      else if (!alive(p.pid)) this.end(p, "", "elsewhere");
    }
  }
  /** Stop everything (rule 11): every ask is handed back to its tool (never a deny), and the timer stops. */
  stop(): void {
    for (const p of [...this.asks.values()]) this.end(p, "", "stopped");
    this.disarm();
  }
  /** Whether a question card of this project and tool waits now, or ended within ASK_ECHO_MS. */
  private questionShown(project: string, tool: DoneTool): boolean {
    for (const p of this.asks.values()) if (p.project === project && p.tool === tool && p.ext === "question") return true;
    const at = this.questionEnded.get(`${tool} ${project}`);
    return at !== undefined && this.now() - at <= ASK_ECHO_MS;
  }
  private end(p: Pending, reply: string, outcome: AskOutcome): void {
    if (!this.asks.delete(p.id)) return;
    if (p.ext === "question") { this.questionEnded.set(`${p.tool} ${p.project}`, this.now()); if (this.questionEnded.size > ASK_MAX * 4) this.questionEnded.delete(this.questionEnded.keys().next().value!); }
    this.write(p.file, reply);
    this.o.emit({ type: "toolask.resolved", ask: p.id, outcome });
    if (!this.asks.size) this.disarm();
  }
  /** The answer file, written once (the hook reads it and removes it). Whatever goes wrong, the hook gives up on its own. */
  private write(file: string, reply: string): void { try { writeFileSync(`${file}.ok`, reply, { mode: 0o600 }); } catch { /* the hook gives up on its own */ } }
  private arm(): void {
    if (this.timer || this.o.timers === false) return;
    this.timer = setInterval(() => this.tick(), this.o.pollMs ?? ASK_POLL_MS);
    this.timer.unref?.();
  }
  private disarm(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}
