// Asking for a diagram through the runner: fast lane only, nothing from the screen, always an answer, Stop ends it.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-da-${l}-`))); made.push(d); return d; };
const good = JSON.stringify({ nodes: [{ id: "page", label: "Signup page" }, { id: "api", label: "API route" }], edges: [{ from: "page", to: "api" }], broken: { edge: ["page", "api"], reason: "The route does not exist" }, caption: "Renamed route." });
function setup(explainer?: any) {
  const project = tmp("p"); writeFileSync(join(project, "package.json"), '{"dependencies":{"react":"18"}}');
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), explainer });
  const ask = () => runner.handle({ v: 1, id: "d1", type: "diagram.ask", project, question: "Why did this break?" } as never);
  return { project, events, runner, ask };
}
const out = (e: Event[]) => e.filter((x) => x.type === "diagram.ready") as any[];

describe("asking for a diagram", () => {
  test("a good answer becomes a diagram, with what it cost", async () => {
    const seen: any[] = [];
    const s = setup(async (req: any) => { seen.push(req); return { text: good, costUsd: 0.002 }; });
    await s.ask();
    expect(out(s.events)).toEqual([expect.objectContaining({ made: true, usdEstimate: 0.002, diagram: expect.objectContaining({ caption: "Renamed route." }) })]);
    expect(seen[0].system).toMatch(/ONLY JSON/); expect(seen[0].text).toContain("react");
  });
  test("a bad answer, an error and no model each end with a plain sentence, never silence", async () => {
    for (const ex of [async () => ({ text: "no idea", costUsd: 0 }), async () => { throw new Error("network"); }, undefined]) {
      const s = setup(ex as any); await s.ask();
      expect(out(s.events)).toHaveLength(1); expect(out(s.events)[0].made).toBe(false); expect(out(s.events)[0].reason.length).toBeGreaterThan(10);
    }
  });
  test("Stop everything ends it and nothing is drawn", async () => {
    const s = setup((_req: any, signal: AbortSignal) => new Promise((_res, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))));
    const p = s.ask(); await Bun.sleep(40);
    await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(out(s.events)[0]).toMatchObject({ made: false, reason: "Stopped." });
  });
  test("the project folder gone is a plain answer", async () => {
    const s = setup(async () => ({ text: good, costUsd: 0 })); rmSync(s.project, { recursive: true, force: true });
    await s.ask(); expect(out(s.events)[0].made).toBe(false);
  });
});

describe("asking for a diagram: late and stuck answers", () => {
  test("the answer carries the id of the ask it belongs to", async () => {
    const s = setup(async () => ({ text: good, costUsd: 0 }));
    await s.ask();
    expect(out(s.events)[0].ask).toBe("d1");
  });
  test("an explainer that ignores Stop still ends with Stopped", async () => {
    const s = setup(() => new Promise(() => {}));   // never answers, never looks at the signal
    const p = s.ask();
    await new Promise((r) => setTimeout(r, 20));
    await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(out(s.events)[0]).toMatchObject({ made: false, reason: "Stopped." });
  });
});
