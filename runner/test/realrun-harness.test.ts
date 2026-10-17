// The real run harness (runner/scripts/realrun-harness.ts): what every script that spends the founder's API key goes
// through. These tests use stubbed queries and stubbed key readers only: nothing reaches the network, no Claude starts, and
// the real Keychain is never read (one test asks it for a throwaway companion-test- item that does not exist).
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand } from "../../protocol/index.ts";
import { buildFastOptions } from "../src/lanes.ts";
import { buildSdkOptions } from "../src/sdkEngine.ts";
import { Ledger } from "../src/ledger.ts";
import {
  AGENT_TOOLS, DEFAULT_KEYCHAIN_SERVICE, HarnessRefusal, RunnerDriver, SpendMeter, SpendStop, autoAnswer, checkInit, checkOptions, guardQuery,
  harnessEnv, hideKey, keychainRefFrom, ledgerSpent, makeThrowawayConfigDir, parseArgs, runCases, type Case, type Proc,
} from "../scripts/realrun-harness.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-rh-${l}-`))); made.push(d); return d; };
const KEY = "sk-ant-api03-harness-test-value-123";
const BIN = "/bundled/claude";
const sig = new AbortController().signal;

describe("the command line", () => {
  test("a dry run is the default; spending needs --spend", () => {
    expect(parseArgs([])).toMatchObject({ spend: false, only: [] });
    expect(parseArgs(["--dry-run", "drive"])).toMatchObject({ spend: false, only: ["drive"] });
    expect(parseArgs(["--spend", "a", "b"])).toMatchObject({ spend: true, only: ["a", "b"] });
  });
  test("both, an unknown flag, or a stop that is not a positive number is refused", () => {
    expect(parseArgs(["--spend", "--dry-run"])).toHaveProperty("error");
    expect(parseArgs(["--yes"])).toHaveProperty("error");
    for (const bad of ["--total-usd=0", "--total-usd=-1", "--per-case-usd=abc", "--timeout-s=", "--total-usd=Infinity"]) expect(parseArgs([bad]), bad).toHaveProperty("error");
    expect(parseArgs(["--total-usd=2.5", "--per-case-usd=0.4", "--timeout-s=90"])).toMatchObject({ totalUsd: 2.5, perCaseUsd: 0.4, timeoutS: 90 });
  });
  test("a script's own flags are allowed only when it names them", () => {
    expect(parseArgs(["--cheap"])).toHaveProperty("error");
    expect((parseArgs(["--cheap"], ["--cheap"]) as any).flags.has("--cheap")).toBe(true);
  });
  test("the key comes from the companion-dev Keychain item unless another is named", () => {
    expect(DEFAULT_KEYCHAIN_SERVICE).toBe("companion-dev");
    expect(keychainRefFrom({}).service).toBe("companion-dev");
    expect(keychainRefFrom({ COMPANION_KEYCHAIN_SERVICE: " companion-test-x ", COMPANION_KEYCHAIN_ACCOUNT: "acct" })).toEqual({ service: "companion-test-x", account: "acct" });
  });
});

describe("the spending stops", () => {
  test("a case is stopped once it spends more than its own stop", () => {
    const m = new SpendMeter(0.5, 2);
    m.startCase("a", 0.2);
    m.settle("q1", 0.15);
    expect(() => m.settle("q2", 0.1)).toThrow(SpendStop);
    expect(m.caseSpent).toBeCloseTo(0.25, 6); expect(m.totalSpent).toBeCloseTo(0.25, 6);
  });
  test("money still in flight counts, and is replaced when it settles", () => {
    const m = new SpendMeter(1, 2);
    m.startCase("a");
    m.pending("q", 0.3); expect(m.caseSpent).toBeCloseTo(0.3, 6);
    m.settle("q", 0.25); expect(m.caseSpent).toBeCloseTo(0.25, 6);
    expect(() => m.pending("r", 0.8)).toThrow(SpendStop);
  });
  test("the total stop holds across cases, and says which stop it was", () => {
    const m = new SpendMeter(1, 1);
    m.startCase("a"); m.settle("q", 0.7);
    m.startCase("b");
    let scope = "";
    try { m.settle("q", 0.4); } catch (e) { scope = (e as SpendStop).scope; }
    expect(scope).toBe("total");
    expect(m.remaining()).toBeLessThanOrEqual(0);
  });
  test("a case's own stop is never above the per case stop", () => {
    const m = new SpendMeter(0.3, 5);
    m.startCase("a", 9);
    expect(() => m.settle("q", 0.31)).toThrow(SpendStop);
  });
});

