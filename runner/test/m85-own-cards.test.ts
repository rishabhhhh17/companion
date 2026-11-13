// M85: Squibby's own approval cards gain HeyClicky's three choices where they fit (its changelog, 12 Sep 2026: Allow once,
// Always allow, Not now). Always allow for this project is offered only for a plain read of one file outside the project,
// and is saved by the engine, into the rules file as it is on disk, as a house rule the person can see and remove ("allow reading <file>"); never for anything
// destructive or live, which only ever get Allow once. Each answer is kept in History with its reason. The receipt carries
// "Not what you asked for" and "Said one thing, ran another". Stand in engine and temporary folders only; nothing runs.
import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ToolExecutor } from "../src/agent.ts";
import { ScriptedEngine, type Engine, type Step } from "../src/engine.ts";
import { addHouseRule, allowedByAlways, alwaysLineFor, parseRules } from "../src/rules.ts";
import { evaluate } from "../src/safety.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m85-${l}-`))); made.push(d); return d; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0 });
const read = (file_path: string): Step => ({ tool: { name: "Read", input: { file_path } }, costUsd: 0 });
const OUTSIDE = join(realpathSync(tmpdir()), "companion-m85-elsewhere", "notes.md");
const waitFor = async (cond: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 5)); } };
const start = (project: string, prompt = "Do it") => ({ v: 1 as const, id: "c-1", type: "agent.start" as const, project, agent: "builder-1", mode: "drive" as const, prompt, model: "m", budgetUsd: 3 });
const requests = (events: Event[]) => events.filter((e) => e.type === "approval.request") as any[];

function setup(engine: Engine, o: { offerAlways?: boolean } = {}) {
  const project = tmp("proj");
  const events: Event[] = [];
  const ran: string[] = [];
  const log = new TaskLog(":memory:");
  const exec: ToolExecutor = async (call) => { ran.push(String(call.input.command ?? call.input.file_path)); return { ok: true, output: "" }; };
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log, emit: (e: Event) => events.push(e), executor: exec, proof: async () => ({ verdict: "passed", steps: [] }), approvalTimeoutMs: 2000,
    ...(o.offerAlways === false ? { settings: { get: (k: string) => (k === "approval.offerAlways" ? false : undefined) } } : {}) } as never);
  return { project, events, ran, runner, log };
}
async function answer(r: { events: Event[]; runner: AgentRunner }, n: number, decision: "allow" | "deny", scope: "once" | "task" | "project") {
  await waitFor(() => requests(r.events).length >= n);
  await r.runner.handle({ v: 1, id: `ans${n}`, type: "approval.resolve", approval: requests(r.events)[n - 1].approval, decision, scope });
}

describe("where Always allow fits (rules.ts)", () => {
  const p = "/tmp/proj";
  const v = (call: { tool: string; input: Record<string, unknown> }) => evaluate(call, { project: p });
  test("a plain read of one file outside the project: the exact line", () => {
    const call = { tool: "Read", input: { file_path: "/Users/demo/notes/plan.md" } };
    expect(alwaysLineFor(call, v(call), false)).toBe("allow reading /Users/demo/notes/plan.md");
  });
  test("never for a command, an edit, a live or destructive ask, a folder search, a path with spaces or a relative path", () => {
    for (const call of [
      { tool: "Bash", input: { command: "vercel --prod" } }, { tool: "Bash", input: { command: "cat /Users/demo/a.md" } },
      { tool: "Write", input: { file_path: "/Users/demo/a.md", content: "x" } }, { tool: "Grep", input: { pattern: "x", path: "/Users/demo" } },
      { tool: "Read", input: { file_path: "/Users/demo/my notes.md" } }, { tool: "Read", input: { file_path: "../a.md" } },
    ]) expect(alwaysLineFor(call, v(call), false), JSON.stringify(call)).toBeNull();
    const call = { tool: "Read", input: { file_path: "/Users/demo/notes/plan.md" } };
    expect(alwaysLineFor(call, v(call), true)).toBeNull();
    expect(alwaysLineFor(call, { decision: "ask", risk: "irreversible", reason: "x", undoable: false }, false)).toBeNull();
    expect(alwaysLineFor(call, { decision: "deny", risk: "outside_project", reason: "x", undoable: true }, false)).toBeNull();
  });
  test("the rule only ever skips that one read: never a refusal, another file or another tool", () => {
    const rules = parseRules("allow reading /Users/demo/notes/plan.md").rules;
    const call = { tool: "Read", input: { file_path: "/Users/demo/notes/plan.md" } };
    expect(allowedByAlways(rules, call, v(call))).toBe(true);
    expect(allowedByAlways(rules, call, { decision: "deny", risk: "outside_project", reason: "x", undoable: true })).toBe(false);
    const other = { tool: "Read", input: { file_path: "/Users/demo/notes/other.md" } };
    expect(allowedByAlways(rules, other, v(other))).toBe(false);
    const write = { tool: "Write", input: { file_path: "/Users/demo/notes/plan.md", content: "x" } };
    expect(allowedByAlways(rules, write, v(write))).toBe(false);
    expect(allowedByAlways(parseRules("allow reading notes/plan.md").rules, call, v(call))).toBe(false);
  });
});

