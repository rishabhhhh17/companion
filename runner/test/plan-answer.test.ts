// A vague "make me something" request (M14 real run): step 1 builds the page with a stand in title, then asks a question only
// the person can answer ("What is your bakery's name?"), and the plan stops there. These tests hold what answering must do:
// finish that step with the answer, then carry the plan on with the steps that were waiting, in the same new folder, each
// with its own undo point, check and receipt, under the same safety rules, approvals and budget. A stand in engine, no money.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { planAnswerPrompt } from "../src/followup.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { NAMES } from "../src/names.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-pa-${l}-`))); made.push(d); return d; };
const say = (text: string, costUsd = 0.01): Step => ({ text, costUsd });
const write = (file_path: string, content: string, costUsd = 0.01): Step => ({ tool: { name: "Write", input: { file_path, content } }, costUsd });
const bash = (command: string): Step => ({ tool: { name: "Bash", input: { command } }, costUsd: 0.01 });
const planOf = (...steps: string[]) => say("Here is the plan:\n```json\n" + JSON.stringify(steps) + "\n```");
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const passed = (): LadderResult => ({ verdict: "passed", steps: [] });
const waitFor = async (cond: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out waiting"); await Bun.sleep(10); } };
const STEPS = ["Create the page with the name and a short welcome", "Add the opening hours section", "Add the contact section"];
const ASK = "I built the page with a stand in title. What is your bakery's name?";
const ANSWER = "Sweet Crumb Bakery, open 7 to 3 Tuesday to Sunday, 12 High Street, 020 7946 0000";

/** The shell's new folder: a home folder, the folder for everything made, a neighbour project and the new empty folder. */
function setup(rounds: Step[][], o: { budgetUsd?: number; offTheRecord?: boolean; proofs?: LadderResult[] } = {}) {
  const home = tmp("home");
  const parent = join(home, NAMES.newFolderParent);
  mkdirSync(parent);
  const project = join(parent, "Website for my bakery");
  mkdirSync(project);
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const log = new TaskLog(":memory:");
  let n = 0;
  const proofs = o.proofs ?? [passed()];
  const runner = new AgentRunner({ shadowRoot: tmp("shadow"), engine, log, emit: (e) => events.push(e), proof: async () => proofs[Math.min(n++, proofs.length - 1)], approvalTimeoutMs: 200 });
  const plan = () => runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "builder-1", goal: "a one page website for my bakery with opening hours and a contact section", model: "m", budgetUsd: o.budgetUsd ?? 3, ...(o.offTheRecord ? { offTheRecord: true } : {}) });
  const approve = (steps = STEPS) => runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "builder-1", steps });
  const answer = (text = ANSWER) => runner.handle({ v: 1, id: "p3", type: "agent.send", agent: "builder-1", project, text });
  return { home, parent, project, events, engine, log, runner, plan, approve, answer };
}
const stepLine = (e: Event[]) => of(e, "drive.step").map((s) => `${s.index}:${s.status}`);
const GOOD_ROUNDS = (): Step[][] => [
  [planOf(...STEPS)],
  [write("index.html", "<title>Your bakery</title>"), say(ASK)],                                  // step 1, asks
  [write("index.html", "<title>Sweet Crumb Bakery</title>"), say("The page now uses the name.")],   // step 1 again, with the answer
  [write("hours.html", "Tuesday to Sunday, 7 to 3"), say("Added the hours.")],                      // step 2
  [write("contact.html", "12 High Street, 020 7946 0000"), say("Added the contact section.")],     // step 3
];

