// M67 bug bash, review of the fixes: seven things the first round of fixes got wrong, each with its failing test first.
//  1. The first check's question about running scripts without the safety box is shown on the first run screen.
//  2-4. A sign in is a gap, never a problem the fix loop sends to Claude: a redirect to a page with a password field always,
//       and a 401 that says it wants a sign in (WWW-Authenticate, a password field, sign in words), whatever knownSignIn says.
//       knownSignIn also knows firebase, @supabase/supabase-js, basic auth packages and LoginPage.tsx style names.
//  5. Changes said but not reviewed, then Squibby's own task, then a restart: only the other tool's files come back.
//  6. A script that writes git in a workspace package asks, however the package is named (--prefix, -C, -w, --filter...).
//  7. A command that steps into a folder first keeps the SQLite file it really works on, so Undo brings it back.
// Stand in engine (no model), local pages on 127.0.0.1, temporary fixture folders only.
import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { runLadder } from "../src/proof/ladder.ts";
import { browserCheck, browserInstalled, knownSignIn } from "../src/proof/browser.ts";
import { evaluate } from "../src/safety.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ReviewService } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { parseEvent, PROTOCOL_VERSION, type Event } from "../../protocol/index.ts";

// Loaded by path, so the runner's type check does not take in the page's files.
const ONBOARDING = "../../app/src/onboarding.ts";

const made: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => { while (stops.length) stops.pop()!(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `m67-rf-${l}-`))); made.push(d); return d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const put = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };
const serve = (fetch: (r: Request) => Response) => { const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch }); stops.push(() => s.stop(true)); return `http://127.0.0.1:${s.port}/`; };
const html = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
const noBrowser = !browserInstalled();

// ---------- 1. the first check's unboxed question on the first run screen ----------

test("1: with no safety box, the first check's question is marked as the check's and the first run screen shows it", async () => {
  const project = tmp("fc");
  put(project, { "package.json": JSON.stringify({ name: "s", scripts: { test: "node t.js" } }), "t.js": "process.exit(0)" });
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000,
    // The real ladder, told the safety box does not work on this Mac.
    proof: (o) => runLadder({ ...o, box: false }),
    emit: (e) => {
      events.push(e);
      if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 10);
    } });
  await runner.handle({ v: 1, id: "f1", type: "problem.find", project, agent: "builder-1", first: true } as never);
  const ap = events.find((e) => e.type === "approval.request") as any;
  expect(ap).toBeDefined();
  expect(ap.risk).toBe("irreversible");
  expect(ap.check).toBe(true);
  expect(parseEvent(JSON.stringify(ap)).ok).toBe(true);
  const { installAsks } = await import(ONBOARDING);
  const card = { id: ap.approval, agent: ap.agent, risk: ap.risk, check: ap.check };
  expect(installAsks([card], "builder-1").map((a: { id: string }) => a.id)).toEqual([ap.approval]);
}, 60000);

test("1: a task's own tool question is never marked as the check's", async () => {
  const project = tmp("tool");
  put(project, { "a.txt": "1" });
  const events: Event[] = [];
  let runner!: AgentRunner;
  runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: "git push" } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000, emit: (e) => {
    events.push(e);
    if (e.type === "approval.request") setTimeout(() => void runner.handle({ v: 1, id: "n", type: "approval.resolve", approval: (e as any).approval, decision: "deny", scope: "once" } as never), 10);
  } });
  await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "push", model: "m", budgetUsd: 3 } as never);
  const ap = events.find((e) => e.type === "approval.request") as any;
  expect(ap).toBeDefined();
  expect(ap.check).toBeUndefined();
}, 60000);

// ---------- 2-4. a sign in is a gap ----------

test("2-4: knownSignIn knows firebase, supabase-js, basic auth packages and login pages named like LoginPage.tsx", () => {
  const dep = (d: Record<string, string>) => { const p = tmp("dep"); put(p, { "package.json": JSON.stringify({ dependencies: d }) }); return p; };
  const file = (f: string) => { const p = tmp("file"); put(p, { "package.json": "{}", [f]: "x" }); return p; };
  expect([dep({ firebase: "11.0.0" }), dep({ "@supabase/supabase-js": "2.0.0" }), dep({ express: "5.0.0", "express-basic-auth": "1.2.1" }), dep({ "basic-auth": "2.0.1" }), dep({ "http-auth": "4.2.0" })].map(knownSignIn)).toEqual([true, true, true, true, true]);
  expect([file("src/pages/LoginPage.tsx"), file("src/components/SignInForm.tsx"), file("src/sign-in-page.vue")].map(knownSignIn)).toEqual([true, true, true]);
  // Words that only look like it are not a sign in.
  expect([file("src/author.ts"), file("src/designinfo.ts"), dep({ react: "19.0.0" })].map(knownSignIn)).toEqual([false, false, false]);
});

