// QA1 (the 19 Nov 2026 functionality check): the engine side of what it found. A test file at the project root named
// test.js, tests.js, spec.js or test.py is a test; a fix from the review card is named in plain words, never the internal
// request; a review put back counts in the week's Undo count; a change in the moment right after Squibby's own work is
// still reviewed; and the dev demo says a denied command did not run. Temporary folders only, no model.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_FILE, weakenedChecks, type FileDelta } from "../src/review/weakened.ts";
import { taskLabel } from "../src/labels.ts";
import { REVIEW_FIX_INTRO } from "../src/review/sendback.ts";
import { TaskLog } from "../src/tasklog.ts";
import { ChangeBatcher } from "../src/review/batcher.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-qa1-${label}-`)); made.push(d); return d; };
const delta = (file: string, added: string[], removed: string[] = []): FileDelta => ({ file, added: added.map((text, i) => ({ line: i + 1, text })), removed: removed.map((text, i) => ({ line: i + 1, text })) });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("QA1: test files named only test, tests or spec", () => {
  test("test.js, tests.js, spec.js, test.py, tests.py and test.ts are tests, at the root and in a folder", () => {
    for (const f of ["test.js", "tests.js", "spec.js", "test.py", "tests.py", "test.ts", "spec.ts", "test.mjs", "src/test.js", "lib/spec.js"]) expect([f, TEST_FILE.test(f)]).toEqual([f, true]);
  });
  test("ordinary files whose names only contain the word are not tests", () => {
    for (const f of ["latest.js", "contest.py", "testimonial.js", "inspect.js", "respec.js", "attest.ts", "test.html", "test.json"]) expect([f, TEST_FILE.test(f)]).toEqual([f, false]);
  });
  test("deleting every assertion in a root test.js is a weakened check with its file", () => {
    const r = weakenedChecks([delta("test.js", ["// nothing yet"], ["assert.strictEqual(sum(1, 2), 3);", "assert.strictEqual(sum(2, 2), 4);"])]);
    expect(r.map((x) => [x.kind, x.file])).toEqual([["weakened_check", "test.js"]]);
  });
});

describe("QA1: the name of a fix from the review card", () => {
  test("is a short plain name, never the request sent to the model", () => {
    const prompt = `${REVIEW_FIX_INTRO}\n\nThe lines that follow are a report.\n> sum.js line 2: the tests fail.`;
    expect(taskLabel(prompt)).toBe("Fix what the review found");
  });
  test("an ordinary ask keeps its own words", () => {
    expect(taskLabel("Make the Join button green")).toBe("Make the Join button green");
  });
});

describe("QA1: the week's Undo count", () => {
  test("Put these files back on a review counts once, as an undo", () => {
    const log = new TaskLog(join(tmp("data"), "tasks.db"));
    const p = "/Users/x/site";
    const now = new Date("2026-11-19T12:00:00Z");
    log.addReview({ project: p, batch: "b1", at: now.toISOString(), files: ["sum.js"], count: 1, rating: "stop", touches: [], checks: "failed", summary: "x", kinds: ["checks_failed"] });
    expect(log.caught(p, now).undone).toBe(0);
    log.reviewUndone(p, "b1", "cp_0004");
    expect(log.caught(p, now).undone).toBe(1);
    // Another project's put back never counts here.
    expect(log.caught("/Users/x/other", now).undone).toBe(0);
  });
});

describe("QA1: a change right after Squibby's own work", () => {
  const rig = (graceMs: number) => {
    const project = tmp("proj");
    let send: ((rel: string) => void) | null = null;
    const ready: string[][] = [];
    const b = new ChangeBatcher({ project, quietMs: () => 20, graceMs, onReady: (paths) => ready.push(paths), watch: (_d, on) => { send = on; return { close: () => { send = null; } }; } });
    b.start();
    return { b, ready, send: (rel: string) => send!(rel) };
  };
  test("is still handed over once the short grace has passed", async () => {
    const t = rig(80);
    t.b.holdOwn();
    t.send("index.html");
    t.b.releaseOwn();
    await wait(10);
    t.send("sum.js");
    await wait(250);
    expect(t.ready).toEqual([["sum.js"]]);
    t.b.stop();
  });
  test("Review now in that moment includes it", async () => {
    const t = rig(500);
    t.b.holdOwn();
    t.b.releaseOwn();
    t.send("sum.js");
    expect(t.b.take().paths).toEqual(["sum.js"]);
    t.b.stop();
  });
  test("the engine's own work still never counts while it runs", async () => {
    const t = rig(30);
    t.b.holdOwn();
    t.send("index.html");
    await wait(80);
    expect(t.ready).toEqual([]);
    t.b.releaseOwn();
    await wait(120);
    expect(t.ready).toEqual([]);
    t.b.stop();
  });
  test("a late event for a file the engine's own work wrote is still its own", async () => {
    const t = rig(80);
    t.b.holdOwn();
    t.send("index.html");
    t.b.releaseOwn();
    t.b.takeOwnSeen();
    t.send("index.html");
    await wait(250);
    expect(t.ready).toEqual([]);
    t.b.stop();
  });
});

