// M75 (finishes M58 A4): a sign in wall hands over to the person. The task's check waits; Open the sign in page opens a
// visible window from a temporary profile; Continue carries that window's sign in (in memory only) to the hidden check once;
// Skip, the wait running out and Stop everything keep "not proven". Squibby never types, never reads a field. A static page
// served by the ladder itself, a stand in window and a stand in browser: nothing reaches the network, no real project.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, type Event } from "../../protocol/index.ts";
import { AgentRunner, type SignInWindow } from "../src/agent.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { Ledger } from "../src/ledger.ts";
import { SIGN_IN_GAP, type BrowserOptions, type BrowserResult } from "../src/proof/browser.ts";
import { runLadder, type LadderOptions } from "../src/proof/ladder.ts";
import { RunnerSettings } from "../src/settings.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m75-signin-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const until = async (fn: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 10 && !fn(); i++) await Bun.sleep(10); expect(fn()).toBe(true); };
const SIGNED = { cookies: [{ name: "session", value: "opaque", domain: "127.0.0.1", path: "/" }], origins: [] };

/** A browser that meets a sign in wall unless it is handed the window's sign in; then the page behind it is `behind`. */
function standInBrowser(behind: Partial<BrowserResult> = {}) {
  const asked: BrowserOptions[] = [];
  const fn = async (url: string, o: BrowserOptions): Promise<BrowserResult> => {
    asked.push(o);
    const base = { ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [url], ms: 1 };
    return (o as { storageState?: unknown }).storageState ? { ...base, ...behind } : { ...base, gaps: [SIGN_IN_GAP] };
  };
  return { fn, asked };
}
/** A window the person would sign into. It records every call; nothing in it fills or presses anything. */
function standInWindow(o: { ready?: boolean } = {}) {
  const calls: string[] = [];
  const profiles: string[] = [];
  let open = false;
  const w: SignInWindow = {
    ready: () => o.ready !== false,
    open: async (url, profile) => {
      calls.push(`open ${url}`); profiles.push(profile); open = true;
      expect(existsSync(profile)).toBe(true);
      return { state: async () => { calls.push("state"); return SIGNED; }, close: async () => { calls.push("close"); open = false; } };
    },
    install: async () => { calls.push("install"); o.ready = true; return { ok: true, detail: "" }; },
  };
  return { w, calls, profiles, isOpen: () => open };
}

function setup(o: { behind?: Partial<BrowserResult>; ready?: boolean; values?: Record<string, unknown> } = {}) {
  const project = tmp("p"), data = tmp("data");
  writeFileSync(join(project, "index.html"), "<!doctype html><h1>Members</h1>");
  const events: Event[] = [];
  const b = standInBrowser(o.behind);
  const win = standInWindow({ ready: o.ready });
  const settings = new RunnerSettings();
  if (o.values) settings.apply({ v: 1, id: "s", type: "settings.apply", values: o.values });
  // One edit, so the task is checked.
  const engine = new ScriptedEngine([{ tool: { name: "Write", input: { file_path: "index.html", content: "<!doctype html><h1>Members area</h1>" } }, costUsd: 0.01 }, { text: "done", costUsd: 0.01 }]);
  const runner = new AgentRunner({
    shadowRoot: join(data, "shadow"), engine, log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger: new Ledger(":memory:"), settings,
    proof: (lo: LadderOptions) => runLadder({ ...lo, browser: b.fn, noRoomWaitsMs: [] }), signInWindow: win.w, signInProfiles: join(data, "signin"),
  });
  const start = () => runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "change the title", model: "claude-sonnet-5-5", budgetUsd: 5 });
  const choose = (choice: string) => runner.handle({ v: 1, id: `si-${choice}-${Math.random()}`, type: "proof.signIn", agent: "a", choice } as never);
  const stages = () => of(events, "proof.signIn").map((e) => e.stage);
  const profilesLeft = () => { try { return readdirSync(join(data, "signin")); } catch { return []; } };
  return { project, data, events, runner, start, choose, stages, b, win, profilesLeft };
}

