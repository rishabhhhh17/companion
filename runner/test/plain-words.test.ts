// Finding J (first Mac session): the model told the person "The Squibby hook is blocking me". Two things reach the model and
// so reach the person in the model's words: the standing instructions every task gets, and the reason given when something
// is refused. The instructions now say what to call things; the refusals read in everyday words, and none uses a word that
// belongs to how Squibby or Claude Code is built.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import type { Engine, EngineOptions, Turn, ToolResult } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { evaluate, NOT_GIVEN, refusal } from "../src/safety.ts";
import { buildSdkOptions, COMPANION_APPEND } from "../src/sdkEngine.ts";
import { PRODUCT } from "../src/names.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-pw-${l}-`))); made.push(d); return d; };

// Words that belong to how Squibby or Claude Code is built. A person never needs them.
const JARGON = /\b(hooks?|sandbox(?:es|ed)?|permission modes?|PreToolUse|PostToolUse|canUseTool|bypassPermissions|acceptEdits|settingSources|MCP|allowlist|denylist|deny rules?|tool_use|sub ?agents?)\b/i;

describe("the standing instructions say what to call things", () => {
  test("never hook, sandbox, permission mode, tool names or Squibby's own files", () => {
    expect(COMPANION_APPEND).toMatch(/never say[^.]*"hook"[^.]*"sandbox"[^.]*"permission mode"/i);
    expect(COMPANION_APPEND).toMatch(/names of tools/i);
    expect(COMPANION_APPEND).toMatch(/\.companion|own files/i);
  });
  test("when something is not allowed: Squibby does not let tasks <reason>, and what the person can do", () => {
    expect(COMPANION_APPEND).toContain("Squibby does not let tasks");
    expect(COMPANION_APPEND).toMatch(/what the person can do/i);
  });
  test("the safety rules and the question rule are still there", () => {
    expect(COMPANION_APPEND).toMatch(/never touch files outside the project/);
    expect(COMPANION_APPEND).toMatch(/Never ask for a password/);
    expect(COMPANION_APPEND).toMatch(/one short question/);
  });
});

describe("the fallback answer the model may see reads in everyday words", () => {
  test("the permission fallback says Squibby decides this itself, never names a hook", async () => {
    const o = buildSdkOptions({ project: "/p", model: "m", budgetUsd: 1, claudeBinary: "/x", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal }) as any;
    const r = await o.canUseTool("Bash", {}, {});
    expect(r).toEqual({ behavior: "deny", message: `${PRODUCT} decides this itself.` });
    expect(r.message).not.toMatch(JARGON);
  });
});

describe("a refusal reads in everyday words", () => {
  test("it says Squibby does not allow it, why, and tells the model to say so plainly", () => {
    const r = refusal("writes must stay inside the project folder");
    expect(r).toContain("Squibby does not allow this in a task: writes must stay inside the project folder.");
    expect(r).toMatch(/plain words/);
    expect(r).not.toMatch(/Blocked by/);
  });
  test("a reason that already says who decided is not given a second time", () => {
    expect(refusal("Squibby does not let tasks hand work to helpers. Do the work yourself.")).toMatch(/^Squibby does not let tasks hand work to helpers\. Do the work yourself\. Say so/);
  });
  test("a reason that already ends in a full stop is not given two", () => {
    expect(refusal("only public web pages may be opened.")).toContain("opened. Say so");
    expect(refusal("only public web pages may be opened.")).not.toContain("..");
  });
});

