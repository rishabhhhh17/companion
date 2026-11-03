// M52, the review of every change (F30), end to end inside the engine: the batch measured against the engine's own shadow
// snapshot (T06), the rules, the words from the cheap or the stronger model (T10), the optional checks (T07), spending,
// "send back" and Fix it. Every project here is a temporary fixture folder; the person's own git is never written or read.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import type { FastLike, FastReq } from "../src/lanes.ts";
import { ReviewService, type ReviewDeps } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";

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

describe("a batch of changes", () => {
  test("ask mode: the batch is said once nothing changed for the quiet time, and nothing is reviewed until asked", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Hello there';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const b = t.of("review.batch")[0];
    expect(b).toMatchObject({ project: t.project, files: [{ file: "src/App.tsx", kind: "modified" }], count: 1, capped: false, secretFiles: [], auto: false });
    await sleep(100);
    expect(t.of("review.started")).toEqual([]);
    expect(t.asked).toEqual([]);
    every(t.events);
  });
  test("a review: plain words from the cheap model, the rating, the touches, send back, and its cost booked", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Hello there';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const batch = t.of("review.batch")[0].batch;
    await t.svc.handle(t.cmd("review.now", { batch }) as never);
    const [r] = t.of("review.result");
    expect(r).toMatchObject({ ok: true, batch, rating: "safe", touches: [], summary: "The page title changed.", notes: ["Look at the home page once."], checks: "not_run", lane: "cheap", usdEstimate: 0.001 });
    expect(r.sendBack).toContain("src/App.tsx");
    expect(t.of("review.started")[0]).toMatchObject({ batch, proof: false });
    expect(t.booked).toEqual([0.001]);
    expect(t.asked.map((a) => a.lane)).toEqual(["cheap"]);
    every(t.events);
  });
  test("changes after a review make a new batch from where the review ended, never the old changes again", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'One';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    t.change({ "src/Other.tsx": "export const other = 1;\n" });
    await t.until(() => t.of("review.batch").length === 2);
    expect(t.of("review.batch")[1].files).toEqual([{ file: "src/Other.tsx", kind: "added" }]);
  });
  test("Looks fine closes the batch: the next one starts after it", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'One';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.dismiss", { batch: t.of("review.batch")[0].batch }) as never);
    t.change({ "src/b.ts": "export const b = 2;\n" });
    await t.until(() => t.of("review.batch").length === 2);
    expect(t.of("review.batch")[1].files).toEqual([{ file: "src/b.ts", kind: "added" }]);
  });
  test("more changes before a review grow the same batch, under a new name", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'One';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    t.change({ "src/b.ts": "export const b = 2;\n" });
    await t.until(() => t.of("review.batch").length === 2);
    const [a, b] = t.of("review.batch");
    expect(b.batch).not.toBe(a.batch);
    expect(b.files.map((f: Ev) => f.file)).toEqual(["src/App.tsx", "src/b.ts"]);
    await t.svc.handle(t.cmd("review.now", { batch: a.batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: false, batch: a.batch });
  });
  test("a change put back as it was leaves nothing: the batch says count 0", async () => {
    const t = setup();
    await started(t);
    const before = readFileSync(join(t.project, "src/App.tsx"), "utf8");
    t.change({ "src/App.tsx": "export const title = 'One';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    t.change({ "src/App.tsx": before });
    await t.until(() => t.of("review.batch").length === 2);
    expect(t.of("review.batch")[1]).toMatchObject({ count: 0, files: [] });
  });
  test("an event with no real change behind it (a replay, a save with the same text) says nothing", async () => {
    const t = setup();
    await started(t);
    t.fire("src/App.tsx");
    await sleep(300);
    expect(t.of("review.batch")).toEqual([]);
  });
  test("Review now works before the quiet time ends, and says so when nothing changed", async () => {
    const t = setup();
    await started(t);
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: false });
    expect(t.of("review.result")[0].reason).toMatch(/Nothing has changed/);
    write(t.project, { "src/App.tsx": "export const title = 'Now';\n" });
    t.fire("src/App.tsx");
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.result")[1]).toMatchObject({ ok: true, rating: "safe" });
  });
});

