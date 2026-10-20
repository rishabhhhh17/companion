// The audit's smaller findings of 20 Oct 2026 that were fixed: spending outside a task counted against the day (A9), Rescue
// and Point at the problem waiting for an install (A10), a failed task's cost and Try again (A11), redaction formats (A22),
// switched off Python tests (A32), a port held by the person's own server (A33), a policy open to every account (A34) and
// the price of an unknown model (A36).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { AssistService, ImageStore } from "../src/lanes.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Ledger } from "../src/ledger.ts";
import type { Event } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-al-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const good = JSON.stringify({ nodes: [{ id: "page", label: "Signup page" }, { id: "api", label: "API route" }], edges: [{ from: "page", to: "api" }], broken: { edge: ["page", "api"], reason: "The route does not exist" }, caption: "Renamed route." });

describe("spending outside a task counts against the day (A9)", () => {
  const setup = (spentAlready = 0) => {
    const project = tmp("p"); writeFileSync(join(project, "package.json"), "{}");
    const events: Event[] = [];
    const ledger = new Ledger(":memory:");
    if (spentAlready) ledger.add(project, spentAlready);
    let asked = 0;
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), ledger, dailyCeilingUsd: 10,
      explainer: async () => { asked++; return { text: good, costUsd: 0.25 }; } });
    return { project, events, ledger, runner, asked: () => asked };
  };
  test("Draw it for me books what it cost", async () => {
    const s = setup();
    await s.runner.handle({ v: 1, id: "d", type: "diagram.ask", project: s.project, question: "why" } as never);
    expect(s.ledger.spentToday(s.project)).toBeCloseTo(0.25, 6);
  });
  test("at the daily limit, Draw it for me and the error explainer do not spend", async () => {
    const s = setup(10);
    await s.runner.handle({ v: 1, id: "d", type: "diagram.ask", project: s.project, question: "why" } as never);
    await s.runner.handle({ v: 1, id: "e", type: "error.explain", req: "r1", project: s.project, text: "TypeError: x is not a function" } as never);
    expect(s.asked()).toBe(0);
    expect(of(s.events, "diagram.ready")[0]).toMatchObject({ made: false });
    expect(of(s.events, "diagram.ready")[0].reason).toMatch(/daily spending limit/);
    expect(of(s.events, "error.explained")[0].reason).toMatch(/daily spending limit/);
  });
  test("the error explainer books what it cost", async () => {
    const s = setup();
    await s.runner.handle({ v: 1, id: "e", type: "error.explain", req: "r1", project: s.project, text: "TypeError: x is not a function" } as never);
    expect(s.ledger.spentToday(s.project)).toBeCloseTo(0.25, 6);
  });
  test("Prompt help books both of its calls against the project, and waits at the limit", async () => {
    const booked: [string | undefined, number][] = [];
    let room = 5, calls = 0;
    const events: Event[] = [];
    const long = "x ".repeat(400);
    const svc = new AssistService({ fast: { run: async () => { calls++; return { text: calls === 1 ? long : "Add a gallery page", costUsd: 0.01 }; } }, vision: { locate: async () => ({}) } as never, images: new ImageStore(), emit: (e) => events.push(e), spend: { room: () => room, book: (p, u) => booked.push([p, u]) } });
    await svc.handle({ v: 1, id: "a", type: "assist.prompt", req: "q1", app: "Cursor", target: "cursor", text: "add gallery", style: "full", project: "/p" } as never);
    expect(booked).toEqual([["/p", 0.01], ["/p", 0.01]]);
    room = 0; calls = 0;
    await svc.handle({ v: 1, id: "b", type: "assist.prompt", req: "q2", app: "Cursor", target: "cursor", text: "add gallery", style: "full", project: "/p" } as never);
    expect(calls).toBe(0);
    expect(of(events, "assist.error").at(-1)).toMatchObject({ req: "q2" });
    expect(of(events, "assist.error").at(-1).reason).toMatch(/daily spending limit/);
  });
});

describe("Rescue and Point at the problem wait for an install the person started (A10)", () => {
  test("both are refused while the install runs, and nothing is checked", async () => {
    const project = tmp("p"); writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { left: "1" } }));
    const events: Event[] = [];
    let release!: () => void;
    let checks = 0;
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => { checks++; return { verdict: "passed", steps: [] }; },
      commands: () => new Promise((res) => { release = () => res({ code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1 }); }) });
    const install = runner.handle({ v: 1, id: "i", type: "project.install", project } as never);
    for (let i = 0; i < 100 && !release; i++) await Bun.sleep(10);
    await runner.handle({ v: 1, id: "r", type: "rescue.diagnose", project, agent: "a", model: "m", budgetUsd: 1 } as never);
    await runner.handle({ v: 1, id: "f", type: "problem.find", project, agent: "b" } as never);
    expect(checks).toBe(0);
    const said = of(events, "protocol.error").map((e) => e.reason);
    expect(said.length).toBe(2);
    for (const r of said) expect(r).toMatch(/already working on this project/);
    release();
    await install;
  });
});