describe("every reason a task can be refused for is free of the words of how it is built", () => {
  const project = "/Users/me/shop";
  const calls: [string, Record<string, unknown>][] = [
    ["Write", { file_path: "/etc/hosts", content: "x" }],
    ["Write", { file_path: `${project}/.git/config`, content: "x" }],
    ["Write", { file_path: `${project}/.claude/settings.json`, content: "{}" }],
    ["Write", { file_path: `${project}/.companion/rules.json`, content: "{}" }],
    ["Edit", { file_path: `${project}/.env`, old_string: "A=1", new_string: "KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789" }],
    ["Read", { file_path: `${project}/.env` }],
    ["Bash", { command: "sudo rm -rf /" }],
    ["Bash", { command: "screencapture -x /tmp/a.png" }],
    ["Bash", { command: "mv a.txt ~/Desktop/" }],
    ["Bash", { command: "cat .env" }],
    ["Bash", { command: "echo KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 >> .env" }],
    ["Bash", { command: "rm -rf ~" }],
    ["Bash", { command: "mkfs.ext4 /dev/disk2" }],
    ["Bash", { command: "defaults write com.apple.dock autohide -bool true" }],
    ["WebFetch", { url: "http://localhost:8080/admin", prompt: "x" }],
    ["WebFetch", { url: "not a web address", prompt: "x" }],
    ["Glob", { pattern: "**/.env*" }],
  ];
  test("the refusals in the safety rules", () => {
    const reasons: string[] = [];
    for (const [tool, input] of calls) { const v = evaluate({ tool, input }, { project }); if (v.decision === "deny") reasons.push(v.reason); }
    expect(reasons.length).toBeGreaterThan(8);
    for (const r of reasons) { expect(r, r).not.toMatch(JARGON); expect(r, r).not.toMatch(/\b(Bash|PreToolUse|\.claude\/|\.companion\/)/); }
  });
  test("web search off, and the tools Squibby does not give", () => {
    const off = evaluate({ tool: "WebSearch", input: { query: "x" } }, { project, webSearch: false });
    expect(off.decision).toBe("deny");
    expect(off.reason).not.toMatch(JARGON);
    for (const [tool, why] of NOT_GIVEN) { expect(why, tool).not.toMatch(JARGON); expect(why, tool).not.toMatch(/\bagents?\b/i); }
  });
  test("the reasons for the git folder and Claude's own settings do not say 'agent'", () => {
    for (const p of [`${project}/.git/config`, `${project}/.claude/settings.json`]) {
      const v = evaluate({ tool: "Write", input: { file_path: p, content: "x" } }, { project });
      expect(v.decision).toBe("deny");
      expect(v.reason, v.reason).not.toMatch(/\bagents?\b/i);
      expect(v.reason).toMatch(/^Squibby does not let tasks|\bnot (?:for|to be)/);
    }
  });
});

describe("what the model is told when a task is refused, through the runner", () => {
  function engineThatTries(tools: { name: string; input: Record<string, unknown> }[], seen: string[]): Engine {
    return {
      executesTools: true,
      async *start(o: EngineOptions): AsyncGenerator<Turn, void, ToolResult | undefined> {
        for (const t of tools) seen.push((await o.authorize(t)).reason);
        yield { text: "ok", costUsd: 0.01 };
      },
    };
  }
  test("a refused write, a refused settings read and a 'no' to a card are all plain", async () => {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const seen: string[] = [];
    const events: Event[] = [];
    const runner = new AgentRunner({
      shadowRoot: tmp("s"), log: new TaskLog(":memory:"), emit: (e) => { events.push(e); if (e.type === "approval.request") queueMicrotask(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never)); },
      engine: engineThatTries([{ name: "Write", input: { file_path: "/etc/hosts", content: "x" } }, { name: "Read", input: { file_path: join(project, ".env") } }, { name: "Bash", input: { command: "git push origin main" } }], seen),
      proof: async () => ({ verdict: "passed", steps: [] }),
    });
    await runner.handle({ v: 1, id: "1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    expect(seen.length).toBe(3);
    for (const r of seen) { expect(r, r).not.toMatch(JARGON); expect(r, r).not.toMatch(/Blocked by/); }
    expect(seen[0]).toMatch(/^Squibby does not allow this in a task: /);
    expect(seen[2]).toMatch(/person/i);
    expect(seen[2]).not.toMatch(/\buser\b/i);
  });
});
