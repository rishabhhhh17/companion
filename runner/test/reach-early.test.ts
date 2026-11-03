// Must fix 16 (review of 4 Nov): offline, a fix sat at Working for minutes, because Claude Code tries a failed request
// again and again (10 times by default in the pinned 0.3.293 binary: CLAUDE_CODE_MAX_RETRIES, read from it) and Squibby
// only looked at the connection inside the build step. Now one quick look (a name lookup, 3 seconds at most) runs before
// a task, a review, Prompt help and Explain, and "could not reach Claude" is said at once. [verify] the real times on a
// Mac with the Wi-Fi off (reach.ts).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeReachable, reachHost, NOT_REACHED } from "../src/reach.ts";
import { buildChildEnv } from "../src/safety.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { createLanes, readSettings } from "../src/engines.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-reach-${l}-`))); made.push(d); return d; };

describe("the quick look at the connection", () => {
  test("a name that resolves is reachable; one that fails, or takes too long, is not", async () => {
    expect(await claudeReachable("api.anthropic.com", async () => ({ address: "1.2.3.4", family: 4 }) as never)).toBe(true);
    expect(await claudeReachable("api.anthropic.com", async () => { throw new Error("ENOTFOUND"); })).toBe(false);
    const t = Date.now();
    expect(await claudeReachable("api.anthropic.com", () => new Promise(() => {}), 30)).toBe(false);
    expect(Date.now() - t).toBeLessThan(1000);
  });
  test("it looks up the service the request really goes to", () => {
    expect(reachHost({ route: "api_key" })).toBe("api.anthropic.com");
    expect(reachHost({ route: "plan" })).toBe("api.anthropic.com");
    expect(reachHost({ route: "managed", managedBase: "https://usage.example.com/v1" })).toBe("usage.example.com");
    expect(reachHost({ route: "managed" })).toBeNull();
  });
  test("its words are the usual no connection stop, so the card says it plainly with Try again", () => {
    expect(NOT_REACHED).toMatch(/^no_connection: /);
  });
  test("the proof ladder uses the same look", async () => {
    const ladder = await Bun.file(new URL("../src/proof/ladder.ts", import.meta.url)).text();
    expect(ladder).toContain('import { claudeReachable } from "../reach.ts";');
    expect(ladder).not.toContain("const anthropicReachable");
  });
});

describe("Claude Code gives up sooner", () => {
  test("every Claude Code run tries a failed request at most 3 more times", () => {
    expect(buildChildEnv({ PATH: "/usr/bin" }, { route: "plan" }).CLAUDE_CODE_MAX_RETRIES).toBe("3");
  });
});

describe("a task while offline", () => {
  test("stops at once with could not reach Claude, without starting Claude Code", async () => {
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    let asked = 0;
    const engine = new ScriptedEngine([{ text: "hello", costUsd: 0.01 }]);
    const start = engine.start.bind(engine);
    engine.start = ((o: never) => { asked++; return start(o); }) as never;
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }), reachable: async () => false });
    const t = Date.now();
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "fix it", model: "m", budgetUsd: 1 });
    expect(Date.now() - t).toBeLessThan(5000);
    expect(asked).toBe(0);
    const err = events.find((e) => e.type === "protocol.error") as any;
    expect(String(err.reason)).toMatch(/^no_connection: /);
    const r = events.find((e) => e.type === "receipt") as any;
    expect(r.endedWhy).toBe("no_connection");
  });
  test("online, the task runs as usual", async () => {
    const project = tmp("p2"); writeFileSync(join(project, "a.txt"), "x");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s2"), engine: new ScriptedEngine([{ text: "hello", costUsd: 0.01 }]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }), reachable: async () => true });
    await runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a1", mode: "drive", prompt: "fix it", model: "m", budgetUsd: 1 });
    expect((events.find((e) => e.type === "receipt") as any).ended).toBe("done");
  });
});

describe("Prompt help, Explain and a review's words while offline", () => {
  test("the light lanes say could not reach Claude at once, before Claude Code starts", async () => {
    let started = 0;
    const s = { ...readSettings({ COMPANION_ENGINE: "sdk", COMPANION_DATA: tmp("d") }), assistStub: false };
    const lanes = createLanes(s, { queryFn: (() => { started++; throw new Error("never"); }) as never, reachable: async () => false });
    await expect(lanes.fast.run({ text: "make it better" }, () => {}, new AbortController().signal)).rejects.toThrow(/^no_connection: /);
    expect(started).toBe(0);
  });
  test("the engine asks for the look only with the real Claude", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toMatch(/reachable: settings\.engine === "sdk" \? claudeOnline : undefined/);
  });
});
