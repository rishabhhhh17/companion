// Bug bash (m67): Forget everything with no folder chosen (Settings, Privacy) sends memory.erase for the stand in project.
// Temporary folders only; the process folder is moved to a temporary one for the test and put back after.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, NO_PROJECT } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
const was = process.cwd();
afterEach(() => { process.chdir(was); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `bb-np-${l}-`))); made.push(d); return d; };

test("erasing the stand in project's memory touches nothing in the folder the engine was started from", async () => {
  const here = tmp("cwd");
  mkdirSync(join(here, ".companion"));
  writeFileSync(join(here, ".companion", "project.md"), "# someone's notes\n\n- Keep me — me, 2026-01-01 {m_aaaaaaaa}\n");
  process.chdir(here);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {}, memoryDir: tmp("d"), proof: async () => ({ verdict: "passed", steps: [] }) });
  await runner.handle({ v: 1, id: "e1", type: "memory.erase", project: NO_PROJECT, scope: "project" } as never);
  expect(existsSync(join(here, ".companion", "project.md"))).toBe(true);
});