describe("the throwaway Claude Code folder and the environment", () => {
  test("a new private folder, never ~/.claude", () => {
    const d = makeThrowawayConfigDir(tmp("root")); made.push(d);
    expect(existsSync(d)).toBe(true);
    expect(d.startsWith(join(homedir(), ".claude"))).toBe(false);
    expect(statSync(d).mode & 0o777).toBe(0o700);
  });
  test("the throwaway folder wins over one set in the shell, the key is there, and the two safety switches are on", () => {
    const d = tmp("cfg");
    const env = harnessEnv({ apiKey: KEY, configDir: d, parent: { PATH: "/usr/bin", HOME: "/Users/x", CLAUDE_CONFIG_DIR: "/Users/x/.claude", ANTHROPIC_BASE_URL: "https://elsewhere.example", CLAUDE_CODE_OAUTH_TOKEN: "t" } });
    expect(env.CLAUDE_CONFIG_DIR).toBe(d);
    expect(env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1"); expect(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB).toBe("1");
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined(); expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });
  test("the key is hidden in anything printed", () => {
    expect(hideKey(`failed: ${KEY} and again ${KEY}`, KEY)).not.toContain(KEY);
    expect(hideKey("a stray sk-ant-api03-ABCdef_123-xyz key", "other")).not.toMatch(/sk-ant-api03-ABC/);
  });
});

// Options exactly as the product builds them, with the harness environment.
const good = () => {
  const cfg = tmp("cfg");
  const env = harnessEnv({ apiKey: KEY, configDir: cfg, parent: { PATH: "/usr/bin", HOME: "/Users/x" } });
  return { cfg, env, fast: buildFastOptions({ claudeBinary: BIN, env, model: "claude-haiku-4-5-20251001", signal: sig }) as any, agent: buildSdkOptions({ project: "/tmp", model: "claude-sonnet-5-5", budgetUsd: 0.1, claudeBinary: BIN, env, authorize: async () => ({ allow: true, reason: "" }), signal: sig }) as any };
};

describe("checking the options before Claude starts", () => {
  test("the product's own options pass", () => {
    const g = good();
    expect(checkOptions(g.fast, { claudeBinary: BIN, configDirs: [g.cfg] })).toEqual([]);
    expect(checkOptions(g.agent, { claudeBinary: BIN, configDirs: [g.cfg] })).toEqual([]);
  });
  test("anything unsafe or unchecked is named", () => {
    const g = good();
    const ex = { claudeBinary: BIN, configDirs: [g.cfg] };
    expect(checkOptions({ ...g.agent, permissionMode: "bypassPermissions" }, ex).join(" ")).toMatch(/bypassPermissions/);
    expect(checkOptions({ ...g.agent, allowDangerouslySkipPermissions: true }, ex)).not.toEqual([]);
    expect(checkOptions({ ...g.fast, settingSources: undefined }, ex).join(" ")).toMatch(/settingSources/);
    expect(checkOptions({ ...g.fast, strictMcpConfig: false }, ex).join(" ")).toMatch(/strictMcpConfig/);
    expect(checkOptions({ ...g.fast, pathToClaudeCodeExecutable: "/usr/local/bin/claude" }, ex).join(" ")).toMatch(/bundled/);
    expect(checkOptions({ ...g.fast, mcpServers: { x: { command: "y" } } }, ex)).not.toEqual([]);
    expect(checkOptions({ ...g.fast, env: { ...g.env, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "0" } }, ex).join(" ")).toMatch(/SUBPROCESS_ENV_SCRUB/);
    expect(checkOptions({ ...g.fast, env: { ...g.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: undefined } }, ex).join(" ")).toMatch(/AUTO_MEMORY/);
    expect(checkOptions({ ...g.fast, env: { ...g.env, CLAUDE_CONFIG_DIR: join(homedir(), ".claude") } }, ex).join(" ")).toMatch(/CLAUDE_CONFIG_DIR/);
    expect(checkOptions({ ...g.fast, env: { ...g.env, ANTHROPIC_API_KEY: undefined } }, ex).join(" ")).toMatch(/key/i);
    expect(checkOptions({ ...g.fast, model: "claude-sonnet-5-5", thinking: { type: "disabled" } }, ex).join(" ")).toMatch(/disabled/);
  });
  test("the problems never contain the key", () => {
    const g = good();
    expect(JSON.stringify(checkOptions({ ...g.fast, strictMcpConfig: false, pathToClaudeCodeExecutable: KEY }, { claudeBinary: BIN, configDirs: [g.cfg] }))).not.toContain(KEY);
  });
});

const init = (o: Record<string, unknown> = {}) => ({ type: "system", subtype: "init", session_id: "s1", tools: [], mcp_servers: [], plugins: [], model: "claude-haiku-4-5-20251001", permissionMode: "default", apiKeySource: "ANTHROPIC_API_KEY", ...o });

describe("checking system/init", () => {
  test("a lane with no tools: exactly none", () => {
    expect(checkInit(init(), { tools: [], model: "claude-haiku-4-5-20251001" })).toEqual([]);
    expect(checkInit(init({ tools: ["Bash"] }), { tools: [] }).join(" ")).toMatch(/Bash/);
  });
  test("an agent session: only plain built in tools, never a connector or a plugin", () => {
    expect(checkInit(init({ tools: ["Bash", "Read", "Edit", "Write", "Glob", "Grep"] }), { tools: "agent" })).toEqual([]);
    expect(checkInit(init({ tools: ["Read", "mcp__claude_ai_Gmail__send"] }), { tools: "agent" }).join(" ")).toMatch(/mcp__/);
    expect(checkInit(init({ tools: ["Read", "RemoteTrigger"] }), { tools: "agent" }).join(" ")).toMatch(/RemoteTrigger/);
    expect(checkInit(init({ mcp_servers: [{ name: "claude.ai Gmail", status: "connected" }] }), { tools: "agent" })).not.toEqual([]);
    expect(checkInit(init({ plugins: [{ name: "p", path: "/x" }] }), { tools: "agent" })).not.toEqual([]);
    expect(AGENT_TOOLS).toContain("Bash"); expect(AGENT_TOOLS.some((t) => t.startsWith("mcp__"))).toBe(false);
  });
  test("the API key route, the model asked for, and never bypassPermissions", () => {
    expect(checkInit(init({ apiKeySource: "none" }), { tools: [] }).join(" ")).toMatch(/ANTHROPIC_API_KEY/);
    expect(checkInit(init({ model: "claude-opus-5-5" }), { tools: [], model: "claude-haiku-4-5" }).join(" ")).toMatch(/model/);
    expect(checkInit(init({ permissionMode: "bypassPermissions" }), { tools: [] })).not.toEqual([]);
  });
});

// A stand in for the SDK's query: yields the given messages, and records whether it was started and stopped.
function stubQuery(msgs: unknown[], o: { hang?: boolean } = {}) {
  const st = { started: 0, params: undefined as any };
  const fn = ((params: any) => {
    st.started++; st.params = params;
    return (async function* () {
      for (const m of msgs) { if (params.options.abortController?.signal.aborted) throw new Error("aborted"); yield m; }
      if (o.hang) await new Promise((_, no) => params.options.abortController.signal.addEventListener("abort", () => no(new Error("aborted"))));
    })();
  }) as any;
  return { fn, st };
}
const drain = async (it: AsyncIterable<unknown>) => { const out: any[] = []; for await (const m of it) out.push(m); return out; };
const assistant = (id: string, usage: Record<string, number>) => ({ type: "assistant", message: { id, content: [{ type: "text", text: "ok" }], usage } });
const result = (usd: number, session = "s1") => ({ type: "result", subtype: "success", total_cost_usd: usd, session_id: session });

describe("the guarded query", () => {
  test("bad options: Claude is never started", async () => {
    const g = good(); const s = stubQuery([init()]); const meter = new SpendMeter(1, 1); meter.startCase("a");
    const q = guardQuery(s.fn, { meter, expect: { tools: [], claudeBinary: BIN, configDirs: [g.cfg] } });
    expect(() => q({ prompt: "x", options: { ...g.fast, permissionMode: "bypassPermissions" } })).toThrow(HarnessRefusal);
    expect(s.st.started).toBe(0);
  });
  test("an unexpected tool at system/init stops the run there and says why", async () => {
    const g = good(); const s = stubQuery([init({ tools: ["Bash"] }), assistant("m1", { input_tokens: 10 }), result(0.01)]); const meter = new SpendMeter(1, 1); meter.startCase("a");
    const q = guardQuery(s.fn, { meter, expect: { tools: [], claudeBinary: BIN, configDirs: [g.cfg] } });
    await expect(drain(q({ prompt: "x", options: g.fast }))).rejects.toThrow(/system\/init.*Bash/);
    expect(s.st.params.options.abortController.signal.aborted).toBe(true);
  });
  test("a clean run passes every message through and books Claude Code's own cost", async () => {
    const g = good(); const s = stubQuery([init(), assistant("m1", { input_tokens: 1000, output_tokens: 10 }), result(0.004)]); const meter = new SpendMeter(1, 1); meter.startCase("a");
    let seen: any;
    const q = guardQuery(s.fn, { meter, expect: { tools: [], model: "claude-haiku-4-5-20251001", claudeBinary: BIN, configDirs: [g.cfg] }, onInit: (m) => { seen = m; } });
    const out = await drain(q({ prompt: "x", options: g.fast }));
    expect(out.map((m) => m.type)).toEqual(["system", "assistant", "result"]);
    expect(seen.session_id).toBe("s1");
    expect(meter.caseSpent).toBeCloseTo(0.004, 6);
  });
  test("spending past the case's stop mid run ends the run before the reply finishes", async () => {
    const g = good(); const s = stubQuery([init({ model: "claude-sonnet-5-5", tools: ["Read"] }), assistant("m1", { input_tokens: 400_000 }), result(1)], { hang: true }); const meter = new SpendMeter(0.5, 5); meter.startCase("a");
    const q = guardQuery(s.fn, { meter, expect: { tools: "agent", claudeBinary: BIN, configDirs: [g.cfg] } });
    await expect(drain(q({ prompt: "x", options: g.agent }))).rejects.toThrow(SpendStop);
    expect(s.st.params.options.abortController.signal.aborted).toBe(true);
    expect(meter.caseSpent).toBeGreaterThan(0.5);   // the estimate is booked as spent
  });
  test("a continued conversation books only what this round cost", async () => {
    const g = good(); const meter = new SpendMeter(1, 1); meter.startCase("a");
    const ex = { tools: "agent" as const, claudeBinary: BIN, configDirs: [g.cfg] };
    const shared = new Map<string, number>();
    await drain(guardQuery(stubQuery([init({ model: "claude-sonnet-5-5" }), result(0.05)]).fn, { meter, expect: ex, sessions: shared })({ prompt: "x", options: g.agent }));
    await drain(guardQuery(stubQuery([init({ model: "claude-sonnet-5-5" }), result(0.08)]).fn, { meter, expect: ex, sessions: shared })({ prompt: "y", options: { ...g.agent, resume: "s1" } }));
    expect(meter.caseSpent).toBeCloseTo(0.08, 6);
  });
  test("a run that ends without a result still books its estimate", async () => {
    const g = good(); const meter = new SpendMeter(1, 1); meter.startCase("a");
    const q = guardQuery(stubQuery([init(), assistant("m1", { input_tokens: 1_000_000 })]).fn, { meter, expect: { tools: [], claudeBinary: BIN, configDirs: [g.cfg] } });
    await drain(q({ prompt: "x", options: g.fast }));
    expect(meter.caseSpent).toBeCloseTo(1, 6);   // Haiku 4.5: $1 a million input tokens
  });
});

const quiet = () => { const lines: string[] = []; return { lines, out: (l: string) => lines.push(l) }; };
const caseOf = (name: string, run: Case["run"], estimateUsd = 0.01, more: Partial<Case> = {}): Case => ({ name, what: `checks ${name}`, models: ["claude-haiku-4-5-20251001"], estimateUsd, run, ...more });
const never = { readKey: async () => { throw new Error("the key was read"); }, query: (() => { throw new Error("Claude was started"); }) as any, claudeBinary: () => BIN };

describe("running the cases", () => {
  test("a dry run prints the plan and touches nothing: no key read, no Claude, no case run", async () => {
    const o = quiet(); let ran = 0;
    const code = await runCases("Smoke", [caseOf("one", async () => { ran++; return true; }), caseOf("two", async () => { ran++; return true; }, 0.02)], parseArgs([]) as any, { ...never, out: o.out, totalUsd: 1, perCaseUsd: 0.5 });
    expect(code).toBe(0); expect(ran).toBe(0);
    const text = o.lines.join("\n");
    expect(text).toMatch(/one/); expect(text).toMatch(/two/); expect(text).toMatch(/--spend/); expect(text).toMatch(/[Nn]othing was (sent|spent)/);
    expect(text).toMatch(/companion-dev/);
  });
  test("an unknown case name is refused", async () => {
    const o = quiet();
    expect(await runCases("Smoke", [caseOf("one", async () => true)], parseArgs(["nope"]) as any, { ...never, out: o.out, totalUsd: 1, perCaseUsd: 0.5 })).toBe(2);
  });
  test("with --spend and no key: nothing is run or spent, and it says where the key should be", async () => {
    const o = quiet(); let ran = 0;
    const code = await runCases("Smoke", [caseOf("one", async () => { ran++; return true; })], parseArgs(["--spend"]) as any, { ...never, readKey: async () => null, out: o.out, totalUsd: 1, perCaseUsd: 0.5 });
    expect(code).toBe(2); expect(ran).toBe(0);
    expect(o.lines.join("\n")).toMatch(/companion-dev/);
  });
  test("a plan whose estimate is over the total stop is refused before the key is read", async () => {
    const o = quiet();
    expect(await runCases("Smoke", [caseOf("big", async () => true, 3)], parseArgs(["--spend"]) as any, { ...never, out: o.out, totalUsd: 1, perCaseUsd: 5 })).toBe(2);
  });
  test("each case gets the key route, a throwaway folder and a guarded query; the folder is removed afterwards", async () => {
    const o = quiet(); let ctxSeen: any;
    const s = stubQuery([init(), result(0.001)]);
    const code = await runCases("Smoke", [caseOf("one", async (ctx) => { ctxSeen = ctx; await drain(ctx.guard({ tools: [] })({ prompt: "x", options: buildFastOptions({ claudeBinary: ctx.claudeBinary, env: ctx.env, model: "claude-haiku-4-5-20251001", signal: ctx.signal }) as never })); return true; })],
      parseArgs(["--spend"]) as any, { readKey: async () => KEY, query: s.fn, claudeBinary: () => BIN, out: o.out, totalUsd: 1, perCaseUsd: 0.5, tmpRoot: tmp("root") });
    expect(code).toBe(0);
    expect(ctxSeen.env.ANTHROPIC_API_KEY).toBe(KEY);
    expect(ctxSeen.env.CLAUDE_CONFIG_DIR).toBe(ctxSeen.configDir);
    expect(existsSync(ctxSeen.configDir)).toBe(false);
    expect(o.lines.join("\n")).not.toContain(KEY);
    expect(o.lines.join("\n")).toMatch(/PASS\s+one/);
  });
  test("a case that hangs is ended at its time limit, its cleanups run, and the next case still runs", async () => {
    const o = quiet(); let cleaned = false, second = false;
    const code = await runCases("Smoke", [
      caseOf("stuck", async (ctx) => { ctx.onCleanup(() => { cleaned = true; }); await new Promise(() => {}); return true; }, 0.01, { timeoutS: 0.05 }),
      caseOf("next", async () => { second = true; return true; }),
    ], parseArgs(["--spend"]) as any, { readKey: async () => KEY, query: stubQuery([]).fn, claudeBinary: () => BIN, out: o.out, totalUsd: 1, perCaseUsd: 0.5, tmpRoot: tmp("root") });
    expect(code).toBe(1); expect(cleaned).toBe(true); expect(second).toBe(true);
    expect(o.lines.join("\n")).toMatch(/FAIL\s+stuck.*time/i);
  });
  test("once the total stop is reached the rest are not run, and an error never prints the key", async () => {
    const o = quiet(); let third = false;
    const code = await runCases("Smoke", [
      caseOf("leaky", async () => { throw new Error(`boom ${KEY}`); }),
      caseOf("spends", async (ctx) => { ctx.meter.settle("x", 0.6); return true; }),
      caseOf("over", async (ctx) => { ctx.meter.settle("y", 0.5); return true; }),
      caseOf("later", async () => { third = true; return true; }),
    ], parseArgs(["--spend"]) as any, { readKey: async () => KEY, query: stubQuery([]).fn, claudeBinary: () => BIN, out: o.out, totalUsd: 1, perCaseUsd: 0.9, tmpRoot: tmp("root") });
    expect(code).toBe(1); expect(third).toBe(false);
    const text = o.lines.join("\n");
    expect(text).toMatch(/total spending stop/i); expect(text).toMatch(/not run.*later|later.*not run/i);
    expect(text).not.toContain(KEY);
  });
});

describe("answering the runner's questions so a real run never waits forever", () => {
  test("a loop card is answered (stop, or a different approach when asked), and the answer is a valid command", () => {
    const e = { type: "loop.stuck", agent: "b1", index: 0, title: "Fix it", failure: { label: "Tests", detail: "1 failed" }, options: [{ id: "different", label: "Try a different way" }, { id: "stop", label: "Stop" }] };
    const a = autoAnswer(e)!;
    expect(a).toMatchObject({ type: "loop.choose", agent: "b1", choice: "stop" });
    expect(parseCommand(JSON.stringify(a)).ok).toBe(true);
    expect(autoAnswer(e, { loopChoice: "different" })).toMatchObject({ choice: "different" });
  });
  test("an approval card is denied, the shared files question is answered yes in the throwaway project", () => {
    const deny = autoAnswer({ type: "approval.request", approval: "ap1", agent: "b1" })!;
    expect(deny).toMatchObject({ type: "approval.resolve", approval: "ap1", decision: "deny", scope: "once" });
    expect(parseCommand(JSON.stringify(deny)).ok).toBe(true);
    const yes = autoAnswer({ type: "memory.agents_ask", project: "/tmp/p", files: ["AGENTS.md"] })!;
    expect(yes).toMatchObject({ type: "memory.agents", project: "/tmp/p", answer: "yes" });
    expect(parseCommand(JSON.stringify(yes)).ok).toBe(true);
    expect(autoAnswer({ type: "receipt" })).toBeNull();
  });
});

// A stand in for the runner process: lines in, lines out.
function fakeProc(script: (line: string, emit: (e: unknown) => void) => void) {
  const sent: string[] = []; let push!: (l: string | null) => void; const queue: (string | null)[] = []; let wake: (() => void) | null = null;
  push = (l) => { queue.push(l); wake?.(); };
  const proc: Proc = {
    write: (line) => { sent.push(line); script(line, (e) => push(JSON.stringify(e))); },
    lines: (async function* () { for (;;) { while (queue.length) { const l = queue.shift()!; if (l === null) return; yield l; } await new Promise<void>((r) => { wake = r; }); wake = null; } })(),
    kill: () => push(null),
    exited: Promise.resolve(0),
  };
  return { proc, sent, emit: (e: unknown) => push(JSON.stringify(e)) };
}

describe("the runner driver", () => {
  test("the key goes over the pipe first, as the app hands it, and ready waits for the key route", async () => {
    const f = fakeProc((line, emit) => { if (line.includes('"auth.key"')) emit({ v: 1, id: "r2", type: "auth.status", method: "api_key", source: "keychain" }); });
    const d = new RunnerDriver(f.proc, { key: KEY });
    f.emit({ v: 1, id: "r0", type: "runner.hello", runnerVersion: "0", sdk: "x" });
    f.emit({ v: 1, id: "r1", type: "auth.status", method: "none" });
    d.start();
    expect(await d.ready({ auth: true }, 2000)).toBe(true);
    expect(f.sent[0].startsWith('{"v":1,"type":"auth.key"')).toBe(true);
    expect(d.log().join("\n")).not.toContain(KEY);
    d.stop();
  });
  test("a loop card is answered and recorded, so the task ends with its receipt", async () => {
    const f = fakeProc((line, emit) => { const c = JSON.parse(line); if (c.type === "loop.choose") emit({ v: 1, id: "e2", type: "receipt", agent: c.agent, checkpoint: "c", changed: [], commands: 0, notUndoable: [], proof: "failed", usdEstimate: 0.01 }); });
    const d = new RunnerDriver(f.proc, {});
    d.start();
    f.emit({ v: 1, id: "e1", type: "loop.stuck", agent: "b1", index: 0, title: "Fix", failure: { label: "Tests", detail: "same" }, options: [] });
    const rec = await d.until((e) => e.type === "receipt", 2000);
    expect(rec).not.toBeNull();
    expect(d.stuck).toHaveLength(1);
    expect(JSON.parse(f.sent.find((l) => l.includes("loop.choose"))!)).toMatchObject({ choice: "stop", agent: "b1" });
    d.stop();
  });
  test("waiting gives up at its time limit", async () => {
    const d = new RunnerDriver(fakeProc(() => {}).proc, {}); d.start();
    const t0 = Date.now();
    expect(await d.until((e) => e.type === "receipt", 150)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
    d.stop();
  });
});

describe("reading what a runner process spent", () => {
  test("the ledger's total, or nothing when there is no ledger yet", () => {
    const data = tmp("data");
    expect(ledgerSpent(data)).toBe(0);
    const l = new Ledger(join(data, "ledger.db"));
    l.add("/p1", 0.12); l.add("/p2", 0.03);
    expect(ledgerSpent(data)).toBeCloseTo(0.15, 6);
  });
});
