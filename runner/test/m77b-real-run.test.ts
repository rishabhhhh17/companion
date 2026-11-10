// M77b: what the 10 Nov 2026 real run found (docs/status/2026-11-10-real-run.md). Each bug has a test made from the run's
// own inputs (runner/test/fixtures/real-run-1110: the review project, the changes made to it and the words the real model
// wrote), with a stand in model only. Temporary folders only; never a real project, never a real model.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { FastLane, type FastLike } from "../src/lanes.ts";
import { estimateUsd } from "../src/models.ts";
import { ReviewService, type ReviewDeps } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { claimedPassedReason, claimsPassed, weakenedChecks, type FileDelta } from "../src/review/weakened.ts";
import { taskHunks } from "../src/teach.ts";
import { firstFailingTest, plainFailLine } from "../src/proof/failingtest.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { nestedSandbox, SANDBOXED_CHECKS, SANDBOXED_WORDS } from "../src/proof/box.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { RunnerSettings } from "../src/settings.ts";

const FIX = join(import.meta.dir, "fixtures", "real-run-1110");
type Case = { name: string; files: Record<string, string>; realWords: { summary: string; notes: string[]; checks: string; checksNote: string | null } | null };
const REVIEWS = JSON.parse(readFileSync(join(FIX, "reviews.json"), "utf8")) as { base: Record<string, string>; changes: Case[] };
const caseOf = (name: string) => REVIEWS.changes.find((c) => c.name === name)!;

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (label: string) => { const d = mkdtempSync(join(tmpdir(), `companion-test-m77b-${label}-`)); made.push(d); return d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } }

/** The lines one of the run's changes added and removed, as the review measures them (teach.ts taskHunks). */
function deltasOf(c: Case): { deltas: FileDelta[]; after: Record<string, string> } {
  const changed = Object.keys(c.files).map((file) => ({ file, kind: (file in REVIEWS.base ? "modified" : "added") as "modified" | "added" }));
  const after = { ...c.files };
  const deltas: FileDelta[] = [];
  for (const h of taskHunks(changed, REVIEWS.base, after)) {
    let d = deltas.find((x) => x.file === h.file);
    if (!d) { d = { file: h.file, added: [], removed: [] }; deltas.push(d); }
    h.after.forEach((text, i) => d!.added.push({ line: h.afterAt + i, text }));
    h.before.forEach((text, i) => d!.removed.push({ line: h.beforeAt + i, text }));
  }
  return { deltas, after };
}
const delta = (file: string, added: string[], removed: string[] = []): FileDelta => ({ file, added: added.map((text, i) => ({ line: i + 1, text })), removed: removed.map((text, i) => ({ line: i + 1, text })) });