test.skipIf(noBrowser)("2-3: a redirect to a page with a password field is a gap, even when no sign in was found in the project", async () => {
  const url = serve((req) => new URL(req.url).pathname === "/welcome"
    ? html('<h1>Welcome</h1><form><input type="password" name="p"><button type="submit">Go</button></form>')
    : new Response(null, { status: 302, headers: { location: "/welcome" } }));
  const r = await browserCheck(url, { timeoutMs: 8000, signInExpected: false });
  expect(r.ok).toBe(true);
  expect(r.problems).toEqual([]);
  expect((r.gaps ?? []).join(" ")).toMatch(/sign in/i);
}, 60000);

test.skipIf(noBrowser)("4: a 401 that asks for a sign in is a gap, whatever knownSignIn says", async () => {
  for (const res of [() => html("<h1>Please sign in</h1>", 401), () => html("x", 401, { "www-authenticate": 'Basic realm="staging"' }), () => html('<form><input type="password"></form>', 403)]) {
    const r = await browserCheck(serve(res), { timeoutMs: 8000, signInExpected: false });
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect((r.gaps ?? []).join(" ")).toMatch(/sign in/i);
  }
}, 90000);

test.skipIf(noBrowser)("4: a plain 401 or 403 error page in a project with no sign in is still a problem", async () => {
  for (const res of [() => html("<h1>Forbidden</h1>", 403), () => html("<h1>Something went wrong</h1>", 401)]) {
    const r = await browserCheck(serve(res), { timeoutMs: 8000, signInExpected: false });
    expect(r.ok).toBe(false);
    expect(r.gaps ?? []).toEqual([]);
  }
}, 60000);

test.skipIf(noBrowser)("4: bug 23's own wall (no sign in package, no login file): one round, no fix rounds, passed with gaps", async () => {
  const srv = `bun -e "Bun.serve({hostname:'127.0.0.1',port:Number(process.env.PORT),fetch:()=>new Response('<h1>Please sign in</h1>',{status:401,headers:{'content-type':'text/html'}})})"`;
  const project = tmp("wall");
  put(project, { "package.json": JSON.stringify({ name: "x", scripts: { start: srv } }), "app.txt": "v0" });
  expect(knownSignIn(project)).toBe(false);
  const write = (c: string): Step => ({ tool: { name: "Write", input: { file_path: "app.txt", content: c } }, costUsd: 0.01 });
  const engine = new ScriptedEngine([[write("v1")], [write("v2")], [write("v3")]]);
  const events: any[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), approvalTimeoutMs: 20000 });
  await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Make the home page say hello", model: "claude-sonnet-5-5", budgetUsd: 3 } as never);
  expect(engine.calls.length).toBe(1);
  expect(events.filter((e) => e.type === "proof.result").map((r) => r.verdict)).toEqual(["passed_with_gaps"]);
}, 120000);

// ---------- 5. own work while a batch waits, then a restart ----------

