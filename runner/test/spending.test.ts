// The daily spending limit: what each project may spend of the person's own Claude in a day (an estimate). It can be
// changed from Settings, within sane bounds, and is kept in Companion's data folder so it holds after a restart.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDailyLimit, DEFAULT_DAILY_LIMIT_USD, MAX_DAILY_LIMIT_USD, MIN_DAILY_LIMIT_USD, SpendingStore, startingLimit } from "../src/spending.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { Ledger } from "../src/ledger.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseCommand, parseEvent, serialize, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-spending-${l}-`))); made.push(d); return d; };

describe("what a daily limit may be", () => {
  test("the bounds and the default", () => {
    expect([MIN_DAILY_LIMIT_USD, DEFAULT_DAILY_LIMIT_USD, MAX_DAILY_LIMIT_USD]).toEqual([1, 10, 500]);
  });
  test("a sane amount of dollars is accepted", () => {
    for (const n of [1, 10, 12.5, 500]) expect(checkDailyLimit(n)).toEqual({ ok: true, usd: n });
  });
  test("cents are kept to two places", () => expect(checkDailyLimit(12.499999)).toEqual({ ok: true, usd: 12.5 }));
  test("too little, too much, or not a number is refused in plain words", () => {
    for (const n of [0, 0.5, -3, 500.01, 1e9, Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined]) {
      const r = checkDailyLimit(n);
      expect(r.ok, String(n)).toBe(false);
      if (!r.ok) expect(r.reason).toBe("The daily limit must be between 1 and 500 dollars.");
    }
  });
});

describe("where it is kept", () => {
  test("saved and read back, private to this person", () => {
    const f = join(tmp("d"), "spending.json");
    const s = new SpendingStore(f);
    expect(s.read()).toBeNull();
    s.save(25);
    expect(new SpendingStore(f).read()).toBe(25);
    expect(statSync(f).mode & 0o777).toBe(0o600);
  });
  test("a damaged file, or a value out of bounds in it, is not trusted", () => {
    const f = join(tmp("d"), "spending.json");
    writeFileSync(f, "{not json");
    expect(new SpendingStore(f).read()).toBeNull();
    writeFileSync(f, JSON.stringify({ dailyLimitUsd: 100000 }));
    expect(new SpendingStore(f).read()).toBeNull();
    writeFileSync(f, JSON.stringify({ dailyLimitUsd: "25" }));
    expect(new SpendingStore(f).read()).toBeNull();
  });
  test("at start: a developer's setting first, then the saved choice, then the default", () => {
    expect(startingLimit("0.0005", 25)).toBe(0.0005);
    expect(startingLimit(undefined, 25)).toBe(25);
    expect(startingLimit("", 25)).toBe(25);
    expect(startingLimit("abc", null)).toBe(DEFAULT_DAILY_LIMIT_USD);
    expect(startingLimit(undefined, null)).toBe(DEFAULT_DAILY_LIMIT_USD);
  });
});

describe("the protocol", () => {
  test("setting and showing the limit are commands, and the answer is an event", () => {
    expect(parseCommand(serialize({ v: 1, id: "b1", type: "spending.show", project: "/p" } as never)).ok).toBe(true);
    expect(parseCommand(serialize({ v: 1, id: "b2", type: "spending.set", project: "/p", limitUsd: 25 } as never)).ok).toBe(true);
    expect(parseCommand('{"v":1,"id":"b3","type":"spending.set","project":"/p","limitUsd":"25"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"b4","type":"spending.set","project":"/p"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"b5","type":"spending.show"}').ok).toBe(false);
    expect(parseEvent('{"v":1,"id":"e1","type":"spending.state","project":"/p","limitUsd":10,"spentUsd":0.42,"minUsd":1,"maxUsd":500}').ok).toBe(true);
    expect(parseEvent('{"v":1,"id":"e2","type":"spending.state","project":"/p","limitUsd":10}').ok).toBe(false);
  });
});