describe("the handover", () => {
  test("a wall waits for the person; Open, then Continue, runs the check once more with the sign in, and a pass is passed", async () => {
    const t = setup();
    const run = t.start();
    await until(() => t.stages().includes("waiting"));
    expect(of(t.events, "proof.step").some((s) => s.rung === "browser" && s.needs === "signIn" && s.status === "running")).toBe(true);
    expect(of(t.events, "proof.result")).toEqual([]);   // never proven while it waits
    await t.choose("open");
    await until(() => t.stages().includes("opened"));
    expect(t.win.calls[0]).toMatch(/^open http:\/\/127\.0\.0\.1:\d+/);
    await t.choose("continue");
    await run;
    expect(t.stages()).toEqual(["waiting", "opened", "checking"]);
    expect(of(t.events, "proof.result").at(-1).verdict).toBe("passed");
    expect(t.b.asked.at(-1)).toMatchObject({ storageState: SIGNED });
    expect(t.win.calls).toEqual([expect.stringMatching(/^open /), "state", "close"]);
    expect(t.profilesLeft()).toEqual([]);
    for (const e of t.events) { const r = parseEvent(JSON.stringify(e)); expect(r.ok, JSON.stringify(e)).toBe(true); }
  });
  test("a page problem behind the sign in is a real problem", async () => {
    const t = setup({ behind: { ok: false, problems: ["The page crashed with: x is undefined"] } });
    const run = t.start();
    await until(() => t.stages().includes("waiting"));
    await t.choose("open"); await until(() => t.stages().includes("opened"));
    await t.choose("continue");
    await run;
    const res = of(t.events, "proof.result");
    expect(res.some((r) => r.verdict === "failed")).toBe(true);
  });
  test("Skip keeps the gap: passed with gaps, never passed, and nothing was opened", async () => {
    const t = setup();
    const run = t.start();
    await until(() => t.stages().includes("waiting"));
    await t.choose("skip");
    await run;
    expect(t.stages()).toEqual(["waiting", "skipped"]);
    expect(of(t.events, "proof.result").at(-1).verdict).toBe("passed_with_gaps");
    expect(t.win.calls).toEqual([]);
  });
  test("no press in time keeps the gap, and the window and its profile are gone", async () => {
    const t = setup({ values: { "point.yourTurnSeconds": 30 } });
    (t.runner as unknown as { signInWaits: { first: number; open: number } }).signInWaits = { first: 80, open: 80 };   // the waits in this test only
    const run = t.start();
    await run;
    expect(t.stages()).toEqual(["waiting", "timedOut"]);
    expect(of(t.events, "proof.result").at(-1).verdict).toBe("passed_with_gaps");
    expect(t.profilesLeft()).toEqual([]);
  });
  test("Stop everything ends it: the window closes and the profile is deleted", async () => {
    const t = setup();
    const run = t.start();
    await until(() => t.stages().includes("waiting"));
    await t.choose("open"); await until(() => t.stages().includes("opened"));
    expect(t.profilesLeft().length).toBe(1);
    await t.runner.handle({ v: 1, id: "all", type: "agent.interruptAll", reason: "hotkey" });
    await run;
    expect(t.win.isOpen()).toBe(false);
    expect(t.profilesLeft()).toEqual([]);
    expect(of(t.events, "receipt")[0].ended).toBe("stopped");
  });
  test("with no visible browser on this Mac, the card says so and the download runs only on the press", async () => {
    const t = setup({ ready: false });
    const run = t.start();
    await until(() => t.stages().includes("waiting"));
    await t.choose("open");
    await until(() => t.stages().includes("needsBrowser"));
    expect(t.win.calls).toEqual([]);
    await t.choose("getBrowser");
    await until(() => t.win.calls.includes("install"));
    await until(() => t.stages().filter((s) => s === "waiting").length === 2);
    await t.choose("open"); await until(() => t.stages().includes("opened"));
    await t.choose("continue");
    await run;
    expect(of(t.events, "proof.result").at(-1).verdict).toBe("passed");
  });
  test("the check is never told to type: no password, user name or fill option reaches the browser", async () => {
    const t = setup();
    const run = t.start();
    await until(() => t.stages().includes("waiting"));
    await t.choose("open"); await until(() => t.stages().includes("opened"));
    await t.choose("continue");
    await run;
    for (const o of t.b.asked) for (const k of Object.keys(o)) expect(k).not.toMatch(/pass|user|fill|type|credential|login/i);
  });
  test("an answer with nothing waiting is refused, and the command parses only with a known choice", async () => {
    const t = setup();
    await t.choose("continue");
    expect(of(t.events, "protocol.error").length).toBe(1);
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "proof.signIn", agent: "a", choice: "open" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ v: 1, id: "x", type: "proof.signIn", agent: "a", choice: "type" })).ok).toBe(false);
  });
});

describe("the ladder alone", () => {
  test("without a handover the wall is a gap, exactly as in M58", async () => {
    const dir = tmp("l");
    writeFileSync(join(dir, "index.html"), "<!doctype html><h1>Members</h1>");
    const store = new CheckpointStore(tmp("ls"), dir);
    const snap = await store.snapshot("now");
    const b = standInBrowser();
    const r = await runLadder({ project: dir, store, beforeId: snap.id, afterId: snap.id, noRoomWaitsMs: [], browser: b.fn });
    expect(r.verdict).toBe("passed_with_gaps");
    expect(b.asked).toHaveLength(1);
  });
});