test("5: after Squibby's own task and a restart, only the other tool's changes come back as changed while closed", async () => {
  const project = tmp("rv"), shadow = tmp("sh");
  put(project, { "src/App.tsx": "export const a = 1;\n", "src/Title.tsx": "export const t = 'x';\n", "package.json": '{ "name": "site" }\n' });
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true };
  const make = (events: Record<string, any>[]) => {
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const svc = new ReviewService({ emit: (e) => events.push(e), setting: (k) => values[k], store: () => store, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30 });
    stops.push(() => svc.stop());
    return { svc, fire: (...r: string[]) => { for (const x of r) send?.(x); } };
  };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const e1: Record<string, any>[] = [];
  const a = make(e1);
  a.svc.setProject(project); await a.svc.ready();
  // 1) The other tool edits App.tsx; the batch is said; nobody presses Review them.
  put(project, { "src/App.tsx": "export const a = 2;\n" }); a.fire("src/App.tsx");
  await until(() => e1.some((e) => e.type === "review.batch"));
  // 2) Squibby's own task changes Title.tsx.
  let done!: () => void;
  const work = new Promise<void>((r) => { done = r; });
  a.svc.around(project, work, "agent.start");
  put(project, { "src/Title.tsx": "export const t = 'blue';\n" }); a.fire("src/Title.tsx");
  await sleep(100);
  done(); await sleep(50); await a.svc.ready(); await sleep(100); await a.svc.ready();
  // 3) Quit and reopen.
  a.svc.stop();
  const e2: Record<string, any>[] = [];
  const b = make(e2);
  b.svc.setProject(project); await b.svc.ready(); await sleep(200);
  const offered = e2.filter((e) => e.type === "review.batch");
  expect(offered.length).toBe(1);
  expect(offered[0].away).toBe("closed");
  expect(offered[0].files.map((f: { file: string }) => f.file)).toEqual(["src/App.tsx"]);
  void PROTOCOL_VERSION;
}, 30000);

// ---------- 6. scripts in a workspace package ----------

test("6: a git writing or database script in a workspace package asks, however the package is named", () => {
  const project = tmp("mono");
  put(project, {
    "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
    "packages/app/package.json": JSON.stringify({ name: "app", scripts: { save: "git add -A && git commit -q -m wip", reset: "prisma migrate reset --force", build: "echo build" } }),
  });
  const verdict = (command: string) => evaluate({ tool: "Bash", input: { command } } as never, { project });
  expect(verdict("cd packages/app && npm run save").decision).toBe("ask");
  for (const c of ["npm --prefix packages/app run save", "npm run save --prefix packages/app", "npm run save --prefix=packages/app", "npm -w app run save", "npm run save --workspace=packages/app", "npm run save -ws",
    "pnpm -C packages/app save", "pnpm --dir packages/app run save", "pnpm --filter app run save", "pnpm -r run save", "yarn workspace app save", "yarn --cwd packages/app save", "bun --cwd packages/app run save"]) {
    const v = verdict(c);
    expect(`${c}: ${v.decision} ${v.risk}`).toBe(`${c}: ask git`);
  }
  expect(verdict("npm --prefix packages/app run reset").decision).toBe("ask");
  // A script that writes nothing of the kind still runs with no card.
  expect(verdict("npm --prefix packages/app run build").decision).toBe("allow");
  expect(verdict("pnpm --filter app run build").decision).toBe("allow");
});

// ---------- 7. cd first, then sqlite3 ----------

test("7: cd prisma && sqlite3 dev.db DROP TABLE: after a yes, Undo brings the table back", async () => {
  const project = tmp("cddb");
  put(project, { ".gitignore": "*.db\n", "index.js": "console.log(1)\n" });
  mkdirSync(join(project, "prisma"));
  const file = join(project, "prisma", "dev.db");
  const db = new Database(file); db.run("CREATE TABLE users (name TEXT)"); db.run("INSERT INTO users VALUES ('ann')"); db.close();
  const has = () => { const d = new Database(file); try { return (d.query("SELECT count(*) AS n FROM sqlite_master WHERE name='users'").get() as { n: number }).n; } finally { d.close(); } };
  const events: Event[] = [];
  let r!: AgentRunner;
  r = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([{ tool: { name: "Bash", input: { command: `cd prisma && sqlite3 dev.db "DROP TABLE users"` } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]), log: new TaskLog(":memory:"), approvalTimeoutMs: 20000, emit: (e) => {
    events.push(e);
    if (e.type === "approval.request") setTimeout(() => void r.handle({ v: 1, id: "y", type: "approval.resolve", approval: (e as any).approval, decision: "allow", scope: "once" } as never), 5);
  } });
  await r.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "b1", mode: "drive", prompt: "clean up", model: "m", budgetUsd: 3 } as never);
  expect(events.some((e) => e.type === "approval.request")).toBe(true);
  expect(has()).toBe(0);
  const cp = (events.find((e) => e.type === "checkpoint.created") as any).checkpoint;
  await r.handle({ v: 1, id: "r1", type: "checkpoint.restore", project, checkpoint: cp } as never);
  expect(has()).toBe(1);
}, 60000);
