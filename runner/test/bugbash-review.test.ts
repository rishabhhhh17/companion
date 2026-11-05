// Bug bash (M67 step 1): the Review every change flow, engine to page. Temporary fixture folders only, no model (stand in lanes).
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import type { FastLike, FastReq } from "../src/lanes.ts";
import { ReviewService, type ReviewDeps } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
// Loaded by path, so the runner's type check does not take in the page's files (it imports icons.tsx).
type ReviewCard = { batch: string; result?: { rating?: string }; [k: string]: unknown };
const REVIEW = "../../app/src/review.ts";
const { reviewReduce } = (await import(REVIEW)) as { reviewReduce: (r: ReviewCard | null, e: { type: string; [k: string]: unknown }) => ReviewCard | null };

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function tmp(label: string): string { const d = mkdtempSync(join(tmpdir(), `companion-test-review-${label}-`)); made.push(d); return d; }
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } }

const KEY = "sk_live_51HabcdefghijklmnopQRSTUVwx";
const ENV_VALUE = "very-private-database-password-42";

type Ev = Record<string, any>;
function setup(o: { files?: Record<string, string>; mode?: string; flow?: boolean; room?: number; words?: string; check?: ReviewDeps["check"]; busy?: () => boolean; cheap?: boolean; strong?: boolean; modelTimeoutMs?: number } = {}) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, o.files ?? { "src/App.tsx": "export const title = 'Hello';\n", "package.json": '{ "name": "site", "dependencies": { "react": "^19.0.0" } }\n' });
  const real = new CheckpointStore(join(shadow, "p.git"), project);
  // A snapshot can be held back (a big project takes seconds): slow.hold() makes the next ones wait for slow.go().
  const slow = { held: false, waiting: [] as (() => void)[], started: 0, hold() { this.held = true; }, go() { this.held = false; while (this.waiting.length) this.waiting.shift()!(); } };
  const store = new Proxy(real, { get(target, key) {
    const v = Reflect.get(target, key, target);
    if (key !== "snapshot") return typeof v === "function" ? v.bind(target) : v;
    return async (...a: unknown[]) => { slow.started++; if (slow.held) await new Promise<void>((r) => slow.waiting.push(r)); return (v as (...x: unknown[]) => Promise<unknown>).apply(target, a); };
  } }) as CheckpointStore;
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const asked: { lane: string; req: FastReq }[] = [];
  const lane = (name: string): FastLike => ({ run: async (req) => { asked.push({ lane: name, req }); return { text: o.words ?? JSON.stringify({ summary: "The page title changed.", notes: ["Look at the home page once."], concern: false }), costUsd: name === "strong" ? 0.02 : 0.001 }; } });
  const booked: number[] = [];
  const fixes: Command[] = [];
  let room = o.room ?? 10;
  const values: Record<string, unknown> = { "review.mode": o.mode ?? "ask", "flow.on": o.flow ?? true };
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store,
    cheap: o.cheap === false ? null : lane("cheap"), strong: o.strong === false ? null : lane("strong"),
    spend: { room: () => room, book: (_p, usd) => { booked.push(usd); room -= usd; } },
    check: o.check, busy: o.busy, fix: (cmd) => { fixes.push(cmd); }, watch, graceMs: 20, quietMs: () => 30, modelTimeoutMs: o.modelTimeoutMs,
  });
  services.push(svc);
  const fire = (...rels: string[]) => { for (const r of rels) send?.(r); };
  const change = (files: Record<string, string>) => { write(project, files); fire(...Object.keys(files)); };
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  return { project, shadow, store, slow, svc, events, of, fire, change, until, asked, booked, fixes, values, cmd, watching: () => send !== null, setRoom: (n: number) => { room = n; } };
}
async function started(t: ReturnType<typeof setup>) { t.svc.setProject(t.project); await t.svc.ready(); }
const every = (events: Ev[]) => { for (const e of events) { const r = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(r.ok, JSON.stringify(e) + (r.ok ? "" : r.error)).toBe(true); } };


