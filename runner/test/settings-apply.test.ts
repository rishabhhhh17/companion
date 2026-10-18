// The engine's side of the settings registry (T16): the shell sends settings.apply as the first line after every start
// and after each change the engine applies; the engine checks each value again with the same rules (protocol/settings.ts),
// keeps them in memory only, and a task reads them when it starts. The worked example is "Most turns in one task"
// (work.maxTurns), which reaches the SDK as its maxTurns option.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunnerSettings } from "../src/settings.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { buildSdkOptions, SdkEngine } from "../src/sdkEngine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Ledger } from "../src/ledger.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-setapply-${l}-`))); made.push(d); return d; };
const apply = (values: Record<string, unknown>, project?: string, projectValues?: Record<string, unknown>) =>
  ({ v: 1 as const, id: "s1", type: "settings.apply" as const, values, ...(project ? { project } : {}), ...(projectValues ? { projectValues } : {}) });
const NO_PROJECT = "no-project";

describe("the settings line", () => {
  test("it is a protocol command, and its answer an event that names settings, never values", () => {
    expect(parseCommand(JSON.stringify(apply({ "work.maxTurns": 120 }))).ok).toBe(true);
    expect(parseCommand(JSON.stringify(apply({}, "/p", {}))).ok).toBe(true);
    expect(parseCommand('{"v":1,"id":"x","type":"settings.apply"}').ok).toBe(false);
    expect(parseCommand('{"v":1,"id":"x","type":"settings.apply","values":[]}').ok).toBe(false);
    expect(parseEvent('{"v":1,"id":"e","type":"settings.applied","accepted":["work.maxTurns"],"refused":[]}').ok).toBe(true);
    expect(parseEvent('{"v":1,"id":"e","type":"settings.applied","accepted":"work.maxTurns"}').ok).toBe(false);
  });
});

describe("what the engine takes from it", () => {
  test("with nothing applied every setting is its usual value", () => {
    const s = new RunnerSettings();
    expect(s.get("work.maxTurns")).toBe(80);
  });
  test("a valid value is taken, tidied the same way the shell tidies it", () => {
    const s = new RunnerSettings();
    expect(s.apply(apply({ "work.maxTurns": 124 }))).toEqual({ accepted: ["work.maxTurns"], refused: [] });
    expect(s.get("work.maxTurns")).toBe(120);
  });
  test("a value that breaks the rules is refused and the usual value is used", () => {
    const s = new RunnerSettings();
    expect(s.apply(apply({ "work.maxTurns": 500 }))).toEqual({ accepted: [], refused: ["work.maxTurns"] });
    expect(s.get("work.maxTurns")).toBe(80);
    expect(s.apply(apply({ "work.maxTurns": "120" })).refused).toEqual(["work.maxTurns"]);
  });
  test("names this version does not know are ignored; settings the engine does not apply are refused", () => {
    const s = new RunnerSettings();
    const r = s.apply(apply({ "later.setting": 1, "fun.reactions": false, "spend.dailyLimit": 20, "constructor": 1, "__proto__": 2 }));
    expect(r.accepted).toEqual([]);
    expect(r.refused.sort()).toEqual(["fun.reactions", "spend.dailyLimit"]);
    expect(s.get("later.setting")).toBeUndefined();
  });
  test("each line replaces the one before, so a setting put back arrives as a missing name", () => {
    const s = new RunnerSettings();
    s.apply(apply({ "work.maxTurns": 150 }));
    expect(s.get("work.maxTurns")).toBe(150);
    s.apply(apply({}));
    expect(s.get("work.maxTurns")).toBe(80);
  });
  test("a project's own values apply only to that project, and an app setting is never taken as one", () => {
    const s = new RunnerSettings();
    const r = s.apply(apply({}, "/Users/me/site", { "work.maxTurns": 150 }));
    expect(r.refused).toEqual(["work.maxTurns"]);   // work.maxTurns is for every project
    expect(s.get("work.maxTurns", "/Users/me/site")).toBe(80);
  });
  test("nothing is written anywhere", () => {
    const d = tmp("cwd"); const before = process.cwd();
    try { process.chdir(d); const s = new RunnerSettings(); s.apply(apply({ "work.maxTurns": 150 })); expect(readdirSync(d)).toEqual([]); }
    finally { process.chdir(before); }
  });
});

// ---- the worked example, end to end inside the engine ----

const step = (rung: string, status: string) => ({ rung, label: rung, status: status as "passed", detail: "", ms: 1 });
const ladder = (verdict: LadderResult["verdict"]): LadderResult => ({ verdict, steps: [step("tests", verdict === "failed" ? "failed" : "passed")] as never, ...(verdict === "failed" ? { failedAt: step("tests", "failed") as never } : {}) });
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });
const start = (project: string, id = "c1") => ({ v: 1 as const, id, type: "agent.start" as const, project, agent: "a1", mode: "drive" as const, prompt: "make it", model: "m", budgetUsd: 3 });

function rig(rounds: Step[][], proof: (n: number) => Promise<LadderResult>) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const settings = new RunnerSettings();
  const engine = new ScriptedEngine(rounds);
  const events: Event[] = [];
  let n = 0;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), settings, proof: async () => proof(++n) });
  return { project, settings, engine, events, runner };
}

