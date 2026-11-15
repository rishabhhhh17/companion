// M101 (docs/milestones/M101-undo-on-review-card.md): Put these files back, on the review card of another tool's change.
// Every project is a temporary fixture folder with the engine's own shadow store; no model, no scripts, and no git command
// is ever run in a project (the commit case writes its own fake .git files and checks nothing in them changed).
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseEvent, PROTOCOL_VERSION, type Command } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { committedSince, UNDO_COMMIT_COMMAND } from "../src/review/gitcommit.ts";
import { ReviewService, type ReviewHistory } from "../src/review/service.ts";
import type { WatchFn } from "../src/review/batcher.ts";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => { while (services.length) services.pop()!.stop(); while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function tmp(label: string): string { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m101-${label}-`))); made.push(d); return d; }
function write(dir: string, files: Record<string, string>) { for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, ".."), { recursive: true }); writeFileSync(join(dir, p), c); } }
const read = (dir: string, p: string) => readFileSync(join(dir, p), "utf8");
type Ev = Record<string, any>;

function setup(o: { files?: Record<string, string>; busy?: () => boolean; log?: TaskLog } = {}) {
  const project = tmp("proj"), shadow = tmp("shadow");
  write(project, o.files ?? { "src/App.tsx": "export const title = 'Hello';\n", "src/Other.tsx": "export const other = 1;\n" });
  const store = new CheckpointStore(join(shadow, "p.git"), project);
  const events: Ev[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const values: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, "review.keepDays": 90 };
  const log = o.log ?? new TaskLog(":memory:");
  const history: ReviewHistory = {
    add: (r) => log.addReview(r, { keepDays: 90 }), did: (p, b, d) => log.reviewDid(p, b, d),
    points: (p, b) => log.reviewPoints(p, b), undone: (p, b, s) => log.reviewUndone(p, b, s), recent: (p, n) => log.recentReviewPoints(p, n),
  };
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => values[k], store: () => store,
    cheap: null, strong: null, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 30,
    busy: o.busy, history,
  });
  services.push(svc);
  const change = (files: Record<string, string>) => { write(project, files); for (const r of Object.keys(files)) send?.(r); };
  const touch = (rel: string) => send?.(rel);
  const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
  const of = (t: string) => events.filter((e) => e.type === t);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => ({ v: PROTOCOL_VERSION, id: `c_${type}`, type, project, ...extra }) as Command;
  const reviewed = async (n: number) => {
    await until(() => of("review.batch").filter((e) => e.count > 0).length >= n);
    const batch = of("review.batch").filter((e) => e.count > 0).at(-1)!.batch;
    await svc.handle(cmd("review.now", { batch }) as never);
    expect(of("review.result").at(-1)).toMatchObject({ ok: true, batch });
    return batch as string;
  };
  const plan = async (batch: string) => { await svc.handle(cmd("review.undoPlan", { batch }) as never); return of("review.undoPlan").at(-1)!; };
  const undo = async (batch: string, overwrite?: string[]) => { await svc.handle(cmd("review.undo", { batch, confirm: true, ...(overwrite ? { overwrite } : {}) }) as never); return of("review.undone").at(-1)!; };
  return { project, store, svc, events, of, change, touch, until, cmd, log, reviewed, plan, undo, values };
}
async function started(t: ReturnType<typeof setup>) { t.svc.setProject(t.project); await t.svc.ready(); }
const valid = (events: Ev[]) => { for (const e of events) { const r = parseEvent(JSON.stringify({ v: 1, id: "x", ...e })); expect(r.ok, JSON.stringify(e) + (r.ok ? "" : r.error)).toBe(true); } };

describe("the store: only the batch's files are put back", () => {
  test("files the batch changed, added or removed come back; files changed before or after it, outside it, stay", async () => {
    const project = tmp("store"), shadow = tmp("shadow");
    write(project, { "a.ts": "a1\n", "b.ts": "b1\n", "gone.ts": "g1\n", "mine.ts": "m1\n" });
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    write(project, { "mine.ts": "m2 (before the batch, the person's)\n" });
    const from = await store.snapshot("from", { envCopies: false });
    write(project, { "a.ts": "a2 (the tool)\n", "new/added.ts": "added\n" });
    rmSync(join(project, "gone.ts"));
    const to = await store.snapshot("to", { envCopies: false });
    write(project, { "b.ts": "b2 (after the batch, another file)\n" });
    const now = await store.snapshot("now", { envCopies: false });
    const plan = await store.batchPlan(from.id, to.id, now.id);
    expect(plan.files.sort()).toEqual(["a.ts", "gone.ts", "new/added.ts"]);
    expect(plan.later).toEqual([]);
    const r = await store.undoBatch(from.id, to.id, "Review put back", []);
    expect(r.reverted.sort()).toEqual(["a.ts", "gone.ts", "new/added.ts"]);
    expect(read(project, "a.ts")).toBe("a1\n");
    expect(read(project, "gone.ts")).toBe("g1\n");
    expect(existsSync(join(project, "new"))).toBe(false);
    // Never the whole project: the person's edit before the batch and the change after it are still there.
    expect(read(project, "mine.ts")).toBe("m2 (before the batch, the person's)\n");
    expect(read(project, "b.ts")).toBe("b2 (after the batch, another file)\n");
    expect(store.has(r.safetyCheckpoint)).toBe(true);
  });

  test("a file changed again after the batch is listed and left as it is, unless the person says put those back too", async () => {
    const project = tmp("later"), shadow = tmp("shadow");
    write(project, { "a.ts": "a1\n", "b.ts": "b1\n" });
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const from = await store.snapshot("from", { envCopies: false });
    write(project, { "a.ts": "a2\n", "b.ts": "b2\n" });
    const to = await store.snapshot("to", { envCopies: false });
    write(project, { "b.ts": "b3 (edited later)\n" });
    const now = await store.snapshot("now", { envCopies: false });
    const plan = await store.batchPlan(from.id, to.id, now.id);
    expect(plan.files).toEqual(["a.ts"]);
    expect(plan.later).toEqual(["b.ts"]);
    const kept = await store.undoBatch(from.id, to.id, "Review put back", []);
    expect(kept.reverted).toEqual(["a.ts"]);
    expect(kept.kept).toEqual(["b.ts"]);
    expect(read(project, "b.ts")).toBe("b3 (edited later)\n");
    // The second yes: the later version is kept in the recovery folder first, then the one from before comes back.
    write(project, { "a.ts": "a2\n" });
    const again = await store.undoBatch(from.id, to.id, "Review put back", ["b.ts", "not-in-the-batch.ts"]);
    expect(again.saved).toEqual(["b.ts"]);
    expect(read(project, "b.ts")).toBe("b1\n");
    expect(readFileSync(join(again.savedTo, "b.ts"), "utf8")).toBe("b3 (edited later)\n");
    expect(existsSync(join(project, "not-in-the-batch.ts"))).toBe(false);
  });

  test("a .env change is named and never put back: a review's version keeps only a hash of it", async () => {
    const project = tmp("env"), shadow = tmp("shadow");
    write(project, { ".env": "KEY=old\n", "a.ts": "a1\n" });
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    const from = await store.snapshot("from", { envCopies: false });
    write(project, { ".env": "KEY=new\n", "a.ts": "a2\n" });
    const to = await store.snapshot("to", { envCopies: false });
    const now = await store.snapshot("now", { envCopies: false });
    const plan = await store.batchPlan(from.id, to.id, now.id);
    expect(plan.env).toEqual([".env"]);
    expect(plan.files).toEqual(["a.ts"]);
    const r = await store.undoBatch(from.id, to.id, "Review put back", [".env"]);
    expect(r.env).toEqual([".env"]);
    expect(read(project, ".env")).toBe("KEY=new\n");
    expect(read(project, "a.ts")).toBe("a1\n");
  });

  test("a version that is gone is said as gone, never guessed", async () => {
    const project = tmp("gone"), shadow = tmp("shadow");
    write(project, { "a.ts": "a1\n" });
    const store = new CheckpointStore(join(shadow, "p.git"), project);
    expect(store.has("cp_9999")).toBe(false);
    await expect(store.undoBatch("cp_9998", "cp_9999", "x", [])).rejects.toThrow();
    expect(read(project, "a.ts")).toBe("a1\n");
  });
});

describe("the commit check reads where HEAD points, never the history, and runs nothing", () => {
  function fakeGit(project: string, o: { ref?: string; packed?: boolean; worktree?: boolean } = {}) {
    const ref = o.ref ?? "refs/heads/main";
    const git = o.worktree ? join(project, "..", `${project.split("/").pop()}-gitdir`) : join(project, ".git");
    if (o.worktree) { mkdirSync(git, { recursive: true }); writeFileSync(join(project, ".git"), `gitdir: ${git}\n`); made.push(git); }
    mkdirSync(join(git, "refs", "heads"), { recursive: true });
    writeFileSync(join(git, "HEAD"), `ref: ${ref}\n`);
    if (o.packed) writeFileSync(join(git, "packed-refs"), `0123456789abcdef0123456789abcdef01234567 ${ref}\n`);
    else writeFileSync(join(git, ref), "0123456789abcdef0123456789abcdef01234567\n");
    return { git, refFile: o.packed ? join(git, "packed-refs") : join(git, ref) };
  }
  const old = (f: string, msAgo: number) => { const t = (Date.now() - msAgo) / 1000; utimesSync(f, t, t); };
  test("a branch tip that moved after the batch began is a commit; one that did not is not", () => {
    const project = tmp("git");
    const { refFile } = fakeGit(project);
    old(refFile, 60_000);
    expect(committedSince(project, Date.now() - 30_000)).toBe(false);
    old(refFile, 1_000);
    expect(committedSince(project, Date.now() - 30_000)).toBe(true);
  });
  test("packed refs, a worktree's gitdir file, no git at all and a broken HEAD", () => {
    const a = tmp("packed"); old(fakeGit(a, { packed: true }).refFile, 1_000);
    expect(committedSince(a, Date.now() - 30_000)).toBe(true);
    const b = tmp("wt"); old(fakeGit(b, { worktree: true }).refFile, 1_000);
    expect(committedSince(b, Date.now() - 30_000)).toBe(true);
    expect(committedSince(tmp("nogit"), 0)).toBe(false);
    const d = tmp("broken"); mkdirSync(join(d, ".git")); writeFileSync(join(d, ".git", "HEAD"), "ref: ../../../../etc/passwd\n");
    expect(committedSince(d, 0)).toBe(false);
  });
  test("the command shown is fixed text, and is never run", () => {
    expect(UNDO_COMMIT_COMMAND).toBe("git reset HEAD~1");
  });
});

describe("the review service: Put these files back", () => {
  test("not offered while the batch is open: the plan says so, and nothing changes", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    await t.until(() => t.of("review.batch").some((e) => e.count > 0));
    const batch = t.of("review.batch").at(-1)!.batch;
    expect(await t.plan(batch)).toMatchObject({ type: "review.undoPlan", batch, ok: false, why: "open" });
    expect(await t.undo(batch)).toMatchObject({ type: "review.undone", batch, ok: false, why: "open" });
    expect(read(t.project, "src/App.tsx")).toBe("export const title = 'Changed';\n");
    valid(t.events);
  });

  test("after the review: the plan lists the files, the put back changes only them, and it is never reviewed as a change", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n", "src/New.tsx": "export const n = 1;\n" });
    const batch = await t.reviewed(1);
    const p = await t.plan(batch);
    expect(p).toMatchObject({ ok: true, batch, files: ["src/App.tsx", "src/New.tsx"], count: 2, later: [], env: [], cannot: [], committed: false });
    const batchesBefore = t.of("review.batch").length;
    const r = await t.undo(batch);
    expect(r).toMatchObject({ ok: true, batch, reverted: ["src/App.tsx", "src/New.tsx"], kept: [], committed: false });
    expect(read(t.project, "src/App.tsx")).toBe("export const title = 'Hello';\n");
    expect(read(t.project, "src/Other.tsx")).toBe("export const other = 1;\n");
    expect(existsSync(join(t.project, "src/New.tsx"))).toBe(false);
    // The engine's own work: the files it put back are not a new change to review.
    t.touch("src/App.tsx"); t.touch("src/New.tsx");
    await sleep(300);
    expect(t.of("review.batch").slice(batchesBefore).filter((e) => e.count > 0)).toEqual([]);
    // Once done, it is done: a second press says so.
    expect(await t.plan(batch)).toMatchObject({ ok: false, why: "done" });
    valid(t.events);
  });

  test("a file edited after the batch is listed and kept; a second yes overwrites it with the person's version kept aside", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n", "src/Other.tsx": "export const other = 2;\n" });
    const batch = await t.reviewed(1);
    // The person edits one of the batch's files again; that is reviewed as its own batch.
    t.change({ "src/Other.tsx": "export const other = 3; // mine\n" });
    await t.reviewed(2);
    const p = await t.plan(batch);
    expect(p).toMatchObject({ ok: true, files: ["src/App.tsx"], later: ["src/Other.tsx"] });
    const r = await t.undo(batch);
    expect(r).toMatchObject({ ok: true, reverted: ["src/App.tsx"], kept: ["src/Other.tsx"] });
    expect(read(t.project, "src/Other.tsx")).toBe("export const other = 3; // mine\n");
    valid(t.events);
  });

  test("the second yes overwrites the later edit and keeps the person's version in the recovery folder", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/Other.tsx": "export const other = 2;\n" });
    const batch = await t.reviewed(1);
    t.change({ "src/Other.tsx": "export const other = 3; // mine\n" });
    await t.reviewed(2);
    const r = await t.undo(batch, ["src/Other.tsx"]);
    expect(r).toMatchObject({ ok: true, reverted: ["src/Other.tsx"], saved: ["src/Other.tsx"] });
    expect(read(t.project, "src/Other.tsx")).toBe("export const other = 1;\n");
    valid(t.events);
  });

  test("while the other tool is still writing, or the engine is busy in the folder, it says stop it first", async () => {
    let busy = false;
    const t = setup({ busy: () => busy });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    const batch = await t.reviewed(1);
    // A new write, not quiet yet: the tool is still writing.
    t.change({ "src/Other.tsx": "export const other = 9;\n" });
    expect(await t.plan(batch)).toMatchObject({ ok: false, why: "writing" });
    expect(await t.undo(batch)).toMatchObject({ ok: false, why: "writing" });
    expect(read(t.project, "src/App.tsx")).toBe("export const title = 'Changed';\n");
    await t.until(() => t.of("review.batch").filter((e) => e.count > 0).length >= 2);
    busy = true;
    expect(await t.plan(batch)).toMatchObject({ ok: false, why: "busy" });
    valid(t.events);
  });

  test("the commit case: the plan and the result say a commit was made, and no git file is written", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    const batch = await t.reviewed(1);
    // The other tool committed: its branch file moved after the batch began (written here by hand, no git is run).
    mkdirSync(join(t.project, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(t.project, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(t.project, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n");
    const listing = () => readdirSync(join(t.project, ".git"), { recursive: true }).map(String).sort().map((f) => { const p = join(t.project, ".git", f); const s = statSync(p); return s.isFile() ? `${f}:${s.mtimeMs}:${readFileSync(p, "utf8")}` : f; });
    const before = listing();
    expect(await t.plan(batch)).toMatchObject({ ok: true, committed: true });
    const r = await t.undo(batch);
    expect(r).toMatchObject({ ok: true, committed: true, reverted: ["src/App.tsx"] });
    expect(listing()).toEqual(before);
    valid(t.events);
  });

  test("a commit the person made before the change began is not the tool's: no commit is said, before or after a restart", async () => {
    const log = new TaskLog(":memory:");
    const t = setup({ log });
    await started(t);
    // The person's own commit, after the starting point but before the other tool's first change (written by hand).
    mkdirSync(join(t.project, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(t.project, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(t.project, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n");
    await sleep(120);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    const batch = await t.reviewed(1);
    expect(await t.plan(batch)).toMatchObject({ ok: true, committed: false });
    // After a restart the History row's own start time is used, never the starting point's.
    t.svc.stop();
    const again = new ReviewService({ emit: (e) => t.events.push(e), setting: (k) => t.values[k], store: () => t.store, spend: { room: () => 10, book: () => {} }, watch: (_d, _on) => ({ close: () => {} }), graceMs: 20, quietMs: () => 30,
      history: { add: () => 0, did: () => {}, points: (p, b) => log.reviewPoints(p, b), undone: (p, b, s) => log.reviewUndone(p, b, s), recent: (p, n) => log.recentReviewPoints(p, n) } });
    services.push(again);
    again.setProject(t.project); await again.ready();
    await again.handle(t.cmd("review.undoPlan", { batch }) as never);
    expect(t.of("review.undoPlan").at(-1)).toMatchObject({ ok: true, committed: false });
    // A commit after the change began is still said.
    await sleep(20);
    writeFileSync(join(t.project, ".git", "refs", "heads", "main"), "1123456789abcdef0123456789abcdef01234567\n");
    await again.handle(t.cmd("review.undoPlan", { batch }) as never);
    expect(t.of("review.undoPlan").at(-1)).toMatchObject({ ok: true, committed: true });
  });

  test("a newer change still waiting to be reviewed, moments old, means the tool may still be at work: stop it first", async () => {
    const t = setup();
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    const batch = await t.reviewed(1);
    // The tool paused longer than the quiet time and a newer batch opened; it is not reviewed yet.
    t.change({ "src/Other.tsx": "export const other = 9;\n" });
    await t.until(() => t.of("review.batch").filter((e) => e.count > 0).length >= 2);
    expect(await t.plan(batch)).toMatchObject({ ok: false, why: "writing" });
    expect(await t.undo(batch)).toMatchObject({ ok: false, why: "writing" });
    expect(read(t.project, "src/App.tsx")).toBe("export const title = 'Changed';\n");
    // Once that newer change is reviewed, the older one can go back.
    await t.reviewed(2);
    expect(await t.plan(batch)).toMatchObject({ ok: true, files: ["src/App.tsx"] });
    valid(t.events);
  });

  test("after a restart the History row still knows its versions; a version cleaned up is said as gone", async () => {
    const log = new TaskLog(":memory:");
    const t = setup({ log });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    const batch = await t.reviewed(1);
    const pts = log.reviewPoints(t.project, batch)!;
    expect(pts.from).toMatch(/^cp_/);
    expect(pts.to).toMatch(/^cp_/);
    expect(log.recentReviewPoints(t.project, 10)).toEqual(expect.arrayContaining([pts.from, pts.to]));
    // A new engine (the review's memory is gone): the row's versions are used.
    t.svc.stop();
    const again = new ReviewService({ emit: (e) => t.events.push(e), setting: (k) => t.values[k], store: () => t.store, spend: { room: () => 10, book: () => {} }, watch: (_d, _on) => ({ close: () => {} }), graceMs: 20, quietMs: () => 30,
      history: { add: () => 0, did: () => {}, points: (p, b) => log.reviewPoints(p, b), undone: (p, b, s) => log.reviewUndone(p, b, s), recent: (p, n) => log.recentReviewPoints(p, n) } });
    services.push(again);
    again.setProject(t.project); await again.ready();
    await again.handle(t.cmd("review.undoPlan", { batch }) as never);
    expect(t.of("review.undoPlan").at(-1)).toMatchObject({ ok: true, files: ["src/App.tsx"] });
    // A batch no row knows, or whose versions were cleaned up: gone.
    log.addReview({ project: t.project, batch: "rv_00000000aa", at: new Date().toISOString(), files: ["x.ts"], count: 1, rating: "safe", touches: [], checks: "not_run", summary: "", from: "cp_9990", to: "cp_9991" });
    await again.handle(t.cmd("review.undoPlan", { batch: "rv_00000000aa" }) as never);
    expect(t.of("review.undoPlan").at(-1)).toMatchObject({ ok: false, why: "gone" });
    await again.handle(t.cmd("review.undoPlan", { batch: "rv_00000000bb" }) as never);
    expect(t.of("review.undoPlan").at(-1)).toMatchObject({ ok: false, why: "gone" });
    valid(t.events);
  });

  test("the link record: the review row names the put back's safety copy, and the put backs are counted", async () => {
    const log = new TaskLog(":memory:");
    const t = setup({ log });
    await started(t);
    t.change({ "src/App.tsx": "export const title = 'Changed';\n" });
    const batch = await t.reviewed(1);
    const since = new Date(Date.now() - 60_000).toISOString();
    expect(log.reviewUndos(t.project, since)).toBe(0);
    const r = await t.undo(batch);
    expect(r.safety).toMatch(/^cp_/);
    expect(log.reviewPoints(t.project, batch)).toMatchObject({ undoneBy: r.safety });
    expect(log.reviewUndos(t.project, since)).toBe(1);
    expect(log.reviews(t.project)[0]).toMatchObject({ batch, undo: "done" });
  });
});

describe("History's rows say whether Put these files back can be offered", () => {
  test("ok while both versions are kept, gone once one was cleaned up, done once put back, nothing for a row from before M101", async () => {
    const { AgentRunner } = await import("../src/agent.ts");
    const { ScriptedEngine } = await import("../src/engine.ts");
    const { RunnerSettings } = await import("../src/settings.ts");
    const project = tmp("rows");
    write(project, { "a.ts": "a1\n" });
    const log = new TaskLog(":memory:");
    const events: Ev[] = [];
    const runner = new AgentRunner({ shadowRoot: tmp("s"), engine: new ScriptedEngine([]), log, settings: new RunnerSettings(), emit: (e) => events.push(e as Ev) });
    const store = runner.checkpointsFor(project);
    const from = await store.snapshot("from", { envCopies: false });
    write(project, { "a.ts": "a2\n" });
    const to = await store.snapshot("to", { envCopies: false });
    const at = new Date().toISOString();
    const row = (batch: string, extra: Record<string, unknown>) => log.addReview({ project, batch, at, files: ["a.ts"], count: 1, rating: "safe", touches: [], checks: "not_run", summary: "", ...extra });
    row("rv_00000000a1", { from: from.id, to: to.id });
    row("rv_00000000a2", { from: from.id, to: "cp_9999" });
    row("rv_00000000a3", { from: from.id, to: to.id });
    log.reviewUndone(project, "rv_00000000a3", to.id);
    row("rv_00000000a4", {});
    await runner.handle({ v: 1, id: "t", type: "tasks.list", project } as never);
    const list = events.find((e) => e.type === "tasks.list")!;
    const by = Object.fromEntries(list.reviews.map((r: Ev) => [r.batch, r.undo ?? null]));
    expect(by).toEqual({ rv_00000000a1: "ok", rv_00000000a2: "gone", rv_00000000a3: "done", rv_00000000a4: null });
    valid(events);
  });
});

describe("the protocol", () => {
  test("a put back needs the person's yes; the look does not change anything", () => {
    const base = { v: 1, id: "c", project: "/p", batch: "rv_0123456789" };
    expect(parseCommand(JSON.stringify({ ...base, type: "review.undoPlan" })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ ...base, type: "review.undo", confirm: true })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ ...base, type: "review.undo" })).ok).toBe(false);
    expect(parseCommand(JSON.stringify({ ...base, type: "review.undo", confirm: true, overwrite: ["a.ts"] })).ok).toBe(true);
    expect(parseCommand(JSON.stringify({ ...base, type: "review.undo", confirm: true, overwrite: [1] })).ok).toBe(false);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", type: "review.undoPlan", project: "/p", batch: "rv_0123456789", ok: false, why: "nonsense" })).ok).toBe(false);
  });
  test("the shared fixtures parse on this side", () => {
    const lines = (f: string) => readFileSync(join(import.meta.dir, `../../protocol/fixtures/${f}`), "utf8").split("\n").filter((l) => l.includes('"review.undo'));
    const c = lines("commands.jsonl"), e = lines("events.jsonl");
    expect(c.length).toBeGreaterThanOrEqual(2);
    expect(e.length).toBeGreaterThanOrEqual(4);
    for (const l of c) expect(parseCommand(l).ok, l).toBe(true);
    for (const l of e) expect(parseEvent(l).ok, l).toBe(true);
  });
});
