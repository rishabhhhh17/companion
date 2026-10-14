// Ship, part two: a preview first, checked in the hidden browser, then "Make it live" only on a tap that names that preview.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { NOT_SIGNED_IN, readShips, type Deployer } from "../src/ship/deploy.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-sf-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

class FakeDeployer implements Deployer {
  calls: string[] = []; signed = true; previewResult: any = { ok: true, url: "https://shop-abc.vercel.app" };
  signedIn() { return this.signed; }
  async preview() { this.calls.push("preview"); return this.previewResult; }
  async promote(url: string) { this.calls.push("promote " + url); return { ok: true as const, productionUrl: "https://shop.vercel.app" }; }
  async rollback() { this.calls.push("rollback"); return { ok: true as const }; }
}
function setup(o: { proof?: string; browser?: any; files?: Record<string, string> } = {}) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
  for (const [f, c] of Object.entries(o.files ?? {})) writeFileSync(join(project, f), c);
  const events: Event[] = [], deployer = new FakeDeployer(), browserCalls: string[] = [];
  const browser = o.browser ?? (async (url: string) => { browserCalls.push(url); return { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 }; });
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), deployer, browser,
    proof: async () => ({ verdict: (o.proof ?? "passed") as never, steps: [] }) });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  const last = () => of(events, "ship.status").at(-1);
  return { project, events, deployer, browserCalls, runner, cmd, last };
}
const UP = "https://shop-abc.vercel.app";

describe("a preview", () => {
  test("gates first, then a deploy, then the hidden browser opens the preview, then it is ready", async () => {
    const t = setup(); await t.cmd({ type: "ship.preview" });
    expect(of(t.events, "ship.gates").length).toBe(1);
    expect(t.deployer.calls).toEqual(["preview"]); expect(t.browserCalls).toEqual([UP]);
    expect(t.last()).toMatchObject({ stage: "ready", previewUrl: UP, canGoLive: true });
    expect(of(t.events, "ship.status").map((s) => s.stage)).toEqual(expect.arrayContaining(["checking_gates", "deploying", "checking_preview", "ready"]));
  });
  test("a blocked gate stops everything before any deploy", async () => {
    const t = setup({ files: { "app.js": "const key = 'sk_live_abcdefghijklmnop1234';" } });
    await t.cmd({ type: "ship.preview" });
    expect(t.deployer.calls).toEqual([]); expect(t.last().stage).toBe("refused");
  });
  test("a project that failed its checks cannot be previewed", async () => {
    const t = setup({ proof: "failed" }); await t.cmd({ type: "ship.preview" });
    expect(t.deployer.calls).toEqual([]); expect(t.last().stage).toBe("refused");
  });
  test("not signed in says exactly what to do, and starts no login", async () => {
    const t = setup(); t.deployer.signed = false; await t.cmd({ type: "ship.preview" });
    expect(t.last()).toMatchObject({ stage: "not_signed_in", detail: NOT_SIGNED_IN }); expect(t.deployer.calls).toEqual([]);
  });
  test("a failed deploy is shown plainly and nothing is offered", async () => {
    const t = setup(); t.deployer.previewResult = { ok: false, reason: "Vercel said no: quota" }; await t.cmd({ type: "ship.preview" });
    expect(t.last()).toMatchObject({ stage: "failed" }); expect(t.last().detail).toContain("quota"); expect(t.last().canGoLive).toBeFalsy();
  });
  test("a preview that errors in the browser cannot go live", async () => {
    const t = setup({ browser: async () => ({ ok: false, problems: ["The page crashed with: x is not defined"], consoleErrors: [], failedRequests: [], visited: [], ms: 1 }) });
    await t.cmd({ type: "ship.preview" });
    expect(t.last()).toMatchObject({ stage: "failed" }); expect(t.last().detail).toContain("x is not defined");
    await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.deployer.calls).toEqual(["preview"]); expect(t.last().stage).toBe("refused");
  });
  test("a preview that could not be opened (no hidden browser) is not a pass", async () => {
    const t = setup({ browser: async () => ({ ok: false, skipped: "The hidden browser is not installed yet.", problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 0 }) });
    await t.cmd({ type: "ship.preview" });
    expect(t.last().canGoLive).toBeFalsy(); expect(t.last().detail).toMatch(/could not be checked/i);
  });
  test("an unsafe preview link from the deploy tool is never opened", async () => {
    const t = setup(); t.deployer.previewResult = { ok: true, url: "http://169.254.169.254/" }; await t.cmd({ type: "ship.preview" });
    expect(t.browserCalls).toEqual([]); expect(t.last().stage).toBe("failed");
  });
});

