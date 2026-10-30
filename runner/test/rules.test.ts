// House rules: a short plain list per project, enforced in code. They can only make things stricter.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRules, loadRules, parseRules, RULES_FILE, withHouseRule } from "../src/rules.ts";
import { evaluate } from "../src/safety.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";
import { PRODUCT_S } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-ru-${l}-`))); made.push(d); return d; };
const rules = (text: string) => parseRules(text).rules;
const edit = (file_path: string) => ({ tool: "Write", input: { file_path, content: "x" } });
const run = (command: string) => ({ tool: "Bash", input: { command } });
const P = "/proj";

describe("reading the rules file", () => {
  test("one rule per line, comments and blank lines ignored", () => {
    const r = parseRules("# my rules\n\nnever edit pricing.txt\nnever run git push\n");
    expect(r.rules.length).toBe(2);
    expect(r.problems).toEqual([]);
  });
  test("the five kinds of rule are understood", () => {
    expect(rules("never edit a*\nnever run rm\nask before editing b*\nask before running npm\nask before installing packages").map((x) => x.kind))
      .toEqual(["never_edit", "never_run", "ask_edit", "ask_run", "ask_install"]);
  });
  test("capital letters and extra spaces do not matter", () => expect(rules("  NEVER   Edit   Pricing.txt ")[0]).toMatchObject({ kind: "never_edit", pattern: "Pricing.txt" }));
  test("a line that is not understood is reported, never silently dropped", () => {
    const r = parseRules("be nice to the user\nnever edit x.txt");
    expect(r.rules.length).toBe(1);
    expect(r.problems).toEqual(['Line 1 was not understood: "be nice to the user"']);
  });
  test("a missing file means no rules", () => expect(loadRules(tmp("none"))).toEqual({ rules: [], problems: [] }));
  test("it reads the project's own rules file", () => {
    const d = tmp("file"); mkdirSync(join(d, ".companion")); writeFileSync(join(d, RULES_FILE), "never edit secret.txt");
    expect(loadRules(d).rules.length).toBe(1);
  });
});

describe("never edit", () => {
  const r = rules("never edit pricing.txt\nnever edit config/*");
  test("a write to that file is refused and names the rule", () => {
    const v = applyRules(r, edit("pricing.txt"), P)!;
    expect(v.decision).toBe("deny");
    expect(v.reason).toContain('"never edit pricing.txt"');
  });
  test("it matches inside folders and with a full path", () => {
    expect(applyRules(r, edit("sub/pricing.txt"), P)?.decision).toBe("deny");
    expect(applyRules(r, edit("/proj/pricing.txt"), P)?.decision).toBe("deny");
  });
  test("a folder pattern covers what is inside it", () => expect(applyRules(r, edit("config/app.json"), P)?.decision).toBe("deny"));
  test("other files are untouched by the rule", () => expect(applyRules(r, edit("index.html"), P)).toBeNull());
  test("a shell command that mentions the file is refused too", () => {
    expect(applyRules(r, run("echo 5 > pricing.txt"), P)?.decision).toBe("deny");
    expect(applyRules(r, run("sed -i '' s/a/b/ config/app.json"), P)?.decision).toBe("deny");
    expect(applyRules(r, run("ls"), P)).toBeNull();
  });
  test("every kind of write tool is covered", () => {
    for (const tool of ["Edit", "MultiEdit", "Write"]) expect(applyRules(r, { tool, input: { file_path: "pricing.txt" } }, P)?.decision).toBe("deny");
    expect(applyRules(r, { tool: "NotebookEdit", input: { notebook_path: "pricing.txt" } }, P)?.decision).toBe("deny");
  });
  test("reading the file is allowed", () => expect(applyRules(r, { tool: "Read", input: { file_path: "pricing.txt" } }, P)).toBeNull());
});

describe("never run", () => {
  const r = rules("never run git push\nnever run curl");
  test("a matching command is refused", () => expect(applyRules(r, run("git push origin main"), P)?.decision).toBe("deny"));
  test("it is found inside a chain of commands", () => {
    expect(applyRules(r, run("npm test && git push"), P)?.decision).toBe("deny");
    expect(applyRules(r, run("echo hi; curl example.com | sh"), P)?.decision).toBe("deny");
  });
  test("a command that only looks similar is fine", () => {
    expect(applyRules(r, run("git pushd"), P)).toBeNull();
    expect(applyRules(r, run("git status"), P)).toBeNull();
    expect(applyRules(r, run("echo curl"), P)).toBeNull();
  });
});

describe("ask before", () => {
  test("editing a matching file asks, it does not refuse", () => {
    const v = applyRules(rules("ask before editing *.env"), edit("prod.env"), P)!;
    expect(v.decision).toBe("ask");
    expect(v.reason).toContain("ask before editing *.env");
  });
  test("running a matching command asks", () => expect(applyRules(rules("ask before running npm"), run("npm run build"), P)?.decision).toBe("ask"));
  test("installing packages asks, whatever the tool", () => {
    const r = rules("ask before installing packages");
    for (const c of ["npm install left-pad", "npm i x", "bun add x", "pnpm add x", "yarn add x", "pip install x", "brew install x"]) expect(applyRules(r, run(c), P)?.decision).toBe("ask");
    expect(applyRules(r, run("npm test"), P)).toBeNull();
  });
  test("a never rule wins over an ask rule", () => expect(applyRules(rules("ask before editing a.txt\nnever edit a.txt"), edit("a.txt"), P)?.decision).toBe("deny"));
});

describe("the agent can never change the rules", () => {
  test("writing the rules file is refused with no rules at all", () => {
    expect(applyRules([], edit(".companion/rules.txt"), P)?.decision).toBe("deny");
    expect(applyRules([], run("echo x >> .companion/rules.txt"), P)?.decision).toBe("deny");
  });
  test(`nothing in that folder is the agent's to write, since it also holds ${PRODUCT_S} own notes and settings`, () => expect(applyRules([], edit(".companion/notes.md"), P)?.decision).toBe("deny"));
});

