// Must fix 28 (M59): the one Stop registry. The list of every long running part (STOP_PARTS), the engine registering each
// of them, one job of each kind started and ended by Stop everything, and the registry's own rules (one part that throws
// never keeps another running; a group switched off ends only its own; the engine closing closes what it watches).
// Every folder is a temporary fixture; nothing here runs a model.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { groupStops, stopGroupsFor } from "../src/groups.ts";
import { HookGuard } from "../src/guard.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Interrupts, STOP_NAMES, STOP_PARTS, type StopName } from "../src/interrupts.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-stop-${l}-`))); made.push(d); return d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the list", () => {
  test("every part has one name, a kind and plain words for what it stops", () => {
    expect(new Set(STOP_NAMES).size).toBe(STOP_NAMES.length);
    for (const p of STOP_PARTS) { expect(p.what.length).toBeGreaterThan(10); expect(p.what).not.toContain("—"); }
  });
  test("the runner's own parts and main.ts's registrations are exactly the list: nothing missing, nothing unlisted", () => {
    const r = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {} });
    const own = Object.keys(r.stopParts());
    const main = readFileSync(join(import.meta.dir, "../src/main.ts"), "utf8");
    const there = [...main.matchAll(/interrupts\.register\("([A-Za-z]+)"/g)].map((m) => m[1]);
    expect([...own, ...there].sort()).toEqual([...STOP_NAMES].sort());
    // Stop everything, a group switched off and the engine closing all go through the registry, never a list of their own.
    expect(main).toContain("interrupts.stopEverything()");
    expect(main).toContain("interrupts.stopGroups(stopGroupsFor(groups))");
    expect(main).toContain("interrupts.shutdown()");
  });
  test("the real engine starts with every part registered (it says any missing in its log)", async () => {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, COMPANION_DATA: tmp("data"), COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" },
    });
    const first = await proc.stdout.getReader().read();
    expect(new TextDecoder().decode(first.value)).toContain("runner.hello");
    proc.stdin.end();
    await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(err).not.toContain("stop registry: not registered");
  });
});

describe("one job of each kind, and Stop everything ends them all", () => {
  test("every part's job ends, and the registry names every part it stopped", async () => {
    const r = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {} });
    const x = r as unknown as Record<string, any>;
    // The runner's lists, each holding one job as it would while it runs.
    const ac = () => new AbortController();
    const picture = ac(), install = ac(), find = ac(), findWait = ac(), watchRun = ac(), session = ac();
    x.picturing.add(picture);
    x.installing.set("c1", install);
    x.finding.set("/p", { abort: find, agent: "a1" });
    x.findWaits.add({ agent: "a1", abort: findWait });
    x.watchRuns.set("/p", { abort: watchRun, yielded: false });
    x.sessions.set("a1", { abort: session, agent: "a1" });
    let resumed = "";
    x.driving.add("a2"); x.resumers.set("a2", (c: string) => { resumed = c; });
    let cost = "", signIn = "";
    x.costAnswers.set("a1", (c: string) => { cost = c; });
    x.signInAnswers.set("a3", (c: string) => { signIn = c; });

    // M77: a guard request waiting for a snapshot that never comes, and a Claude is waiting mark with its timer.
    const dir = tmp("guard"), project = tmp("proj");
    const said: any[] = [];
    const guard = new HookGuard(dir, { projectOf: () => project, snapshot: () => new Promise(() => {}), emit: (e) => said.push(e), snapshotWaitMs: 600_000, destructive: () => "it deletes files" });
    const token = "0123456789abcdef01234567";
    writeFileSync(join(dir, `${token}.1`), JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm -rf dist" }, cwd: project }));
    let released = false;
    const req = guard.take(`${token}.1`).then(() => { released = true; });
    writeFileSync(join(dir, `${token}.2.note`), JSON.stringify({ notification_type: "permission_prompt", message: "Claude needs your permission" }));
    await guard.take(`${token}.2.note`);
    await sleep(20);
    expect(guard.waits()).toEqual({ requests: 1, marks: 1, timers: 1 });
    expect(released).toBe(false);

    // The engine's other services, each holding one job.
    const ended = new Set<string>();
    const fake = (name: string) => () => { ended.add(name); };
    const reg = new Interrupts();
    for (const [name, stop] of Object.entries(r.stopParts())) reg.register(name as StopName, { stop });
    for (const name of ["walks", "browser", "warm", "watches", "review", "assist", "doneSignals"] as const) reg.register(name, { stop: fake(name) });
    reg.register("guard", { stop: () => guard.stopWaits(), close: () => guard.stop() });
    expect(reg.missing()).toEqual([]);

    const stopped = await reg.stopEverything();
    expect(stopped).toEqual([...STOP_NAMES]);
    for (const a of [picture, install, find, findWait, watchRun, session]) expect(a.signal.aborted).toBe(true);
    expect(resumed).toBe("interrupt");
    expect(cost).toBe("stop");
    expect(signIn).toBe("stop");
    await req;
    expect(released).toBe(true);
    expect(guard.waits()).toEqual({ requests: 0, marks: 0, timers: 0 });
    expect(said.filter((e) => e.type === "hook.waiting").map((e) => e.waiting)).toEqual([true, false]);
    expect([...ended].sort()).toEqual(["assist", "browser", "doneSignals", "review", "walks", "warm", "watches"]);
    guard.stop();
  });

  test("Stop everything on a runner used on its own (agent.interruptAll) uses the same parts", async () => {
    const r = new AgentRunner({ shadowRoot: tmp("shadow"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: () => {} });
    const x = r as unknown as Record<string, any>;
    const a = new AbortController();
    x.installing.set("c1", a);
    let cost = "";
    x.costAnswers.set("a1", (c: string) => { cost = c; });
    await r.handle({ v: 1, id: "all", type: "agent.interruptAll", reason: "hotkey" } as never);
    expect(a.signal.aborted).toBe(true);
    expect(cost).toBe("stop");
  });
});

describe("the registry's rules", () => {
  test("a part that throws never keeps the next one running", async () => {
    const reg = new Interrupts(), hit: string[] = [];
    reg.register("tasks", { stop: () => { throw new Error("broken"); } });
    reg.register("drives", { stop: () => Promise.reject(new Error("broken too")) });
    reg.register("walks", { stop: () => { hit.push("walks"); } });
    expect(await reg.stopEverything()).toEqual(["tasks", "drives", "walks"]);
    expect(hit).toEqual(["walks"]);
  });
  test("a group switched off ends only its own work; Prompt help's stop covers Second Look, Flow's covers Draw it", () => {
    const calls: string[] = [];
    const g = groupStops({
      runner: { stopGroup: (o) => { calls.push(`runner:${o}`); } }, walks: { stopAll: () => calls.push("walks") }, browser: { stop: () => calls.push("browser") },
      assist: { cancel: (o) => calls.push(`assist:${o}`) }, watches: { stopAll: () => calls.push("watches") },
    });
    const reg = new Interrupts();
    reg.register("tasks", { stop: () => calls.push("ALL"), groups: g.tasks });
    reg.register("walks", { stop: () => calls.push("ALL"), groups: g.walks });
    reg.register("browser", { stop: () => calls.push("ALL"), groups: g.browser });
    reg.register("watches", { stop: () => calls.push("ALL"), groups: g.watches });
    reg.register("assist", { stop: () => calls.push("ALL"), groups: g.assist });
    reg.stopGroups(stopGroupsFor(["flow", "drawIt"]));
    expect(calls).toEqual(["runner:flow", "browser", "watches"]);
    calls.length = 0;
    reg.stopGroups(stopGroupsFor(["prompt", "secondLook"]));
    expect(calls).toEqual(["runner:prompt", "assist:prompt"]);
    calls.length = 0;
    reg.stopGroups(stopGroupsFor(["guide"]));
    expect(calls).toEqual(["walks", "assist:guide"]);
    calls.length = 0;
    reg.stopGroups(stopGroupsFor(["voice"]));   // talking has nothing of the engine's
    expect(calls).toEqual([]);
  });
  test("the engine closing stops everything first, then closes what each part watches", async () => {
    const reg = new Interrupts(), order: string[] = [];
    reg.register("watches", { stop: () => order.push("stop watches"), close: () => order.push("close watches") });
    reg.register("guard", { stop: () => order.push("stop guard"), close: () => order.push("close guard") });
    await reg.shutdown();
    expect(order).toEqual(["stop watches", "stop guard", "close watches", "close guard"]);
  });
  test("a registration can be taken back, and then it is missing", () => {
    const reg = new Interrupts();
    const off = reg.register("warm", { stop: () => {} });
    expect(reg.registered()).toEqual(["warm"]);
    off();
    expect(reg.missing()).toContain("warm");
  });
});
