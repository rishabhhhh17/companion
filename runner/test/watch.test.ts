// Watch routines (F21): the scheduler and the state machine, run on a clock the test controls with stand in checks. Nothing
// here reaches the network, a tool, Claude or a real timer.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "../../protocol/index.ts";
import { defaultOf } from "../../protocol/settings.ts";
import { HISTORY, MAX_PER_PROJECT, MAX_TOTAL, NOT_CHECKED, WatchEngine, nextRun, parseSchedule, type Answer, type Checks } from "../src/watch.ts";

const made: string[] = [];
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-watch-${l}-`))); made.push(d); return d; };
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

const MIN = 60_000;
const START = new Date(2026, 9, 22, 10, 0, 0).getTime();   // 22 Oct 2026, 10:00 on this Mac's clock

type Rig = ReturnType<typeof rig>;
function rig(o: { settings?: Record<string, unknown>; random?: () => number; timeouts?: any; file?: string } = {}) {
  const dir = tmp("data");
  const file = o.file ?? join(dir, "watch.json");
  const project = tmp("project");
  const clock = { t: START };
  const events: any[] = [];
  const problems: string[] = [];
  const settings: Record<string, unknown> = { ...(o.settings ?? {}) };
  const calls: string[] = [];
  // What each check answers next; a function can wait for the test (gate) or never end until it is stopped.
  const script: { site: (() => Promise<Answer>)[]; deploy: (() => Promise<Answer>)[]; ci: (() => Promise<Answer>)[]; project: (() => Promise<Answer>)[] } = { site: [], deploy: [], ci: [], project: [] };
  const signals: AbortSignal[] = [];
  const pick = (k: keyof typeof script, sig: AbortSignal): Promise<Answer> => { calls.push(k); signals.push(sig); const f = script[k].length > 1 ? script[k].shift()! : script[k][0]; return f ? f() : Promise.resolve({ outcome: "ok", reason: "fine" }); };
  const checks: Checks = { site: (_t, sig) => pick("site", sig), deploy: (_p, sig) => pick("deploy", sig), ci: (_p, sig) => pick("ci", sig), project: (_p, sig) => pick("project", sig) };
  const make = () => new WatchEngine({ file, emit: (e) => events.push(e), checks, get: (k) => (k in settings ? settings[k] : defaultOf(k)), now: () => clock.t, random: o.random ?? (() => 0), onProblem: (m) => problems.push(m), timeouts: o.timeouts, evidence: async (w) => (w.kind === "ci_status" ? "Failed: build, step \"test\"" : null) });
  const engine = make();
  const cmd = (type: string, extra: Record<string, unknown> = {}) => engine.handle({ v: 1, id: `c${Math.random()}`, type, project, ...extra } as never);
  const settle = async () => { await engine.idle(); await new Promise((r) => setTimeout(r, 2)); };
  const ok = (reason = "fine"): (() => Promise<Answer>) => () => Promise.resolve({ outcome: "ok", reason });
  const bad = (reason = "broken"): (() => Promise<Answer>) => () => Promise.resolve({ outcome: "failing", reason });
  const unk = (reason = "cannot tell"): (() => Promise<Answer>) => () => Promise.resolve({ outcome: "unknown", reason });
  return { dir, file, project, clock, events, problems, settings, calls, script, signals, checks, engine, make, cmd, settle, ok, bad, unk };
}
const ofType = (r: Rig, t: string) => r.events.filter((e) => e.type === t);
const addSite = async (r: Rig, o: Record<string, unknown> = {}) => { await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com", schedule: "15m", ...o }); await r.settle(); return r.engine.all()[r.engine.all().length - 1]; };

describe("schedules", () => {
  test("every 5, 15 or 30 minutes, hourly, or daily at an hour; nothing shorter than 5 minutes", () => {
    expect(parseSchedule("5m")).toEqual({ every: 5 * MIN });
    expect(parseSchedule("1h")).toEqual({ every: 60 * MIN });
    expect(parseSchedule("daily@9")).toEqual({ dailyAt: 9 });
    expect(parseSchedule("daily@23")).toEqual({ dailyAt: 23 });
    for (const bad of ["1m", "2m", "4m", "0m", "10s", "daily@24", "daily@-1", "daily@", "daily", "weekly", "", "5 m", 5, null, undefined]) expect(parseSchedule(bad), String(bad)).toBeNull();
  });
  test("a daily time is the next one on this Mac's clock, after the moment given", () => {
    const at9 = new Date(2026, 9, 22, 9, 0, 0).getTime();
    expect(nextRun({ dailyAt: 9 }, START)).toBe(new Date(2026, 9, 23, 9, 0, 0).getTime());
    expect(nextRun({ dailyAt: 9 }, at9 - 1)).toBe(at9);
    expect(nextRun({ dailyAt: 9 }, at9)).toBe(new Date(2026, 9, 23, 9, 0, 0).getTime());
    expect(nextRun({ dailyAt: 11 }, START)).toBe(new Date(2026, 9, 22, 11, 0, 0).getTime());
    expect(nextRun({ every: 15 * MIN }, START)).toBe(START + 15 * MIN);
  });
});

describe("adding, listing, removing", () => {
  test("a new watch is looked at straight away, and says so in plain events", async () => {
    const r = rig();
    r.script.site = [r.ok("The site answered 200 in 0.3 seconds.")];
    const w = await addSite(r);
    expect(w.state).toBe("ok");
    expect(w.reason).toBe("The site answered 200 in 0.3 seconds.");
    expect(w.target).toBe("https://shop.example.com/");
    expect(r.calls).toEqual(["site"]);
    expect(ofType(r, "watch.list")[0].watches).toHaveLength(1);
    const first = ofType(r, "watch.state")[0];
    expect(first).toMatchObject({ state: "unknown", checking: true, reason: NOT_CHECKED });
    expect(ofType(r, "watch.state").at(-1)).toMatchObject({ state: "ok", checking: false });
    expect(ofType(r, "watch.alert")).toEqual([]);
  });
  test("every event it sends is one the protocol accepts", async () => {
    const r = rig();
    r.script.site = [r.bad("The site answered with an error on its side (503)."), r.ok()];
    await addSite(r);
    await r.cmd("watch.list");
    r.clock.t += 15 * MIN + 1; r.engine.tick(); await r.settle();
    await r.cmd("watch.fix", { watch: r.engine.all()[0].id }); await r.settle();
    await r.cmd("watch.pause", { watch: r.engine.all()[0].id, paused: true });
    await r.cmd("watch.remove", { watch: r.engine.all()[0].id });
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing", "recovered"]);
    expect(ofType(r, "watch.evidence")).toHaveLength(1);
    for (const e of r.events) { const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(p.ok, `${e.type}: ${(p as any).error}`).toBe(true); }
  });
  test("what is refused, in plain words: a bad kind, a schedule under 5 minutes, a bad or private address, a missing folder", async () => {
    const r = rig();
    const refuse = async (extra: Record<string, unknown>, re: RegExp) => { const n = r.events.length; await r.cmd("watch.add", extra); const e = r.events.slice(n).find((x) => x.type === "protocol.error"); expect(e?.reason, JSON.stringify(extra)).toMatch(re); };
    await refuse({ kind: "nope", schedule: "15m" }, /not a kind/);
    await refuse({ kind: "site_up", target: "https://a.example.com", schedule: "1m" }, /5 minutes/);
    await refuse({ kind: "site_up", target: "ftp://a.example.com", schedule: "15m" }, /http or https/);
    await refuse({ kind: "site_up", target: "http://169.254.169.254/", schedule: "15m" }, /link local/);
    await refuse({ kind: "site_up", target: "http://192.168.1.1/", schedule: "15m" }, /private network/);
    await refuse({ kind: "site_up", target: "https://u:p@a.example.com", schedule: "15m" }, /password/);
    await refuse({ kind: "site_up", schedule: "15m" }, /web address/);
    await refuse({ kind: "site_up", target: "localhost:3000", schedule: "15m", project: join(r.dir, "missing") }, /not there/);
    expect(r.engine.all()).toEqual([]);
    expect(existsSync(r.file)).toBe(false);
  });
  test("an address with a part after ? is refused, and one saved earlier is kept without it, never in the file or an event", async () => {
    const r = rig();
    await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com/health?k=abc123secretvalue", schedule: "15m" }); await r.settle();
    expect(r.engine.all()).toHaveLength(0);
    expect(ofType(r, "protocol.error").at(-1).reason).toMatch(/after the \?/);
    const dir = tmp("q");
    const file = join(dir, "watch.json");
    const p = tmp("proj");
    writeFileSync(file, JSON.stringify({ version: 1, watches: [{ id: "w_aaaaaaaaaa", project: p, kind: "site_up", target: "https://old.example.com/health?k=abc123secretvalue#frag", schedule: "15m", state: "ok", since: "2026-10-22T09:00:00.000Z", reason: "fine", lastCheckedAt: null, alerted: false, history: [], createdAt: "2026-10-22T09:00:00.000Z" }] }));
    const q = rig({ file });
    expect(q.engine.all()[0].target).toBe("https://old.example.com/health");
    await q.engine.handle({ v: 1, id: "l", type: "watch.list", project: p } as never);
    q.engine.tick(); await q.settle();
    expect(JSON.stringify(q.events)).not.toContain("abc123secretvalue");
    expect(readFileSync(file, "utf8")).not.toContain("abc123secretvalue");
  });
  test("a typed localhost is fine for a dev server", async () => {
    const r = rig();
    r.script.site = [r.ok()];
    const w = await addSite(r, { target: "localhost:5173" });
    expect(w.target).toBe("http://localhost:5173/");
  });
  test("at most 10 watches in a project and 30 in all; the same thing twice is refused", async () => {
    const r = rig();
    for (let i = 0; i < MAX_PER_PROJECT; i++) await r.cmd("watch.add", { kind: "site_up", target: `https://s${i}.example.com`, schedule: "1h" });
    expect(r.engine.all()).toHaveLength(10);
    await r.cmd("watch.add", { kind: "site_up", target: "https://s99.example.com", schedule: "1h" });
    expect(r.events.at(-1).reason).toMatch(/at most 10/);
    await r.cmd("watch.add", { kind: "site_up", target: "https://s1.example.com", schedule: "1h" });
    const other = [tmp("p2"), tmp("p3"), tmp("p4")];
    for (const p of other) for (let i = 0; i < 10; i++) await r.engine.handle({ v: 1, id: "x", type: "watch.add", project: p, kind: "site_up", target: `https://t${i}.example.com`, schedule: "1h" } as never);
    expect(r.engine.all().length).toBeLessThanOrEqual(MAX_TOTAL);
    const n = r.engine.all().length;
    expect(n).toBe(MAX_TOTAL);
    await r.engine.handle({ v: 1, id: "x", type: "watch.add", project: tmp("p5"), kind: "site_up", target: "https://z.example.com", schedule: "1h" } as never);
    expect(r.engine.all()).toHaveLength(MAX_TOTAL);
    expect(r.events.at(-1).reason).toMatch(/at most 30/);
    await r.settle();
  });
  test("a project sees only its own watches, and cannot touch another project's", async () => {
    const r = rig();
    const w = await addSite(r);
    const other = tmp("other");
    const n = r.events.length;
    await r.engine.handle({ v: 1, id: "x", type: "watch.list", project: other } as never);
    expect(r.events.slice(n).find((e) => e.type === "watch.list")).toMatchObject({ project: other, watches: [] });
    await r.engine.handle({ v: 1, id: "x", type: "watch.remove", project: other, watch: w.id } as never);
    expect(r.events.at(-1).reason).toMatch(/not there/);
    await r.engine.handle({ v: 1, id: "x", type: "watch.pause", project: other, watch: w.id, paused: true } as never);
    await r.engine.handle({ v: 1, id: "x", type: "watch.check", project: other, watch: w.id } as never);
    await r.engine.handle({ v: 1, id: "x", type: "watch.fix", project: other, watch: w.id } as never);
    expect(r.engine.all()).toHaveLength(1);
    expect(r.engine.all()[0].state).toBe("ok");
    expect(ofType(r, "watch.evidence")).toEqual([]);
  });
  test("removing a watch stops its check and forgets it, in the file too", async () => {
    const r = rig();
    let release!: () => void;
    r.script.site = [() => new Promise<Answer>((res) => { release = () => res({ outcome: "failing", reason: "late" }); })];
    await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com", schedule: "15m" });
    expect(r.engine.busy()).toBe(1);
    const id = r.engine.all()[0].id;
    await r.cmd("watch.remove", { watch: id });
    release(); await r.settle();
    expect(r.engine.all()).toEqual([]);
    expect(ofType(r, "watch.alert")).toEqual([]);
    expect(JSON.parse(readFileSync(r.file, "utf8")).watches).toEqual([]);
  });
});

