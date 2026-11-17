// M104, fixed and proven, finding by finding. After Fix it the review is kept, and the fix's task checks each problem that
// review found again by its rules (never a model) on what the fix left, before its receipt: Gone, Still there, or Changed
// with no rule to check it. One still there means the fix is not proven (receipt, History, and Free's count of proven
// fixes). Temporary folders and stand in engines only: no model, no key, no real project, the person's git never touched.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, recheckedOk, type Command } from "../../protocol/index.ts";
import { AgentRunner } from "../src/agent.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { FreeFixes } from "../src/db.ts";
import { ScriptedEngine, testToolRunner } from "../src/engine.ts";
import { FREE_FIXES_PER_MONTH, PlanGate, monthOf } from "../src/plan.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import { findingsOf, outcomeOf, stillCount, type FixCheck, type FixFinding } from "../src/review/fixcheck.ts";
import { lineHash } from "../src/review/look.ts";
import { ReviewService, type ReviewDeps } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-m104-${l}-`))); made.push(d); return d; };
const write = (dir: string, files: Record<string, string>) => { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } };
const KEY = ["sk", "live", "51HabcdefghijklmnopQRSTUVwx"].join("_");
const KEY2 = ["sk", "live", "51HzyxwvutsrqponmlkJIHGFEdc"].join("_");
type Ev = Record<string, any>;
const every = (events: Ev[]) => { for (const e of events) { const r = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(r.ok, JSON.stringify(e) + (r.ok ? "" : r.error)).toBe(true); } };

// ---------- the rules' answer for one problem ----------

describe("each problem's answer, by its rule", () => {
  const state = (o: { text?: Record<string, string>; since?: string[] } = {}) => ({ text: o.text ?? {}, changedSinceBefore: new Set(o.since ?? []), migrations: {} });
  const line = { how: "line" as const, file: "src/pay.ts", hash: lineHash(`export const k = "${KEY}";`) };
  test("a key's line: gone once the line is gone, still there while it is in the file", () => {
    expect(outcomeOf({ kind: "secret_in_code", recheck: line, state: state({ text: { "src/pay.ts": "export const k = process.env.KEY;\n" } }), byFix: new Set(["src/pay.ts"]), proof: "passed", fixedBefore: false })).toBe("gone");
    expect(outcomeOf({ kind: "secret_in_code", recheck: line, state: state({ text: { "src/pay.ts": `// moved\nexport const k = "${KEY}";\n` } }), byFix: new Set(["src/pay.ts"]), proof: "passed", fixedBefore: false })).toBe("still");
  });
  test("a problem about the change as a whole: gone when its files are back, unsure when the fix changed them, still when it never touched them", () => {
    const files = { how: "files" as const, files: ["src/a.ts"] };
    expect(outcomeOf({ kind: "model_concern", recheck: files, state: state({ since: [] }), byFix: new Set(["src/a.ts"]), proof: "passed", fixedBefore: false })).toBe("gone");
    expect(outcomeOf({ kind: "model_concern", recheck: files, state: state({ since: ["src/a.ts"] }), byFix: new Set(["src/a.ts"]), proof: "passed", fixedBefore: false })).toBe("unsure");
    expect(outcomeOf({ kind: "model_concern", recheck: files, state: state({ since: ["src/a.ts"] }), byFix: new Set(["src/b.ts"]), proof: "passed", fixedBefore: false })).toBe("still");
  });
  test("problems about the checks are answered by the fix's own proof", () => {
    const files = { how: "files" as const, files: ["src/a.ts"] };
    for (const kind of ["checks_failed", "risky_with_failing_checks", "claimed_passed"]) {
      expect(outcomeOf({ kind, recheck: files, state: state({ since: ["src/a.ts"] }), byFix: new Set(), proof: "passed", fixedBefore: false })).toBe("gone");
      expect(outcomeOf({ kind, recheck: files, state: state({ since: ["src/a.ts"] }), byFix: new Set(), proof: "failed", fixedBefore: false })).toBe("still");
      expect(outcomeOf({ kind, recheck: files, state: state({ since: ["src/a.ts"] }), byFix: new Set(), proof: "skipped", fixedBefore: false })).toBe("unsure");
    }
  });
  test("one taken out before is still checked again by its rule; only a whole change problem keeps Gone; the receipt's lines are clipped and counted", () => {
    // M104 review: an earlier fix (or a newer change) took it out, but the latest fix put the key back. The rule looks again.
    expect(outcomeOf({ kind: "secret_in_code", recheck: line, state: state({ text: { "src/pay.ts": `export const k = "${KEY}";` } }), byFix: new Set(), proof: "failed", fixedBefore: true })).toBe("still");
    expect(outcomeOf({ kind: "secret_in_code", recheck: line, state: state({ text: { "src/pay.ts": "export const k = process.env.K;\n" } }), byFix: new Set(), proof: "failed", fixedBefore: true })).toBe("gone");
    expect(outcomeOf({ kind: "model_concern", recheck: { how: "files", files: ["src/a.ts"] }, state: state({ since: ["src/a.ts"] }), byFix: new Set(["src/a.ts"]), proof: "passed", fixedBefore: true })).toBe("gone");
    const f = findingsOf(["  A key is in src/pay.ts.  ", "x".repeat(900), ...Array.from({ length: 30 }, (_, i) => `p${i}`)], ["gone", "still", ...Array(30).fill("unsure")]);
    expect(f.length).toBe(20);
    expect(f[0]).toEqual({ say: "A key is in src/pay.ts.", outcome: "gone" });
    expect(Array.from(f[1].say).length).toBe(400);
    expect(stillCount(f)).toBe(1);
    expect(stillCount(null)).toBe(0);
    expect(recheckedOk({ batch: "rv_0123456789", findings: f })).toBe(true);
    expect(recheckedOk({ batch: "rv_0123456789", findings: [] })).toBe(false);
    expect(recheckedOk({ batch: "rv_0123456789", findings: [{ say: "x", outcome: "fixed" }] })).toBe(false);
    expect(recheckedOk({ batch: "rv_0123456789", findings: [{ say: "x", outcome: "gone", file: "a" }] })).toBe(false);
  });
});

