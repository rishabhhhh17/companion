// Must fix 8 (M57 step 3): changes made while Squibby was closed, or while it was not watching this project. When the
// watcher starts, the folder is compared with the project's newest earlier version in the engine's own shadow store; what
// differs is one batch marked as made while away. It is never reviewed by itself (Ask, whatever review.mode says), no
// script runs, and the person's own .git is never read or written. Every project here is a temporary fixture folder.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ReviewService } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (pred: () => boolean, ms = 10_000) => { const end = Date.now() + ms; while (!pred() && Date.now() < end) await sleep(20); expect(pred()).toBe(true); };
function tmp(label: string): string { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-closed-${label}-`))); made.push(d); return d; }
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } }
const KEY = "sk_live_51HabcdefghijklmnopQRSTUVwx";
type Ev = Record<string, any>;

/** One engine run: a review service on the project, over a shadow store that lives on between runs (as on disk). */
function run(project: string, shadow: string, o: { mode?: string; check?: () => void } = {}) {
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  const values: Record<string, unknown> = { "review.mode": o.mode ?? "ask", "flow.on": true };
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close() { send = null; } }; };
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store,
    cheap: null, strong: null, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30,
    ...(o.check ? { check: async () => { o.check!(); return { outcome: "ok" as const, reason: "The checks passed." }; } } : {}),
  });
  services.push(svc);
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  return { svc, store, events, of, cmd, values, fire: (rel: string) => send?.(rel) };
}
const every = (events: Ev[]) => { for (const e of events) { const r = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(r.ok, JSON.stringify(e) + (r.ok ? "" : r.error)).toBe(true); } };
function treeHash(dir: string): string {
  const h = createHash("sha256");
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = join(d, n), st = lstatSync(p); h.update(relative(dir, p) + ":" + st.size + ":" + st.mtimeMs); if (st.isDirectory()) walk(p); else h.update(readFileSync(p)); } };
  walk(dir);
  return h.digest("hex");
}

describe("must fix 8: changes made while Squibby was closed", () => {
  test("a key written while closed is one batch marked closed, and Review now reviews it (never 'Nothing has changed')", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "src/config.ts": "export const url = '/api';\n", "index.html": "<h1>Hi</h1>\n" });
    const first = run(project, shadow);
    first.svc.setProject(project); await first.svc.ready();
    expect(first.of("review.batch")).toEqual([]);   // the very first time there is nothing earlier to compare with
    first.svc.stop();
    write(project, { "src/config.ts": `export const url = '/api';\nexport const stripe = "${KEY}";\n` });   // while closed
    const second = run(project, shadow);
    second.svc.setProject(project); await second.svc.ready();
    const b = second.of("review.batch");
    expect(b.length).toBe(1);
    expect(b[0]).toMatchObject({ project, files: [{ file: "src/config.ts", kind: "modified" }], count: 1, away: "closed", auto: false });
    await second.svc.handle(second.cmd("review.now") as any);
    const r = second.of("review.result");
    expect(r.length).toBe(1);
    expect(r[0].reason ?? "").not.toMatch(/Nothing has changed/);
    expect(r[0]).toMatchObject({ ok: true, rating: "stop", batch: b[0].batch });
    expect(JSON.stringify(second.events)).not.toContain(KEY);
    every(second.events);
  });

  test("nothing changed while closed: no batch", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" });
    const first = run(project, shadow);
    first.svc.setProject(project); await first.svc.ready(); first.svc.stop();
    const second = run(project, shadow);
    second.svc.setProject(project); await second.svc.ready();
    expect(second.of("review.batch")).toEqual([]);
  });

  test("review.mode automatic: the batch from while closed is still only offered, never reviewed by itself", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" });
    const first = run(project, shadow, { mode: "automatic" });
    first.svc.setProject(project); await first.svc.ready(); first.svc.stop();
    write(project, { "a.ts": "b\n", "b.ts": "new\n" });
    const second = run(project, shadow, { mode: "automatic" });
    second.svc.setProject(project); await second.svc.ready();
    await sleep(200);
    expect(second.of("review.batch").length).toBe(1);
    expect(second.of("review.batch")[0]).toMatchObject({ away: "closed", count: 2 });
    expect(second.of("review.started")).toEqual([]);
  });

  test("the project chosen again in the same run: what changed meanwhile is marked as not watched", async () => {
    const project = tmp("proj"), other = tmp("other"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" }); write(other, { "o.ts": "o\n" });
    const r = run(project, shadow);
    r.svc.setProject(project); await r.svc.ready();
    r.svc.setProject(other); await r.svc.ready();
    write(project, { "a.ts": "changed\n" });
    r.svc.setProject(project); await r.svc.ready();
    const b = r.of("review.batch").filter((e) => e.project === project);
    expect(b.length).toBe(1);
    expect(b[0]).toMatchObject({ files: [{ file: "a.ts", kind: "modified" }], away: "notWatching" });
    every(r.events);
  });

  test("a later change never grows the batch from while closed: it keeps its mark, and the later change is its own batch", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" });
    const first = run(project, shadow);
    first.svc.setProject(project); await first.svc.ready(); first.svc.stop();
    write(project, { "a.ts": "b\n" });
    const second = run(project, shadow);
    second.svc.setProject(project); await second.svc.ready();
    const away = second.of("review.batch")[0];
    expect(away).toMatchObject({ away: "closed", count: 1 });
    write(project, { "c.ts": "c\n" }); second.fire("c.ts");
    await sleep(200);
    expect(second.of("review.batch").length).toBe(1);   // the later save waits; the card from while closed is unchanged
    await second.svc.handle(second.cmd("review.now") as any);
    const r = second.of("review.result");
    expect(r[0]).toMatchObject({ ok: true, batch: away.batch, count: 1, files: [{ file: "a.ts", kind: "modified" }] });
    await until(() => second.of("review.batch").length >= 2);
    const next = second.of("review.batch").at(-1)!;
    expect(next.batch).not.toBe(away.batch);
    expect(next).toMatchObject({ count: 1, files: [{ file: "c.ts", kind: "added" }] });
    expect(next.away).toBeUndefined();
    every(second.events);
  });

  test("review.mode automatic: a save after the batch from while closed never makes that batch run by itself (review finding, 4 Nov)", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" });
    const first = run(project, shadow, { mode: "automatic" });
    first.svc.setProject(project); await first.svc.ready(); first.svc.stop();
    write(project, { "a.ts": "b\n", "src/pay.ts": `export const k = "${KEY}";\n` });
    let checked = 0;
    const second = run(project, shadow, { mode: "automatic", check: () => { checked++; } });
    second.svc.setProject(project); await second.svc.ready();
    const away = second.of("review.batch")[0];
    expect(away).toMatchObject({ away: "closed", count: 2 });
    write(project, { "c.ts": "c\n" }); second.fire("c.ts");
    await sleep(300);
    expect(second.of("review.started")).toEqual([]);
    expect(checked).toBe(0);
    expect(second.of("review.batch").every((b) => b.batch === away.batch && b.away === "closed")).toBe(true);
    // The person closes the card from while closed: only the later change is reviewed by itself, with its checks.
    await second.svc.handle(second.cmd("review.dismiss", { batch: away.batch }) as any);
    await until(() => second.of("review.result").length >= 1);
    const started = second.of("review.started");
    expect(started.length).toBe(1);
    expect(started[0].batch).not.toBe(away.batch);
    const res = second.of("review.result").find((e) => e.batch === started[0].batch)!;
    expect(res).toMatchObject({ ok: true, files: [{ file: "c.ts", kind: "added" }] });
    every(second.events);
  });

  test("review.mode automatic: Review now on the batch from while closed runs no scripts unless the person asks for the checks", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" });
    const first = run(project, shadow, { mode: "automatic" });
    first.svc.setProject(project); await first.svc.ready(); first.svc.stop();
    write(project, { "a.ts": "b\n" });
    let checked = 0;
    const second = run(project, shadow, { mode: "automatic", check: () => { checked++; } });
    second.svc.setProject(project); await second.svc.ready();
    const away = second.of("review.batch")[0];
    await second.svc.handle(second.cmd("review.now", { batch: away.batch }) as any);
    expect(second.of("review.started")[0]).toMatchObject({ batch: away.batch, proof: false });
    expect(second.of("review.result")[0]).toMatchObject({ ok: true, checks: "not_run" });
    expect(checked).toBe(0);
  });

  test("the person's own .git is never read or written", async () => {
    const project = tmp("proj"), shadow = tmp("shadow");
    write(project, { "a.ts": "a\n" });
    const g = Bun.spawnSync(["git", "init", "-q"], { cwd: project, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
    expect(g.exitCode).toBe(0);
    const before = treeHash(join(project, ".git"));
    const first = run(project, shadow);
    first.svc.setProject(project); await first.svc.ready(); first.svc.stop();
    write(project, { "a.ts": "changed\n" });
    const second = run(project, shadow);
    second.svc.setProject(project); await second.svc.ready();
    await second.svc.handle(second.cmd("review.now") as any);
    expect(second.of("review.batch")[0]).toMatchObject({ away: "closed" });
    expect(treeHash(join(project, ".git"))).toBe(before);
  });
});

describe("must fix 8 through the real engine program", () => {
  function launch(data: string) {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "../src/main.ts")], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, COMPANION_DATA: data, COMPANION_ENGINE: "scripted", COMPANION_SCRIPT: "[]" },
    });
    const lines: string[] = [];
    let buf = "";
    const done = (async () => { const dec = new TextDecoder(); for await (const c of proc.stdout) { buf += dec.decode(c, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(buf.slice(0, i)); buf = buf.slice(i + 1); } } })();
    const send = (o: unknown) => { proc.stdin.write(JSON.stringify(o) + "\n"); proc.stdin.flush(); };
    const events = () => lines.map((l) => JSON.parse(l));
    const waitFor = async (cond: () => boolean, ms = 15_000) => { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error("timed out; saw: " + lines.join(" | ").slice(-900)); await sleep(25); } };
    const close = async () => { proc.stdin.end(); await proc.exited; await done; };
    return { send, events, waitFor, close };
  }
  test("closed, a key written, opened again: the batch is there and Review now rates it Stop", async () => {
    const project = tmp("proj"), data = tmp("data");
    writeFileSync(join(project, "app.js"), "export const url = '/api';\n");
    const a = launch(data);
    await a.waitFor(() => a.events().length >= 1);
    a.send({ v: 1, id: "s1", type: "settings.apply", values: {}, project, projectValues: {} });
    a.send({ v: 1, id: "rn0", type: "review.now", project });   // answers once the starting point is taken
    await a.waitFor(() => a.events().some((e: any) => e.type === "review.result"));
    await a.close();
    writeFileSync(join(project, "app.js"), `export const url = '/api';\nexport const key = "${KEY}";\n`);
    const b = launch(data);
    await b.waitFor(() => b.events().length >= 1);
    b.send({ v: 1, id: "s1", type: "settings.apply", values: {}, project, projectValues: {} });
    await b.waitFor(() => b.events().some((e: any) => e.type === "review.batch"));
    expect(b.events().find((e: any) => e.type === "review.batch")).toMatchObject({ away: "closed", files: [{ file: "app.js", kind: "modified" }] });
    b.send({ v: 1, id: "rn1", type: "review.now", project });
    await b.waitFor(() => b.events().some((e: any) => e.type === "review.result"));
    expect(b.events().find((e: any) => e.type === "review.result")).toMatchObject({ ok: true, rating: "stop" });
    for (const l of b.events()) expect(parseEvent(JSON.stringify(l)).ok, JSON.stringify(l)).toBe(true);
    expect(b.events().map((l: any) => JSON.stringify(l)).join("\n")).not.toContain(KEY);
    await b.close();
  }, 40_000);
});