describe("secrets", () => {
  const files = { "src/pay.ts": "export const pay = () => fetch('/api/pay');\n", ".env": `DATABASE_PASSWORD=${ENV_VALUE}\n`, ".gitignore": ".env\n", "package.json": "{}\n" };
  test("a key written into code is a stop with its file and line; the key, the .env and its contents are never sent or said", async () => {
    const t = setup({ files });
    await started(t);
    t.change({ "src/pay.ts": `import Stripe from "stripe";\nexport const stripe = new Stripe("${KEY}");\nexport const pay = () => stripe.checkout.sessions.create({});\n`, ".env": `DATABASE_PASSWORD=${ENV_VALUE}-changed\n` });
    await t.until(() => t.of("review.batch").length === 1);
    const b = t.of("review.batch")[0];
    expect(b.secretFiles).toEqual([".env"]);
    await t.svc.handle(t.cmd("review.now", { batch: b.batch }) as never);
    const [r] = t.of("review.result");
    expect(r.rating).toBe("stop");
    expect(r.reasons[0]).toMatchObject({ kind: "secret_in_code", file: "src/pay.ts", line: 2 });
    expect(r.touches).toEqual(expect.arrayContaining(["payments", "secrets"]));
    expect(r.lane).toBe("strong");
    const sent = JSON.stringify(t.asked);
    expect(sent).not.toContain(KEY);
    expect(sent).not.toContain(ENV_VALUE);
    expect(sent).not.toContain("DATABASE_PASSWORD");
    expect(sent).not.toContain(".env");
    const said = JSON.stringify(t.events);
    expect(said).not.toContain(KEY);
    expect(said).not.toContain(ENV_VALUE);
    expect(r.sendBack).not.toContain(KEY);
    every(t.events);
  });
  test("a key the review flags by its name alone (authKey) never reaches the model, even when the rules have no pattern for its value", async () => {
    const VALUE = "Zq81xLmP0aa9";
    const t = setup({ files: { "src/api.ts": "export const base = '/api';\n" } });
    await started(t);
    t.change({ "src/api.ts": `const authKey = "${VALUE}"\nconst AUTHKEY = "${VALUE}"\nconst cfg = { authkey: "${VALUE}" }\nexport const base = '/api';\n` });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    const [r] = t.of("review.result");
    expect(r.rating).toBe("stop");
    expect(r.reasons.filter((x: Ev) => x.kind === "secret_in_code").map((x: Ev) => x.line)).toEqual([1, 2, 3]);
    expect(r.lane).toBe("strong");
    expect(t.asked).toHaveLength(1);
    expect(JSON.stringify(t.asked)).not.toContain(VALUE);
    expect(JSON.stringify(t.events)).not.toContain(VALUE);
  });
  test("a key file (not only .env) is named as a secret file, and nothing in it or its name reaches the model", async () => {
    const PEM = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7private";
    const t = setup({ files: { "src/App.tsx": "export const a = 1;\n", "certs/server.pem": "old\n" } });
    await started(t);
    t.change({ "certs/server.pem": `-----BEGIN PRIVATE KEY-----\n${PEM}\n-----END PRIVATE KEY-----\n`, "src/App.tsx": "export const a = 2;\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const b = t.of("review.batch")[0];
    expect(b.secretFiles).toEqual(["certs/server.pem"]);
    await t.svc.handle(t.cmd("review.now", { batch: b.batch }) as never);
    const [r] = t.of("review.result");
    expect(r.touches).toContain("secrets");
    const sent = JSON.stringify(t.asked);
    expect(sent).not.toContain(PEM);
    expect(sent).not.toContain("server.pem");
    expect(JSON.stringify(t.events)).not.toContain(PEM);
    expect(r.sendBack).not.toContain(PEM);
    every(t.events);
  });
  // Incident fixed 3 Nov 2026 (must fix 3): the review hid keys one line at a time, so only the BEGIN line of a private key
  // was hidden, which also took away the line the whole text redaction looks for, and the key's body went to the model.
  const BODY = [
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7Vq3mKx9fQe2Lw",
    "Z8pR4tYc1uNb6sJd0hGk3aXy5WvTq7oPmEiLr9DnBfC2zHjU8gKxQ4sMvYw1eRt",
    "Nq6Hp0bLm3cVd7xSa9fJk2gTy4uWe8iO1rPz5hQn6vXb3mCt0kLs9yDf2jGh4aR",
    "Xw7eB1nM",
  ];
  const sentLines = (t: ReturnType<typeof setup>) => JSON.stringify(t.asked);
  test("a private key written over several lines into code never reaches the model, not one line of its body", async () => {
    const t = setup({ files: { "src/sign.ts": "export const sign = () => 1;\n" } });
    await started(t);
    t.change({ "src/sign.ts": ["const PEM = `-----BEGIN PRIVATE KEY-----", ...BODY, "-----END PRIVATE KEY-----`;", "export const sign = () => PEM.length;", ""].join("\n") });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    const [r] = t.of("review.result");
    expect(r.rating).toBe("stop");
    expect(t.asked).toHaveLength(1);
    for (const b of BODY) expect(sentLines(t)).not.toContain(b);
    for (const b of BODY) expect(JSON.stringify(t.events)).not.toContain(b);
  });
  test("a key changed inside a file, with its BEGIN line out of view, still sends no line of its body", async () => {
    const OLD = ["Q1aW2sE3dR4fT5gY6hU7jI8kO9lP0zXcVbNmQaZwSxEdCrFvTgByHnUjMiKoLpQ", "Lk8Jh7Gf6Ds5Aq4Wz3Ex2Rc1Tv0Yb9Un8Im7Ok6Pl5Az4Sx3Dc2Fv1Gb0Hn9Jm8KQ"];
    const head = ["export const PEM = `-----BEGIN RSA PRIVATE KEY-----", BODY[0], BODY[1]];
    const t = setup({ files: { "src/sign.ts": [...head, ...OLD, "-----END RSA PRIVATE KEY-----`;", ""].join("\n") } });
    await started(t);
    t.change({ "src/sign.ts": [...head, BODY[2], BODY[3], "-----END RSA PRIVATE KEY-----`;", ""].join("\n") });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.asked).toHaveLength(1);
    for (const b of [...BODY, ...OLD]) expect(sentLines(t)).not.toContain(b);
  });
  test("a model that repeats a secret in its words has it hidden before anyone sees it", async () => {
    const t = setup({ files, words: JSON.stringify({ summary: `It now uses the key ${KEY} for payments.`, notes: [`Move ${KEY} to settings`], concern: true, concernSay: `The key ${KEY} is public.` }) });
    await started(t);
    t.change({ "src/pay.ts": `export const k = "${KEY}";\n` });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(JSON.stringify(t.events)).not.toContain(KEY);
  });
});

describe("the rules on a real batch", () => {
  test("a removed file that another file still imports is a stop", async () => {
    const t = setup({ files: { "src/App.tsx": 'import { fmt } from "./utils/date";\nexport const a = fmt(1);\n', "src/utils/date.ts": "export const fmt = (n: number) => String(n);\n" } });
    await started(t);
    unlinkSync(join(t.project, "src/utils/date.ts"));
    t.fire("src/utils/date.ts");
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    const [r] = t.of("review.result");
    expect(r.rating).toBe("stop");
    expect(r.reasons[0]).toMatchObject({ kind: "removed_still_used", file: "src/App.tsx", line: 1 });
    expect(r.reasons[0].say).toContain("src/utils/date.ts");
  });
  test("a change to sign in goes to the stronger model even when it is only worth a look", async () => {
    const t = setup({ files: { "src/auth/login.ts": "export const login = () => null;\n" } });
    await started(t);
    t.change({ "src/auth/login.ts": "export const login = (email: string) => email;\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ rating: "worth_a_look", lane: "strong", touches: ["sign_in"], usdEstimate: 0.02 });
  });
  test("without the stronger model the cheap one writes the words", async () => {
    const t = setup({ strong: false, files: { "src/auth/login.ts": "export const login = () => null;\n" } });
    await started(t);
    t.change({ "src/auth/login.ts": "export const login = (email: string) => email;\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ lane: "cheap" });
  });
  test("the model's worry raises safe to worth a look", async () => {
    const t = setup({ words: JSON.stringify({ summary: "The list now loads twice.", notes: [], concern: true, concernSay: "The list may load twice." }) });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Twice';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ rating: "worth_a_look" });
    expect(t.of("review.result")[0].reasons.at(-1)).toMatchObject({ kind: "model_concern", say: "The list may load twice." });
  });
  test("an answer that is not the JSON asked for gets the rules' own words", async () => {
    const t = setup({ words: "Sure! Here is my review." });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'x';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: true, summary: "1 file changed: src/App.tsx.", lane: "cheap" });
  });
});

describe("spending and the limits", () => {
  test("at the day's limit no model is asked: the rules' words, nothing booked, and the reason said", async () => {
    const t = setup({ room: 0 });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'x';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    const [r] = t.of("review.result");
    expect(r).toMatchObject({ ok: true, lane: "none", usdEstimate: 0 });
    expect(r.note).toMatch(/daily spending limit/);
    expect(t.asked).toEqual([]);
    expect(t.booked).toEqual([]);
  });
  test("with no model connected the review still runs on the rules", async () => {
    const t = setup({ cheap: false, strong: false });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'x';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: true, lane: "none" });
    expect(t.of("review.result")[0].note).toBeTruthy();
  });
});

describe("a slow model", () => {
  test("a call that takes too long is cancelled, and what it cost is still booked when it answers anyway", async () => {
    const t = setup({ modelTimeoutMs: 60 });
    let signalOf: AbortSignal | null = null;
    (t.svc as any).deps.cheap = { run: (_req: FastReq, _d: unknown, signal: AbortSignal) => { signalOf = signal; return sleep(200).then(() => ({ text: JSON.stringify({ summary: "Late.", notes: [], concern: false }), costUsd: 0.004 })); } };
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Slow';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    const [r] = t.of("review.result");
    expect(r).toMatchObject({ ok: true, lane: "none", usdEstimate: 0 });
    expect(r.note).toMatch(/could not be reached/);
    expect(signalOf!.aborted).toBe(true);   // the Claude process is told to end
    await t.until(() => t.booked.length === 1);
    expect(t.booked).toEqual([0.004]);       // the plan's spending (F29) counts it all the same
  });
});

describe("how often (review.mode)", () => {
  test("off: the folder is not watched at all, and Review now says reviews are off", async () => {
    const t = setup({ mode: "off" });
    await started(t);
    expect(t.watching()).toBe(false);
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: false });
    expect(t.of("review.result")[0].reason).toMatch(/off/);
  });
  test("Flow off: not watched either; switched back on, watched again", async () => {
    const t = setup({ flow: false });
    await started(t);
    expect(t.watching()).toBe(false);
    t.values["flow.on"] = true;
    t.svc.sync();
    await t.svc.ready();
    expect(t.watching()).toBe(true);
    t.values["review.mode"] = "off";
    t.svc.sync();
    expect(t.watching()).toBe(false);
  });
  test("no project open, or the stand in, watches nothing", async () => {
    const t = setup();
    t.svc.setProject(undefined);
    expect(t.watching()).toBe(false);
    t.svc.setProject("no-project");
    expect(t.watching()).toBe(false);
  });
  test("automatic: each batch is reviewed by itself, with the project's own checks", async () => {
    let checked = 0;
    const t = setup({ mode: "automatic", check: async () => { checked++; return { outcome: "failing", reason: "Build did not pass: Type error in src/App.tsx" }; } });
    await started(t);
    t.change({ "src/App.tsx": "export const title: number = 'x';\n" });
    await t.until(() => t.of("review.result").length === 1);
    expect(t.of("review.batch")[0].auto).toBe(true);
    expect(t.of("review.started")[0].proof).toBe(true);
    expect(checked).toBe(1);
    expect(t.of("review.result")[0]).toMatchObject({ rating: "stop", checks: "failed" });
    expect(t.of("review.result")[0].checksNote).toContain("Build did not pass");
    every(t.events);
  });
  test("the checks run only when asked for in ask mode", async () => {
    let checked = 0;
    const t = setup({ check: async () => { checked++; return { outcome: "ok", reason: "All of the project's own checks passed." }; } });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'x';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const batch = t.of("review.batch")[0].batch;
    await t.svc.handle(t.cmd("review.now", { batch }) as never);
    expect(checked).toBe(0);
    await t.svc.handle(t.cmd("review.now", { batch, proof: true }) as never);
    expect(checked).toBe(1);
    expect(t.of("review.result")[1]).toMatchObject({ checks: "passed" });
  });
});