describe("bug 1: a weakened test gets past the review", () => {
  test("the run's exact check swapped for 'not negative' is a weakened check, with its file and line", () => {
    const { deltas, after } = deltasOf(caseOf("review-weakened"));
    const r = weakenedChecks(deltas, after);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "weakened_check", file: "test/price.test.js", line: 6 });
    expect(r[0].say).toContain("swapped for a looser one");
    expect(r[0].say).not.toMatch(/—|–|13|>= 0/);
  });
  test("the run's expected total changed to match the broken price code is a weakened check, with its file and line", () => {
    const { deltas, after } = deltasOf(caseOf("review-weakened-expected"));
    const r = weakenedChecks(deltas, after);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "weakened_check", file: "test/price.test.js", line: 6 });
    expect(r[0].say).toContain("price.js, the code it checks");
    expect(r[0].say).not.toMatch(/\b13\b|\b6\)/);
  });
  test("the run's other two cases still read as before: the skipped test, and the sign in test taken out", () => {
    const skip = deltasOf(caseOf("review-weakened-skip"));
    expect(weakenedChecks(skip.deltas, skip.after).map((x) => [x.file, x.line])).toEqual([["test/price.test.js", 5]]);
    const signIn = deltasOf(caseOf("review-sign-in"));
    const s = weakenedChecks(signIn.deltas, signIn.after);
    expect(s).toHaveLength(1);
    expect(s[0].say).toContain("1 check was removed");
  });
  test("each loose shape is found: toBeTruthy, toBeDefined, greater than zero, not null, a Python assert with no answer", () => {
    for (const [before, after] of [
      ["  expect(total(cart)).toBe(13);", "  expect(total(cart)).toBeTruthy();"],
      ["  expect(total(cart)).toEqual(13);", "  expect(total(cart)).toBeDefined();"],
      ["  expect(total(cart)).toBe(13);", "  expect(total(cart)).toBeGreaterThan(0);"],
      ["  expect(total(cart)).toBe(13);", "  expect(total(cart)).not.toBeNull();"],
      ["  expect(total(cart)).toBe(13);", "  expect(total(cart)).not.toBe(0);"],
      ["  assert.deepStrictEqual(items(cart), [1, 2]);", "  assert.ok(items(cart).length > 0);"],
    ]) expect(weakenedChecks([delta("src/cart.test.ts", [after], [before])]), after).toHaveLength(1);
    expect(weakenedChecks([delta("tests/test_cart.py", ["    assert total(cart) >= 0"], ["    assert total(cart) == 13"])])).toHaveLength(1);
    expect(weakenedChecks([delta("tests/test_cart.py", ["    assert total(cart)"], ["    assert total(cart) == 13"])])).toHaveLength(1);
  });
  test("an exact check kept exact is nothing: renamed, reworded, a new exact value with no code change, a raised bar", () => {
    // One exact check for another.
    expect(weakenedChecks([delta("src/cart.test.ts", ["  expect(total(cart)).toEqual(13);"], ["  expect(total(cart)).toBe(13);"])])).toEqual([]);
    expect(weakenedChecks([delta("test/a.test.js", ["  assert.equal(total(c), 13);"], ["  assert.strictEqual(total(c), 13);"])])).toEqual([]);
    // A loose check made exact.
    expect(weakenedChecks([delta("src/cart.test.ts", ["  expect(total(cart)).toBe(13);"], ["  expect(total(cart)).toBeTruthy();"])])).toEqual([]);
    // The expected value changed, but the code it tests did not change in this batch (a wrong test put right).
    expect(weakenedChecks([delta("test/price.test.js", ["  assert.strictEqual(total(x), 13);"], ["  assert.strictEqual(total(x), 12);"])])).toEqual([]);
    // The code changed, but in a file the test does not check.
    expect(weakenedChecks([delta("test/price.test.js", ["  assert.strictEqual(total(x), 6);"], ["  assert.strictEqual(total(x), 13);"]), delta("src/header.js", ["const title = 'Shop';"], ["const title = 'Mugs';"])], { "test/price.test.js": "const { total } = require('../price.js');\n" })).toEqual([]);
    // A new check added beside the old ones.
    expect(weakenedChecks([delta("src/cart.test.ts", ["  expect(total(cart)).toBe(13);", "  expect(cart).toBeDefined();"], ["  expect(total(cart)).toBe(13);"])])).toEqual([]);
  });
  test("the code under test is found by name or by what the test brings in", () => {
    const changed = (code: string) => [delta("test/totals.test.js", ["  assert.strictEqual(sum(x), 6);"], ["  assert.strictEqual(sum(x), 13);"]), delta(code, ["  return a;"], ["  return a * b;"])];
    expect(weakenedChecks(changed("lib/totals.js"))).toHaveLength(1);
    expect(weakenedChecks(changed("lib/money.js"), { "test/totals.test.js": "import { sum } from '../lib/money';\n" })).toHaveLength(1);
    expect(weakenedChecks(changed("lib/money.js"), { "test/totals.test.js": "import { sum } from '../lib/other';\n" })).toEqual([]);
  });
});

