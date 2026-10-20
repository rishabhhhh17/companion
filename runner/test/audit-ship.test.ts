// Stop around checks and shipping, where the audit of 20 Oct 2026 found a Stop stored as a failed check (A26), the hidden
// browser left running (A27), the Online box left busy (A28) and "Nothing went live" said when that was not known (A29).
// Stand ins for the check, the browser and Vercel: nothing real runs and nothing goes online.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { readShips, VercelCli, type Deployer } from "../src/ship/deploy.ts";
import type { BrowserOptions } from "../src/proof/browser.ts";
import type { RunResult } from "../src/proof/exec.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-as-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 5000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };
const UP = "https://shop-abc.vercel.app";
const okPage = (url: string) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 });
const untilStopped = (signal: AbortSignal) => new Promise<void>((res) => { if (signal.aborted) res(); else signal.addEventListener("abort", () => res(), { once: true }); });

class FakeDeployer implements Deployer {
  calls: string[] = []; promoteResult: any = { ok: true, productionUrl: "https://shop.vercel.app" };
  signedIn() { return true; }
  async preview() { this.calls.push("preview"); return { ok: true as const, url: UP }; }
  async promote(url: string) { this.calls.push("promote " + url); return this.promoteResult; }
  async rollback() { this.calls.push("rollback"); return { ok: true as const }; }
}
function setup(o: { proof?: (ctx: ProofContext) => Promise<LadderResult>; browser?: any; rounds?: any[][] } = {}) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
  const events: Event[] = [], deployer = new FakeDeployer();
  let checks = 0;
  const proof = async (ctx: ProofContext) => { checks++; return o.proof ? o.proof(ctx) : { verdict: "passed" as const, steps: [] }; };
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(o.rounds ?? []), log: new TaskLog(":memory:"), emit: (e) => events.push(e), deployer, browser: o.browser ?? (async (url: string) => okPage(url)), proof });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  return { project, events, deployer, runner, cmd, checks: () => checks, last: () => of(events, "ship.status").at(-1) };
}
// A check that is still running when Stop comes, then says "failed", as a ladder that read the stopped command's exit code did.
const failsOnStop = async (ctx: ProofContext): Promise<LadderResult> => { await untilStopped(ctx.signal); return { verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "The tests did not pass. It stopped with exit code null.", ms: 1 }] }; };

describe("Stop during a check is never kept as a failed check (A26)", () => {
  test("a task's check stopped part way: told as cancelled, and Put it online checks again", async () => {
    let first = true;
    const t = setup({ rounds: [[{ tool: { name: "Write", input: { file_path: "a.txt", content: "1" } }, costUsd: 0.01 }]], proof: (ctx) => (first ? (first = false, failsOnStop(ctx)) : Promise.resolve({ verdict: "passed", steps: [] })) });
    const run = t.runner.handle({ v: 1, id: "s", type: "agent.start", project: t.project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 5 });
    await waitFor(() => t.checks() === 1);
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop" });
    await run;
    expect(of(t.events, "proof.result").map((p) => p.verdict)).toEqual(["cancelled"]);
    await t.cmd({ type: "ship.check", runChecks: true });
    expect(t.checks()).toBe(2);
    expect(of(t.events, "ship.gates").at(-1).gates.find((g: any) => g.id === "checked").status).toBe("passed");
  });
  test("the ship check stopped part way is not kept either", async () => {
    let first = true;
    const t = setup({ proof: (ctx) => (first ? (first = false, failsOnStop(ctx)) : Promise.resolve({ verdict: "passed", steps: [] })) });
    const p = t.cmd({ type: "ship.check", runChecks: true });
    await waitFor(() => t.checks() === 1);
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(of(t.events, "proof.result").map((r) => r.verdict)).toEqual(["cancelled"]);
    await t.cmd({ type: "ship.check", runChecks: true });
    expect(t.checks()).toBe(2);
  });
});

describe("Stop reaches the preview's browser check (A27)", () => {
  test("the preview's browser check is given the stop signal, and Stop everything ends it", async () => {
    let seen: AbortSignal | undefined;
    const browser = async (url: string, o: BrowserOptions) => { seen = o.signal; await untilStopped(o.signal!); return { ...okPage(url), ok: false, skipped: "Stopped." }; };
    const t = setup({ browser });
    const p = t.cmd({ type: "ship.preview" });
    await waitFor(() => !!seen);
    expect(seen).toBeDefined();
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(seen!.aborted).toBe(true);
  });
});