describe("the engine's own work in the project", () => {
  test("changes the engine makes are never in a batch; the other tool's changes from before it are kept apart", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/theirs.ts": "export const theirs = 1;\n" });   // the other tool, not quiet yet
    // A task of the engine: it saves its own undo point first and writes only after it (agent.ts), so it is started after
    // around() has seen it begin, exactly as main.ts dispatch does.
    let go!: () => void;
    const work = new Promise<void>((r) => { go = r; }).then(async () => {
      await t.store.snapshot("Before: a task");
      write(t.project, { "src/ours.ts": "export const ours = 1;\n" });
      t.fire("src/ours.ts");
      await sleep(50);
    });
    t.svc.around(t.project, work);
    go();
    await work;
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.batch")[0].files).toEqual([{ file: "src/theirs.ts", kind: "added" }]);
    await t.svc.handle(t.cmd("review.dismiss", { batch: t.of("review.batch")[0].batch }) as never);
    await sleep(100);
    t.change({ "src/later.ts": "export const later = 1;\n" });
    await t.until(() => t.of("review.batch").length === 2);
    expect(t.of("review.batch")[1].files).toEqual([{ file: "src/later.ts", kind: "added" }]);
  });
  test("a file that appears while the engine's own task runs, with the other tool quiet before, is the task's own (its receipt lists it)", async () => {
    const t = setup();
    await started(t);
    let done!: () => void;
    t.svc.around(t.project, new Promise<void>((r) => { done = r; }), "agent.start");
    t.change({ "src/during.ts": "export const d = 1;\n" });
    await sleep(200);
    expect(t.of("review.batch")).toEqual([]);
    done();
    await sleep(150);
    expect(t.of("review.batch")).toEqual([]);
  });
  test("the engine's own work starts while the other tool is still writing: nothing half written is said or reviewed, and its later writes are kept", async () => {
    const t = setup({ mode: "automatic" });
    await started(t);
    t.change({ "src/theirs.ts": "export const theirs = 'half';\n" });   // the other tool, mid write: not quiet yet
    let go!: () => void;
    const work = new Promise<void>((r) => { go = r; }).then(async () => {
      await t.store.snapshot("Before: a task");
      write(t.project, { "src/ours.ts": "export const ours = 1;\n" });
      t.fire("src/ours.ts");
      t.change({ "src/theirs.ts": "export const theirs = 'whole';\n" });   // the other tool finishes its file meanwhile
      await sleep(80);
    });
    t.svc.around(t.project, work, "agent.start");
    go();
    await sleep(20);
    expect(t.of("review.batch")).toEqual([]);   // half written: not said while it may still change
    expect(t.of("review.started")).toEqual([]);
    await work;
    await t.until(() => t.of("review.result").length === 1);
    expect(t.of("review.batch")[0].files).toEqual([{ file: "src/theirs.ts", kind: "added" }]);
    // The review read the file as the other tool left it, not half way.
    const sent = JSON.stringify(t.asked);
    expect(sent).toContain("whole");
    expect(sent).not.toContain("ours");
  });
  test("work of the engine that never edits code (a memory line, an install) does not hide what the other tool writes meanwhile", async () => {
    const t = setup();
    await started(t);
    let go!: () => void;
    const work = new Promise<void>((r) => { go = r; }).then(async () => {
      write(t.project, { "AGENTS.md": "# Notes\n- we use pnpm\n", "package-lock.json": "{}\n" });   // what the engine itself writes
      t.fire("AGENTS.md", "package-lock.json");
      t.change({ "src/during.ts": "export const d = 1;\n" });            // the other tool, at the same time
      await sleep(60);
    });
    t.svc.around(t.project, work, "memory.add");
    go();
    await work;
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.batch")[0].files).toEqual([{ file: "src/during.ts", kind: "added" }]);
    await t.svc.handle(t.cmd("review.dismiss", { batch: t.of("review.batch")[0].batch }) as never);
    // and the engine's own files are not the next batch either
    await sleep(150);
    expect(t.of("review.batch")).toHaveLength(1);
  });
  test("a watch's own check busy in the project holds the batch until it ends", async () => {
    let busy = true;
    const t = setup({ busy: () => busy });
    await started(t);
    t.change({ "src/a.ts": "export const a = 1;\n" });
    await sleep(200);
    expect(t.of("review.batch")).toEqual([]);
    busy = false;
    await t.until(() => t.of("review.batch").length === 1);
  });
});