describe("bug 2: the review's own advice is not a claim that the checks pass", () => {
  test("the run's own advice and the sentences like it are not claims; real claims still are", () => {
    for (const t of [
      "Once fixed, run the project's checks again to confirm they pass.",
      "Run the project's checks again to make sure they pass.",
      "Adding the missing closing bracket back should fix it, then run the checks again.",
      "The test was edited to match the new result, so passing checks do not show the total is right.",
      "The test that made sure a wrong password is refused was taken away, so the checks passing does not mean sign in is safe.",
      "Make sure the tests pass before you share it.",
    ]) expect(claimsPassed(t), t).toBe(false);
    for (const t of ["Done. All tests pass.", "I ran the checks and they passed.", "The build is green and the 12 tests pass.", "Tests passing now."]) expect(claimsPassed(t), t).toBe(true);
  });
  test("the run's broken build words with failed checks give no claimed pass reason", () => {
    const w = caseOf("review-broken-build").realWords!;
    expect(w.notes.some((n) => /confirm they pass/.test(n))).toBe(true);
    expect(claimedPassedReason([w.summary], "failed")).toBeNull();
    expect(claimedPassedReason(w.notes, "failed")).toBeNull();
  });
});

// The review end to end, as the run had it: the base project, a starting point, the change, Review now with checks that pass.
type Ev = Record<string, any>;
function rig(o: { words: string; check: ReviewDeps["check"] }) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, REVIEWS.base);
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const lane: FastLike = { run: async () => ({ text: o.words, costUsd: 0.001 }) };
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true };
  const svc = new ReviewService({ emit: (e) => events.push(e), setting: (k) => values[k], store: () => store, cheap: lane, strong: lane, spend: { room: () => 10, book: () => {} }, check: o.check, watch, graceMs: 20, quietMs: () => 30 });
  services.push(svc);
  const of = (t: string) => events.filter((e) => e.type === t);
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const change = (files: Record<string, string>) => { write(project, files); for (const r of Object.keys(files)) send?.(r); };
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  return { project, svc, of, until, change, cmd };
}
const passing: ReviewDeps["check"] = async () => ({ outcome: "ok", reason: "All of the project's own checks passed, and the page opened in a browser." });

describe("bug 1 and 2 end to end: the run's reviews again, with a stand in model", () => {
  for (const name of ["review-weakened", "review-weakened-expected"]) {
    test(`${name}: Fix this first, the weakened check first, with its file and line, though the checks passed`, async () => {
      const c = caseOf(name);
      const t = rig({ words: JSON.stringify({ summary: c.realWords!.summary, notes: c.realWords!.notes, concern: true, concernSay: "Totals will be too low." }), check: passing });
      t.svc.setProject(t.project); await t.svc.ready();
      t.change(c.files);
      await t.until(() => t.of("review.batch").length === 1);
      await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch, proof: true }) as never);
      await t.until(() => t.of("review.result").length === 1);
      const r = t.of("review.result")[0];
      expect(r.checks).toBe("passed");
      expect(r.rating).toBe("stop");
      expect(r.reasons[0]).toMatchObject({ kind: "weakened_check", file: "test/price.test.js", line: 6 });
    });
  }
  test("review-broken-build: the real words with failed checks are not a claimed pass", async () => {
    const c = caseOf("review-broken-build");
    const t = rig({ words: JSON.stringify({ summary: c.realWords!.summary, notes: c.realWords!.notes, concern: true, concernSay: "Order totals will stop working." }), check: async () => ({ outcome: "failing", reason: "The tests did not pass." }) });
    t.svc.setProject(t.project); await t.svc.ready();
    t.change(c.files);
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch, proof: true }) as never);
    await t.until(() => t.of("review.result").length === 1);
    const r = t.of("review.result")[0];
    expect(r.rating).toBe("stop");
    expect(r.reasons.map((x: Ev) => x.kind)).not.toContain("claimed_passed");
    expect(r.reasons.map((x: Ev) => x.kind)).toContain("checks_failed");
  });
});