describe("the state machine", () => {
  async function through(r: Rig, answers: (() => Promise<Answer>)[]) {
    r.script.site = answers;
    const w = await addSite(r);
    return w;
  }
  const next = async (r: Rig, mins = 15) => { r.clock.t += mins * MIN + 120_000; r.engine.tick(); await r.settle(); };
  test("fine to failing raises one alert, and no more while it stays failing", async () => {
    const r = rig();
    await through(r, [r.ok(), r.bad("503"), r.bad("503"), r.bad("still 503"), r.bad("503")]);
    for (let i = 0; i < 4; i++) await next(r);
    expect(r.calls).toHaveLength(5);
    expect(ofType(r, "watch.alert")).toHaveLength(1);
    expect(ofType(r, "watch.alert")[0]).toMatchObject({ what: "failing", kind: "site_up", reason: "503", watch: r.engine.all()[0].id });
    expect(r.engine.all()[0]).toMatchObject({ state: "failing", alerted: true, reason: "503" });
  });
  test("when it is fine again one recovered event follows, and a second failure alerts again", async () => {
    const r = rig();
    await through(r, [r.ok(), r.bad("503"), r.ok(), r.ok(), r.bad("timeout")]);
    for (let i = 0; i < 4; i++) await next(r);
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing", "recovered", "failing"]);
  });
  test("a failing watch that cannot be read for a while (unknown) does not alert twice, and its recovery still counts", async () => {
    const r = rig();
    await through(r, [r.bad("503"), r.unk("signed out"), r.unk("signed out"), r.ok()]);
    for (let i = 0; i < 3; i++) await next(r);
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing", "recovered"]);
  });
  test("fine to unknown never alerts; unknown to failing does", async () => {
    const r = rig();
    await through(r, [r.ok(), r.unk("The Vercel tool is not installed."), r.bad("down")]);
    await next(r); await next(r);
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing"]);
    expect(r.engine.all()[0].history.map((h) => h.state)).toEqual(["ok", "unknown", "failing"]);
  });
  test("since changes only when the state does, and the history keeps the last 20 states", async () => {
    const r = rig();
    const flips = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? r.ok() : r.bad(`down ${i}`)));
    await through(r, flips);
    const sinces: string[] = [r.engine.all()[0].since];
    for (let i = 1; i < 30; i++) { await next(r); sinces.push(r.engine.all()[0].since); }
    expect(new Set(sinces).size).toBe(30);
    expect(r.engine.all()[0].history).toHaveLength(HISTORY);
    const steady = rig();
    await through(steady, [steady.ok(), steady.ok(), steady.ok()]);
    const s0 = steady.engine.all()[0].since;
    await next(steady); await next(steady);
    expect(steady.engine.all()[0].since).toBe(s0);
    expect(steady.engine.all()[0].history).toHaveLength(1);
  });
  test("quiet hours: no alerts at those hours, the checks still run, and a failure that lasts is told once the quiet ends", async () => {
    const r = rig({ settings: { "watch.quiet": true, "watch.quietFrom": 22, "watch.quietTo": 7 } });
    r.clock.t = new Date(2026, 9, 22, 23, 0, 0).getTime();
    await through(r, [r.bad("down"), r.bad("down"), r.bad("down"), r.ok()]);
    expect(r.engine.all()[0].state).toBe("failing");
    expect(ofType(r, "watch.alert")).toEqual([]);
    await next(r, 30);
    expect(r.calls).toHaveLength(2);
    expect(ofType(r, "watch.alert")).toEqual([]);
    r.clock.t = new Date(2026, 9, 23, 7, 5, 0).getTime();
    r.engine.tick(); await r.settle();
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing"]);
    r.clock.t = new Date(2026, 9, 23, 7, 30, 0).getTime();
    await next(r);
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing", "recovered"]);
  });
  test("a recovery during quiet hours is silent and clears the alert", async () => {
    const r = rig({ settings: { "watch.quiet": true, "watch.quietFrom": 9, "watch.quietTo": 18 } });
    r.clock.t = new Date(2026, 9, 22, 8, 30, 0).getTime();
    await through(r, [r.bad("down"), r.ok(), r.bad("down again")]);
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing"]);
    r.clock.t = new Date(2026, 9, 22, 9, 30, 0).getTime();
    r.engine.tick(); await r.settle();
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing"]);
    expect(r.engine.all()[0]).toMatchObject({ state: "ok", alerted: false });
    r.clock.t = new Date(2026, 9, 22, 19, 0, 0).getTime();
    r.engine.tick(); await r.settle();
    expect(ofType(r, "watch.alert").map((e) => e.what)).toEqual(["failing", "failing"]);
  });
  test("quiet hours that wrap midnight, or are equal, or are switched off", async () => {
    const hit = (h: number, o: Record<string, unknown>) => { const r = rig({ settings: o }); return (r.engine as any).quiet(new Date(2026, 9, 22, h, 30, 0).getTime()); };
    const q = { "watch.quiet": true, "watch.quietFrom": 22, "watch.quietTo": 7 };
    expect([hit(21, q), hit(22, q), hit(3, q), hit(6, q), hit(7, q), hit(12, q)]).toEqual([false, true, true, true, false, false]);
    expect(hit(3, { ...q, "watch.quiet": false })).toBe(false);
    expect(hit(3, { ...q, "watch.quietFrom": 5, "watch.quietTo": 5 })).toBe(false);
    expect([hit(8, { ...q, "watch.quietFrom": 9, "watch.quietTo": 17 }), hit(9, { ...q, "watch.quietFrom": 9, "watch.quietTo": 17 }), hit(16, { ...q, "watch.quietFrom": 9, "watch.quietTo": 17 }), hit(17, { ...q, "watch.quietFrom": 9, "watch.quietTo": 17 })]).toEqual([false, true, true, false]);
  });
  test("the words kept are cleaned of secrets and kept short", async () => {
    const r = rig();
    await through(r, [r.bad(`The site said token=abc123def456 ${"x".repeat(400)}`)]);
    const w = r.engine.all()[0];
    expect(w.reason).not.toContain("abc123def456");
    expect(w.reason.length).toBeLessThanOrEqual(240);
    expect(ofType(r, "watch.alert")[0].reason).not.toContain("abc123def456");
  });
});

