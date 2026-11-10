// M57 features 1, 5 and 6 (docs/milestones/M57-review-every-day.md): every review that ran becomes one row in the task
// log with no file text, the instant key warning runs only the key rule when a batch is ready, and Where was I knows what
// changed since and what a review still says. Every project is a temporary fixture folder with the engine's own shadow
// store; no real model, no scripts and no person's git.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import type { FastLike, FastReq } from "../src/lanes.ts";
import { Metrics } from "../src/metrics.ts";
import { ReviewService, type ReviewHistory } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { TaskLog } from "../src/tasklog.ts";
import { whereWasI, type WhereInput } from "../src/wherewasi.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function tmp(label: string): string { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-history-${label}-`))); made.push(d); return d; }
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } }

const KEY = "sk_live_51HabcdefghijklmnopQRSTUVwx";
const SECRET_TEXT = "the private words inside the file";
type Ev = Record<string, any>;

function setup(o: { files?: Record<string, string>; values?: Record<string, unknown>; model?: boolean; log?: TaskLog } = {}) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, o.files ?? { "src/App.tsx": "export const title = 'Hello';\n" });
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const asked: FastReq[] = [];
  const lane: FastLike = { run: async (req) => { asked.push(req); return { text: JSON.stringify({ summary: `Something changed. ${KEY}`, notes: [], concern: false }), costUsd: 0.001 }; } };
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, ...o.values };
  const log = o.log ?? new TaskLog(":memory:");
  const history: ReviewHistory = { add: (r) => log.addReview(r, { keepDays: Number(values["review.keepDays"] ?? 90) }), did: (p, b, d) => log.reviewDid(p, b, d) };
  let checks = 0;
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store,
    cheap: o.model ? lane : null, strong: o.model ? lane : null,
    spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30,
    check: async () => { checks++; return { outcome: "ok", reason: "" }; },
    history,
  });
  services.push(svc);
  const change = (files: Record<string, string>) => { write(project, files); for (const r of Object.keys(files)) send?.(r); };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  const review = async (n: number) => {
    await until(() => of("review.batch").length >= n);
    const batch = of("review.batch").at(-1)!.batch;
    await svc.handle(cmd("review.now", { batch }) as never);
    return of("review.result").at(-1)!;
  };
  return { project, svc, events, of, change, until, asked, values, review, cmd, log, checks: () => checks };
}
async function started(t: ReturnType<typeof setup>) { t.svc.setProject(t.project); await t.svc.ready(); }
const every = (events: Ev[]) => { for (const e of events) { const r = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(r.ok, JSON.stringify(e) + (r.ok ? "" : r.error)).toBe(true); } };

