// Found by the robustness audit of the runner core: each of these used to go wrong on someone's real project or machine.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Ledger } from "../src/ledger.ts";
import { openDatabase } from "../src/db.ts";
import { clip, label, redact } from "../src/redact.ts";
import { parseEvent, serialize } from "../../protocol/index.ts";
import { ProjectWatcher } from "../src/watcher.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) { try { chmodSync(d, 0o755); } catch {} rmSync(d, { recursive: true, force: true }); } });
const wellFormed = (s: string) => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);
const tmp = (l = "x") => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-hc-${l}-`))); made.push(d); return d; };
const put = (root: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); } };

describe("undo never touches anything outside the project", () => {
  test("a folder that was a link out of the project and later became a real folder: undo does not delete the outside file", async () => {
    const outside = tmp("out"), project = tmp("proj");
    put(outside, { "new.txt": "MINE, not the project's" });
    symlinkSync(outside, join(project, "d"));
    put(project, { "a.txt": "a" });
    const store = new CheckpointStore(tmp("shadow"), project);
    const before = await store.snapshot("with the link");
    rmSync(join(project, "d"));
    mkdirSync(join(project, "d")); writeFileSync(join(project, "d", "new.txt"), "the agent made this");
    await store.snapshot("after");
    await store.restore(before.id);
    expect(readFileSync(join(outside, "new.txt"), "utf8")).toBe("MINE, not the project's");
    expect(lstatSync(join(project, "d")).isSymbolicLink()).toBe(true);
  });
  test("an env file that is a link to somewhere else is never written through", async () => {
    const outside = tmp("out2"), project = tmp("proj2");
    put(outside, { "secret.env": "OUTSIDE=1" });
    symlinkSync(join(outside, "secret.env"), join(project, ".env"));
    put(project, { "a.txt": "a" });
    const store = new CheckpointStore(tmp("shadow2"), project);
    const cp = await store.snapshot("with env link");
    expect(cp.envFiles).toEqual([]);                                      // a link is not copied into the saved state
    rmSync(join(project, ".env")); writeFileSync(join(project, ".env"), "NEW=1");
    await store.restore(cp.id);
    expect(readFileSync(join(outside, "secret.env"), "utf8")).toBe("OUTSIDE=1");
  });
  test("a link to another place in the project folder keeps working after undo", async () => {
    const project = tmp("proj3"); put(project, { "real/a.txt": "a" }); symlinkSync(join(project, "real"), join(project, "alias"));
    const store = new CheckpointStore(tmp("shadow3"), project);
    const cp = await store.snapshot("s"); writeFileSync(join(project, "real", "b.txt"), "b");
    await store.restore(cp.id);
    expect(existsSync(join(project, "real", "b.txt"))).toBe(false);
    expect(existsSync(join(project, "real", "a.txt"))).toBe(true);
  });
});

describe("snapshots cope with awkward projects", () => {
  test("one unreadable file does not stop the snapshot, and is reported", async () => {
    const project = tmp("unread"); put(project, { "ok.txt": "fine", "secret.txt": "x", "sub/also.txt": "y" });
    chmodSync(join(project, "secret.txt"), 0o000);
    const store = new CheckpointStore(tmp("shadow4"), project);
    const cp = await store.snapshot("s");
    expect(cp.files).toBeGreaterThanOrEqual(2);
    expect(cp.skipped.map((s) => s.path)).toContain("secret.txt");
    expect(cp.skipped.find((s) => s.path === "secret.txt")!.reason).toMatch(/could not be read/i);
    chmodSync(join(project, "secret.txt"), 0o644);
  });
  test("a file that grew past the size limit is skipped too, not saved again on every snapshot", async () => {
    const project = tmp("grow"); put(project, { "data.bin": "tiny", "ok.txt": "ok" });
    const shadow = tmp("shadow5"); const store = new CheckpointStore(shadow, project);
    await store.snapshot("small");
    writeFileSync(join(project, "data.bin"), "x".repeat(3 * 1024 * 1024));
    const cp = await store.snapshot("big");
    expect(cp.skipped.map((s) => s.path)).toContain("data.bin");
    const size = (d: string): number => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(join(d, e.name)) : lstatSync(join(d, e.name)).size), 0);
    expect(size(shadow)).toBeLessThan(1024 * 1024);
  });
  test("a folder that is its own git project is reported as not covered by undo, and does not break the snapshot", async () => {
    const project = tmp("nested"); put(project, { "a.txt": "a", "sub/f.txt": "f" });
    Bun.spawnSync(["git", "init", "-q", join(project, "sub")]);
    const store = new CheckpointStore(tmp("shadow6"), project);
    const cp = await store.snapshot("s");
    const nested = cp.skipped.find((s) => s.path.startsWith("sub"));
    expect(nested?.reason).toMatch(/own git/i);
    writeFileSync(join(project, "a.txt"), "changed");
    await store.restore(cp.id);
    expect(readFileSync(join(project, "a.txt"), "utf8")).toBe("a");
  });
  test("two snapshots at the same moment get different numbers and both are kept", async () => {
    const project = tmp("conc"); put(project, { "a.txt": "a" });
    const shadow = tmp("shadow7");
    const [a, b, c] = await Promise.all([1, 2, 3].map((i) => CheckpointStore.shared(shadow, project).snapshot(`s${i}`)));
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect((await CheckpointStore.shared(shadow, project).list()).length).toBe(3);
  });
  test("asking for the store of the same project twice gives the very same store", () => {
    const shadow = tmp("shadow8"), project = tmp("proj8");
    expect(CheckpointStore.shared(shadow, project)).toBe(CheckpointStore.shared(shadow, project));
  });
});

describe("a task that cannot even start leaves nothing stuck", () => {
  const w = (f: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: "x" } }, costUsd: 0.001 });
  const mk = (shadowRoot: string, log = new TaskLog(":memory:")) => {
    const project = tmp("stuckp"); put(project, { "a.txt": "a" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot, engine: new ScriptedEngine([[w("n.txt")]]), log, emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    const start = (agent = "a", p = project) => runner.handle({ v: 1, id: "c", type: "agent.start", project: p, agent, mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    return { project, events, runner, start, log };
  };
  const states = (e: Event[]) => e.filter((x) => x.type === "agent.state").map((x: any) => x.state);
  test("when the snapshot fails, the card gets an error state and a plain message, and the task row is finished", async () => {
    const file = join(tmp("notadir"), "file"); writeFileSync(file, "i am a file");        // the saved states folder is unusable
    const r = mk(file);
    await r.start();
    expect(states(r.events).at(-1)).toBe("error");
    expect(r.events.some((e) => e.type === "protocol.error")).toBe(true);
    expect(r.log.list().every((t) => t.status !== "running")).toBe(true);
  });
  test("a failed start does not block the next task for that agent", async () => {
    const r = mk(tmp("shadows"));
    await r.start("a");
    await r.start("a");
    expect(states(r.events).filter((s) => s === "done").length).toBe(2);
  });
});

describe("one agent or one project at a time", () => {
  const slow: Step = { text: "thinking", costUsd: 0, delayMs: 2500 };
  test("starting the same agent while it is busy is refused plainly and does not disturb the first task", async () => {
    const project = tmp("busy"); put(project, { "a.txt": "a" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[slow], [slow]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    const first = runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    await Bun.sleep(300);
    await runner.handle({ v: 1, id: "c2", type: "agent.start", project, agent: "a", mode: "drive", prompt: "y", model: "m", budgetUsd: 3 });
    expect(events.filter((e) => e.type === "protocol.error").map((e: any) => e.reason).join(" ")).toMatch(/already working/i);
    await runner.handle({ v: 1, id: "k", type: "agent.interrupt", agent: "a" });          // Stop still reaches the first one
    await first;
    expect(events.filter((e) => e.type === "receipt").length).toBe(1);
  });
  test("two agents on the same project at once are refused too, so they cannot trample each other", async () => {
    const project = tmp("busy2"); put(project, { "a.txt": "a" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[slow], [slow]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    const first = runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    await Bun.sleep(300);
    await runner.handle({ v: 1, id: "c2", type: "agent.start", project, agent: "b", mode: "drive", prompt: "y", model: "m", budgetUsd: 3 });
    expect(events.filter((e) => e.type === "protocol.error").map((e: any) => e.reason).join(" ")).toMatch(/already working on this project/i);
    await runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "t" });
    await first;
  });
  test("different projects run side by side", async () => {
    const p1 = tmp("pa"), p2 = tmp("pb"); put(p1, { "a.txt": "a" }); put(p2, { "a.txt": "a" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[slow], [slow]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    const a = runner.handle({ v: 1, id: "c1", type: "agent.start", project: p1, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    await Bun.sleep(200);
    const b = runner.handle({ v: 1, id: "c2", type: "agent.start", project: p2, agent: "b", mode: "drive", prompt: "y", model: "m", budgetUsd: 3 });
    await Bun.sleep(200);
    expect(events.some((e) => e.type === "protocol.error")).toBe(false);
    await runner.handle({ v: 1, id: "k", type: "agent.interruptAll", reason: "t" });
    await Promise.all([a, b]);
  });
  test("once a task has finished, the agent and the project are free again", async () => {
    const project = tmp("free"); put(project, { "a.txt": "a" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[], []]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    for (const id of ["c1", "c2"]) await runner.handle({ v: 1, id, type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 3 });
    expect(events.some((e) => e.type === "protocol.error")).toBe(false);
  });
});

describe("the local databases", () => {
  test("a damaged file is moved aside and a fresh one is started, not a crash", () => {
    const d = tmp("db"); const path = join(d, "tasks.db"); writeFileSync(path, "this is definitely not a database file at all, just text");
    const log = new TaskLog(path);
    log.finish(log.start({ project: "/p", agent: "a", mode: "drive", label: "x", startedAt: "t" }), "done", 0, "t");
    expect(log.list().length).toBe(1);
    expect(readdirSync(d).some((f) => f.startsWith("tasks.db.damaged"))).toBe(true);
  });
  test("two programs using the same file at once wait for each other instead of failing", () => {
    const d = tmp("db2"); const path = join(d, "ledger.db");
    const a = new Ledger(path), b = new Ledger(path);
    for (let i = 0; i < 200; i++) { a.add("/p", 0.001); b.add("/p", 0.001); }
    expect(a.spentToday("/p")).toBeCloseTo(0.4, 6);
  });
  test("they are set to wait a few seconds when the file is busy", () => {
    const d = tmp("db3"); const db = openDatabase(join(d, "x.db"));
    expect((db.query("PRAGMA busy_timeout").get() as any).timeout).toBeGreaterThanOrEqual(3000);
  });
  test("a folder that cannot be written falls back to memory instead of crashing, and says so", () => {
    const d = tmp("db4"); chmodSync(d, 0o500);
    const notes: string[] = [];
    const db = openDatabase(join(d, "sub", "x.db"), (m) => notes.push(m));
    db.run("create table t (a int)");
    expect(notes.join(" ")).toMatch(/could not be saved|not be saved/i);
  });
  test("tasks left 'running' by a crash are marked as interrupted when the log opens again", () => {
    const d = tmp("db5"); const path = join(d, "tasks.db");
    const first = new TaskLog(path); first.start({ project: "/p", agent: "a", mode: "drive", label: "x", startedAt: "t" });
    const again = new TaskLog(path);
    expect(again.list()[0].status).toBe("interrupted");
  });
});

describe("text that is cut or sent must stay valid", () => {
  const emoji = "😀";
  test("cutting text never splits a character in two", () => {
    for (let n = 1; n < 6; n++) { const c = clip("a" + emoji + emoji + "b", n); expect(wellFormed(c)).toBe(true); }
    expect(clip("hello", 10)).toBe("hello");
  });
  test("a label cut in the middle of an emoji is still valid text", () => {
    const l = label("x".repeat(119) + emoji + emoji, 120);
    expect(wellFormed(l)).toBe(true);
  });
  test("an event can never carry half a character, whatever produced it", () => {
    const lone = "ok " + String.fromCharCode(0xd83c) + " end";
    const line = serialize({ v: 1, id: "e", type: "protocol.error", reason: lone } as never);
    expect(line).not.toMatch(/\\ud8/i);
    expect(parseEvent(line).ok).toBe(true);
    expect(JSON.parse(line).reason).toContain("ok");
  });
});

describe("secrets in labels and logs", () => {
  const secrets = ["sk_live_abcdefghijklmnopqrstuvwxyz", "AIzaSyA-abcdefghijklmnopqrstuvwxyz0123456", "npm_abcdefghijklmnopqrstuvwxyz0123456789", "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "Bearer abcdefghijklmnopqrstuvwxyz0123", "postgres://admin:hunter2pass@db.example.com:5432/app", "password: correcthorsebatterystaple", "API_KEY=abcdefghijklmnopqrstuvwx", "AKIAABCDEFGHIJKLMNOP"];
  for (const s of secrets) test(`${s.slice(0, 14)}... is hidden`, () => {
    const r = redact(`please use ${s} for this`);
    expect(r).not.toContain(s.replace(/^(Bearer |password: |API_KEY=|postgres:\/\/admin:)/, ""));
    expect(r).toContain("please use");
  });
  test("ordinary words are not hidden", () => expect(redact("make the password field wider and add a token counter")).toBe("make the password field wider and add a token counter"));
});

describe("the take the wheel watcher forgets a tool that never reported back", () => {
  test("clearing the tools makes the person's next edit count again", async () => {
    const d = tmp("w"); const seen: string[] = [];
    const w = new ProjectWatcher(d, (p) => seen.push(p)); w.start();
    try {
      await Bun.sleep(100);
      w.begin("never-ends");
      w.clearTools();
      await Bun.sleep(700);
      writeFileSync(join(d, "mine.txt"), "x"); await Bun.sleep(700);
      expect(seen).toEqual(["mine.txt"]);
    } finally { w.stop(); }
  });
});

import { isSafeUrl } from "../src/research.ts";
describe("addresses that only look public", () => {
  for (const u of ["http://localhost./", "http://x.local./a", "http://foo.internal./", "http://metadata.google.internal./", "https://localhost%2e/", "http://localtest.me", "http://127.0.0.1.nip.io", "http://printer", "http://router.home", "http://mymac.lan", "http://kubernetes.default.svc", "http://foo.corp", "http://100.64.0.1", "http://198.18.0.1", "http://192.0.0.1", "http://192.0.2.1", "http://203.0.113.9", "http://224.0.0.1", "http://0.0.0.0", "http://a.b.test"]) {
    test(`refused: ${u}`, () => expect(isSafeUrl(u), u).toBe(false));
  }
  for (const u of ["https://developer.mozilla.org/en-US/docs/Web/HTML", "http://example.com", "https://docs.stripe.com/payments", "https://8.8.8.8/x", "https://a.b.co.uk/p?q=1"]) test(`allowed: ${u}`, () => expect(isSafeUrl(u), u).toBe(true));
});