describe("the schedule", () => {
  test("a check is not due before its time, is due at it, and the next one is a whole schedule later", async () => {
    const r = rig();
    await addSite(r);
    expect(r.calls).toHaveLength(1);
    r.clock.t += 14 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(1);
    r.clock.t += 1 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
    r.clock.t += 14 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
  });
  test("a Mac that slept through many checks runs one when it wakes, not one for each", async () => {
    const r = rig();
    await addSite(r);
    r.clock.t += 10 * 60 * MIN;   // ten hours asleep: forty missed checks
    r.engine.tick(); await r.settle();
    r.engine.tick(); await r.settle();
    r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
    r.clock.t += 15 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(3);
  });
  test("a clock set back is not waited out: a check planned on the wrong clock is due again within one schedule", async () => {
    const r = rig();
    await addSite(r);
    expect(r.calls).toHaveLength(1);
    r.clock.t -= 24 * 60 * MIN;   // set back a day
    r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
    for (let i = 0; i < 4; i++) { r.clock.t += 15 * MIN; r.engine.tick(); await r.settle(); }
    expect(r.calls).toHaveLength(6);   // and every 15 minutes on the new clock, as before
    // a daily watch whose clock goes back several hours is not left waiting until the next day after that
    const d = rig();
    await addSite(d, { schedule: "daily@9" });
    d.clock.t = new Date(2026, 9, 22, 4, 0, 0).getTime();
    d.engine.tick(); await d.settle();
    expect(d.calls).toHaveLength(2);
    // a small step back inside the schedule changes nothing
    const q = rig();
    await addSite(q);
    q.clock.t -= 2 * MIN; q.engine.tick(); await q.settle();
    expect(q.calls).toHaveLength(1);
  });
  test("a last check dated in the future (the clock was set back before the engine started) does not silence the watch", async () => {
    const r = rig();
    await addSite(r);
    const file = JSON.parse(readFileSync(r.file, "utf8"));
    file.watches[0].lastCheckedAt = new Date(START + 3 * 24 * 60 * MIN).toISOString();
    writeFileSync(r.file, JSON.stringify(file));
    const again = r.make();
    r.clock.t += 31_000;
    again.tick(); await again.idle(); await new Promise((x) => setTimeout(x, 2));
    expect(r.calls).toHaveLength(2);
  });
  test("a daily watch runs at its hour, and once on wake if its hour passed asleep", async () => {
    const r = rig();
    await addSite(r, { schedule: "daily@9" });
    expect(r.calls).toHaveLength(1);
    r.clock.t = new Date(2026, 9, 23, 8, 59, 0).getTime(); r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(1);
    r.clock.t = new Date(2026, 9, 23, 9, 0, 30).getTime(); r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
    r.clock.t = new Date(2026, 9, 26, 15, 0, 0).getTime();   // away three days
    r.engine.tick(); r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(3);
    r.clock.t = new Date(2026, 9, 27, 8, 0, 0).getTime(); r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(3);
  });
  test("jitter spreads the checks but never makes one early or later than a tenth of the schedule, capped at a minute", async () => {
    for (const [random, add] of [[0, 0], [0.999, 59_940]] as const) {
      const r = rig({ random: () => random });
      await addSite(r, { schedule: "1h" });
      const due = Date.parse(r.events.filter((e) => e.type === "watch.state").at(-1).nextAt);
      expect(due - START).toBeGreaterThanOrEqual(60 * MIN);
      expect(due - (START + 60 * MIN)).toBeCloseTo(add, -3);
    }
    const r = rig({ random: () => 0.999 });
    await addSite(r, { schedule: "5m" });
    const due = Date.parse(r.events.filter((e) => e.type === "watch.state").at(-1).nextAt);
    expect(due - (START + 5 * MIN)).toBeLessThan(30_000);
  });
  test("never two checks of one watch at once, however often the clock ticks or Check now is pressed", async () => {
    const r = rig();
    let release!: (a: Answer) => void;
    r.script.site = [() => new Promise<Answer>((res) => { release = res; })];
    await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com", schedule: "5m" });
    const id = r.engine.all()[0].id;
    for (let i = 0; i < 5; i++) { r.clock.t += 6 * MIN; r.engine.tick(); }
    await r.cmd("watch.check", { watch: id }); await r.cmd("watch.check", { watch: id });
    expect(r.calls).toHaveLength(1);
    release({ outcome: "ok", reason: "fine" }); await r.settle();
    expect(r.engine.all()[0].state).toBe("ok");
    expect(r.engine.busy()).toBe(0);
  });
  test("no more than three scheduled checks run together", async () => {
    const r = rig({ settings: { "watch.on": false } });
    const releases: (() => void)[] = [];
    r.script.site = [() => new Promise<Answer>((res) => releases.push(() => res({ outcome: "ok", reason: "fine" })))];
    for (let i = 0; i < 6; i++) await r.cmd("watch.add", { kind: "site_up", target: `https://s${i}.example.com`, schedule: "5m" });
    r.settings["watch.on"] = true;
    r.engine.tick();
    expect(r.engine.busy()).toBe(3);
    r.engine.tick();
    expect(r.engine.busy()).toBe(3);
    for (let i = 0; i < 20 && (releases.length || r.engine.busy()); i++) { releases.shift()?.(); await new Promise((x) => setTimeout(x, 2)); r.engine.tick(); }
    await r.settle();
    expect(r.calls).toHaveLength(6);
  });
  test("the engine starting again does not run everything at once: an overdue check waits a few seconds, a recent one waits its time", async () => {
    const r = rig({ random: () => 0.5 });
    await addSite(r);
    await addSite(r, { target: "https://other.example.com", schedule: "daily@9" });
    r.clock.t += 20 * MIN;
    const again = r.make();
    r.calls.length = 0;
    again.tick(); await again.idle();
    expect(r.calls).toHaveLength(0);
    r.clock.t += 20_000; again.tick(); await again.idle(); await new Promise((x) => setTimeout(x, 2));
    expect(r.calls).toEqual(["site"]);
  });
});

