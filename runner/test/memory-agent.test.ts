// Memory in the runner: lines are learned from the project and from what the person says, given to every agent,
// and an off the record task reads and writes none of it.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-mem-${l}-`))); made.push(d); return d; };
const say = (text: string): Step => ({ text, costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

function setup(rounds: Step[][] = [[say("done")]]) {
  const project = tmp("p"), data = tmp("d");
  writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { dev: "vite", test: "vitest" }, dependencies: { react: "1" }, devDependencies: { vite: "1" } }));
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), memoryDir: data, proof: async () => ({ verdict: "passed", steps: [] }) });
  const start = (prompt: string, extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt, model: "m", budgetUsd: 1, ...extra } as never);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  return { project, data, events, engine, log, runner, start, cmd };
}

describe("a normal task", () => {
  test("learns the project's facts, tells the app about each new line, and gives them to the agent", async () => {
    const t = setup();
    await t.start("add a contact page");
    const file = readFileSync(join(t.project, ".companion", "project.md"), "utf8");
    expect(file).toContain("Built with React, Vite"); expect(file).toContain("package.json");
    expect(of(t.events, "memory.saved").map((e) => e.text)).toContain("Built with React, Vite");
    expect(t.engine.calls[0].memory ?? "").toContain("Built with React, Vite");
  });
  test("a second task does not announce lines it already knew", async () => {
    const t = setup([[say("a")], [say("b")]]);
    await t.start("one"); const n = of(t.events, "memory.saved").length;
    await t.start("two");
    expect(of(t.events, "memory.saved").length).toBe(n);
  });
  test("what the person says becomes a line with their words as the source", async () => {
    const t = setup();
    await t.start("add a page and keep the answers shorter");
    expect(readFileSync(join(t.data, "profile.md"), "utf8")).toContain("Prefers short answers");
    expect(t.engine.calls[0].memory ?? "").toContain("Prefers short answers");
  });
  test("private things said in a request are never saved", async () => {
    const t = setup();
    await t.start("my wife has depression, so keep it shorter and use password: hunter2hunter2");
    const all = [existsSync(join(t.data, "profile.md")) ? readFileSync(join(t.data, "profile.md"), "utf8") : "", readFileSync(join(t.project, ".companion", "project.md"), "utf8")].join("\n");
    expect(all).not.toMatch(/wife|depress|hunter2/i);
  });
});

describe("off the record", () => {
  test("nothing is read, nothing is written, and the log does not keep what was asked", async () => {
    const t = setup();
    await t.cmd({ type: "memory.pause", paused: false });   // memory exists and is on
    await t.start("first, a normal task to have some memory");
    const before = readFileSync(join(t.project, ".companion", "project.md"), "utf8");
    t.events.length = 0;
    await t.start("secret plan: sell the shop to my brother, and keep it shorter", { offTheRecord: true });
    expect(t.engine.calls[1].memory ?? "").toBe("");
    expect(readFileSync(join(t.project, ".companion", "project.md"), "utf8")).toBe(before);
    expect(of(t.events, "memory.saved")).toEqual([]);
    const row = t.log.list(t.project)[0];
    expect(row.label).toBe("Off the record task");
    expect(JSON.stringify(t.log.list())).not.toContain("secret plan");
    expect(existsSync(join(t.data, "profile.md"))).toBe(false);   // nothing about "shorter" was learned
  });
  test("the checkpoint label does not repeat what was asked either", async () => {
    const t = setup();
    await t.start("secret plan: sell the shop", { offTheRecord: true });
    expect(of(t.events, "checkpoint.created")[0].label).not.toContain("secret");
  });
});

