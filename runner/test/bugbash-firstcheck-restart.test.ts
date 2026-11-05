// Bug bash (first run): Back during the first check stops it (agent.interrupt), and the person presses Check again on the
// project screen. Real ladder, stand in engine, a temporary fixture project only.
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
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-bb-${l}-`))); made.push(d); return d; };

test("Back then Check again during the first check", async () => {
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { test: process.env.SCRIPT ?? "sleep 6" } }));
  const events: Event[] = [];
  const t0 = Date.now();
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => { events.push(e); console.log(Date.now() - t0, JSON.stringify(e).slice(0, 220)); } });
  const a = runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  const end = Date.now() + 8000;
  while (!events.some((e: any) => e.type === "proof.step" || (e.type === "agent.state" && e.state === "checking")) && Date.now() < end) await Bun.sleep(10);
  await Bun.sleep(700);
  console.log(Date.now() - t0, "BACK (interrupt)");
  await runner.handle({ v: 1, id: "i1", type: "agent.interrupt", agent: "builder-1" } as never);
  await Bun.sleep(Number(process.env.GAP ?? 300));
  console.log(Date.now() - t0, "CHECK AGAIN");
  const b = runner.handle({ v: 1, id: "f2", type: "problem.find", project, agent: "builder-1", first: true } as never);
  await Promise.all([a, b]);
  const found = events.filter((e) => e.type === "problem.found") as any[];
  console.log("found verdicts", found.map((f) => f.verdict));
  expect(found.length).toBe(2);
}, 30000);
