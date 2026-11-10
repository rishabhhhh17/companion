// M78: "tried and failed". When the loop breaker stops a fix, or a fix ends not proven, the project keeps one line with
// the proof and its source, shown with Undo (memory.saved) and forgettable. Never off the record, never while paused, never
// with memory.triedAndFailed off. A stand in model and a stand in check only.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { TRIED_SOURCE } from "../src/memory/startblock.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "m78tf-"))); made.push(d); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const say = (t: string): Step => ({ text: t, costUsd: 0.01 });
const failing = (): LadderResult => { const st = { rung: "checks", label: "The tests", status: "failed", detail: "total is 12, expected 13\nat price.test.js:4", ms: 1 } as never; return { verdict: "failed", steps: [st], failedAt: st }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };

function setup(rounds: Step[][], values: Record<string, unknown> = {}, ladder: () => Promise<LadderResult> = async () => failing()) {
  const project = tmp(), data = tmp(), events: Event[] = [];
  writeFileSync(join(project, "a.txt"), "original");
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "memory.learnFromFiles": false, ...values } });
  const runner = new AgentRunner({ settings, shadowRoot: tmp(), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: data, proof: ladder });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), ...c } as never);
  const start = (extra: Record<string, unknown> = {}) => cmd({ type: "agent.start", project, agent: "a1", mode: "build", prompt: "Fix the checkout total", model: "m", budgetUsd: 3, ...extra });
  const lines = () => new MemoryStore({ project, profileDir: data }).list("project").entries;
  return { project, data, events, cmd, start, lines };
}

describe("a fix that ends not proven", () => {
  test("leaves one line: what was tried and the check that still failed, with its source, shown with Undo", async () => {
    // The fix round changes nothing, so the task ends not done with its checks failed.
    const s = setup([[write("a.txt", "1"), say("Done.")], [say("I could not find it.")]]);
    await s.start();
    const tried = s.lines().filter((l) => l.text.startsWith("Tried and failed:"));
    expect(tried).toEqual([expect.objectContaining({ text: "Tried and failed: Fix the checkout total. The checks still failed on The tests: total is 12, expected 13.", source: TRIED_SOURCE.unproven })]);
    expect(of(s.events, "memory.saved").map((e) => e.text)).toContain(tried[0].text);
    // A failed task never makes new files in the project for it.
    expect(existsSync(join(s.project, "AGENTS.md"))).toBe(false);
  });
  test("when the loop breaker stops it, the line says so", async () => {
    const s = setup([[write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "4")]]);
    const task = s.start();
    await waitFor(() => of(s.events, "loop.stuck").length > 0);
    await s.cmd({ type: "loop.choose", agent: "a1", choice: "stop" });
    await task;
    expect(s.lines().filter((l) => l.text.startsWith("Tried and failed:")).map((l) => l.source)).toEqual([TRIED_SOURCE.loop]);
  }, 20_000);
  test("the same failure twice is one line", async () => {
    const s = setup([[write("a.txt", "1")], [say("no")], [write("a.txt", "2")], [say("no")]]);
    await s.start(); await s.start();
    expect(s.lines().filter((l) => l.text.startsWith("Tried and failed:")).length).toBe(1);
  });
  test("Forget takes it away and it is not learned again", async () => {
    const s = setup([[write("a.txt", "1")], [say("no")], [write("a.txt", "2")], [say("no")]]);
    await s.start();
    const line = s.lines().find((l) => l.text.startsWith("Tried and failed:"))!;
    await s.cmd({ type: "memory.forget", project: s.project, scope: "project", line: line.id });
    await s.start();
    expect(s.lines().find((l) => l.text.startsWith("Tried and failed:"))).toBeUndefined();
  });
});

describe("when there is no line", () => {
  test("a proven fix", async () => {
    const s = setup([[write("a.txt", "1"), say("Done.")]], {}, async () => ({ verdict: "passed", steps: [] }));
    await s.start();
    expect(s.lines().filter((l) => l.text.startsWith("Tried")).length).toBe(0);
  });
  test("off the record", async () => {
    const s = setup([[write("a.txt", "1")], [say("no")]]);
    await s.start({ offTheRecord: true });
    expect(s.lines()).toEqual([]);
  });
  test("with learning paused", async () => {
    const s = setup([[write("a.txt", "1")], [say("no")]]);
    await s.cmd({ type: "memory.pause", project: s.project, paused: true });
    await s.start();
    expect(s.lines()).toEqual([]);
  });
  test("with Remember fixes that did not work off", async () => {
    const s = setup([[write("a.txt", "1")], [say("no")]], { "memory.triedAndFailed": false });
    await s.start();
    expect(s.lines()).toEqual([]);
  });
  test("an existing shared AGENTS.md block is kept in step, and nothing else of the project changes", async () => {
    const s = setup([[write("a.txt", "1")], [say("no")]]);
    writeFileSync(join(s.project, "AGENTS.md"), "# AGENTS.md\n\n<!-- companion:begin (kept up to date by Squibby; delete this whole block to stop) -->\n## Project notes (from Squibby)\n- Old fact\n<!-- companion:end -->\n");
    new MemoryStore({ project: s.project, profileDir: s.data }).add("project", "Old fact", "you wrote it");
    await s.start();
    expect(readFileSync(join(s.project, "AGENTS.md"), "utf8")).toContain("Tried and failed: Fix the checkout total");
  });
});
