// The agent runner, tested with a stand in for Claude that plays back a script.
// Free, fast and repeatable. Real Claude runs come later.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ToolExecutor } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-agent-${l}-`))); made.push(d); return d; };

function setup(script: Step[], opts: { executor?: ToolExecutor; files?: Record<string, string> } = {}) {
  const project = tmp("proj");
  for (const [p, c] of Object.entries(opts.files ?? { "a.txt": "original" })) { mkdirSync(join(project, p, ".."), { recursive: true }); writeFileSync(join(project, p), c); }
  const events: Event[] = [];
  const log = new TaskLog(":memory:");
  const runner = new AgentRunner({
    shadowRoot: tmp("shadow"), engine: new ScriptedEngine(script), log, emit: (e) => events.push(e),
    executor: opts.executor, now: () => new Date("2026-10-08T12:00:00Z"),
  });
  return { project, events, log, runner };
}
const start = (project: string, extra: Record<string, unknown> = {}) => ({
  v: 1 as const, id: "c1", type: "agent.start" as const, project, agent: "builder-1", mode: "drive" as const,
  prompt: "Add a thing", model: "claude-sonnet-5-5", budgetUsd: 3, ...extra,
});
const types = (events: Event[]) => events.map((e) => e.type);
const states = (events: Event[]) => events.filter((e) => e.type === "agent.state").map((e) => (e as any).state);
const write = (file: string, content: string): Step => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });
const bash = (command: string, costUsd = 0.01): Step => ({ tool: { name: "Bash", input: { command } }, costUsd });

const waitFor = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 10)); }
};
const request = (events: Event[]) => events.find((e) => e.type === "approval.request") as any;

