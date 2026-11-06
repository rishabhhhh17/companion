// M72: the walkthrough marked three things "stand-in" (the headless page had no engine). Here the engine answers with
// fixtures: Star stays filled (checkpoint.mark answers with a tasks.list that carries it), Forget removes the line (the
// engine's next memory.state no longer has it), and a fix that finishes ends with its receipt (what Fix it shows).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m72-${l}-`))); made.push(d); return d; };
const say = (text: string): Step => ({ text, costUsd: 0 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

function setup(rounds: Step[][] = [[say("done")]]) {
  const project = tmp("p"), data = tmp("d");
  writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "1" }, devDependencies: { vite: "1" } }));
  const events: Event[] = [];
  const log = new TaskLog(":memory:");
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log, emit: (e) => events.push(e), memoryDir: data, proof: async () => ({ verdict: "passed", steps: [] }) });
  const start = (prompt: string) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt, model: "m", budgetUsd: 1 } as never);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  return { project, events, start, cmd };
}

describe("the stand-ins, answered by the engine", () => {
  test("Star: checkpoint.mark answers with tasks.list, and the starred task says star: true (so Star shows filled)", async () => {
    const t = setup([[{ text: "done", costUsd: 0, edits: [{ path: "a.txt", content: "x" }] } as Step]]);
    await t.start("fix the page");
    const cp = of(t.events, "receipt").at(-1)?.checkpoint as string;
    expect(cp).toMatch(/^cp_/);
    await t.cmd({ type: "checkpoint.mark", checkpoint: cp, star: true });
    const task = of(t.events, "tasks.list").at(-1).tasks.find((x: any) => x.checkpoint === cp);
    expect(task.star).toBe(true);
    await t.cmd({ type: "checkpoint.mark", checkpoint: cp, star: false });
    expect(of(t.events, "tasks.list").at(-1).tasks.find((x: any) => x.checkpoint === cp).star).toBeUndefined();
  });
  test("Forget: the engine's next memory.state no longer has the line", async () => {
    const t = setup();
    await t.start("add a page");
    await t.cmd({ type: "memory.list" });
    const line = of(t.events, "memory.state").at(-1).projectLines[0];
    expect(line).toBeTruthy();
    await t.cmd({ type: "memory.forget", scope: "project", line: line.id });
    const after = of(t.events, "memory.state").at(-1);
    expect(after.projectLines.map((l: any) => l.id)).not.toContain(line.id);
  });
});

describe("Don't flag this kind here again, answered by the engine", () => {
  test("its memory.add is answered with memory.saved, which the page shows as Remembered with Undo", async () => {
    const t = setup();
    await t.start("add a page");
    await t.cmd({ type: "memory.add", scope: "project", text: "Here, changes to the sign in page are expected.", source: "your choice in a review" });
    const saved = of(t.events, "memory.saved").at(-1);
    expect(saved.text).toContain("sign in page");
    expect(saved.line).toBeTruthy();
  });
});
