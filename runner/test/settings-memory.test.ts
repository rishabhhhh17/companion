// Area 3 of the settings plan (docs/milestones/M11-customize-plan.md): Memory, Explain and teaching, in the engine. Each
// setting kept in settings.json reaches the engine through settings.apply and is read once, when a task starts (so a
// running task keeps what it started with). Explain after a task (explain.mode) is the engine's own, kept in
// memory-settings.json as Explain was, and read as the explanation is asked for, as before. Every usual value is today's
// behaviour, and what memory may never hold, Pause and off the record stay exactly as they were.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import { MemoryStore } from "../src/memory/store.ts";
import { EXPLAIN_REASONS_SYSTEM, EXPLAIN_SYSTEM, explainRequest } from "../src/explain.ts";
import { promptHelpMemory, RECALL_WORDS, recallWords } from "../src/memory/recall.ts";
import { EXPLAIN_MODES, parseCommand, parseEvent, type Event } from "../../protocol/index.ts";
import { defOf, REGISTRY } from "../../protocol/settings.ts";
import { PRODUCT, PRODUCT_S } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-setmem-${l}-`))); made.push(d); return d; };
const say = (text: string, delayMs?: number): Step => ({ text, costUsd: 0.01, ...(delayMs ? { delayMs } : {}) });
const edit = (file_path: string, old_string: string, new_string: string): Step => ({ tool: { name: "Edit", input: { file_path, old_string, new_string } }, costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const apply = (values: Record<string, unknown>) => ({ v: 1 as const, id: "s", type: "settings.apply" as const, values });
// The answer a model gives with a check question, so a test can see the question dropped when it is not wanted.
const WITH_Q = '{"why":["The page read the name before the user had loaded.","The ? skips the name until there is a user."],"question":{"text":"What does the ? do?","options":["Skips the name when there is no user","Makes the page faster"],"correct":0}}';
const A = "import x\nconst n = user.name;\nend\n";
const B = "function t() {\n  return title(user.name);\n}\n";
// What Explain asked Claude before this setting existed, word for word: the usual choice must ask exactly this.
const bothPlaces: Step[] = [edit("src/a.js", "user.name", "user?.name"), edit("src/b.js", "user.name", "user?.name"), say("I made the name safe in both places.")];

type Rig = { rounds: Step[][]; values?: Record<string, unknown>; noMemory?: boolean; packageJson?: boolean };
function rig(o: Rig) {
  const project = tmp("p"), data = tmp("d"), events: Event[] = [];
  for (const [f, t] of Object.entries({ "src/a.js": A, "src/b.js": B })) { mkdirSync(dirname(join(project, f)), { recursive: true }); writeFileSync(join(project, f), t); }
  if (o.packageJson !== false) writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { dev: "vite", test: "vitest" }, dependencies: { react: "1" }, devDependencies: { vite: "1" } }));
  const settings = new RunnerSettings();
  if (o.values) settings.apply(apply(o.values));
  const calls: { text: string; system: string }[] = [];
  const engine = new ScriptedEngine(o.rounds);
  const explainer = async (req: { text: string; system: string }) => { calls.push(req); return { text: WITH_Q, costUsd: 0.002 }; };
  const runner = new AgentRunner({ settings, shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), ...(o.noMemory ? {} : { memoryDir: data }), explainer, proof: async () => ({ verdict: "passed", steps: [] }) });
  const start = (prompt = "fix the name", extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt, model: "m", budgetUsd: 1, ...extra } as never);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  const memory = () => new MemoryStore({ project, profileDir: data });
  const projectFile = () => (existsSync(join(project, ".companion", "project.md")) ? readFileSync(join(project, ".companion", "project.md"), "utf8") : "");
  const profileFile = () => (existsSync(join(data, "profile.md")) ? readFileSync(join(data, "profile.md"), "utf8") : "");
  return { project, data, events, calls, engine, settings, runner, start, cmd, memory, projectFile, profileFile };
}
const plan = (titles: string[]) => say("Here is the plan:\n```json\n" + JSON.stringify(titles) + "\n```");
// What Rescue and Research answer, so a test can run each of them.
const diagnosis = say("```json\n" + JSON.stringify({ summary: "A shop made with Vite.", works: ["The pages are there"], broken: "The basket page cannot read the price.", steps: ["Fix the price on the basket page", "Check the basket"] }) + "\n```");
const notes = say(JSON.stringify({ title: "Taking payments", answer: "Use a hosted checkout page.", notes: [{ text: "Checkout is a hosted payment page.", source: "https://docs.stripe.com/payments/checkout" }] }));
async function runPlan(t: ReturnType<typeof rig>, goal: string, titles: string[]) {
  await Bun.sleep(400);   // the project's files are a moment old, like real ones, so the plan's watcher does not take them for the person's
  await t.cmd({ type: "drive.plan", agent: "b1", goal, model: "m", budgetUsd: 3 });
  await t.cmd({ type: "drive.approve", agent: "b1", steps: titles });
  await Bun.sleep(150);
}
/** Words in what Claude is told from memory, counted the way the cap counts them (each line, its dash included). */
const recalledWords = (text: string) => text.split("\n").filter((l) => l.startsWith("- ")).reduce((n, l) => n + l.split(/\s+/).length, 0);

describe("the settings of this area, as the registry lists them", () => {
  const want: Record<string, Record<string, unknown>> = {
    "explain.mode": { kind: "choice", default: "reasonsAndQuestion", options: ["off", "reasons", "reasonsAndQuestion"], applies: ["runner"], store: "memory", live: true },
    "explain.after": { kind: "choice", default: "everyTask", options: ["everyTask", "plansOnly"], applies: ["runner"], store: "settings", live: false },
    "memory.learnFromFiles": { kind: "switch", default: true, applies: ["runner"], store: "settings", live: false },
    "memory.learnFromWords": { kind: "switch", default: true, applies: ["runner"], store: "settings", live: false },
    "memory.rememberGoals": { kind: "switch", default: true, applies: ["runner"], store: "settings", live: false },
    "memory.tellClaude": { kind: "switch", default: true, applies: ["runner"], store: "settings", live: false },
    "memory.recallLength": { kind: "choice", default: "normal", options: ["short", "normal", "long"], applies: ["runner"], store: "settings", live: false },
    "task.offRecordByDefault": { kind: "switch", default: false, applies: ["pages"], store: "settings", live: true },
    "memory.toastSeconds": { kind: "choice", default: "10", options: ["5", "10", "20", "60", "untilClosed"], applies: ["pages"], store: "settings", live: true },
    "where.after": { kind: "choice", default: "30min", options: ["off", "30min", "2h", "nextDay"], applies: ["pages"], store: "settings", live: true },
    // The engine works out an offer as a task ends, so turning it on reaches the next fix ("From the next task").
    "teach.yourTurn": { kind: "switch", default: true, applies: ["pages", "runner"], store: "settings", live: false },
  };
  test("each one is for every project, in Memory, Explain and teaching, with today's behaviour as its usual value", () => {
    for (const [k, w] of Object.entries(want)) expect(defOf(k), k).toMatchObject({ ...w, scope: "app", section: "memory" });
  });
  test("Explain after a task replaces the old switch, and its words are the ones the engine and the protocol use", () => {
    expect(defOf("explain.on")).toBeUndefined();
    expect([...EXPLAIN_MODES] as string[]).toEqual(defOf("explain.mode")!.options!);
    // Never a setting for what memory may never hold, or for loosening off the record (rule 15, the never list).
    for (const d of REGISTRY.settings) expect(d.key, d.key).not.toMatch(/learnEverything|keepOffRecord|offRecordKeeps|filter|neverHold/i);
  });
});

describe("Explain after a task (explain.mode)", () => {
  test("an older memory-settings.json keeps its meaning: Explain off becomes off, on or missing becomes reasons and a question", () => {
    const d = tmp("old");
    const m = new MemoryStore({ project: "", profileDir: d });
    expect(m.explainMode()).toBe("reasonsAndQuestion");
    writeFileSync(join(d, "memory-settings.json"), JSON.stringify({ paused: false, forgotten: {}, agents: {}, explain: false }));
    expect(m.explainMode()).toBe("off");
    expect(m.explainEnabled()).toBe(false);
    writeFileSync(join(d, "memory-settings.json"), JSON.stringify({ paused: true, explain: true }));
    expect(m.explainMode()).toBe("reasonsAndQuestion");
    writeFileSync(join(d, "memory-settings.json"), JSON.stringify({ explain: false, explainMode: "loud" }));
    expect(m.explainMode()).toBe("off");   // a word this version does not know: the old switch decides
  });
  test("a new choice is kept with the old switch beside it, so going back a version keeps Explain on or off", () => {
    const d = tmp("new");
    const m = new MemoryStore({ project: "", profileDir: d });
    m.setPaused(true);
    m.setExplainMode("reasons");
    const j = JSON.parse(readFileSync(join(d, "memory-settings.json"), "utf8"));
    expect(j).toMatchObject({ explainMode: "reasons", explain: true, paused: true });
    m.setExplainMode("off");
    expect(JSON.parse(readFileSync(join(d, "memory-settings.json"), "utf8"))).toMatchObject({ explainMode: "off", explain: false, paused: true });
    expect(m.explainMode()).toBe("off");
  });
  test("the engine's own command carries the choice, and its answer says it", () => {
    for (const mode of EXPLAIN_MODES) expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "explain.set", project: "/p", mode })).ok, mode).toBe(true);
    for (const bad of [{ mode: "on" }, { mode: true }, { enabled: false }, {}]) expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "explain.set", project: "/p", ...bad })).ok, JSON.stringify(bad)).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "explain.state", project: "/p", enabled: true, mode: "reasons" })).ok).toBe(true);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "explain.state", project: "/p", enabled: true, mode: "loud" })).ok).toBe(false);
  });
  test("usual: the request is the usual one, and the two reasons arrive with the check question", async () => {
    const t = rig({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]] });
    await t.start(); await Bun.sleep(100);
    expect(t.calls.length).toBe(1);
    // The usual mode sends the one usual prompt (with the question), never the reasons only one.
    expect(t.calls[0].system).toBe(EXPLAIN_SYSTEM);
    expect(EXPLAIN_SYSTEM).toContain("\"question\"");
    expect(EXPLAIN_SYSTEM).not.toBe(EXPLAIN_REASONS_SYSTEM);
    const input = { label: "x", changed: [{ file: "a.js", kind: "modified" }], said: "s", diff: "d" };
    expect(explainRequest(input)).toEqual(explainRequest(input, { question: true }));
    const e = of(t.events, "explain.ready")[0];
    expect(e.bullets.length).toBe(2); expect(e.question.correct).toBe(0);
  });
  test("short reasons: Claude is not asked for a question, and one it gives anyway is never shown", async () => {
    const t = rig({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]] });
    await t.cmd({ type: "explain.set", mode: "reasons" });
    expect(of(t.events, "explain.state").at(-1)).toMatchObject({ enabled: true, mode: "reasons" });
    await t.start(); await Bun.sleep(100);
    expect(t.calls.length).toBe(1);
    expect(t.calls[0].system).not.toMatch(/question/i);
    expect(t.calls[0].system).toContain('"why"');
    const e = of(t.events, "explain.ready")[0];
    expect(e.bullets.length).toBe(2); expect(e.question).toBeUndefined();
  });
  test("off: nothing is asked of Claude, so nothing is spent on it", async () => {
    const t = rig({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]] });
    await t.cmd({ type: "explain.set", mode: "off" });
    expect(of(t.events, "explain.state").at(-1)).toMatchObject({ enabled: false, mode: "off" });
    await t.start(); await Bun.sleep(100);
    expect(t.calls.length).toBe(0);
    expect(of(t.events, "explain.ready")).toEqual([]);
    expect(of(t.events, "receipt").length).toBe(1);
  });
  test("the Memory tab's state says the choice too", async () => {
    const t = rig({ rounds: [] });
    await t.cmd({ type: "memory.list" });
    expect(of(t.events, "explain.state").at(-1)).toMatchObject({ enabled: true, mode: "reasonsAndQuestion" });
  });
});

describe("Explain after (explain.after)", () => {
  test("usual: every finished task is explained", async () => {
    const t = rig({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]], noMemory: true });
    await t.start(); await Bun.sleep(100);
    expect(t.calls.length).toBe(1);
  });
  test("only plan steps: a single task is not explained, and nothing is spent on it", async () => {
    const t = rig({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]], values: { "explain.after": "plansOnly" }, noMemory: true });
    await t.start(); await Bun.sleep(100);
    expect(t.calls.length).toBe(0);
    expect(of(t.events, "receipt").length).toBe(1);
  });
  test("only plan steps: each step of a Drive plan is still explained", async () => {
    const t = rig({ rounds: [[plan(["Fix the first name", "Fix the second name"])], [edit("src/a.js", "user.name", "user?.name"), say("One.")], [edit("src/b.js", "user.name", "user?.name"), say("Two.")]], values: { "explain.after": "plansOnly" }, noMemory: true });
    await runPlan(t, "fix the names", ["Fix the first name", "Fix the second name"]);
    expect(t.calls.length).toBe(2);
    expect(of(t.events, "explain.ready").map((e) => e.step.index)).toEqual([1, 2]);
  });
  test("a task keeps the choice it started with", async () => {
    const t = rig({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.", 150)]], noMemory: true });
    const going = t.start();
    await Bun.sleep(40);
    t.settings.apply(apply({ "explain.after": "plansOnly" }));
    await going; await Bun.sleep(100);
    expect(t.calls.length).toBe(1);
  });
});

describe("learning about the project and the person (memory.learnFromFiles, memory.learnFromWords)", () => {
  test("usual: both are learned, as today", async () => {
    const t = rig({ rounds: [[say("done")]] });
    await t.start("add a page and keep the answers shorter");
    expect(t.projectFile()).toContain("Built with React, Vite");
    expect(t.profileFile()).toContain("Prefers short answers");
  });
  test("files off: nothing is learned from the project's files, and what the person says still is", async () => {
    const t = rig({ rounds: [[say("done")]], values: { "memory.learnFromFiles": false } });
    await t.start("add a page and keep the answers shorter");
    expect(t.projectFile()).not.toContain("Built with");
    expect(t.projectFile()).not.toContain("Start it with");
    expect(t.profileFile()).toContain("Prefers short answers");
    expect(of(t.events, "memory.saved").map((e) => e.text)).toEqual(["Prefers short answers"]);
  });
  test("words off: nothing is learned from what the person says, and the project's files still are", async () => {
    const t = rig({ rounds: [[say("done")]], values: { "memory.learnFromWords": false } });
    await t.start("add a page, keep the answers shorter, and never touch the config folder");
    expect(t.projectFile()).toContain("Built with React, Vite");
    expect(t.projectFile()).not.toContain("Never touch");
    expect(t.profileFile()).toBe("");
  });
  test("planning follows them too", async () => {
    const t = rig({ rounds: [[plan(["Add a page"])]], values: { "memory.learnFromFiles": false, "memory.learnFromWords": false } });
    await t.cmd({ type: "drive.plan", agent: "b1", goal: "build it, keep answers shorter", model: "m", budgetUsd: 3 });
    expect(of(t.events, "plan.ready").length).toBe(1);
    expect(of(t.events, "memory.saved")).toEqual([]);
    expect(t.projectFile()).toBe(""); expect(t.profileFile()).toBe("");
  });
  test("Pause still stops all learning, with both on", async () => {
    const t = rig({ rounds: [[say("done")]] });
    await t.cmd({ type: "memory.pause", paused: true });
    await t.start("add a page and keep the answers shorter");
    expect(of(t.events, "memory.saved")).toEqual([]);
    expect(t.projectFile()).toBe(""); expect(t.profileFile()).toBe("");
  });
  test("what memory may never hold is still never saved, from either source", async () => {
    const t = rig({ rounds: [[say("done")]] });
    await t.start("my wife has depression, so keep it shorter and use password: hunter2hunter2");
    expect([t.projectFile(), t.profileFile()].join("\n")).not.toMatch(/wife|depress|hunter2/i);
  });
  test("a task keeps the choice it started with", async () => {
    const t = rig({ rounds: [[say("one", 120)], [say("two")]] });
    const going = t.start("add a page");
    await Bun.sleep(30);
    t.settings.apply(apply({ "memory.learnFromFiles": false }));
    await going;
    expect(t.projectFile()).toContain("Built with React, Vite");   // learned as the first task started
  });
});

describe("remembering the goals of approved plans (memory.rememberGoals)", () => {
  test("usual: the goal of an approved plan is remembered, as today", async () => {
    const t = rig({ rounds: [[plan(["Add a page"])], [say("one")]], noMemory: false, packageJson: false, values: { "memory.learnFromFiles": false } });
    await runPlan(t, "make a shop for my plants", ["Add a page"]);
    expect(t.projectFile()).toContain("Goal: make a shop for my plants");
    expect(of(t.events, "drive.done")[0]).toMatchObject({ status: "done" });
  });
  test(`the goal is written once the plan's watcher is looking, as ${PRODUCT_S} own write, so it never pauses the plan`, () => {
    // Written before the watcher started, the memory file and the AGENTS.md it may create could arrive as file events
    // after it started, and pause the plan as if the person had changed the project (seen while building this setting).
    const src = readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8");
    const at = src.indexOf("private async driveApprove(");
    const body = src.slice(at, src.indexOf("    try {", at));
    expect(body.indexOf("watcher.start();")).toBeGreaterThan(0);
    expect(body.indexOf('this.setting<boolean>("memory.rememberGoals", plan.project)) this.remember(')).toBeGreaterThan(body.indexOf("watcher.start();"));
    expect(body.match(/this\.remember\(/g)?.length).toBe(1);
  });
  test("off: the plan runs and its goal is not remembered", async () => {
    const t = rig({ rounds: [[plan(["Add a page"])], [say("one")]], packageJson: false, values: { "memory.learnFromFiles": false, "memory.rememberGoals": false } });
    await runPlan(t, "make a shop for my plants", ["Add a page"]);
    expect(t.projectFile()).not.toContain("Goal:");
    expect(of(t.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1 });
  });
});