describe("the switches", () => {
  test("Watch routines off: nothing is checked on a schedule, but Check now still works", async () => {
    const r = rig({ settings: { "watch.on": false } });
    await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com", schedule: "5m" });
    expect(r.calls).toEqual([]);
    expect(r.engine.all()[0].state).toBe("unknown");
    r.clock.t += 60 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toEqual([]);
    await r.cmd("watch.check", { watch: r.engine.all()[0].id }); await r.settle();
    expect(r.calls).toEqual(["site"]);
    expect(r.engine.all()[0].state).toBe("ok");
    r.settings["watch.on"] = true;
    r.clock.t += 6 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
  });
  test("Flow off: the schedule stops, and it starts again when Flow is back", async () => {
    const r = rig();
    await addSite(r, { schedule: "5m" });
    r.settings["flow.on"] = false;
    r.clock.t += 60 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(1);
    r.settings["flow.on"] = true;
    r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(2);
  });
  test("Stop everything ends a running check and says nothing about the watch; the schedule is left as it was", async () => {
    const r = rig();
    r.script.site = [r.ok(), () => new Promise<Answer>((res, rej) => { r.signals.at(-1)!.addEventListener("abort", () => res(null)); })];
    await addSite(r, { schedule: "15m" });
    r.clock.t += 16 * MIN; r.engine.tick();
    expect(r.engine.busy()).toBe(1);
    const before = ofType(r, "watch.alert").length;
    r.engine.stopAll();
    await r.settle();
    expect(r.signals.at(-1)!.aborted).toBe(true);
    expect(r.engine.busy()).toBe(0);
    expect(r.engine.all()[0]).toMatchObject({ state: "ok", reason: "fine" });
    expect(ofType(r, "watch.alert")).toHaveLength(before);
    r.clock.t += 16 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(3);
  });
  test("pausing: nothing runs, a running check is dropped, resuming looks again at once", async () => {
    const r = rig();
    let release!: (a: Answer) => void;
    r.script.site = [() => new Promise<Answer>((res) => { release = res; }), r.ok()];
    await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com", schedule: "5m" });
    const id = r.engine.all()[0].id;
    await r.cmd("watch.pause", { watch: id, paused: true });
    release({ outcome: "failing", reason: "late answer" }); await r.settle();
    expect(r.engine.all()[0]).toMatchObject({ state: "paused", alerted: false });
    expect(ofType(r, "watch.alert")).toEqual([]);
    r.clock.t += 60 * MIN; r.engine.tick(); await r.settle();
    expect(r.calls).toHaveLength(1);
    await r.cmd("watch.check", { watch: id });
    expect(r.events.at(-1).reason).toMatch(/paused/);
    await r.cmd("watch.pause", { watch: id, paused: false }); await r.settle();
    expect(r.calls).toHaveLength(2);
    expect(r.engine.all()[0].state).toBe("ok");
  });
});