describe("feature 1: the task log keeps one row per review, names only", () => {
  const row = (o: Partial<Parameters<TaskLog["addReview"]>[0]> = {}) => ({ project: "/p", batch: "rv_0000000001", at: "2026-11-04T09:00:00.000Z", files: ["src/pay.ts"], count: 1, rating: "stop" as const, touches: ["payments" as const], checks: "not_run" as const, summary: "The pay page changed.", ...o });
  test("a row is kept, listed newest first, and what the person did is written once", () => {
    const log = new TaskLog(":memory:");
    log.addReview(row());
    log.addReview(row({ batch: "rv_0000000002", at: "2026-11-04T10:00:00.000Z", rating: "safe", touches: [] }));
    expect(log.reviews("/p").map((r) => [r.rating, r.did])).toEqual([["safe", "open"], ["stop", "open"]]);
    log.reviewDid("/p", "rv_0000000001", "fix");
    log.reviewDid("/p", "rv_0000000001", "looks_fine");   // already closed: the first close is what happened
    expect(log.reviews("/p")[1]).toMatchObject({ did: "fix", files: ["src/pay.ts"], count: 1, checks: "not_run", summary: "The pay page changed." });
    expect(log.reviews("/elsewhere")).toEqual([]);
  });
  test("no file text is ever kept: names only (at most 20), the summary with keys hidden, nothing else", () => {
    const log = new TaskLog(":memory:");
    const files = Array.from({ length: 30 }, (_, i) => `src/f${i}.ts`);
    log.addReview(row({ files, count: 30, summary: `Changed. ${KEY}` }));
    const r = log.reviews("/p")[0];
    expect(r.files.length).toBe(20);
    expect(r.count).toBe(30);
    expect(JSON.stringify(r)).not.toContain(KEY);
    const cols = (log.database.query("PRAGMA table_info(reviews)").all() as { name: string }[]).map((c) => c.name).sort();
    expect(cols).toEqual(["at", "batch", "checks", "count", "did", "files", "id", "kinds", "project", "rating", "summary", "touches"]);   // M77: kinds, the reasons' names only
  });
  test("rows older than review.keepDays are removed as new ones come and when History asks", () => {
    const log = new TaskLog(":memory:");
    log.addReview(row({ batch: "rv_000000000a", at: "2026-07-01T09:00:00.000Z" }));
    log.addReview(row({ batch: "rv_000000000b", at: "2026-10-30T09:00:00.000Z" }));
    const now = new Date("2026-11-04T12:00:00.000Z");
    expect(log.reviews("/p", 50, { keepDays: 90, now }).map((r) => r.at)).toEqual(["2026-10-30T09:00:00.000Z"]);
    log.addReview(row({ batch: "rv_000000000c", at: "2026-11-04T09:00:00.000Z" }), { keepDays: 3, now });
    expect(log.reviews("/p", 50).map((r) => r.at)).toEqual(["2026-11-04T09:00:00.000Z"]);
  });
  test("the rows live in the task history file, so Delete everything removes them with it", () => {
    const dir = tmp("log");
    const a = new TaskLog(join(dir, "tasks.db"));
    a.addReview(row());
    expect(new TaskLog(join(dir, "tasks.db")).reviews("/p").length).toBe(1);
  });
  test("through the review: a row with no file text, then Looks fine, Copy for my AI and Fix it each say what was done", async () => {
    const t = setup({ model: true });
    await started(t);
    t.change({ "src/App.tsx": `export const title = 'Hi';\n// ${SECRET_TEXT}\nconst k = "${KEY}";\n` });
    const r = await t.review(1);
    expect(r.ok).toBe(true);
    const rows = t.log.reviews(t.project);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ files: ["src/App.tsx"], count: 1, rating: "stop", did: "open" });
    expect(JSON.stringify(rows)).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(rows)).not.toContain(KEY);
    await t.svc.handle(t.cmd("review.dismiss", { batch: r.batch, how: "sentBack" }) as never);
    expect(t.log.reviews(t.project)[0].did).toBe("sent_back");

    t.change({ "src/App.tsx": "export const title = 'Hey';\n" });
    const r2 = await t.review(2);
    await t.svc.handle(t.cmd("review.dismiss", { batch: r2.batch, how: "looksFine" }) as never);
    expect(t.log.reviews(t.project)[0].did).toBe("looks_fine");
    every(t.events);
  });
  test("a review whose every reason went away after a newer change says so in its row", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/config.ts": `export const k = "${KEY}";\n` });
    const r = await t.review(1);
    expect(r.rating).toBe("stop");
    t.change({ "src/config.ts": "export const k = process.env.STRIPE_KEY;\n" });
    await t.until(() => t.of("review.batch").length >= 2);
    // The first card is still open (it found something), so the newer batch waits behind it; reviewing it rechecks.
    const newer = t.of("review.batch").at(-1)!.batch;
    await t.svc.handle(t.cmd("review.now", { batch: newer }) as never);
    await t.until(() => t.of("review.recheck").some((e) => e.closed));
    expect(t.log.reviews(t.project).find((x) => x.rating === "stop")!.did).toBe("no_longer_applies");
  });
  test("a review that did not run (nothing changed, reviews off) is no row", async () => {
    const t = setup();
    await started(t);
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.result").at(-1)).toMatchObject({ ok: false });
    expect(t.log.reviews(t.project)).toEqual([]);
  });
});