describe("Stop everything during Put it online always ends the Online box (A28)", () => {
  test("while the project is checked first", async () => {
    const t = setup({ proof: failsOnStop });
    const p = t.cmd({ type: "ship.preview" });
    await waitFor(() => t.checks() === 1);
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(t.last()).toMatchObject({ stage: "failed", detail: "Stopped. Nothing went live." });
    expect(t.deployer.calls).toEqual([]);
  });
  test("while the preview is opened in the hidden browser", async () => {
    const browser = async (url: string, o: BrowserOptions) => { await untilStopped(o.signal!); return { ...okPage(url), ok: false, skipped: "Stopped." }; };
    const t = setup({ browser });
    const p = t.cmd({ type: "ship.preview" });
    await waitFor(() => t.last()?.stage === "checking_preview");
    await t.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop" });
    await p;
    expect(t.last()).toMatchObject({ stage: "failed", detail: "Stopped. Nothing went live." });
  });
});

describe("going live that may have happened is never called nothing (A29)", () => {
  const preview = async (t: ReturnType<typeof setup>) => { await t.cmd({ type: "ship.preview" }); expect(t.last().stage).toBe("ready"); };
  test("a promote cut short says it could not confirm, keeps a record, and Roll back is still accepted", async () => {
    const t = setup();
    await preview(t);
    t.deployer.promoteResult = { ok: false, reason: "Stopped.", unclear: true };
    await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.last().stage).toBe("failed");
    expect(t.last().detail).not.toMatch(/Nothing went live/);
    expect(t.last().detail).toMatch(/could not confirm whether it went live/i);
    expect(readShips(t.project).at(-1)).toMatchObject({ action: "live", unconfirmed: true, url: UP });
    // While it was being made live, the line named the preview, so a page whose engine restarts then never says nothing
    // went live either (app/src/model.ts shipStopped).
    expect(of(t.events, "ship.status").find((e) => e.detail === "Making it live.")).toMatchObject({ stage: "deploying", previewUrl: UP });
    await t.cmd({ type: "ship.rollback", confirm: true });
    expect(t.deployer.calls).toContain("rollback");
  });
  test("a clear no before anything was sent still says nothing went live", async () => {
    const t = setup();
    await preview(t);
    t.deployer.promoteResult = { ok: false, reason: "The Vercel tool is not installed. Install it with: npm install -g vercel" };
    await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.last().detail).toMatch(/Nothing went live\.$/);
    expect(readShips(t.project).filter((s) => s.action === "live")).toEqual([]);
  });
  const cli = (r: Partial<RunResult>) => new VercelCli(async () => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...r }), "/nowhere/auth.json", () => true);
  test("the Vercel tool: a stopped or timed out promote is unclear, and the words are not doubled", async () => {
    const stopped = await cli({ code: null, aborted: true }).promote(UP, "/p");
    expect(stopped).toMatchObject({ ok: false, unclear: true });
    const slow = await cli({ code: null, timedOut: true }).promote(UP, "/p");
    expect(slow).toMatchObject({ ok: false, unclear: true });
    expect((slow as any).reason).not.toMatch(/Nothing went live/);
    const back = await cli({ code: null, timedOut: true }).rollback("/p");
    expect(back).toMatchObject({ ok: false, unclear: true });
    // A preview that took too long still says nothing went live: a preview never does.
    expect(((await cli({ code: null, timedOut: true }).preview("/p")) as any).reason).toBe("Vercel took too long, so I stopped it. Nothing went live.");
  });
});

describe("a task that changed the project's scripts asks before the check runs them (A12)", () => {
  const go = async (decision: "allow" | "deny") => {
    const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
    const events: Event[] = [];
    const script = JSON.stringify({ name: "x", scripts: { test: "touch ran-by-the-check.txt" } });
    const runner: AgentRunner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "package.json", content: script } }, costUsd: 0.01 }]]), log: new TaskLog(":memory:"), browser: async (url: string) => okPage(url) as never,
      emit: (e) => { events.push(e); if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "y", type: "approval.resolve", approval: (e as any).approval, decision, scope: "once" }), 0); } });
    await runner.handle({ v: 1, id: "s", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 5 });
    return { events, ran: () => existsSync(join(project, "ran-by-the-check.txt")) };
  };
  test("no yes: the changed script is not run, and the receipt does not say proven", async () => {
    const r = await go("deny");
    const ask = of(r.events, "approval.request")[0];
    expect(ask).toMatchObject({ risk: "install" });
    expect(ask.title).toMatch(/changed the project's scripts or packages/);
    expect(r.ran()).toBe(false);
    expect(of(r.events, "receipt")[0].proof).not.toBe("passed");
  });
  test("a yes runs it", async () => {
    const r = await go("allow");
    expect(r.ran()).toBe(true);
  });
});