describe("a task that fails after it starts keeps its cost, and a failed start keeps Try again (A11)", () => {
  test("the task log has what the task spent before it failed", async () => {
    const { CheckpointStore } = await import("../src/checkpoints.ts");
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "start");
    const log = new TaskLog(":memory:");
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "a.txt", content: "x" } }, costUsd: 0.3 }]]), log, emit: () => {}, proof: async () => ({ verdict: "passed", steps: [] }) });
    const real = CheckpointStore.prototype.snapshot;
    CheckpointStore.prototype.snapshot = async function (this: any, label: string) { if (label.startsWith("After:")) throw new Error("git timed out"); return real.call(this, label); };
    try { await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 5 }); }
    finally { CheckpointStore.prototype.snapshot = real; }
    expect(log.list()[0]).toMatchObject({ status: "error" });
    expect(log.list()[0].usd).toBeCloseTo(0.3, 6);
  });
  test("a Try again whose first snapshot fails can be pressed again", async () => {
    const { CheckpointStore } = await import("../src/checkpoints.ts");
    const project = tmp("p"); writeFileSync(join(project, "a.txt"), "start");
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([[{ tool: { name: "Write", input: { file_path: "a.txt", content: "x" } }, costUsd: 0.01 }], [{ text: "ok", costUsd: 0.01 }]]), log: new TaskLog(":memory:"), emit: (e) => events.push(e), proof: async () => ({ verdict: "passed", steps: [] }) });
    await runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "x", model: "m", budgetUsd: 5 });
    const real = CheckpointStore.prototype.snapshot;
    CheckpointStore.prototype.snapshot = async () => { throw new Error("git timed out"); };
    try { await runner.handle({ v: 1, id: "t", type: "agent.send", agent: "a", project, retry: true } as never); }
    finally { CheckpointStore.prototype.snapshot = real; }
    await runner.handle({ v: 1, id: "t2", type: "agent.send", agent: "a", project, retry: true } as never);
    expect(of(events, "protocol.error").map((e) => e.reason).filter((r) => /no finished task/i.test(r))).toEqual([]);
    expect(of(events, "receipt").length).toBe(2);
  });
});

describe("secret formats the shell already hides are hidden here too (A22)", () => {
  test("each sample is hidden, in prose with no NAME=", async () => {
    const { redact } = await import("../src/redact.ts");
    const samples = [
      "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "rk_live_51HXjxqLkdIwHu7ixAbCdEfGh12345", "rk_test_51HXjxqLkdIwHu7ixAbCdEfGh12345",
      "SG.abcdefghijklmnopqrstuv.wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab", "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz", "re_c1tpEyD8_NKFusih9vKVQknRAQfmFcWCv",
    ];
    for (const s of samples) { const out = redact(`I put your key ${s} in .env`); expect(out, s).not.toContain(s); expect(out).toContain("[secret]"); }
  });
  test("ordinary words and names are left alone", async () => {
    const { redact } = await import("../src/redact.ts");
    for (const t of ["re_render_the_component_when_ready", "The SG.1 section", "sb_publishable_abc is public", "rk_value", "whsec is a word"]) expect(redact(t)).toBe(t);
  });
});

describe("Python tests switched off in other ways are caught (A32)", () => {
  test("xfail, a skip call, importorskip and expectedFailure added in a task each count as switching a test off", async () => {
    const { analyzeTests } = await import("../src/proof/testguard.ts");
    const before = { "tests/test_cart.py": "import pytest\n\ndef test_total():\n    assert total() == 15\n" };
    for (const after of [
      "import pytest\n\n@pytest.mark.xfail\ndef test_total():\n    assert total() == 15\n",
      "import pytest\n\ndef test_total():\n    pytest.skip('later')\n    assert total() == 15\n",
      "import pytest\n\ndef test_total():\n    pytest.xfail('known')\n",
      "import pytest\nnp = pytest.importorskip('numpy_not_here')\n\ndef test_total():\n    assert total() == 15\n",
      "import unittest\n\nclass T(unittest.TestCase):\n    @unittest.expectedFailure\n    def test_total(self):\n        assert total() == 15\n",
    ]) {
      const r = analyzeTests(before, { "tests/test_cart.py": after });
      expect(r.ok, after).toBe(false);
      expect(r.problems.join(" ")).toMatch(/switched off/);
    }
  });
});