describe("Fix it", () => {
  test("starts an ordinary drive task (with its safety copy) from the review, with no secret in it", async () => {
    const t = setup({ files: { "src/pay.ts": "export const pay = 1;\n" } });
    await started(t);
    t.change({ "src/pay.ts": `export const k = "${KEY}";\n` });
    await t.until(() => t.of("review.batch").length === 1);
    const batch = t.of("review.batch")[0].batch;
    await t.svc.handle(t.cmd("review.fix", { batch, agent: "builder-1", model: "claude-sonnet-5-5", budgetUsd: 3 }) as never);
    expect(t.fixes).toEqual([]);
    expect(t.of("protocol.error")[0].reason).toMatch(/Review/);
    await t.svc.handle(t.cmd("review.now", { batch }) as never);
    await t.svc.handle(t.cmd("review.fix", { batch, agent: "builder-1", model: "claude-sonnet-5-5", budgetUsd: 3 }) as never);
    expect(t.fixes).toHaveLength(1);
    expect(t.fixes[0]).toMatchObject({ type: "agent.start", project: t.project, agent: "builder-1", mode: "drive", model: "claude-sonnet-5-5", budgetUsd: 3 });
    expect((t.fixes[0] as any).prompt).toContain("src/pay.ts");
    expect((t.fixes[0] as any).prompt).not.toContain(KEY);
  });
});

