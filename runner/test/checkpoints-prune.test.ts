// Must fix 26 (3 Nov 2026), an incident under the bar's rule 9: the undo store grew forever (gc off, nothing pruned) and kept
// a plain copy of every .env file on every checkpoint, review batches included, in a folder Time Machine backed up. T06 says
// to keep the newest 100 checkpoints, run gc weekly and stop at about 2 GB. Now:
//  - the newest 100 are kept, and every one something still points at (a History row, an open Undo card, Your turn, a
//    review in progress); the others go with their private .env copies and notes;
//  - a version that only tells whether a .env file changed (a review's) keeps a salted hash of it, never a copy;
//  - gc runs when it is due, while nothing works in the store, and frees what was pruned;
//  - over the size cap, more is pruned, and the store says it is full;
//  - the store is kept out of Time Machine, and the build folders the review ignores are not saved.
// Temporary folders only; never a real project, never the person's git.
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-prune-${l}-`))); made.push(d); return d; };
const ENV = "STRIPE_SECRET=sk_live_abcdefghijklmnopqrstuvwx\n";
const git = (shadow: string, ...a: string[]) => Bun.spawnSync(["git", "--git-dir", shadow, ...a], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).stdout.toString();
function setup(o: ConstructorParameters<typeof CheckpointStore>[2] = {}) {
  const p = tmp("p"), shadow = join(tmp("s"), "p.git");
  writeFileSync(join(p, "a.txt"), "0"); writeFileSync(join(p, ".env"), ENV); writeFileSync(join(p, ".gitignore"), ".env\n");
  return { p, shadow, s: new CheckpointStore(shadow, p, { keepNewest: 5, pruneSlack: 2, ...o }) };
}
const ids = async (s: CheckpointStore) => (await s.list()).map((c) => c.id);
const metaDirs = (shadow: string) => readdirSync(join(shadow, "meta")).sort();
/** Every file under a folder, with its text, so a test can look for a secret anywhere in the store. */
function everything(dir: string): string {
  let out = "";
  const walk = (d: string) => { for (const n of readdirSync(d, { withFileTypes: true })) { const x = join(d, n.name); if (n.isDirectory()) walk(x); else if (n.isFile()) out += `\n${x}\n` + readFileSync(x, "latin1"); } };
  walk(dir);
  return out;
}

describe("the newest checkpoints are kept, and older ones go", () => {
  test("past the newest few (and a little slack), the oldest go, with their private .env copies and notes", async () => {
    const t = setup();
    for (let i = 1; i <= 8; i++) { writeFileSync(join(t.p, "a.txt"), String(i)); await t.s.snapshot(`Before: task ${i}`); }
    expect(await ids(t.s)).toEqual(["cp_0004", "cp_0005", "cp_0006", "cp_0007", "cp_0008"]);
    expect(metaDirs(t.shadow)).toEqual(["cp_0004", "cp_0005", "cp_0006", "cp_0007", "cp_0008"]);
    expect(git(t.shadow, "for-each-ref", "--format=%(refname)", "refs/cp").trim().split("\n").sort()).toEqual(["refs/cp/4", "refs/cp/5", "refs/cp/6", "refs/cp/7", "refs/cp/8"]);
    // The numbers go on from the newest, never reused.
    expect((await t.s.snapshot("Before: next")).id).toBe("cp_0009");
  });
  test("a checkpoint something still points at is never removed, and Undo to it still works, .env and all", async () => {
    const t = setup();
    const first = await t.s.snapshot("Before: the History row's task");
    const pinned = new Set([first.id]);
    t.s.guard(() => pinned);
    writeFileSync(join(t.p, ".env"), "STRIPE_SECRET=changed\n");
    for (let i = 1; i <= 10; i++) { writeFileSync(join(t.p, "a.txt"), String(i)); await t.s.snapshot(`Review: the changes to look at`); }
    expect(await ids(t.s)).toContain(first.id);
    await t.s.restore(first.id, { protect: false });
    expect(readFileSync(join(t.p, "a.txt"), "utf8")).toBe("0");
    expect(readFileSync(join(t.p, ".env"), "utf8")).toBe(ENV);
  });
  test("a task's After version stays with its Before, so one task can still be undone on its own", async () => {
    const t = setup();
    const before = await t.s.snapshot("Before: fix the header");
    writeFileSync(join(t.p, "a.txt"), "fixed");
    const after = await t.s.snapshot("After: fix the header");
    t.s.guard(() => [before.id]);
    for (let i = 1; i <= 10; i++) { writeFileSync(join(t.p, "b.txt"), String(i)); await t.s.snapshot("Review: the changes to look at"); }
    expect(await ids(t.s)).toEqual(expect.arrayContaining([before.id, after.id]));
  });
  test("when what is pointed at cannot be read, nothing is removed", async () => {
    const t = setup();
    t.s.guard(() => { throw new Error("the task log could not be read"); });
    for (let i = 1; i <= 10; i++) { writeFileSync(join(t.p, "a.txt"), String(i)); await t.s.snapshot("Before: x"); }
    expect((await ids(t.s)).length).toBe(10);
  });
  test("a guard that is taken away no longer keeps anything", async () => {
    const t = setup();
    const first = await t.s.snapshot("Before: old");
    const off = t.s.guard(() => [first.id]);
    off();
    for (let i = 1; i <= 8; i++) { writeFileSync(join(t.p, "a.txt"), String(i)); await t.s.snapshot("Before: x"); }
    expect(await ids(t.s)).not.toContain(first.id);
  });
  test("a new checkpoint never hangs on to the ones before it, so what is pruned can be freed", async () => {
    const t = setup();
    await t.s.snapshot("Before: one");
    const two = await t.s.snapshot("Before: two");
    const commit = git(t.shadow, "rev-parse", "refs/cp/2").trim();
    expect(two.commit).toBe(commit);
    expect(git(t.shadow, "cat-file", "-p", commit)).not.toMatch(/^parent /m);
  });
});

describe("a version that only tells whether .env changed keeps a salted hash, never a copy", () => {
  test("no plain copy and no plain hash of .env is kept for a review's version, anywhere in the store", async () => {
    const t = setup();
    const a = await t.s.snapshot("Review: the starting point", { envCopies: false });
    expect(existsSync(join(t.shadow, "meta", a.id, "env"))).toBe(false);
    const all = everything(t.shadow);
    expect(all).not.toContain("sk_live_abcdefghijklmnopqrstuvwx");
    expect(all).not.toContain(createHash("sha256").update(ENV).digest("hex"));
    expect(a.envFiles).toEqual([".env"]);
  });
  test("a change to .env between two such versions is still seen, by name only, and no change is no change", async () => {
    const t = setup();
    const a = await t.s.snapshot("Review: the starting point", { envCopies: false });
    const b = await t.s.snapshot("Review: the changes to look at", { envCopies: false });
    expect(await t.s.envChanged(a.id, b.id)).toEqual([]);
    writeFileSync(join(t.p, ".env"), "STRIPE_SECRET=rotated\n");
    const c = await t.s.snapshot("Review: the changes to look at", { envCopies: false });
    expect(await t.s.envChanged(b.id, c.id)).toEqual([".env"]);
    expect(await t.s.differs(b.id, c.id)).toBe(true);
  });
  test("a version with a copy and one with only a hash compare the same way", async () => {
    const t = setup();
    const full = await t.s.snapshot("Before: a task");
    const hashed = await t.s.snapshot("Review: after Squibby's own work", { envCopies: false });
    expect(await t.s.envChanged(full.id, hashed.id)).toEqual([]);
    writeFileSync(join(t.p, ".env"), "STRIPE_SECRET=other\n");
    const later = await t.s.snapshot("Review: the changes to look at", { envCopies: false });
    expect(await t.s.envChanged(full.id, later.id)).toEqual([".env"]);
  });
  test("two stores never give the same hash for the same .env (each has its own salt)", async () => {
    const one = setup(), two = setup();
    await one.s.snapshot("Review: the starting point", { envCopies: false });
    await two.s.snapshot("Review: the starting point", { envCopies: false });
    const digests = (shadow: string) => everything(join(shadow, "meta")).match(/h1:[0-9a-f]{64}/g) ?? [];
    expect(digests(one.shadow)).toHaveLength(1);
    expect(digests(one.shadow)[0]).not.toBe(digests(two.shadow)[0]);
  });
  test("Undo to a version kept only as a hash puts the code back but never removes or replaces .env", async () => {
    const t = setup();
    const a = await t.s.snapshot("Review: the starting point", { envCopies: false });
    writeFileSync(join(t.p, "a.txt"), "changed"); writeFileSync(join(t.p, ".env"), "STRIPE_SECRET=newer\n");
    await t.s.snapshot("Before: a task");
    await t.s.restore(a.id, { protect: false });
    expect(readFileSync(join(t.p, "a.txt"), "utf8")).toBe("0");
    expect(readFileSync(join(t.p, ".env"), "utf8")).toBe("STRIPE_SECRET=newer\n");
  });
  test("undoing one task from a version with no copy of a changed .env refuses, changing nothing", async () => {
    const t = setup();
    const from = await t.s.snapshot("Review: the starting point", { envCopies: false });
    writeFileSync(join(t.p, ".env"), "STRIPE_SECRET=by the task\n");
    const to = await t.s.snapshot("After: a task");
    const now = await t.s.snapshot("now");
    const plan = await t.s.undoOnePlan(from.id, to.id, now.id);
    expect(plan.safe).toBe(false);
    await expect(t.s.undoOne(from.id, to.id, "a task")).rejects.toThrow(/Nothing was changed/);
    expect(readFileSync(join(t.p, ".env"), "utf8")).toBe("STRIPE_SECRET=by the task\n");
  });
  test("what our last step left is told by a salted hash too, and an old plain one is still understood once", async () => {
    const t = setup();
    const before = await t.s.snapshot("Before: a task");
    writeFileSync(join(t.p, "a.txt"), "task");
    await t.s.snapshot("After: a task");
    await t.s.noteAgentEnd();
    const own = JSON.parse(readFileSync(join(t.shadow, "own.json"), "utf8"));
    expect(own.baseline.env[".env"]).toMatch(/^h1:[0-9a-f]{64}$/);
    // A store written before this change has a plain hash there: Undo must not take the untouched .env for the person's.
    own.baseline.env[".env"] = createHash("sha256").update(ENV).digest("hex");
    writeFileSync(join(t.shadow, "own.json"), JSON.stringify(own));
    const r = await t.s.restore(before.id);
    expect(r.yours).toEqual([]);
  });
});

describe("gc, the size cap and backups", () => {
  test("gc frees what was pruned and every kept version still reads and restores", async () => {
    const t = setup({ keepNewest: 2, pruneSlack: 0 });
    for (let i = 1; i <= 6; i++) { writeFileSync(join(t.p, `big${i}.txt`), `${i}`.repeat(200_000) + Math.random()); await t.s.snapshot("Before: x"); }
    const count = () => Number(/count: (\d+)/.exec(git(t.shadow, "count-objects", "-v"))?.[1] ?? 0) + Number(/in-pack: (\d+)/.exec(git(t.shadow, "count-objects", "-v"))?.[1] ?? 0);
    const before = count();
    const done = await t.s.maintain({ force: true });
    expect(done.gc).toBe(true);
    expect(count()).toBeLessThan(before);
    const kept = await ids(t.s);
    expect(kept).toHaveLength(2);
    expect(Object.keys(await t.s.readFiles(kept[0], (f) => f === "a.txt"))).toEqual(["a.txt"]);
    await t.s.restore(kept[0], { protect: false });
    expect(existsSync(join(t.p, "big6.txt"))).toBe(false);
  });
  test("gc waits while the store is busy or the Mac is on battery, and runs once it is due", async () => {
    const t = setup({ gcEveryMs: 60_000, idleMs: 50, onPower: () => false });
    await t.s.snapshot("Before: x");
    expect((await t.s.maintain()).gc).toBe(false);                      // not due yet: the store was just made
    const due = setup({ gcEveryMs: 0, idleMs: 60_000, onPower: () => true });
    await due.s.snapshot("Before: x");
    expect((await due.s.maintain()).gc).toBe(false);                    // due, but the store was used just now
    const onBattery = setup({ gcEveryMs: 0, idleMs: 0, onPower: () => false });
    await onBattery.s.snapshot("Before: x");
    expect((await onBattery.s.maintain()).gc).toBe(false);              // due and idle, but on battery
    const ready = setup({ gcEveryMs: 0, idleMs: 0, onPower: () => true });
    await ready.s.snapshot("Before: x");
    expect((await ready.s.maintain()).gc).toBe(true);
  });
  test("over the size cap, more is pruned, and the store says it is full until there is room again", async () => {
    const t = setup({ keepNewest: 50, pruneSlack: 0, capBytes: 1 });
    for (let i = 1; i <= 30; i++) { writeFileSync(join(t.p, "a.txt"), String(i)); await t.s.snapshot("Review: the changes to look at", { envCopies: false }); }
    const r = await t.s.maintain({ force: true });
    expect(r.full).toBe(true);
    expect(t.s.full).toBe(true);
    expect((await ids(t.s)).length).toBeLessThanOrEqual(20);
    const roomy = new CheckpointStore(t.shadow, t.p, { capBytes: 10 * 1024 ** 3 });
    expect((await roomy.maintain({ force: true })).full).toBe(false);
    expect(roomy.full).toBe(false);
  });
  test("the store is kept out of Time Machine backups", async () => {
    if (!existsSync("/usr/bin/tmutil")) { console.warn("No tmutil here: the backup flag was not checked."); return; }
    const t = setup();
    await t.s.snapshot("Before: x");
    await t.s.idle();
    const out = Bun.spawnSync(["/usr/bin/tmutil", "isexcluded", t.shadow]).stdout.toString();
    expect(out).toContain("[Excluded]");
  });
  test("the build folders the review ignores are not saved", async () => {
    const t = setup();
    for (const d of [".svelte-kit", ".nuxt", ".output", ".vercel", ".netlify", ".vite", ".parcel-cache", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".expo", ".angular", ".docusaurus", ".pnpm-store", ".yarn/cache"]) { mkdirSync(join(t.p, d), { recursive: true }); writeFileSync(join(t.p, d, "x.js"), "built"); }
    writeFileSync(join(t.p, "src.js"), "mine");
    const c = await t.s.snapshot("Before: x");
    const files = git(t.shadow, "ls-tree", "-r", "--name-only", c.commit).trim().split("\n");
    expect(files.sort()).toEqual([".gitignore", "a.txt", "src.js"]);
  });
});
