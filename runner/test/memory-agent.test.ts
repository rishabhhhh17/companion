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
