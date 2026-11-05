// M58 UI 13: sign in to Vercel without Terminal. The person's own `vercel login` runs as a visible step they start (the
// ship.signIn command), never at launch and never on a timer; the page it opens is Vercel's own; Squibby never reads,
// stores or passes the Vercel login. A fake Vercel tool only: nothing here reaches Vercel or the network.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { NEVER_GATED } from "../src/plan.ts";
import { NOT_SIGNED_IN, VercelCli, signInPage, type Deployer } from "../src/ship/deploy.ts";
import { SIGN_IN } from "../src/ship/signin.ts";
import type { RunOptions, RunResult } from "../src/proof/exec.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-si-${l}-`))); made.push(d); return d; };
const res = (o: Partial<RunResult>): RunResult => ({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1, ...o });
const DEVICE = "https://vercel.com/oauth/device?user_code=ABCD-EFGH";

/** A fake Vercel tool: prints what it is given, as a real one would while it runs, then ends. `signs` writes the login
 *  file, as Vercel's own tool does when the person finished on the page. */
function fakeTool(o: { print?: string[]; result?: Partial<RunResult>; signs?: boolean; hang?: boolean }, authFile: string, calls: string[]) {
  return (async (command: string, opts: RunOptions) => {
    calls.push(command);
    for (const p of o.print ?? []) opts.onOutput?.(p);
    if (o.hang) await new Promise<void>((r) => { if (opts.signal?.aborted) r(); opts.signal?.addEventListener("abort", () => r(), { once: true }); });
    if (o.signs) writeFileSync(authFile, '{"token":"secret-token-value"}');
    return res(o.hang ? { code: null, signal: "SIGTERM", aborted: true } : (o.result ?? {}));
  }) as never;
}
function cli(o: Parameters<typeof fakeTool>[0], hasCli = true) {
  const dir = tmp("auth"), auth = join(dir, "auth.json"), calls: string[] = [];
  const c = new VercelCli(fakeTool(o, auth, calls), auth, () => hasCli);
  c.signInPageMs = 50;
  return { c, auth, calls };
}

describe("the page Vercel's tool prints", () => {
  test("only an https page on vercel.com itself is taken", () => {
    expect(signInPage(`> Visit ${DEVICE} to sign in`)).toBe(DEVICE);
    expect(signInPage("Visit https://vercel.com/device and enter ABCD-EFGH.")).toBe("https://vercel.com/device");
    for (const t of ["Visit https://vercel.com.evil.example/oauth/device?x=1", "Visit http://vercel.com/oauth/device", "Visit https://evil.example/?https://vercel.com/device", "Visit https://user@vercel.com/device", "nothing here"]) expect(signInPage(t), t).toBeNull();
  });
});

