// House rules are the person's own protections for a project (.companion/rules.txt, changed only from Settings, after an
// inline confirm for a removal). They are not part of a task's work, so no Undo ever changes them: putting a project back
// to before a task, or undoing one task in the middle, keeps the rules file exactly as it is now (T16). Temporary folders
// only; never a real project.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/checkpoints.ts";
import { RULES_FILE } from "../src/rules.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-rules-undo-${l}-`))); made.push(d); return d; };
const read = (d: string, p: string) => readFileSync(join(d, p), "utf8");
const rules = (d: string, text: string) => { mkdirSync(join(d, ".companion"), { recursive: true }); writeFileSync(join(d, RULES_FILE), text); };

describe("Undo never changes the house rules", () => {
  test("a rule added after a task is still there after that task is undone", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "a1"); rules(p, "never edit .env\n");
    const s = new CheckpointStore(tmp("s"), p);
    const before = await s.snapshot("Before: task");
    writeFileSync(join(p, "a.txt"), "a2");
    await s.snapshot("After: task");
    rules(p, "never edit .env\nask before installing packages\n");   // the person, in Settings, after the task
    await s.restore(before.id);
    expect(read(p, "a.txt")).toBe("a1");                            // the task's own work is undone
    expect(read(p, RULES_FILE)).toBe("never edit .env\nask before installing packages\n");
  });
  test("a rules file made after the version undone to is kept, not deleted", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "a1");
    const s = new CheckpointStore(tmp("s"), p);
    const before = await s.snapshot("Before: task");
    writeFileSync(join(p, "new.txt"), "added by the task");
    rules(p, "never run rm\n");
    await s.snapshot("After: task");
    await s.restore(before.id);
    expect(existsSync(join(p, "new.txt"))).toBe(false);
    expect(read(p, RULES_FILE)).toBe("never run rm\n");
  });
  test("a rules file taken away since is not brought back by Undo", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "a1"); rules(p, "never edit .env\n");
    const s = new CheckpointStore(tmp("s"), p);
    const before = await s.snapshot("Before: task");
    writeFileSync(join(p, "a.txt"), "a2");
    rmSync(join(p, RULES_FILE));
    await s.restore(before.id);
    expect(read(p, "a.txt")).toBe("a1");
    expect(existsSync(join(p, RULES_FILE))).toBe(false);
  });
  test("putting back the undo itself keeps them too", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "a1"); rules(p, "never edit .env\n");
    const s = new CheckpointStore(tmp("s"), p);
    const before = await s.snapshot("Before: task");
    writeFileSync(join(p, "a.txt"), "a2");
    const r = await s.restore(before.id);
    rules(p, "never edit .env\nnever run deploy\n");
    await s.restore(r.safetyCheckpoint);
    expect(read(p, "a.txt")).toBe("a2");
    expect(read(p, RULES_FILE)).toBe("never edit .env\nnever run deploy\n");
  });
  test("undoing one task in the middle keeps a rule saved while that task ran", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "a1"); rules(p, "never edit .env\n");
    const s = new CheckpointStore(tmp("s"), p);
    const b = await s.snapshot("Before: task");
    writeFileSync(join(p, "a.txt"), "a2");
    rules(p, "never edit .env\nask before running npm\n");   // saved in Settings while the task ran
    const a = await s.snapshot("After: task");
    const plan = await s.undoOnePlan(b.id, a.id, a.id);
    expect(plan.changed.map((c) => c.file)).toEqual(["a.txt"]);
    await s.undoOne(b.id, a.id, "task");
    expect(read(p, "a.txt")).toBe("a1");
    expect(read(p, RULES_FILE)).toBe("never edit .env\nask before running npm\n");
  });
  test("a task that changed only the rules file has nothing of its own to undo", async () => {
    const p = tmp("p"); writeFileSync(join(p, "a.txt"), "a1");
    const s = new CheckpointStore(tmp("s"), p);
    const b = await s.snapshot("Before: task");
    rules(p, "never edit .env\n");
    const a = await s.snapshot("After: task");
    const plan = await s.undoOnePlan(b.id, a.id, a.id);
    expect(plan.safe).toBe(false);
    expect(plan.changed).toEqual([]);
  });
});
