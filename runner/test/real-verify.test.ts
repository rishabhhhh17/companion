// real-verify (runner/scripts/real-verify.ts) spends the founder's key, so it is only run with --spend by the founder.
// Here, for free: its plan, that every command it sends is one today's runner accepts (protocol drift wastes money), its dry
// run, and its runner kit against a real runner process that is never asked to start Claude.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand } from "../../protocol/index.ts";
import { SCENARIOS, checkedCommand, listTree, planProblems, realKit, safetyAudit, verifyCases, type Kit, type Live } from "../scripts/real-verify.ts";
import { SpendMeter, SpendStop, type CaseCtx, type Proc } from "../scripts/realrun-harness.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-rv-${l}-`))); made.push(d); return d; };
const put = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };
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
  // Each runner scenario is played against a stand in that answers every wait with a small, plausible event of the kind
  // waited for, so every command the scenario sends is reached and checked against the protocol, not only the first one.
  // The commands each scenario must send are listed here: a scenario that gives up early, or a new one, shows up as a
  // failure instead of passing unchecked. No task asks for more than the scenario's own stop.
  const SENDS: Record<string, string[]> = {
    "house-rule-and-undo": ["agent.start", "checkpoint.restore"],
    drive: ["drive.plan", "drive.approve", "checkpoint.restore"],
    "visual-receipt": ["agent.start"],
    practice: ["problem.find", "agent.start", "problem.find"],
    "practice-route": ["problem.find", "agent.start", "problem.find"],
    "practice-import": ["problem.find", "agent.start", "problem.find"],
    "practice-open-table": ["ship.check", "agent.start", "ship.check"],
    diagram: ["diagram.ask"],
    "take-the-wheel": ["drive.plan", "drive.approve", "drive.resume"],
    rescue: ["rescue.diagnose", "drive.approve"],
    memory: ["agent.start", "agent.start", "tasks.list", "memory.list", "memory.forget"],
    explain: ["agent.start", "recap.ask"],
    research: ["research.ask"],
    "new-folder": ["drive.plan", "drive.approve", "checkpoint.restore"],
    "new-folder-detailed": ["drive.plan", "drive.approve", "checkpoint.restore"],
    "new-folder-research": ["research.ask"],
    "daily-limit": ["drive.plan", "agent.start"],
    "error-explainer": ["error.explain"],
    "approve-after-wait": ["agent.start"],
    "approve-git-save": ["agent.start"],
    "approve-env-line": ["agent.start"],
    "env-secret-refused": ["agent.start"],
    "stop-everything": ["agent.start", "agent.interruptAll"],
    "loop-breaker": ["agent.start"],
    "ship-gates": ["ship.check", "ship.check", "ship.check", "ship.check", "ship.check", "ship.check"],
  };
  // One of each event a scenario waits for, in the smallest shape that lets it go on. Order matters only where a wait
  // takes either of two kinds: the wanted kind comes before protocol.error.
  const PLAUSIBLE: Record<string, any>[] = [
    { type: "receipt", agent: "b1", checkpoint: "cp1", changed: [{ file: "index.html", kind: "modified" }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0.01, changedAt: { file: "index.html", line: 1 } },
    { type: "plan.ready", agent: "d1", steps: [{ title: "Add the paragraph" }, { title: "Add the footer" }], estimateUsd: 0.1 },
    { type: "drive.step", agent: "d1", index: 0, status: "started" },
    { type: "drive.paused", agent: "d1", reason: "files_changed", path: "mine.txt" },
    { type: "drive.done", agent: "d1", status: "done", completed: 1, total: 1, usdEstimate: 0.1 },
    { type: "checkpoint.created", checkpoint: "cp1", label: "Before: a task" },
    { type: "checkpoint.restored", checkpoint: "cp1" },
    { type: "proof.result", verdict: "passed" },
    { type: "receipt.visual", made: true, caption: "works now", circles: 1, file: "/nonexistent/picture.png" },
    { type: "problem.found", verdict: "failed", label: "Tests", problem: { file: "test/signup.test.js", line: 1, message: "404" } },
    { type: "diagram.ready", made: true, diagram: { nodes: [{ label: "Signup" }, { label: "/api/register" }], broken: { reason: "the route names do not match" }, caption: "c" } },
    { type: "rescue.report", summary: "s", broken: "showGallery is not defined", steps: [{ title: "Rename the function" }], evidence: [] },
    { type: "memory.state", projectLines: [{ id: "l1", text: "Built with React" }] },
    { type: "explain.ready", bullets: ["The page now says the shop opens at nine."], usdEstimate: 0.001 },
    { type: "recap.ready", lines: ["one", "two", "three"] },
    { type: "tasks.list", tasks: [] },
    { type: "research.done", title: "dialog", notes: [{ source: "https://example.com" }], file: "notes.md" },
    { type: "error.explained", ok: true, sentences: ["A word was given where a number belongs."], where: { file: "src/App.tsx", line: 5 } },
    { type: "agent.tool", agent: "b1", outcome: "ran", tool: "Write", summary: "Write: f1.txt" },
    { type: "agent.state", agent: "b1", state: "idle" },
    { type: "ship.gates", canShip: false, gates: [{ id: "secrets", status: "blocked", detail: "anyone who opens your site" }, { id: "database_access", status: "blocked", detail: "x" }, { id: "checked", status: "ok", detail: "x" }] },
    { type: "protocol.error", reason: "the daily limit was reached" },
  ];
  test("every scenario that drives a runner is listed with the commands it must send", () => {
    expect(Object.keys(SENDS).sort()).toEqual(SCENARIOS.filter((x) => !x.inProcess).map((x) => x.name).sort());
  });
  for (const s of SCENARIOS.filter((x) => !x.inProcess)) test(s.name, async () => {
    const sent: Record<string, any>[] = [];
    const kit: Kit = {
      runner: (project: string): Live => ({ project, data: tmp("data"), events: [], send: (c) => { checkedCommand(c); sent.push(c); }, of: (t) => PLAUSIBLE.filter((e) => e.type === t), until: async (pred) => PLAUSIBLE.find(pred) ?? null, ready: async () => true, usd: () => 0, stop: () => {} }),
      scratch: (l) => tmp(l), agentModel: "claude-sonnet-5-5", diagnoseModel: "claude-opus-5-5", reviewModel: "claude-opus-5-5", cheap: false, ctx: {} as CaseCtx,
    };
    await s.run(kit, () => {});
    expect(sent.map((c) => c.type)).toEqual(SENDS[s.name]);
    for (const c of sent) {
      expect(parseCommand(JSON.stringify(c)).ok).toBe(true);
      if (typeof c.budgetUsd === "number") expect(c.budgetUsd).toBeLessThanOrEqual(s.capUsd);
      if (typeof c.model === "string") expect(["claude-sonnet-5-5", "claude-opus-5-5"]).toContain(c.model);
    }
  }, 15_000);
});

