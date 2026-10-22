// Teaching inside the fix, in the runner: Explain is built from the task's real change (for every Drive step too), the
// receipt names the first changed line for "Show me what changed", and "your turn" lets the person make the second of two
// identical changes themselves, then checks it with the proof ladder. The fast lane and the checks are stand ins here.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AgentRunner, type ProofContext } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { parseEvent, serialize, type Event } from "../../protocol/index.ts";
import { PRODUCT } from "../src/names.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-teach-${l}-`))); made.push(d); return d; };
const say = (text: string): Step => ({ text, costUsd: 0.01 });
const edit = (file_path: string, old_string: string, new_string: string): Step => ({ tool: { name: "Edit", input: { file_path, old_string, new_string } }, costUsd: 0.01 });
const write = (file_path: string, content: string): Step => ({ tool: { name: "Write", input: { file_path, content } }, costUsd: 0.01 });
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const passed = (): LadderResult => ({ verdict: "passed", steps: [] });
const GOOD = '{"why":["The page read the name before the user had loaded.","The ? skips the name until there is a user."],"question":{"text":"What does the ? do?","options":["Skips the name when there is no user","Makes the page faster"],"correct":0}}';

const A = "import x\nconst n = user.name;\nend\n";
const B = "function t() {\n  return title(user.name);\n}\n";

type Opts = { rounds: Step[][]; files?: Record<string, string>; explain?: string | null; proofs?: (ctx: ProofContext) => Promise<LadderResult>; noMemory?: boolean };
function setup(o: Opts) {
  const project = tmp("p"), data = tmp("d"), events: Event[] = [];
  for (const [f, t] of Object.entries(o.files ?? { "src/a.js": A, "src/b.js": B })) { mkdirSync(dirname(join(project, f)), { recursive: true }); writeFileSync(join(project, f), t); }
  const calls: { text: string; system: string }[] = [];
  const proofCalls: ProofContext[] = [];
  const engine = new ScriptedEngine(o.rounds);
  const explainer = o.explain === null ? undefined : async (req: { text: string; system: string }) => { calls.push(req); return { text: o.explain ?? GOOD, costUsd: 0.002 }; };
  // Your turn is off unless the person turns it on (teach.yourTurn), and the engine works out an offer only when it is on;
  // it is on here, where Your turn is what is tested (settings-memory.test.ts tests it off).
  const settings = new RunnerSettings();
  settings.apply({ v: 1, id: "s", type: "settings.apply", values: { "teach.yourTurn": true } });
  const runner = new AgentRunner({ settings, shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => { events.push(e); if (e.type === "approval.request" && (e as any).risk === "settings") setTimeout(() => void runner.handle({ v: 1, id: "a" + Math.random(), type: "approval.resolve", approval: (e as any).approval, decision: "allow", scope: "once" } as never), 0); }, ...(o.noMemory ? {} : { memoryDir: data }), explainer, proof: async (ctx) => { proofCalls.push(ctx); return o.proofs ? o.proofs(ctx) : passed(); } });
  const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt: "fix the name", model: "m", budgetUsd: 1, ...extra } as never);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  const read = (f: string) => readFileSync(join(project, f), "utf8");
  return { project, events, calls, proofCalls, engine, runner, start, cmd, read };
}
const bothPlaces: Step[] = [edit("src/a.js", "user.name", "user?.name"), edit("src/b.js", "user.name", "user?.name"), say("I made the name safe in both places.")];

