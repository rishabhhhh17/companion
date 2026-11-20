// M114 (docs/milestones/M114-approve-from-notch.md): approve and answer from the notch. A tool's permission request (Claude
// Code's and Codex's PermissionRequest) and Claude Code's question (AskUserQuestion, through PreToolUse) become asks in the
// engine; only the person's toolask.answer writes a reply, and the reply is one of a few fixed shapes. A closed, slow or
// stopped Squibby always lets the tool ask in its own window (an empty answer: the hook prints nothing). The hook is the real
// command run by /bin/sh on temporary folders. No model, no key, no git.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, PROTOCOL_VERSION, HOOK_KINDS as PROTOCOL_HOOK_KINDS } from "../../protocol/index.ts";
import { ASK_HOOK_EXT, askCommand, DoneSignals, eventOf, GUARD_PID, HOOK_FILE, HOOK_KINDS, TOOL_HOOKS, type DoneTool } from "../src/donesignal.ts";
import { HookGuard } from "../src/guard.ts";
import { askWaitOf, ASK_WAIT_CHOICES, alwaysRuleOf, parseAsk, replyFor, ToolAsks, type AskEvent } from "../src/toolask.ts";

const made: string[] = [];
const signals: DoneSignals[] = [];
const guards: HookGuard[] = [];
const asks: ToolAsks[] = [];
afterEach(() => {
  while (asks.length) asks.pop()!.stop();
  while (signals.length) signals.pop()!.stop();
  while (guards.length) guards.pop()!.stop();
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m114-${label}-`))); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 6000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
const P = "/Users/me/shop";

// What each tool hands its hook (code.claude.com/docs/en/hooks, PermissionRequest and PreToolUse; Codex's the same shape
// [verify]).
const bashPerm = (command: string, extra: Record<string, unknown> = {}) => JSON.stringify({ session_id: "s1", cwd: P, hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command, description: "Run the tests" }, ...extra });
const npmRule = { type: "addRules", rules: [{ toolName: "Bash", ruleContent: "npm test:*" }], behavior: "allow", destination: "localSettings" };
const questions = [
  { question: "Which database should we use?", header: "Database", multiSelect: false, options: [{ label: "SQLite", description: "A file in the project" }, { label: "Postgres", description: "A server" }] },
  { question: "Which pages need a sign in?", header: "Pages", multiSelect: true, options: [{ label: "Settings" }, { label: "Billing" }, { label: "Home" }] },
];
const askQuestion = (event = "PreToolUse") => JSON.stringify({ session_id: "s1", cwd: P, hook_event_name: event, tool_name: "AskUserQuestion", tool_input: { questions } });

describe("each request becomes one ask in plain, short words", () => {
  test("a command, a file edit, a read, a web page, a plan and any other tool", () => {
    expect(parseAsk(bashPerm("npm test"), "perm", P)).toMatchObject({ kind: "permission", action: "run", target: "npm test" });
    // The command is redacted and on one short line.
    const secret = parseAsk(bashPerm("curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123' https://api.example.com\n&& echo ok"), "perm", P)!;
    expect(secret.target).not.toContain("abcdefghijklmnop");
    expect(secret.target).not.toContain("\n");
    expect(Array.from(secret.target!).length).toBeLessThanOrEqual(60);
    expect(parseAsk(JSON.stringify({ tool_name: "Edit", cwd: P, tool_input: { file_path: `${P}/src/app.tsx`, old_string: "a", new_string: "b" } }), "perm", P)).toMatchObject({ kind: "permission", action: "edit", target: "src/app.tsx" });
    expect(parseAsk(JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/Users/me/.ssh/config", content: "x" } }), "perm", P)).toMatchObject({ action: "edit", target: "config" });
    expect(parseAsk(JSON.stringify({ tool_name: "Read", tool_input: { file_path: `${P}/notes.md` } }), "perm", P)).toMatchObject({ action: "read", target: "notes.md" });
    expect(parseAsk(JSON.stringify({ tool_name: "WebFetch", tool_input: { url: "https://docs.example.com/a/b?token=abc", prompt: "read it" } }), "perm", P)).toMatchObject({ action: "fetch", target: "docs.example.com" });
    expect(parseAsk(JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { plan: "1. do it" } }), "perm", P)).toMatchObject({ kind: "plan" });
    expect(parseAsk(JSON.stringify({ tool_name: "mcp__github__create_issue", tool_input: { title: "x" } }), "perm", P)).toMatchObject({ kind: "permission", action: "tool", target: "mcp__github__create_issue" });
    // Codex hands its command the same way.
    expect(parseAsk(JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf build" } }), "perm", P)).toMatchObject({ action: "run", target: "rm -rf build" });
  });
  test("a question: each question, its header, whether several may be picked, and its choices", () => {
    const a = parseAsk(askQuestion(), "question", P)!;
    expect(a.kind).toBe("question");
    expect(a.questions).toEqual([
      { header: "Database", question: "Which database should we use?", multi: false, options: [{ label: "SQLite", about: "A file in the project" }, { label: "Postgres", about: "A server" }] },
      { header: "Pages", question: "Which pages need a sign in?", multi: true, options: [{ label: "Settings" }, { label: "Billing" }, { label: "Home" }] },
    ]);
    // The older way (AskUserQuestion through PermissionRequest) is a question too.
    expect(parseAsk(askQuestion("PermissionRequest"), "perm", P)!.kind).toBe("question");
  });
  test("anything else is no ask: the tool asks in its own window", () => {
    for (const bad of ["", "not json", "[]", "null", JSON.stringify({ tool_input: {} }), JSON.stringify({ tool_name: "Bash", tool_input: {} }),
      JSON.stringify({ tool_name: "AskUserQuestion", tool_input: { questions: [] } }),
      JSON.stringify({ tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "Only one choice?", options: [{ label: "Yes" }] }] } }),
      JSON.stringify({ tool_name: "AskUserQuestion", tool_input: { questions: Array.from({ length: 5 }, () => questions[0]) } })]) {
      expect(parseAsk(bad, "perm", P)).toBeNull();
    }
    // The question hook answers only questions.
    expect(parseAsk(bashPerm("npm test"), "question", P)).toBeNull();
  });
});

describe("Always writes only the tool's own allow rule, shown first", () => {
  test("only an allow rule passes, always to the project's own local settings", () => {
    const rule = alwaysRuleOf(JSON.parse(bashPerm("npm test", { permission_suggestions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }, npmRule] })));
    expect(rule).toEqual({ shown: "Bash(npm test:*)", rule: { toolName: "Bash", ruleContent: "npm test:*" } });
    // A rule with no content is the tool's name alone.
    expect(alwaysRuleOf({ permission_suggestions: [{ type: "addRules", rules: [{ toolName: "WebFetch" }], behavior: "allow", destination: "projectSettings" }] })!.shown).toBe("WebFetch");
  });
  test("no Always for a mode change, a new folder, a deny rule, a secret in the rule, or nothing suggested", () => {
    for (const s of [undefined, [], [{ type: "setMode", mode: "bypassPermissions", destination: "session" }], [{ type: "addDirectories", directories: ["/"], destination: "session" }],
      [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "rm:*" }], behavior: "deny", destination: "localSettings" }],
      [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "export KEY=sk_live_abcdefghijklmnopqrstuv:*" }], behavior: "allow", destination: "localSettings" }],
      [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "x".repeat(200) }], behavior: "allow", destination: "localSettings" }],
      [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "a:*" }, { toolName: "Bash", ruleContent: "b:*" }], behavior: "allow", destination: "localSettings" }]]) {
      expect(alwaysRuleOf({ permission_suggestions: s })).toBeNull();
    }
  });
});

describe("the reply printed by the hook, per tool", () => {
  const perm = parseAsk(bashPerm("npm test", { permission_suggestions: [npmRule, { type: "setMode", mode: "acceptEdits", destination: "session" }] }), "perm", P)!;
  test("Claude Code: allow, deny and Always", () => {
    expect(JSON.parse(replyFor("claude", "perm", perm, { choice: "allow" }))).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
    const deny = JSON.parse(replyFor("claude", "perm", perm, { choice: "deny" }));
    expect(deny.hookSpecificOutput.decision.behavior).toBe("deny");
    expect(typeof deny.hookSpecificOutput.decision.message).toBe("string");
    expect(JSON.parse(replyFor("claude", "perm", perm, { choice: "always" }))).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedPermissions: [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "npm test:*" }], behavior: "allow", destination: "localSettings" }] } } });
  });
  test("Always with no rule to write, and Codex's Always, print nothing (the tool asks itself)", () => {
    const bare = parseAsk(bashPerm("npm test"), "perm", P)!;
    expect(replyFor("claude", "perm", bare, { choice: "always" })).toBe("");
    expect(replyFor("codex", "perm", perm, { choice: "always" })).toBe("");
  });
  test("Codex: allow and deny in its PermissionRequest shape", () => {
    expect(JSON.parse(replyFor("codex", "perm", perm, { choice: "allow" }))).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
    expect(JSON.parse(replyFor("codex", "perm", perm, { choice: "deny" })).hookSpecificOutput.decision.behavior).toBe("deny");
  });
  test("a plan: Allow hands its own input back (Claude Code ignores an allow without it)", () => {
    const plan = parseAsk(JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { plan: "1. do it" } }), "perm", P)!;
    expect(JSON.parse(replyFor("claude", "perm", plan, { choice: "allow" })).hookSpecificOutput.decision).toEqual({ behavior: "allow", updatedInput: { plan: "1. do it" } });
  });
  test("a question: the picked labels, by question, in the hook's own shape", () => {
    const q = parseAsk(askQuestion(), "question", P)!;
    const out = JSON.parse(replyFor("claude", "question", q, { choice: "answer", picks: [[1], [0, 2]] }));
    expect(out).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { questions, answers: { "Which database should we use?": "Postgres", "Which pages need a sign in?": "Settings, Home" } } } });
    const older = parseAsk(askQuestion("PermissionRequest"), "perm", P)!;
    expect(JSON.parse(replyFor("claude", "perm", older, { choice: "answer", picks: [[0], [1]] })).hookSpecificOutput).toEqual({ hookEventName: "PermissionRequest", decision: { behavior: "allow", updatedInput: { questions, answers: { "Which database should we use?": "SQLite", "Which pages need a sign in?": "Billing" } } } });
  });
  test("a wrong pick, a missing question, two picks for a one pick question, or Answer in the tool: nothing", () => {
    const q = parseAsk(askQuestion(), "question", P)!;
    for (const picks of [[[9], [0]], [[0]], [[0, 1], [0]], [[0], []], [[-1], [0]], [[0], [0, 0]]]) expect(replyFor("claude", "question", q, { choice: "answer", picks })).toBe("");
    expect(replyFor("claude", "question", q, { choice: "allow" })).toBe("");
    expect(replyFor("claude", "perm", perm, { choice: "answer", picks: [[0]] })).toBe("");
    for (const c of ["tool", "nonsense"] as const) expect(replyFor("claude", "perm", perm, { choice: c as never })).toBe("");
  });
});

/** Asks with a clock the test moves and a hook whose life the test decides. */
function asksAt(dir: string, o: { wait?: number; alive?: (pid: number) => boolean } = {}) {
  let now = 1_000_000;
  const said: AskEvent[] = [];
  const t = new ToolAsks({ emit: (e) => said.push(e), now: () => now, waitMs: () => (o.wait ?? 60) * 1000, alive: o.alive ?? (() => true), timers: false });
  asks.push(t);
  let n = 0;
  const take = (text: string, tool: DoneTool = "claude", ext: "perm" | "question" = "perm", project = P) => {
    const file = join(dir, `${"a".repeat(24)}.${1000 + n++}.${tool}.${ext}`);
    t.take(project, tool, ext, file, 1000 + n - 1, text);
    return file;
  };
  return { t, said, take, add: (ms: number) => { now += ms; }, ok: (file: string) => (existsSync(`${file}.ok`) ? readFileSync(`${file}.ok`, "utf8") : null) };
}

describe("an ask is answered only by the person's press", () => {
  test("it is said, and nothing is written until the press; the press writes the reply once", () => {
    const d = tmp("press");
    const a = asksAt(d);
    const f = a.take(bashPerm("npm test", { permission_suggestions: [npmRule] }));
    const req = a.said.at(-1)!;
    expect(req).toMatchObject({ type: "toolask.request", project: P, tool: "claude", kind: "permission", action: "run", target: "npm test", always: "Bash(npm test:*)" });
    expect(a.ok(f)).toBeNull();
    const id = (req as { ask: string }).ask;
    expect(a.t.answer({ ask: id, choice: "allow" })).toBe(true);
    expect(JSON.parse(a.ok(f)!).hookSpecificOutput.decision.behavior).toBe("allow");
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.resolved", ask: id, outcome: "allowed" });
    // A second press, or a press for an ask that is gone, does nothing.
    expect(a.t.answer({ ask: id, choice: "deny" })).toBe(false);
    expect(JSON.parse(a.ok(f)!).hookSpecificOutput.decision.behavior).toBe("allow");
  });
  test("each outcome is said by its own word", () => {
    const d = tmp("outcomes");
    const a = asksAt(d);
    const ids = ["perm", "perm", "perm", "question"].map((ext, i) => { a.take(ext === "question" ? askQuestion() : bashPerm(`echo ${i}`, { permission_suggestions: [npmRule] }), "claude", ext as "perm"); return (a.said.at(-1) as { ask: string }).ask; });
    a.t.answer({ ask: ids[0], choice: "always" });
    a.t.answer({ ask: ids[1], choice: "deny" });
    a.t.answer({ ask: ids[2], choice: "tool" });
    a.t.answer({ ask: ids[3], choice: "answer", picks: [[0], [1]] });
    expect(a.said.filter((e) => e.type === "toolask.resolved").map((e) => (e as { outcome: string }).outcome)).toEqual(["always", "denied", "inTool", "answered"]);
  });
  // M114 review: this expectation changed on purpose. A refused press used to leave the ask waiting, with no word to the
  // notch, so the card went quiet until its wait ran out. Now it hands the ask back to the tool (an empty answer, never a
  // deny) and says so, so the card goes and the tool asks in its own window at once.
  test("a press that cannot be honoured (a wrong pick, Always with no rule) hands the ask back to the tool, said as inTool", () => {
    const d = tmp("refused");
    const a = asksAt(d);
    const f = a.take(askQuestion(), "claude", "question");
    const id = (a.said.at(-1) as { ask: string }).ask;
    expect(a.t.answer({ ask: id, choice: "answer", picks: [[7], [0]] })).toBe(false);
    expect(a.ok(f)).toBe("");
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.resolved", ask: id, outcome: "inTool" });
    const g = a.take(bashPerm("npm test"));
    const gid = (a.said.at(-1) as { ask: string }).ask;
    expect(a.t.answer({ ask: gid, choice: "always" })).toBe(false);
    expect(a.ok(g)).toBe("");
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.resolved", ask: gid, outcome: "inTool" });
    expect(a.t.pending()).toBe(0);
  });
  test("a press for an ask the engine no longer has (it restarted, or the ask just ended) says it is gone, so no card hangs", () => {
    const d = tmp("stale");
    const a = asksAt(d);
    expect(a.t.answer({ ask: "ta_0123456789ab", choice: "allow" })).toBe(false);
    expect(a.said).toEqual([{ type: "toolask.resolved", ask: "ta_0123456789ab", outcome: "elsewhere" }]);
    // Never for an id that is not an ask's.
    expect(a.t.answer({ ask: "../x", choice: "allow" })).toBe(false);
    expect(a.said).toHaveLength(1);
  });
  test("with both hooks on, a question that also reaches PermissionRequest never shows a second card or doubles the wait", () => {
    const d = tmp("echo");
    const a = asksAt(d, { wait: 30 });
    a.take(askQuestion(), "claude", "question");
    expect(a.said).toHaveLength(1);
    // While the question's card waits: the PermissionRequest copy is handed back at once, never said.
    const f = a.take(askQuestion("PermissionRequest"), "claude", "perm");
    expect(a.ok(f)).toBe("");
    expect(a.said).toHaveLength(1);
    // Just after the question's card ran out: the same.
    a.add(30_500); a.t.tick();
    expect(a.said.at(-1)).toMatchObject({ outcome: "expired" });
    const g = a.take(askQuestion("PermissionRequest"), "claude", "perm");
    expect(a.ok(g)).toBe("");
    expect(a.said.filter((e) => e.type === "toolask.request")).toHaveLength(1);
    // Another project's, or one long after, is its own card (only the approve hook on, it is the one way to answer).
    a.take(askQuestion("PermissionRequest"), "claude", "perm", "/Users/me/site");
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.request", kind: "question", project: "/Users/me/site" });
    a.add(60_000);
    a.take(askQuestion("PermissionRequest"), "claude", "perm");
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.request", kind: "question", project: P });
  });
  test("a request that is no ask is answered empty at once, and never said", () => {
    const d = tmp("noask");
    const a = asksAt(d);
    const f = a.take("not json");
    expect(a.ok(f)).toBe("");
    expect(a.said).toEqual([]);
  });
  test("Codex's ask offers no Always", () => {
    const d = tmp("codex");
    const a = asksAt(d);
    a.take(bashPerm("npm test", { permission_suggestions: [npmRule] }), "codex");
    expect(a.said.at(-1)).toMatchObject({ tool: "codex", kind: "permission" });
    expect((a.said.at(-1) as { always?: string }).always).toBeUndefined();
  });
});

describe("a closed, slow or stopped Squibby never blocks the tool", () => {
  test("the wait: an empty answer after the wait set, said as expired", () => {
    const d = tmp("wait");
    const a = asksAt(d, { wait: 30 });
    const f = a.take(bashPerm("npm test"));
    a.add(29_000); a.t.tick();
    expect(a.ok(f)).toBeNull();
    a.add(1_500); a.t.tick();
    expect(a.ok(f)).toBe("");
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.resolved", outcome: "expired" });
    expect(a.t.pending()).toBe(0);
  });
  test("the wait setting: 30 seconds, 1 minute or 2 minutes; anything else is 1 minute", () => {
    expect(ASK_WAIT_CHOICES).toEqual([30, 60, 120]);
    expect(askWaitOf("30")).toBe(30);
    expect(askWaitOf("120")).toBe(120);
    for (const bad of [undefined, "0", "500", "x", null]) expect(askWaitOf(bad)).toBe(60);
  });
  test("answered in the tool: the hook's process gone ends the card, said as elsewhere", () => {
    const d = tmp("elsewhere");
    let up = true;
    const a = asksAt(d, { alive: () => up });
    a.take(bashPerm("npm test"));
    a.t.tick();
    expect(a.t.pending()).toBe(1);
    up = false;
    a.t.tick();
    expect(a.t.pending()).toBe(0);
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.resolved", outcome: "elsewhere" });
  });
  test("the tool's done signal ends its asks in that project, not another tool's or project's", () => {
    const d = tmp("done");
    const a = asksAt(d);
    a.take(bashPerm("a"), "claude");
    a.take(bashPerm("b"), "codex");
    a.take(bashPerm("c"), "claude", "perm", "/Users/me/site");
    a.t.done(P, "claude");
    expect(a.t.pending()).toBe(2);
    expect(a.said.at(-1)).toMatchObject({ type: "toolask.resolved", outcome: "done" });
  });
  test("Stop everything: every ask ends with an empty answer (never a deny), said as stopped", () => {
    const d = tmp("stop");
    const a = asksAt(d);
    const files = [a.take(bashPerm("a")), a.take(askQuestion(), "claude", "question"), a.take(bashPerm("b"), "codex")];
    a.t.stop();
    for (const f of files) expect(a.ok(f)).toBe("");
    expect(a.said.filter((e) => e.type === "toolask.resolved").map((e) => (e as { outcome: string }).outcome)).toEqual(["stopped", "stopped", "stopped"]);
    expect(a.t.pending()).toBe(0);
  });
  test("at most a few asks wait at once: one more is answered empty at once", () => {
    const d = tmp("many");
    const a = asksAt(d);
    const files = Array.from({ length: 9 }, (_, i) => a.take(bashPerm(`echo ${i}`)));
    expect(a.t.pending()).toBe(8);
    expect(a.ok(files[8])).toBe("");
  });
  test("every event said passes the protocol, and carries nothing of the request beyond the card's words", () => {
    const d = tmp("protocol");
    const a = asksAt(d);
    a.take(bashPerm("STRIPE_SECRET_KEY=sk_live_abcdefghijklmnopqrstuv npm test", { permission_suggestions: [npmRule] }));
    a.take(askQuestion(), "claude", "question");
    a.take(JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { plan: "secret plan text" } }));
    a.t.stop();
    for (const e of a.said) {
      const r = parseEvent(JSON.stringify({ v: PROTOCOL_VERSION, id: "x", ...e }));
      expect(r.ok).toBe(true);
      const text = JSON.stringify(e);
      expect(text).not.toContain("sk_live_abc");
      expect(text).not.toContain("secret plan text");
      expect(text).not.toContain("session");
      expect(text).not.toContain("description");
    }
  });
});

describe("the protocol", () => {
  test("the hook kinds agree, and the command checks its shape", () => {
    expect([...PROTOCOL_HOOK_KINDS]).toEqual([...HOOK_KINDS]);
    expect(HOOK_KINDS).toContain("approve");
    expect(HOOK_KINDS).toContain("answer");
    const ok = (c: Record<string, unknown>) => parseCommand(JSON.stringify({ v: PROTOCOL_VERSION, id: "c", type: "toolask.answer", ...c })).ok;
    expect(ok({ ask: "ta_0123456789ab", choice: "allow" })).toBe(true);
    expect(ok({ ask: "ta_0123456789ab", choice: "answer", picks: [[0], [1, 2]] })).toBe(true);
    expect(ok({ ask: "ta_0123456789ab", choice: "yes" })).toBe(false);
    expect(ok({ ask: "../x", choice: "allow" })).toBe(false);
    expect(ok({ ask: "ta_0123456789ab", choice: "answer", picks: "0" })).toBe(false);
    expect(ok({ ask: "ta_0123456789ab", choice: "answer", picks: [[0.5]] })).toBe(false);
  });
});

describe("the hooks, in each tool's own file", () => {
  test("Claude Code: approve under PermissionRequest and answer under PreToolUse on AskUserQuestion; Codex: approve only", () => {
    expect(TOOL_HOOKS.claude).toContain("approve");
    expect(TOOL_HOOKS.claude).toContain("answer");
    expect(TOOL_HOOKS.codex).toContain("approve");
    expect(TOOL_HOOKS.codex).not.toContain("answer");
    for (const t of ["cursor", "copilot", "antigravity", "gemini", "windsurf"] as const) { expect(TOOL_HOOKS[t]).not.toContain("approve"); expect(TOOL_HOOKS[t]).not.toContain("answer"); }
    expect(eventOf("claude", "approve")).toBe("PermissionRequest");
    expect(eventOf("codex", "approve")).toBe("PermissionRequest");
    expect(eventOf("claude", "answer")).toBe("PreToolUse");
  });
  test("two of ours under one event stay apart: add, check and remove touch only their own kind", () => {
    const data = tmp("data"), proj = tmp("proj");
    const s = new DoneSignals(data); signals.push(s);
    s.add(proj, "claude", "guard");
    s.add(proj, "claude", "answer");
    let j = JSON.parse(readFileSync(join(proj, HOOK_FILE.claude), "utf8"));
    expect(j.hooks.PreToolUse.map((e: { matcher: string }) => e.matcher)).toEqual(["Bash|Read", "AskUserQuestion"]);
    expect(s.plan(proj, "claude", "guard").on).toBe(true);
    expect(s.plan(proj, "claude", "answer").on).toBe(true);
    s.remove(proj, "claude", "guard");
    expect(s.plan(proj, "claude", "guard").on).toBe(false);
    expect(s.plan(proj, "claude", "answer").on).toBe(true);
    // Codex: the waiting signal and approve both under PermissionRequest.
    s.add(proj, "codex", "waiting");
    s.add(proj, "codex", "approve");
    j = JSON.parse(readFileSync(join(proj, HOOK_FILE.codex), "utf8"));
    expect(j.hooks.PermissionRequest.length).toBe(2);
    expect(s.plan(proj, "codex", "waiting").on && s.plan(proj, "codex", "approve").on).toBe(true);
    s.remove(proj, "codex", "approve");
    expect(s.plan(proj, "codex", "waiting").on).toBe(true);
    expect(s.plan(proj, "codex", "approve").on).toBe(false);
    // Adding again adds once.
    s.add(proj, "codex", "waiting");
    expect(JSON.parse(readFileSync(join(proj, HOOK_FILE.codex), "utf8")).hooks.PermissionRequest.length).toBe(1);
  });
  test("the card shows the exact lines, with the wait the tool gives the hook", () => {
    const data = tmp("data"), proj = tmp("proj");
    const s = new DoneSignals(data); signals.push(s);
    const plan = s.plan(proj, "claude", "approve");
    expect(plan.adds).toContain("PermissionRequest");
    expect(plan.adds).toContain(".perm");
    expect(JSON.parse(plan.adds).hooks.PermissionRequest[0].hooks[0].timeout).toBe(130);
    const ans = JSON.parse(s.plan(proj, "claude", "answer").adds).hooks.PreToolUse[0];
    expect(ans.matcher).toBe("AskUserQuestion");
    expect(ans.hooks[0].command).toContain(".question");
  });
});

describe("the hook command, run by sh", () => {
  const run = (cmd: string, input: string) => Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(input), stdout: "pipe" });
  test("with Squibby closed it writes nothing, prints nothing and exits 0 at once", async () => {
    const g = tmp("guard");
    const cmd = askCommand(g, "a".repeat(24), "claude", ASK_HOOK_EXT.approve);
    const t0 = Date.now();
    const p = run(cmd, bashPerm("npm test"));
    expect(await p.exited).toBe(0);
    expect(await new Response(p.stdout).text()).toBe("");
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(readdirSync(g)).toEqual([]);
  });
  test("it hands the request over, waits, prints the answer and cleans up", async () => {
    const g = tmp("guard");
    writeFileSync(join(g, GUARD_PID), String(process.pid));
    const p = run(askCommand(g, "a".repeat(24), "claude", ASK_HOOK_EXT.approve), bashPerm("npm test"));
    let req = "";
    await until(() => { req = readdirSync(g).find((n) => n.endsWith(".claude.perm")) ?? ""; return !!req; });
    expect(readFileSync(join(g, req), "utf8")).toBe(bashPerm("npm test"));
    writeFileSync(join(g, `${req}.ok`), '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}');
    expect(await p.exited).toBe(0);
    expect(JSON.parse(await new Response(p.stdout).text()).hookSpecificOutput.decision.behavior).toBe("allow");
    expect(readdirSync(g).filter((n) => n !== GUARD_PID)).toEqual([]);
  });
  test("an empty answer prints nothing: the tool asks in its own window", async () => {
    const g = tmp("guard");
    writeFileSync(join(g, GUARD_PID), String(process.pid));
    const p = run(askCommand(g, "a".repeat(24), "codex", ASK_HOOK_EXT.approve), bashPerm("npm test"));
    let req = "";
    await until(() => { req = readdirSync(g).find((n) => n.endsWith(".codex.perm")) ?? ""; return !!req; });
    writeFileSync(join(g, `${req}.ok`), "");
    expect(await p.exited).toBe(0);
    expect(await new Response(p.stdout).text()).toBe("");
  });
  test("Squibby gone mid wait: the hook stops waiting within a second", async () => {
    const g = tmp("guard");
    const fake = Bun.spawn(["/bin/sleep", "30"]);
    writeFileSync(join(g, GUARD_PID), String(fake.pid));
    const p = run(askCommand(g, "a".repeat(24), "claude", ASK_HOOK_EXT.answer), askQuestion());
    await until(() => readdirSync(g).some((n) => n.endsWith(".claude.question")));
    fake.kill(); await fake.exited;
    const t0 = Date.now();
    expect(await p.exited).toBe(0);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(await new Response(p.stdout).text()).toBe("");
  });
});

describe("the guard folder hands each request to the asks", () => {
  test("a .perm and a .question note are read, removed, and become asks; the person's press is printed by the real hook", async () => {
    const data = tmp("data"), proj = tmp("proj");
    const s = new DoneSignals(data); signals.push(s);
    s.add(proj, "claude", "approve");
    const said: AskEvent[] = [];
    const ta = new ToolAsks({ emit: (e) => said.push(e), waitMs: () => 60_000 }); asks.push(ta);
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "cp_1" }), emit: () => {}, toolAsk: (p, tool, ext, file, pid, text) => ta.take(p, tool, ext, file, pid, text) });
    guards.push(g);
    expect(g.start()).toBe(true);
    const cmd = JSON.parse(s.plan(proj, "claude", "approve").adds).hooks.PermissionRequest[0].hooks[0].command as string;
    const p = Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(bashPerm("npm test")), stdout: "pipe" });
    await until(() => said.some((e) => e.type === "toolask.request"));
    // The request is gone from the folder as soon as it is read; only the hook's wait is left.
    expect(readdirSync(s.guardFolder).filter((n) => n.endsWith(".perm"))).toEqual([]);
    const id = (said.find((e) => e.type === "toolask.request") as { ask: string }).ask;
    expect(ta.answer({ ask: id, choice: "deny" })).toBe(true);
    expect(await p.exited).toBe(0);
    expect(JSON.parse(await new Response(p.stdout).text()).hookSpecificOutput.decision.behavior).toBe("deny");
    expect(readdirSync(s.guardFolder).filter((n) => n !== GUARD_PID)).toEqual([]);
  });
  test("with no asks wired (an older engine), a request is answered empty at once", async () => {
    const data = tmp("data"), proj = tmp("proj");
    const s = new DoneSignals(data); signals.push(s);
    s.add(proj, "claude", "approve");
    const g = new HookGuard(s.guardFolder, { projectOf: (t) => s.projectOf(t), snapshot: async () => ({ id: "cp_1" }), emit: () => {} });
    guards.push(g);
    g.start();
    const cmd = JSON.parse(s.plan(proj, "claude", "approve").adds).hooks.PermissionRequest[0].hooks[0].command as string;
    const t0 = Date.now();
    const p = Bun.spawn(["/bin/sh", "-c", cmd], { stdin: new TextEncoder().encode(bashPerm("npm test")), stdout: "pipe" });
    expect(await p.exited).toBe(0);
    expect(await new Response(p.stdout).text()).toBe("");
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  test("a request from an unknown project is answered empty and never shown", async () => {
    const d = tmp("guardonly");
    mkdirSync(d, { recursive: true });
    const said: AskEvent[] = [];
    const ta = new ToolAsks({ emit: (e) => said.push(e), waitMs: () => 60_000 }); asks.push(ta);
    const g = new HookGuard(d, { projectOf: () => null, snapshot: async () => ({ id: "cp_1" }), emit: () => {}, toolAsk: (p, tool, ext, file, pid, text) => ta.take(p, tool, ext, file, pid, text) });
    guards.push(g);
    g.start();
    const name = `${"b".repeat(24)}.4242.claude.perm`;
    writeFileSync(join(d, name), bashPerm("npm test"));
    await g.take(name);
    expect(readFileSync(join(d, `${name}.ok`), "utf8")).toBe("");
    expect(said).toEqual([]);
  });
});

describe("the shared fixtures and the engine's wiring", () => {
  const lines = (f: string) => readFileSync(new URL(`../../protocol/fixtures/${f}`, import.meta.url), "utf8").split("\n").filter((l) => l.trim());
  test("every M114 fixture passes, and the events carry only the card's words", () => {
    const cmds = lines("commands.jsonl").filter((l) => l.includes('"id":"m114'));
    const evs = lines("events.jsonl").filter((l) => l.includes('"id":"m114'));
    expect(cmds.length).toBe(6);
    expect(evs.length).toBe(6);
    for (const l of cmds) expect(parseCommand(l).ok).toBe(true);
    for (const l of evs) expect(parseEvent(l).ok).toBe(true);
    // A request with keys of the tool's own (its session, its input) is refused.
    const req = JSON.parse(evs[0]!);
    expect(parseEvent(JSON.stringify({ ...req, session_id: "s1" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...req, tool_input: { command: "npm test" } })).ok).toBe(false);
    // Always only on Claude Code's permission card; a question only from Claude Code.
    expect(parseEvent(JSON.stringify({ ...req, tool: "codex" })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...JSON.parse(evs[1]!), tool: "codex" })).ok).toBe(false);
  });
  test("main.ts hands the guard's requests to the asks, the press to them, and reads the wait setting", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("toolAsk: (p, tool, ext, file, pid, text) => toolAsks.take(p, tool, ext, file, pid, text),");
    expect(main).toContain(`if (cmd.type === "toolask.answer") { toolAsks.answer(cmd); return; }`);
    expect(main).toContain(`waitMs: () => askWaitOf(runnerSettings.get("notch.askWait")) * 1000`);
  });
});