// The checks the two make-something-in-a-new-folder cases score with (no model, no money).
describe("new-folder: how the cases are scored", () => {
  test("a plan for an empty folder: small, plain, about the request; a bug fix, jargon or an editor chore is flagged", () => {
    expect(planProblems(["Make the home page with the bakery name", "Add the opening hours", "Add a contact section with the address and phone"])).toEqual([]);
    expect(planProblems(["Fix the broken button", "Add the opening hours and contact"]).join(" ")).toMatch(/fixing something that is not there/);
    expect(planProblems(["Set up a React framework", "Add hours and contact"]).join(" ")).toMatch(/plain words/);
    expect(planProblems(["Open the page in your browser", "Add hours and contact"]).join(" ")).toMatch(/editor or browser chore/);
    expect(planProblems([]).join(" ")).toMatch(/0 steps/);
    expect(planProblems(["Make the page"]).join(" ")).toMatch(/never mentions "hours"/);
    expect(planProblems(["x ".repeat(70) + "hours contact"]).join(" ")).toMatch(/not short/);
  });
  test("the safety audit catches git, a network write, a settings file and the key, and passes a clean run", () => {
    const dir = tmp("audit");
    const tool = (summary: string, tool = "Bash", outcome = "ran") => ({ type: "agent.tool", tool, outcome, summary });
    expect(safetyAudit([tool("Running: ls"), tool("Write: index.html", "Write")], dir, "sk-ant-api03-secretsecret").ok).toBe(true);
    expect(safetyAudit([tool("Running: git add -A")], dir).why.join()).toMatch(/git command/);
    expect(safetyAudit([tool("Running: git push", "Bash", "blocked")], dir).ok).toBe(true);   // refused, so it did not run
    expect(safetyAudit([tool("Running: curl -X POST https://x.test -d a=b")], dir).why.join()).toMatch(/sends data out/);
    expect(safetyAudit([tool("Running: curl https://example.com")], dir).ok).toBe(true);   // a plain read is not a write
    expect(safetyAudit([{ type: "x", text: "sk-ant-api03-secretsecret" }], dir, "sk-ant-api03-secretsecret").why.join()).toMatch(/appears in an event/);
    put(dir, { ".env": "A=1", "page.html": "sk-ant-api03-abcdefgh12345" });
    expect(safetyAudit([], dir).why.join()).toMatch(/\.env/);
    expect(safetyAudit([], dir).why.join()).toMatch(/a key is in page\.html/);
    mkdirSync(join(dir, ".git"));
    expect(safetyAudit([], dir).why.join()).toMatch(/\.git/);
  });
  test("listTree lists files and folders, links are not followed", () => {
    const dir = tmp("tree");
    put(dir, { "a/b.txt": "x", "c.txt": "y" });
    symlinkSync(tmp("elsewhere"), join(dir, "link"));
    expect(listTree(dir)).toEqual(["a", "a/b.txt", "c.txt", "link"]);
    expect(listTree(join(dir, "nope"))).toEqual([]);
  });
  test("the cases start in a brand new empty folder laid out as the shell leaves it, and use the request's own words", async () => {
    const sent: Record<string, any>[] = []; const projects: string[] = [];
    const kit: Kit = {
      runner: (project: string): Live => { projects.push(project); return { project, data: tmp("data"), events: [], send: (c) => { checkedCommand(c); sent.push(c); }, of: () => [], until: async () => null, ready: async () => true, usd: () => 0, stop: () => {} }; },
      scratch: (l) => tmp(l), agentModel: "claude-sonnet-5-5", diagnoseModel: "claude-opus-5-5", reviewModel: "claude-opus-5-5", cheap: false, ctx: {} as CaseCtx,
    };
    for (const name of ["new-folder", "new-folder-detailed", "new-folder-research"]) {
      await SCENARIOS.find((x) => x.name === name)!.run(kit, () => {});
    }
    expect(sent.map((c) => c.type)).toEqual(["drive.plan", "drive.plan", "research.ask"]);
    expect(sent[0].goal).toBe("a one page website for my bakery with opening hours and a contact section");
    expect(sent[1].goal).toContain("Rosa");
    expect(sent[2].question).toBe("what should I know before opening a small bakery");
    for (const p of projects) { expect(listTree(p)).toEqual([]); expect(p).toContain("/Companion makes/"); expect(p.startsWith(process.env.HOME ?? "\0")).toBe(false); }
  }, 15_000);
});