describe("feature 1: beta numbers, counts only and only when turned on", () => {
  const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o }) as never;
  const mk = () => { const dir = tmp("metrics"); return new Metrics(join(dir, "metrics.json"), () => new Date("2026-11-04T10:00:00")); };
  test("batches, reviews, each rating, Fix it, Copy for my AI, Looks fine, Where was I and the day's limit", () => {
    const m = mk(); m.setEnabled(true);
    m.observe(ev({ type: "review.batch", project: "/p", batch: "rv_1", files: [{ file: "a.ts", kind: "added" }], count: 1, capped: false, secretFiles: [], auto: false }));
    m.observe(ev({ type: "review.batch", project: "/p", batch: "rv_1", files: [], count: 0, capped: false, secretFiles: [], auto: false }));
    m.observe(ev({ type: "review.result", project: "/p", batch: "rv_1", ok: true, rating: "stop" }));
    m.observe(ev({ type: "review.result", project: "/p", batch: "rv_2", ok: true, rating: "safe", note: "This project has reached its daily spending limit. New work starts again tomorrow, or you can raise the limit in Settings." }));
    m.observe(ev({ type: "review.result", project: "/p", ok: false, reason: "Nothing has changed since the last review." }));
    m.observeCommand(ev({ type: "review.fix", project: "/p", batch: "rv_1" }));
    m.observeCommand(ev({ type: "review.dismiss", project: "/p", batch: "rv_2", how: "looksFine" }));
    m.observeCommand(ev({ type: "review.dismiss", project: "/p", batch: "rv_3" }));
    expect(m.note("review_send_back")).toBe(true);
    m.observe(ev({ type: "where.ready", project: "/p", lines: ["x"], next: { action: "none" } }));
    m.observe(ev({ type: "protocol.error", reason: "daily_limit: this project has reached its daily limit. New work starts again tomorrow, or you can raise the limit." }));
    expect(m.summary().days["2026-11-04"]).toEqual({ review_batch: 1, review_run: 2, review_stop: 1, review_safe: 1, review_fix: 1, review_looks_fine: 1, review_send_back: 1, where_opened: 1, daily_limit: 2 });
  });
  test("off, nothing is counted", () => {
    const m = mk();
    m.observe(ev({ type: "review.result", project: "/p", batch: "rv_1", ok: true, rating: "stop" }));
    expect(m.summary().totals).toEqual({});
  });
});

describe("feature 5: the instant key warning", () => {
  test("when a batch is ready, a key on an added line is named by file and line, never by its text, and nothing else ran", async () => {
    const t = setup({ model: true, values: { "review.keyWarning": true } });
    await started(t);
    t.change({ "src/pay.ts": `export const a = 1;\nconst stripe = "${KEY}";\n` });
    await t.until(() => t.of("review.batch").length >= 1);
    const b = t.of("review.batch").at(-1)!;
    // M69: with its lines around it for the pointed line, the key masked to its known prefix (excerpt.ts), never its text.
    expect(b.keys).toEqual([{ file: "src/pay.ts", line: 2, lines: [{ n: 1, text: "export const a = 1;" }, { n: 2, text: `const stripe = "${KEY.slice(0, 8)}\u2026";` }, { n: 3, text: "" }] }]);
    expect(JSON.stringify(t.events)).not.toContain(KEY);
    expect(JSON.stringify(t.events)).not.toContain(KEY.slice(8, 16));
    // Only the key rule: no model asked, no checks run, no review started.
    expect(t.asked).toEqual([]);
    expect(t.checks()).toBe(0);
    expect(t.of("review.started")).toEqual([]);
    every(t.events);
  });
  test("it is off until it is turned on (the founder's call): unset or off, nothing is read and the batch carries no key places", async () => {
    for (const values of [{}, { "review.keyWarning": false }]) {
      const t = setup({ values });
      await started(t);
      t.change({ "src/pay.ts": `const stripe = "${KEY}";\n` });
      await t.until(() => t.of("review.batch").length >= 1);
      expect(t.of("review.batch").at(-1)!.keys).toBeUndefined();
    }
  });
  test("a change with no key carries none, and a settings file is never read for it", async () => {
    const t = setup({ files: { "src/App.tsx": "x\n", ".env": "A=1\n" }, values: { "review.keyWarning": true } });
    await started(t);
    t.change({ "src/App.tsx": "y\n", ".env": `STRIPE=${KEY}\n` });
    await t.until(() => t.of("review.batch").length >= 1);
    const b = t.of("review.batch").at(-1)!;
    expect(b.keys).toBeUndefined();
    expect(b.secretFiles).toEqual([".env"]);
  });
  test("a key written while the engine was closed is warned about on the batch found at opening, which is still never reviewed by itself", async () => {
    const t = setup({ values: { "review.mode": "automatic", "review.keyWarning": true } });
    await started(t);
    t.svc.stop();
    write(t.project, { "src/late.ts": `export const k = "${KEY}";\n` });
    t.svc.setProject(t.project);
    await t.svc.ready();
    const b = t.of("review.batch").at(-1)!;
    expect(b).toMatchObject({ away: "notWatching", keys: [{ file: "src/late.ts", line: 1 }] });
    await sleep(100);
    expect(t.of("review.started")).toEqual([]);
  });
});