describe("a port held by another program is not blamed on the project (A33)", () => {
  test("the server reports the port as busy, and the ladder makes it a gap, not a failure", async () => {
    const { startServer } = await import("../src/proof/server.ts");
    const dir = tmp("p");
    const srv = await startServer({ kind: "server", command: `sh -c 'echo "Error: listen EADDRINUSE: address already in use 127.0.0.1:3000" >&2; exit 1'` }, { cwd: dir, timeoutMs: 5000 });
    expect(srv).toMatchObject({ ok: false, portBusy: 3000 });
    const { CheckpointStore } = await import("../src/checkpoints.ts");
    const { runLadder } = await import("../src/proof/ladder.ts");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { dev: "node server.js", test: "vitest" } }));
    const store = new CheckpointStore(tmp("s"), dir);
    const s = await store.snapshot("now");
    const res = { code: 0, signal: null, stdout: "", stderr: "", timedOut: false, ms: 1 };
    const r = await runLadder({ project: dir, store, beforeId: s.id, afterId: s.id, run: (async () => res) as never, server: async () => srv as never, browser: (async () => ({ ok: true, problems: [], consoleErrors: [], failedRequests: [], visited: [], ms: 1 })) as never });
    expect(r.verdict).toBe("passed_with_gaps");
    expect(r.gaps?.join(" ")).toMatch(/Port 3000 is in use by another program/);
    expect(r.steps.find((x) => x.rung === "start")?.status).toBe("skipped");
  });
  test("the earlier version for the picture is not called crashed for it", async () => {
    const { captureBefore } = await import("../src/proof/before.ts");
    const { CheckpointStore } = await import("../src/checkpoints.ts");
    const dir = tmp("p");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { dev: "node server.js" } }));
    const store = new CheckpointStore(tmp("s"), dir);
    const s = await store.snapshot("now");
    const b = await captureBefore({ store, beforeId: s.id, project: dir, workDir: tmp("w"), server: async () => ({ ok: false, reason: "The server stopped on its own (exit code 1). listen EADDRINUSE", portBusy: 3000 }) as never });
    expect(b).toEqual({ none: "not_pictured" });
  });
});

describe("a rule that lets every signed in account read every row is not a protected table (A34)", () => {
  const supa = (sql: string) => { const d = tmp("p"); mkdirSync(join(d, "supabase", "migrations"), { recursive: true }); writeFileSync(join(d, "supabase", "config.toml"), "x"); writeFileSync(join(d, "supabase", "migrations", "1.sql"), sql); return d; };
  const made = "create table public.notes (id int, user_id uuid);\nalter table public.notes enable row level security;\n";
  test("in the files only, and with the live database read too, the table is named as open to every account", async () => {
    const { rlsGate } = await import("../src/ship/rls.ts");
    const { noTableOpen } = await import("../src/ship/opentables.ts");
    const d = supa(made + "create policy \"read\" on public.notes for select to authenticated using (true);\n");
    for (const g of [await rlsGate({ project: d }), await rlsGate({ project: d, query: async () => [{ table: "notes", rls: true }] })]) {
      expect(g).toMatchObject({ status: "could_not_check", findings: ["notes"], overridable: true });
      expect(g.detail).toMatch(/every signed in account/i);
      expect(noTableOpen(g)).toBe(false);
    }
  });
  test("a rule that keeps each person to their own rows still passes", async () => {
    const { rlsGate } = await import("../src/ship/rls.ts");
    const d = supa(made + "create policy \"own\" on public.notes for select to authenticated using ((select auth.uid()) = user_id);\n");
    expect((await rlsGate({ project: d, query: async () => [{ table: "notes", rls: true }] })).status).toBe("passed");
  });
});

describe("a model the table does not know is priced at the dearest current list price (A36)", () => {
  test("never below Claude Fable 5.1's $10 in and $50 out per million tokens", async () => {
    const { estimateUsd } = await import("../src/models.ts");
    expect(estimateUsd("claude-fable-5-1", { input_tokens: 1_000_000 })).toBeGreaterThanOrEqual(10);
    expect(estimateUsd("claude-fable-5-1", { output_tokens: 1_000_000 })).toBeGreaterThanOrEqual(50);
    expect(estimateUsd("claude-some-future-model", { cache_read_input_tokens: 1_000_000 })).toBeGreaterThanOrEqual(0.25);
  });
});
