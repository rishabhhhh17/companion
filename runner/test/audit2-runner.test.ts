// Second audit, runner fixes: Put it online re-checks a version whose last check had gaps or failed, a project's own check
// settings survive a folder switch, a damaged settings or ships file is never silently overwritten, the engine starts with a
// log that cannot be written, an Undo point exists from the start of a task, and Companion's writes in the person's project
// are careful (symlinks, leftover temp files, a stale lock). Stand ins only: nothing real runs, nothing reaches the network.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) { const d = made.pop()!; try { chmodSync(d, 0o755); } catch { /* gone */ } rmSync(d, { recursive: true, force: true }); } });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-a2-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

describe("Put it online runs a check again when the last one had gaps or failed", () => {
  function setup(verdicts: LadderResult["verdict"][]) {
    const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
    const events: Event[] = [];
    let n = 0;
    const proof = async (_ctx: ProofContext): Promise<LadderResult> => ({ verdict: verdicts[Math.min(n++, verdicts.length - 1)], steps: [] });
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof });
    const check = () => runner.handle({ v: 1, id: "c" + Math.random(), type: "ship.check", project, runChecks: true } as never);
    return { events, check, runs: () => n };
  }
  test("passed with gaps: pressing again runs the checks, and a fixed cause passes", async () => {
    const t = setup(["passed_with_gaps", "passed"]);
    await t.check();
    expect(of(t.events, "ship.gates").at(-1).gates.find((g: any) => g.id === "checked").status).toBe("could_not_check");
    await t.check();
    expect(t.runs()).toBe(2);
    expect(of(t.events, "ship.gates").at(-1).gates.find((g: any) => g.id === "checked").status).toBe("passed");
  });
  test("failed: pressing again runs the checks too", async () => {
    const t = setup(["failed", "passed"]);
    await t.check(); await t.check();
    expect(t.runs()).toBe(2);
    expect(of(t.events, "ship.gates").at(-1).gates.find((g: any) => g.id === "checked").status).toBe("passed");
  });
  test("a pass on an unchanged project is still reused, and the gap message never says the project changed", async () => {
    const t = setup(["passed"]);
    await t.check(); await t.check();
    expect(t.runs()).toBe(1);
    const g = setup(["passed_with_gaps", "passed_with_gaps"]);
    await g.check(); await g.check();
    const gate = of(g.events, "ship.gates").at(-1).gates.find((x: any) => x.id === "checked");
    expect(gate.detail).not.toMatch(/has changed since/);
    expect(gate.detail).toMatch(/Settings|not installed|left out/i);
  });
});

describe("a project's own settings survive a switch to another folder", () => {
  const apply = (project: string, projectValues: Record<string, unknown>) => ({ v: 1 as const, id: "s", type: "settings.apply" as const, values: {}, project, projectValues });
  test("apply A, then B, then read A: A keeps its own values and B has its own", async () => {
    const { RunnerSettings } = await import("../src/settings.ts");
    const s = new RunnerSettings();
    s.apply(apply("/work/a", { "check.install": "never" }));
    s.apply(apply("/work/b", {}));
    expect(s.get("check.install", "/work/a")).toBe("never");
    expect(s.get("check.install", "/work/b")).toBe("auto");
    // A new apply for A replaces A's values only, so a setting put back to usual is usual again.
    s.apply(apply("/work/a", {}));
    expect(s.get("check.install", "/work/a")).toBe("auto");
  });
  test("it stays bounded", async () => {
    const { RunnerSettings } = await import("../src/settings.ts");
    const s = new RunnerSettings();
    for (let i = 0; i < 80; i++) s.apply(apply(`/work/p${i}`, { "check.install": "never" }));
    expect(s.get("check.install", "/work/p79")).toBe("never");
    expect(s.get("check.install", "/work/p0")).toBe("auto");
  });
});