describe("bug 3: failed checks in plain words, the test runner's output only behind Details", () => {
  const tap = (name: string, project: string) => readFileSync(join(FIX, name), "utf8").split("{{project}}").join(project);
  test("the first failing test is read from the run's own Node output: a test file that could not load, and a failed check", () => {
    expect(firstFailingTest(tap("node-tap-syntax-error.txt", "/Users/sam/shop"), "/Users/sam/shop")).toEqual({ name: "test/price.test.js", file: true });
    expect(firstFailingTest(tap("node-tap-assertion.txt", "/Users/sam/shop"), ["/tmp/x", "/Users/sam/shop"])).toEqual({ name: "adds up an order", file: false });
    expect(firstFailingTest("ok 1 - fine\n1..1\n")).toBeNull();
  });
  test("other runners' shapes: Node's spec report, Jest, Vitest, Bun, pytest and Go", () => {
    expect(firstFailingTest("▶ cart\n  ✖ adds up an order (1.2ms)\n")?.name).toBe("adds up an order");
    expect(firstFailingTest("  ● cart › adds up an order\n\n    expect(received).toBe(expected)")?.name).toBe("cart > adds up an order");
    expect(firstFailingTest(" FAIL  test/cart.test.ts > cart > adds up an order\nAssertionError")?.name).toBe("cart > adds up an order");
    expect(firstFailingTest("(fail) cart > adds up an order [0.40ms]")?.name).toBe("cart > adds up an order");
    expect(firstFailingTest("FAILED tests/test_cart.py::test_total - assert 6 == 13")?.name).toBe("test_total");
    expect(firstFailingTest("--- FAIL: TestTotal (0.00s)")?.name).toBe("TestTotal");
  });
  test("the plain line: which check, the first failing test, and where; never the runner's words", () => {
    const line = plainFailLine({ label: "Running the tests", summary: "The tests did not pass.", test: "test/price.test.js", testIsFile: true, problem: { kind: "line", file: "price.js", line: 3, lineText: "x", message: "SyntaxError", from: "tests" } });
    expect(line).toBe("The tests did not pass. The test file test/price.test.js could not run, because of a problem in price.js, line 3.");
    expect(plainFailLine({ label: "Running the tests", summary: "The tests did not pass.", test: "adds up an order", problem: { kind: "line", file: "test/price.test.js", line: 6, lineText: "x", message: "m", from: "tests" } })).toBe('The tests did not pass. The first test that failed is "adds up an order", at test/price.test.js, line 6.');
    expect(plainFailLine({ label: "The build", summary: "The build did not pass.", problem: { kind: "line", file: "src/App.tsx", line: 4, lineText: "x", message: "m", from: "checks" } })).toBe("The build did not pass. The problem is at src/App.tsx, line 4.");
    expect(plainFailLine({ label: "Running the tests" })).toBe("Running the tests did not pass.");
  });
  test("the tests rung keeps the first failing test from the whole output, and the receipt's steps never carry it", async () => {
    const project = tmp("ladder");
    write(project, { "package.json": JSON.stringify({ name: "shop", scripts: { test: "node --test" } }), "test/price.test.js": "x" });
    const out = tap("node-tap-assertion.txt", project);
    const store = { readFiles: async () => ({ "package.json": JSON.stringify({ name: "shop", scripts: { test: "node --test" } }) }) };
    const res = await runLadder({ project, store: store as never, beforeId: "a", afterId: "b", box: true, noInstall: true, noServer: true,
      run: async (c: string) => (/test/.test(c) ? { code: 1, stdout: out, stderr: "", timedOut: false } : { code: 0, stdout: "", stderr: "", timedOut: false }) as never,
      approvals: { has: () => true, empty: () => false, add: () => {} } as never, askScripts: async () => true });
    const t = res.steps.find((s) => s.rung === "tests")!;
    expect(t.status).toBe("failed");
    expect(t.test).toBe("adds up an order");
  });
  test("a review's checks: the plain line as the reason and the note, the raw output apart (checksDetail)", async () => {
    const project = tmp("rc");
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "node --test" } }));
    const raw = tap("node-tap-syntax-error.txt", project);
    const failed = { rung: "tests", label: "Running the tests", status: "failed", detail: `The tests did not pass. ${raw.split("\n").slice(-14).join("\n")}`, summary: "The tests did not pass.", ms: 1, test: "test/price.test.js", testIsFile: true, problem: { kind: "line", file: "price.js", line: 3, lineText: "x", message: "SyntaxError: missing ) after argument list", from: "tests" } };
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), settings: new RunnerSettings(), emit: () => {}, proof: async () => ({ verdict: "failed", steps: [failed], failedAt: failed }) as never });
    const r = await runner.checkForReview(project, new AbortController().signal, { asked: true }) as { outcome: string; reason: string; detail?: string };
    expect(r.outcome).toBe("failing");
    expect(r.reason).toBe("The tests did not pass. The test file test/price.test.js could not run, because of a problem in price.js, line 3.");
    expect(r.reason).not.toMatch(/failureType|exitCode|ERR_TEST_FAILURE|1\.\.3|# tests/);
    expect(r.detail).toContain("failureType");
  });
});

