// What Claude Code keeps on disk about a person's work, and where. Prompt help text read from other apps and off the record
// tasks leave no saved conversation at all. On the API key route the saved conversations of ordinary tasks (needed to
// continue them) live in Companion's own data folder, which Delete everything removes. On the plan route Claude Code's
// folder is never changed, because that folder decides which Keychain entry holds the person's login (CLAUDE.md, T03).
// All with fake engines: free, and they prove our wiring, not Claude. A real run with a real API key is still owed.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSdkOptions, SdkEngine } from "../src/sdkEngine.ts";
import { buildFastOptions, FastLane } from "../src/lanes.ts";
import { buildChildEnv } from "../src/safety.ts";
import { createEngine, createLanes, engineEnv, readSettings, type Settings } from "../src/engines.ts";
import { heldKey } from "../src/keychain.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-priv-${l}-`))); made.push(d); return d; };
const base = { project: "/p", model: "m", budgetUsd: 3, claudeBinary: "/x/claude", env: { PATH: "/usr/bin" }, authorize: async () => ({ allow: true, reason: "" }), signal: new AbortController().signal };

// A fake `query` that remembers the options it was given.
const capture = () => {
  const seen: any[] = [];
  const q = (params: any) => { seen.push(params.options); return (async function* () { yield { type: "result", subtype: "success", total_cost_usd: 0 }; })(); };
  return { seen, q: q as any };
};
const drain = async (e: SdkEngine, extra: Record<string, unknown> = {}) => {
  for await (const _ of e.start({ prompt: "p", project: "/p", model: "m", signal: new AbortController().signal, authorize: base.authorize, budgetUsd: 3, ...extra } as any)) { /* drain */ }
};

describe("what Companion remembers reaches the real engine", () => {
  test("the engine hands the remembered lines to the agent's instructions", async () => {
    const c = capture();
    await drain(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: c.q }), { memory: "- Prefers short answers" });
    expect(c.seen[0].systemPrompt.append).toContain("Prefers short answers");
  });
  test("with nothing remembered, nothing is added", async () => {
    const c = capture();
    await drain(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: c.q }));
    expect(c.seen[0].systemPrompt.append).not.toMatch(/remembers/);
  });
});

describe("which conversations are saved", () => {
  test("an off the record task saves no conversation", async () => {
    expect((buildSdkOptions({ ...base, offTheRecord: true }) as any).persistSession).toBe(false);
    const c = capture();
    await drain(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: c.q }), { offTheRecord: true });
    expect(c.seen[0].persistSession).toBe(false);
  });
  test("an ordinary task keeps its conversation, so a follow up can continue it", async () => {
    expect((buildSdkOptions(base) as any).persistSession).not.toBe(false);
    const c = capture();
    await drain(new SdkEngine({ claudeBinary: "/x/claude", env: {}, queryFn: c.q }), { resumeSession: "s1" });
    expect(c.seen[0].persistSession).not.toBe(false);
    expect(c.seen[0].resume).toBe("s1");
  });
  test("the fast lane (Prompt help, Explain, Draw it for me) never saves a conversation", async () => {
    expect((buildFastOptions({ claudeBinary: "/x/claude", env: {}, model: "m", signal: new AbortController().signal }) as any).persistSession).toBe(false);
    const c = capture();
    await new FastLane({ claudeBinary: "/x/claude", env: {}, queryFn: c.q }).run({ text: "text read from another app" }, () => {}, new AbortController().signal);
    expect(c.seen[0].persistSession).toBe(false);
  });
});

