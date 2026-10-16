// The fix loop breaker for a single task (agent.start, not a Drive plan): the same failure three times in a row stops
// the task and asks, with the same card and options a Drive plan shows.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { STUCK_OPTIONS } from "../src/drive.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-ts-${l}-`))); made.push(d); return d; };
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail: string): LadderResult => { const s = { rung: "browser", label: "Opening it in a browser", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const states = (e: Event[]) => of(e, "agent.state").map((x) => x.state);
const waitFor = async (fn: () => boolean) => { for (let i = 0; i < 500 && !fn(); i++) await Bun.sleep(10); };
const writes = (n: number) => Array.from({ length: n }, (_, i) => [write("a.txt", String(i + 1))]);

function setup(rounds: Step[][], proofs: LadderResult[]) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)] });
  const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Fix the signup page", model: "m", budgetUsd: 3, ...extra } as never);
  const choose = (choice: string) => runner.handle({ v: 1, id: "c", type: "loop.choose", agent: "builder-1", choice } as never);
  return { project, events, engine, log, runner, start, choose };
}

describe("three identical failures in a single task stop and ask", () => {
  const same = bad("The page threw: x is not defined");
  test("the card shows the evidence and the same options, and the task waits for an answer", async () => {
    const r = setup(writes(4), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    const card = of(r.events, "loop.stuck")[0];
    expect(card).toMatchObject({ agent: "builder-1", index: 0, title: "Fix the signup page" });
    expect(card.failure.detail).toContain("x is not defined");
    expect(card.options).toEqual(STUCK_OPTIONS);
    expect(states(r.events).at(-1)).toBe("needsYou");
    expect(of(r.events, "receipt").length).toBe(0);   // the task is still open
    expect(r.engine.calls.length).toBe(3);
    await r.choose("stop");
    await run;
  });

  test("Stop here ends the task as Not done, with one receipt", async () => {
    const r = setup(writes(4), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("stop");
    await run;
    expect(r.engine.calls.length).toBe(3);
    expect(of(r.events, "receipt").length).toBe(1);
    expect(of(r.events, "receipt")[0].proof).toBe("failed");
    expect(r.log.list()[0].status).toBe("not_done");
    expect(states(r.events).at(-1)).toBe("error");
  });

  test("a different approach carries on in the same task, with the history, and can still finish", async () => {
    const r = setup(writes(4), [same, same, same, ok()]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("different");
    await run;
    expect(r.engine.calls.length).toBe(4);
    expect(r.engine.calls[3].prompt).toMatch(/different approach/i);
    expect(r.engine.calls[3].prompt).toContain("x is not defined");
    expect(r.engine.calls[3].resumeSession).toBe("scripted-session");
    expect(of(r.events, "checkpoint.created").length).toBe(1);   // still one task, one undo point
    expect(of(r.events, "receipt").length).toBe(1);
    expect(of(r.events, "receipt")[0].proof).toBe("passed");
    expect(r.log.list()[0].status).toBe("done");
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("4");
  });

  test("it is offered once: if the new approach fails the same way three more times, the task ends", async () => {
    const r = setup(writes(7), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("different");
    await run;
    expect(of(r.events, "loop.stuck").length).toBe(1);
    expect(r.engine.calls.length).toBe(6);
    expect(r.log.list()[0].status).toBe("not_done");
    // Every check counts, so the card says "Still failing after 6 tries", not 3.
    expect(of(r.events, "proof.result").map((p) => p.tries)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("the tries keep counting through a different approach, so a fix after it is never shown as a first try", async () => {
    const r = setup(writes(4), [same, same, same, ok()]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.choose("different");
    await run;
    expect(of(r.events, "proof.result").map((p) => p.tries)).toEqual([1, 2, 3, 4]);
    expect(of(r.events, "proof.result").at(-1).verdict).toBe("passed");
  });

  test("off the record, the different approach is told the request again", async () => {
    const r = setup(writes(4), [same, same, same, ok()]);
    const run = r.start({ offTheRecord: true });
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    expect(of(r.events, "loop.stuck")[0].title).toBe("Off the record task");
    await r.choose("different");
    await run;
    expect(r.engine.calls[3].resumeSession).toBeUndefined();
    expect(r.engine.calls[3].prompt).toContain("Fix the signup page");
    expect(r.engine.calls[3].prompt).toMatch(/different approach/i);
  });

  test("Stop while the card waits ends the task", async () => {
    const r = setup(writes(4), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "builder-1" });
    await run;
    expect(r.log.list()[0].status).toBe("interrupted");
    expect(of(r.events, "receipt").length).toBe(1);
    expect(r.engine.calls.length).toBe(3);
  });

  test("Stop everything while the card waits ends the task", async () => {
    const r = setup(writes(4), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(r.log.list()[0].status).toBe("interrupted");
    expect(r.engine.calls.length).toBe(3);
  });

  test("while the card waits, the agent is busy: a new task is refused", async () => {
    const r = setup(writes(4), [same]);
    const run = r.start();
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.start({ prompt: "Something else" });
    expect(of(r.events, "protocol.error").at(-1).reason).toMatch(/already working/i);
    await r.choose("stop");
    await run;
  });
});

describe("it does not cry wolf", () => {
  test("three different failures end the task without asking", async () => {
    const r = setup(writes(3), [bad("first"), bad("second"), bad("third")]);
    await r.start();
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(r.log.list()[0].status).toBe("not_done");
  });
  test("two identical failures then a pass is just a fix", async () => {
    const r = setup(writes(3), [bad("x"), bad("x"), ok()]);
    await r.start();
    expect(of(r.events, "loop.stuck").length).toBe(0);
    expect(r.log.list()[0].status).toBe("done");
  });
});