describe("the memory page's commands", () => {
  test("list shows both parts with sources, forget removes a line for good, and the next task does not bring it back", async () => {
    const t = setup([[say("a")], [say("b")]]);
    await t.start("go");
    await t.cmd({ type: "memory.list" });
    const state = of(t.events, "memory.state").at(-1);
    expect(state.projectLines.length).toBeGreaterThan(0);
    expect(state.projectLines[0]).toMatchObject({ source: "package.json" });
    const line = state.projectLines.find((l: any) => l.text.startsWith("Built with"));
    await t.cmd({ type: "memory.forget", scope: "project", line: line.id });
    await t.start("again");
    expect(readFileSync(join(t.project, ".companion", "project.md"), "utf8")).not.toContain("Built with");
  });
  test("pause keeps what is there, stops new lines, and still shares what is known", async () => {
    const t = setup([[say("a")], [say("b")]]);
    await t.start("go");
    const n = readFileSync(join(t.project, ".companion", "project.md"), "utf8");
    await t.cmd({ type: "memory.pause", paused: true });
    await t.start("and keep it shorter");
    expect(readFileSync(join(t.project, ".companion", "project.md"), "utf8")).toBe(n);
    expect(existsSync(join(t.data, "profile.md"))).toBe(false);
    expect(t.engine.calls[1].memory ?? "").toContain("Built with React");
    expect(of(t.events, "memory.state").at(-1).paused).toBe(true);
  });
  test("an edit that breaks the rules is refused in plain words", async () => {
    const t = setup();
    await t.start("go");
    await t.cmd({ type: "memory.list" });
    const id = of(t.events, "memory.state").at(-1).projectLines[0].id;
    await t.cmd({ type: "memory.edit", scope: "project", line: id, text: "The owner has depression" });
    expect(of(t.events, "memory.refused").at(-1).reason).toMatch(/health/i);
  });
  test("erase all removes the file, and export is readable text", async () => {
    const t = setup();
    await t.start("go");
    await t.cmd({ type: "memory.export" });
    expect(of(t.events, "memory.exported").at(-1).text).toContain("Built with React");
    await t.cmd({ type: "memory.erase", scope: "project" });
    expect(existsSync(join(t.project, ".companion", "project.md"))).toBe(false);
    expect(of(t.events, "memory.state").at(-1).projectLines).toEqual([]);
  });
});

describe("without a memory folder the runner behaves as before", () => {
  test("no files are written and the agent is told nothing", async () => {
    const project = tmp("p"); writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { react: "1" } }));
    const engine = new ScriptedEngine([[say("x")]]);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: () => {}, proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "go", model: "m", budgetUsd: 1 });
    expect(existsSync(join(project, ".companion", "project.md"))).toBe(false);
    expect(engine.calls[0].memory ?? "").toBe("");
  });
});

describe("the shared AGENTS.md", () => {
  test("a normal task in a project with no such files creates them", async () => {
    const t = setup();
    await t.start("go");
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).toContain("Built with React, Vite");
    expect(readFileSync(join(t.project, "CLAUDE.md"), "utf8").split("\n")[0]).toBe("@AGENTS.md");
    expect(of(t.events, "memory.agents_written")[0].files).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });
  test("an off the record task writes no shared files either", async () => {
    const t = setup();
    await t.start("go", { offTheRecord: true });
    expect(existsSync(join(t.project, "AGENTS.md"))).toBe(false);
  });
  test("a project's own files are left alone and the person is asked once; yes adds one block, no never asks again", async () => {
    const t = setup([[say("a")], [say("b")], [say("c")]]);
    writeFileSync(join(t.project, "AGENTS.md"), "# Team\nUse tabs.\n");
    await t.start("go");
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).toBe("# Team\nUse tabs.\n");
    expect(of(t.events, "memory.agents_ask").length).toBe(1);
    await t.start("again");
    expect(of(t.events, "memory.agents_ask").length).toBe(1);   // asked once
    await t.cmd({ type: "memory.agents", answer: "yes" });
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).toContain("Built with React, Vite");
    await t.cmd({ type: "memory.agents", answer: "remove" });
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).toBe("# Team\nUse tabs.\n");
  });
  test("saying no leaves the file alone, now and on later tasks", async () => {
    const t = setup([[say("a")], [say("b")]]);
    writeFileSync(join(t.project, "AGENTS.md"), "# Team\n");
    await t.start("go"); await t.cmd({ type: "memory.agents", answer: "no" });
    await t.start("again");
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).toBe("# Team\n");
  });
  test("forgetting a line removes it from the shared file too", async () => {
    const t = setup();
    await t.start("go");
    await t.cmd({ type: "memory.list" });
    const id = of(t.events, "memory.state").at(-1).projectLines.find((l: any) => l.text.startsWith("Built with")).id;
    await t.cmd({ type: "memory.forget", scope: "project", line: id });
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).not.toContain("Built with");
  });
});

