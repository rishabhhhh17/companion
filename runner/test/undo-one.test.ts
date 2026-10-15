// Undoing one task in the middle: only what that task changed goes back, and never when later work (a later task or the
// person) changed the same files, so nothing done after it is silently lost. Temporary folders only; never a real project.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-one-${l}-`))); made.push(d); return d; };
const read = (d: string, p: string) => readFileSync(join(d, p), "utf8");

async function threeTasks() {
  const p = tmp("p");
  writeFileSync(join(p, "a.txt"), "a1"); writeFileSync(join(p, "b.txt"), "b1"); writeFileSync(join(p, "gone.txt"), "keep me");
  const s = new CheckpointStore(tmp("s"), p);
  const b1 = await s.snapshot("Before: one");
  writeFileSync(join(p, "a.txt"), "a2");
  const a1 = await s.snapshot("After: one");
  // Task two, the one that will be undone: changes b, adds new.txt, removes gone.txt.
  const b2 = await s.snapshot("Before: two");
  writeFileSync(join(p, "b.txt"), "b2-bad"); writeFileSync(join(p, "new.txt"), "added"); rmSync(join(p, "gone.txt"));
  mkdirSync(join(p, "deep", "er"), { recursive: true }); writeFileSync(join(p, "deep", "er", "x.txt"), "x");
  const a2 = await s.snapshot("After: two");
  // Task three changes a different file.
  const b3 = await s.snapshot("Before: three");
  writeFileSync(join(p, "c.txt"), "c3"); writeFileSync(join(p, "a.txt"), "a3");
  const a3 = await s.snapshot("After: three");
  return { p, s, b1, a1, b2, a2, b3, a3 };
}

describe("planning an undo of one task", () => {
  test("a task whose files nobody touched since can be undone on its own", async () => {
    const t = await threeTasks();
    const now = await t.s.snapshot("now");
    const plan = await t.s.undoOnePlan(t.b2.id, t.a2.id, now.id);
    expect(plan.safe).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(plan.changed.map((c) => `${c.kind} ${c.file}`).sort()).toEqual(["added deep/er/x.txt", "added new.txt", "deleted gone.txt", "modified b.txt"]);
  });
  test("a later task that changed the same file makes it show only, and says which file", async () => {
    const t = await threeTasks();
    writeFileSync(join(t.p, "b.txt"), "b-later");
    const now = await t.s.snapshot("now");
    const plan = await t.s.undoOnePlan(t.b2.id, t.a2.id, now.id);
    expect(plan.safe).toBe(false);
    expect(plan.conflicts).toEqual(["b.txt"]);
    expect(plan.reason).toContain("b.txt");
    expect(plan.reason).not.toMatch(/—/);
  });
  test("a file the task added and that was changed later, or one it removed that came back, is a conflict too", async () => {
    const t = await threeTasks();
    writeFileSync(join(t.p, "new.txt"), "edited later"); writeFileSync(join(t.p, "gone.txt"), "came back");
    const now = await t.s.snapshot("now");
    const plan = await t.s.undoOnePlan(t.b2.id, t.a2.id, now.id);
    expect(plan.conflicts.sort()).toEqual(["gone.txt", "new.txt"]);
  });
  test("a task that changed nothing has nothing to undo", async () => {
    const t = await threeTasks();
    const plan = await t.s.undoOnePlan(t.b2.id, t.b2.id, t.b2.id);
    expect(plan.safe).toBe(false);
  });
  test("a private settings file the task changed counts, and its later change is a conflict", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "x"); writeFileSync(join(p, ".env"), "KEY=old");
    const s = new CheckpointStore(tmp("s"), p);
    const b = await s.snapshot("Before: env");
    writeFileSync(join(p, ".env"), "KEY=new");
    const a = await s.snapshot("After: env");
    const plan = await s.undoOnePlan(b.id, a.id, (await s.snapshot("now")).id);
    expect(plan).toMatchObject({ safe: true, env: [".env"] });
    writeFileSync(join(p, ".env"), "KEY=changed again");
    const later = await s.undoOnePlan(b.id, a.id, (await s.snapshot("now 2")).id);
    expect(later.safe).toBe(false);
    expect(later.conflicts).toEqual([".env"]);
  });
  test("a file behind a link is never written through", async () => {
    const p = tmp("p"), outside = tmp("o");
    mkdirSync(join(p, "src")); writeFileSync(join(p, "src", "a.txt"), "1");
    const s = new CheckpointStore(tmp("s"), p);
    const b = await s.snapshot("Before");
    writeFileSync(join(p, "src", "a.txt"), "2");
    const a = await s.snapshot("After");
    // The folder became a link to somewhere else since.
    rmSync(join(p, "src"), { recursive: true }); mkdirSync(join(outside, "src")); writeFileSync(join(outside, "src", "a.txt"), "2");
    symlinkSync(join(outside, "src"), join(p, "src"));
    const plan = await s.undoOnePlan(b.id, a.id, (await s.snapshot("now")).id);
    expect(plan.safe).toBe(false);
    expect(read(outside, "src/a.txt")).toBe("2");
  });
});