const page = (events: Ev[]) => events.reduce<ReviewCard | null>((r, e) => reviewReduce(r, e as { type: string }), null);

describe("automatic: three batches while the first review's card is open", () => {
  test("a second review that found something is shown after the first is closed, not replaced by the third batch", async () => {
    const t = setup({ mode: "automatic", files: { "src/App.tsx": "export const a = 1;\n", "src/old.ts": "export const o = 1;\n", "src/c.ts": "export const c = 1;\n" } });
    await started(t);
    t.change({ "src/App.tsx": `export const key = "${KEY}";\n` });
    await t.until(() => t.of("review.result").length === 1);
    expect(t.of("review.result")[0].rating).toBe("stop");
    unlinkSync(join(t.project, "src/old.ts")); t.fire("src/old.ts");
    await t.until(() => t.of("review.result").length === 2);
    const b = t.of("review.result")[1];
    expect(b.rating).toBe("worth_a_look");
    t.change({ "src/c.ts": "export const c = 2;\n" });
    await t.until(() => t.of("review.result").length === 3);
    let card = page(t.events)!;
    expect(card.batch).toBe(t.of("review.result")[0].batch);
    card = reviewReduce(card, { type: "ui.reviewDismissed", batch: card.batch })!;
    console.log("after closing the first card the page shows", card?.batch, card?.result?.rating, "; the worth a look batch was", b.batch);
    expect(card.batch).toBe(b.batch);
  });
});

describe("changed while closed", () => {
  test("changes said but not reviewed before the engine closed are offered again when it opens", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": `export const key = "${KEY}";\n` });
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.result")).toEqual([]);
    t.svc.stop();   // the engine closes (Squibby quit) before anyone pressed Review them
    const events2: Ev[] = [];
    let send2: ((rel: string) => void) | null = null;
    const svc2 = new ReviewService({ emit: (e) => events2.push(e), setting: (k) => t.values[k], store: () => t.store, spend: { room: () => 10, book: () => {} },
      watch: (_d, on) => { send2 = on; return { close: () => { send2 = null; } }; }, graceMs: 20, quietMs: () => 30 });
    services.push(svc2);
    svc2.setProject(t.project);
    await svc2.ready();
    await sleep(200);
    const offered = events2.filter((e) => e.type === "review.batch");
    console.log("after reopening:", JSON.stringify(offered));
    await svc2.handle({ v: PROTOCOL_VERSION, id: "c1", type: "review.now", project: t.project, proof: false } as never);
    console.log("Review now after reopening:", JSON.stringify(events2.filter((e) => e.type === "review.result").map((e) => ({ ok: e.ok, reason: e.reason, rating: e.rating }))));
    expect(offered.length).toBe(1);
  });
});

describe("Fix it on a card left open in automatic", () => {
  test("Fix it still works on a Fix this first card after five newer reviews ran behind it", async () => {
    const t = setup({ mode: "automatic", files: { "src/App.tsx": "export const a = 1;\n", "src/b.ts": "export const b = 0;\n" } });
    await started(t);
    t.change({ "src/App.tsx": `export const key = "${KEY}";\n` });
    await t.until(() => t.of("review.result").length === 1);
    const A = t.of("review.result")[0];
    expect(A.rating).toBe("stop");
    for (let i = 1; i <= 5; i++) { t.change({ "src/b.ts": `export const b = ${i};\n` }); await t.until(() => t.of("review.result").length === 1 + i); }
    // The page still shows A (it found something, newer changes wait behind it).
    const card = page(t.events)!;
    expect(card.batch).toBe(A.batch);
    await t.svc.handle(t.cmd("review.fix", { batch: A.batch, agent: "a1", model: "m", budgetUsd: 1 }) as never);
    console.log("Fix it on A:", JSON.stringify(t.of("protocol.error")), "fix tasks started:", t.fixes.length);
    expect(t.fixes.length).toBe(1);
  });
});
