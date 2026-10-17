// real-verify (runner/scripts/real-verify.ts) spends the founder's key, so it is only run with --spend by the founder.
// Here, for free: its plan, that every command it sends is one today's runner accepts (protocol drift wastes money), its dry
// run, and its runner kit against a real runner process that is never asked to start Claude.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand } from "../../protocol/index.ts";
import { SCENARIOS, checkedCommand, realKit, verifyCases, type Kit, type Live } from "../scripts/real-verify.ts";
import { SpendMeter, type CaseCtx } from "../scripts/realrun-harness.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-rv-${l}-`))); made.push(d); return d; };
const script = join(import.meta.dir, "../scripts/real-verify.ts");
const runScript = (args: string[], env: Record<string, string> = {}) => {
  const p = Bun.spawnSync([process.execPath, script, ...args], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
};

describe("the plan", () => {
  test("every scenario has a name, its own stop under the per case stop, an estimate under its stop and a time limit", () => {
    expect(new Set(SCENARIOS.map((s) => s.name)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) { expect(s.capUsd, s.name).toBeLessThanOrEqual(1.5); expect(s.estimateUsd, s.name).toBeLessThanOrEqual(s.capUsd); expect(s.timeoutS, s.name).toBeGreaterThan(0); }
    expect(SCENARIOS.reduce((a, s) => a + s.estimateUsd, 0)).toBeLessThan(12);
  });
  test("by default it uses the models the app ships with; --cheap puts every agent task on Haiku 4.5", () => {
    expect(verifyCases({ cheap: false, loopChoice: "stop" }).find((c) => c.name === "drive")!.models).toEqual(["claude-sonnet-5-5"]);
    expect(verifyCases({ cheap: false, loopChoice: "stop" }).find((c) => c.name === "rescue")!.models[0]).toBe("claude-opus-5-5");
    expect(verifyCases({ cheap: true, loopChoice: "stop" }).find((c) => c.name === "drive")!.models).toEqual(["claude-haiku-4-5-20251001"]);
  });
});

describe("every command it sends is one today's runner accepts", () => {
  test("a command the runner would refuse is caught before it is sent", () => {
    expect(() => checkedCommand({ v: 1, id: "x", type: "agent.send", agent: "b1", text: "hi" })).toThrow(/refuses/);   // no project
    expect(checkedCommand({ v: 1, id: "x", type: "agent.send", agent: "b1", project: "/p", text: "hi" })).toContain("agent.send");
  });
  // Each runner scenario is played against a stand in that never answers: every command it sends before it gives up is
  // checked against the protocol, and no task asks for more than the scenario's own stop.
  for (const s of SCENARIOS.filter((x) => !x.inProcess)) test(s.name, async () => {
    const sent: Record<string, any>[] = [];
    const kit: Kit = {
      runner: (project: string): Live => ({ project, data: tmp("data"), events: [], send: (c) => { checkedCommand(c); sent.push(c); }, of: () => [], until: async () => null, ready: async () => true, usd: () => 0, stop: () => {} }),
      scratch: (l) => tmp(l), agentModel: "claude-sonnet-5-5", diagnoseModel: "claude-opus-5-5", reviewModel: "claude-opus-5-5", cheap: false, ctx: {} as CaseCtx,
    };
    expect(await s.run(kit, () => {})).toBe(false);   // the stand in never answers, so it never passes
    expect(sent.length).toBeGreaterThan(0);
    for (const c of sent) {
      expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
      if (typeof c.budgetUsd === "number") expect(c.budgetUsd).toBeLessThanOrEqual(s.capUsd);
      if (typeof c.model === "string") expect(["claude-sonnet-5-5", "claude-opus-5-5"]).toContain(c.model);
    }
  });
});

describe("the runner kit, against a real runner that is never asked to start Claude", () => {
  test("the key is handed over the pipe, the runner says it is on the key route, a command is answered, and cleanup stops it", async () => {
    const cleanups: (() => unknown)[] = [];
    const notes: string[] = [];
    const meter = new SpendMeter(0.5, 1); meter.startCase("kit");
    const ctx = { name: "kit", key: "sk-ant-api03-kit-test-not-a-real-key", meter, signal: new AbortController().signal, note: (s: string) => notes.push(s), onCleanup: (f: () => unknown) => cleanups.push(f), scratch: (l: string) => tmp(l) } as unknown as CaseCtx;
    const kit = realKit(ctx, { cheap: false, loopChoice: "stop" });
    const project = tmp("project");
    const r = kit.runner(project);
    expect(await r.ready()).toBe(true);
    r.send({ v: 1, id: "t", type: "tasks.list", project });
    const list = await r.until((e) => e.type === "tasks.list", 10_000);
    expect(list?.tasks).toEqual([]);
    for (const f of cleanups.reverse()) await f();
    expect(meter.caseSpent).toBe(0);
    expect(JSON.stringify(r.events)).not.toContain("kit-test-not-a-real-key");
  }, 30_000);
});

describe("running the script", () => {
  test("with no options it is a dry run: the plan, nothing sent, nothing spent", () => {
    const r = runScript([], { COMPANION_KEYCHAIN_SERVICE: `companion-test-nonexistent-${Math.random().toString(36).slice(2)}` });
    expect(r.code).toBe(0);
    for (const s of SCENARIOS) expect(r.out).toContain(s.name);
    expect(r.out).toMatch(/nothing was sent and nothing was spent/i);
    expect(r.out).not.toMatch(/=== /);
  });
  test("--spend with no key in the Keychain item: nothing runs", () => {
    const service = `companion-test-nonexistent-${Math.random().toString(36).slice(2)}`;
    const r = runScript(["--spend", "diagram"], { COMPANION_KEYCHAIN_SERVICE: service });
    expect(r.code).toBe(2);
    expect(r.out).toContain(service);
    expect(r.out).not.toMatch(/=== /);
  });
});