describe("undoing one task", () => {
  test("only that task's changes go back; the tasks before and after it keep theirs", async () => {
    const t = await threeTasks();
    const r = await t.s.undoOne(t.b2.id, t.a2.id, "two");
    expect(read(t.p, "b.txt")).toBe("b1");
    expect(existsSync(join(t.p, "new.txt"))).toBe(false);
    expect(existsSync(join(t.p, "deep"))).toBe(false);
    expect(read(t.p, "gone.txt")).toBe("keep me");
    // Task one's and task three's work is all still there.
    expect(read(t.p, "a.txt")).toBe("a3");
    expect(read(t.p, "c.txt")).toBe("c3");
    expect(r.reverted.sort()).toEqual(["b.txt", "deep/er/x.txt", "gone.txt", "new.txt"]);
    expect(r.safetyCheckpoint).toMatch(/^cp_/);
  });
  test("it is itself undoable: the version from just before it can be put back", async () => {
    const t = await threeTasks();
    const r = await t.s.undoOne(t.b2.id, t.a2.id, "two");
    await t.s.restore(r.safetyCheckpoint);
    expect(read(t.p, "b.txt")).toBe("b2-bad");
    expect(read(t.p, "new.txt")).toBe("added");
    expect(existsSync(join(t.p, "gone.txt"))).toBe(false);
  });
  test("checked again at the moment of undoing: a change since the plan refuses it and nothing is changed", async () => {
    const t = await threeTasks();
    const now = await t.s.snapshot("now");
    expect((await t.s.undoOnePlan(t.b2.id, t.a2.id, now.id)).safe).toBe(true);
    writeFileSync(join(t.p, "b.txt"), "the person typed here");
    await expect(t.s.undoOne(t.b2.id, t.a2.id, "two")).rejects.toThrow(/b\.txt.*Nothing was changed/);
    expect(read(t.p, "b.txt")).toBe("the person typed here");
    expect(read(t.p, "new.txt")).toBe("added");
  });
  test("a private settings file goes back to what it was before the task", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "x"); writeFileSync(join(p, ".env"), "KEY=old");
    const s = new CheckpointStore(tmp("s"), p);
    const b = await s.snapshot("Before: env");
    writeFileSync(join(p, ".env"), "KEY=new"); writeFileSync(join(p, ".env.local"), "NEW=1");
    const a = await s.snapshot("After: env");
    const r = await s.undoOne(b.id, a.id, "env");
    expect(read(p, ".env")).toBe("KEY=old");
    expect(existsSync(join(p, ".env.local"))).toBe(false);
    expect(r.env.sort()).toEqual([".env", ".env.local"]);
  });
  test("the person's own git is never touched", async () => {
    const t = await threeTasks();
    mkdirSync(join(t.p, ".git")); writeFileSync(join(t.p, ".git", "HEAD"), "ref: refs/heads/main\n"); writeFileSync(join(t.p, ".git", "index"), "pretend index");
    await t.s.undoOne(t.b2.id, t.a2.id, "two");
    expect(read(t.p, ".git/HEAD")).toBe("ref: refs/heads/main\n");
    expect(read(t.p, ".git/index")).toBe("pretend index");
  });
});