describe("QA1: the dev demo", () => {
  test("a denied command is said as not run, and the ask ends with one full stop", async () => {
    const p = Bun.spawn(["bun", "scripts/demo.ts"], { cwd: join(import.meta.dir, ".."), env: { ...process.env, DEMO_AUTO: "deny" }, stdout: "pipe", stderr: "pipe" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    expect(out).toContain("Not run: git push origin main");
    expect(out).not.toContain("Did: Running: git push origin main");
    expect(out).not.toMatch(/\.\.\s/);
  }, 60_000);
});

describe("QA1: History can bring a fix back after an Undo from anywhere", () => {
  test("tasks.list names the Undo's safety copy on the undone row, while it is kept, and drops it once the fix is back", async () => {
    const { AgentRunner } = await import("../src/agent.ts");
    const { ScriptedEngine } = await import("../src/engine.ts");
    const { realpathSync, writeFileSync, readFileSync } = await import("node:fs");
    const { parseEvent } = await import("../../protocol/index.ts");
    const project = realpathSync(tmp("proj")); writeFileSync(join(project, "a.txt"), "original");
    const events: any[] = [];
    const runner = new AgentRunner({ shadowRoot: realpathSync(tmp("shadow")), engine: new ScriptedEngine([{ tool: { name: "Write", input: { file_path: "a.txt", content: "fixed" } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => new Date("2026-11-19T12:00:00Z") });
    const list = async () => { const n = events.length; await runner.handle({ v: 1, id: "t", type: "tasks.list", project } as never); return events.slice(n).find((e) => e.type === "tasks.list"); };
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 } as never);
    const cp = events.find((e) => e.type === "checkpoint.created").checkpoint;
    expect((await list()).tasks[0].undoSafety).toBeUndefined();
    await runner.handle({ v: 1, id: "r1", type: "checkpoint.restore", project, checkpoint: cp } as never);
    const safety = events.find((e) => e.type === "checkpoint.restored").safety;
    const after = await list();
    expect(after.tasks[0]).toMatchObject({ undone: true, undoSafety: safety });
    expect(parseEvent(JSON.stringify({ v: 1, id: "x", ...after })).ok).toBe(true);
    await runner.handle({ v: 1, id: "r2", type: "checkpoint.restore", project, checkpoint: safety } as never);
    expect(readFileSync(join(project, "a.txt"), "utf8")).toBe("fixed");
    const back = await list();
    expect(back.tasks[0]).toMatchObject({ undone: true, back: true });
    expect(back.tasks[0].undoSafety).toBeUndefined();
  });
  // Bringing back restores the whole project as it was just before that Undo, so it is named only while that Undo is the
  // newest change: a later task that changed files would be taken away (and marked undone) by the restore.
  const setup = async (rounds: any[][]) => {
    const { AgentRunner } = await import("../src/agent.ts");
    const { ScriptedEngine } = await import("../src/engine.ts");
    const { realpathSync, writeFileSync } = await import("node:fs");
    const project = realpathSync(tmp("proj")); writeFileSync(join(project, "a.txt"), "original");
    const events: any[] = [];
    const runner = new AgentRunner({ shadowRoot: realpathSync(tmp("shadow")), engine: new ScriptedEngine(rounds), log: new TaskLog(":memory:"), emit: (e) => events.push(e), now: () => new Date("2026-11-19T12:00:00Z") });
    const list = async () => { const n = events.length; await runner.handle({ v: 1, id: "t", type: "tasks.list", project } as never); return events.slice(n).find((e) => e.type === "tasks.list"); };
    let k = 0;
    const start = async (prompt: string) => { const n = events.length; await runner.handle({ v: 1, id: `c${++k}`, type: "agent.start", project, agent: `b${k}`, mode: "drive", prompt, model: "m", budgetUsd: 3 } as never); return events.slice(n).find((e) => e.type === "checkpoint.created").checkpoint as string; };
    const restore = async (checkpoint: string) => { const n = events.length; await runner.handle({ v: 1, id: `r${++k}`, type: "checkpoint.restore", project, checkpoint } as never); return events.slice(n).find((e) => e.type === "checkpoint.restored")?.safety as string; };
    return { project, list, start, restore };
  };
  const write = (file: string, content: string) => [{ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }];
  test("once a later task changed files, the older Undo's safety copy is no longer named, so nothing offers to take that work away", async () => {
    const t = await setup([write("a.txt", "fixed"), write("b.txt", "later work")]);
    const cp = await t.start("fix a");
    await t.restore(cp);
    expect((await t.list()).tasks[0].undoSafety).toBeString();
    await t.start("add b");
    const now = await t.list();
    expect(now.tasks.map((x: any) => [x.label, x.undone ?? false, x.undoSafety ?? null])).toEqual([["add b", false, null], ["fix a", true, null]]);
  });
  test("one Undo that took back two tasks names its safety copy once, on the newest of them", async () => {
    const t = await setup([write("a.txt", "fixed"), write("b.txt", "more")]);
    const first = await t.start("fix a");
    await t.start("add b");
    const safety = await t.restore(first);
    const now = await t.list();
    expect(now.tasks.map((x: any) => [x.label, x.undone ?? false, x.undoSafety ?? null])).toEqual([["add b", true, safety], ["fix a", true, null]]);
  });
});
