// M67 bug bash fixes for the first check: a project whose tests could not run says why, and Back then Check again starts a
// new check. Real ladder, stand in engine (no model), temporary fixture folders only.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-fc-${l}-`))); made.push(d); return d; };

test("tests that could not run because the install was refused: nothing checked, with the reason as its note", async () => {
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "s", dependencies: { "left-pad": "1.3.0" }, scripts: { test: "node -e \"require('left-pad')\"" } }));
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => {
    events.push(e);
    if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 20);
  } });
  await runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  const f = events.find((e) => e.type === "problem.found") as any;
  expect(f.verdict).toBe("nothing_to_check");
  expect(f.note).toMatch(/packages|not installed/i);
}, 60000);

test("an empty folder still says nothing to check with no note", async () => {
  const project = tmp("e");
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
  await runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  const f = events.find((e) => e.type === "problem.found") as any;
  expect(f.verdict).toBe("nothing_to_check");
  expect(f.note).toBeUndefined();
}, 30000);

test("Back then Check again while the stopped tests are still ending: the new press checks, with one answer each", async () => {
  const project = tmp("r");
  // A test runner that cleans up for a while on SIGTERM, as many do.
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "node -e \"process.on('SIGTERM',()=>setTimeout(()=>process.exit(1),1500));setTimeout(()=>{},6000)\"" } }));
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
  const a = runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  const end = Date.now() + 8000;
  while (!events.some((e: any) => e.type === "proof.step" && e.rung === "tests" && e.status === "running") && Date.now() < end) await Bun.sleep(10);
  await Bun.sleep(300);
  await runner.handle({ v: 1, id: "i1", type: "agent.interrupt", agent: "builder-1" } as never);
  await Bun.sleep(300);
  const from = events.length;
  const b = runner.handle({ v: 1, id: "f2", type: "problem.find", project, agent: "builder-1", first: true } as never);
  // Stop the second one too once it is running its tests, so the test does not wait out the script.
  while (!events.slice(from).some((e: any) => e.type === "proof.step" && e.rung === "tests" && e.status === "running") && Date.now() < end + 8000) await Bun.sleep(10);
  const busy = events.slice(from).some((e: any) => e.type === "protocol.error" && /already working/.test(e.message ?? JSON.stringify(e)));
  await runner.handle({ v: 1, id: "i2", type: "agent.interrupt", agent: "builder-1" } as never);
  await Promise.all([a, b]);
  expect(busy).toBe(false);
  expect(events.slice(from).some((e: any) => e.type === "proof.step" && e.rung === "tests" && e.status === "running")).toBe(true);
  // The stopped first check says nothing more after the new press, so its late cancel cannot end the new one.
  const after = events.slice(from).filter((e) => e.type === "problem.found");
  expect(after.length).toBe(1);
}, 40000);
