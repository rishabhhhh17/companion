// The visual receipt inside a task: only after a passing check that opened a page, after the receipt, never holding the
// task up, saved privately next to the receipts, and ended by Stop everything.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, receiptPictureName } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { PageShot } from "../src/proof/browser.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-apic-${l}-`))); made.push(d); return d; };
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });
const shot: PageShot = { jpeg: Buffer.from([0xff, 0xd8, 1, 2]).toString("base64"), w: 1280, h: 800, items: [{ key: "h1:Shop", x: 0, y: 0, w: 100, h: 20 }] };
const passed: LadderResult = { verdict: "passed", steps: [{ rung: "browser", label: "b", status: "passed", detail: "", ms: 1 }], shot };
const failed: LadderResult = { verdict: "failed", steps: [{ rung: "tests", label: "t", status: "failed", detail: "x", ms: 1 }] };

function setup(ladder: LadderResult, o: { before?: any; pictures?: boolean } = {}) {
  const project = tmp("p"); writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const saveDir = join(tmp("d"), "receipts");
  const drew: any[] = [];
  const runner = new AgentRunner({
    shadowRoot: tmp("s"), engine: new ScriptedEngine([[bash("echo hi > new.txt")]].flat() as never), log: new TaskLog(":memory:"), emit: (e) => events.push(e),
    proof: async () => ladder,
    ...(o.pictures === false ? {} : { pictures: { workDir: tmp("w"), saveDir, before: o.before ?? (async () => ({ shot })), draw: async (b: any, a: any) => { drew.push([b, a]); return { jpeg: a.jpeg, regions: [{ x: 1, y: 2, w: 3, h: 4 }], how: "page" as const }; } } }),
  });
  const go = () => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "make it", model: "m", budgetUsd: 3 });
  return { project, events, runner, go, saveDir, drew };
}
const settle = () => Bun.sleep(60);
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

describe("the visual receipt in a task", () => {
  test("a passing task gets its picture after the receipt, saved privately", async () => {
    const s = setup(passed);
    await s.go(); await settle();
    const types = s.events.map((e) => e.type);
    expect(types.indexOf("receipt.visual")).toBeGreaterThan(types.indexOf("receipt"));
    expect(of(s.events, "receipt")[0].inPlan).toBeUndefined();   // a task on its own, not a step of a plan
    const v = of(s.events, "receipt.visual")[0];
    expect(v).toMatchObject({ made: true, agent: "a1", project: s.project, checkpoint: of(s.events, "receipt")[0].checkpoint, caption: "This works now. What changed is circled.", circles: 1 });
    expect(existsSync(v.file)).toBe(true);
    expect(statSync(v.file).mode & 0o777).toBe(0o600);
    expect(v.file.startsWith(s.saveDir)).toBe(true);
    expect(readFileSync(v.file)).toEqual(Buffer.from(shot.jpeg, "base64"));
  });
  test("only the newest 200 pictures are kept", async () => {
    const s = setup(passed);
    require("node:fs").mkdirSync(s.saveDir, { recursive: true });
    for (let i = 0; i < 205; i++) { const f = join(s.saveDir, `old${i}.jpg`); writeFileSync(f, "x"); require("node:fs").utimesSync(f, new Date(2020, 0, 1, 0, i), new Date(2020, 0, 1, 0, i)); }
    await s.go(); await settle();
    const left = require("node:fs").readdirSync(s.saveDir) as string[];
    expect(left).toHaveLength(200);
    expect(left).toContain(receiptPictureName(s.project, of(s.events, "receipt")[0].checkpoint));
    expect(left).not.toContain("old0.jpg");
  });
  test("nothing is drawn for a failed check", async () => {
    const s = setup(failed);
    await s.go(); await settle();
    expect(of(s.events, "receipt.visual")).toHaveLength(0);
    expect(s.drew).toHaveLength(0);
  });
  test("nothing is drawn when the check opened no page", async () => {
    const s = setup({ ...passed, shot: undefined });
    await s.go(); await settle();
    expect(of(s.events, "receipt.visual")).toHaveLength(0);
  });
  test("a page that crashed before says so", async () => {
    const s = setup(passed, { before: async () => ({ none: "crashed" }) });
    await s.go(); await settle();
    expect(of(s.events, "receipt.visual")[0].caption).toBe("Before, the page crashed on start. Now it works.");
    expect(s.drew[0][0]).toBeNull();
  });
  test("an earlier version that could not be pictured claims nothing and circles nothing", async () => {
    const s = setup(passed, { before: async () => ({ none: "not_pictured" }) });
    await s.go(); await settle();
    expect(of(s.events, "receipt.visual")[0]).toMatchObject({ made: true, circles: 0, caption: "This works now. The earlier version could not be pictured, so nothing is circled." });
    expect(s.drew).toHaveLength(0);
  });
  test("the receipt says a picture is coming only when one is", async () => {
    const s = setup(passed); await s.go(); await settle();
    expect(of(s.events, "receipt")[0].picture).toBe(true);
    const f = setup(failed); await f.go(); await settle();
    expect(of(f.events, "receipt")[0].picture).toBeUndefined();
  });
  test("off the record: no picture is made or saved", async () => {
    const s = setup(passed);
    await s.runner.handle({ v: 1, id: "c1", type: "agent.start", project: s.project, agent: "a1", mode: "drive", prompt: "make it", model: "m", budgetUsd: 3, offTheRecord: true });
    await settle();
    expect(of(s.events, "receipt.visual")).toHaveLength(0);
    expect(of(s.events, "receipt")[0].picture).toBeUndefined();
    expect(existsSync(s.saveDir)).toBe(false);
  });
  test("the runner can wait for pictures still being made", async () => {
    let release: () => void = () => {};
    const s = setup(passed, { before: () => new Promise((r) => { release = () => r({ shot }); }) });
    await s.go();
    let done = false;
    const waiting = s.runner.background().then(() => { done = true; });
    await Bun.sleep(30); expect(done).toBe(false);
    release(); await waiting; expect(done).toBe(true);
  });
  test("a picture and the next proof check never run at the same time", async () => {
    const log: string[] = [];
    let release: () => void = () => {};
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[bash("echo 1 > one.txt")], [bash("echo 2 > two.txt")]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e),
      proof: async () => { log.push("proof start"); await Bun.sleep(20); log.push("proof end"); return passed; },
      pictures: { workDir: tmp("w"), saveDir: join(tmp("d"), "r"), before: async () => { log.push("picture start"); await new Promise<void>((r) => { release = r; }); log.push("picture end"); return { shot }; }, draw: async (_b: any, a: any) => ({ jpeg: a.jpeg, regions: [], how: "none" as const }) } });
    const go = (id: string) => runner.handle({ v: 1, id, type: "agent.start", project, agent: "a1", mode: "drive", prompt: "make it", model: "m", budgetUsd: 3 });
    await go("one");
    const second = go("two");
    await Bun.sleep(80);
    expect(log).toEqual(["proof start", "proof end", "picture start"]);   // the second check waits for the picture
    release(); await second; await settle();
    expect(log.slice(3)).toEqual(["picture end", "proof start", "proof end", "picture start"]);
    release(); await settle();
  });
  test("the task does not wait for the picture", async () => {
    let release: () => void = () => {};
    const s = setup(passed, { before: () => new Promise((r) => { release = () => r({ shot }); }) });
    await s.go();
    expect(of(s.events, "receipt")).toHaveLength(1);
    expect(of(s.events, "receipt.visual")).toHaveLength(0);
    release(); await settle();
    expect(of(s.events, "receipt.visual")).toHaveLength(1);
  });
  test("Stop everything ends it, nothing is shown, and the card stops waiting", async () => {
    const s = setup(passed, { before: (o: any) => new Promise((r) => o.signal.addEventListener("abort", () => r({ none: "cancelled" }))) });
    await s.go();
    await s.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" });
    await settle();
    expect(of(s.events, "receipt.visual")).toEqual([expect.objectContaining({ made: false })]);
    expect(s.drew).toHaveLength(0);
  });
  test("off unless the app turns it on", async () => {
    const s = setup(passed, { pictures: false });
    await s.go(); await settle();
    expect(of(s.events, "receipt.visual")).toHaveLength(0);
  });
});

