// M67 bug bash fixes (shortlist item 8's first half, found in the bug bash): a page behind a sign in the project is known to
// have is a gap in the browser check, never the code's failure, and never "proven" when only the sign in page was seen. In a
// project with no sign in found, a bare 401 or 403 error page is a problem, so a change that broke it is told and fixed; a
// login page, or a 401 that asks for a sign in, is a gap there too (m67-review-findings.test.ts).
// Local pages on 127.0.0.1 only; the fix flow uses the stand in engine (no model) and temporary fixture folders.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserCheck, browserInstalled, knownSignIn } from "../src/proof/browser.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { Event } from "../../protocol/index.ts";

const stops: (() => void)[] = [];
const made: string[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const serve = (fetch: (r: Request) => Response) => { const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch }); stops.push(() => s.stop(true)); return `http://127.0.0.1:${s.port}/`; };
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-signin-${l}-`))); made.push(d); return d; };
const no = !browserInstalled();

test.skipIf(no)("a 401 page is a sign in gap, not a problem", async () => {
  const r = await browserCheck(serve(() => new Response("<h1>Please sign in</h1>", { status: 401, headers: { "content-type": "text/html", "www-authenticate": 'Basic realm="x"' } })), { timeoutMs: 8000, signInExpected: true });
  expect(r.ok).toBe(true);
  expect(r.problems).toEqual([]);
  expect((r.gaps ?? []).join(" ")).toMatch(/sign in/i);
}, 60000);

test.skipIf(no)("a 403 page is a sign in gap too", async () => {
  const r = await browserCheck(serve(() => html("<h1>Forbidden</h1>", 403)), { timeoutMs: 8000, signInExpected: true });
  expect(r.ok).toBe(true);
  expect((r.gaps ?? []).join(" ")).toMatch(/sign in/i);
}, 60000);

test.skipIf(no)("a redirect to a login page with a password field is a gap, so it is never proven", async () => {
  const url = serve((req) => new URL(req.url).pathname === "/login"
    ? html('<h1>Sign in</h1><form><input type="password" name="p"><button type="submit">Sign in</button></form>')
    : new Response(null, { status: 302, headers: { location: "/login" } }));
  const r = await browserCheck(url, { timeoutMs: 8000, signInExpected: true });
  expect((r.gaps ?? []).join(" ")).toMatch(/sign in/i);
}, 60000);

test.skipIf(no)("in a project with no sign in, a 403 on the main page is a problem, as before", async () => {
  const r = await browserCheck(serve(() => html("<h1>Forbidden</h1>", 403)), { timeoutMs: 8000 });
  expect(r.ok).toBe(false);
  expect(r.problems.join(" ")).toContain("(403)");
  expect(r.gaps ?? []).toEqual([]);
}, 60000);

// M67 review: this was a problem in a project where no sign in was found, which failed working apps whose sign in
// knownSignIn missed and sent Claude to "fix" it. It is a gap in every project now, so it is still never a clean pass.
test.skipIf(no)("in a project with no sign in found, being sent to a login page is a gap, never a clean pass", async () => {
  const url = serve((req) => new URL(req.url).pathname === "/login"
    ? html('<h1>Sign in</h1><form><input type="password" name="p"><button type="submit">Sign in</button></form>')
    : new Response(null, { status: 302, headers: { location: "/login" } }));
  const r = await browserCheck(url, { timeoutMs: 8000 });
  expect(r.problems).toEqual([]);
  expect((r.gaps ?? []).join(" ")).toMatch(/sign in/i);
}, 60000);

test.skipIf(no)("an ordinary redirect to another page is not a sign in gap", async () => {
  const url = serve((req) => new URL(req.url).pathname === "/home" ? html("<h1>Shop</h1>") : new Response(null, { status: 302, headers: { location: "/home" } }));
  const r = await browserCheck(url, { timeoutMs: 8000 });
  expect(r.ok).toBe(true);
  expect(r.gaps ?? []).toEqual([]);
}, 60000);

test("which projects are known to have a sign in", () => {
  const dep = tmp("dep"); writeFileSync(join(dep, "package.json"), JSON.stringify({ dependencies: { "next-auth": "5.0.0" } }));
  const clerk = tmp("clerk"); writeFileSync(join(clerk, "package.json"), JSON.stringify({ dependencies: { "@clerk/nextjs": "6.0.0" } }));
  const py = tmp("py"); writeFileSync(join(py, "requirements.txt"), "flask\nFlask-Login==0.6\n");
  const page = tmp("page"); mkdirSync(join(page, "app", "login"), { recursive: true }); writeFileSync(join(page, "app", "login", "page.tsx"), "x"); writeFileSync(join(page, "package.json"), "{}");
  const said = tmp("said"); mkdirSync(join(said, ".claude")); writeFileSync(join(said, ".claude", "proof.json"), JSON.stringify({ signIn: true }));
  const none = tmp("none"); writeFileSync(join(none, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0" } })); mkdirSync(join(none, "src")); writeFileSync(join(none, "src", "author.ts"), "x");
  expect([dep, clerk, py, page, said].map(knownSignIn)).toEqual([true, true, true, true, true]);
  expect(knownSignIn(none)).toBe(false);
});

test("the ladder tells the browser check whether the project has a sign in", async () => {
  const { CheckpointStore } = await import("../src/checkpoints.ts");
  const seen: (boolean | undefined)[] = [];
  for (const login of [true, false]) {
    const project = tmp("lad");
    writeFileSync(join(project, "package.json"), JSON.stringify({ scripts: { dev: "node server.js" } }));
    if (login) writeFileSync(join(project, "login.html"), "<form><input type=password></form>");
    const store = new CheckpointStore(tmp("s"), project);
    const snap = await store.snapshot("now");
    const res = { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1 };
    await runLadder({ project, store, beforeId: snap.id, afterId: snap.id, run: (async () => res) as never,
      server: (async () => ({ ok: true, url: "http://127.0.0.1:1/", stop: async () => {} })) as never,
      browser: (async (_u: string, o: { signInExpected?: boolean }) => { seen.push(o.signInExpected); return { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 1 }; }) as never });
  }
  // Left out when false, so the usual settings still ask the browser exactly as before (check-ladder-settings.test.ts).
  expect(seen).toEqual([true, undefined]);
});

test.skipIf(no)("a sign in wall during a task: one round, no fix rounds, and the proof is partial, not failed", async () => {
  const srv = `bun -e "Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT),fetch:()=>new Response('<h1>Please sign in</h1>',{status:401,headers:{'content-type':'text/html'}})})"`;
  const project = tmp("p");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "x", scripts: { start: srv } }));
  writeFileSync(join(project, "login.html"), "<form><input type=password></form>");   // the project has its own sign in
  writeFileSync(join(project, "app.txt"), "v0");
  const write = (c: string): Step => ({ tool: { name: "Write", input: { file_path: "app.txt", content: c } }, costUsd: 0.01 });
  const engine = new ScriptedEngine([[write("v1")], [write("v2")], [write("v3")]]);
  const events: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20000 });
  await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Make the home page say hello", model: "claude-sonnet-5-5", budgetUsd: 3 } as never);
  expect(engine.calls.length).toBe(1);
  const results = events.filter((e) => e.type === "proof.result") as any[];
  expect(results.map((r) => r.verdict)).toEqual(["passed_with_gaps"]);
  expect(events.some((e) => e.type === "loop.stuck")).toBe(false);
}, 120000);

test("a Vercel preview behind its sign in (now a gap, not a problem) still cannot go live", async () => {
  const { SIGN_IN_GAP } = await import("../src/proof/browser.ts");
  const project = tmp("ship"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
  const events: any[] = [];
  const deployer = { signedIn: () => true, preview: async () => ({ ok: true, url: "https://shop-abc.vercel.app" }), promote: async () => ({ ok: true as const, productionUrl: "https://shop.vercel.app" }), rollback: async () => ({ ok: true as const }) };
  const browser = async () => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 1, gaps: [SIGN_IN_GAP] });
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), deployer: deployer as never, browser: browser as never, proof: async () => ({ verdict: "passed", steps: [] }) });
  await runner.handle({ v: 1, id: "p1", type: "ship.preview", project } as never);
  const last = events.filter((e) => e.type === "ship.status").at(-1) as any;
  expect(last.stage).toBe("failed");
  expect(last.canGoLive).toBeFalsy();
  expect(last.detail).toMatch(/login/i);
});