describe("hands off the person's git (rule 10)", () => {
  test("a project with its own git: nothing in it is written, and the review never reads its history", async () => {
    const t = setup();
    const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    for (const a of [["init", "-q"], ["add", "-A"], ["commit", "-qm", "first"]]) expect(Bun.spawnSync(["git", ...a], { cwd: t.project, env }).exitCode).toBe(0);
    const hash = (dir: string) => { const h = createHash("sha256"); const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); const st = lstatSync(p); h.update(`${relative(dir, p)}:${st.size}:${st.mtimeMs}`); if (st.isDirectory()) walk(p); else h.update(readFileSync(p)); } }; walk(dir); return h.digest("hex"); };
    const before = hash(join(t.project, ".git"));
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    await t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: true });
    expect(hash(join(t.project, ".git"))).toBe(before);
    expect(existsSync(join(t.project, ".companion"))).toBe(false);
  });
});

// Must fix 26 (3 Nov 2026): every review batch added a checkpoint with a plain copy of every .env file, and nothing was pruned.
describe("the undo store a review uses", () => {
  const withEnv = { "src/App.tsx": "export const a = 1;\n", ".env": `DATABASE_PASSWORD=${ENV_VALUE}\n`, ".gitignore": ".env\n" };
  const allText = (dir: string): string => { let out = ""; const walk = (d: string) => { for (const n of readdirSync(d)) { const x = join(d, n); const st = lstatSync(x); if (st.isDirectory()) walk(x); else if (st.isFile()) out += readFileSync(x, "latin1"); } }; walk(dir); return out; };
  test("a review's own versions keep no copy of .env anywhere in the store, and a change to it is still named", async () => {
    const t = setup({ files: withEnv });
    await started(t);
    t.change({ ".env": `DATABASE_PASSWORD=${ENV_VALUE}-rotated\n` });
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.batch")[0].secretFiles).toEqual([".env"]);
    expect(allText(t.shadow)).not.toContain(ENV_VALUE);
  });
  test("what a review is looking at is never pruned, however many versions come after it", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'One';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const b = t.of("review.batch")[0];
    // The open batch stays open (ask mode); the engine's own tasks make many versions meanwhile.
    for (let i = 0; i < 115; i++) await t.store.snapshot(`Before: task ${i}`);
    await t.svc.handle(t.cmd("review.now", { batch: b.batch }) as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: true, batch: b.batch });
  }, 60000);
  test("when the undo store is full, reviews pause and say so, and start again by themselves from a fresh start", async () => {
    const t = setup();
    const flag = { full: false };
    Object.defineProperty(t.store, "full", { get: () => flag.full, configurable: true });
    await started(t);
    flag.full = true;
    t.change({ "src/App.tsx": "export const title = 'While full';\n" });
    await t.until(() => t.of("review.result").length === 1);
    expect(t.of("review.result")[0]).toMatchObject({ ok: false });
    expect(t.of("review.result")[0].reason).toMatch(/full/);
    expect(t.of("review.batch")).toEqual([]);
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.result").at(-1)!.reason).toMatch(/full/);
    flag.full = false;
    t.change({ "src/App.tsx": "export const title = 'Room again';\n" });
    await sleep(300);
    t.change({ "src/App.tsx": "export const title = 'Room again, changed';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.batch")[0].files).toEqual([{ file: "src/App.tsx", kind: "modified" }]);
  }, 30000);
});