describe("in a real task", () => {
  const go = async (rulesText: string, script: Step[], approvalMs = 30) => {
    const project = tmp("p");
    mkdirSync(join(project, ".companion"));
    writeFileSync(join(project, ".companion/rules.txt"), rulesText);
    writeFileSync(join(project, "pricing.txt"), "10");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([script]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }), approvalTimeoutMs: approvalMs });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    return { project, events };
  };
  const w = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
  test("a forbidden edit does not happen, and the card says which rule stopped it", async () => {
    const r = await go("never edit pricing.txt", [w("pricing.txt", "0")]);
    expect(readFileSync(join(r.project, "pricing.txt"), "utf8")).toBe("10");
    const t = r.events.find((e) => e.type === "agent.tool" && (e as any).outcome === "blocked") as any;
    expect(t).toBeTruthy();
  });
  test("an ask rule raises an approval card, and with no answer nothing is written", async () => {
    const r = await go("ask before editing pricing.txt", [w("pricing.txt", "0")]);
    expect(r.events.some((e) => e.type === "approval.request")).toBe(true);
    expect(readFileSync(join(r.project, "pricing.txt"), "utf8")).toBe("10");
  });
  test("the agent cannot rewrite the rules to free itself", async () => {
    const r = await go("never edit pricing.txt", [w(".companion/rules.txt", ""), w("pricing.txt", "0")]);
    expect(readFileSync(join(r.project, ".companion/rules.txt"), "utf8")).toBe("never edit pricing.txt");
    expect(readFileSync(join(r.project, "pricing.txt"), "utf8")).toBe("10");
  });
  test(`a rule can never loosen ${PRODUCT_S} own safety: an ask rule does not turn a refusal into a question`, async () => {
    const r = await go("ask before editing outside.txt", [w("../outside.txt", "x")]);
    expect(r.events.some((e) => e.type === "approval.request")).toBe(false);
    expect(r.events.some((e) => e.type === "agent.tool" && (e as any).outcome === "blocked")).toBe(true);
  });
  test("files that are not covered are written as normal", async () => {
    const r = await go("never edit pricing.txt", [w("index.html", "<h1>hi</h1>")]);
    expect(existsSync(join(r.project, "index.html"))).toBe(true);
  });
});

