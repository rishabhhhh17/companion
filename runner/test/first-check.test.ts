// The first run's first check of the real project (M49): the same free check as Point at the problem (no Claude, nothing
// spent), with a safety copy saved before anything runs and installs set to ask. "auto" is held to ask for this check;
// "never" stays never. The install question is the usual approval card, and no answer, a no or a Stop is always a no.
// Without `first`, Point at the problem is unchanged: it never installs and never asks. No real command runs here.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { parseCommand, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-first-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (f: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await Bun.sleep(5); };
const passed: LadderResult = { verdict: "passed", steps: [] };

function rig(proof: (ctx: ProofContext) => Promise<LadderResult> = async () => passed, o: { approvalTimeoutMs?: number } = {}) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
  const settings = new RunnerSettings();
  const events: Event[] = [];
  const seen: { ctx: ProofContext; copy: Record<string, string> }[] = [];
  const engine = new ScriptedEngine([]);
  const runner = new AgentRunner({
    shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), settings,
    ...(o.approvalTimeoutMs ? { approvalTimeoutMs: o.approvalTimeoutMs } : {}),
    commands: (async (c: string) => { throw new Error(`a real command was about to run: ${c}`); }) as never,
    // What the safety copy holds when the check starts: read from the store the check is handed, at its "before" point.
    proof: async (ctx) => { const copy = await ctx.store.readFiles(ctx.beforeId, (p) => p === "index.html"); seen.push({ ctx, copy }); return proof(ctx); },
  });
  const find = (first?: boolean) => runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "a1", ...(first === undefined ? {} : { first }) } as never);
  // check.install is a setting of each project.
  const apply = (values: Record<string, unknown>) => settings.apply({ v: 1, id: "s1", type: "settings.apply", values: {}, project, projectValues: values } as never);
  return { project, events, seen, runner, engine, find, apply };
}

describe("the first check of the real project (M49)", () => {
  test("a safety copy of the project is saved before anything runs, and the check runs on that copy's point", async () => {
    const r = rig();
    await r.find(true);
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0].copy["index.html"]).toBe("<h1>shop</h1>");
    expect(r.seen[0].ctx.beforeId).toBe(r.seen[0].ctx.afterId);
    expect(r.seen[0].ctx.beforeId).not.toBe("live");
    expect(of(r.events, "problem.found")[0]).toMatchObject({ verdict: "passed", agent: "a1" });
  });
  test("installs are set to ask: the check may install, but only after a yes on the usual card", async () => {
    const r = rig();
    await r.find(true);
    const ctx = r.seen[0].ctx;
    expect(ctx.noInstall).toBe(false);
    expect(typeof ctx.askInstall).toBe("function");
    expect(ctx.check?.install).toBe("ask");
  });
  test("auto is held to ask for this check; never stays never", async () => {
    const auto = rig(); auto.apply({ "check.install": "auto" }); await auto.find(true);
    expect(auto.seen[0].ctx.check?.install).toBe("ask");
    const never = rig(); never.apply({ "check.install": "never" }); await never.find(true);
    expect(never.seen[0].ctx.check?.install).toBe("never");
  });
  test("the install question is the usual approval card about installing, and a yes is a yes", async () => {
    let got = null as boolean | null;
    const r = rig(async (ctx) => { got = await ctx.askInstall!("npm install"); return passed; });
    const done = r.find(true);
    await waitFor(() => of(r.events, "approval.request").length > 0);
    const req = of(r.events, "approval.request")[0];
    expect(req).toMatchObject({ agent: "a1", risk: "install" });
    expect(req.title).toContain("npm install");
    await r.runner.handle({ v: 1, id: "y", type: "approval.resolve", approval: req.approval, decision: "allow", scope: "once" });
    await done;
    expect(got).toBe(true);
    expect(of(r.events, "approval.resolved")[0]).toMatchObject({ approval: req.approval, outcome: "allowed" });
  });
  test("a no is a no, and no answer is a no", async () => {
    let got = null as boolean | null;
    const r = rig(async (ctx) => { got = await ctx.askInstall!("npm install"); return passed; });
    const done = r.find(true);
    await waitFor(() => of(r.events, "approval.request").length > 0);
    await r.runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: of(r.events, "approval.request")[0].approval, decision: "deny", scope: "once" });
    await done;
    expect(got).toBe(false);
    let late = null as boolean | null;
    const t = rig(async (ctx) => { late = await ctx.askInstall!("npm install"); return passed; }, { approvalTimeoutMs: 40 });
    await t.find(true);
    expect(late).toBe(false);
    expect(of(t.events, "approval.resolved")[0].outcome).toBe("expired");
  });
  test("Stop everything during the question is a no, and the check ends as stopped", async () => {
    let got = null as boolean | null;
    const r = rig(async (ctx) => { got = await ctx.askInstall!("npm install"); return { verdict: ctx.signal.aborted ? "cancelled" : "passed", steps: [] }; });
    const done = r.find(true);
    await waitFor(() => of(r.events, "approval.request").length > 0);
    await r.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await done;
    expect(got).toBe(false);
    expect(of(r.events, "problem.found")[0].verdict).toBe("cancelled");
  });
  test("the card's Stop ends it too, and afterwards nothing is left waiting", async () => {
    let asks = 0;
    const r = rig(async (ctx) => { if (asks++ === 0) await ctx.askInstall!("npm install"); return { verdict: ctx.signal.aborted ? "cancelled" : "passed", steps: [] }; });
    const done = r.find(true);
    await waitFor(() => of(r.events, "approval.request").length > 0);
    await r.runner.handle({ v: 1, id: "x", type: "agent.interrupt", agent: "a1" });
    await done;
    expect(of(r.events, "problem.found")[0].verdict).toBe("cancelled");
    // A second check can start: the stand in for the question is gone.
    await r.find(true);
    expect(of(r.events, "problem.found").map((e) => e.verdict)).toEqual(["cancelled", "passed"]);
  });
  test("it never asks Claude and spends nothing", async () => {
    const r = rig();
    await r.find(true);
    expect(r.engine.calls ?? []).toHaveLength(0);
    expect(of(r.events, "cost.update")).toHaveLength(0);
  });
  test("without first, Point at the problem is as before: it never installs and never asks", async () => {
    const r = rig();
    await r.find();
    expect(r.seen[0].ctx.noInstall).toBe(true);
    expect(r.seen[0].ctx.askInstall).toBeUndefined();
    const f = rig(); await f.find(false);
    expect(f.seen[0].ctx.noInstall).toBe(true);
  });
  test("the command carries first only as true or false", () => {
    const base = { v: 1, id: "f", type: "problem.find", project: "/p", agent: "a1" };
    const ok = (m: object) => parseCommand(JSON.stringify(m)).ok;
    expect(ok({ ...base, first: true })).toBe(true);
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, first: "yes" })).toBe(false);
  });
});