describe("Explain", () => {
  const explainer = (text: string, calls: any[] = []) => async (req: any) => { calls.push(req); return { text, costUsd: 0.002 }; };
  const good = '{"why":["A plain form works in every browser."],"question":{"text":"Why a plain form?","options":["It works everywhere","It is faster"],"correct":0}}';
  const setupE = (ex?: any) => {
    const project = tmp("p"), data = tmp("d"), events: Event[] = [];
    const engine = new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "a.txt", content: "x" } }, costUsd: 0.01 }, say("I added a simple form because it works everywhere.")]]);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: data, explainer: ex, proof: async () => ({ verdict: "passed", steps: [] }) });
    const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "add a form", model: "m", budgetUsd: 1, ...extra } as never);
    return { project, events, runner, start };
  };
  test("after a task that changed files, the bullets and the check question arrive", async () => {
    const calls: any[] = []; const t = setupE(explainer(good, calls));
    await t.start(); await Bun.sleep(100);
    const e = of(t.events, "explain.ready")[0];
    expect(e.bullets).toEqual(["A plain form works in every browser."]); expect(e.question.correct).toBe(0);
    expect(calls[0].text).toContain("a.txt"); expect(calls[0].text).toContain("simple form");
  });
  test("it can be turned off, and stays off", async () => {
    const t = setupE(explainer(good));
    await t.runner.handle({ v: 1, id: "x", type: "explain.set", project: t.project, enabled: false } as never);
    expect(of(t.events, "explain.state")[0].enabled).toBe(false);
    await t.start(); await Bun.sleep(100);
    expect(of(t.events, "explain.ready")).toEqual([]);
  });
  test("a model that fails or answers nonsense never disturbs the task", async () => {
    for (const ex of [async () => { throw new Error("offline"); }, explainer("not json")]) {
      const t = setupE(ex); await t.start(); await Bun.sleep(100);
      expect(of(t.events, "explain.ready")).toEqual([]); expect(of(t.events, "receipt").length).toBe(1);
    }
  });
  test("no explanation for a task that changed nothing, an off the record task, or when no explainer is given", async () => {
    const calls: any[] = []; const off = setupE(explainer(good, calls));
    await off.start({ offTheRecord: true }); await Bun.sleep(100);
    expect(calls.length).toBe(0);
    const none = setupE(undefined); await none.start(); await Bun.sleep(50);
    expect(of(none.events, "explain.ready")).toEqual([]);
  });
});

describe("Where was I", () => {
  test("it answers from the task log only, and says nothing when nothing happened while away", async () => {
    const t = setup([[say("a")]]);
    await t.start("add a page");
    await t.cmd({ type: "recap.ask", since: new Date(Date.now() + 60_000).toISOString() });
    expect(of(t.events, "recap.ready").at(-1).lines).toEqual([]);
    await t.cmd({ type: "recap.ask", since: new Date(Date.now() - 3600_000).toISOString() });
    const lines = of(t.events, "recap.ready").at(-1).lines;
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("add a page");
  });
  test("a bad time is refused in plain words", async () => {
    const t = setup();
    await t.cmd({ type: "recap.ask", since: "yesterday-ish" });
    expect(of(t.events, "protocol.error").at(-1).reason).toMatch(/time/i);
  });
});

describe("Companion's own memory writes are not mistaken for the person taking the wheel", () => {
  test("a plan with memory on runs to the end without pausing", async () => {
    const project = tmp("p"), data = tmp("d"), events: Event[] = [];
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { react: "1" } }));
    const plan = '```json\n["Add a page","Add a footer"]\n```';
    const engine = new ScriptedEngine([[say(plan)], [say("one")], [say("two")]]);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: data, proof: async () => ({ verdict: "passed", steps: [] }) });
    await Bun.sleep(100);
    await runner.handle({ v: 1, id: "p", type: "drive.plan", project, agent: "d1", goal: "build it, keep answers shorter", model: "m", budgetUsd: 5 } as never);
    await runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "d1", steps: ["Add a page", "Add a footer"] } as never);
    await Bun.sleep(900);
    expect(of(events, "drive.paused")).toEqual([]);
    expect(of(events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2 });
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
  });
});
