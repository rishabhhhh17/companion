// M106 (docs/milestones/M106-background-jobs.md): Claude Code's background jobs work in their own folder under
// .claude/worktrees/<name>/ in the project. Their changes are reviewed too, one labelled batch per job, with the proof run in
// the job's folder and a plain note when two jobs changed the same file. Every folder is a temporary fixture, the shadow store
// is the engine's own (real git on its own GIT_DIR), and no model, key or git command in the fixture is used.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "../../protocol/index.ts";
import { CheckpointStore } from "../src/checkpoints.ts";
import { ChangeBatcher, ignoredPath, jobPath, type WatchFn } from "../src/review/batcher.ts";
import { ReviewService, type CheckOutcome } from "../src/review/service.ts";

const made: string[] = [];
const services: ReviewService[] = [];
afterEach(() => {
  while (services.length) services.pop()!.stop();
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tmp = (label: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m106-${label}-`))); made.push(d); return d; };
const until = async (pred: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 20 && !pred(); i++) await sleep(20); expect(pred()).toBe(true); };
const write = (f: string, text: string) => { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, text); };
/** Every file under a folder (a file itself too), with its bytes. */
function dump(p: string): string {
  if (!existsSync(p)) return "";
  if (!statSync(p).isDirectory()) return `${p}\n${readFileSync(p, "hex")}`;
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else out.push(`${f}\n${readFileSync(f, "hex")}`); } };
  walk(p);
  return out.join("\n");
}

describe("the ignore rule", () => {
  test("a job's own folder is a job's path; the rest of .claude is still ignored", () => {
    expect(jobPath(".claude/worktrees/fix-login/src/login.ts")).toEqual({ job: "fix-login", rest: "src/login.ts" });
    expect(jobPath(".claude/worktrees/fix-login")).toEqual({ job: "fix-login", rest: "" });
    expect(jobPath(".claude/worktrees/fix-login/")).toEqual({ job: "fix-login", rest: "" });
    expect(jobPath(".claude/worktrees/a.b_C-9/x")).toEqual({ job: "a.b_C-9", rest: "x" });
    for (const bad of [".claude/settings.json", ".claude/worktrees", ".claude/worktrees/", ".claude/worktrees/../x", ".claude/worktrees/.hidden/x", ".claude/worktrees/a b/x",
      "src/.claude/worktrees/a/x", "/abs/.claude/worktrees/a/x", `.claude/worktrees/${"a".repeat(65)}/x`, ".claude/worktrees/a/../../x", ".claude/worktrees/a/x\0y"]) expect(jobPath(bad), bad).toBeNull();
    // The project's own review never counts a job's file (it is the job's), and the rest of .claude stays out.
    expect(ignoredPath(".claude/worktrees/fix-login/src/login.ts")).toBe(true);
    expect(ignoredPath(".claude/settings.json")).toBe(true);
  });
  test("the watcher hands a job's files to it, never to the main batch, and leaves out its packages and its .git", async () => {
    const project = tmp("w");
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const ready: string[][] = [];
    const jobs: [string, string][] = [];
    const b = new ChangeBatcher({ project, quietMs: () => 30, onReady: (p) => ready.push(p), watch, onJob: (j, r) => jobs.push([j, r]) });
    b.start();
    for (const rel of [".claude/worktrees/one/src/a.ts", ".claude/worktrees/one/node_modules/x/index.js", ".claude/worktrees/one/.git", ".claude/worktrees/one/.claude/settings.json",
      ".claude/worktrees/two", ".claude/settings.json", "src/main.ts"]) send!(rel);
    b.holdOwn();
    send!(".claude/worktrees/one/src/b.ts");   // the engine's own work in the project never holds a job's change
    b.releaseOwn();
    await until(() => ready.length > 0);
    expect(ready).toEqual([["src/main.ts"]]);
    expect(jobs).toEqual([["one", "src/a.ts"], ["two", ""], ["one", "src/b.ts"]]);
    b.stop();
  });
  test("without a job listener, a job's files are ignored as before", async () => {
    const project = tmp("w0");
    let send: ((rel: string) => void) | null = null;
    const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
    const ready: string[][] = [];
    const b = new ChangeBatcher({ project, quietMs: () => 30, onReady: (p) => ready.push(p), watch });
    b.start();
    send!(".claude/worktrees/one/src/a.ts");
    send!("x.ts");
    await until(() => ready.length > 0);
    expect(ready).toEqual([["x.ts"]]);
    b.stop();
  });
});

/** The shadow store's folder for a project or job folder, as the engine names it. */
const shadowOf = (shadow: string, dir: string) => join(shadow, `${createHash("sha256").update(dir).digest("hex").slice(0, 12)}.git`);
type Setup = ReturnType<typeof setup>;
function setup(o: { jobs?: string[]; settings?: Record<string, unknown>; check?: (dir: string) => CheckOutcome; outside?: boolean; shadow?: string; history?: boolean } = {}) {
  const project = tmp("rp"), shadow = o.shadow ?? tmp("shadow");
  write(join(project, "app.js"), "export const a = 1;\n");
  // A stand in for the person's git: a folder the engine must never write.
  write(join(project, ".git", "HEAD"), "ref: refs/heads/main\n");
  write(join(project, ".git", "config"), "[core]\n");
  const dirOf = (name: string) => join(project, ".claude", "worktrees", name);
  for (const name of o.jobs ?? []) {
    write(join(project, ".git", "worktrees", name, "HEAD"), "ref: refs/heads/" + name + "\n");
    write(join(dirOf(name), ".git"), `gitdir: ${join(project, ".git", "worktrees", name)}\n`);
    write(join(dirOf(name), "src", "login.ts"), "export const login = () => true;\n");
    write(join(dirOf(name), "app.js"), "export const a = 1;\n");
  }
  const stores = new Map<string, CheckpointStore>();
  const asked: string[] = [];
  const store = (dir: string) => {
    asked.push(dir);
    let s = stores.get(dir);
    if (!s) { s = new CheckpointStore(shadowOf(shadow, dir), dir); stores.set(dir, s); }
    return s;
  };
  const dropped: string[] = [];
  const dropStore = async (dir: string) => { dropped.push(dir); const s = stores.get(dir) ?? new CheckpointStore(shadowOf(shadow, dir), dir); stores.delete(dir); await s.remove(); };
  // A stand in for the task log's review rows (tasklog.ts), keyed by project and batch as it is.
  const rows: Record<string, any>[] = [];
  const history = o.history ? {
    add: (r: Record<string, any>) => { rows.push(r); return rows.length; }, did: () => {},
    points: (p: string, b: string) => { const r = [...rows].reverse().find((x) => x.project === p && x.batch === b); return r?.from && r?.to ? { from: r.from, to: r.to, undoneBy: null, began: null } : null; },
    undone: () => {}, recent: () => [],
  } : undefined;
  const events: Record<string, any>[] = [];
  let send: ((rel: string) => void) | null = null;
  const watch: WatchFn = (_d, on) => { send = on; return { close: () => { send = null; } }; };
  const checked: string[] = [];
  const fixes: unknown[] = [];
  const settings: Record<string, unknown> = { "review.mode": "ask", "flow.on": true, "review.send": "checksOnly", "review.jobs": true, ...o.settings };
  const svc = new ReviewService({
    emit: (e) => events.push(e), setting: (k) => settings[k], store, spend: { room: () => 10, book: () => {} }, watch, graceMs: 20, quietMs: () => 80, jobSettleMs: 60,
    check: async (dir) => { checked.push(dir); return o.check ? o.check(dir) : { outcome: "ok", reason: "The checks passed." }; },
    fix: (cmd) => { fixes.push(cmd); }, dropStore, ...(history ? { history } : {}),
  });
  services.push(svc);
  return { project, dirOf, svc, events, send: (rel: string) => send?.(rel), checked, fixes, asked, settings, stores, shadow, dropped, rows };
}
const batches = (s: Setup, job?: string) => s.events.filter((e) => e.type === "review.batch" && (job === undefined ? !e.job : e.job === job));
const results = (s: Setup) => s.events.filter((e) => e.type === "review.result" && e.ok === true);
/** A change in a job's folder, said as the folder's own event would say it. */
const edit = (s: Setup, job: string, rel: string, text: string) => { write(join(s.dirOf(job), rel), text); s.send(`.claude/worktrees/${job}/${rel}`); };

describe("one batch per job", () => {
  test("a change in a job's folder is its own batch, named for the job, with paths from the job's folder down", async () => {
    const s = setup({ jobs: ["fix-login"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "fix-login", "src/login.ts", "export const login = () => false;\n");
    await until(() => batches(s, "fix-login").length === 1);
    const b = batches(s, "fix-login")[0];
    expect(b.project).toBe(s.project);
    expect(b.files).toEqual([{ file: "src/login.ts", kind: "modified" }]);
    expect(b.count).toBe(1);
    expect(batches(s)).toHaveLength(0);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", ts: "2026-11-21T00:00:00Z", ...b }))).toMatchObject({ ok: true });
  });
  test("two jobs are two batches; the second is said once the first is closed, never in its place", async () => {
    const s = setup({ jobs: ["one", "two"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 1;\n");
    await until(() => batches(s, "one").length === 1);
    edit(s, "two", "src/new.ts", "export const n = 2;\n");
    await sleep(400);
    expect(batches(s, "two")).toHaveLength(0);
    await s.svc.handle({ v: 1, id: "c1", type: "review.dismiss", project: s.project, batch: batches(s, "one")[0].batch } as any);
    await until(() => batches(s, "two").length === 1);
    expect(batches(s, "two")[0].files).toEqual([{ file: "src/new.ts", kind: "added" }]);
    expect(batches(s, "two")[0].batch).not.toBe(batches(s, "one")[0].batch);
  });
  test("a job's batch never pushes the project's own card aside: it waits until that card is closed", async () => {
    const s = setup({ jobs: ["one"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    write(join(s.project, "app.js"), "export const a = 2;\n"); s.send("app.js");
    await until(() => batches(s).length === 1);
    edit(s, "one", "src/login.ts", "export const login = () => 3;\n");
    await sleep(400);
    expect(batches(s, "one")).toHaveLength(0);
    await s.svc.handle({ v: 1, id: "c1", type: "review.dismiss", project: s.project, batch: batches(s)[0].batch } as any);
    await until(() => batches(s, "one").length === 1);
    expect(batches(s, "one")[0].files).toEqual([{ file: "src/login.ts", kind: "modified" }]);
  });
  test("a new job's checkout is its starting point; only what changes after it settles is reviewed", async () => {
    const s = setup();
    s.svc.setProject(s.project);
    await s.svc.ready();
    for (const f of ["app.js", "src/login.ts", "src/a.ts", "src/b.ts"]) { write(join(s.dirOf("fresh"), f), `// ${f}\n`); s.send(`.claude/worktrees/fresh/${f}`); }
    write(join(s.dirOf("fresh"), ".git"), "gitdir: elsewhere\n");
    s.send(".claude/worktrees/fresh");
    await sleep(400);
    expect(batches(s, "fresh")).toHaveLength(0);
    edit(s, "fresh", "src/a.ts", "// changed by the job\n");
    await until(() => batches(s, "fresh").length === 1);
    expect(batches(s, "fresh")[0].files).toEqual([{ file: "src/a.ts", kind: "modified" }]);
  });
  test("the review names the job, runs the checks in the job's folder, and offers no Fix it there", async () => {
    const s = setup({ jobs: ["one"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    write(join(s.dirOf("one"), "node_modules", ".keep"), "");
    edit(s, "one", "src/login.ts", "export const login = () => 4;\n");
    await until(() => batches(s, "one").length === 1);
    const id = batches(s, "one")[0].batch;
    await s.svc.handle({ v: 1, id: "c2", type: "review.now", project: s.project, batch: id, proof: true } as any);
    await until(() => results(s).length === 1);
    const r = results(s)[0];
    expect(r.job).toBe("one");
    expect(r.batch).toBe(id);
    expect(r.project).toBe(s.project);
    expect(r.checks).toBe("passed");
    expect(s.checked).toEqual([s.dirOf("one")]);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", ts: "2026-11-21T00:00:00Z", ...r }))).toMatchObject({ ok: true });
    await s.svc.handle({ v: 1, id: "c3", type: "review.fix", project: s.project, batch: id, agent: "a1" } as any);
    expect(s.fixes).toHaveLength(0);
    expect(s.events.some((e) => e.type === "protocol.error" && e.failed === "review.fix")).toBe(true);
  });
  test("a job whose packages are not installed in its folder is not checked: the card says why, never a false fail", async () => {
    const s = setup({ jobs: ["one"], check: () => ({ outcome: "failing", reason: "Cannot find module react" }) });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "package.json", "{\"name\":\"x\"}\n");
    await until(() => batches(s, "one").length === 1);
    await s.svc.handle({ v: 1, id: "c2", type: "review.now", project: s.project, batch: batches(s, "one")[0].batch, proof: true } as any);
    await until(() => results(s).length === 1);
    expect(s.checked).toEqual([]);
    expect(results(s)[0].checks).toBe("unknown");
    expect(results(s)[0].checksNote).toMatch(/packages are not installed/);
  });
  test("Automatic reviews a job's batch by itself, in the job's folder", async () => {
    const s = setup({ jobs: ["one"], settings: { "review.mode": "automatic" } });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 5;\n");
    await until(() => results(s).length === 1);
    expect(results(s)[0].job).toBe("one");
    expect(s.checked).toEqual([s.dirOf("one")]);
  });
  test("a job whose folder went away is forgotten, and its waiting batch closes", async () => {
    const s = setup({ jobs: ["one"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 6;\n");
    await until(() => batches(s, "one").length === 1);
    rmSync(s.dirOf("one"), { recursive: true, force: true });
    s.send(".claude/worktrees/one");
    await until(() => batches(s, "one").length === 2);
    expect(batches(s, "one")[1]).toMatchObject({ batch: batches(s, "one")[0].batch, count: 0, files: [] });
  });
  test("with Review Claude's background jobs off, a job's folder is not looked at", async () => {
    const s = setup({ jobs: ["one"], settings: { "review.jobs": false } });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 7;\n");
    await sleep(500);
    expect(batches(s, "one")).toHaveLength(0);
    expect(s.asked.some((d) => d.startsWith(join(s.project, ".claude")))).toBe(false);
  });
});

describe("a job's versions are its own (review findings)", () => {
  test("after Looks fine, a job's review cannot put back files in the project, and its row keeps no versions", async () => {
    const s = setup({ jobs: ["one"], history: true });
    s.svc.setProject(s.project);
    await s.svc.ready();
    // The project's own store gets versions of its own first, so the same ids exist in both stores.
    for (const n of [2, 3]) {
      write(join(s.project, "app.js"), `export const a = ${n};\n`); s.send("app.js");
      await until(() => batches(s).filter((b) => b.count > 0).length === n - 1);
      const pid = batches(s).filter((b) => b.count > 0).at(-1)!.batch;
      await s.svc.handle({ v: 1, id: `p${n}`, type: "review.now", project: s.project, batch: pid } as any);
      await until(() => results(s).length === n - 1);
      await s.svc.handle({ v: 1, id: `d${n}`, type: "review.dismiss", project: s.project, batch: pid } as any);
    }
    edit(s, "one", "src/login.ts", "export const login = () => 10;\n");
    await until(() => batches(s, "one").length === 1);
    const id = batches(s, "one")[0].batch;
    await s.svc.handle({ v: 1, id: "c2", type: "review.now", project: s.project, batch: id } as any);
    await until(() => results(s).some((r) => r.batch === id));
    await s.svc.handle({ v: 1, id: "c3", type: "review.dismiss", project: s.project, batch: id } as any);
    const row = s.rows.find((r) => r.batch === id)!;
    expect(row).toBeDefined();
    expect(row.from).toBeUndefined();
    expect(row.to).toBeUndefined();
    const before = dump(join(s.project, "app.js"));
    await s.svc.handle({ v: 1, id: "c4", type: "review.undoPlan", project: s.project, batch: id } as any);
    await until(() => s.events.some((e) => e.type === "review.undoPlan" && e.batch === id));
    expect(s.events.find((e) => e.type === "review.undoPlan" && e.batch === id)).toMatchObject({ ok: false, why: "gone" });
    await s.svc.handle({ v: 1, id: "c5", type: "review.undo", project: s.project, batch: id, confirm: true } as any);
    await until(() => s.events.some((e) => e.type === "review.undone" && e.batch === id));
    expect(s.events.find((e) => e.type === "review.undone" && e.batch === id)).toMatchObject({ ok: false });
    expect(dump(join(s.project, "app.js"))).toBe(before);
  });
  test("a job whose folder went away has its shadow store removed", async () => {
    const s = setup({ jobs: ["one", "two"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    const gone = shadowOf(s.shadow, s.dirOf("one")), kept = shadowOf(s.shadow, s.dirOf("two"));
    await until(() => existsSync(gone) && existsSync(kept));
    rmSync(s.dirOf("one"), { recursive: true, force: true });
    s.send(".claude/worktrees/one");
    await until(() => !existsSync(gone));
    expect(existsSync(kept)).toBe(true);
    expect(existsSync(shadowOf(s.shadow, s.project))).toBe(true);
    expect(s.dropped).toEqual([s.dirOf("one")]);
  });
  test("a job folder removed while Squibby was closed has its shadow store removed when the project opens again", async () => {
    const first = setup({ jobs: ["old", "live"] });
    first.svc.setProject(first.project);
    await first.svc.ready();
    const gone = shadowOf(first.shadow, first.dirOf("old")), kept = shadowOf(first.shadow, first.dirOf("live"));
    await until(() => existsSync(gone) && existsSync(kept));
    first.svc.stop();
    rmSync(first.dirOf("old"), { recursive: true, force: true });
    // The same project and shadow folder, a new engine.
    const events: Record<string, any>[] = [];
    const removed: string[] = [];
    const svc = new ReviewService({
      emit: (e) => events.push(e), setting: (k) => first.settings[k], store: (d) => first.stores.get(d) ?? (() => { const st = new CheckpointStore(shadowOf(first.shadow, d), d); first.stores.set(d, st); return st; })(),
      spend: { room: () => 10, book: () => {} }, watch: () => ({ close: () => {} }), graceMs: 20, quietMs: () => 80, jobSettleMs: 60,
      dropStore: async (d) => { removed.push(d); first.stores.delete(d); await CheckpointStore.removeAt(shadowOf(first.shadow, d), d); },
    });
    services.push(svc);
    svc.setProject(first.project);
    await svc.ready();
    await until(() => !existsSync(gone));
    expect(removed).toEqual([first.dirOf("old")]);
    expect(existsSync(kept)).toBe(true);
  });
});

describe("removing a job's store", () => {
  test("removeAt removes only a shadow store's own folder, never anything else", async () => {
    const shadow = tmp("rm"), other = tmp("rm-other");
    write(join(shadow, "abc.git", "HEAD"), "x\n");
    write(join(other, "keep", "a.txt"), "keep\n");
    await CheckpointStore.removeAt(join(shadow, "abc.git"), join(other, "gone"));
    expect(existsSync(join(shadow, "abc.git"))).toBe(false);
    await CheckpointStore.removeAt(join(other, "keep"), join(other, "gone"));
    await CheckpointStore.removeAt(join(other, "x", ".git"), join(other, "x"));
    expect(readFileSync(join(other, "keep", "a.txt"), "utf8")).toBe("keep\n");
  });
});

describe("the overlap note", () => {
  test("a file two open jobs changed is named with the other job, and a file only one changed is not", async () => {
    const s = setup({ jobs: ["new-header", "fix-login"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "new-header", "src/login.ts", "export const login = () => 'header';\n");
    await until(() => batches(s, "new-header").length === 1);
    // Skipped, never merged: the job's folder still holds that change.
    await s.svc.handle({ v: 1, id: "c1", type: "review.dismiss", project: s.project, batch: batches(s, "new-header")[0].batch } as any);
    edit(s, "fix-login", "src/login.ts", "export const login = () => 'fix';\n");
    edit(s, "fix-login", "src/only.ts", "export const o = 1;\n");
    await until(() => batches(s, "fix-login").length >= 1 && batches(s, "fix-login").at(-1)!.count === 2);
    await s.svc.handle({ v: 1, id: "c2", type: "review.now", project: s.project, batch: batches(s, "fix-login").at(-1)!.batch } as any);
    await until(() => results(s).length === 1);
    expect(results(s)[0].overlap).toEqual([{ file: "src/login.ts", jobs: ["new-header"] }]);
  });
  test("no other job, no note", async () => {
    const s = setup({ jobs: ["solo"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "solo", "src/login.ts", "export const login = () => 0;\n");
    await until(() => batches(s, "solo").length === 1);
    await s.svc.handle({ v: 1, id: "c2", type: "review.now", project: s.project, batch: batches(s, "solo")[0].batch } as any);
    await until(() => results(s).length === 1);
    expect(results(s)[0].overlap).toBeUndefined();
  });
});

describe("other jobs that wait (review findings: Coucou lists every session at once)", () => {
  test("a card says how many other jobs' changes wait behind it, when it is said and when its review comes", async () => {
    const s = setup({ jobs: ["one", "two", "three"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 11;\n");
    await until(() => batches(s, "one").length === 1);
    expect(batches(s, "one")[0].waiting).toBeUndefined();
    edit(s, "two", "src/login.ts", "export const login = () => 12;\n");
    edit(s, "three", "src/login.ts", "export const login = () => 13;\n");
    await sleep(400);
    const one = batches(s, "one")[0].batch;
    await s.svc.handle({ v: 1, id: "w1", type: "review.now", project: s.project, batch: one } as any);
    await until(() => results(s).some((r) => r.batch === one));
    const r = results(s).find((x) => x.batch === one)!;
    expect(r.waiting).toBe(2);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", ts: "2026-11-21T00:00:00Z", ...r }))).toMatchObject({ ok: true });
    await s.svc.handle({ v: 1, id: "w2", type: "review.dismiss", project: s.project, batch: one } as any);
    await until(() => batches(s, "two").length === 1);
    expect(batches(s, "two")[0].waiting).toBe(1);
    expect(parseEvent(JSON.stringify({ v: 1, id: "e", ts: "2026-11-21T00:00:00Z", ...batches(s, "two")[0] }))).toMatchObject({ ok: true });
    await s.svc.handle({ v: 1, id: "w3", type: "review.dismiss", project: s.project, batch: batches(s, "two")[0].batch } as any);
    await until(() => batches(s, "three").length === 1);
    expect(batches(s, "three")[0].waiting).toBeUndefined();
  });
  test("the project's own card says the jobs that wait behind it too", async () => {
    const s = setup({ jobs: ["one"] });
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 14;\n");
    await until(() => batches(s, "one").length === 1);
    write(join(s.project, "app.js"), "export const a = 9;\n"); s.send("app.js");
    await until(() => batches(s).length === 1);
    expect(batches(s)[0].waiting).toBe(1);
  });
});

describe("hands off git, and nothing outside the folder", () => {
  test("nothing writes the person's .git or a job's .git file, through a whole review", async () => {
    const s = setup({ jobs: ["one", "two"] });
    const before = [dump(join(s.project, ".git")), dump(join(s.dirOf("one"), ".git")), dump(join(s.dirOf("two"), ".git"))];
    s.svc.setProject(s.project);
    await s.svc.ready();
    edit(s, "one", "src/login.ts", "export const login = () => 8;\n");
    edit(s, "two", "src/login.ts", "export const login = () => 9;\n");
    await until(() => batches(s, "one").length === 1);
    await s.svc.handle({ v: 1, id: "c2", type: "review.now", project: s.project, batch: batches(s, "one")[0].batch, proof: true } as any);
    await until(() => results(s).length === 1);
    await s.svc.handle({ v: 1, id: "c3", type: "review.dismiss", project: s.project, batch: batches(s, "one")[0].batch } as any);
    await until(() => batches(s, "two").length === 1);
    await s.svc.ready();
    expect([dump(join(s.project, ".git")), dump(join(s.dirOf("one"), ".git")), dump(join(s.dirOf("two"), ".git"))]).toEqual(before);
  });
  test("a job folder that is a link to elsewhere is never read", async () => {
    const s = setup();
    const outside = tmp("outside");
    write(join(outside, "secret.ts"), "export const k = 'not yours';\n");
    mkdirSync(join(s.project, ".claude", "worktrees"), { recursive: true });
    symlinkSync(outside, s.dirOf("evil"));
    s.svc.setProject(s.project);
    await s.svc.ready();
    write(join(outside, "secret.ts"), "export const k = 'changed';\n");
    s.send(".claude/worktrees/evil/secret.ts");
    s.send(".claude/worktrees/evil");
    await sleep(500);
    expect(batches(s, "evil")).toHaveLength(0);
    expect(s.asked.some((d) => d.includes("worktrees") || d.startsWith(outside))).toBe(false);
  });
  test("a .claude folder that is a link to elsewhere is never read either", async () => {
    const s = setup();
    const outside = tmp("outside2");
    write(join(outside, "worktrees", "job", "src", "x.ts"), "export const x = 1;\n");
    symlinkSync(outside, join(s.project, ".claude"));
    s.svc.setProject(s.project);
    await s.svc.ready();
    write(join(outside, "worktrees", "job", "src", "x.ts"), "export const x = 2;\n");
    s.send(".claude/worktrees/job/src/x.ts");
    await sleep(500);
    expect(batches(s, "job")).toHaveLength(0);
    expect(s.asked.some((d) => d !== s.project)).toBe(false);
  });
});
