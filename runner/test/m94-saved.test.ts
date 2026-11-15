// M94: What Squibby saved you. Counts of real events only, from the person's own task log: fix loops the loop breaker
// stopped, tasks the cost pause stopped to ask about and what the person chose, versions Which task broke it? found with no
// model, wrong changes a review flagged that the person then fixed or undid, and asks before live systems. Never a guess or
// an estimate, never an amount (F29, M69). Stand in engines and temporary folders only; nothing is spent.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, SPARED_KEYS, type Event } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine, type Step } from "../src/engine.ts";
import { Ledger } from "../src/ledger.ts";
import { LIVE_TAIL } from "../src/livesystems.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { RunnerSettings } from "../src/settings.ts";
import { TaskLog } from "../src/tasklog.ts";
import { Runners, waitFor } from "./helpers/settle.ts";

const made: string[] = [];
const live = new Runners();
afterEach(async () => { await live.stopAll(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m94-${l}-`))); made.push(d); return d; };
const of = (e: Event[], t: string) => e.filter((x) => x.type === t) as any[];
const NOW = new Date("2026-11-15T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const P = "/tmp/m94-project";
const ZERO = { loopsStopped: 0, paused: 0, pausedStopped: 0, foundNoModel: 0, wrongCaught: 0, liveAsks: 0 };

function task(log: TaskLog, project = P, at = ago(1)): number {
  const id = log.start({ project, agent: "a", mode: "drive", label: "Fix the form", startedAt: at, checkpoint: `cp_${String(Math.floor(Math.random() * 9000) + 1000)}` });
  log.finish(id, "done", 0.1, at, { checkpoint: `cp_0001`, changed: 1, proof: "passed" });
  return id;
}
const review = (log: TaskLog, o: { kinds?: string[]; checks?: "passed" | "failed" | "unknown"; did?: "fix" | "sent_back" | "looks_fine"; at?: string; project?: string; batch?: string }) => {
  const batch = o.batch ?? `b${Math.random()}`;
  log.addReview({ project: o.project ?? P, batch, at: o.at ?? ago(1), files: ["a.ts"], count: 1, rating: "worth_a_look", touches: [], checks: o.checks ?? "passed", summary: "s", kinds: o.kinds ?? [] });
  if (o.did) log.reviewDid(o.project ?? P, batch, o.did);
};

describe("the counts, from fixture logs", () => {
  test("an empty log counts nothing", () => {
    expect(new TaskLog(":memory:").spared(P, NOW)).toEqual(ZERO);
  });
  test("every kind is counted from its own rows, and nothing is counted twice", () => {
    const log = new TaskLog(":memory:");
    const t1 = task(log), t2 = task(log), t3 = task(log), t4 = task(log);
    // The loop breaker: two tasks; the same task written twice is still one.
    log.mark({ project: P, kind: "loop_stopped", ref: t1, at: ago(1) });
    log.mark({ project: P, kind: "loop_stopped", ref: t1, at: ago(1) });
    log.mark({ project: P, kind: "loop_stopped", ref: t2, at: ago(2) });
    // The cost pause: t1 paused, Keep going, then paused again and stopped: one pause, one stopped. t2 kept going: paused
    // only. t3 undone: paused and stopped.
    log.mark({ project: P, kind: "cost_paused", ref: t1, at: ago(1), choice: "keep" });
    log.mark({ project: P, kind: "cost_paused", ref: t1, at: ago(1), choice: "stop" });
    log.mark({ project: P, kind: "cost_paused", ref: t2, at: ago(1), choice: "keep" });
    log.mark({ project: P, kind: "cost_paused", ref: t3, at: ago(1), choice: "undo" });
    // Which task broke it?: the same version found twice is one.
    log.mark({ project: P, kind: "bisect_found", ref: "cp_0004", at: ago(1) });
    log.mark({ project: P, kind: "bisect_found", ref: "cp_0004", at: ago(1) });
    log.mark({ project: P, kind: "bisect_found", ref: "cp_0009", at: ago(3) });
    // Reviews: flagged and fixed or sent back count; flagged and only looked at, or fixed with nothing wrong, do not; a
    // review with two wrong kinds is one.
    review(log, { kinds: ["weakened_check"], did: "fix" });
    review(log, { kinds: ["claimed_passed", "weakened_check"], checks: "failed", did: "sent_back" });
    review(log, { checks: "failed", did: "fix" });
    review(log, { kinds: ["weakened_check"], did: "looks_fine" });
    review(log, { kinds: ["weakened_check"] });
    review(log, { kinds: ["secret_in_code"], did: "fix" });
    // Squibby's own flagged tasks: counted once the person undid them; both flags on one task is one.
    log.mark({ project: P, kind: "drift", ref: t3, at: ago(1), choice: "not_asked" });
    log.mark({ project: P, kind: "drift", ref: t3, at: ago(1), choice: "said_other" });
    log.mark({ project: P, kind: "drift", ref: t4, at: ago(1), choice: "not_asked" });
    log.markUndone(P, 0, "cp_9999");
    // Asks: a live one from the person's own tool, a live one Squibby asked, and a plain ask that is not live.
    log.asked({ project: P, command: "vercel --prod", reason: `This puts the site live. ${LIVE_TAIL}`, at: ago(1), by: "tool" });
    log.asked({ project: P, command: "psql drop", reason: "x", at: ago(1), by: "squibby", answer: "no", live: true });
    log.asked({ project: P, command: "rm -rf build", reason: "This deletes a folder.", at: ago(1), by: "squibby", answer: "once" });
    const s = log.spared(P, NOW);
    // markUndone above took back every task, so t4's flag counts too.
    expect(s).toEqual({ loopsStopped: 2, paused: 3, pausedStopped: 2, foundNoModel: 2, wrongCaught: 3 + 2, liveAsks: 2 });
    expect(Object.keys(s)).toEqual([...SPARED_KEYS]);
  });
  test("a flagged task that was not undone is not counted; other projects and rows older than seven days are left out", () => {
    const log = new TaskLog(":memory:");
    const t1 = task(log);
    log.mark({ project: P, kind: "drift", ref: t1, at: ago(1), choice: "not_asked" });
    expect(log.spared(P, NOW).wrongCaught).toBe(0);
    log.mark({ project: P, kind: "loop_stopped", ref: t1, at: ago(8) });
    log.mark({ project: "/tmp/other", kind: "loop_stopped", ref: t1, at: ago(1) });
    log.mark({ project: P, kind: "bisect_found", ref: "cp_0002", at: new Date(NOW.getTime() + 60_000).toISOString() });
    review(log, { kinds: ["weakened_check"], did: "fix", at: ago(9) });
    review(log, { kinds: ["weakened_check"], did: "fix", project: "/tmp/other" });
    log.asked({ project: P, command: "vercel --prod", reason: LIVE_TAIL, at: ago(10), by: "tool" });
    expect(log.spared(P, NOW)).toEqual(ZERO);
  });
  test("a mark keeps no words: an unknown kind, a ref that is not an id, or a choice that is not a known word is dropped", () => {
    const log = new TaskLog(":memory:");
    log.mark({ project: P, kind: "nope" as never, ref: 1, at: ago(1) });
    log.mark({ project: P, kind: "loop_stopped", ref: "Fix the payment form please", at: ago(1) });
    log.mark({ project: P, kind: "cost_paused", ref: 5, at: ago(1), choice: "spent $4.20" });
    const rows = log.database.query("SELECT kind, ref, choice FROM marks").all() as { kind: string; ref: string; choice: string | null }[];
    expect(rows).toEqual([{ kind: "cost_paused", ref: "5", choice: null }]);
    expect(log.spared(P, NOW)).toMatchObject({ paused: 1, pausedStopped: 0 });
  });
  test("an older log file gets the new table and column, and keeps its rows", () => {
    const d = tmp("db"), file = join(d, "tasks.db");
    const first = new TaskLog(file);
    first.asked({ project: P, command: "vercel --prod", reason: `Live. ${LIVE_TAIL}`, at: ago(1), by: "squibby", answer: "once" });
    first.database.run("ALTER TABLE tasks DROP COLUMN live");
    first.database.run("DROP TABLE marks");
    first.database.close();
    const again = new TaskLog(file);
    // The old row has no live column of its own: its reason's words say it was live.
    expect(again.spared(P, NOW)).toEqual({ ...ZERO, liveAsks: 1 });
    again.mark({ project: P, kind: "loop_stopped", ref: 3, at: ago(1) });
    expect(again.spared(P, NOW).loopsStopped).toBe(1);
    again.database.close();
  });
});

describe("the events are written as they happen", () => {
  const write = (f: string, c: string): Step => ({ tool: { name: "Write", input: { file_path: f, content: c } }, costUsd: 0.01 });
  const bad = (detail: string): LadderResult => { const s = { rung: "browser", label: "Opening it in a browser", status: "failed", detail, ms: 1 } as never; return { verdict: "failed", steps: [s], failedAt: s }; };

  test("the loop breaker firing on a single task is one mark on that task, whatever the person chooses", async () => {
    const project = tmp("p");
    writeFileSync(join(project, "a.txt"), "original");
    const events: Event[] = [];
    const log = new TaskLog(":memory:");
    const runner = live.track(new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(Array.from({ length: 4 }, (_, i) => [write("a.txt", String(i + 1))])), log, emit: (e) => events.push(e), proof: async () => bad("The page threw: x is not defined") }));
    const run = runner.handle({ v: 1, id: "c1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Fix the signup page", model: "m", budgetUsd: 3 } as never);
    await waitFor("the loop card", () => of(events, "loop.stuck").length > 0);
    await runner.handle({ v: 1, id: "c", type: "loop.choose", agent: "builder-1", choice: "stop" } as never);
    await run;
    const id = log.list(project)[0].id;
    expect(log.database.query("SELECT kind, ref, choice FROM marks").all()).toEqual([{ kind: "loop_stopped", ref: String(id), choice: null }]);
    expect(log.spared(project).loopsStopped).toBe(1);
  });

  test("the cost pause writes what the person chose: Keep going then Stop is one pause, stopped", async () => {
    const project = tmp("p");
    writeFileSync(join(project, "a.txt"), "start");
    const events: Event[] = [];
    const log = new TaskLog(":memory:");
    const script: Step[] = [];
    for (let i = 0; i < 8; i++) script.push({ text: `step ${i}`, costUsd: 0.25 }, { tool: { name: "Write", input: { file_path: `f${i}.txt`, content: `made ${i}` } }, costUsd: 0.25 });
    const runner = live.track(new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(script), log, emit: (e) => events.push(e), ledger: new Ledger(":memory:"), settings: new RunnerSettings(), proof: async () => ({ verdict: "passed", steps: [] }) }));
    const run = runner.handle({ v: 1, id: "c", type: "agent.start", project, agent: "a", mode: "drive", prompt: "do it", model: "claude-sonnet-5-5", budgetUsd: 50 });
    await waitFor("the first pause", () => of(events, "cost.pause").length === 1);
    await runner.handle({ v: 1, id: "k1", type: "cost.choose", agent: "a", choice: "keep" } as never);
    await waitFor("the second pause", () => of(events, "cost.pause").length === 2);
    await runner.handle({ v: 1, id: "k2", type: "cost.choose", agent: "a", choice: "stop" } as never);
    await run;
    const id = String(log.list(project)[0].id);
    expect(log.database.query("SELECT kind, ref, choice FROM marks ORDER BY id").all()).toEqual([{ kind: "cost_paused", ref: id, choice: "keep" }, { kind: "cost_paused", ref: id, choice: "stop" }]);
    expect(log.spared(project)).toMatchObject({ paused: 1, pausedStopped: 1 });
  });

  test("Said one thing, ran another on Squibby's own task counts as caught once the person undoes that task", async () => {
    const project = tmp("p");
    const events: Event[] = [];
    const log = new TaskLog(":memory:");
    const engine = new ScriptedEngine([{ text: "Reverting the dashboard work from this conversation.", costUsd: 0 } as Step, { tool: { name: "Bash", input: { command: "git checkout HEAD -- src/a.tsx" } }, costUsd: 0 }, { text: "Done.", costUsd: 0 } as Step]);
    const runner = live.track(new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e: Event) => events.push(e), executor: async () => ({ ok: true, output: "" }), proof: async () => ({ verdict: "passed", steps: [] }), approvalTimeoutMs: 2000 } as never));
    const done = runner.handle({ v: 1, id: "c-1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Undo the dashboard changes you made", model: "m", budgetUsd: 3 });
    await waitFor("the ask", () => of(events, "approval.request").length >= 1).catch(() => undefined);
    for (const a of of(events, "approval.request")) await runner.handle({ v: 1, id: "y", type: "approval.resolve", approval: a.approval, decision: "allow", scope: "once" });
    await done;
    expect(of(events, "receipt")[0].flags?.map((f: { kind: string }) => f.kind)).toEqual(["said_other"]);
    const id = log.list(project)[0].id;
    expect(log.database.query("SELECT kind, ref, choice FROM marks").all()).toEqual([{ kind: "drift", ref: String(id), choice: "said_other" }]);
    // Flagged, not undone yet: nothing caught.
    expect(log.spared(project).wrongCaught).toBe(0);
    // The person undoes it: the row as Undo leaves it (the stand in ran nothing, so the task itself changed no file here).
    log.database.query("UPDATE tasks SET undone_by = 'cp_9999' WHERE id = ?").run(id);
    expect(log.spared(project).wrongCaught).toBe(1);
  });

  test("Which task broke it? finding the task is one mark on the version it names; a second search for the same is still one", async () => {
    const project = tmp("p"), work = tmp("w");
    writeFileSync(join(project, "app.js"), "ok\n");
    const failing: LadderResult = (() => { const f = { rung: "tests" as const, label: "Running the tests", status: "failed" as const, detail: "1 test failed", ms: 1 }; return { verdict: "failed", steps: [f], failedAt: f }; })();
    const passing: LadderResult = { verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "", ms: 1 }] };
    const rounds: Step[][] = [[write("f1.txt", "1"), { text: "done", costUsd: 0.01 }], [write("app.js", "BUG\n"), { text: "done", costUsd: 0.01 }], [write("f3.txt", "3"), { text: "done", costUsd: 0.01 }]];
    const events: Event[] = [];
    const log = new TaskLog(":memory:");
    let clock = Date.parse("2026-11-14T09:00:00Z");
    const runner = live.track(new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine(rounds), log, emit: (e) => events.push(e), now: () => new Date((clock += 60_000)), bisect: { workDir: work },
      proof: async (ctx) => (ctx.project === project ? passing : readFileSync(join(ctx.project, "app.js"), "utf8").includes("BUG") ? failing : passing) }));
    for (let i = 1; i <= 3; i++) await runner.handle({ v: 1, id: `t${i}`, type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: `Task number ${i}`, model: "m", budgetUsd: 3 });
    await runner.handle({ v: 1, id: "b1", type: "bisect.start", project, agent: "builder-1" });
    await runner.handle({ v: 1, id: "b2", type: "bisect.start", project, agent: "builder-1" });
    const found = of(events, "bisect.result").filter((r) => r.outcome === "found");
    expect(found.length).toBe(2);
    const rows = log.database.query("SELECT kind, ref FROM marks").all() as { kind: string; ref: string }[];
    expect(rows).toEqual([{ kind: "bisect_found", ref: found[0].task.checkpoint }, { kind: "bisect_found", ref: found[0].task.checkpoint }]);
    expect(log.spared(project, new Date(clock)).foundNoModel).toBe(1);
  });

  test("Squibby's own ask before a live command is kept as live; an ask that is not live is not", async () => {
    const project = tmp("p");
    const events: Event[] = [];
    const log = new TaskLog(":memory:");
    const engine = new ScriptedEngine([{ tool: { name: "Bash", input: { command: "vercel --prod" } }, costUsd: 0 }, { tool: { name: "Bash", input: { command: "rm -rf build" } }, costUsd: 0 }, { text: "Done.", costUsd: 0 } as Step]);
    const runner = live.track(new AgentRunner({ shadowRoot: tmp("s"), engine, log, emit: (e: Event) => events.push(e), executor: async () => ({ ok: true, output: "" }), proof: async () => ({ verdict: "passed", steps: [] }), approvalTimeoutMs: 2000 } as never));
    const done = runner.handle({ v: 1, id: "c-1", type: "agent.start", project, agent: "builder-1", mode: "drive", prompt: "Put it live", model: "m", budgetUsd: 3 });
    for (let n = 1; n <= 2; n++) {
      const got = await waitFor(`ask ${n}`, () => of(events, "approval.request").length >= n, 1500).then(() => true, () => false);
      if (!got) break;
      await runner.handle({ v: 1, id: `n${n}`, type: "approval.resolve", approval: of(events, "approval.request")[n - 1].approval, decision: "deny", scope: "once" });
    }
    await done;
    const rows = log.database.query("SELECT label, live FROM tasks WHERE mode = 'ask' ORDER BY id").all() as { label: string; live: number }[];
    const vercel = rows.find((r) => r.label.includes("vercel"));
    expect(vercel?.live).toBe(1);
    for (const r of rows.filter((x) => !x.label.includes("vercel"))) expect(r.live).toBe(0);
    expect(log.spared(project).liveAsks).toBe(1);
  });

  test("week.show carries the counts, counts only, and the protocol and the shared fixture agree", async () => {
    const d = tmp("w");
    const log = new TaskLog(":memory:");
    const project = d;
    const t = log.start({ project, agent: "a", mode: "drive", label: "Fix the form", startedAt: ago(1), checkpoint: "cp_0001" });
    log.finish(t, "not_done", 0.4, ago(1), { checkpoint: "cp_0001", changed: 1, proof: "failed" });
    log.mark({ project, kind: "loop_stopped", ref: t, at: ago(1) });
    log.mark({ project, kind: "cost_paused", ref: t, at: ago(1), choice: "undo" });
    const events: Event[] = [];
    const runner = new AgentRunner({ shadowRoot: join(d, "shadow"), engine: new ScriptedEngine([]), log, memoryDir: d, emit: (e: unknown) => events.push(e as never), now: () => NOW } as never);
    await runner.handle({ v: 1, id: "w", type: "week.show", project } as never);
    const e = of(events, "week.summary")[0];
    expect(e.week.spared).toEqual({ ...ZERO, loopsStopped: 1, paused: 1, pausedStopped: 1 });
    const text = JSON.stringify(e).toLowerCase();
    for (const bad of ["fix the form", "usd", "cost", "0.4", "$"]) expect(text).not.toContain(bad);
    const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...e }));
    expect(p.ok, p.ok ? "" : p.error).toBe(true);
    const line = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"m94e1"'))!;
    expect(parseEvent(line).ok).toBe(true);
    for (const [k, v] of [["loopsStopped", -1], ["paused", 1.5], ["liveAsks", "2"], ["pausedStopped", 9]] as const) {
      const b = JSON.parse(line); b.week.spared[k] = v;
      expect(parseEvent(JSON.stringify(b)).ok, `${k}=${v}`).toBe(false);
    }
    const extra = JSON.parse(line); extra.week.spared.usdSaved = 3;
    expect(parseEvent(JSON.stringify(extra)).ok).toBe(false);
    const old = JSON.parse(line); delete old.week.spared;
    expect(parseEvent(JSON.stringify(old)).ok).toBe(true);
  });
});