describe("adding one house rule (rules.ts addHouseRule)", () => {
  test("adds the line to the file as it is now, once, keeping every other line and its line ending", () => {
    const p = tmp("add");
    expect(addHouseRule(p, "allow reading /a/b.md")).toBe(true);
    expect(readFileSync(join(p, ".companion/rules.txt"), "utf8")).toBe("allow reading /a/b.md\n");
    writeFileSync(join(p, ".companion/rules.txt"), "never edit x\r\n# note");
    expect(addHouseRule(p, "allow reading /a/b.md")).toBe(true);
    expect(readFileSync(join(p, ".companion/rules.txt"), "utf8")).toBe("never edit x\r\n# note\r\nallow reading /a/b.md\r\n");
    expect(addHouseRule(p, "Allow  reading /a/b.md")).toBe(true);
    expect(readFileSync(join(p, ".companion/rules.txt"), "utf8").match(/allow reading/gi)).toHaveLength(1);
  });
  test("only an allow reading line, never through a link, and never into a file that cannot be read or is full", () => {
    const p = tmp("add2");
    expect(addHouseRule(p, "never edit x")).toBe(false);
    expect(addHouseRule(p, "allow reading relative.md")).toBe(false);
    mkdirSync(join(p, ".companion"));
    writeFileSync(join(p, ".companion/rules.txt"), Array.from({ length: 50 }, (_, i) => `never edit f${i}`).join("\n") + "\n");
    expect(addHouseRule(p, "allow reading /a/b.md")).toBe(false);
    const q = tmp("add3"), out = tmp("add3out");
    symlinkSync(out, join(q, ".companion"));
    expect(addHouseRule(q, "allow reading /a/b.md")).toBe(false);
  });
});