describe("the engine starts when the task log or the spending count cannot be written", () => {
  // A log that holds a task cut short, made read-only: the UPDATE that marks it interrupted cannot be written (as on a full
  // disk). Both files must still open, say so, and work in memory.
  function readOnlyLog(name: string, make: (path: string) => void) {
    const dir = tmp("ro"), path = join(dir, name);
    make(path);
    for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o444);
    return path;
  }
  test("a task log with a task still running, read-only", async () => {
    const { Database } = await import("bun:sqlite");
    const path = readOnlyLog("tasks.db", (p) => {
      const log = new TaskLog(p);
      log.start({ project: "/p", agent: "a", mode: "drive", label: "x", startedAt: new Date().toISOString() });
      (log as any).db.close();
    });
    void Database;
    const said: string[] = [];
    let log!: TaskLog;
    expect(() => { log = new TaskLog(path, (m) => said.push(m)); }).not.toThrow();
    expect(said.length).toBeGreaterThan(0);
    const id = log.start({ project: "/p", agent: "a", mode: "drive", label: "new", startedAt: new Date().toISOString() });
    log.finish(id, "done", 0.1, new Date().toISOString());
    expect(log.list().some((r) => r.label === "new" && r.status === "done")).toBe(true);
  });
  test("a spending count, read-only", async () => {
    const { Ledger } = await import("../src/ledger.ts");
    const path = readOnlyLog("ledger.db", (p) => { const l = new Ledger(p); l.add("/p", 1); (l as any).db.close(); });
    const said: string[] = [];
    let l!: InstanceType<typeof Ledger>;
    expect(() => { l = new Ledger(path, undefined, (m) => said.push(m)); }).not.toThrow();
    l.add("/p", 0.5);
    expect(l.spentToday("/p")).toBeGreaterThan(0);
  });
});

describe("a task cut short keeps its Undo point", () => {
  test("the Before snapshot is on the row from the start, so a crash leaves it on the interrupted row", () => {
    const path = join(tmp("log"), "tasks.db");
    const a = new TaskLog(path);
    a.start({ project: "/p", agent: "a", mode: "drive", label: "Add a page", startedAt: new Date().toISOString(), checkpoint: "cp_0007" });
    (a as any).db.close();   // the engine is killed before the task finishes
    const b = new TaskLog(path);
    const row = b.list("/p")[0];
    expect(row.status).toBe("interrupted");
    expect(row.checkpoint).toBe("cp_0007");
  });
  test("finishing without a receipt (an error) keeps it, and a receipt still sets it", () => {
    const log = new TaskLog(":memory:");
    const id = log.start({ project: "/p", agent: "a", mode: "drive", label: "x", startedAt: "2026-10-20T10:00:00.000Z", checkpoint: "cp_0003" });
    log.finish(id, "error", 0.2, "2026-10-20T10:01:00.000Z");
    expect(log.list()[0].checkpoint).toBe("cp_0003");
    const id2 = log.start({ project: "/p", agent: "a", mode: "drive", label: "y", startedAt: "2026-10-20T10:02:00.000Z", checkpoint: "cp_0004" });
    log.finish(id2, "done", 0.1, "2026-10-20T10:03:00.000Z", { checkpoint: "cp_0004", changed: 1, proof: "passed" });
    expect(log.list()[0].checkpoint).toBe("cp_0004");
  });
  test("a task that starts through the engine writes it right after the Before snapshot", async () => {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "1");
    const log = new TaskLog(":memory:");
    let seen: string | null = null;
    const start = log.start.bind(log);
    log.start = (r) => { seen = r.checkpoint ?? null; return start(r); };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ text: "ok", costUsd: 0 }]]), log, emit: () => {}, proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 1 } as never);
    expect(seen).toMatch(/^cp_/);
  });
});

