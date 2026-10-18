// The whole ladder, on small real projects that are healthy or broken in one known way.
// Nothing here downloads anything: the "projects" use Bun's own server and Bun's test runner.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { needsInstall, runLadder, type StepUpdate } from "../src/proof/ladder.ts";
import type { RunResult } from "../src/proof/exec.ts";
import { failureSignature } from "../src/drive.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-ladder-"))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };
const drop = (root: string, ...paths: string[]) => { for (const p of paths) rmSync(join(root, p), { force: true }); };

// "Before" is what the project was; "after" is what the task left. The ladder compares them.
async function scenario(before: Record<string, string>, change: (dir: string) => void, limits = {}, extra: Record<string, unknown> = {}) {
  const dir = tmp();
  put(dir, before);
  const store = new CheckpointStore(tmp(), dir);
  const b = await store.snapshot("before");
  change(dir);
  const a = await store.snapshot("after");
  const updates: StepUpdate[] = [];
  const result = await runLadder({ project: dir, store, beforeId: b.id, afterId: a.id, onStep: (u) => updates.push(u), limits: { checkMs: 15000, testMs: 30000, installMs: 15000, startMs: 15000, browserMs: 15000, ...limits }, ...extra });
  return { result, updates, dir };
}
const GOOD_PAGE = "<!doctype html><h1>Hello from Companion</h1><p>hi</p>";
const BAD_PAGE = "<!doctype html><h1>Hello</h1><script>nothing.here.is.defined()</script>";
const SERVER = (status: number) => `Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response("<h1>Hello from the server</h1>", { status: ${status}, headers: { "content-type": "text/html" } }) });`;
const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "x", version: "1.0.0", scripts });
const TESTS = (n: number, fail = false) => `import { test, expect } from "bun:test";\n` + Array.from({ length: n }, (_, i) => `test("t${i}", () => { expect(1).toBe(${fail && i === 0 ? 2 : 1}); });`).join("\n");

describe("a healthy project reaches the end", () => {
  test("a plain web page: it opens, nothing is wrong, verdict passed", async () => {
    const { result } = await scenario({ "notes.txt": "start" }, (d) => put(d, { "index.html": GOOD_PAGE }));
    expect(result.verdict).toBe("passed");
    expect(result.steps.find((s) => s.rung === "browser")?.status).toBe("passed");
  }, 60000);
  test("a project with a build, tests and a server passes every rung", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, {
      "package.json": pkg({ build: "sh -c 'exit 0'", test: "bun test", dev: "bun server.js" }), "server.js": SERVER(200), "a.test.ts": TESTS(2),
    }), {}, {});
    if (result.verdict !== "passed") console.log(JSON.stringify(result.steps.filter((s) => s.status === "failed")));
    expect(result.steps.map((s) => [s.rung, s.status])).toEqual([["install", "skipped"], ["checks", "passed"], ["tests", "passed"], ["start", "passed"], ["browser", "passed"]]);
    expect(result.verdict).toBe("passed");
  }, 90000);
});

describe("a broken project never reaches 'passed'", () => {
  test("a build that fails stops the ladder there, with the error text", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ build: "sh -c 'echo build exploded >&2; exit 1'" }), "index.html": GOOD_PAGE }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.detail).toContain("build exploded");
    expect(result.steps.some((s) => s.rung === "browser")).toBe(false);
  }, 60000);
  test("a web page with an error in its code fails at the browser check", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "index.html": BAD_PAGE }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("browser");
    expect(result.failedAt?.detail).toMatch(/nothing/);
  }, 60000);
  test("a server that answers with an error fails at the browser check", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ dev: "bun server.js" }), "server.js": SERVER(500) }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("browser");
    expect(result.failedAt?.detail).toContain("500");
  }, 60000);
  test("a server that crashes on start fails at the start rung", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ dev: "bun server.js" }), "server.js": 'throw new Error("cannot start: missing config");' }));
    expect(result.failedAt?.rung).toBe("start");
    expect(result.failedAt?.detail).toContain("missing config");
  }, 60000);
  test("tests that fail fail the ladder before the page is opened", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ test: "bun test" }), "a.test.ts": TESTS(2, true), "index.html": GOOD_PAGE }));
    expect(result.failedAt?.rung).toBe("tests");
    expect(result.steps.some((s) => s.rung === "start")).toBe(false);
  }, 60000);
  test("a task that deleted a test to make things pass is caught, even though the tests now pass", async () => {
    const { result } = await scenario({ "package.json": pkg({ test: "bun test" }), "a.test.ts": TESTS(2, true) }, (d) => put(d, { "a.test.ts": TESTS(1) }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.rung).toBe("tests");
    expect(result.failedAt?.detail).toMatch(/fewer tests/i);
  }, 60000);
  test("a task that removed a whole test file is named", async () => {
    const { result } = await scenario({ "package.json": pkg({ test: "bun test" }), "a.test.ts": TESTS(2), "b.test.ts": TESTS(2) }, (d) => drop(d, "b.test.ts"));
    expect(result.failedAt?.detail).toContain("b.test.ts");
  }, 60000);
  test("a check that runs forever is stopped and reported as too slow", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ build: "sleep 30" }) }), { checkMs: 700 });
    expect(result.failedAt?.rung).toBe("checks");
    expect(result.failedAt?.detail).toMatch(/too long|time/i);
  }, 60000);
});