describe("a check that does not finish, or cannot run", () => {
  test("a tool that takes too long is stopped and is unknown, not failing; a site that takes too long is failing", async () => {
    const r = rig({ timeouts: { deploy_status: 20, site_up: 20 } });
    const never = (): (() => Promise<Answer>) => () => new Promise<Answer>((res) => { r.signals.at(-1)!.addEventListener("abort", () => res(null)); });
    r.script.deploy = [never()];
    r.script.site = [never()];
    await r.cmd("watch.add", { kind: "deploy_status", schedule: "15m" });
    await r.cmd("watch.add", { kind: "site_up", target: "https://shop.example.com", schedule: "15m" });
    await new Promise((x) => setTimeout(x, 60)); await r.settle();
    const [d, s] = r.engine.all();
    expect(d).toMatchObject({ kind: "deploy_status", state: "unknown", reason: "The check took too long, so I stopped it." });
    expect(s).toMatchObject({ kind: "site_up", state: "failing" });
    expect(s.reason).toMatch(/did not answer within/);
  });
  test("a check that throws is unknown, with a plain line, and the engine goes on", async () => {
    const r = rig();
    r.script.ci = [() => Promise.reject(new Error("spawn failed"))];
    await r.cmd("watch.add", { kind: "ci_status", schedule: "15m" }); await r.settle();
    expect(r.engine.all()[0]).toMatchObject({ state: "unknown" });
    expect(r.engine.all()[0].reason).toMatch(/check itself stopped/);
  });
  test("a project that is busy is not judged: the state stays, and it is tried again in two minutes", async () => {
    const r = rig();
    r.script.project = [r.ok("All of the project's own checks passed."), () => Promise.resolve({ skip: "Companion is working on this project right now." }), r.bad("Tests did not pass")];
    await r.cmd("watch.add", { kind: "project_checks", schedule: "1h" }); await r.settle();
    r.clock.t += 61 * MIN; r.engine.tick(); await r.settle();
    expect(r.engine.all()[0]).toMatchObject({ state: "ok" });
    expect(ofType(r, "watch.alert")).toEqual([]);
    r.clock.t += 3 * MIN; r.engine.tick(); await r.settle();
    expect(r.engine.all()[0]).toMatchObject({ state: "failing" });
    expect(ofType(r, "watch.alert")).toHaveLength(1);
  });
});