describe("in the runner", () => {
  const setup = (o: { limit?: number; save?: (usd: number) => void } = {}) => {
    const events: Event[] = [];
    const ledger = new Ledger(":memory:");
    const project = tmp("p");
    const runner = new AgentRunner({
      shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "a.txt", content: "x" } }, costUsd: 0.01 }]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger,
      dailyCeilingUsd: o.limit, saveDailyLimit: o.save, proof: async () => ({ verdict: "passed", steps: [] }),
    });
    const states = () => events.filter((e) => e.type === "spending.state") as any[];
    return { events, ledger, project, runner, states };
  };
  test("showing it gives the limit and what this project spent today", async () => {
    const r = setup({ limit: 10 });
    r.ledger.add(r.project, 0.42);
    await r.runner.handle({ v: 1, id: "b", type: "spending.show", project: r.project } as never);
    expect(r.states().at(-1)).toMatchObject({ project: r.project, limitUsd: 10, spentUsd: 0.42, minUsd: 1, maxUsd: 500 });
    expect(r.states().at(-1).problem).toBeUndefined();
  });
  test("without a starting value it is the default", async () => {
    const r = setup();
    await r.runner.handle({ v: 1, id: "b", type: "spending.show", project: r.project } as never);
    expect(r.states().at(-1).limitUsd).toBe(10);
  });
  test("setting it saves it, says the new limit, and work beyond the old limit can start", async () => {
    const saved: number[] = [];
    const r = setup({ limit: 1, save: (u) => saved.push(u) });
    r.ledger.add(r.project, 1.5);
    await r.runner.handle({ v: 1, id: "t1", type: "agent.start", project: r.project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    expect(r.events.some((e) => e.type === "protocol.error" && /daily_limit/.test((e as any).reason))).toBe(true);
    await r.runner.handle({ v: 1, id: "b", type: "spending.set", project: r.project, limitUsd: 25 } as never);
    expect(saved).toEqual([25]);
    expect(r.states().at(-1)).toMatchObject({ limitUsd: 25, spentUsd: 1.5 });
    const before = r.events.length;
    await r.runner.handle({ v: 1, id: "t2", type: "agent.start", project: r.project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 });
    expect(r.events.slice(before).some((e) => e.type === "receipt")).toBe(true);
  });
  test("an amount out of bounds is refused: nothing is saved and the limit stays", async () => {
    const saved: number[] = [];
    const r = setup({ limit: 10, save: (u) => saved.push(u) });
    for (const bad of [0.5, 501, 100000]) {
      await r.runner.handle({ v: 1, id: "b", type: "spending.set", project: r.project, limitUsd: bad } as never);
      expect(r.states().at(-1)).toMatchObject({ limitUsd: 10, problem: "The daily limit must be between 1 and 500 dollars." });
    }
    expect(saved).toEqual([]);
  });
  test("if it cannot be saved, it is not changed, and the person is told", async () => {
    const r = setup({ limit: 10, save: () => { throw new Error("disk full"); } });
    await r.runner.handle({ v: 1, id: "b", type: "spending.set", project: r.project, limitUsd: 25 } as never);
    expect(r.states().at(-1).limitUsd).toBe(10);
    expect(r.states().at(-1).problem).toBe("The new limit could not be saved, so it was not changed. Try again.");
  });
  test("with nowhere to keep it, it cannot be changed", async () => {
    const r = setup({ limit: 10 });
    await r.runner.handle({ v: 1, id: "b", type: "spending.set", project: r.project, limitUsd: 25 } as never);
    expect(r.states().at(-1).limitUsd).toBe(10);
    expect(r.states().at(-1).problem).toBe("The new limit could not be saved, so it was not changed. Try again.");
  });
});

// The runner program reads the saved limit when it starts, and keeps a new one for next time.
describe("the runner program", () => {
  function launch(data: string) {
    const env: Record<string, string> = { ...process.env as Record<string, string>, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" };
    delete env.COMPANION_DAILY_CEILING_USD;
    const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env });
    const lines: string[] = [];
    const done = (async () => { let buf = ""; const dec = new TextDecoder(); for await (const c of proc.stdout) { buf += dec.decode(c, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } } })();
    const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
    const waitFor = async (cond: () => boolean) => { const end = Date.now() + 8000; while (!cond()) { if (Date.now() > end) throw new Error("timed out: " + lines.join(" | ").slice(0, 400)); await new Promise((r) => setTimeout(r, 20)); } };
    const states = () => lines.map((l) => JSON.parse(l)).filter((e) => e.type === "spending.state");
    const close = async () => { proc.stdin.end(); await proc.exited; await done; };
    return { send, waitFor, states, close, lines };
  }
  test("starts with the saved limit, and a new one is there after a restart", async () => {
    const data = tmp("data");
    writeFileSync(join(data, "spending.json"), JSON.stringify({ dailyLimitUsd: 25 }));
    const project = tmp("proj");
    const a = launch(data);
    a.send({ v: 1, id: "s", type: "spending.show", project });
    await a.waitFor(() => a.states().length >= 1);
    expect(a.states()[0].limitUsd).toBe(25);
    a.send({ v: 1, id: "t", type: "spending.set", project, limitUsd: 40 });
    await a.waitFor(() => a.states().length >= 2);
    expect(a.states()[1].limitUsd).toBe(40);
    await a.close();
    for (const l of a.lines) expect(parseEvent(l).ok, l).toBe(true);
    expect(JSON.parse(readFileSync(join(data, "spending.json"), "utf8")).dailyLimitUsd).toBe(40);
    const b = launch(data);
    b.send({ v: 1, id: "s", type: "spending.show", project });
    await b.waitFor(() => b.states().length >= 1);
    expect(b.states()[0].limitUsd).toBe(40);
    await b.close();
  });
  test("with nothing saved it starts at the default and writes nothing until asked", async () => {
    const data = tmp("data");
    const a = launch(data);
    a.send({ v: 1, id: "s", type: "spending.show", project: tmp("proj") });
    await a.waitFor(() => a.states().length >= 1);
    expect(a.states()[0].limitUsd).toBe(10);
    await a.close();
    expect(existsSync(join(data, "spending.json"))).toBe(false);
  });
});