describe("bug 4: the quick lane books its whole output", () => {
  // The stream as the pinned SDK sends it with partial messages on (stream_event messages, then the assistant message whose
  // usage is from the moment its text ended, then message_delta with the whole count), shaped on the run's weakened test
  // review: 2 input tokens, 1048 written to the cache, 1 output token on the assistant message, a reply of 392 characters.
  const recorded = readFileSync(join(FIX, "review-lane-stream.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const cfg = { claudeBinary: "/x/claude", env: { PATH: "/usr/bin" } };
  const lane = (msgs: unknown[], tail?: Promise<void>) => new FastLane({ ...cfg, model: "claude-sonnet-5-5", queryFn: ((_p: unknown) => (async function* () { for (const m of msgs) yield m; if (tail) await tail; })()) as never });
  test("a raw answer is booked with the output of the message's last count, not the 1 token of its text block", async () => {
    const r = await lane(recorded).run({ text: "x", system: "s", raw: true }, () => {}, new AbortController().signal);
    expect(r.text).toContain('"summary"');
    const whole = estimateUsd("claude-sonnet-5-5", { input_tokens: 2, cache_creation_input_tokens: 1048, cache_read_input_tokens: 0, output_tokens: 118 });
    const before = estimateUsd("claude-sonnet-5-5", { input_tokens: 2, cache_creation_input_tokens: 1048, cache_read_input_tokens: 0, output_tokens: 1 });
    expect(r.costUsd).toBeCloseTo(whole, 6);
    expect(r.costUsd).toBeGreaterThan(before * 1.3);
  });
  test("the answer still comes back at its last count, without waiting for the engine to wind down", async () => {
    let released = false;
    const windDown = new Promise<void>(() => {});
    const r = await lane(recorded, windDown.then(() => { released = true; })).run({ text: "x", system: "s", raw: true }, () => {}, new AbortController().signal);
    expect(r.text.length).toBeGreaterThan(300);
    expect(released).toBe(false);
  });
  test("the result's own total wins when it comes first; a run with no stream events books its message as before", async () => {
    const noDelta = recorded.filter((m: any) => m.event?.type !== "message_delta");
    const r = await lane([...noDelta, { type: "result", subtype: "success", total_cost_usd: 0.0057 }]).run({ text: "x", system: "s", raw: true }, () => {}, new AbortController().signal);
    expect(r.costUsd).toBeCloseTo(0.0057, 6);
    const plain = await lane([{ type: "assistant", message: { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 100, output_tokens: 50 } } }]).run({ text: "x", system: "s", raw: true }, () => {}, new AbortController().signal);
    expect(plain.costUsd).toBeCloseTo(estimateUsd("claude-sonnet-5-5", { input_tokens: 100, output_tokens: 50 }), 6);
  });
});

describe("bug 5: Undo leaves the notes for other AI tools, and the receipt says so", () => {
  // Loaded by path, so the runner's type check does not take in the page's files (as bugbash-memory-runner.test.ts does).
  const MODEL = "../../app/src/model.ts", STRINGS = "../../app/src/strings.ts";
  function memoryRig(rounds: unknown[][]) {
    const project = tmp("mem"), data = tmp("data");
    writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { dev: "vite", test: "vitest" }, dependencies: { react: "1" }, devDependencies: { vite: "1" } }));
    const events: Ev[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds as never), log: new TaskLog(":memory:"), emit: (e) => events.push(e as Ev), memoryDir: data, proof: async () => ({ verdict: "passed", steps: [] }) });
    const start = (prompt: string) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt, model: "m", budgetUsd: 1 } as never);
    return { project, events, runner, start };
  }
  const write = (file: string, content: string) => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });
  test("a fix during which memory wrote AGENTS.md and CLAUDE.md names them on its receipt; Undo puts back only the fix", async () => {
    const t = memoryRig([[write("src/signup.js", "fixed"), { text: "Fixed the sign up form.", costUsd: 0.01 }], [write("src/b.js", "b"), { text: "done", costUsd: 0.01 }]]);
    await t.start("fix the sign up form");
    const rec = t.events.filter((e) => e.type === "receipt")[0];
    expect(rec.changed.map((c: Ev) => c.file)).toEqual(["src/signup.js"]);
    expect(rec.notesStay).toEqual(["AGENTS.md", "CLAUDE.md"]);
    // A later task that did not change them says nothing.
    await t.start("add b");
    expect(t.events.filter((e) => e.type === "receipt")[1].notesStay).toBeUndefined();
    // Undo of the first: the fix goes, the notes stay, as the receipt said.
    await t.runner.handle({ v: 1, id: "u", type: "checkpoint.restore", project: t.project, checkpoint: rec.checkpoint } as never);
    expect(t.events.some((e) => e.type === "checkpoint.restored")).toBe(true);
    expect(existsSync(join(t.project, "src/signup.js"))).toBe(false);
    expect(readFileSync(join(t.project, "AGENTS.md"), "utf8")).toContain("Built with React");
    expect(existsSync(join(t.project, "CLAUDE.md"))).toBe(true);
  });
  test("the page keeps the two names only, and says the plain line", async () => {
    const { initial, reduce } = await import(MODEL) as { initial: () => any; reduce: (m: any, e: unknown) => any };
    const { S } = await import(STRINGS) as { S: any };
    let m = initial();
    m = reduce(m, { v: 1, id: "r", type: "receipt", agent: "b1", checkpoint: "cp_1", changed: [{ file: "src/a.js", kind: "modified" }], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0, notesStay: ["CLAUDE.md", "../x", "AGENTS.md"] });
    expect(m.receipt.notesStay).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(S.guard.notesStay(m.receipt.notesStay)).toBe("Your notes for other AI tools (AGENTS.md, CLAUDE.md) stay.");
  });
});

