// Must fix 5: the helpers that keep a slow test from turning the next one red (test/helpers/settle.ts).
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runners, waitFor } from "./helpers/settle.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

describe("waitFor", () => {
  test("says what it waited for, and for how long, instead of returning quietly", async () => {
    await expect(waitFor("the loop card", () => false, 50)).rejects.toThrow("timed out after 50 ms waiting for the loop card");
    let n = 0;
    await waitFor("three ticks", () => ++n >= 3, 1000, 1);
    expect(n).toBe(3);
  });
});

describe("Runners", () => {
  test("stopAll stops what a test left running and waits for it to end", async () => {
    const live = new Runners();
    let stopped = false;
    let release!: () => void;
    const fake = live.track({ handle: async (cmd: { type: string }) => { if (cmd.type === "agent.interruptAll") { stopped = true; release(); return; } await new Promise<void>((r) => { release = r; }); } });
    void fake.handle({ type: "agent.start" } as never);
    expect(live.busy).toBe(1);
    expect(await live.stopAll(1000)).toBe(true);
    expect(stopped).toBe(true);
    expect(live.busy).toBe(0);
  });
  test("a real runner left waiting on a loop card is stopped before its folders go", async () => {
    const top = realpathSync(mkdtempSync(join(tmpdir(), "companion-settle-")));
    const dir = join(top, "p");
    try {
      mkdirSync(dir);
      writeFileSync(join(dir, "a.txt"), "x");
      const events: Event[] = [];
      const write = (c: string) => ({ tool: { name: "Write", input: { file_path: "a.txt", content: c } }, costUsd: 0.01 });
      const bad = { verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "same", ms: 1 }], failedAt: { rung: "tests", label: "Running the tests", status: "failed", detail: "same", ms: 1 } } as never;
      const live = new Runners();
      const runner = live.track(new AgentRunner({ shadowRoot: join(top, "s"), engine: new ScriptedEngine([[write("1")], [write("2")], [write("3")], [write("4")]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => bad }));
      const run = runner.handle({ v: 1, id: "c1", type: "agent.start", project: dir, agent: "builder-1", mode: "drive", prompt: "Fix it", model: "m", budgetUsd: 3 } as never);
      await waitFor("the loop card", () => events.some((e) => e.type === "loop.stuck"));
      expect(live.busy).toBe(1);   // the task waits for an answer that this test never gives
      expect(await live.stopAll(5000)).toBe(true);
      await run;
      expect(live.busy).toBe(0);
    } finally { rmSync(top, { recursive: true, force: true }); }
  });
});