describe("a normal task", () => {
  test("takes a snapshot first, works, finishes with a receipt and cost", async () => {
    const r = setup([write("new.txt", "hello"), bash("echo built > built.txt"), { text: "All done", costUsd: 0.01 }]);
    await r.runner.handle(start(r.project));
    const t = types(r.events);
    expect(t[0]).toBe("checkpoint.created");
    expect(t).toContain("receipt");
    expect(states(r.events)).toEqual(expect.arrayContaining(["thinking", "working", "done"]));
    expect(states(r.events).at(-1)).toBe("done");
    expect(readFileSync(join(r.project, "new.txt"), "utf8")).toBe("hello");
    const receipt = r.events.find((e) => e.type === "receipt") as any;
    expect(receipt.changed.map((c: any) => c.file).sort()).toEqual(["built.txt", "new.txt"]);
    expect(receipt.changed.every((c: any) => c.kind === "added")).toBe(true);
    expect(receipt.commands).toBe(1);
    expect(receipt.usdEstimate).toBeCloseTo(0.03, 5);
  });

  test("the receipt tells added, modified and deleted apart", async () => {
    const r = setup([write("edit.txt", "new"), bash("rm gone.txt"), write("fresh.txt", "f")], { files: { "keep.txt": "k", "edit.txt": "old", "gone.txt": "bye" } });
    await r.runner.handle(start(r.project));
    const rc = (r.events.find((e) => e.type === "receipt") as any).changed;
    expect(Object.fromEntries(rc.map((c: any) => [c.file, c.kind]))).toEqual({ "edit.txt": "modified", "gone.txt": "deleted", "fresh.txt": "added" });
  });

  test("undoing the task puts everything back", async () => {
    const r = setup([bash("echo hi > made.txt"), bash("echo changed > a.txt")]);
    await r.runner.handle(start(r.project));
    const cp = (r.events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
    await r.runner.handle({ v: 1, id: "c9", type: "checkpoint.restore", project: r.project, checkpoint: cp });
    expect(existsSync(join(r.project, "made.txt"))).toBe(false);
    expect(readFileSync(join(r.project, "a.txt"), "utf8")).toBe("original");
  });
});

describe("the receipt says how the task ended (so a stopped task is never counted as a try)", () => {
  const receipt = (events: Event[]) => events.find((e) => e.type === "receipt") as any;
  test("a task that finished says done and the mode it ran in", async () => {
    const r = setup([write("new.txt", "hello")]);
    await r.runner.handle(start(r.project));
    expect(receipt(r.events).ended).toBe("done");
    expect(receipt(r.events).mode).toBe("drive");
  });
  test("a task the person stopped says stopped", async () => {
    const r = setup([{ ...bash("echo 1 > one.txt"), delayMs: 400 }, bash("echo 2 > two.txt")]);
    const done = r.runner.handle(start(r.project));
    await waitFor(() => types(r.events).includes("checkpoint.created"));
    await r.runner.handle({ v: 1, id: "c5", type: "agent.interrupt", agent: "builder-1" });
    await done;
    expect(receipt(r.events).ended).toBe("stopped");
  });
  test("a task that ran out of money says failed", async () => {
    const r = setup([{ ...write("a.txt", "x"), costUsd: 9 }]);
    await r.runner.handle(start(r.project, { budgetUsd: 1 }));
    expect(receipt(r.events).ended).toBe("failed");
  });
});

describe("safety is enforced on every step", () => {
  test("a write outside the project is blocked and never happens", async () => {
    const r = setup([]);
    const outside = join(r.project, "../companion-outside-test.txt");
    const r2 = setup([write(outside, "evil")]);
    const out2 = join(r2.project, "../companion-outside-test2.txt");
    rmSync(out2, { force: true });
    const r3 = setup([write(out2, "evil")]);
    await r3.runner.handle(start(r3.project));
    expect(existsSync(out2)).toBe(false);
    expect((r3.events.find((e) => e.type === "agent.tool") as any).outcome).toBe("blocked");
    rmSync(out2, { force: true });
    expect(r.events.length + r2.events.length).toBe(0);
  });

  test("git push waits for the user, and does nothing until allowed", async () => {
    const ran: string[] = [];
    const exec: ToolExecutor = async (call) => { ran.push(JSON.stringify(call.input)); return { ok: true, output: "" }; };
    const r = setup([bash("git push origin main"), { text: "pushed", costUsd: 0 }], { executor: exec });
    const done = r.runner.handle(start(r.project));
    await waitFor(() => !!request(r.events));
    const req = request(r.events);
    expect(req.risk).toBe("git");
    // M28: the card can say exactly what will happen, and whether Undo covers it.
    expect(req.action).toBe("Running: git push origin main");
    expect(req.undoable).toBe(false);
    expect(states(r.events).at(-1)).toBe("needsYou");
    expect(ran).toEqual([]);
    await r.runner.handle({ v: 1, id: "c2", type: "approval.resolve", approval: req.approval, decision: "allow", scope: "once" });
    await done;
    expect(ran.length).toBe(1);
    expect((r.events.find((e) => e.type === "receipt") as any).notUndoable).toContain("git push origin main");
  });

  test("a denied approval means the command never runs", async () => {
    const ran: string[] = [];
    const exec: ToolExecutor = async (call) => { ran.push(JSON.stringify(call.input)); return { ok: true, output: "" }; };
    const r = setup([bash("git push"), { text: "ok", costUsd: 0 }], { executor: exec });
    const done = r.runner.handle(start(r.project));
    await waitFor(() => !!request(r.events));
    await r.runner.handle({ v: 1, id: "c3", type: "approval.resolve", approval: request(r.events).approval, decision: "deny", scope: "once" });
    await done;
    expect(ran).toEqual([]);
    expect((r.events.find((e) => e.type === "receipt") as any).notUndoable).toEqual([]);
  });

  test("an approval nobody answers expires and counts as no", async () => {
    const ran: string[] = [];
    const project = tmp("proj");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([bash("git push")]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), executor: async () => { ran.push("ran"); return { ok: true, output: "" }; }, approvalTimeoutMs: 30 });
    await runner.handle(start(project));
    expect(ran).toEqual([]);
    expect(states(events).at(-1)).toBe("done");
  });

  test("a stray approval id is ignored", async () => {
    const r = setup([]);
    await r.runner.handle({ v: 1, id: "c4", type: "approval.resolve", approval: "ap_nope", decision: "allow", scope: "once" });
    expect(r.events.some((e) => e.type === "protocol.error")).toBe(true);
  });
});

describe("spending limit", () => {
  test("a $0.05 budget stops the task with error_max_budget_usd", async () => {
    const r = setup([bash("echo 1", 0.03), bash("echo 2", 0.03), bash("echo 3 > third.txt", 0.03)]);
    await r.runner.handle(start(r.project, { budgetUsd: 0.05 }));
    const st = states(r.events);
    expect(st.at(-1)).toBe("error");
    expect(existsSync(join(r.project, "third.txt"))).toBe(false);
    const err = r.events.find((e) => e.type === "protocol.error") as any;
    expect(err.reason).toContain("error_max_budget_usd");
    expect(r.events.some((e) => e.type === "receipt")).toBe(true);
    const row = r.log.list()[0];
    expect(row.status).toBe("error_max_budget_usd");
  });

  test("cost updates are reported as the task goes", async () => {
    const r = setup([bash("echo 1", 0.01), bash("echo 2", 0.02)]);
    await r.runner.handle(start(r.project));
    const costs = r.events.filter((e) => e.type === "cost.update").map((e: any) => e.usdEstimate);
    expect(costs.at(-1)).toBeCloseTo(0.03, 5);
  });
});