describe("Explain is built from the real change", () => {
  test("the lines taken away and added reach the request, with the file", async () => {
    const t = setup({ rounds: [[edit("src/a.js", "const n = user.name;", "const n = user?.name;"), say("Fixed.")]] });
    await t.start(); await Bun.sleep(100);
    expect(t.calls.length).toBe(1);
    expect(t.calls[0].text).toContain("--- src/a.js");
    expect(t.calls[0].text).toContain("- const n = user.name;");
    expect(t.calls[0].text).toContain("+ const n = user?.name;");
    expect(of(t.events, "explain.ready")[0].bullets.length).toBe(2);
  });
  // (A key, token or password name is refused by the settings guard before it can be written, so the secret here is a value.)
  test("secrets, settings files and key files never reach it", async () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyzQRS\n-----END RSA PRIVATE KEY-----\n";
    const t = setup({ rounds: [[write(".env", "SHOP_NAME=sk_live_abcdefghijklmnop9999\nDB_URL=postgres://me:pw12345@db/x\n"), write("src/config.js", "export const key = \"sk_live_abcdefghijklmnop1234\";\nexport const site = \"shop\";\n"), write("certs/site.pem", pem), write("src/k.js", "const k = `" + pem + "`;\n"), say("Added the settings.")]] });
    await t.start(); await Bun.sleep(100);
    const text = t.calls[0].text;
    for (const leak of ["sk_live_abcdef", "SHOP_NAME=", "pw12345", "MIIEowIBAAKCAQEA", "DB_URL"]) expect(text, leak).not.toContain(leak);
    expect(text).toMatch(/\.env \(a settings or key file, not shown\)/);
    expect(text).toContain("export const site");
  });
  test("every Drive step gets its own explanation, named by its step", async () => {
    const plan = say('Here is the plan:\n```json\n["Fix the first name","Fix the second name"]\n```');
    // Without memory here: approving a plan writes the shared AGENTS.md just before the plan's watcher starts, and a late file
    // event for it can pause the plan as if the person had changed it (a separate race, reported, not part of this change).
    const t = setup({ rounds: [[plan], [edit("src/a.js", "user.name", "user?.name"), say("One.")], [edit("src/b.js", "user.name", "user?.name"), say("Two.")]], noMemory: true });
    await Bun.sleep(400);   // the project's files are a moment old, like real ones, so the plan's watcher does not take them for the person's
    await t.cmd({ type: "drive.plan", agent: "b1", goal: "fix the names", model: "m", budgetUsd: 3 });
    const going = t.cmd({ type: "drive.approve", agent: "b1", steps: ["Fix the first name", "Fix the second name"] });
    await going;
    await Bun.sleep(150);
    expect(t.calls.length).toBe(2);
    expect(t.calls[0].text).toContain("src/a.js"); expect(t.calls[0].text).not.toContain("src/b.js");
    expect(t.calls[1].text).toContain("src/b.js");
    const ex = of(t.events, "explain.ready");
    expect(ex.map((e) => e.step)).toEqual([{ index: 1, title: "Fix the first name" }, { index: 2, title: "Fix the second name" }]);
    const receipts = of(t.events, "receipt");
    expect(ex.map((e) => e.checkpoint)).toEqual(receipts.map((r) => r.checkpoint));
  });
  test("its cost counts in today's spending", async () => {
    const t = setup({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]] });
    await t.start(); await Bun.sleep(100);
    await t.cmd({ type: "spending.show" });
    expect(of(t.events, "spending.state").at(-1).spentUsd).toBeCloseTo(0.022, 6);
  });
  test("a malformed check question is dropped and the two lines still arrive", async () => {
    const t = setup({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("Fixed.")]], explain: '{"why":["One.","Two."],"question":{"text":"Q?","options":["a","b","c","d"],"correct":0}}' });
    await t.start(); await Bun.sleep(100);
    const e = of(t.events, "explain.ready")[0];
    expect(e.bullets).toEqual(["One.", "Two."]); expect(e.question).toBeUndefined();
  });
});

describe("Show me what changed", () => {
  test("the receipt names the first changed line in the file as it is now", async () => {
    const t = setup({ rounds: [[edit("src/b.js", "  return title(user.name);", "  return title(user?.name);"), say("Fixed.")]] });
    await t.start();
    expect(of(t.events, "receipt")[0].changedAt).toEqual({ file: "src/b.js", line: 2, lineText: "return title(user?.name);" });
  });
  test("a change only to a settings file has no line to show", async () => {
    const t = setup({ rounds: [[write(".env", "A=1\n"), say("Set.")]] });
    await t.start();
    const r = of(t.events, "receipt")[0];
    expect(r.changed.length).toBe(1); expect(r.changedAt).toBeUndefined();
  });
});