// A stand in for the runner process: it says hello, takes the key, and records every line it is sent. It never starts Claude.
function fakeRunner() {
  const sent: Record<string, any>[] = []; const queue: (string | null)[] = []; let wake: (() => void) | null = null;
  const push = (l: string | null) => { queue.push(l); wake?.(); };
  const emit = (e: Record<string, unknown>) => push(JSON.stringify({ v: 1, id: `e${queue.length}`, ...e }));
  emit({ type: "runner.hello", runnerVersion: "0", sdk: "x" });
  const proc: Proc = {
    write: (line) => { const c = JSON.parse(line); sent.push(c); if (c.type === "auth.key") emit({ type: "auth.status", method: "api_key", source: "keychain" }); },
    lines: (async function* () { for (;;) { while (queue.length) { const l = queue.shift()!; if (l === null) return; yield l; } await new Promise<void>((r) => { wake = r; }); wake = null; } })(),
    kill: () => push(null), exited: Promise.resolve(0),
  };
  return { proc, sent, emit };
}
function kitCtx(cap: number) {
  const cleanups: (() => unknown)[] = []; const notes: string[] = [];
  const meter = new SpendMeter(1.5, 12); meter.startCase("kit", cap);
  const ctx = { name: "kit", key: "sk-ant-api03-kit-test-not-a-real-key", meter, signal: new AbortController().signal, refusals: [], note: (s: string) => notes.push(s), onCleanup: (f: () => unknown) => cleanups.push(f), scratch: (l: string) => tmp(l) } as unknown as CaseCtx;
  return { ctx, meter, notes, cleanup: async () => { for (const f of cleanups.reverse()) await f(); } };
}
const start = (budgetUsd: number, agent = "b1") => ({ v: 1, id: "s", type: "agent.start", project: "/p", agent, mode: "drive", prompt: "x", model: "claude-sonnet-5-5", budgetUsd });