describe("bug 6: an open table fix is proven only when the database check passes again", () => {
  const writeStep = (file: string, content: string) => ({ tool: { name: "Write", input: { file_path: file, content } }, costUsd: 0.01 });
  // The practice's own shape (app/sample/stuck-open-table): one migration that makes a table with no row level security.
  // The proof stands in for the real ladder: the start and the browser passed, as in both runs, and there are no tests.
  const startAndBrowser = { verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "skipped", detail: "This project has no tests to run.", ms: 1 }, { rung: "start", label: "Starting your app", status: "passed", detail: "It started.", ms: 1 }, { rung: "browser", label: "Opening it in a browser", status: "passed", detail: "The page opened.", ms: 1 }] };
  function dbRig(rounds: unknown[][], open = true) {
    const project = tmp("db");
    write(project, { "package.json": JSON.stringify({ name: "notes", dependencies: { "@supabase/supabase-js": "2" } }), "supabase/migrations/20261001090000_create_notes.sql": `create table notes (id bigint primary key, body text);\n${open ? "" : "alter table notes enable row level security;\n"}` });
    const events: Ev[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds as never), log: new TaskLog(":memory:"), settings: new RunnerSettings(), emit: (e) => events.push(e as Ev), proof: async () => startAndBrowser as never });
    const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "s" + Math.random(), type: "agent.start", project, agent: "b1", mode: "drive", prompt: "Fix the open table", model: "m", budgetUsd: 1, ...extra } as never);
    return { project, events, start };
  }
  test("the run's fix (a new migration that turns row level security on): the check runs again, passes, and it is proven", async () => {
    const t = dbRig([[writeStep("supabase/migrations/20261003090000_notes_row_level_security.sql", "alter table notes enable row level security;\ncreate policy \"own notes\" on notes for select using (auth.uid() = owner);\n"), { text: "I haven't re-run Squibby's check, so I haven't confirmed the fix works.", costUsd: 0.01 }]]);
    await t.start({ practice: "open-table" });
    const rec = t.events.find((e) => e.type === "receipt")!;
    expect(rec.proof).toBe("passed");
    const steps = t.events.filter((e) => e.type === "proof.result").at(-1)!.steps;
    expect(steps.at(-1)).toMatchObject({ label: "Database access is protected", status: "passed" });
  });
  test("a fix that leaves the table open is partly proven, with the honest line, never proven", async () => {
    const t = dbRig([[writeStep("supabase/seed.sql", "insert into notes values (1, 'hi');\n"), { text: "Done.", costUsd: 0.01 }]]);
    await t.start();
    const rec = t.events.find((e) => e.type === "receipt")!;
    expect(rec.proof).toBe("partial");
    const result = t.events.filter((e) => e.type === "proof.result").at(-1)!;
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.steps.at(-1)).toMatchObject({ label: "Database access is protected", status: "skipped", detail: "The database check still finds a table open to anyone on the fixed copy, so this fix is only partly proven." });
  });
  test("a fix in a project whose tables were already protected, or that did not touch the database, is checked as before", async () => {
    const safe = dbRig([[writeStep("supabase/migrations/20261004090000_add_title.sql", "alter table notes add column title text;\n"), { text: "Done.", costUsd: 0.01 }]], false);
    await safe.start();
    expect(safe.events.find((e) => e.type === "receipt")!.proof).toBe("passed");
    expect(safe.events.filter((e) => e.type === "proof.result").at(-1)!.steps.some((s: Ev) => s.label === "Database access is protected")).toBe(false);
    const other = dbRig([[writeStep("src/App.jsx", "export default () => null;\n"), { text: "Done.", costUsd: 0.01 }]]);
    await other.start();
    expect(other.events.find((e) => e.type === "receipt")!.proof).toBe("passed");
  });
});