describe("the Vercel tool's sign in", () => {
  test("runs the person's own vercel login, says the page it opened, and is done once the tool says so", async () => {
    const t = cli({ print: ["Vercel CLI 48.0.0\n", `> Visit ${DEVICE}\n`, "> Waiting for authentication...\n"], signs: true });
    const pages: string[] = [];
    const r = await t.c.signIn("/p", { onPage: (u) => pages.push(u) });
    expect(r).toEqual({ ok: true });
    expect(t.calls).toEqual(["vercel login"]);
    expect(pages).toEqual([DEVICE]);
  });
  test("the login file is never opened: only whether it exists", async () => {
    const t = cli({ print: [`Visit ${DEVICE}\n`], signs: true });
    await t.c.signIn("/p", { onPage: () => {} });
    const before = statSync(t.auth).atimeMs;
    expect(t.c.signedIn()).toBe(true);
    expect(statSync(t.auth).atimeMs).toBe(before);
    // Nothing of the tool's output (an account name, a token) is passed on: only the page and the outcome.
    const src = readFileSync(new URL("../src/ship/signin.ts", import.meta.url), "utf8") + readFileSync(new URL("../src/ship/deploy.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/readFileSync\(this\.authFile/);
  });
  test("no page within a short time (an older tool asking a question instead): stopped, with the lesson offered", async () => {
    const t = cli({ print: ["? Log in to Vercel (Use arrow keys)\n"], hang: true });
    const r = await t.c.signIn("/p", { onPage: () => {} });
    expect(r).toMatchObject({ ok: false, cannotStart: true });
  });
  test("the tool not installed: says so plainly (a sign in lesson would not help), and nothing runs", async () => {
    const t = cli({}, false);
    const r = await t.c.signIn("/p", { onPage: () => {} });
    expect(r).toEqual({ ok: false, reason: SIGN_IN.noCli });
    expect(t.calls).toEqual([]);
  });
  test("a sign in the tool did not finish is not signed in, whatever its exit code says", async () => {
    expect(await cli({ print: [`Visit ${DEVICE}\n`], result: { code: 1 } }).c.signIn("/p", { onPage: () => {} })).toMatchObject({ ok: false });
    // Exit 0 but no login was saved: still not signed in.
    expect(await cli({ print: [`Visit ${DEVICE}\n`] }).c.signIn("/p", { onPage: () => {} })).toMatchObject({ ok: false });
  });
  test("Stop ends it, and it says it was stopped", async () => {
    const t = cli({ print: [`Visit ${DEVICE}\n`], hang: true });
    t.c.signInPageMs = 5_000;
    const ac = new AbortController();
    const p = t.c.signIn("/p", { onPage: () => ac.abort(), signal: ac.signal });
    expect(await p).toEqual({ ok: false, reason: SIGN_IN.stopped });
  });
});

class FakeDeployer implements Deployer {
  calls: string[] = []; signed = false; result: any = { ok: true };
  signedIn() { return this.signed; }
  async preview() { this.calls.push("preview"); return { ok: true as const, url: "https://shop-abc.vercel.app" }; }
  async promote() { this.calls.push("promote"); return { ok: true as const }; }
  async rollback() { this.calls.push("rollback"); return { ok: true as const }; }
  async signIn(_p: string, o: { onPage: (u: string) => void }) { this.calls.push("signIn"); o.onPage(DEVICE); if (this.result.ok) this.signed = true; return this.result; }
}
function setup(deployer: Deployer = new FakeDeployer()) {
  const project = tmp("p"); writeFileSync(join(project, "index.html"), "<h1>shop</h1>");
  const events: Event[] = [];
  const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), deployer,
    browser: async (url: string) => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 }) as never, proof: async () => ({ verdict: "passed" as never, steps: [] }) });
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "c" + Math.random(), project, ...c } as never);
  const said = () => events.filter((e) => e.type === "ship.signIn") as any[];
  return { project, events, deployer: deployer as FakeDeployer, runner, cmd, said };
}