describe("the cards of Squibby's own runs", () => {
  test("a read outside the project offers Always allow with its exact house rule line", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE)]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "project");
    await done;
    expect(requests(r.events)[0].always).toBe(`allow reading ${OUTSIDE}`);
    expect(requests(r.events)[0].live).toBeUndefined();
    // M85 review: the row names the file itself, never "Read: " in front of it (the row's own label says what was asked).
    // A long path keeps its end, where the file's name is.
    const want = Array.from(OUTSIDE).length > 80 ? `…${OUTSIDE.slice(-79)}` : OUTSIDE;
    expect(r.log.askedRows(r.project)).toEqual([expect.objectContaining({ by: "squibby", answer: "always", command: want, reason: expect.stringContaining("outside your project") })]);
    expect(r.log.askedRows(r.project)[0].command.endsWith("/notes.md")).toBe(true);
  });
  test("M85 review: the engine writes the one line into the rules file as it is on disk now, keeping a rule added by hand meanwhile", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE)]));
    mkdirSync(join(r.project, ".companion"));
    writeFileSync(join(r.project, ".companion/rules.txt"), "# my rules\nnever edit .env\n");
    const done = r.runner.handle(start(r.project));
    await waitFor(() => requests(r.events).length >= 1);
    // Added by hand while the card is up: the page's settings copy never saw it.
    appendFileSync(join(r.project, ".companion/rules.txt"), "never edit src/db.ts\n");
    await answer(r, 1, "allow", "project");
    await done;
    expect(readFileSync(join(r.project, ".companion/rules.txt"), "utf8")).toBe(`# my rules\nnever edit .env\nnever edit src/db.ts\nallow reading ${OUTSIDE}\n`);
    expect(r.events.find((e) => e.type === "approval.resolved")).toMatchObject({ outcome: "allowed", always: "saved" });
    expect(r.ran).toEqual([OUTSIDE]);
  });
  test("M85 review: a rules file that cannot be written is Allow once, said as not saved, and the file is left alone", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE)]));
    const elsewhere = tmp("elsewhere");
    symlinkSync(elsewhere, join(r.project, ".companion"));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "project");
    await done;
    expect(r.events.find((e) => e.type === "approval.resolved")).toMatchObject({ outcome: "allowed", always: "notSaved" });
    expect(r.log.askedRows(r.project)[0].answer).toBe("once");
    expect(() => readFileSync(join(elsewhere, "rules.txt"))).toThrow();
  });
  test("M85 review: a live command's History row is the command itself, never \"Running: \" in front", async () => {
    const r = setup(new ScriptedEngine([bash("vercel --prod")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "deny", "once");
    await done;
    expect(r.log.askedRows(r.project)[0].command).toBe("vercel --prod");
  });
  test("M85 review: an off the record task keeps no ask row (its words are not kept)", async () => {
    const r = setup(new ScriptedEngine([bash("vercel --prod"), read(OUTSIDE)]));
    const done = r.runner.handle({ ...start(r.project), offTheRecord: true });
    await answer(r, 1, "deny", "once");
    await answer(r, 2, "deny", "once");
    await done;
    expect(r.log.askedRows(r.project)).toEqual([]);
  });
  test("with the house rule saved, the same read runs with no card in the next task", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE)]));
    mkdirSync(join(r.project, ".companion"));
    writeFileSync(join(r.project, ".companion/rules.txt"), `allow reading ${OUTSIDE}\n`);
    await r.runner.handle(start(r.project));
    expect(requests(r.events)).toEqual([]);
    expect(r.ran).toEqual([OUTSIDE]);
  });
  test("a live command says Squibby's live reason, offers only Allow once, and Not now is kept in History", async () => {
    const r = setup(new ScriptedEngine([bash("vercel --prod")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "deny", "once");
    await done;
    const req = requests(r.events)[0];
    expect(req.live).toBe(true);
    expect(req.always).toBeUndefined();
    expect(req.undoable).toBe(false);
    expect(req.title).toContain("A saved copy on this Mac can't bring it back.");
    expect(r.ran).toEqual([]);
    expect(r.log.askedRows(r.project)).toEqual([expect.objectContaining({ by: "squibby", answer: "no", reason: expect.stringContaining("live") })]);
  });
  test("an Always allow answer to a card that did not offer it is only Allow once", async () => {
    const r = setup(new ScriptedEngine([bash("vercel --prod")]));
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "project");
    await done;
    expect(r.log.askedRows(r.project)[0].answer).toBe("once");
  });
  test("with approval.offerAlways off, no card offers Always allow", async () => {
    const r = setup(new ScriptedEngine([read(OUTSIDE)]), { offerAlways: false });
    const done = r.runner.handle(start(r.project));
    await answer(r, 1, "allow", "once");
    await done;
    expect(requests(r.events)[0].always).toBeUndefined();
  });
});

describe("the receipt's two new flags", () => {
  test("Said one thing, ran another (H3): the words before a broad git revert", async () => {
    const r = setup(new ScriptedEngine([{ text: "Reverting the dashboard work from this conversation.", costUsd: 0 } as Step, bash("git checkout HEAD -- src/a.tsx"), { text: "Done.", costUsd: 0 } as Step]));
    const done = r.runner.handle(start(r.project, "Undo the dashboard changes you made"));
    // git checkout asks first in Squibby's own runs; the person says yes once.
    await waitFor(() => requests(r.events).length >= 1).catch(() => undefined);
    if (requests(r.events).length) await answer(r, 1, "allow", "once");
    await done;
    const receipt = r.events.find((e) => e.type === "receipt") as any;
    expect(receipt.flags).toEqual([{ kind: "said_other", say: expect.stringContaining("git checkout HEAD -- src/a.tsx") }]);
  });
  test("no flags when the work matches the words and the request", async () => {
    const r = setup(new ScriptedEngine([{ text: "Running the tests.", costUsd: 0 } as Step, bash("npm test")]));
    await r.runner.handle(start(r.project, "Run the tests"));
    const receipt = r.events.find((e) => e.type === "receipt") as any;
    expect(receipt.flags).toBeUndefined();
  });
});