// ---------- the review service with a stand in fix ----------

function setup(files: Record<string, string>) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, files);
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  let modelCalls = 0;
  const lane = { run: async () => { modelCalls++; return { text: "{}", costUsd: 0 }; } };
  const fixes: { cmd: Command; check?: FixCheck }[] = [];
  /** What the fix does in the folder; then its last change is saved and its check runs, as the task does. */
  let fixWrites: Record<string, string> = {};
  let proof: "passed" | "failed" = "passed";
  const answers: unknown[] = [];
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true };
  const deps: ReviewDeps = {
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store,
    // No model lane is given: the review uses its rules alone. The lanes are here only to prove the recheck calls none.
    cheap: null, strong: null,
    spend: { room: () => 10, book: () => {} },
    fix: async (cmd, check) => {
      fixes.push({ cmd, check });
      write(project, fixWrites);
      const after = await store.snapshot("After: the fix");
      answers.push(check ? await check({ after: after.id, proof }) : null);
    },
    watch, graceMs: 20, quietMs: () => 30,
  };
  const svc = new ReviewService(deps);
  services.push(svc);
  const change = (f: Record<string, string>) => { write(project, f); for (const r of Object.keys(f)) send?.(r); };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}_${events.length}`, type, project, ...extra }) as Command;
  const fixIt = (batch: string) => svc.handle(cmd("review.fix", { batch, agent: "builder-1", model: "m", budgetUsd: 1 }) as never);
  return { project, store, svc, events, of, change, until, cmd, fixes, fixIt, answers, lane, modelCalls: () => modelCalls, setFix: (w: Record<string, string>) => { fixWrites = w; }, setProof: (p: "passed" | "failed") => { proof = p; } };
}
async function reviewed(t: ReturnType<typeof setup>, change: Record<string, string>) {
  t.svc.setProject(t.project); await t.svc.ready();
  t.change(change);
  await t.until(() => t.of("review.batch").length === 1);
  const batch = t.of("review.batch")[0].batch as string;
  await t.svc.handle(t.cmd("review.now", { batch }) as never);
  const r = t.of("review.result")[0];
  expect(r.ok).toBe(true);
  return { batch, reasons: r.reasons as { kind: string; say: string }[] };
}

describe("Fix it keeps the review and checks it again", () => {
  test("the record survives Fix it, the fix gets the check, and a fixed key shows Gone (then the review closes)", async () => {
    const t = setup({ "src/pay.ts": "export const pay = 1;\n" });
    const { batch, reasons } = await reviewed(t, { "src/pay.ts": `export const k = "${KEY}";\n` });
    const keyAt = reasons.findIndex((r) => r.kind === "secret_in_code");
    expect(keyAt).toBeGreaterThanOrEqual(0);
    t.setFix({ "src/pay.ts": "export const k = process.env.PAY_KEY;\n" });
    await t.fixIt(batch);
    expect(t.fixes).toHaveLength(1);
    expect(typeof t.fixes[0].check).toBe("function");
    const a = t.answers[0] as { batch: string; findings: FixFinding[] };
    expect(a.batch).toBe(batch);
    expect(a.findings.length).toBe(reasons.length);
    expect(a.findings[keyAt].outcome).toBe("gone");
    expect(stillCount(a.findings)).toBe(0);
    expect(recheckedOk(a)).toBe(true);
    for (const f of a.findings) expect(f.say).not.toContain(KEY);
    // Nothing is still there: the review is closed, so a second Fix it has nothing to fix.
    await t.fixIt(batch);
    expect(t.fixes).toHaveLength(1);
    expect(t.of("protocol.error").at(-1)?.reason).toMatch(/Review these changes first/);
    every(t.events);
  });
  test("a key still there blocks: Still there, the review stays for Try again, and Try again asks only for what is left", async () => {
    const t = setup({ "src/pay.ts": "export const pay = 1;\n", "src/other.ts": "export const o = 1;\n" });
    const { batch, reasons } = await reviewed(t, { "src/pay.ts": `export const k = "${KEY}";\n`, "src/other.ts": `export const o = "${KEY2}";\n` });
    const keys = reasons.map((r, i) => (r.kind === "secret_in_code" ? i : -1)).filter((i) => i >= 0);
    expect(keys.length).toBe(2);
    // The fix takes out only one of the two keys.
    t.setFix({ "src/other.ts": "export const o = process.env.O;\n" });
    await t.fixIt(batch);
    const a = t.answers[0] as { findings: FixFinding[] };
    const outs = keys.map((i) => a.findings[i].outcome).sort();
    expect(outs).toEqual(["gone", "still"]);
    expect(stillCount(a.findings)).toBeGreaterThanOrEqual(1);
    // Try again: the same review, Fix it again, and the prompt names only the problem still open.
    const stillSay = keys.map((i) => a.findings[i]).find((f) => f.outcome === "still")!.say;
    const goneSay = keys.map((i) => a.findings[i]).find((f) => f.outcome === "gone")!.say;
    t.setFix({ "src/pay.ts": "export const k = process.env.PAY_KEY;\n" });
    await t.fixIt(batch);
    expect(t.fixes).toHaveLength(2);
    const prompt = (t.fixes[1].cmd as { prompt: string }).prompt;
    expect(prompt).toContain(stillSay.split(" ").slice(0, 4).join(" "));
    if (goneSay !== stillSay) expect(prompt.includes(goneSay)).toBe(false);
    const b = t.answers[1] as { findings: { outcome: string }[] };
    expect(keys.map((i) => b.findings[i].outcome)).toEqual(["gone", "gone"]);
  });
  test("the recheck makes no model call, and a press again while the fix runs is not a second fix", async () => {
    const t = setup({ "src/pay.ts": "export const pay = 1;\n" });
    const { batch } = await reviewed(t, { "src/pay.ts": `export const k = "${KEY}";\n` });
    const calls = t.modelCalls();
    // A fix that is still running when the second press comes.
    let go!: () => void;
    const svcFix = t.fixes;
    const slow = new Promise<void>((r) => { go = r; });
    (t.svc as any).deps.fix = async (cmd: Command, check?: FixCheck) => { svcFix.push({ cmd, check }); await slow; };
    const did: string[] = [];
    (t.svc as any).deps.history = { did: (_p: string, _b: string, d: string) => did.push(d) };
    const first = t.fixIt(batch);
    await sleep(10);
    expect(did).toEqual(["fix"]);
    await t.fixIt(batch);
    expect(svcFix).toHaveLength(1);
    // The refused press is not written to the review's History row.
    expect(did).toEqual(["fix"]);
    expect(t.of("protocol.error").at(-1)?.reason).toMatch(/already running/);
    go(); await first;
    const after = await t.store.snapshot("After");
    const a = await svcFix[0].check!({ after: after.id, proof: "passed" });
    expect(a?.findings.some((f) => f.outcome === "still")).toBe(true);
    expect(t.modelCalls()).toBe(calls);
    expect(calls).toBe(0);
  });
  test("Try again that puts a key back shows it Still there, and the next Try again asks for it again", async () => {
    const t = setup({ "src/pay.ts": "export const pay = 1;\n", "src/other.ts": "export const o = 1;\n" });
    const { batch, reasons } = await reviewed(t, { "src/pay.ts": `export const k = "${KEY}";\n`, "src/other.ts": `export const o = "${KEY2}";\n` });
    const keys = reasons.map((r, i) => (r.kind === "secret_in_code" ? i : -1)).filter((i) => i >= 0);
    expect(keys.length).toBe(2);
    // The first fix takes key A (src/pay.ts) out and leaves key B.
    t.setFix({ "src/pay.ts": "export const k = process.env.PAY_KEY;\n" });
    await t.fixIt(batch);
    const a = t.answers[0] as { findings: FixFinding[] };
    const aAt = keys.find((i) => a.findings[i].outcome === "gone")!, bAt = keys.find((i) => a.findings[i].outcome === "still")!;
    expect(aAt).toBeDefined(); expect(bAt).toBeDefined();
    // Try again: it puts key A back and takes key B out.
    t.setFix({ "src/pay.ts": `export const k = "${KEY}";\n`, "src/other.ts": "export const o = process.env.O;\n" });
    await t.fixIt(batch);
    const b = t.answers[1] as { findings: FixFinding[] };
    expect(b.findings[aAt].outcome).toBe("still");
    expect(b.findings[bAt].outcome).toBe("gone");
    // The review stays open, and the next Try again asks for key A again (and not for B).
    t.setFix({ "src/pay.ts": "export const k = process.env.PAY_KEY;\n" });
    await t.fixIt(batch);
    expect(t.fixes).toHaveLength(3);
    const prompt = (t.fixes[2].cmd as { prompt: string }).prompt;
    expect(prompt).toContain(b.findings[aAt].say.split(" ").slice(0, 4).join(" "));
    const c = t.answers[2] as { findings: FixFinding[] };
    expect(keys.map((i) => c.findings[i].outcome)).toEqual(["gone", "gone"]);
  });
  test("a version that is gone gives no answer, never a guess", async () => {
    const t = setup({ "src/pay.ts": "export const pay = 1;\n" });
    const { batch } = await reviewed(t, { "src/pay.ts": `export const k = "${KEY}";\n` });
    let check: FixCheck | undefined;
    (t.svc as any).deps.fix = async (_c: Command, c?: FixCheck) => { check = c; };
    await t.fixIt(batch);
    expect(await check!({ after: "cp_999999", proof: "passed" })).toBeNull();
  });
});

// ---------- end to end: the review, the plan gate and the real task runner, wired as main.ts wires them ----------

const step = (status: string) => ({ rung: "browser", label: "browser", status: status as "passed", detail: "", ms: 1 });
const pass: LadderResult = { verdict: "passed", steps: [step("passed")] as never };

function world(fixCommand: string) {
  const project = tmp("site");
  write(project, { "src/pay.ts": "export const pay = 1;\n" });
  const events: Ev[] = [];
  const log = new TaskLog(":memory:");
  const free = new FreeFixes(log.database);
  const gate = new PlanGate({ fixes: () => free, emit: (e) => events.push(e), now: () => new Date(2026, 10, 17, 12), limit: FREE_FIXES_PER_MONTH });
  gate.setState({ plan: "free", paymentsOn: true });
  const engine = new ScriptedEngine([{ tool: { name: "Bash", input: { command: fixCommand } }, costUsd: 0.01 }]);
  const runner = new AgentRunner({ executor: testToolRunner, shadowRoot: tmp("s"), engine, log, emit: (e) => events.push(e), proof: async () => pass, fixes: gate });
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const review = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => ({ "review.mode": "ask", "flow.on": true } as Record<string, unknown>)[k], store: (p) => runner.checkpointsFor(p),
    cheap: null, strong: null, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30,
    // As main.ts: the gate first, the check handed to the runner, the task wrapped as the engine's own work.
    fix: (start, check) => {
      const a = gate.admit(start);
      if (!a) return;
      if (check) runner.checkAfter(a.id, check);
      let settle!: () => void;
      review.around(start.project!, new Promise<void>((r) => { settle = r; }), "agent.start");
      return runner.handle(a).finally(() => { settle(); runner.dropCheck(a.id); });
    },
  });
  services.push(review);
  const of = (t: string) => events.filter((e) => e.type === t);
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  return { project, events, of, until, review, log, used: () => free.count(monthOf(new Date(2026, 10, 17, 12))), change: (f: Record<string, string>) => { write(project, f); for (const r of Object.keys(f)) send?.(r); } };
}
async function fixedEndToEnd(fixCommand: string) {
  const w = world(fixCommand);
  w.review.setProject(w.project); await w.review.ready();
  w.change({ "src/pay.ts": `export const k = "${KEY}";\n` });
  await w.until(() => w.of("review.batch").length === 1);
  const batch = w.of("review.batch")[0].batch as string;
  await w.review.handle({ v: PROTOCOL_VERSION, id: "r1", type: "review.now", project: w.project, batch } as never);
  expect(w.of("review.result")[0]).toMatchObject({ ok: true, rating: "stop" });
  await w.review.handle({ v: PROTOCOL_VERSION, id: "f1", type: "review.fix", project: w.project, batch, agent: "builder-1", model: "m", budgetUsd: 1 } as never);
  await w.until(() => w.of("receipt").length === 1);
  return { w, batch, receipt: w.of("receipt")[0] };
}

describe("the receipt says it, problem by problem", () => {
  test("a fix that takes the key out: the receipt lists it as gone, it is proven, and it counts as a proven fix", async () => {
    const { w, batch, receipt } = await fixedEndToEnd(`printf 'export const k = process.env.PAY_KEY;\\n' > src/pay.ts`);
    expect(readFileSync(join(w.project, "src/pay.ts"), "utf8")).not.toContain(KEY);
    expect(receipt.proof).toBe("passed");
    expect(receipt.rechecked.batch).toBe(batch);
    expect(receipt.rechecked.findings.find((f: { say: string }) => /key/i.test(f.say))?.outcome).toBe("gone");
    expect(stillCount(receipt.rechecked.findings)).toBe(0);
    expect(w.log.list(w.project)[0].still).toBeUndefined();
    expect(w.used()).toBe(1);
    every(w.events);
  });
  test("a fix that leaves the key: the receipt says Still there, History keeps it, and it is not counted as a proven fix", async () => {
    const { w, receipt } = await fixedEndToEnd(`printf 'export const note = 1;\\n' > src/note.ts`);
    expect(receipt.proof).toBe("passed");
    expect(receipt.rechecked.findings.find((f: { say: string }) => /key/i.test(f.say))?.outcome).toBe("still");
    expect(w.log.list(w.project)[0].still).toBeGreaterThanOrEqual(1);
    expect(w.used()).toBe(0);
    every(w.events);
  });
});

describe("the protocol (shared fixtures, read by the shell's suite and the pages too)", () => {
  const fx = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").filter((l) => l.includes('"id":"m104e')).map((l) => JSON.parse(l));
  test("the receipts with each problem checked again, and a History row with one still there, parse", () => {
    expect(fx.length).toBe(3);
    for (const e of fx) expect(parseEvent(JSON.stringify(e)).ok).toBe(true);
    expect(fx[1].rechecked.findings.map((f: { outcome: string }) => f.outcome)).toEqual(["still", "gone"]);
    expect(fx[2].tasks[0].still).toBe(1);
  });
  test("a receipt's rechecked part of any other shape is refused", () => {
    const r = fx[0];
    for (const bad of [{ batch: "rv_x", findings: r.rechecked.findings }, { batch: r.rechecked.batch, findings: [] }, { batch: r.rechecked.batch, findings: [{ say: "", outcome: "gone" }] }, { batch: r.rechecked.batch, findings: [{ say: "x", outcome: "fixed" }] }, { batch: r.rechecked.batch, findings: [{ say: "x", outcome: "gone", code: "const k = 1" }] }, { batch: r.rechecked.batch, findings: Array(21).fill({ say: "x", outcome: "gone" }) }])
      expect(parseEvent(JSON.stringify({ ...r, rechecked: bad })).ok).toBe(false);
  });
});