describe("Claude Code's own folder", () => {
  const parent = { PATH: "/usr/bin", HOME: "/Users/x" };
  test("on the API key route it is the folder Companion names", () => {
    expect(buildChildEnv(parent, { route: "api_key", apiKey: "k", configDir: "/data/claude" }).CLAUDE_CONFIG_DIR).toBe("/data/claude");
  });
  test("on the API key route with no folder named, it is left alone", () => {
    expect(buildChildEnv(parent, { route: "api_key", apiKey: "k" }).CLAUDE_CONFIG_DIR).toBeUndefined();
  });
  test("a folder already set on purpose (a test, or the person's own) is kept on the API key route", () => {
    expect(buildChildEnv({ ...parent, CLAUDE_CONFIG_DIR: "/test/cfg" }, { route: "api_key", apiKey: "k", configDir: "/data/claude" }).CLAUDE_CONFIG_DIR).toBe("/test/cfg");
  });
  test("an empty setting counts as not set", () => {
    expect(buildChildEnv({ ...parent, CLAUDE_CONFIG_DIR: "" }, { route: "api_key", apiKey: "k", configDir: "/data/claude" }).CLAUDE_CONFIG_DIR).toBe("/data/claude");
  });
  test("on the plan route it is never set by Companion", () => {
    expect(buildChildEnv(parent, { route: "plan" }).CLAUDE_CONFIG_DIR).toBeUndefined();
    // Even if a caller tries: the plan route takes no folder.
    expect(buildChildEnv(parent, { route: "plan", configDir: "/data/claude" } as never).CLAUDE_CONFIG_DIR).toBeUndefined();
  });
  test("on the plan route a folder set on purpose for tests is kept as it was", () => {
    expect(buildChildEnv({ ...parent, CLAUDE_CONFIG_DIR: "/test/cfg" }, { route: "plan" }).CLAUDE_CONFIG_DIR).toBe("/test/cfg");
  });
  test("the default folder is never named explicitly (that picks a different Keychain entry), nor a relative one", () => {
    expect(buildChildEnv(parent, { route: "api_key", apiKey: "k", configDir: "/Users/x/.claude" }).CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(buildChildEnv(parent, { route: "api_key", apiKey: "k", configDir: "/Users/x/.claude/" }).CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(buildChildEnv(parent, { route: "api_key", apiKey: "k", configDir: "claude" }).CLAUDE_CONFIG_DIR).toBeUndefined();
  });
});

describe("the environment the engine gets", () => {
  test("API key route: Claude Code's folder is inside Companion's data folder, made private", () => {
    const data = tmp("data");
    const e = engineEnv({ method: "api_key", apiKey: "k" }, data, { PATH: "/usr/bin", HOME: "/Users/x" });
    expect(e.CLAUDE_CONFIG_DIR).toBe(join(data, "claude"));
    expect(statSync(join(data, "claude")).isDirectory()).toBe(true);
    expect(statSync(join(data, "claude")).mode & 0o777).toBe(0o700);
    expect(e.ANTHROPIC_API_KEY).toBe("k");
  });
  test("API key route with a folder set for tests: that folder is used and nothing is made in the data folder", () => {
    const data = tmp("data");
    const e = engineEnv({ method: "api_key", apiKey: "k" }, data, { PATH: "/usr/bin", HOME: "/Users/x", CLAUDE_CONFIG_DIR: "/test/cfg" });
    expect(e.CLAUDE_CONFIG_DIR).toBe("/test/cfg");
    expect(existsSync(join(data, "claude"))).toBe(false);
  });
  test("plan route: no folder is set and nothing is made", () => {
    const data = tmp("data");
    const e = engineEnv({ method: "plan" }, data, { PATH: "/usr/bin", HOME: "/Users/x" });
    expect(e.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(existsSync(join(data, "claude"))).toBe(false);
  });
  test("plan route with a folder set for tests: kept as it was", () => {
    const e = engineEnv({ method: "plan" }, tmp("data"), { PATH: "/usr/bin", HOME: "/Users/x", CLAUDE_CONFIG_DIR: "/test/cfg" });
    expect(e.CLAUDE_CONFIG_DIR).toBe("/test/cfg");
  });
});

// The engine and the lanes exactly as the app makes them (createEngine, createLanes), so a change that went back to the
// plain environment would be caught. The key is the one the app hands over on its pipe (held in memory here), so the
// Keychain is never touched. The Claude binary named is a plain file that cannot run: if the fake were ever bypassed,
// nothing real would start.
describe("the engine and lanes the app makes", () => {
  const saved = { cfg: process.env.CLAUDE_CONFIG_DIR, src: process.env.COMPANION_KEY_SOURCE };
  beforeEach(() => { delete process.env.CLAUDE_CONFIG_DIR; process.env.COMPANION_KEY_SOURCE = "app"; heldKey.set("sk-test-not-a-real-key"); });
  afterEach(() => {
    heldKey.set(null);
    if (saved.cfg === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved.cfg;
    if (saved.src === undefined) delete process.env.COMPANION_KEY_SOURCE; else process.env.COMPANION_KEY_SOURCE = saved.src;
  });
  const settings = (route: "api_key" | "plan") => {
    const data = tmp("data"), bin = join(tmp("bin"), "claude");
    writeFileSync(bin, "not a program\n", { mode: 0o644 });
    return { data, bin, s: readSettings({ COMPANION_DATA: data, COMPANION_CLAUDE_BIN: bin, ...(route === "plan" ? { COMPANION_ROUTE: "plan" } : {}) }) };
  };
  const signal = () => new AbortController().signal;
  const viaEngine = async (s: Settings) => { const c = capture(); for await (const _ of createEngine(s, { queryFn: c.q }).start({ prompt: "p", project: tmp("p"), model: "m", signal: signal(), authorize: base.authorize, budgetUsd: 1 })) { /* drain */ } return c.seen[0]; };
  const viaFast = async (s: Settings) => { const c = capture(); await createLanes(s, { queryFn: c.q }).fast.run({ text: "t" }, () => {}, signal()); return c.seen[0]; };
  const viaVision = async (s: Settings) => {
    const c = capture();
    await createLanes(s, { queryFn: c.q, tmpDrive: { ensure: async () => tmp("shots"), wipe: async () => {} } }).vision.locate({ image: { base64: "AA==", mediaType: "image/png" }, question: "where", ocr: [] }, signal());
    return c.seen[0];
  };
  for (const [name, via] of [["agent tasks", viaEngine], ["the fast lane", viaFast], ["the vision lane", viaVision]] as const) {
    test(`${name}, API key route: Claude Code's folder is inside Companion's data folder`, async () => {
      const { data, bin, s } = settings("api_key");
      const o = await via(s);
      expect(o.env.CLAUDE_CONFIG_DIR).toBe(join(data, "claude"));
      expect(o.env.ANTHROPIC_API_KEY).toBe("sk-test-not-a-real-key");
      expect(o.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe("1");
      expect(o.pathToClaudeCodeExecutable).toBe(bin);
      expect(statSync(join(data, "claude")).mode & 0o777).toBe(0o700);
    });
    test(`${name}, plan route: Claude Code's folder is never set, and nothing is made`, async () => {
      const { data, s } = settings("plan");
      const o = await via(s);
      expect("CLAUDE_CONFIG_DIR" in o.env).toBe(false);
      expect("ANTHROPIC_API_KEY" in o.env).toBe(false);
      expect(existsSync(join(data, "claude"))).toBe(false);
    });
  }
  test("not connected: nothing starts", async () => {
    heldKey.set(null);
    const { s } = settings("api_key");
    const c = capture();
    await expect((async () => { for await (const _ of createEngine(s, { queryFn: c.q }).start({ prompt: "p", project: tmp("p"), model: "m", signal: signal(), authorize: base.authorize, budgetUsd: 1 })) { /* drain */ } })()).rejects.toThrow(/Not connected/);
    expect(c.seen.length).toBe(0);
  });
});

// ---------- off the record tasks in the runner ----------

const write = (file_path: string, content: string): Step => ({ tool: { name: "Write", input: { file_path, content } }, costUsd: 0.01 });
const say = (text: string): Step => ({ text, costUsd: 0.01 });
const plan = (...steps: string[]) => say("```json\n" + JSON.stringify(steps) + "\n```");
const ok = (): LadderResult => ({ verdict: "passed", steps: [] });
const bad = (detail: string): LadderResult => { const s = { rung: "checks", label: "Building", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };

function setup(rounds: Step[][], proofs: LadderResult[] = [ok()], reviews?: Step[][]) {
  const project = tmp("p");
  writeFileSync(join(project, "a.txt"), "original");
  const events: Event[] = [];
  const engine = new ScriptedEngine(rounds);
  const reviewer = reviews ? new ScriptedEngine(reviews) : undefined;
  let n = 0;
  const runner = new AgentRunner({
    shadowRoot: tmp("s"), engine, reviewer, log: new TaskLog(":memory:"), emit: (e) => events.push(e),
    proof: async (c: any) => { const r = c.review ? await c.review() : undefined; return { ...proofs[Math.min(n++, proofs.length - 1)], review: r } as never; },
  });
  const start = (extra: Record<string, unknown> = {}) => runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "make the secret page", model: "m", budgetUsd: 3, ...extra } as never);
  const planDrive = async (extra: Record<string, unknown> = {}) => { await Bun.sleep(100); return runner.handle({ v: 1, id: "p1", type: "drive.plan", project, agent: "a1", goal: "build a booking page", model: "m", budgetUsd: 5, ...extra } as never); };
  const approve = (steps: string[]) => runner.handle({ v: 1, id: "p2", type: "drive.approve", agent: "a1", steps } as never);
  const cmd = (c: Record<string, unknown>) => runner.handle({ v: 1, id: "x", agent: "a1", ...c } as never);
  return { project, events, engine, reviewer, start, planDrive, approve, cmd };
}
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const waitFor = async (fn: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); };

describe("an off the record task in the runner", () => {
  test("the engine is told, on every round", async () => {
    const r = setup([[write("x.txt", "1")], [write("x.txt", "2")]], [bad("boom"), ok()]);
    await r.start({ offTheRecord: true });
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls.every((c) => c.offTheRecord === true)).toBe(true);
  });
  test("an ordinary task does not say it is off the record", async () => {
    const r = setup([[write("x.txt", "1")]]);
    await r.start();
    expect(r.engine.calls[0].offTheRecord).not.toBe(true);
  });
  test("a follow up after a failed check starts afresh (nothing was saved to continue) and says the request again", async () => {
    const r = setup([[write("x.txt", "1")], [write("x.txt", "2")]], [bad("ReferenceError: foo"), ok()]);
    await r.start({ offTheRecord: true });
    expect(r.engine.calls[1].resumeSession).toBeUndefined();
    expect(r.engine.calls[1].prompt).toContain("make the secret page");
    expect(r.engine.calls[1].prompt).toContain("ReferenceError: foo");
  });
  test("an ordinary task's follow up still continues the same conversation", async () => {
    const r = setup([[write("x.txt", "1")], [write("x.txt", "2")]], [bad("boom"), ok()]);
    await r.start();
    expect(r.engine.calls[1].resumeSession).toBe("scripted-session");
    expect(r.engine.calls[1].prompt).not.toContain("make the secret page");
  });
  test("the second reviewer of a risky change is told too", async () => {
    const r = setup([[write("package.json", '{"name":"x"}')]], [ok()], [[say('{"verdict":"approve","concerns":[]}')]]);
    await r.start({ offTheRecord: true });
    expect(r.reviewer!.calls.length).toBe(1);
    expect(r.reviewer!.calls[0].offTheRecord).toBe(true);
  });
});

describe("an off the record plan (Drive)", () => {
  test("planning is off the record, and each step starts afresh with the goal and its own step", async () => {
    const r = setup([[plan("Make the page", "Add a form")], [write("index.html", "<h1>hi</h1>")], [write("form.html", "<form></form>")]]);
    await r.planDrive({ offTheRecord: true });
    await r.approve(["Make the page", "Add a form"]);
    expect(r.engine.calls.length).toBe(3);
    expect(r.engine.calls.every((c) => c.offTheRecord === true)).toBe(true);
    for (const [i, title] of [[1, "Make the page"], [2, "Add a form"]] as const) {
      expect(r.engine.calls[i].resumeSession).toBeUndefined();
      expect(r.engine.calls[i].prompt).toContain("build a booking page");
      expect(r.engine.calls[i].prompt).toContain(title);
    }
    expect(r.events.some((e: any) => e.type === "drive.done" && e.status === "done")).toBe(true);
  });
  test("a plan that is too long is asked for again afresh, with the goal", async () => {
    const big = Array.from({ length: 15 }, (_, i) => `Step ${i + 1}`);
    const r = setup([[plan(...big)], [plan("One", "Two")]]);
    await r.planDrive({ offTheRecord: true });
    expect(r.engine.calls.length).toBe(2);
    expect(r.engine.calls[1].resumeSession).toBeUndefined();
    expect(r.engine.calls[1].prompt).toContain("build a booking page");
    expect(r.engine.calls[1].prompt).toMatch(/12/);
    expect((r.events.find((e) => e.type === "plan.ready") as any).steps.map((s: any) => s.title)).toEqual(["One", "Two"]);
  });
  test("an ordinary plan's steps still continue the planning conversation", async () => {
    const r = setup([[plan("Make the page")], [write("index.html", "<h1>hi</h1>")]]);
    await r.planDrive();
    await r.approve(["Make the page"]);
    expect(r.engine.calls[1].resumeSession).toBe("scripted-session");
    expect(r.engine.calls[1].offTheRecord).not.toBe(true);
  });
  test("carrying on after a pause starts afresh too, with the goal and the step", async () => {
    const r = setup([[plan("Make the page")], [{ ...write("index.html", "<h1>hi</h1>"), delayMs: 1500 }], [write("index.html", "<h1>hi</h1>")]]);
    await r.planDrive({ offTheRecord: true });
    const run = r.approve(["Make the page"]);
    await waitFor(() => of(r.events, "drive.step").length > 0);
    await Bun.sleep(200);
    await r.cmd({ type: "drive.pause", reason: "editor" });
    await waitFor(() => of(r.events, "drive.paused").length > 0);
    await r.cmd({ type: "drive.resume" });
    await run;
    expect(r.engine.calls.length).toBe(3);
    const again = r.engine.calls[2];
    expect(again.resumeSession).toBeUndefined();
    expect(again.offTheRecord).toBe(true);
    expect(again.prompt).toMatch(/paused/i);
    expect(again.prompt).toContain("build a booking page");
    expect(again.prompt).toContain("Make the page");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 1, total: 1 });
  });
  test("'Try a different approach' after the same failure three times starts afresh too, with the goal and the step", async () => {
    const same = bad("x is not defined");
    const r = setup([[plan("Make the page", "Add a form")], [write("a.txt", "1")], [write("a.txt", "2")], [write("a.txt", "3")], [write("a.txt", "fixed")], [write("form.html", "<form></form>")]], [same, same, same, ok()]);
    await r.planDrive({ offTheRecord: true });
    const run = r.approve(["Make the page", "Add a form"]);
    await waitFor(() => of(r.events, "loop.stuck").length > 0);
    await r.cmd({ type: "loop.choose", choice: "different" });
    await run;
    expect(r.engine.calls.length).toBe(6);
    expect(r.engine.calls.every((c) => c.offTheRecord === true && c.resumeSession === undefined)).toBe(true);
    const different = r.engine.calls[4];
    expect(different.prompt).toMatch(/different approach/i);
    expect(different.prompt).toContain("x is not defined");
    expect(different.prompt).toContain("build a booking page");
    expect(different.prompt).toContain("Make the page");
    expect(of(r.events, "drive.done")[0]).toMatchObject({ status: "done", completed: 2, total: 2 });
  });
});