describe("the runner kit keeps every task inside the stops", () => {
  test("a task's budget is cut to the room left under the stops before it is sent", async () => {
    const k = kitCtx(0.3); const f = fakeRunner();
    k.meter.settle("earlier", 0.1);
    const r = realKit(k.ctx, { cheap: false, loopChoice: "stop", spawn: () => f.proc }).runner("/p");
    expect(await r.ready()).toBe(true);
    r.send(start(0.6));
    expect(f.sent.find((c) => c.type === "agent.start")!.budgetUsd).toBeCloseTo(0.2, 6);
    expect(k.notes.join(" ")).toMatch(/budget was cut/);
    f.emit({ type: "agent.state", agent: "b1", state: "done" });
    await r.until((e) => e.type === "agent.state", 2000);
    await k.cleanup();
  }, 10_000);
  test("with no room left a task is not sent at all", async () => {
    const k = kitCtx(0.3); const f = fakeRunner();
    k.meter.settle("earlier", 0.3);
    const r = realKit(k.ctx, { cheap: false, loopChoice: "stop", spawn: () => f.proc }).runner("/p");
    await r.ready();
    expect(() => r.send(start(0.2))).toThrow(SpendStop);
    expect(f.sent.some((c) => c.type === "agent.start")).toBe(false);
    await k.cleanup();
  }, 10_000);
  test("a task still running when its runner is ended counts its whole budget, since its last round is never booked", async () => {
    const k = kitCtx(0.5); const f = fakeRunner();
    const r = realKit(k.ctx, { cheap: false, loopChoice: "stop", spawn: () => f.proc }).runner("/p");
    await r.ready();
    r.send(start(0.25));
    f.emit({ type: "agent.state", agent: "b1", state: "working" });
    await r.until((e) => e.type === "agent.state", 2000);
    await k.cleanup();
    expect(k.meter.caseSpent).toBeCloseTo(0.25, 6);
    expect(k.notes.join(" ")).toMatch(/whole budget/);
  }, 10_000);
  test("a task stopped by Stop everything counts its whole budget too, though it then goes idle", async () => {
    const k = kitCtx(0.5); const f = fakeRunner();
    const r = realKit(k.ctx, { cheap: false, loopChoice: "stop", spawn: () => f.proc }).runner("/p");
    await r.ready();
    r.send(start(0.25));
    f.emit({ type: "agent.state", agent: "b1", state: "thinking" });
    await r.until((e) => e.type === "agent.state", 2000);
    r.send({ v: 1, id: "k", type: "agent.interruptAll", reason: "stop everything key" });
    f.emit({ type: "agent.state", agent: "b1", state: "idle" });
    await r.until((e) => e.type === "agent.state" && e.state === "idle", 2000);
    await k.cleanup();
    expect(k.meter.caseSpent).toBeCloseTo(0.25, 6);
  }, 10_000);
  test("the notes count the approval cards a person would have answered, per task", async () => {
    const k = kitCtx(0.5); const f = fakeRunner();
    const r = realKit(k.ctx, { cheap: false, loopChoice: "stop", spawn: () => f.proc }).runner("/p");
    await r.ready();
    r.send(start(0.25));
    f.emit({ type: "checkpoint.created", project: "/p", agent: "b1", checkpoint: "cp_1", label: "Before: x", files: 1, skipped: [] });
    f.emit({ type: "approval.request", approval: "ap_1", agent: "b1", checkpoint: "cp_1", toolUseId: "t", risk: "git", title: "git init changes your repository", expiresAt: "2999-01-01T00:00:00Z" });
    f.emit({ type: "approval.request", approval: "ap_2", agent: "b1", checkpoint: "cp_1", toolUseId: "t2", risk: "network", title: "curl reaches outside your project", expiresAt: "2999-01-01T00:00:00Z" });
    f.emit({ type: "checkpoint.created", project: "/p", agent: "b1", checkpoint: "cp_2", label: "Before: y", files: 1, skipped: [] });
    f.emit({ type: "agent.state", agent: "b1", state: "done" });
    await r.until((e) => e.type === "agent.state" && e.state === "done", 2000);
    await k.cleanup();
    expect(k.notes.join(" | ")).toMatch(/approval cards: 2 in 2 tasks \(1 a task\)/);
  }, 10_000);
  test("a task that finished is counted only by what the runner booked", async () => {
    const k = kitCtx(0.5); const f = fakeRunner();
    const r = realKit(k.ctx, { cheap: false, loopChoice: "stop", spawn: () => f.proc }).runner("/p");
    await r.ready();
    r.send(start(0.25));
    f.emit({ type: "agent.state", agent: "b1", state: "working" });
    f.emit({ type: "agent.state", agent: "b1", state: "done" });
    await r.until((e) => e.type === "agent.state" && e.state === "done", 2000);
    await k.cleanup();
    expect(k.meter.caseSpent).toBe(0);
  }, 10_000);
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

// Review fix (20 Oct 2026): the open table practice counted as fixed whenever the check was not blocked, so a fix with a
// rule that says "true" (the table still open) would have been measured as a pass. It now uses the page's own rule.
describe("the open table practice is measured as fixed only when the check shows no open table", () => {
  const openTable = SCENARIOS.find((s) => s.name === "practice-open-table")!;
  const found = { id: "database_access", label: "Database access is protected", status: "blocked", findings: ["notes"], detail: "This table is open to anyone with your site address: notes.", places: [{ table: "notes", file: "supabase/migrations/20261001090000_create_notes.sql", line: 2, lineText: "create table public.notes (" }] };
  const play = async (after: Record<string, unknown>) => {
    const answers = [found, after];
    const receipt = { type: "receipt", agent: "builder-1", checkpoint: "cp1", changed: [{ file: "supabase/migrations/20261003090000_protect_notes.sql", kind: "added" }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0.1, practice: "open-table" };
    const kit: Kit = {
      runner: (project: string): Live => ({ project, data: tmp("data"), events: [], send: (c) => { checkedCommand(c); }, of: () => [],
        until: async (pred) => { const gates = { type: "ship.gates", canShip: false, gates: [answers[0]] }; if (pred(gates)) { answers.shift(); return gates; } return pred(receipt) ? receipt : null; },
        ready: async () => true, usd: () => 0, stop: () => {} }),
      scratch: (l) => tmp(l), agentModel: "claude-sonnet-5-5", diagnoseModel: "claude-opus-5-5", reviewModel: "claude-opus-5-5", cheap: false, ctx: {} as CaseCtx,
    };
    return openTable.run(kit, () => {});
  };
  test("a rule that says true leaves the table open: not fixed; protected in the files: fixed", async () => {
    expect(await play({ id: "database_access", status: "could_not_check", findings: ["notes"], detail: "notes can be read or changed by anyone, signed in or not, because of a rule that says \"true\"." })).toBe(false);
    expect(await play({ id: "database_access", status: "not_applicable", detail: "This project does not use Supabase." })).toBe(false);
    expect(await play({ id: "database_access", status: "could_not_check", detail: "The tables in your migration files are protected, but I could not check your live database." })).toBe(true);
  }, 15_000);
});