describe(`telling Claude what ${PRODUCT} remembers (memory.tellClaude)`, () => {
  test("usual: every task is told, as today", async () => {
    const t = rig({ rounds: [[say("done")]] });
    await t.start("add a page");
    expect(t.engine.calls[0].memory ?? "").toContain("Built with React, Vite");
  });
  test("off: lines are still learned and kept, but Claude is told none of them, in tasks and in planning", async () => {
    const t = rig({ rounds: [[say("done")], [plan(["Add a page"])]], values: { "memory.tellClaude": false } });
    await t.start("add a page and keep the answers shorter");
    expect(t.projectFile()).toContain("Built with React, Vite");
    expect(t.profileFile()).toContain("Prefers short answers");
    expect(t.engine.calls[0].memory ?? "").toBe("");
    await t.cmd({ type: "drive.plan", agent: "b1", goal: "build it", model: "m", budgetUsd: 3 });
    expect(t.engine.calls[1].memory ?? "").toBe("");
  });
  test("paused and on: saved lines are still told, as today (pausing stops only new lines)", async () => {
    const t = rig({ rounds: [[say("one")], [say("two")]] });
    await t.start("add a page");
    await t.cmd({ type: "memory.pause", paused: true });
    await t.start("add a footer");
    expect(t.engine.calls[1].memory ?? "").toContain("Built with React, Vite");
  });
  test("paused and off: memory is kept but not used", async () => {
    const t = rig({ rounds: [[say("one")], [say("two")]] });
    await t.start("add a page");
    await t.cmd({ type: "memory.pause", paused: true });
    t.settings.apply(apply({ "memory.tellClaude": false }));
    await t.start("add a footer");
    expect(t.engine.calls[1].memory ?? "").toBe("");
    expect(t.projectFile()).toContain("Built with React, Vite");
  });
  test("Prompt help follows it too, read for each request", () => {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("memory: promptHelpMemory(runnerSettings, settings.data)");
    expect(main).not.toContain("forAgent(300)");
    const data = tmp("ph");
    new MemoryStore({ project: "", profileDir: data }).add("profile", "Prefers short answers", "a");
    const on = new RunnerSettings(), off = new RunnerSettings();
    off.apply(apply({ "memory.tellClaude": false }));
    expect(promptHelpMemory(on, data)()).toContain("Prefers short answers");
    expect(promptHelpMemory(undefined, data)()).toContain("Prefers short answers");
    expect(promptHelpMemory(off, data)()).toBe("");
  });
});

