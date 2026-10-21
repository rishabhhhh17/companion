// Rescue: point it at a stuck project. It checks the project as it is, then explains what is wrong in plain words
// and proposes a short finish plan. Reading only; nothing is changed until you approve the plan.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseDiagnosis, rescuePrompt } from "../src/rescue.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rs-${l}-`))); made.push(d); return d; };
const say = (text: string, costUsd = 0.01): Step => ({ text, costUsd });
const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
const diag = (o: Partial<{ summary: string; works: string[]; broken: string; steps: string[] }> = {}) =>
  say("```json\n" + JSON.stringify({ summary: "A portfolio site made with Vite.", works: ["The pages are all there"], broken: "The build fails because a package is missing. The page also needs an environment variable.", steps: ["Install the missing package", "Add the environment variable", "Run the build again"], ...o }) + "\n```");
const step = (rung: string, status: string, detail = "") => ({ rung, label: rung, status, detail, ms: 1 }) as never;
const failing: LadderResult = { verdict: "failed", steps: [step("install", "passed"), step("checks", "failed", "build failed. Cannot find module 'left-pad'")], failedAt: step("checks", "failed", "build failed. Cannot find module 'left-pad'") };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];

function setup(rounds: Step[][], ladder: LadderResult = failing) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>site</h1>");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const seen: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async (c) => { seen.push(c); c.onStep({ rung: "checks", label: "Building and checking the code", status: "running", detail: "", ms: 0 }); return ladder; } });
  const diagnose = async (budgetUsd = 5) => { await Bun.sleep(100); return runner.handle({ v: 1, id: "r1", type: "rescue.diagnose", project, agent: "r1", model: "m", budgetUsd }); };
  return { project, events, engine, runner, diagnose, seen };
}

