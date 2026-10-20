// Seeded broken projects, end to end: the real agent runner, the real ladder, a scripted Claude.
// Each broken case must never reach "Done"; its fixed twin must. So we know the checks are not just always saying no.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-seed-${l}-`))); made.push(d); return d; };
const write = (file_path: string, content: string, costUsd = 0.01): Step => ({ tool: { name: "Write", input: { file_path, content } }, costUsd });
const states = (e: Event[]) => e.filter((x) => x.type === "agent.state").map((x: any) => x.state);
const results = (e: Event[]) => e.filter((x) => x.type === "proof.result") as any[];
const receipt = (e: Event[]) => e.find((x) => x.type === "receipt") as any;

const GOOD_PAGE = "<!doctype html><h1>Hello from Companion</h1><p>hi</p>";
const BAD_PAGE = "<!doctype html><h1>Hello</h1><script>nothing.here.is.defined()</script>";
const SERVER = (status: number) => `Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => new Response("<h1>Hello from the server</h1>", { status: ${status}, headers: { "content-type": "text/html" } }) });`;
const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: "x", version: "1.0.0", scripts });
const TESTS = (n: number, failFirst = false) => `import { test, expect } from "bun:test";\n` + Array.from({ length: n }, (_, i) => `test("t${i}", () => { expect(1).toBe(${failFirst && i === 0 ? 2 : 1}); });`).join("\n");

async function go(initial: Record<string, string>, rounds: Step[][]) {
  const project = tmp("p");
  for (const [p, c] of Object.entries(initial)) { mkdirSync(join(project, p, ".."), { recursive: true }); writeFileSync(join(project, p), c); }
  const events: Event[] = [];
  const log = new TaskLog(":memory:");
  const engine = new ScriptedEngine(rounds);
  // A task that changes the project's scripts asks before the check runs them (they run outside the sandbox): here the
  // person says yes, as these cases are about what the checks find.
  const runner: AgentRunner = new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e) => { events.push(e); if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "y", type: "approval.resolve", approval: (e as any).approval, decision: "allow", scope: "once" }), 0); } });
  await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "make it work", model: "m", budgetUsd: 3 });
  return { events, log, engine, project };
}
const notDone = (r: Awaited<ReturnType<typeof go>>) => {
  expect(states(r.events)).not.toContain("done");
  expect(states(r.events).at(-1)).toBe("error");
  expect(r.log.list()[0].status).toBe("not_done");
  expect(receipt(r.events).proof).toBe("failed");
};
const done = (r: Awaited<ReturnType<typeof go>>) => {
  expect(states(r.events).at(-1)).toBe("done");
  expect(r.log.list()[0].status).toBe("done");
  expect(receipt(r.events).proof).toBe("passed");
};

describe("a page with an error in its code (only the browser check sees it)", () => {
  test("never done when Claude keeps it broken", async () => {
    const r = await go({ "notes.txt": "x" }, [[write("index.html", BAD_PAGE)], [write("index.html", BAD_PAGE)], [write("index.html", BAD_PAGE)]]);
    notDone(r);
    expect(results(r.events).at(-1).steps.at(-1).rung).toBe("browser");
  }, 120000);
  test("done once Claude fixes it, on the second try", async () => {
    const r = await go({ "notes.txt": "x" }, [[write("index.html", BAD_PAGE)], [write("index.html", GOOD_PAGE)]]);
    done(r);
    expect(results(r.events).map((x) => x.verdict)).toEqual(["failed", "passed"]);
    expect(r.engine.calls[1].prompt).toMatch(/not defined|nothing/i);
  }, 120000);
});

describe("a page that loads fine but breaks when you press its button (found in the first real run)", () => {
  const page = (fn: string) => `<!doctype html><h1>Hello from Companion</h1><button onclick="${fn}()">Launch</button><script>function ok(){ document.title = "ok"; }</script>`;
  test("never done while the button calls something that does not exist", async () => {
    const r = await go({ "notes.txt": "x" }, [[write("index.html", page("launchRocket"))], [write("index.html", page("launchRocket"))], [write("index.html", page("launchRocket"))]]);
    notDone(r);
    expect(JSON.stringify(results(r.events).at(-1).steps)).toContain("launchRocket is not defined");
  }, 120000);
  test("done once the button works", async () => {
    const r = await go({ "notes.txt": "x" }, [[write("index.html", page("launchRocket"))], [write("index.html", page("ok"))]]);
    done(r);
    expect(r.engine.calls[1].prompt).toContain("launchRocket");
  }, 120000);
});