describe("the it's live card", () => {
  class Deployer { signedIn() { return true; } async preview() { return { ok: true as const, url: "https://shop-abc.vercel.app" }; } async promote() { return { ok: true as const, productionUrl: "https://mug-shop.vercel.app" }; } async rollback() { return { ok: true as const }; } }
  function live(card: any) {
    const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>"); writeFileSync(join(project, "package.json"), JSON.stringify({ name: "mug-shop" }));
    const events: Event[] = []; const asked: any[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), deployer: new Deployer() as never,
      browser: (async (url: string) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 })) as never, proof: async () => ({ verdict: "passed", steps: [] }),
      now: () => new Date("2026-10-10T12:00:00Z"),
      pictures: { workDir: tmp("w"), saveDir: tmp("r"), card: async (o: any) => { asked.push(o); return card(o); } } });
    const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
    return { events, asked, cmd, runner };
  }
  test("going live makes a card of the live address, named after the project", async () => {
    const t = live(async () => ({ jpeg: "abc", withShot: true }));
    await t.cmd({ type: "ship.preview" }); await t.cmd({ type: "ship.live", url: "https://shop-abc.vercel.app", confirm: true }); await settle();
    expect(t.asked[0]).toMatchObject({ url: "https://mug-shop.vercel.app", title: "Mug shop", date: "10 Oct 2026" });
    expect(of(t.events, "ship.card")[0]).toMatchObject({ url: "https://mug-shop.vercel.app", title: "Mug shop", image: "abc", withShot: true });
  });
  test("a preview alone makes no card", async () => {
    const t = live(async () => ({ jpeg: "abc", withShot: true }));
    await t.cmd({ type: "ship.preview" }); await settle();
    expect(t.asked).toHaveLength(0);
  });
  test("Stop everything: no card", async () => {
    const t = live((o: any) => new Promise((r) => o.signal.addEventListener("abort", () => r(null))));
    await t.cmd({ type: "ship.preview" }); await t.cmd({ type: "ship.live", url: "https://shop-abc.vercel.app", confirm: true });
    await t.runner.handle({ v: 1, id: "x", type: "agent.interruptAll", reason: "stop" }); await settle();
    expect(of(t.events, "ship.card")).toHaveLength(0);
  });
});
