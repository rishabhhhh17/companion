// Make something with no project open (F23, M14 Part 1): "make me a website for my bakery", "research who competes with X".
// The page asks the shell (project.new); the shell makes a new empty folder in the home folder, chooses it as the project,
// and sends an ordinary drive.plan or research.ask for it. These tests hold the two promises the engine's side makes:
// it can never read project.new (it never makes a folder outside a project), and a task in a brand new empty folder runs
// exactly like any other: the same safety hooks, approvals, undo points, proof, receipts and budgets.
// The shell runs the same cases (app/src-tauri/src/newfolder.rs), so both sides agree on the command and on the task it becomes.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_REQUEST_CHARS, parseCommand, parseShellCommand, serialize, type Command, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";

type Case = { name: string; ok: boolean; cmd: Record<string, unknown>; task?: Record<string, unknown> };
const cases: Case[] = readFileSync(new URL("../../protocol/fixtures/project-new-cases.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the command a page sends to make something in a new folder", () => {
  test("the shared cases: each one is taken or refused exactly as the shell does", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(cases.some((c) => c.ok) && cases.some((c) => !c.ok)).toBe(true);
    for (const c of cases) expect(parseShellCommand(JSON.stringify(c.cmd)).ok, c.name).toBe(c.ok);
  });
  test("the engine can never read it, so it can never be asked to make a folder", () => {
    for (const c of cases.filter((x) => x.cmd.type === "project.new")) {
      const r = parseCommand(JSON.stringify(c.cmd));
      expect(r.ok, c.name).toBe(false);
      if (!r.ok && c.cmd.v === 1 && c.cmd.id) expect(r.error, c.name).toContain("unknown type");
    }
  });
  test("no command the engine takes is one the shell takes for a new folder", () => {
    for (const l of readFileSync(new URL("../../protocol/fixtures/commands.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean)) expect(parseShellCommand(l).ok, l).toBe(false);
  });
  test("the task each one becomes is an ordinary engine command, with the request's own words", () => {
    for (const c of cases.filter((x) => x.ok)) {
      const t = c.task!;
      const parsed = parseCommand(JSON.stringify({ ...t, project: "/Users/sam/Companion makes/Website for my bakery" }));
      expect(parsed.ok, c.name).toBe(true);
      expect(t.type, c.name).toBe(c.cmd.kind === "build" ? "drive.plan" : "research.ask");
      expect(t[c.cmd.kind === "build" ? "goal" : "question"], c.name).toBe(String(c.cmd.request).trim());
      for (const k of ["agent", "model", "budgetUsd"]) expect(t[k], `${c.name}: ${k}`).toEqual(c.cmd[k]);
      expect(t.offTheRecord, c.name).toBe(c.cmd.offTheRecord === true ? true : undefined);
      // Nothing more than the engine command has: no new trust shortcut rides along.
      expect(Object.keys(t).sort(), c.name).toEqual(["agent", "budgetUsd", c.cmd.kind === "build" ? "goal" : "question", "id", "model", ...(c.cmd.offTheRecord === true ? ["offTheRecord"] : []), "project", "type", "v"].sort());
    }
  });
  test("the longest request is the ask box's longest draft, counted in characters a person sees", () => {
    expect(MAX_REQUEST_CHARS).toBe(4000);
    const at = (request: string) => parseShellCommand(JSON.stringify({ v: 1, id: "x", type: "project.new", kind: "build", request, agent: "a", model: "m", budgetUsd: 1 })).ok;
    expect(at("a".repeat(4000))).toBe(true);
    expect(at("a".repeat(4001))).toBe(false);
    expect(at("\u{1F370}".repeat(4000))).toBe(true);
  });
  test("it round trips like any message", () => {
    const c = cases.find((x) => x.ok)!;
    const r = parseShellCommand(JSON.stringify(c.cmd));
    if (!r.ok) throw new Error("the first case should be taken");
    expect(parseShellCommand(serialize(r.msg as never))).toEqual(r);
  });
});

// ---------- a task in the new folder runs like any other ----------

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-new-${l}-`))); made.push(d); return d; };
const say = (text: string, costUsd = 0.01): Step => ({ text, costUsd });
const write = (file_path: string, content: string, costUsd = 0.01): Step => ({ tool: { name: "Write", input: { file_path, content } }, costUsd });
const bash = (command: string, costUsd = 0.01): Step => ({ tool: { name: "Bash", input: { command } }, costUsd });
const planOf = (...steps: string[]) => say("Here is the plan:\n```json\n" + JSON.stringify(steps) + "\n```");
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const passed = (): LadderResult => ({ verdict: "passed", steps: [] });
const waitFor = async (cond: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out waiting"); await Bun.sleep(10); } };

/** What the shell leaves behind: a home folder, one folder for everything made for a request, and inside it a brand new
 *  empty folder named after the request. The task is the case's own task line, with that folder as the project. */
function newFolder(caseName: string, rounds: Step[][], o: { proofs?: LadderResult[]; budgetUsd?: number } = {}) {
  const home = tmp("home");
  const parent = join(home, "Companion makes");
  mkdirSync(parent);
  const project = join(parent, "Website for my bakery");
  mkdirSync(project);
  const c = cases.find((x) => x.name === caseName)!;
  const task = { ...c.task!, project, ...(o.budgetUsd !== undefined ? { budgetUsd: o.budgetUsd } : {}) } as unknown as Command;
  expect(parseCommand(JSON.stringify(task)).ok).toBe(true);
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  let n = 0;
  const proofs = o.proofs ?? [passed()];
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)], approvalTimeoutMs: 200 });
  return { home, parent, project, task, events, engine, runner };
}

describe("something to build, in a brand new empty folder", () => {
  test("it plans first, changes nothing until the plan is approved, then each step has an undo point, a check and a receipt", async () => {
    const r = newFolder("something to build starts a plan", [[planOf("Make the home page", "Add the menu")], [write("index.html", "<h1>Bakery</h1>")], [write("menu.html", "<ul></ul>")]]);
    await r.runner.handle(r.task);
    expect(of(r.events, "plan.ready")[0].steps.map((s: any) => s.title)).toEqual(["Make the home page", "Add the menu"]);
    expect(readdirSync(r.project)).toEqual([]);   // planning reads only
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "builder-1", steps: ["Make the home page", "Add the menu"] });
    expect(of(r.events, "checkpoint.created").length).toBe(2);
    expect(of(r.events, "checkpoint.created").every((c) => c.project === r.project)).toBe(true);
    expect(of(r.events, "receipt").map((x) => x.proof)).toEqual(["passed", "passed"]);
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2, total: 2 });
    expect(readFileSync(join(r.project, "index.html"), "utf8")).toBe("<h1>Bakery</h1>");
  });
  test("Undo of the first step takes the folder back to empty, as it was made", async () => {
    const r = newFolder("something to build starts a plan", [[planOf("Make the home page")], [write("index.html", "<h1>Bakery</h1>")]]);
    await r.runner.handle(r.task);
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "builder-1", steps: ["Make the home page"] });
    const cp = of(r.events, "checkpoint.created")[0].checkpoint;
    await r.runner.handle({ v: 1, id: "u", type: "checkpoint.restore", project: r.project, checkpoint: cp });
    expect(of(r.events, "checkpoint.restored").length).toBe(1);
    expect(readdirSync(r.project).filter((f) => f !== ".companion")).toEqual([]);
  });
  test("the same safety hooks: a write next to it, in the folder above or in the home folder never happens", async () => {
    const r0 = newFolder("something to build starts a plan", []);
    const targets = [join(r0.parent, "Someone else's project", "index.html"), join(r0.parent, "notes.txt"), join(r0.home, "evil.txt")];
    const r = newFolder("something to build starts a plan", [[planOf("Make the page")], targets.map((t) => write(t, "evil"))]);
    for (const t of targets) rmSync(t, { force: true });
    await r.runner.handle(r.task);
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "builder-1", steps: ["Make the page"] });
    const tools = of(r.events, "agent.tool");
    expect(tools.length).toBe(targets.length);
    expect(tools.every((t) => t.outcome === "blocked")).toBe(true);
    for (const t of [join(r.parent, "Someone else's project", "index.html"), join(r.parent, "notes.txt"), join(r.home, "evil.txt")]) expect(existsSync(t), t).toBe(false);
  });
  test("the same approvals: a command that touches git or the internet waits for a tap, and no answer is a no", async () => {
    const r = newFolder("something to build starts a plan", [[planOf("Make the page")], [bash("git push origin main"), say("done")]]);
    await r.runner.handle(r.task);
    const run = r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "builder-1", steps: ["Make the page"] });
    await waitFor(() => of(r.events, "approval.request").length > 0);
    expect(of(r.events, "approval.request")[0].risk).toBe("git");
    await run;
    expect(of(r.events, "approval.resolved")[0].outcome).toBe("expired");
    expect(of(r.events, "receipt")[0].notUndoable).toEqual([]);
  });
  test("the same budget: the plan stops when the request's money is spent", async () => {
    const r = newFolder("something to build starts a plan", [[planOf("One", "Two", "Three")], [write("1.txt", "1", 0.04)], [write("2.txt", "2", 0.04)], [write("3.txt", "3", 0.04)]], { budgetUsd: 0.1 });
    await r.runner.handle(r.task);
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "builder-1", steps: ["One", "Two", "Three"] });
    const done = of(r.events, "drive.done")[0];
    expect(done.status).toBe("error_max_budget_usd");
    expect(done.completed).toBeLessThan(3);
  });
  test("the same proof: a step whose check fails is not done, and the plan stops there", async () => {
    const failed: LadderResult = { verdict: "failed", steps: [{ rung: "checks", label: "Building", status: "failed", detail: "the page did not build", ms: 1 } as never], failedAt: { rung: "checks", label: "Building", status: "failed", detail: "the page did not build", ms: 1 } as never };
    const r = newFolder("something to build starts a plan", [[planOf("One", "Two")], [write("1.txt", "1")], [write("1.txt", "1")], [write("1.txt", "1")], [write("2.txt", "2")]], { proofs: [failed] });
    await r.runner.handle(r.task);
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "builder-1", steps: ["One", "Two"] });
    expect(of(r.events, "drive.step").map((s) => `${s.index}:${s.status}`)).toContain("1:not_done");
    expect(existsSync(join(r.project, "2.txt"))).toBe(false);
  });
});

describe("something to look up, in a brand new empty folder", () => {
  const answer = say('```json\n{"title":"Who competes with Acme","answer":"Two shops nearby.","notes":[{"text":"Bake Co sells bread.","source":"https://example.com/bake"}]}\n```');
  test("its notes are filed in the new folder, and nothing else changes", async () => {
    const r = newFolder("something to look up starts research", [[answer]]);
    await r.runner.handle(r.task);
    const done = of(r.events, "research.done")[0];
    expect(done.file).toMatch(/^\.companion\/research\//);
    expect(existsSync(join(r.project, done.file))).toBe(true);
    expect(readdirSync(r.project)).toEqual([".companion"]);
    expect(readdirSync(r.parent)).toEqual(["Website for my bakery"]);
  });
  test("off the record it files nothing at all, so the new folder stays empty", async () => {
    const r = newFolder("off the record goes with the task", [[answer]]);
    await r.runner.handle(r.task);
    expect(of(r.events, "research.done").length).toBe(1);
    expect(of(r.events, "research.done")[0].file).toBeUndefined();
    expect(readdirSync(r.project)).toEqual([]);
  });
  test("it can look things up but never write, even in its own new folder", async () => {
    const r = newFolder("something to look up starts research", [[write("sneaky.txt", "x"), answer]]);
    await r.runner.handle(r.task);
    expect(existsSync(join(r.project, "sneaky.txt"))).toBe(false);
    expect(of(r.events, "agent.tool").some((t) => t.outcome === "blocked")).toBe(true);
  });
});