describe("Stop everything", () => {
  test("ends a review that is running; nothing is booked for words never written", async () => {
    const t = setup();
    let release!: () => void;
    (t.svc as any).deps.cheap = { run: (_req: FastReq, _d: unknown, signal: AbortSignal) => new Promise((_, no) => { release = () => no(new Error("stopped")); signal.addEventListener("abort", () => no(new Error("aborted"))); }) };
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'x';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const p = t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    await t.until(() => t.of("review.started").length === 1);
    t.svc.stopAll();
    await p;
    void release;
    expect(t.of("review.result")[0]).toMatchObject({ ok: false });
    expect(t.booked).toEqual([]);
  });
  test("a press of Review them still waiting for its snapshot never starts after Stop", async () => {
    const t = setup({ check: async () => { throw new Error("the checks must not run after Stop"); } });
    await started(t);
    write(t.project, { "src/App.tsx": "export const title = 'Pressed';\n" });
    t.fire("src/App.tsx");
    t.slow.hold();
    const p = t.svc.handle(t.cmd("review.now", { proof: true }) as never);
    await t.until(() => t.slow.waiting.length === 1);
    t.svc.stopAll();
    t.slow.go();
    await p;
    expect(t.of("review.started")).toEqual([]);
    expect(t.asked).toEqual([]);
    expect(t.of("review.result")[0]).toMatchObject({ ok: false });
    expect(t.of("review.result")[0].reason).toMatch(/stopped/);
  });
  test("automatic: a batch being measured when Stop lands is not reviewed by itself, and its changes come in the next batch", async () => {
    const t = setup({ mode: "automatic" });
    await started(t);
    t.slow.hold();
    t.change({ "src/App.tsx": "export const title = 'Measuring';\n" });
    await t.until(() => t.slow.waiting.length === 1);   // the quiet time ended and the snapshot is being taken
    t.svc.stopAll();
    t.slow.go();
    await t.svc.ready();
    await sleep(100);
    expect(t.of("review.started")).toEqual([]);
    expect(t.asked).toEqual([]);
    expect(t.of("review.batch")).toEqual([]);
    t.change({ "src/b.ts": "export const b = 2;\n" });
    await t.until(() => t.of("review.result").length === 1);
    expect(t.of("review.batch")[0].files).toEqual([{ file: "src/App.tsx", kind: "modified" }, { file: "src/b.ts", kind: "added" }]);
  });
  test("automatic: changes measured as the engine's own work begins are not reviewed by themselves after Stop", async () => {
    const t = setup({ mode: "automatic" });
    await started(t);
    t.change({ "src/theirs.ts": "export const theirs = 1;\n" });
    await sleep(60);   // quiet: the batch is said
    await t.until(() => t.of("review.result").length === 1);
    await t.svc.handle(t.cmd("review.dismiss", { batch: t.of("review.batch")[0].batch }) as never);
    t.change({ "src/next.ts": "export const next = 1;\n" });
    t.slow.hold();
    let done!: () => void;
    t.svc.around(t.project, new Promise<void>((r) => { done = r; }), "memory.add");
    t.svc.stopAll();
    t.slow.go();
    done();
    await sleep(200);
    await t.svc.ready();
    expect(t.of("review.started")).toHaveLength(1);   // only the first one, from before the Stop
  });
  test("drops the batch still waiting for the quiet time: nothing is said or reviewed by itself, and no change is lost", async () => {
    const t = setup({ mode: "automatic" });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Waiting';\n" });
    t.svc.stopAll();   // before the quiet time (30 ms here) ends
    await sleep(150);
    expect(t.of("review.batch")).toEqual([]);
    expect(t.of("review.started")).toEqual([]);
    expect(t.asked).toEqual([]);
    // The watcher keeps watching: the next change is a batch, and it still holds the change from before the stop.
    expect(t.watching()).toBe(true);
    t.change({ "src/b.ts": "export const b = 2;\n" });
    await t.until(() => t.of("review.batch").length === 1);
    expect(t.of("review.batch")[0].files).toEqual([{ file: "src/App.tsx", kind: "modified" }, { file: "src/b.ts", kind: "added" }]);
    every(t.events);
  });
});

