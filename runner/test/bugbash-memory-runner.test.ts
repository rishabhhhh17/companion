// Bug bash (m67): a refused memory edit, driven through the runner with the scripted stand in engine, then the events
// folded through the app's own model, as Home would.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
// Loaded by path (M67), so the runner's type check does not take in the page's files (model.ts reaches icons.tsx).
const MODEL = "../../app/src/model.ts";
const { initial, reduce } = await import(MODEL) as { initial: () => any; reduce: (m: any, e: unknown) => any };

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `bb-mem-${l}-`))); made.push(d); return d; };

test("a refused edit's reason is still on the Memory page after the engine's events", async () => {
  const project = tmp("p"), data = tmp("d");
  writeFileSync(join(project, "package.json"), "{}");
  // Memory events are typed apart from the task events, so the list holds any engine event (M67: the runner's type check).
  const events: { type: string }[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: data, proof: async () => ({ verdict: "passed", steps: [] }) });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  await cmd({ type: "memory.add", scope: "project", text: "Uses React", source: "package.json" });
  await cmd({ type: "memory.list" });
  const line = (events.filter((e) => e.type === "memory.state").at(-1) as any).projectLines[0].id;
  const from = events.length;
  await cmd({ type: "memory.edit", scope: "project", line, text: "Has a doctor appointment" });
  const after = events.slice(from).map((e) => e.type);
  console.log("events after the edit:", after);
  let m = initial();
  for (const e of events) m = reduce(m, e as never);
  console.log("memoryNote on the page:", m.memoryNote);
  expect(after).toContain("memory.refused");
  expect(m.memoryNote).toMatch(/health/i);
});