describe("stopping", () => {
  test("interrupt stops after the current step and still gives a receipt", async () => {
    const slow: Step[] = [bash("echo 1 > one.txt"), { ...bash("echo 2 > two.txt"), delayMs: 400 }, bash("echo 3 > three.txt")];
    const r = setup(slow);
    const done = r.runner.handle(start(r.project));
    await waitFor(() => existsSync(join(r.project, "one.txt")));
    await r.runner.handle({ v: 1, id: "c5", type: "agent.interrupt", agent: "builder-1" });
    await done;
    expect(existsSync(join(r.project, "three.txt"))).toBe(false);
    expect(r.events.some((e) => e.type === "receipt")).toBe(true);
    expect(r.log.list()[0].status).toBe("interrupted");
  });

  test("the kill switch stops every agent", async () => {
    const mk = () => setup([bash("echo 1"), { ...bash("echo 2 > late.txt"), delayMs: 400 }]);
    const a = mk();
    const b = mk();
    const da = a.runner.handle(start(a.project));
    await waitFor(() => types(a.events).includes("cost.update"));
    await a.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await da;
    expect(existsSync(join(a.project, "late.txt"))).toBe(false);
    expect(a.log.list()[0].status).toBe("interrupted");
    expect(b.events).toEqual([]);
  });

  test("a pending approval is cancelled by the kill switch", async () => {
    const ran: string[] = [];
    const r = setup([bash("git push")], { executor: async () => { ran.push("ran"); return { ok: true, output: "" }; } });
    const done = r.runner.handle(start(r.project));
    await waitFor(() => !!request(r.events));
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await done;
    expect(ran).toEqual([]);
  });
});

describe("the task log", () => {
  test("every task writes a row, including failed ones", async () => {
    const r = setup([bash("echo hi")]);
    await r.runner.handle(start(r.project));
    const rows = r.log.list();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ project: r.project, agent: "builder-1", mode: "drive", status: "done" });
    expect(rows[0].usd).toBeCloseTo(0.01, 5);
    expect(rows[0].startedAt).toBe("2026-10-08T12:00:00.000Z");
  });
  test("the log holds a short label of the prompt, never secrets", async () => {
    const r = setup([bash("echo hi")]);
    await r.runner.handle(start(r.project, { prompt: "Use key sk-ant-api03-ABCDEFGHIJKLMNOP123456 to deploy " + "x".repeat(400) }));
    const row = r.log.list()[0];
    expect(row.label.length).toBeLessThanOrEqual(120);
    expect(row.label).not.toContain("sk-ant");
  });
});

describe("an answered approval is announced to everyone", () => {
  const resolved = (events: Event[]) => events.filter((e) => e.type === "approval.resolved") as any[];
  test("allowed, with the same tool line marked as ran", async () => {
    const r = setup([bash("git push origin main")], { executor: async () => ({ ok: true, output: "" }) });
    const done = r.runner.handle(start(r.project));
    await waitFor(() => !!request(r.events));
    const req = request(r.events);
    await r.runner.handle({ v: 1, id: "a", type: "approval.resolve", approval: req.approval, decision: "allow", scope: "once" });
    await done;
    expect(resolved(r.events).map((e) => [e.approval, e.outcome])).toEqual([[req.approval, "allowed"]]);
    const lines = r.events.filter((e) => e.type === "agent.tool") as any[];
    expect(lines.map((l) => l.outcome)).toEqual(["needs_approval", "ran"]);
    expect(new Set(lines.map((l) => l.toolUseId)).size).toBe(1);
  });
  test("denied, with the tool line marked as denied", async () => {
    const r = setup([bash("git push")], { executor: async () => ({ ok: true, output: "" }) });
    const done = r.runner.handle(start(r.project));
    await waitFor(() => !!request(r.events));
    await r.runner.handle({ v: 1, id: "a", type: "approval.resolve", approval: request(r.events).approval, decision: "deny", scope: "once" });
    await done;
    expect(resolved(r.events)[0].outcome).toBe("denied");
    expect((r.events.filter((e) => e.type === "agent.tool") as any[]).map((l) => l.outcome)).toEqual(["needs_approval", "denied"]);
  });
  test("expired when nobody answers", async () => {
    const project = tmp("proj");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([bash("git push")]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 30 });
    await runner.handle(start(project));
    expect(resolved(events)[0].outcome).toBe("expired");
  });
  test("cancelled by the kill switch", async () => {
    const r = setup([bash("git push")]);
    const done = r.runner.handle(start(r.project));
    await waitFor(() => !!request(r.events));
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await done;
    expect(resolved(r.events)[0].outcome).toBe("cancelled");
  });
});