describe("ship.signIn, on the person's press only", () => {
  test("nothing runs when the engine starts, nor when going live finds no login: only the press starts it", async () => {
    const t = setup();
    expect(t.deployer.calls).toEqual([]);
    await t.cmd({ type: "ship.preview" });
    expect(t.events.filter((e) => (e as { type: string }).type === "ship.status").at(-1)).toMatchObject({ stage: "not_signed_in", detail: NOT_SIGNED_IN });
    expect(t.deployer.calls).toEqual([]);
  });
  test("the press opens Vercel's page, then says done; going online again is the person's next press", async () => {
    const t = setup();
    await t.cmd({ type: "ship.signIn" });
    expect(t.said().map((e) => e.stage)).toEqual(["opened", "done"]);
    expect(t.said()[0].url).toBe(DEVICE);
    for (const e of t.said()) expect(parseEvent(JSON.stringify(e)).ok, JSON.stringify(e)).toBe(true);
    // No preview, no check again on its own.
    expect(t.deployer.calls).toEqual(["signIn"]);
  });
  test("already signed in: done at once, and no login runs", async () => {
    const t = setup(); t.deployer.signed = true;
    await t.cmd({ type: "ship.signIn" });
    expect(t.said().map((e) => e.stage)).toEqual(["done"]);
    expect(t.deployer.calls).toEqual([]);
  });
  test("a sign in that did not finish says why in plain words, with the lesson when the step could not run", async () => {
    const d = new FakeDeployer(); d.result = { ok: false, reason: SIGN_IN.noPage, cannotStart: true };
    const t = setup(d);
    await t.cmd({ type: "ship.signIn" });
    expect(t.said().at(-1)).toMatchObject({ stage: "failed", reason: SIGN_IN.noPage, lesson: true });
  });
  test("a deployer with no sign in of its own says so, and offers the lesson", async () => {
    const d = new FakeDeployer(); (d as any).signIn = undefined;
    const t = setup(d);
    await t.cmd({ type: "ship.signIn" });
    expect(t.said().at(-1)).toMatchObject({ stage: "failed", lesson: true });
  });
  test("it costs nothing and is never behind a plan", () => {
    expect(NEVER_GATED as readonly string[]).toContain("ship.signIn");
    expect(parseCommand(JSON.stringify({ v: 1, id: "c", type: "ship.signIn", project: "/p" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "c", type: "ship.signIn" })).ok).toBe(false);
  });
  test("its words never say Open Terminal, and none credits another tool", () => {
    for (const w of [NOT_SIGNED_IN, ...Object.values(SIGN_IN)]) { expect(w).not.toMatch(/Terminal|vercel login/i); expect(w).not.toMatch(/[–—]/); }
  });
});

describe("the step by step lesson for when the sign in cannot run", () => {
  test("ships with the app, needs no project, and never asks for a password or a token in Squibby", () => {
    const f = new URL("../../lessons/vercel-sign-in.json", import.meta.url);
    expect(existsSync(f)).toBe(true);
    const l = JSON.parse(readFileSync(f, "utf8"));
    expect(l).toMatchObject({ id: "vercel-sign-in", app: "Vercel", needsProject: false });
    const text = JSON.stringify(l);
    expect(text).not.toMatch(/Terminal|vercel login|token/i);
    expect(text).not.toMatch(/[–—]/);
    expect(l.steps.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Stop signing in ends a sign in that is still waiting (review of 5 Nov)", () => {
  test("ship.signIn with stop aborts the waiting login, says it stopped, and frees the project", async () => {
    class Hanging extends FakeDeployer {
      async signIn(_p: string, o: { onPage: (u: string) => void; signal?: AbortSignal }) {
        this.calls.push("signIn"); o.onPage(DEVICE);
        await new Promise<void>((r) => { if (o.signal?.aborted) r(); o.signal?.addEventListener("abort", () => r(), { once: true }); });
        return { ok: false as const, reason: SIGN_IN.stopped };
      }
    }
    const t = setup(new Hanging());
    const first = t.cmd({ type: "ship.signIn" });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.said().map((e) => e.stage)).toEqual(["opened"]);
    await t.cmd({ type: "ship.signIn", stop: true });
    await first;
    expect(t.said().at(-1)).toMatchObject({ stage: "failed", reason: SIGN_IN.stopped });
    // The project is free again: a second press starts a new sign in, not "Another ship step is already running".
    const second = t.cmd({ type: "ship.signIn" });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.deployer.calls).toEqual(["signIn", "signIn"]);
    await t.cmd({ type: "ship.signIn", stop: true });
    await second;
  });
  test("a stop with nothing waiting does nothing", async () => {
    const t = setup();
    await t.cmd({ type: "ship.signIn", stop: true });
    expect(t.said()).toEqual([]);
    expect(t.deployer.calls).toEqual([]);
  });
  test("stop is part of the protocol: a flag, never text", () => {
    expect(parseCommand(JSON.stringify({ v: 1, id: "c", type: "ship.signIn", project: "/p", stop: true })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "c", type: "ship.signIn", project: "/p", stop: "yes" })).ok).toBe(false);
  });
});