describe("making it live", () => {
  test("the protocol refuses it without an explicit yes", () => {
    expect(parseCommand(serialize({ v: 1, id: "x", type: "ship.live", project: "/p", url: UP } as never)).ok).toBe(false);
    expect(parseCommand(serialize({ v: 1, id: "x", type: "ship.live", project: "/p", url: UP, confirm: false } as never)).ok).toBe(false);
    expect(parseCommand(serialize({ v: 1, id: "x", type: "ship.live", project: "/p", url: UP, confirm: true } as never)).ok).toBe(true);
  });
  test("only the preview that was checked can go live, and it is promoted, not rebuilt", async () => {
    const t = setup(); await t.cmd({ type: "ship.preview" });
    await t.cmd({ type: "ship.live", url: "https://other.vercel.app", confirm: true });
    expect(t.last().stage).toBe("refused"); expect(t.deployer.calls).toEqual(["preview"]);
    await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.deployer.calls).toEqual(["preview", "promote " + UP]);
    expect(t.last()).toMatchObject({ stage: "live", productionUrl: "https://shop.vercel.app" });
  });
  test("nothing goes live without a preview first", async () => {
    const t = setup(); await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.last().stage).toBe("refused"); expect(t.deployer.calls).toEqual([]);
  });
  test("a change after the preview was checked sends the person back to a new preview", async () => {
    const t = setup(); await t.cmd({ type: "ship.preview" });
    writeFileSync(join(t.project, "index.html"), "<h1>changed</h1>");
    await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.last()).toMatchObject({ stage: "refused" }); expect(t.last().detail).toMatch(/changed/i);
    expect(t.deployer.calls).toEqual(["preview"]);
  });
  test("a preview goes live once, not twice", async () => {
    const t = setup(); await t.cmd({ type: "ship.preview" });
    await t.cmd({ type: "ship.live", url: UP, confirm: true }); await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.deployer.calls.filter((c) => c.startsWith("promote")).length).toBe(1);
  });
  test("what went live is recorded: when, which version, which gates", async () => {
    const t = setup(); await t.cmd({ type: "ship.preview" }); await t.cmd({ type: "ship.live", url: UP, confirm: true });
    const r = readShips(t.project).at(-1)!;
    expect(r).toMatchObject({ action: "live", url: UP, productionUrl: "https://shop.vercel.app", proof: "passed" });
    expect(r.gates.map((g) => g.id)).toEqual(expect.arrayContaining(["checked", "secrets"])); expect(r.snapshot).toMatch(/^cp_/);
  });
  test("a failed promote says so and records nothing as live", async () => {
    const t = setup(); await t.cmd({ type: "ship.preview" });
    (t.deployer as Deployer).promote = async () => ({ ok: false as const, reason: "Vercel said no: nope" });
    await t.cmd({ type: "ship.live", url: UP, confirm: true });
    expect(t.last().stage).toBe("failed"); expect(readShips(t.project).some((r) => r.action === "live")).toBe(false);
  });
});

describe("rolling back", () => {
  test("only after something went live, and it is recorded", async () => {
    const t = setup(); await t.cmd({ type: "ship.rollback", confirm: true });
    expect(t.last().stage).toBe("refused"); expect(t.deployer.calls).toEqual([]);
    await t.cmd({ type: "ship.preview" }); await t.cmd({ type: "ship.live", url: UP, confirm: true });
    await t.cmd({ type: "ship.rollback", confirm: true });
    expect(t.deployer.calls.at(-1)).toBe("rollback"); expect(t.last().stage).toBe("rolled_back");
    expect(readShips(t.project).at(-1)!.action).toBe("rollback");
  });
});

describe("secrets and the agent", () => {
  test("nothing the deploy tool says can put a key in an event or the record", async () => {
    const t = setup(); t.deployer.previewResult = { ok: false, reason: "Vercel said no: sk_live_abcdefghijklmnop1234" };
    await t.cmd({ type: "ship.preview" });
    expect(JSON.stringify(t.events)).not.toContain("sk_live_abcdef");
    expect(existsSync(join(t.project, ".companion", "ships.json"))).toBe(false);
  });
  test("the agent itself can never run a deploy, a promote or a rollback without a tap", async () => {
    const { evaluate } = await import("../src/safety.ts");
    for (const command of ["vercel deploy --prod", "vercel --prod", "vercel promote https://a.vercel.app", "vercel rollback", "npx vercel deploy", "vercel env add X"]) {
      expect(evaluate({ tool: "Bash", input: { command } }, { project: "/p" }).decision, command).not.toBe("allow");
    }
  });
});
