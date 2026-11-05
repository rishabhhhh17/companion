// M58 area A (shortlist 4, 5 and 9): "Try 1 of 3" and the fixed ladder on top of the loop breaker, Last working (the last
// version whose checks passed) as a rung that puts the files back only on the person's choice, and a stopped run that
// never counts as a fix. The stand in engine and temporary fixture folders only: no model, no real project, no git.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import { STUCK_OPTIONS, stuckOptions, lookUpPrompt } from "../src/drive.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";
import { Runners, waitFor } from "./helpers/settle.ts";

const made: string[] = [];
const live = new Runners();
afterEach(async () => { await live.stopAll(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m58-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail: string): LadderResult => { const s = { rung: "tests", label: "Running the tests", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const writes = (from: number, n: number) => Array.from({ length: n }, (_, i) => [write("a.txt", String(from + i))]);

function setup(rounds: Step[][], proofs: LadderResult[], values: Record<string, unknown> = {}) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  const settings = new RunnerSettings();
  if (Object.keys(values).length) settings.apply({ v: 1, id: "s", type: "settings.apply", values } as never);
  const proven: (number | null)[] = [];
  let n = 0;
  const shadowRoot = tmp("s");
  const runner = live.track(new AgentRunner({ shadowRoot, engine, log, settings, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)],
    fixes: { ticketOf: () => undefined, proven: (_t, task) => { proven.push(task); } } }));
  const start = (prompt = "Fix the signup page") => runner.handle({ v: 1, id: `c${Math.random()}`, type: "agent.start", project, agent: "builder-1", mode: "drive", prompt, model: "m", budgetUsd: 3 } as never);
  const choose = (choice: string) => runner.handle({ v: 1, id: "c", type: "loop.choose", agent: "builder-1", choice } as never);
  return { project, events, engine, log, runner, start, choose, proven, shadowRoot };
}

describe("the stuck card's choices (drive.ts)", () => {
  test("with web search on and a last working version: different, research, last working, stop, in that order", () => {
    expect(stuckOptions({ webSearch: true, lastWorking: true }).map((o) => o.id)).toEqual(["different", "research", "lastWorking", "stop"]);
  });
  test("web search off: never research (hidden, not greyed)", () => {
    expect(stuckOptions({ webSearch: false, lastWorking: true }).map((o) => o.id)).toEqual(["different", "lastWorking", "stop"]);
  });
  test("no last working version: no rung that goes back to it", () => {
    expect(stuckOptions({ webSearch: true, lastWorking: false }).map((o) => o.id)).toEqual(["different", "research", "stop"]);
    expect(stuckOptions({ webSearch: false, lastWorking: false })).toEqual(STUCK_OPTIONS);
  });
  test("the research prompt asks to look up the exact error before changing anything, and keeps the change small", () => {
    const p = lookUpPrompt({ label: "Running the tests", detail: "TypeError: x is not a function" });
    expect(p).toContain("TypeError: x is not a function");
    expect(p).toMatch(/search the web/i);
    expect(p).toMatch(/small/i);
  });
});

describe("Try 1 of 3: the check says how many tries the task has", () => {
  test("each proof.result says its try and the task's limit (work.tries)", async () => {
    const r = setup(writes(1, 3), [bad("1 failed"), ok()]);
    await r.start();
    expect(of(r.events, "proof.result").map((p) => [p.tries, p.of])).toEqual([[1, 3], [2, 3]]);
  });
  test("a changed work.tries is the limit the card is told", async () => {
    const r = setup(writes(1, 3), [bad("1 failed"), ok()], { "work.tries": 2 });
    await r.start();
    expect(of(r.events, "proof.result")[0].of).toBe(2);
  });
});

describe("the ladder on the stuck card", () => {
  const same = bad("1 failed: expected blue, got grey");
  test("first time stuck, with no version that passed yet: the rung is retry, and no Last working choice", async () => {
    const r = setup(writes(1, 4), [same]);
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    const card = of(r.events, "loop.stuck")[0];
    expect(card.rung).toBe("retry");
    expect(card.options.map((o: any) => o.id)).toEqual(["different", "research", "stop"]);
    await r.choose("stop");
    await run;
  });
  test("web search off: the card never offers research, and a research answer anyway is refused and nothing more is spent", async () => {
    const r = setup(writes(1, 5), [same], { "work.webSearch": false });
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    expect(of(r.events, "loop.stuck")[0].options.map((o: any) => o.id)).not.toContain("research");
    await r.choose("research");
    await run;
    expect(r.engine.calls.length).toBe(3);
    expect(of(r.events, "protocol.error").map((e) => e.reason).join(" ")).toMatch(/search the web/i);
    expect(of(r.events, "receipt")[0].proof).toBe("failed");
  });
  test("research: one more approach in the same task, told to look up the exact error first", async () => {
    const r = setup(writes(1, 4), [same, same, same, ok()]);
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    await r.choose("research");
    await run;
    expect(r.engine.calls.length).toBe(4);
    expect(r.engine.calls[3].prompt).toMatch(/search the web/i);
    expect(r.engine.calls[3].prompt).toContain("expected blue, got grey");
    expect(of(r.events, "checkpoint.created").length).toBe(1);
    expect(of(r.events, "receipt")[0].proof).toBe("passed");
  });

  test("after a version passed, Last working is offered; choosing it ends the task, then puts the files back to that version with its own safety copy", async () => {
    // Task 1 passes with "1". Task 2 fails three times the same way.
    const r = setup([...writes(1, 1), ...writes(2, 4)], [ok(), same]);
    await r.start("Make the button blue");
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("1");
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    expect(of(r.events, "loop.stuck")[0].options.map((o: any) => o.id)).toEqual(["different", "research", "lastWorking", "stop"]);
    // Nothing goes back before the choice.
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).not.toBe("1");
    await r.choose("lastWorking");
    await run;
    await waitFor("the files back", () => of(r.events, "checkpoint.restored").length > 0);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("1");
    const back = of(r.events, "checkpoint.restored")[0];
    expect(back.safety).toMatch(/^cp_/);
    expect(back.lastWorking).toBe(true);
    expect(of(r.events, "receipt").at(-1).proof).toBe("failed");
    expect(r.engine.calls.length).toBe(4);   // 1 + 3: nothing more is spent on the way back
    expect(r.proven.length).toBe(1);         // only the first task counted
  });

  test("Stop everything right after Go back to the last working version: the files are never put back (rules 11 and 13)", async () => {
    const r = setup([...writes(1, 1), ...writes(2, 4)], [ok(), same]);
    await r.start("Make the button blue");
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    const stuckAt = readFileSync(join(r.project, "a.txt"), "utf8");
    // The choice lands, and Stop everything follows at once, while the task is still winding down to its receipt.
    void r.choose("lastWorking");
    await r.runner.handle({ v: 1, id: "all", type: "agent.interruptAll" } as never);
    await run;
    await new Promise((res) => setTimeout(res, 50));
    expect(of(r.events, "checkpoint.restored").length).toBe(0);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe(stuckAt);
    expect(r.proven.length).toBe(1);
  });

  test("no Last working kept: a lastWorking answer changes nothing and says why", async () => {
    const r = setup(writes(1, 4), [same]);
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    const before = readFileSync(join(r.project, "a.txt"), "utf8");
    await r.choose("lastWorking");
    await run;
    expect(of(r.events, "checkpoint.restored").length).toBe(0);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe(before);
    expect(of(r.events, "protocol.error").map((e) => e.reason).join(" ")).toMatch(/no working version/i);
  });

  test("Last working outlasts a restart, and tasks.list says which version it is and which task made it", async () => {
    const r = setup(writes(1, 1), [ok()]);
    await r.start("Make the button blue");
    const again = live.track(new AgentRunner({ shadowRoot: r.shadowRoot, engine: new ScriptedEngine([]), log: r.log, emit: (e) => r.events.push(e) }));
    await again.handle({ v: 1, id: "l", type: "tasks.list", project: r.project } as never);
    const list = of(r.events, "tasks.list").at(-1);
    expect(list.lastWorking.checkpoint).toMatch(/^cp_/);
    expect(typeof list.lastWorking.at).toBe("string");
    expect(list.tasks[0].lastWorking).toBe(true);
  });
});

describe("a stopped run is never a fix (shortlist 9)", () => {
  test("Stop during a task that changed files: receipt ended stopped, and the fix counter is never told", async () => {
    const r = setup(writes(1, 4), [bad("x")]);
    const run = r.start();
    await waitFor("the loop card", () => of(r.events, "loop.stuck").length > 0);
    await r.runner.handle({ v: 1, id: "st", type: "agent.interrupt", agent: "builder-1" } as never);
    await run;
    const rec = of(r.events, "receipt").at(-1);
    expect(rec.ended).toBe("stopped");
    expect(rec.changed.length).toBeGreaterThan(0);
    expect(r.proven).toEqual([]);
    // Nothing is put back on its own: Undo is the person's tap.
    expect(of(r.events, "checkpoint.restored").length).toBe(0);
    expect(existsSync(join(r.project, "a.txt"))).toBe(true);
  });
});