describe("reading the diagnosis", () => {
  test("a JSON answer in a code block", () => {
    const d = parseDiagnosis('```json\n{"summary":"A site","works":["pages"],"broken":"It cannot build.","steps":["Fix it","Check it"]}\n```');
    expect(d).toEqual({ summary: "A site", works: ["pages"], broken: "It cannot build.", steps: ["Fix it", "Check it"] });
  });
  test("a JSON answer inside other words", () => expect(parseDiagnosis('Here you go: {"summary":"S","works":[],"broken":"B","steps":["x"]} hope it helps')?.summary).toBe("S"));
  test("missing parts are not guessed: no steps means no diagnosis", () => {
    expect(parseDiagnosis('{"summary":"S","works":[],"broken":"B","steps":[]}')).toBeNull();
    expect(parseDiagnosis('{"summary":"S","works":[],"steps":["x"]}')).toBeNull();
    expect(parseDiagnosis("no json here")).toBeNull();
    expect(parseDiagnosis("{broken json")).toBeNull();
  });
  test("a long plan is cut to seven steps, and odd entries are cleaned", () => {
    const d = parseDiagnosis(JSON.stringify({ summary: "S", works: ["ok", 5, ""], broken: "B", steps: Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`) }))!;
    expect(d.steps.length).toBe(7);
    expect(d.works).toEqual(["ok"]);
  });
  test("what the checks found is given to Claude as evidence, in plain words", () => {
    const p = rescuePrompt([{ label: "Building and checking the code", status: "failed", detail: "Cannot find module 'left-pad'" }]);
    expect(p).toContain("Cannot find module 'left-pad'");
    expect(p).toMatch(/two sentences/i);
    expect(p).toMatch(/1 to 7/);
    // Only what is broken: no padding, no optional extras, no step that only opens or checks (Companion checks each step itself),
    // and anything that needs the person's own files or accounts comes last and says so.
    expect(p).toMatch(/only what is (broken|wrong)/i);
    expect(p).toMatch(/never a step that only opens or checks/i);
    expect(p).toMatch(/optional/i);
    expect(p).toMatch(/last step/i);
    expect(p).toMatch(/read only|change nothing/i);
  });
});

describe("rescuing a stuck project", () => {
  test("it checks the project as it is first, then reports what it found with the evidence", async () => {
    const r = setup([[diag()]]);
    await r.diagnose();
    expect(r.seen.length).toBe(1);
    expect(r.seen[0].beforeId).toBe(r.seen[0].afterId);
    const rep = of(r.events, "rescue.report")[0];
    expect(rep.summary).toBe("A portfolio site made with Vite.");
    expect(rep.broken).toMatch(/build fails/);
    expect(rep.works).toEqual(["The pages are all there"]);
    expect(rep.steps.map((s: any) => s.title)).toEqual(["Install the missing package", "Add the environment variable", "Run the build again"]);
    expect(rep.evidence.some((e: any) => e.status === "failed" && /left-pad/.test(e.detail))).toBe(true);
  });
  test("the engine is told what the checks found", async () => {
    const r = setup([[diag()]]);
    await r.diagnose();
    expect(r.engine.calls[0].prompt).toContain("left-pad");
    expect(r.engine.calls[0].planOnly).toBe(true);
  });
  test("it shows the same editable plan card as Drive, and approving it runs the steps", async () => {
    const r = setup([[diag({ steps: ["Fix the package", "Check it"] })], [write("fixed.txt", "1")], [write("fixed2.txt", "2")]], { verdict: "passed", steps: [] });
    await r.diagnose();
    expect(of(r.events, "plan.ready")[0].steps.length).toBe(2);
    await r.runner.handle({ v: 1, id: "a", type: "drive.approve", agent: "r1", steps: ["Fix the package", "Check it"] });
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2, total: 2 });
    expect(existsSync(join(r.project, "fixed.txt"))).toBe(true);
  });
  test("looking never changes the project: a write attempt is refused", async () => {
    const r = setup([[write("sneaky.txt", "x"), diag()]]);
    await r.diagnose();
    expect(existsSync(join(r.project, "sneaky.txt"))).toBe(false);
    expect(of(r.events, "agent.tool").some((t) => t.outcome === "blocked")).toBe(true);
    expect(of(r.events, "rescue.report").length).toBe(1);
  });
  test("a healthy project is still reported, with its plan", async () => {
    const r = setup([[diag({ broken: "Nothing is broken. It is missing a contact page.", steps: ["Add a contact page"] })]], { verdict: "passed", steps: [] });
    await r.diagnose();
    expect(of(r.events, "rescue.report")[0].steps.length).toBe(1);
  });
  test("an answer nobody could read is reported plainly, with no plan", async () => {
    const r = setup([[say("I cannot tell")]]);
    await r.diagnose();
    expect(of(r.events, "rescue.report").length).toBe(0);
    expect(of(r.events, "plan.ready").length).toBe(0);
    expect(of(r.events, "protocol.error")[0].reason).toMatch(/usable diagnosis/i);
  });
  test("the checks of Rescue are visible on the card as they run", async () => {
    const r = setup([[diag()]]);
    await r.diagnose();
    expect(of(r.events, "proof.step").length).toBeGreaterThan(0);
    expect(of(r.events, "proof.result").length).toBe(1);
  });
  test("it counts toward the daily limit, and is refused at it", async () => {
    const r = setup([[diag()]]);
    await r.diagnose();
    // spending was recorded; a very small ceiling now refuses a second run
    const project = tmp("q"); const events: Event[] = [];
    const { Ledger } = await import("../src/ledger.ts");
    const ledger = new Ledger(":memory:"); ledger.add(project, 1);
    const runner = new AgentRunner({ shadowRoot: tmp("s2"), engine: new ScriptedEngine([[diag()]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: 1 });
    await runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project, agent: "r2", model: "m", budgetUsd: 5 });
    expect(of(events, "protocol.error")[0].reason).toMatch(/daily limit/i);
    expect(of(events, "rescue.report").length).toBe(0);
  });
  test("the stop key ends it without a report", async () => {
    const r = setup([[{ text: "thinking", costUsd: 0, delayMs: 3000 }, diag()]]);
    const run = r.diagnose();
    await Bun.sleep(400);
    await r.runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "kill switch" });
    await run;
    expect(of(r.events, "rescue.report").length).toBe(0);
  });
});