describe("being honest about what could not be checked", () => {
  test("a folder with nothing to run says so and is not called passed", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "notes.txt": "just words" }));
    expect(result.verdict).toBe("nothing_to_check");
  });
  test("when the hidden browser is missing, the rest still runs and the gap is stated", async () => {
    const skipped = async () => ({ ok: false, skipped: "The hidden browser is not installed yet, so the page was not opened.", problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 0 });
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "index.html": GOOD_PAGE }), {}, { browser: skipped });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.steps.find((s) => s.rung === "browser")).toMatchObject({ status: "skipped" });
    expect(result.steps.find((s) => s.rung === "browser")?.detail).toContain("not installed");
  }, 60000);
  test("a browser that is not installed is named as the reason on the step and on its update, so the page can offer it", async () => {
    const notThere = async () => ({ ok: false, skipped: "The hidden browser is not installed yet, so the page was not opened.", notInstalled: true as const, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 0 });
    const { result, updates } = await scenario({ "x.txt": "1" }, (d) => put(d, { "index.html": GOOD_PAGE }), {}, { browser: notThere });
    expect(result.verdict).toBe("passed_with_gaps");
    expect(result.steps.find((s) => s.rung === "browser")).toMatchObject({ status: "skipped", needs: "browser" });
    expect(updates.find((u) => u.rung === "browser" && u.status === "skipped")).toMatchObject({ needs: "browser" });
  }, 60000);
  test("a browser skipped for another reason (it would not start) does not offer a download", async () => {
    const wontStart = async () => ({ ok: false, skipped: "The hidden browser could not be started (boom), so the page was not opened.", problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 0 });
    const { result, updates } = await scenario({ "x.txt": "1" }, (d) => put(d, { "index.html": GOOD_PAGE }), {}, { browser: wontStart });
    expect(result.steps.find((s) => s.rung === "browser")?.needs).toBeUndefined();
    expect(updates.some((u) => "needs" in u)).toBe(false);
  }, 60000);
});