describe("watch.json", () => {
  test("only the latest result and the short history are kept, in a file only the owner can read", async () => {
    const r = rig();
    r.script.site = [r.bad("The site answered with an error on its side (503).")];
    const w = await addSite(r);
    const j = JSON.parse(readFileSync(r.file, "utf8"));
    expect(Object.keys(j)).toEqual(["version", "watches"]);
    expect(Object.keys(j.watches[0]).sort()).toEqual(["alerted", "createdAt", "history", "id", "kind", "lastCheckedAt", "project", "reason", "schedule", "since", "state", "target"]);
    expect(j.watches[0].history).toEqual([{ at: expect.any(String), state: "failing" }]);
    expect(statSync(r.file).mode & 0o777).toBe(0o600);
    expect(w.id).toMatch(/^w_[0-9a-f]{10}$/);
  });
  test("it is read again when the engine starts, with the state, the history and the alert already told", async () => {
    const r = rig();
    r.script.site = [r.bad("down"), r.bad("down")];
    await addSite(r);
    const again = r.make();
    expect(again.all()).toEqual(r.engine.all());
    expect(again.all()[0]).toMatchObject({ state: "failing", alerted: true });
    r.clock.t += 20 * MIN + 31_000;
    again.tick(); await again.idle(); await new Promise((x) => setTimeout(x, 2));
    expect(ofType(r, "watch.alert")).toHaveLength(1);   // not told a second time after a restart
  });
  test("a damaged file is kept aside, the list starts empty, and Companion says so", async () => {
    const dir = tmp("dmg");
    const file = join(dir, "watch.json");
    writeFileSync(file, "{ not json");
    const r = rig({ file });
    expect(r.engine.all()).toEqual([]);
    expect(r.problems.join(" ")).toMatch(/damaged/);
    expect(readFileSync(join(dir, "watch.damaged.json"), "utf8")).toBe("{ not json");
    expect(existsSync(file)).toBe(false);
    await addSite(r);
    expect(JSON.parse(readFileSync(file, "utf8")).watches).toHaveLength(1);
    const odd = tmp("odd");
    writeFileSync(join(odd, "watch.json"), JSON.stringify({ watches: "no" }));
    expect(rig({ file: join(odd, "watch.json") }).engine.all()).toEqual([]);
  });
  test("an entry that makes no sense is dropped on its own and the rest are kept", async () => {
    const dir = tmp("part");
    const file = join(dir, "watch.json");
    const p = tmp("proj");
    const good = { id: "w_aaaaaaaaaa", project: p, kind: "site_up", target: "https://ok.example.com/", schedule: "15m", state: "ok", since: "2026-10-22T09:00:00.000Z", reason: "fine", lastCheckedAt: null, alerted: false, history: [], createdAt: "2026-10-22T09:00:00.000Z" };
    writeFileSync(file, JSON.stringify({ version: 1, watches: [good, { ...good, id: "w_b", kind: "nope" }, { ...good, id: "w_c", schedule: "1m" }, { ...good, id: "w_d", target: "http://10.0.0.1/" }, { ...good, id: "w_e", state: "weird" }, { ...good, id: "w e" }, 7, null, { ...good, id: "w_aaaaaaaaaa" }] }));
    const r = rig({ file });
    expect(r.engine.all().map((w) => w.id)).toEqual(["w_aaaaaaaaaa"]);
    expect(r.problems).toEqual([]);
  });
  test("a file that cannot be saved is said once and the watches still run", async () => {
    const dir = tmp("ro");
    const r = rig({ file: join(dir, "missing-folder", "watch.json") });
    await addSite(r);
    expect(r.problems.length).toBeGreaterThan(0);
    expect(r.engine.all()).toHaveLength(1);
  });
});