describe("bug 7: a receipt that ends on a question starts at a sentence, keeping the cause", () => {
  // The run kept the last 599 characters of the rescue's answer, which began mid sentence. The start of the answer was not
  // kept by the run, so the first sentences here are written to the same shape: the cause, then what was done.
  const realTail = readFileSync(join(FIX, "rescue-said-tail.txt"), "utf8").trim().replace(/^…/, "");
  const whole = `The app stops at start because config.js reads SUPABASE_URL and it is not set on this Mac. I added a clear message in config.js so a missing setting is named when the app starts, instead of letting the health ${realTail}`;
  test("the run's answer keeps its first sentence and the question, in whole sentences", async () => {
    const { saidLine, MAX_SAID_CHARS } = await import("../src/asks.ts");
    expect(Array.from(whole).length).toBeGreaterThan(MAX_SAID_CHARS);
    const s = saidLine(whole);
    expect(Array.from(s).length).toBeLessThanOrEqual(MAX_SAID_CHARS);
    expect(s.startsWith("The app stops at start because config.js reads SUPABASE_URL")).toBe(true);
    expect(s.endsWith("What is your Supabase project's web address?")).toBe(true);
    expect(s).not.toMatch(/… ?check pass while/);
    // After the gap, each part starts a sentence.
    const after = s.split(" … ")[1];
    expect(after).toMatch(/^[A-Z]/);
  });
  test("with a first sentence too long to keep, it still starts at a sentence", async () => {
    const { saidLine } = await import("../src/asks.ts");
    const s = saidLine(`${"Long cause words ".repeat(20).trim()}. ${"Some step was done here. ".repeat(30)}Which email address should the messages go to?`);
    expect(s.startsWith("… Some step")).toBe(true);
    expect(s.endsWith("go to?")).toBe(true);
  });
});