describe("when no copy can be kept", () => {
  test("Review now says so in plain words instead of claiming nothing changed", async () => {
    const t = setup();
    (t.svc as any).deps.store = () => ({ snapshot: async () => { throw new Error("git add failed: index.lock"); } });
    await started(t);
    await t.svc.handle(t.cmd("review.now") as never);
    expect(t.of("review.result")[0]).toMatchObject({ ok: false });
    expect(t.of("review.result")[0].reason).toMatch(/could not keep a copy/);
    expect(t.of("review.result")[0].reason).not.toMatch(/git|index\.lock/);
  });
});

describe("changes that arrive while a review runs are never lost", () => {
  test("the other tool keeps working while the checks run: its new change is the next batch", async () => {
    let t!: ReturnType<typeof setup>;
    t = setup({ mode: "automatic", check: async () => {
      t.change({ "src/during.ts": "export const during = 1;\n" });   // the other tool writes while the checks build
      await sleep(150);
      return { outcome: "ok", reason: "All of the project's own checks passed." };
    } });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'First';\n" });
    await t.until(() => t.of("review.result").length >= 1);
    expect(t.of("review.result")[0]).toMatchObject({ ok: true, files: [{ file: "src/App.tsx", kind: "modified" }] });
    await t.until(() => t.of("review.batch").length >= 2);
    expect(t.of("review.batch")[1].files).toEqual([{ file: "src/during.ts", kind: "added" }]);
  });
  test("a task of the engine starts while a review runs: the other tool's change from just before is its own batch afterwards", async () => {
    const t = setup();
    let answer!: () => void;
    (t.svc as any).deps.cheap = { run: () => new Promise((ok) => { answer = () => ok({ text: JSON.stringify({ summary: "First change.", notes: [], concern: false }), costUsd: 0.001 }); }) };
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'First';\n" });
    await t.until(() => t.of("review.batch").length === 1);
    const reviewing = t.svc.handle(t.cmd("review.now", { batch: t.of("review.batch")[0].batch }) as never);
    await t.until(() => t.of("review.started").length === 1);
    t.change({ "src/theirs.ts": "export const theirs = 1;\n" });   // the other tool, while the review runs
    let go!: () => void;
    const work = new Promise<void>((r) => { go = r; }).then(async () => {
      await t.store.snapshot("Before: a task");
      write(t.project, { "src/ours.ts": "export const ours = 1;\n" });
      t.fire("src/ours.ts");
    });
    t.svc.around(t.project, work);
    go();
    await work;
    await t.until(() => typeof answer === "function");
    answer();
    await reviewing;
    await t.until(() => t.of("review.batch").length === 2);
    expect(t.of("review.batch")[1].files).toEqual([{ file: "src/theirs.ts", kind: "added" }]);
  });
});