describe("a damaged memory settings file fails closed", () => {
  const setupMem = async () => {
    const { MemoryStore } = await import("../src/memory/store.ts");
    const project = tmp("mp"), data = tmp("md");
    return { MemoryStore, project, data, m: new MemoryStore({ project, profileDir: data }), file: join(data, "memory-settings.json") };
  };
  test("truncated JSON pauses learning, keeps the file as damaged, reports it, and forgotten lines stay forgotten", async () => {
    const { m, file, data, project, MemoryStore } = await setupMem();
    const first = m.add("project", "Uses blue buttons", "you said so");
    expect(first.ok).toBe(true);
    if (first.ok) m.forget("project", first.entry.id);
    writeFileSync(file, '{"paused":false,"forgotten":{"project:');   // cut short
    const after = new MemoryStore({ project, profileDir: data });
    expect(after.isPaused()).toBe(true);
    expect(after.add("project", "Uses blue buttons", "again").ok).toBe(false);
    expect(after.list("project").problems.join(" ")).toMatch(/damaged/);
    expect(readFileSync(join(data, "memory-settings.damaged.json"), "utf8")).toContain('"forgotten"');
    // The damaged file is not overwritten by reading it, and turning learning back on is the person's reset.
    expect(readFileSync(file, "utf8")).toBe('{"paused":false,"forgotten":{"project:');
    after.setPaused(false);
    expect(after.isPaused()).toBe(false);
    expect(after.list("project").problems.join(" ")).not.toMatch(/damaged/);
  });
  test("a file that is missing means the usual choices, not a problem", async () => {
    const { m } = await setupMem();
    expect(m.isPaused()).toBe(false);
    expect(m.list("profile").problems).toEqual([]);
  });
  test("a file that is not an object is damaged too", async () => {
    const { m, file } = await setupMem();
    writeFileSync(file, "[1,2]");
    expect(m.isPaused()).toBe(true);
  });
});