describe("the install rung", () => {
  const pk = (deps: Record<string, string>) => JSON.stringify({ name: "x", dependencies: deps });
  test("a changed lock file means install", () => expect(needsInstall({ "package.json": pk({}), "bun.lock": "a" }, { "package.json": pk({}), "bun.lock": "b" }, "bun.lock", true)).toBe(true));
  test("changed dependencies mean install", () => expect(needsInstall({ "package.json": pk({}) }, { "package.json": pk({ vite: "^5" }) }, null, true)).toBe(true));
  test("nothing changed means no install", () => expect(needsInstall({ "package.json": pk({ a: "1" }), "bun.lock": "a" }, { "package.json": pk({ a: "1" }), "bun.lock": "a" }, "bun.lock", true)).toBe(false));
  test("dependencies but no node_modules folder means install", () => expect(needsInstall({ "package.json": pk({ a: "1" }) }, { "package.json": pk({ a: "1" }) }, null, false)).toBe(true));
  test("no dependencies and no node_modules folder means no install", () => expect(needsInstall({ "package.json": pk({}) }, { "package.json": pk({}) }, null, false)).toBe(false));
  test("a project without a package file never installs", () => expect(needsInstall({}, { "index.html": "x" }, null, false)).toBe(false));

  test("install runs with the project's own manager when the ingredients changed, and a failed install stops the ladder", async () => {
    const ran: string[] = [];
    const fake = async (cmd: string): Promise<RunResult> => { ran.push(cmd); return { code: cmd.includes("install") ? 1 : 0, signal: null, stdout: "", stderr: "npm ERR! could not resolve nonexistent-pkg", timedOut: false, ms: 5 }; };
    const { result } = await scenario({ "package.json": pk({}) }, (d) => put(d, { "package.json": pk({ "nonexistent-pkg": "1.0.0" }), "package-lock.json": "{}" }), {}, { run: fake });
    expect(ran[0]).toBe("npm install");
    expect(result.failedAt?.rung).toBe("install");
    expect(result.failedAt?.detail).toContain("could not resolve");
    expect(ran.length).toBe(1);
  }, 60000);
});

describe("progress and cleanup", () => {
  test("each rung reports that it is running, then how it ended, in order", async () => {
    const { updates } = await scenario({ "x.txt": "1" }, (d) => put(d, { "index.html": GOOD_PAGE }));
    const seq = updates.map((u) => `${u.rung}:${u.status}`);
    expect(seq.indexOf("start:running")).toBeLessThan(seq.indexOf("start:passed"));
    expect(seq.indexOf("start:passed")).toBeLessThan(seq.indexOf("browser:running"));
    expect(seq.at(-1)).toBe("browser:passed");
  }, 60000);
  test("the server it started is gone afterwards, even when the browser check failed", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ dev: "bun server.js" }), "server.js": SERVER(500) }));
    expect(result.serverUrl).toBeTruthy();
    await Bun.sleep(300);
    const gone = await fetch(result.serverUrl!, { signal: AbortSignal.timeout(800) }).then(() => false, () => true);
    expect(gone).toBe(true);
  }, 60000);
  test("it can be cancelled between rungs", async () => {
    const ac = new AbortController();
    ac.abort();
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "index.html": GOOD_PAGE }), {}, { signal: ac.signal });
    expect(result.verdict).toBe("cancelled");
  }, 60000);
});

describe("a failed rung says where it failed (point at the problem)", () => {
  test("a failing test points at the test's line in the project", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ test: "bun test" }), "src/sum.test.ts": `import { test, expect } from "bun:test";\n\ntest("sum", () => {\n  expect(1 + 1).toBe(3);\n});\n` }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "src/sum.test.ts", line: 4, lineText: "expect(1 + 1).toBe(3);", from: "tests" });
  }, 60000);
  test("a server that crashes on start points at the line that crashed", async () => {
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ dev: "bun server.js" }), "server.js": `const port = Number(process.env.PORT);\nconst config = JSON.parse(\"null\");\nconsole.log(config.name);\n` }));
    expect(result.failedAt?.rung).toBe("start");
    expect(result.failedAt?.problem).toMatchObject({ kind: "line", file: "server.js", line: 3, lineText: "console.log(config.name);" });
  }, 60000);
  test("a check that was weakened has no place to point at, only the words", async () => {
    const { result } = await scenario({ "package.json": pkg({ test: "bun test" }), "a.test.ts": TESTS(3) }, (d) => put(d, { "a.test.ts": TESTS(1) }));
    expect(result.verdict).toBe("failed");
    expect(result.failedAt?.problem).toBeUndefined();
  }, 60000);
  test("when asked not to install, missing packages are named instead of installed", async () => {
    const { result, dir } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": JSON.stringify({ name: "x", version: "1.0.0", dependencies: { "left-pad": "1.3.0" }, scripts: { test: "bun test" } }) }), {}, { noInstall: true });
    expect(result.failedAt?.rung).toBe("install");
    expect(result.failedAt?.problem).toMatchObject({ kind: "message" });
    expect(result.failedAt?.detail).toContain("not installed");
    expect(require("node:fs").existsSync(join(dir, "node_modules"))).toBe(false);
  }, 60000);
});