describe("bug 9: inside another app's sandbox the review names that, not Claude", () => {
  const thrower = async () => { throw new Error("sandbox_apply: Operation not permitted"); };
  test("the checks say the sandbox is the cause, and only when it is", async () => {
    const project = tmp("sb");
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "shop", scripts: { test: "node --test" } }));
    const make = (inside: boolean) => new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), settings: new RunnerSettings(), emit: () => {}, proof: thrower as never, sandboxed: async () => inside });
    const inBox = await make(true).checkForReview(project, new AbortController().signal, { asked: true }) as { outcome: string; reason: string };
    expect(inBox).toEqual({ outcome: "unknown", reason: SANDBOXED_CHECKS });
    expect(inBox.reason).not.toMatch(/Try again/);
    expect((await make(false).checkForReview(project, new AbortController().signal, { asked: true }) as { reason: string }).reason).toBe("The checks could not run, so this is not proven yet. Try again.");
  });
  test("the review's words say the sandbox, not that Claude could not be reached", async () => {
    for (const inside of [true, false]) {
      const project = tmp("sbr"), shadow = tmp("sbs");
      write(project, REVIEWS.base);
      const store = new CheckpointStore(join(shadow, "p.git"), project);
      const events: Ev[] = [];
      const hub: { send: ((rel: string) => void) | null } = { send: null };
      const lane: FastLike = { run: async () => { throw new Error("no_connection: Claude Code could not start"); } };
      const svc = new ReviewService({ emit: (e) => events.push(e), setting: (k) => ({ "review.mode": "ask", "flow.on": true } as Record<string, unknown>)[k], store: () => store, cheap: lane, strong: lane, spend: { room: () => 10, book: () => {} }, watch: (_d, on) => { hub.send = on; return { close: () => { hub.send = null; } }; }, graceMs: 20, quietMs: () => 30, sandboxed: async () => inside });
      services.push(svc);
      svc.setProject(project); await svc.ready();
      write(project, { "index.html": "<p>new</p>\n" }); hub.send?.("index.html");
      for (let i = 0; i < 400 && !events.some((e) => e.type === "review.batch"); i++) await sleep(20);
      await svc.handle({ v: PROTOCOL_VERSION, id: "n", type: "review.now", project, batch: events.find((e) => e.type === "review.batch")!.batch } as never);
      const r = events.find((e) => e.type === "review.result")!;
      expect(r.note).toBe(inside ? SANDBOXED_WORDS : "Claude could not be reached, so these are the rules' own words.");
    }
  });
  test("the real question is asked once and answers yes or no", async () => {
    const a = await nestedSandbox(), b = await nestedSandbox();
    expect(typeof a).toBe("boolean");
    expect(b).toBe(a);
  });
});