describe("feature 6: Where was I knows what changed", () => {
  test("the engine says what waits: files changed and not reviewed yet, and a Fix this first that still holds", async () => {
    const t = setup();
    expect(t.svc.stateFor(t.project)).toBeNull();
    await started(t);
    expect(t.svc.stateFor(t.project)).toEqual({ waiting: 0, stop: null });
    t.change({ "src/a.ts": "a\n", "src/b.ts": "b\n" });
    await t.until(() => t.of("review.batch").length >= 1);
    expect(t.svc.stateFor(t.project)).toEqual({ waiting: 2, stop: null });
    t.change({ "src/c.ts": `export const k = "${KEY}";\n` });
    await t.until(() => t.of("review.batch").length >= 2);
    const r = await t.review(2);
    expect(r.rating).toBe("stop");
    const s = t.svc.stateFor(t.project)!;
    expect(s.waiting).toBe(0);
    expect(s.stop).toMatch(/key/i);
    expect(s.stop).not.toContain(KEY);
    await t.svc.handle(t.cmd("review.dismiss", { batch: r.batch, how: "looksFine" }) as never);
    expect(t.svc.stateFor(t.project)).toEqual({ waiting: 0, stop: null });
    expect(t.svc.stateFor("/somewhere/else")).toBeNull();
  });

  const input = (o: Partial<WhereInput> = {}): WhereInput => ({ rows: [], since: null, now: Date.now(), watches: [], pendingApprovals: 0, waitingPlans: 0, pausedPlans: 0, question: null, ...o });
  test("changes not reviewed yet: one line, and the next step is Review the changes", () => {
    const r = whereWasI(input({ review: { waiting: 12, stop: null } }));
    expect(r.lines).toContain("Since then: 12 files changed. Not reviewed yet.");
    expect(r.next).toEqual({ action: "review" });
    expect(whereWasI(input({ review: { waiting: 1, stop: null } })).lines).toContain("Since then: 1 file changed. Not reviewed yet.");
  });
  test("a review that said Fix this first is unfinished, in its own words", () => {
    const r = whereWasI(input({ review: { waiting: 0, stop: "A key was written into the code." } }));
    expect(r.lines).toContain("Not finished: a review says Fix this first: A key was written into the code.");
    expect(r.lines).not.toContain("Nothing is unfinished.");
    expect(r.next).toEqual({ action: "review" });
  });
  test("nothing waiting adds nothing; a failing watch still comes first; and no line ever says your AI did it", () => {
    expect(whereWasI(input({ review: { waiting: 0, stop: null } }))).toEqual(whereWasI(input()));
    const w = { id: "w_1", kind: "site_up", target: "https://shop.example.com/", state: "failing", since: new Date().toISOString(), reason: "503", history: [] };
    expect(whereWasI(input({ watches: [w], review: { waiting: 3, stop: null } })).next).toEqual({ action: "fixWatch", watch: "w_1" });
    const all = whereWasI(input({ review: { waiting: 3, stop: "Something." } })).lines.join(" ");
    expect(all).not.toMatch(/your AI|AI tool|you were away for|you forgot/i);
  });
});