describe("how much Claude is told from memory (memory.recallLength)", () => {
  test("the number of words for tasks and for Prompt help, for each choice", () => {
    expect(RECALL_WORDS).toEqual({ short: { task: 500, help: 100 }, normal: { task: 1500, help: 300 }, long: { task: 3000, help: 600 } });
    const s = new RunnerSettings();
    const get = (k: string) => s.get(k);
    expect([recallWords(get, "task"), recallWords(get, "help")]).toEqual([1500, 300]);
    s.apply(apply({ "memory.recallLength": "short" }));
    expect([recallWords(get, "task"), recallWords(get, "help")]).toEqual([500, 100]);
    s.apply(apply({ "memory.recallLength": "long" }));
    expect([recallWords(get, "task"), recallWords(get, "help")]).toEqual([3000, 600]);
    s.apply(apply({ "memory.recallLength": "huge" }));   // refused: the usual one
    expect(recallWords(get, "task")).toBe(1500);
    s.apply(apply({ "memory.recallLength": "long", "memory.tellClaude": false }));
    expect([recallWords(get, "task"), recallWords(get, "help")]).toEqual([0, 0]);
  });
  const fill = (m: MemoryStore) => { for (let i = 0; i < 300; i++) m.add("project", `Fact number ${i} ${"word ".repeat(12)}`, "a"); };
  for (const [choice, cap] of [[undefined, 1500], ["short", 500], ["long", 3000]] as const) {
    test(`a task is told up to ${cap} words ${choice ? `with ${choice}` : "as usual"}`, async () => {
      const t = rig({ rounds: [[say("done")]], packageJson: false, values: choice ? { "memory.recallLength": choice } : {} });
      fill(t.memory());
      await t.start("add a page");
      const n = recalledWords(t.engine.calls[0].memory ?? "");
      expect(n).toBeLessThanOrEqual(cap);
      expect(n).toBeGreaterThan(cap - 17);
    });
  }
  test("Prompt help is told up to 300 words as usual, 100 when short and 600 when long", () => {
    const data = tmp("phlen");
    const m = new MemoryStore({ project: "", profileDir: data });
    for (let i = 0; i < 150; i++) m.add("profile", `Likes option number ${i} ${"word ".repeat(10)}`, "a");
    for (const [choice, cap] of [[undefined, 300], ["short", 100], ["long", 600]] as const) {
      const s = new RunnerSettings();
      if (choice) s.apply(apply({ "memory.recallLength": choice }));
      const n = recalledWords(promptHelpMemory(s, data)());
      expect(n, String(choice)).toBeLessThanOrEqual(cap);
      expect(n, String(choice)).toBeGreaterThan(cap - 15);
    }
  });
});

