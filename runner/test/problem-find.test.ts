// Press the key while stuck: Companion checks the project exactly as it is (no Claude, nothing changed, nothing spent)
// and says where it fails, so the character can point there.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-pf-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const place = { kind: "line", file: "src/App.tsx", line: 5, lineText: "const x = 1;", message: "Type error", from: "checks" } as const;
const failing: LadderResult = { verdict: "failed", steps: [{ rung: "checks", label: "Building and checking the code", status: "failed", detail: "tsc failed", ms: 1, problem: place }], failedAt: { rung: "checks", label: "Building and checking the code", status: "failed", detail: "tsc failed", ms: 1, problem: place } };

function setup(ladder: (signal?: AbortSignal) => Promise<LadderResult>) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>site</h1>");
  const events: Event[] = [];
  const engine = new ScriptedEngine([]);
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async (c) => ladder(c.signal) });
  const find = () => runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "a1" });
  return { project, events, engine, runner, find };
}

describe("point at the problem: finding it", () => {
  test("a failing project gives the place, and the character waits for the person", async () => {
    const s = setup(async () => failing);
    await s.find();
    const found = of(s.events, "problem.found");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ project: s.project, agent: "a1", verdict: "failed", label: "Building and checking the code", problem: place });
    expect(of(s.events, "agent.state").map((x) => x.state)).toEqual(["checking", "needsYou"]);
  });
  test("a healthy project says so, with no place", async () => {
    const s = setup(async () => ({ verdict: "passed", steps: [] }));
    await s.find();
    expect(of(s.events, "problem.found")[0]).toEqual(expect.objectContaining({ verdict: "passed" }));
    expect(of(s.events, "problem.found")[0].problem).toBeUndefined();
  });
  test("it never asks Claude and never changes a file", async () => {
    const s = setup(async () => failing);
    const before = readFileSync(join(s.project, "index.html"), "utf8");
    await s.find();
    expect(s.engine.calls ?? []).toHaveLength(0);
    expect(readdirSync(s.project)).toEqual(["index.html"]);
    expect(readFileSync(join(s.project, "index.html"), "utf8")).toBe(before);
    expect(of(s.events, "cost.update")).toHaveLength(0);
  });
  test("pressing the key twice runs one check, not two", async () => {
    let runs = 0;
    const s = setup(async () => { runs++; await Bun.sleep(80); return failing; });
    await Promise.all([s.find(), s.find()]);
    expect(runs).toBe(1);
    expect(of(s.events, "protocol.error")[0].reason).toContain("already working");
    // The refused press still ends, so the card does not stay on "Checking".
    expect(of(s.events, "problem.found").map((x) => x.verdict).sort()).toEqual(["cancelled", "failed"]);
  });
  test("Stop everything stops the check and nothing is pointed at", async () => {
    const s = setup((signal) => new Promise((res) => { const done = () => res({ verdict: "cancelled", steps: [] }); if (signal?.aborted) done(); else signal?.addEventListener("abort", done); }));
    const p = s.find();
    await Bun.sleep(50);
    await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(of(s.events, "problem.found")[0]).toMatchObject({ verdict: "cancelled" });
    expect(of(s.events, "problem.found")[0].problem).toBeUndefined();
  });
  test("the card's Stop button stops the check too", async () => {
    const s = setup((signal) => new Promise((res) => { const done = () => res({ verdict: "cancelled", steps: [] }); if (signal?.aborted) done(); else signal?.addEventListener("abort", done); }));
    const p = s.find();
    await Bun.sleep(50);
    await s.runner.handle({ v: 1, id: "x", type: "agent.interrupt", agent: "a1" });
    await p;
    expect(of(s.events, "problem.found")[0].verdict).toBe("cancelled");
  });
  test("a project folder that is gone still ends the press", async () => {
    const s = setup(async () => failing);
    rmSync(s.project, { recursive: true, force: true });
    await s.find();
    expect(of(s.events, "problem.found").map((x) => x.verdict)).toEqual(["cancelled"]);
    expect(of(s.events, "protocol.error")).toHaveLength(1);
  });
  test("it asks the checker never to install anything", async () => {
    let seen: any;
    const project = tmp("p2"); writeFileSync(join(project, "index.html"), "x");
    const runner = new AgentRunner({ shadowRoot: tmp("s2"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {}, proof: async (c) => { seen = c; return failing; } });
    await runner.handle({ v: 1, id: "f", type: "problem.find", project, agent: "a1" });
    expect(seen.noInstall).toBe(true);
  });
});