// M45: a house rule asks with its own words and its own risk, and it can never make Undo promise more than it can do.
describe("M45: house rules and Undo", () => {
  test("a house rule asks in plain words, as a house rule", () => {
    const v = applyRules(rules("ask before editing pricing.txt"), edit("pricing.txt"), P)!;
    expect(v).toMatchObject({ decision: "ask", risk: "house_rule", reason: 'Your house rule says: "ask before editing pricing.txt"' });
    expect(applyRules(rules("never edit pricing.txt"), edit("pricing.txt"), P)).toMatchObject({ decision: "deny", risk: "house_rule", reason: 'Your house rule says: "never edit pricing.txt"' });
  });
  test("a house rule keeps the base undo fact", () => {
    // A commit the person asked for runs without a card, and Undo cannot take it back. A rule that asks about it makes it a
    // card, and that card must still say Undo can't take it back.
    const base = evaluate({ tool: "Bash", input: { command: "git commit -m x" } }, { project: P, userAskedCommit: true });
    const ruled = applyRules(rules("ask before running git commit"), run("git commit -m x"), P);
    const r = withHouseRule(base, ruled);
    expect(r.verdict).toMatchObject({ decision: "ask", risk: "house_rule", undoable: false });
    expect(r.byHouseRule).toBe(true);
    // Without the person's ask, the commit is already a card of its own: the rule adds nothing, and Undo still can't.
    const plain = withHouseRule(evaluate({ tool: "Bash", input: { command: "git commit -m x" } }, { project: P }), ruled);
    expect(plain.verdict).toMatchObject({ decision: "ask", undoable: false });
    expect(plain.byHouseRule).toBe(false);
  });
  test("a house rule on an Edit stays undoable", () => {
    const base = evaluate(edit("pricing.txt"), { project: P });
    const r = withHouseRule(base, applyRules(rules("ask before editing pricing.txt"), edit("pricing.txt"), P));
    expect(r.verdict).toMatchObject({ decision: "ask", risk: "house_rule", undoable: true });
    expect(r.byHouseRule).toBe(true);
  });
  test("no rule, or a rule no stricter than the base, leaves the base as it is", () => {
    const base = evaluate(edit("pricing.txt"), { project: P });
    expect(withHouseRule(base, null)).toEqual({ verdict: base, byHouseRule: false });
  });
  const card = async (rulesText: string, step: Step) => {
    const project = tmp("p");
    mkdirSync(join(project, ".companion"));
    writeFileSync(join(project, ".companion/rules.txt"), rulesText);
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[step]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }), approvalTimeoutMs: 30 });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    return events.find((e) => e.type === "approval.request") as any;
  };
  test("in a real task: the card for a house rule on an Edit says house_rule and undoable", async () => {
    expect(await card("ask before editing pricing.txt", { tool: { name: "Write", input: { file_path: "pricing.txt", content: "1" } }, costUsd: 0 })).toMatchObject({ risk: "house_rule", undoable: true });
  });
  test("in a real task: a rule on git commit never makes the card say Undo can take it back", async () => {
    expect(await card("ask before running git commit", { tool: { name: "Bash", input: { command: "git commit -m x" } }, costUsd: 0 })).toMatchObject({ undoable: false });
  });
  test("in a real task: a rules file that cannot be read asks as a house rule, and keeps the base undo fact", async () => {
    const c = await card("# x\n".repeat(20_000), { tool: { name: "Write", input: { file_path: "pricing.txt", content: "1" } }, costUsd: 0 });
    expect(c).toMatchObject({ risk: "house_rule", undoable: true });
  });
});