describe("a build that fails", () => {
  const files = (cmd: string) => [write("package.json", pkg({ build: cmd })), write("index.html", GOOD_PAGE)];
  test("never done, and the build's own error reaches Claude", async () => {
    const bad = "sh -c 'echo build exploded >&2; exit 1'";
    const r = await go({ "x.txt": "1" }, [files(bad), files(bad), files(bad)]);
    notDone(r);
    expect(r.engine.calls[1].prompt).toContain("build exploded");
  }, 120000);
  test("done once the build works", async () => {
    const r = await go({ "x.txt": "1" }, [files("sh -c 'echo ok >&2; exit 1'"), files("sh -c 'exit 0'")]);
    done(r);
  }, 120000);
});

describe("a failing build made to pass by checking nothing (found in the first real run)", () => {
  const initial = { "package.json": pkg({ build: "sh -c 'echo broken >&2; exit 1'" }), "index.html": GOOD_PAGE };
  test("is caught, and Claude is told to fix the real problem", async () => {
    const cheat = write("package.json", pkg({ build: "echo Build successful" }));
    const r = await go(initial, [[cheat], [cheat], [cheat]]);
    notDone(r);
    expect(r.engine.calls[1].prompt).toMatch(/checks nothing/);
    expect(r.engine.calls[1].prompt).toMatch(/real problem/);
  }, 120000);
  test("a genuine fix of the build is accepted", async () => {
    const r = await go(initial, [[write("package.json", pkg({ build: "echo Build successful" }))], [write("package.json", pkg({ build: "sh -c 'test -f index.html'" }))]]);
    done(r);
  }, 120000);
});

describe("a server that answers with an error", () => {
  const files = (status: number) => [write("package.json", pkg({ dev: "bun server.js" })), write("server.js", SERVER(status))];
  test("never done while the main page answers 500", async () => {
    const r = await go({ "x.txt": "1" }, [files(500), files(500), files(500)]);
    notDone(r);
    expect(JSON.stringify(results(r.events).at(-1).steps)).toMatch(/500/);
  }, 180000);
  test("done once it answers 200", async () => {
    const r = await go({ "x.txt": "1" }, [files(500), files(200)]);
    done(r);
  }, 180000);
});

describe("a test deleted to make things pass", () => {
  const initial = { "package.json": pkg({ test: "bun test" }), "a.test.ts": TESTS(2, true), "index.html": GOOD_PAGE };
  test("is caught even though the tests now pass", async () => {
    const r = await go(initial, [[write("a.test.ts", TESTS(1))], [write("a.test.ts", TESTS(1))], [write("a.test.ts", TESTS(1))]]);
    notDone(r);
    expect(JSON.stringify(results(r.events).at(-1).steps)).toMatch(/test/i);
  }, 180000);
  test("passes when Claude keeps every test and makes them genuinely pass", async () => {
    const r = await go(initial, [[write("a.test.ts", TESTS(1))], [write("a.test.ts", TESTS(2))]]);
    done(r);
  }, 180000);
});

describe("an earlier server is never mistaken for the new one", () => {
  test("a healthy server already running elsewhere does not rescue a project whose own server crashes", async () => {
    const old = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("<h1>Hello from an old server</h1>", { headers: { "content-type": "text/html" } }) });
    try {
      const crash = [write("package.json", pkg({ dev: "bun server.js" })), write("server.js", "process.exit(1);")];
      const r = await go({ "x.txt": "1" }, [crash, crash, crash]);
      notDone(r);
      expect(results(r.events).at(-1).steps.at(-1).rung).toBe("start");
    } finally { old.stop(true); }
  }, 180000);
});

describe("the receipt tells the truth", () => {
  test("it lists exactly the files that changed", async () => {
    const r = await go({ "keep.txt": "same" }, [[write("index.html", GOOD_PAGE), write("notes/new.md", "hi")]]);
    const names = (receipt(r.events).changed as { file: string }[]).map((c) => c.file).sort();
    expect(names).toEqual(["index.html", "notes/new.md"]);
  }, 120000);
});