describe("Fix it from a failed watch", () => {
  test("it gathers the evidence, read only, and sends it once; it never starts a task", async () => {
    const r = rig();
    r.script.ci = [r.bad("test failed")];
    await r.cmd("watch.add", { kind: "ci_status", schedule: "15m" }); await r.settle();
    await r.cmd("watch.fix", { watch: r.engine.all()[0].id }); await r.settle();
    const e = ofType(r, "watch.evidence");
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: "ci_status", text: "Failed: build, step \"test\"" });
    expect(r.events.some((x) => x.type === "agent.state" || x.type === "checkpoint.created")).toBe(false);
  });
  test("with nothing more to say it hands over the watch's own reason, cleaned of secrets and capped", async () => {
    const r = rig();
    r.script.project = [r.bad("Tests did not pass: password=hunter2hunter2")];
    await r.cmd("watch.add", { kind: "project_checks", schedule: "15m" }); await r.settle();
    await r.cmd("watch.fix", { watch: r.engine.all()[0].id }); await r.settle();
    const text = ofType(r, "watch.evidence")[0].text as string;
    expect(text).toContain("Tests did not pass");
    expect(text).not.toContain("hunter2hunter2");
  });
  const slow = (dir: string, events: any[], o: { fixMs?: number } = {}) => {
    const project = tmp("proj");
    const state: { release?: (t: string) => void; signal?: AbortSignal } = {};
    const e = new WatchEngine({ file: join(dir, "watch.json"), emit: (x) => events.push(x), get: (k) => defaultOf(k), checks: { site: async () => ({ outcome: "failing", reason: "down password=hunter2hunter2" }), deploy: async () => null, ci: async () => null, project: async () => null }, evidence: (_w, sig) => new Promise<string>((res) => { state.release = res; state.signal = sig; }), now: () => START, random: () => 0, ...o });
    return { e, project, state };
  };
  test("a Stop in the middle of gathering it still answers the page: no evidence, so nothing starts, and the watch's own words", async () => {
    const events: any[] = [];
    const { e, project, state } = slow(tmp("fix"), events);
    await e.handle({ v: 1, id: "a", type: "watch.add", project, kind: "site_up", target: "https://a.example.com", schedule: "15m" } as never);
    await e.idle(); await new Promise((x) => setTimeout(x, 2));
    const p = e.handle({ v: 1, id: "b", type: "watch.fix", project, watch: e.all()[0].id } as never);
    e.stopAll();
    state.release?.("late evidence");
    await p;
    const got = events.filter((x) => x.type === "watch.evidence");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ stopped: true, watch: e.all()[0].id });
    expect(got[0].text).not.toContain("late evidence");
    expect(got[0].text).not.toContain("hunter2hunter2");
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...got[0] })).ok).toBe(true);
    expect(state.signal?.aborted).toBe(true);
  });
  test("gathering that takes too long is stopped and answered the same way, so the button never stays on 'reading'", async () => {
    const events: any[] = [];
    const { e, project } = slow(tmp("fix"), events, { fixMs: 30 });
    await e.handle({ v: 1, id: "a", type: "watch.add", project, kind: "site_up", target: "https://a.example.com", schedule: "15m" } as never);
    await e.idle(); await new Promise((x) => setTimeout(x, 2));
    await e.handle({ v: 1, id: "b", type: "watch.fix", project, watch: e.all()[0].id } as never);
    expect(events.filter((x) => x.type === "watch.evidence")).toEqual([expect.objectContaining({ stopped: true })]);
    expect(e.busy()).toBe(0);
  });
  test("evidence that arrives in time carries no stopped mark", async () => {
    const r = rig();
    r.script.ci = [r.bad("test failed")];
    await r.cmd("watch.add", { kind: "ci_status", schedule: "15m" }); await r.settle();
    await r.cmd("watch.fix", { watch: r.engine.all()[0].id }); await r.settle();
    expect(ofType(r, "watch.evidence")[0].stopped).toBeUndefined();
  });
});