describe("Companion's writes in the person's project are careful", () => {
  test("a link CLAUDE.md -> AGENTS.md is never replaced, and the file's permissions stay", async () => {
    const { syncAgentsFiles } = await import("../src/memory/agentsmd.ts");
    const { MemoryStore } = await import("../src/memory/store.ts");
    const project = tmp("ap"), data = tmp("ad");
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n");
    symlinkSync("AGENTS.md", join(project, "CLAUDE.md"));
    const m = new MemoryStore({ project, profileDir: data });
    m.add("project", "Uses React", "package.json");
    const r = syncAgentsFiles(project, m, { approved: true });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/link/);
    expect(lstatSync(join(project, "CLAUDE.md")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toBe("# Mine\n");
  });
  test("an AGENTS.md that is a link is left alone too", async () => {
    const { syncAgentsFiles } = await import("../src/memory/agentsmd.ts");
    const { MemoryStore } = await import("../src/memory/store.ts");
    const project = tmp("ap2"), data = tmp("ad2");
    writeFileSync(join(project, "elsewhere.md"), "# Other\n");
    symlinkSync("elsewhere.md", join(project, "AGENTS.md"));
    const m = new MemoryStore({ project, profileDir: data });
    m.add("project", "Uses React", "package.json");
    expect(syncAgentsFiles(project, m, { approved: true }).status).toBe("failed");
    expect(readFileSync(join(project, "elsewhere.md"), "utf8")).toBe("# Other\n");
  });
  test("an edit keeps the file's permissions", async () => {
    const { syncAgentsFiles } = await import("../src/memory/agentsmd.ts");
    const { MemoryStore } = await import("../src/memory/store.ts");
    const project = tmp("ap3"), data = tmp("ad3");
    writeFileSync(join(project, "AGENTS.md"), "# Mine\n"); chmodSync(join(project, "AGENTS.md"), 0o600);
    const m = new MemoryStore({ project, profileDir: data });
    m.add("project", "Uses React", "package.json");
    expect(syncAgentsFiles(project, m, { approved: true }).status).toBe("written");
    expect(lstatSync(join(project, "AGENTS.md")).mode & 0o777).toBe(0o600);
  });
  test("a stale temporary file is swept when the same file is written again, and a failed write leaves none", async () => {
    const { writeAtomic } = await import("../src/atomic.ts");
    const dir = tmp("at"), f = join(dir, "project.md");
    writeFileSync(`${f}.ab12cd34.tmp`, "stale");
    writeFileSync(join(dir, "notes.txt"), "keep");
    writeAtomic(f, "one\n");
    expect(readdirSync(dir).sort()).toEqual(["notes.txt", "project.md"]);
    chmodSync(dir, 0o555);   // the folder can no longer be written to
    expect(() => writeAtomic(f, "two\n")).toThrow();
    chmodSync(dir, 0o755);
    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect(readFileSync(f, "utf8")).toBe("one\n");
  });
  test("a ships record that cannot be understood is kept, not overwritten", async () => {
    const { addShipReceipt, readShips } = await import("../src/ship/deploy.ts");
    const project = tmp("sp");
    mkdirSync(join(project, ".companion"));
    writeFileSync(join(project, ".companion", "ships.json"), '[{"at":"2026-10-01","action":"live"');   // cut short
    addShipReceipt(project, { at: "2026-10-20T10:00:00Z", action: "preview", snapshot: "cp_1", gates: [], proof: "passed" });
    expect(readFileSync(join(project, ".companion", "ships.damaged.json"), "utf8")).toBe('[{"at":"2026-10-01","action":"live"');
    expect(readShips(project).length).toBe(1);
    // A readable record is appended to, and nothing is kept aside.
    addShipReceipt(project, { at: "2026-10-20T11:00:00Z", action: "live", snapshot: "cp_1", gates: [], proof: "passed" });
    expect(readShips(project).map((x) => x.action)).toEqual(["preview", "live"]);
    expect(readdirSync(join(project, ".companion")).filter((n) => n.startsWith("ships.damaged"))).toEqual(["ships.damaged.json"]);
  });
});

describe("a killed snapshot does not block the next one", () => {
  test("a stale lock on the next checkpoint's name and stray temporary files are cleared", async () => {
    const { CheckpointStore } = await import("../src/checkpoints.ts");
    const project = tmp("cp"), shadow = tmp("sh");
    writeFileSync(join(project, "a.txt"), "1");
    const store = new CheckpointStore(shadow, project);
    const first = await store.snapshot("one");
    expect(first.id).toBe("cp_0001");
    writeFileSync(join(shadow, "refs", "cp", "2.lock"), "");
    writeFileSync(join(shadow, "index-tmp-1234-abcdef01"), "x");
    writeFileSync(join(shadow, "pathspec-1234-abcdef01"), "x");
    writeFileSync(join(project, "a.txt"), "2");
    const second = await store.snapshot("two");
    expect(second.id).toBe("cp_0002");
    expect(existsSync(join(shadow, "refs", "cp", "2.lock"))).toBe(false);
    expect(existsSync(join(shadow, "index-tmp-1234-abcdef01"))).toBe(false);
    expect(existsSync(join(shadow, "pathspec-1234-abcdef01"))).toBe(false);
  });
});

describe("planning accepts the plan handed back through ExitPlanMode", () => {
  test("a plan given only in ExitPlanMode's input becomes the plan, and nothing is changed", async () => {
    const project = tmp("pl"); writeFileSync(join(project, "notes.txt"), "start");
    const events: Event[] = [];
    const engine = new ScriptedEngine([[{ tool: { name: "ExitPlanMode", input: { plan: JSON.stringify(["Make the page", "Add a form"]) } }, costUsd: 0.01 }]]);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
    await Bun.sleep(50);
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "build a page", model: "m", budgetUsd: 5 } as never);
    const ready = of(events, "plan.ready")[0];
    expect(ready.steps.map((s: any) => s.title)).toEqual(["Make the page", "Add a form"]);
    const exit = of(events, "agent.tool").find((t) => t.tool === "ExitPlanMode");
    expect(exit.outcome).toBe("ran");
    expect(exit.undoable).toBe(false);
    expect(readFileSync(join(project, "notes.txt"), "utf8")).toBe("start");
  });
  test("a write is still refused in planning", async () => {
    const project = tmp("pl2");
    const events: Event[] = [];
    const engine = new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "x.txt", content: "no" } }, costUsd: 0.01 }, { text: '["Only step"]', costUsd: 0 }]]);
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e) });
    await runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "d1", goal: "build a page", model: "m", budgetUsd: 5 } as never);
    expect(existsSync(join(project, "x.txt"))).toBe(false);
  });
});

describe("a practice fix cannot pass by changing the check's command", () => {
  test("package.json is protected with the test file, in every practice whose check is its test script", () => {
    const cat = JSON.parse(readFileSync(new URL("../../app/sample/practices.json", import.meta.url), "utf8"));
    for (const id of ["signup", "route", "import"]) {
      const e = cat.practices.find((x: any) => x.id === id);
      expect(e.protect, id).toContain("package.json");
      expect(e.protect[0], id).toMatch(/^test\//);   // the first entry is still the test file the cheat tests aim at
    }
  });
});