describe("Your turn after a fix (teach.yourTurn)", () => {
  // On by default since 22 Oct 2026: the product's point is that people understand, and teaching that is offered as a separate
  // lesson fails (17% against 98% when built into the fix, F16). It is only an offer on the receipt (a button the person can ignore), and a switch in Settings.
  test("usual (on): a proven fix that made the same change twice offers it, with no setting touched", async () => {
    const t = rig({ rounds: [bothPlaces] });
    await t.start();
    expect(of(t.events, "receipt")[0].repeat).toBeDefined();
  });
  test("turned off: the engine does not work out an offer, so there is nothing to try", async () => {
    const t = rig({ rounds: [bothPlaces], values: { "teach.yourTurn": false } });
    await t.start();
    const r = of(t.events, "receipt")[0];
    expect(r.repeat).toBeUndefined();
    await t.cmd({ type: "teach.try", checkpoint: r.checkpoint });
    expect(of(t.events, "teach.ready").at(-1)).toMatchObject({ made: false });
    expect(readFileSync(join(t.project, "src/b.js"), "utf8")).toContain("user?.name");   // the fix stays whole
  });
  test("on: a proven fix that made the same change twice offers it, and trying it works", async () => {
    const t = rig({ rounds: [bothPlaces], values: { "teach.yourTurn": true } });
    await t.start();
    const r = of(t.events, "receipt")[0];
    expect(r.repeat).toBeDefined();
    await t.cmd({ type: "teach.try", checkpoint: r.checkpoint });
    expect(of(t.events, "teach.ready").at(-1)).toMatchObject({ made: true });
  });
  test("on, off the record still never offers it", async () => {
    const t = rig({ rounds: [bothPlaces], values: { "teach.yourTurn": true } });
    await t.start("fix the name", { offTheRecord: true });
    expect(of(t.events, "receipt")[0].repeat).toBeUndefined();
  });
});

