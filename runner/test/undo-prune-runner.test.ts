// Must fix 26 (3 Nov 2026): the undo store now keeps only its newest 100 versions, and every one something still points at.
// Through the runner: a History row's Undo point, Your turn's "Put my fix back" point and the Bring back point of the latest
// Undo all still work after far more than 100 newer versions (a day of reviews). Scripted engine, temporary folders.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-uprune-${l}-`))); made.push(d); return d; };
const edit = (file_path: string, old_string: string, new_string: string): Step => ({ tool: { name: "Edit", input: { file_path, old_string, new_string } }, costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const A = "import x\nconst n = user.name;\nend\n";
const B = "function t() {\n  return title(user.name);\n}\n";

function setup() {
  const project = tmp("p"), events: Event[] = [];
  for (const [f, t] of Object.entries({ "src/a.js": A, "src/b.js": B })) { mkdirSync(dirname(join(project, f)), { recursive: true }); writeFileSync(join(project, f), t); }
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "teach.yourTurn": true } });
  const runner = new AgentRunner({ settings, shadowRoot: tmp("s"), engine: new ScriptedEngine([[edit("src/a.js", "user.name", "user?.name"), edit("src/b.js", "user.name", "user?.name"), { text: "Done.", costUsd: 0.01 }]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), agent: "b1", project, ...c } as never);
  const read = (f: string) => readFileSync(join(project, f), "utf8");
  // A day of reviews: far more than the 100 newest versions the store keeps.
  const reviews = async (n = 115) => { const s = runner.checkpointsFor(project); for (let i = 0; i < n; i++) await s.snapshot("Review: the changes to look at", { envCopies: false }); };
  const gone = () => of(events, "protocol.error").filter((e) => /not there any more/.test(e.reason));
  return { project, events, runner, cmd, read, reviews, gone };
}

describe("what is pointed at survives pruning", () => {
  test("a History row's Undo point still undoes the task", async () => {
    const t = setup();
    await t.cmd({ type: "agent.start", mode: "drive", prompt: "fix the name", model: "m", budgetUsd: 1 });
    const cp = of(t.events, "receipt")[0].checkpoint;
    await t.reviews();
    const kept = (await t.runner.checkpointsFor(t.project).list()).map((c) => c.id);
    expect(kept.length).toBeLessThan(120);
    expect(kept).toContain(cp);
    await t.cmd({ type: "checkpoint.restore", checkpoint: cp });
    expect(t.gone()).toEqual([]);
    expect(t.read("src/a.js")).toBe(A);
    expect(t.read("src/b.js")).toBe(B);
  }, 60000);
  test("Your turn's Put my fix back point, and then the Bring back point of that Undo, both still work", async () => {
    const t = setup();
    await t.cmd({ type: "agent.start", mode: "drive", prompt: "fix the name", model: "m", budgetUsd: 1 });
    await t.cmd({ type: "teach.try", checkpoint: of(t.events, "receipt")[0].checkpoint });
    const ready = of(t.events, "teach.ready").at(-1);
    expect(ready.made).toBe(true);
    const attempt = t.read("src/b.js");
    await t.reviews();
    await t.cmd({ type: "checkpoint.restore", checkpoint: ready.restore, force: true });
    expect(t.gone()).toEqual([]);
    expect(t.read("src/b.js")).toBe("function t() {\n  return title(user?.name);\n}\n");
    const safety = of(t.events, "checkpoint.restored").at(-1).safety;
    await t.reviews();
    await t.cmd({ type: "checkpoint.restore", checkpoint: safety });
    expect(t.gone()).toEqual([]);
    expect(t.read("src/b.js")).toBe(attempt);
  }, 90000);
});