describe("a plan that stopped on a question", () => {
  test("it stops after the step that asked, with the steps waiting and nothing else written", async () => {
    const r = setup(GOOD_ROUNDS());
    await r.plan(); await r.approve();
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "needs_you", completed: 0, total: 3 });
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "receipt").map((x) => [x.ended, x.asks === true, x.proof, x.inPlan])).toEqual([["needs_you", true, "passed", true]]);
    expect(readdirSync(r.project).sort()).toEqual([".companion", "index.html"].filter((f) => existsSync(join(r.project, f))).sort());
    expect(existsSync(join(r.project, "hours.html"))).toBe(false);
  });

  test("the answer finishes that step, then steps 2 and 3 run, each with proof and a receipt, in the same folder", async () => {
    const r = setup(GOOD_ROUNDS());
    await r.plan(); await r.approve();
    await r.answer();
    expect(r.engine.calls.length).toBe(5);
    expect(of(r.events, "drive.done").map((d) => [d.status, d.completed, d.total])).toEqual([["needs_you", 0, 3], ["done", 3, 3]]);
    expect(stepLine(r.events)).toEqual(["1:started", "1:not_done", "1:started", "1:done", "2:started", "2:done", "3:started", "3:done"]);
    const receipts = of(r.events, "receipt");
    expect(receipts.map((x) => [x.ended, x.proof, x.inPlan])).toEqual([["needs_you", "passed", true], ["done", "passed", true], ["done", "passed", true], ["done", "passed", true]]);
    expect(receipts.slice(1).every((x) => x.asks !== true)).toBe(true);
    // Four undo points, all in the new folder; four task rows.
    const cps = of(r.events, "checkpoint.created");
    expect(cps.length).toBe(4);
    expect(cps.every((c) => c.project === r.project)).toBe(true);
    expect(r.log.list().length).toBe(4);
    // The answer was used: the page has the name, and the later steps were written beside it.
    expect(readFileSync(join(r.project, "index.html"), "utf8")).toContain("Sweet Crumb Bakery");
    expect(existsSync(join(r.project, "hours.html"))).toBe(true);
    expect(existsSync(join(r.project, "contact.html"))).toBe(true);
    // Nothing outside the new folder, and no git.
    expect(readdirSync(r.parent)).toEqual(["Website for my bakery"]);
    expect(existsSync(join(r.project, ".git"))).toBe(false);
  });

  test("Claude is told the answer for the step that asked, and carries on its own conversation for every step", async () => {
    const r = setup(GOOD_ROUNDS());
    await r.plan(); await r.approve();
    await r.answer();
    const prompts = r.engine.calls.map((c) => c.prompt);
    expect(prompts[2]).toBe(planAnswerPrompt(1, 3, STEPS[0], ANSWER, "What is your bakery's name?"));
    expect(prompts[2]).toContain("Sweet Crumb Bakery");
    expect(prompts[2]).toContain("step 1 of 3");
    expect(prompts[3]).toMatch(/^Step 2 of 3: Add the opening hours section/);
    expect(prompts[4]).toMatch(/^Step 3 of 3: Add the contact section/);
    // The same conversation, so the later steps know the name (the answer is in it).
    expect(r.engine.calls.slice(1).every((c) => c.resumeSession === "scripted-session")).toBe(true);
  });

  test("the answer is never a task's name: the task list names the step, and a pasted key stays out of Claude's words", async () => {
    const r = setup(GOOD_ROUNDS());
    await r.plan(); await r.approve();
    await r.answer(`${ANSWER}. Use key sk_live_abcdefghijklmnopqrstuvwx`);
    const labels = r.log.list().map((x) => x.label);
    expect(labels.some((l) => l.includes("Sweet Crumb") || l.includes("sk_live"))).toBe(false);
    expect(labels).toContain(`Step 1 of 3: ${STEPS[0]}`);
    expect(r.engine.calls[2].prompt).not.toContain("sk_live_abcdefghijklmnopqrstuvwx");
    expect(r.engine.calls[2].prompt).toMatch(/hid something/);
  });

  test("off the record the later steps start afresh, so the goal they are told carries the answer", async () => {
    const r = setup(GOOD_ROUNDS(), { offTheRecord: true });
    await r.plan(); await r.approve();
    await r.answer();
    expect(r.engine.calls.length).toBe(5);
    expect(of(r.events, "drive.done").at(-1)).toMatchObject({ status: "done", completed: 3, total: 3 });
    expect(r.engine.calls.slice(2).every((c) => c.resumeSession === undefined)).toBe(true);
    for (const c of r.engine.calls.slice(2)) expect(c.prompt).toContain("Sweet Crumb Bakery");
    expect(r.log.list().every((x) => x.label === "Off the record task")).toBe(true);   // nothing about it is kept
  });

  test("a second question stops the plan again, and that answer carries on from there", async () => {
    const r = setup([
      [planOf(...STEPS)],
      [write("index.html", "v1"), say(ASK)],
      [write("index.html", "v2"), say("Named it.")],
      [write("hours.html", "h"), say("Added the hours. Which days are you closed?")],
      [write("hours.html", "h2"), say("Done.")],
      [write("contact.html", "c"), say("Done.")],
    ]);
    await r.plan(); await r.approve();
    await r.answer();
    expect(of(r.events, "drive.done").map((d) => [d.status, d.completed])).toEqual([["needs_you", 0], ["needs_you", 1]]);
    await r.answer("Monday");
    expect(of(r.events, "drive.done").map((d) => [d.status, d.completed])).toEqual([["needs_you", 0], ["needs_you", 1], ["done", 3]]);
    expect(r.engine.calls.length).toBe(6);
    expect(r.engine.calls[4].prompt).toContain("step 2 of 3");
    expect(r.engine.calls[5].prompt).toMatch(/^Step 3 of 3/);
  });

  test("Undo of the step that asked ends the plan: the answer is refused and no step runs", async () => {
    const r = setup(GOOD_ROUNDS());
    await r.plan(); await r.approve();
    const cp = of(r.events, "checkpoint.created")[0].checkpoint;
    await r.runner.handle({ v: 1, id: "u", type: "checkpoint.restore", project: r.project, checkpoint: cp });
    await r.answer();
    expect(r.engine.calls.length).toBe(2);
    expect(of(r.events, "protocol.error").length).toBeGreaterThan(0);
    expect(of(r.events, "drive.done").length).toBe(1);
  });

  test("a new task in between ends the plan: a later answer never brings back the old steps", async () => {
    const r = setup([...GOOD_ROUNDS().slice(0, 2), [write("other.txt", "x"), say("Done.")], [write("hours.html", "never")]]);
    await r.plan(); await r.approve();
    await r.runner.handle({ v: 1, id: "n1", type: "agent.start", project: r.project, agent: "builder-1", mode: "drive", prompt: "Add a file", model: "m", budgetUsd: 1 });
    const steps = of(r.events, "drive.step").length;
    await r.answer();
    // What is typed now is an ordinary follow up to the newest task: no step of the old plan starts.
    expect(of(r.events, "drive.step").length).toBe(steps);
    expect(of(r.events, "drive.done").length).toBe(1);
    expect(of(r.events, "receipt").at(-1).inPlan).toBeUndefined();
  });

  test("the same approvals: a step after the answer that touches git still waits for a tap, and no answer is a no", async () => {
    const r = setup([
      [planOf(...STEPS)],
      [write("index.html", "v1"), say(ASK)],
      [write("index.html", "v2"), say("Named it.")],
      [bash("git push origin main"), say("done")],
      [write("contact.html", "c"), say("Done.")],
    ]);
    await r.plan(); await r.approve();
    const run = r.answer();
    await waitFor(() => of(r.events, "approval.request").length > 0);
    expect(of(r.events, "approval.request")[0].risk).toBe("git");
    await run;
    expect(of(r.events, "approval.resolved")[0].outcome).toBe("expired");
    expect(existsSync(join(r.project, ".git"))).toBe(false);
  });

  test("the same writes rule: a step after the answer cannot write outside the new folder", async () => {
    const outside = (): string => join(r.parent, "notes.txt");
    const r = setup([
      [planOf(...STEPS)],
      [write("index.html", "v1"), say(ASK)],
      [write("index.html", "v2"), say("Named it.")],
      [write(join(tmp("elsewhere"), "evil.txt"), "evil"), write(join(realpathSync(tmpdir()), "companion-pa-evil.txt"), "evil"), say("done")],
      [write("contact.html", "c"), say("Done.")],
    ]);
    await r.plan(); await r.approve();
    await r.answer();
    const blocked = of(r.events, "agent.tool").filter((t) => t.outcome === "blocked");
    expect(blocked.length).toBe(2);
    expect(existsSync(join(realpathSync(tmpdir()), "companion-pa-evil.txt"))).toBe(false);
    expect(existsSync(outside())).toBe(false);
  });

  test("the same budget: the plan carries on only with what it had left", async () => {
    const r = setup([
      [planOf(...STEPS)],
      [write("index.html", "v1", 0.04), say(ASK, 0.04)],
      [write("index.html", "v2", 0.04), say("Named it.", 0.04)],
      [write("hours.html", "h", 0.04), say("Added.", 0.04)],
      [write("contact.html", "never", 0.04)],
    ], { budgetUsd: 0.2 });
    await r.plan(); await r.approve();
    await r.answer();
    const done = of(r.events, "drive.done").at(-1);
    expect(done.status).toBe("error_max_budget_usd");
    expect(done.completed).toBeLessThan(3);
    expect(existsSync(join(r.project, "contact.html"))).toBe(false);
  });

  test("a step whose check fails after the answer is not done, and the plan stops there", async () => {
    const failed: LadderResult = { verdict: "failed", steps: [{ rung: "checks", label: "Building", status: "failed", detail: "the page did not build", ms: 1 } as never], failedAt: { rung: "checks", label: "Building", status: "failed", detail: "the page did not build", ms: 1 } as never };
    const r = setup([
      [planOf(...STEPS)],
      [write("index.html", "v1"), say(ASK)],
      [write("index.html", "v2"), say("Named it.")],
      [write("hours.html", "h")], [write("hours.html", "h")], [write("hours.html", "h")],
    ], { proofs: [passed(), passed(), failed] });
    await r.plan(); await r.approve();
    await r.answer();
    const done = of(r.events, "drive.done").at(-1);
    expect(done.status).toBe("not_done");
    expect(done.completed).toBe(1);
    expect(existsSync(join(r.project, "contact.html"))).toBe(false);
  });
});