describe("Rescue and Research follow the memory settings too", () => {
  // Both only look at the project. Each learns from the project's files and is told what Companion remembers, as a task is.
  const rescue = (t: ReturnType<typeof rig>, extra: Record<string, unknown> = {}) => t.cmd({ type: "rescue.diagnose", agent: "r1", model: "m", budgetUsd: 3, ...extra });
  const research = (t: ReturnType<typeof rig>, extra: Record<string, unknown> = {}) => t.cmd({ type: "research.ask", agent: "r1", question: "how do I take payments", model: "m", budgetUsd: 1, ...extra });
  const flows = [["Rescue", diagnosis, rescue, "rescue.report"], ["Research", notes, research, "research.done"]] as const;
  const fill = (m: MemoryStore) => { for (let i = 0; i < 300; i++) m.add("project", `Fact number ${i} ${"word ".repeat(12)}`, "a"); };
  for (const [name, answer, ask, done] of flows) {
    test(`${name}, usual: it learns from the project's files and Claude is told, as today`, async () => {
      const t = rig({ rounds: [[answer]] });
      await ask(t);
      expect(of(t.events, done).length).toBe(1);
      expect(t.projectFile()).toContain("Built with React, Vite");
      expect(t.engine.calls[0].memory ?? "").toContain("Built with React, Vite");
    });
    test(`${name}, learning from the files off: nothing is learned from them`, async () => {
      const t = rig({ rounds: [[answer]], values: { "memory.learnFromFiles": false } });
      await ask(t);
      expect(of(t.events, done).length).toBe(1);
      expect(of(t.events, "memory.saved")).toEqual([]);
      expect(t.projectFile()).toBe("");
    });
    test(`${name}, telling Claude off: lines are still learned, and Claude is told none of them`, async () => {
      const t = rig({ rounds: [[answer]], values: { "memory.tellClaude": false } });
      await ask(t);
      expect(t.projectFile()).toContain("Built with React, Vite");
      expect(t.engine.calls[0].memory ?? "").toBe("");
    });
    for (const [choice, cap] of [["short", 500], ["long", 3000]] as const) {
      test(`${name}, ${choice}: Claude is told up to ${cap} words`, async () => {
        const t = rig({ rounds: [[answer]], packageJson: false, values: { "memory.recallLength": choice } });
        fill(t.memory());
        await ask(t);
        const n = recalledWords(t.engine.calls[0].memory ?? "");
        expect(n).toBeLessThanOrEqual(cap);
        expect(n).toBeGreaterThan(cap - 17);
      });
    }
  }
  test("the protocol carries off the record for both", () => {
    for (const c of [{ type: "rescue.diagnose", project: "/p", agent: "r1", model: "m", budgetUsd: 3, offTheRecord: true }, { type: "research.ask", project: "/p", agent: "r1", question: "q", model: "m", budgetUsd: 1, offTheRecord: true }]) {
      const r = parseCommand(JSON.stringify({ v: 1, id: "x", ...c }));
      expect(r.ok, c.type).toBe(true);
      if (r.ok) expect((r.msg as any).offTheRecord, c.type).toBe(true);
    }
  });

  describe("off the record, they keep nothing either", () => {
    test("Rescue: nothing learned or told, no saved conversation, and the steps of its plan run off the record", async () => {
      const t = rig({ rounds: [[diagnosis], [edit("src/a.js", "user.name", "user?.name"), edit("src/b.js", "user.name", "user?.name"), say("one")], [say("two")]], values: { "memory.recallLength": "long", "teach.yourTurn": true } });
      t.memory().add("project", "Uses Supabase", "your answer");
      const before = t.projectFile();
      await Bun.sleep(400);   // the project's files are a moment old, like real ones, so the plan's watcher does not take them for the person's
      await rescue(t, { offTheRecord: true });
      expect(of(t.events, "plan.ready").length).toBe(1);
      expect(t.engine.calls[0]).toMatchObject({ offTheRecord: true, memory: "", planOnly: true });
      await t.cmd({ type: "drive.approve", agent: "r1", steps: ["Fix the price on the basket page", "Check the basket"] });
      await Bun.sleep(150);
      expect(of(t.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2 });
      for (const c of t.engine.calls.slice(1)) {
        expect(c).toMatchObject({ offTheRecord: true, memory: "" });
        expect(c.resumeSession).toBeUndefined();
        // With no conversation to carry on, each step is told what Rescue found.
        expect(c.prompt).toContain("The basket page cannot read the price.");
      }
      expect(of(t.events, "checkpoint.created").map((e) => e.label)).toEqual(["Before: Off the record task", "Before: Off the record task"]);
      expect(t.calls.length).toBe(0);                                   // no Explain
      expect(of(t.events, "receipt").every((r) => r.repeat === undefined)).toBe(true);   // no Your turn
      expect(of(t.events, "memory.saved")).toEqual([]);
      expect(t.projectFile()).toBe(before);
      expect(t.profileFile()).toBe("");
    });
    test("Rescue on the record still carries on its own conversation in the steps, as today", async () => {
      const t = rig({ rounds: [[diagnosis], [edit("src/a.js", "user.name", "user?.name"), say("one")], [edit("src/b.js", "user.name", "user?.name"), say("two")]], values: { "memory.learnFromFiles": false } });
      await Bun.sleep(400);
      await rescue(t);
      await t.cmd({ type: "drive.approve", agent: "r1", steps: ["Fix the price on the basket page", "Check the basket"] });
      await Bun.sleep(150);
      expect(t.engine.calls[1].resumeSession).toBe("scripted-session");
      expect(t.engine.calls[1].offTheRecord).toBeUndefined();
      expect(t.engine.calls[1].prompt).not.toContain("The basket page cannot read the price.");
      expect(t.calls.length).toBe(2);                                   // each step explained
    });
    test("Research: nothing learned or told, no saved conversation, and no notes filed", async () => {
      const t = rig({ rounds: [[notes]] });
      t.memory().add("project", "Uses Supabase", "your answer");
      const before = t.projectFile();
      await research(t, { offTheRecord: true });
      expect(t.engine.calls[0]).toMatchObject({ offTheRecord: true, memory: "", planOnly: true });
      expect(of(t.events, "memory.saved")).toEqual([]);
      expect(t.projectFile()).toBe(before);
      expect(t.profileFile()).toBe("");
      expect(existsSync(join(t.project, ".companion", "research"))).toBe(false);
      const d = of(t.events, "research.done")[0];
      expect(d).toMatchObject({ title: "Taking payments", answer: "Use a hosted checkout page." });
      expect(d.notes.length).toBe(1);
      expect("file" in d).toBe(false);
      expect(parseEvent(JSON.stringify({ v: 1, id: "e", ...d })).ok).toBe(true);
    });
    test("Research on the record still files its notes, as today", async () => {
      const t = rig({ rounds: [[notes]] });
      await research(t);
      const d = of(t.events, "research.done")[0];
      expect(d.file).toMatch(/^\.companion\/research\/.+\.md$/);
      expect(existsSync(join(t.project, d.file))).toBe(true);
    });
  });
});

describe("off the record keeps nothing, whatever these settings say", () => {
  test("with every setting of this area at its most open, an off the record task reads and writes no memory and is not explained", async () => {
    const t = rig({ rounds: [[say("one")], [edit("src/a.js", "user.name", "user?.name"), say("two")]], values: { "memory.recallLength": "long", "teach.yourTurn": true } });
    await t.start("add a page");
    const before = t.projectFile();
    t.events.length = 0;
    await t.start("keep it shorter please", { offTheRecord: true }); await Bun.sleep(100);
    expect(t.engine.calls[1].memory ?? "").toBe("");
    expect(t.projectFile()).toBe(before);
    expect(t.profileFile()).toBe("");
    expect(of(t.events, "memory.saved")).toEqual([]);
    expect(t.calls.length).toBe(0);
  });
});