describe("your turn: the same change in two places", () => {
  test("a proven fix that made the same change twice offers it on the receipt", async () => {
    const t = setup({ rounds: [bothPlaces] });
    await t.start();
    const r = of(t.events, "receipt")[0];
    expect(r.repeat).toEqual({ first: { file: "src/a.js", line: 2, lineText: "const n = user?.name;" }, second: { file: "src/b.js", line: 2, lineText: "return title(user?.name);" }, was: "user", now: "user?" });
  });
  test("not offered when the checks failed, off the record, or for a single change", async () => {
    const failed = setup({ rounds: [bothPlaces, [say("x")], [say("y")]], proofs: async () => ({ verdict: "failed", steps: [{ rung: "tests", label: "Tests", status: "failed", detail: "no", ms: 1 }] }) });
    await failed.start();
    expect(of(failed.events, "receipt")[0].repeat).toBeUndefined();
    const off = setup({ rounds: [bothPlaces] });
    await off.start({ offTheRecord: true });
    expect(of(off.events, "receipt")[0].repeat).toBeUndefined();
    const one = setup({ rounds: [[edit("src/a.js", "user.name", "user?.name"), say("x")]] });
    await one.start();
    expect(of(one.events, "receipt")[0].repeat).toBeUndefined();
  });

  const tried = async () => {
    const t = setup({ rounds: [bothPlaces] });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    await t.cmd({ type: "teach.try", checkpoint: cp });
    return { ...t, cp, ready: of(t.events, "teach.ready").at(-1) };
  };
  test("trying puts only the second place back as it was, after a snapshot, and says where it is", async () => {
    const t = await tried();
    expect(t.ready.made).toBe(true);
    expect(t.read("src/a.js")).toBe("import x\nconst n = user?.name;\nend\n");
    expect(t.read("src/b.js")).toBe(B);
    expect(t.ready.target).toEqual({ file: "src/b.js", line: 2, lineText: "return title(user.name);" });
    expect(t.ready.example).toEqual({ file: "src/a.js", line: 2, was: "const n = user.name;", now: "const n = user?.name;" });
    expect(t.ready.change).toEqual({ was: "user", now: "user?" });
    expect(typeof t.ready.restore).toBe("string");
    // The restore point holds the whole fix, so "Put my fix back" can return to it.
    await t.cmd({ type: "checkpoint.restore", checkpoint: t.ready.restore });
    expect(t.read("src/b.js")).toBe("function t() {\n  return title(user?.name);\n}\n");
  });
  test("a file changed since the fix is left alone", async () => {
    const t = setup({ rounds: [bothPlaces] });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    writeFileSync(join(t.project, "src/b.js"), "// mine\n" + t.read("src/b.js"));
    await t.cmd({ type: "teach.try", checkpoint: cp });
    const r = of(t.events, "teach.ready").at(-1);
    expect(r.made).toBe(false); expect(r.reason).toMatch(/changed/i);
    expect(t.read("src/b.js")).toContain("// mine");
  });
  test("an old or unknown change is refused, and so is a second try of the same one", async () => {
    const t = await tried();
    await t.cmd({ type: "teach.try", checkpoint: t.cp });
    expect(of(t.events, "teach.ready").at(-1).made).toBe(false);
    await t.cmd({ type: "teach.try", checkpoint: "cp_9999" });
    expect(of(t.events, "teach.ready").at(-1).made).toBe(false);
  });
  test("checking runs the proof ladder on the person's own change, and says whether it matches the fix", async () => {
    const t = await tried();
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title( user?.name );\n}\n");
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: t.cp });
    const r = of(t.events, "teach.result").at(-1);
    expect(r).toMatchObject({ verdict: "passed", same: true, checkpoint: t.cp });
    const ctx = t.proofCalls.at(-1)! as ProofContext & { noInstall?: boolean };
    expect(ctx.noInstall).toBe(true);
    expect(ctx.beforeId).not.toBe(ctx.afterId);   // the tamper guard compares their change with what they were given
  });
  test("checking before the person changed anything says so, and runs no checks", async () => {
    const t = await tried();
    const checksBefore = t.proofCalls.length;
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: t.cp });
    const r = of(t.events, "teach.result").at(-1);
    expect(r).toMatchObject({ verdict: "cancelled", same: false, checkpoint: t.cp });
    expect(r.reason).toBe("You have not changed that line yet.");
    expect(t.proofCalls.length).toBe(checksBefore);
    // A change to some other line is not a change to theirs either.
    writeFileSync(join(t.project, "src/b.js"), "// mine\n" + B);
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: t.cp });
    expect(of(t.events, "teach.result").at(-1).reason).toBe("You have not changed that line yet.");
    expect(t.proofCalls.length).toBe(checksBefore);
  });
  test(`two places close together in one file: the place ${PRODUCT} fixed is never taken for the person's change`, async () => {
    const page = (a: string, b: string) => `<div>\n<p>{${a}}</p>\n<hr/>\n<p>{${b}}</p>\n</div>\n`;
    const t = setup({ files: { "src/page.jsx": page("user.name", "user.name") }, rounds: [[write("src/page.jsx", page("user?.name", "user?.name")), say("Made both safe.")]] });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    expect(of(t.events, "receipt")[0].repeat?.second).toMatchObject({ file: "src/page.jsx", line: 4 });
    await t.cmd({ type: "teach.try", checkpoint: cp });
    expect(t.read("src/page.jsx")).toBe(page("user?.name", "user.name"));
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "teach.result").at(-1)).toMatchObject({ verdict: "cancelled", same: false, reason: "You have not changed that line yet." });
    writeFileSync(join(t.project, "src/page.jsx"), page("user?.name", "user?.name"));
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "teach.result").at(-1)).toMatchObject({ verdict: "passed", same: true });
  });
  test("the person's check says its steps as their own, never as steps of the task's proof", async () => {
    const t = setup({ rounds: [bothPlaces], proofs: async (ctx) => { ctx.onStep({ rung: "tests", label: "Running the tests", status: "running", detail: "", ms: 0 }); ctx.onStep({ rung: "tests", label: "Running the tests", status: "passed", detail: "", ms: 3 }); return passed(); } });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    await t.cmd({ type: "teach.try", checkpoint: cp });
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title(user?.name);\n}\n");
    const taskSteps = of(t.events, "proof.step").length;
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "proof.step").length).toBe(taskSteps);
    const mine = of(t.events, "teach.step");
    expect(mine.map((s) => [s.checkpoint, s.project, s.rung, s.status])).toEqual([[cp, t.project, "tests", "running"], [cp, t.project, "tests", "passed"]]);
    for (const s of mine) expect(parseEvent(serialize(s)).ok).toBe(true);
  });
  test("a different change that fails the checks is said as that, with where it fails", async () => {
    const place = { kind: "line", file: "src/b.js", line: 2, lineText: "return title(user.name);", message: "Cannot read name", from: "tests" };
    let n = 0;
    const t = setup({ rounds: [bothPlaces], proofs: async () => (n++ === 0 ? passed() : { verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "1 failed", ms: 1, problem: place as never }] }) });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    await t.cmd({ type: "teach.try", checkpoint: cp });
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title(user.nam);\n}\n");
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    expect(of(t.events, "teach.result").at(-1)).toMatchObject({ verdict: "failed", same: false, label: "Running the tests", detail: "1 failed", problem: place });
  });
  test("Stop everything ends a check, and after Undo there is nothing left to check", async () => {
    let n = 0;   // the task's own check passes; the check of the person's change waits until it is stopped
    const t = setup({ rounds: [bothPlaces], proofs: (ctx) => new Promise((res) => { if (n++ === 0) return res(passed()); ctx.signal.addEventListener("abort", () => res({ verdict: "cancelled", steps: [] })); }) });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    await t.cmd({ type: "teach.try", checkpoint: cp });
    writeFileSync(join(t.project, "src/b.js"), "function t() {\n  return title(user?.name);\n}\n");
    const check = t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    for (let i = 0; i < 150 && n < 2; i++) await Bun.sleep(20);
    expect(n).toBe(2);   // the check of the person's change is really running
    await t.cmd({ type: "agent.interruptAll", reason: "stop" });
    await check;
    expect(of(t.events, "teach.result").at(-1).verdict).toBe("cancelled");
    expect(of(t.events, "teach.result").at(-1).reason).toBeUndefined();
    await t.cmd({ type: "checkpoint.restore", checkpoint: of(t.events, "teach.ready").at(-1).restore });
    await t.cmd({ type: "teach.check", agent: "b1", checkpoint: cp });
    const last = of(t.events, "teach.result").at(-1);
    expect(last.verdict).toBe("cancelled"); expect(last.reason).toMatch(/nothing/i);
  });
  test("nothing is tried while a task is working on the project", async () => {
    const t = setup({ rounds: [bothPlaces, [{ text: "slow", costUsd: 0.01, delayMs: 300 }]] });
    await t.start();
    const cp = of(t.events, "receipt")[0].checkpoint;
    const running = t.start();
    await Bun.sleep(80);
    await t.cmd({ type: "teach.try", checkpoint: cp });
    expect(of(t.events, "teach.ready").at(-1).made).toBe(false);
    await running;
    expect(existsSync(join(t.project, "src/b.js"))).toBe(true);
  });
});