describe("what a failing check printed is covered before it reaches the card or the model (found by the 15 Oct 2026 review)", () => {
  test("a connection string, a key and a named password in the output of a failing test", async () => {
    const { result, updates } = await scenario({ "x.txt": "1" }, (d) => put(d, {
      "package.json": pkg({ test: "sh -c 'echo DB_PASSWORD=hunter22; echo postgres://user:pa55word@db.example/x; echo STRIPE_WEBHOOK_SECRET=whsec_abcdefghijk; exit 1'" }),
    }));
    expect(result.verdict).toBe("failed");
    const text = JSON.stringify(result.steps) + JSON.stringify(updates);
    for (const secret of ["hunter22", "pa55word", "abcdefghijk"]) expect(text, secret).not.toContain(secret);
  }, 60000);
});

// The fix loop breaker calls two failures the same when the same check failed with the same words (failureSignature). On a
// busy Mac, Node's test runner prints the same failing test with extra frames of its own inside the stack (the timers ran
// late, so their callbacks were run from runNextTicks and processTimers), so the last lines of the output start a few lines
// later and the words differed: the card never appeared for a test that failed the same way three times (found by running
// the loop breaker set under load, 18 Oct 2026). Frames inside the runtime itself never name the person's code.
describe("the same failure reads the same on a busy Mac", () => {
  const tap = (frames: string[], file = "test/store.js:9:10") => [
    "", "> test", "> node --test", "", "TAP version 13", "# Subtest: a saved order shows up in the list", "not ok 1 - a saved order shows up in the list", "  ---",
    "  duration_ms: 8.052792", "  location: '/Users/sam/shop/test/store.js:5:1'", "  failureType: 'testCodeFailure'", "  error: |-", "    Expected values to be strictly equal:", "    ",
    "    0 !== 1", "    ", "  code: 'ERR_ASSERTION'", "  name: 'AssertionError'", "  expected: 1", "  actual: 0", "  operator: 'strictEqual'", "  stack: |-",
    `    TestContext.<anonymous> (/Users/sam/shop/${file})`, ...frames, "  ...", "1..1", "# tests 1", "# suites 0", "# pass 0", "# fail 1", "# cancelled 0", "# skipped 0", "# todo 0", "# duration_ms 113.811042", "",
  ].join("\n");
  const QUIET = ["    async Test.run (node:internal/test_runner/test:632:9)", "    async startSubtest (node:internal/test_runner/harness:214:3)"];
  const BUSY = ["    runNextTicks (node:internal/process/task_queues:60:5)", "    process.processTimers (node:internal/timers:509:9)", ...QUIET];
  const failing = async (stdout: string) => {
    const run = async (cmd: string): Promise<RunResult> => ({ code: /test/.test(cmd) ? 1 : 0, signal: null, stdout: /test/.test(cmd) ? stdout : "", stderr: "", timedOut: false, ms: 5 });
    const { result } = await scenario({ "x.txt": "1" }, (d) => put(d, { "package.json": pkg({ test: "node --test" }), "test/store.js": "require('node:test')('a', () => {});\n" }), {}, { run });
    expect(result.failedAt?.rung).toBe("tests");
    return result.failedAt!;
  };
  test("extra frames from inside the runtime do not make it a different failure", async () => {
    const quiet = await failing(tap(QUIET)), busy = await failing(tap(BUSY));
    expect(failureSignature(busy)).toBe(failureSignature(quiet));
    expect(busy.detail).toBe(quiet.detail);
  }, 60000);
  test("the frame in the person's own code still counts, so a different failing test is a different failure", async () => {
    const store = await failing(tap(BUSY)), cart = await failing(tap(QUIET, "test/cart.js:4:3"));
    expect(failureSignature(cart)).not.toBe(failureSignature(store));
    expect(store.detail).toContain("test/store.js");
  }, 60000);
  test("a frame in a package or in the project's own folder is kept", async () => {
    const mine = await failing(tap(["    at render (/Users/sam/shop/node_modules/react-dom/cjs/react-dom.development.js:12:3)", "    at Object.<anonymous> (/Users/sam/shop/src/app.js:3:1)"]));
    expect(mine.detail).toContain("react-dom.development.js");
    expect(mine.detail).toContain("src/app.js");
  }, 60000);
});