describe("most turns in one task (work.maxTurns)", () => {
  test("a task is given 80 turns unless the setting says otherwise, and 120 after it was changed", async () => {
    const r = rig([[bash("echo a > b.txt")], [bash("echo c > d.txt")]], async () => ladder("passed"));
    await r.runner.handle(start(r.project));
    expect(r.engine.calls[0].maxTurns).toBe(80);
    r.settings.apply(apply({ "work.maxTurns": 120 }));
    await r.runner.handle(start(r.project, "c2"));
    expect(r.engine.calls[1].maxTurns).toBe(120);
  });
  test("a running task keeps the number it started with, through every round of its fix loop", async () => {
    let r!: ReturnType<typeof rig>;
    r = rig([[bash("echo a > b.txt")], [bash("echo c > d.txt")]], async (n) => { if (n === 1) { r.settings.apply(apply({ "work.maxTurns": 150 })); return ladder("failed"); } return ladder("passed"); });
    await r.runner.handle(start(r.project));
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls.map((c) => c.maxTurns)).toEqual([80, 80]);
  });
  test("a refused value leaves the usual 80", async () => {
    const r = rig([[bash("echo a > b.txt")]], async () => ladder("passed"));
    r.settings.apply(apply({ "work.maxTurns": 500 }));
    await r.runner.handle(start(r.project));
    expect(r.engine.calls[0].maxTurns).toBe(80);
  });
  test("planning, Rescue and Research read it too", async () => {
    const r = rig([[{ text: "1. Do the thing", costUsd: 0.01 }]], async () => ladder("passed"));
    r.settings.apply(apply({ "work.maxTurns": 60 }));
    await r.runner.handle({ v: 1, id: "p1", type: "drive.plan", project: r.project, agent: "a1", goal: "make it", model: "m", budgetUsd: 1 });
    expect(r.engine.calls[0].planOnly).toBe(true);
    expect(r.engine.calls[0].maxTurns).toBe(60);
  });
  test("it reaches the SDK as its own turn limit; with none given it stays 80", () => {
    const base = { project: "/p", model: "claude-sonnet-5-5", budgetUsd: 3, claudeBinary: "/x/claude", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal };
    expect((buildSdkOptions(base) as any).maxTurns).toBe(80);
    expect((buildSdkOptions({ ...base, maxTurns: 120 }) as any).maxTurns).toBe(120);
  });
  test("the real engine wrapper hands the task's number to the SDK", async () => {
    let seen: any = null;
    const queryFn = ((p: any) => { seen = p.options; return (async function* () { yield { type: "result", subtype: "success", total_cost_usd: 0, session_id: "s" }; })(); }) as never;
    const e = new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn });
    for await (const _ of e.start({ prompt: "p", project: "/p", model: "claude-sonnet-5-5", signal: new AbortController().signal, budgetUsd: 1, authorize: async () => ({ allow: true, reason: "" }), maxTurns: 130 })) { /* drain */ }
    expect(seen.maxTurns).toBe(130);
  });
});

// ---- the settings for every project work with no folder chosen ----

function bare() {
  const data = tmp("data");
  const events: Event[] = [];
  let limit: number | null = null;
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), memoryDir: data, ledger: new Ledger(":memory:"), saveDailyLimit: (usd) => { limit = usd; } });
  return { data, events, runner, saved: () => limit };
}

describe("with no folder chosen (the stand in project)", () => {
  test("Explain can be turned off and on, for every project, and no folder is read or written", async () => {
    const r = bare();
    const cwd = tmp("cwd"); const before = process.cwd();
    try {
      process.chdir(cwd);
      await r.runner.handle({ v: 1, id: "x", type: "explain.set", project: NO_PROJECT, enabled: false });
      const st = r.events.filter((e) => e.type === ("explain.state" as never)) as any[];
      expect(st.at(-1)).toMatchObject({ project: NO_PROJECT, enabled: false });
      expect(readdirSync(cwd)).toEqual([]);
      expect(existsSync(join(r.data, "memory-settings.json"))).toBe(true);
    } finally { process.chdir(before); }
  });
  test("pausing learning works and the state comes back with profile lines only", async () => {
    const r = bare();
    const cwd = tmp("cwd2"); const before = process.cwd();
    try {
      process.chdir(cwd);
      await r.runner.handle({ v: 1, id: "x", type: "memory.pause", project: NO_PROJECT, paused: true });
      const st = r.events.filter((e) => e.type === ("memory.state" as never)) as any[];
      expect(st.at(-1)).toMatchObject({ project: NO_PROJECT, paused: true, projectLines: [] });
      expect(r.events.some((e) => e.type === "protocol.error")).toBe(false);
      expect(readdirSync(cwd)).toEqual([]);
    } finally { process.chdir(before); }
  });
  test("the daily limit can be seen and changed, with nothing spent", async () => {
    const r = bare();
    await r.runner.handle({ v: 1, id: "x", type: "spending.set", project: NO_PROJECT, limitUsd: 25 });
    await r.runner.handle({ v: 1, id: "y", type: "spending.show", project: NO_PROJECT });
    const st = r.events.filter((e) => e.type === "spending.state") as any[];
    expect(st.at(-1)).toMatchObject({ project: NO_PROJECT, limitUsd: 25, spentUsd: 0 });
    expect(r.saved()).toBe(25);
  });
});

describe("the runner program", () => {
  test("answers a settings line with what it took and what it refused", async () => {
    const data = tmp("prog");
    const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" } });
    proc.stdin.write(JSON.stringify(apply({ "work.maxTurns": 120, "fun.reactions": false })) + "\n"); proc.stdin.flush();
    const lines: string[] = []; let buf = "";
    const dec = new TextDecoder();
    const reader = (async () => { for await (const c of proc.stdout) { buf += dec.decode(c, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } } })();
    const end = Date.now() + 8000;
    while (!lines.some((l) => l.includes('"settings.applied"')) && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    proc.stdin.end(); await proc.exited; await reader;
    const got = lines.map((l) => JSON.parse(l)).find((e) => e.type === "settings.applied");
    expect(got).toMatchObject({ accepted: ["work.maxTurns"], refused: ["fun.reactions"] });
    expect(JSON.stringify(got)).not.toContain("120");
  });
});