describe("features 1 and 6 through the engine's own commands", () => {
  test("tasks.list carries the project's review rows, and where.was.i the review's lines and Review the changes", async () => {
    const { AgentRunner } = await import("../src/agent.ts");
    const { ScriptedEngine } = await import("../src/engine.ts");
    const { RunnerSettings } = await import("../src/settings.ts");
    const project = tmp("agent");
    const log = new TaskLog(":memory:");
    log.addReview({ project, batch: "rv_00000000aa", at: new Date().toISOString(), files: ["src/pay.ts"], count: 1, rating: "stop", touches: [], checks: "not_run", summary: "A key went in." });
    log.addReview({ project: "/another/one", batch: "rv_00000000bb", at: new Date().toISOString(), files: ["x.ts"], count: 1, rating: "safe", touches: [], checks: "not_run", summary: "x" });
    const events: Ev[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log, settings: new RunnerSettings(), emit: (e) => events.push(e as Ev), reviewState: (p) => (p === project ? { waiting: 12, stop: null } : null) });
    await runner.handle({ v: 1, id: "t", type: "tasks.list", project } as never);
    const list = events.find((e) => e.type === "tasks.list")!;
    expect(list.reviews.map((r: Ev) => [r.rating, r.files])).toEqual([["stop", ["src/pay.ts"]]]);
    await runner.handle({ v: 1, id: "q", type: "where.was.i", project } as never);
    const where = events.find((e) => e.type === "where.ready")!;
    expect(where.lines).toContain("Since then: 12 files changed. Not reviewed yet.");
    expect(where.next).toEqual({ action: "review" });
    every(events);
  });
});

// M67 bug 15: a review whose card can never be closed any more (replaced by a newer batch, or dropped past the kept
// limit) says so in its History row, never 'open' ('Not closed') forever.
describe("M67: rows of reviews that can no longer be closed", () => {
  test("a safe review left open, then a newer batch replaces its card: the row says no_longer_applies", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Hello there';\n" });
    const r = await t.review(1);
    expect(r.rating).toBe("safe");
    const first = r.batch as string;
    expect(t.log.reviews(t.project).map((x) => x.did)).toEqual(["open"]);
    t.change({ "src/App.tsx": "export const title = 'Hello again';\n" });
    await t.until(() => t.of("review.batch").length >= 2 && t.of("review.batch").at(-1)!.batch !== first);
    // The rows are newest first; the newer batch is not reviewed yet, so the only row is the safe review's.
    await t.until(() => t.log.reviews(t.project).at(-1)!.did === "no_longer_applies");
    expect(t.log.reviews(t.project)).toHaveLength(1);
    every(t.events);
  });
  test("past the kept limit, the oldest review that found something is dropped and its row says no_longer_applies", async () => {
    const t = setup();
    await started(t);
    const batches: string[] = [];
    for (let i = 0; i < 31; i++) {
      t.change({ [`src/k${i}.ts`]: `export const k${i} = "${KEY}";\n` });
      await t.until(() => t.of("review.batch").filter((e) => e.count > 0).length > i);
      const b = t.of("review.batch").filter((e) => e.count > 0).at(-1)!.batch as string;
      await t.svc.handle(t.cmd("review.now", { batch: b }) as never);
      const r = t.of("review.result").at(-1)!;
      expect(r.rating).toBe("stop");
      batches.push(r.batch);
    }
    const rows = t.log.reviews(t.project);   // newest first
    expect(rows).toHaveLength(31);
    expect(rows.at(-1)!.did).toBe("no_longer_applies");
    expect(rows.slice(0, 30).every((x) => x.did === "open")).toBe(true);
  }, 60000);
});
