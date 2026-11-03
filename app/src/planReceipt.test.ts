// Must fix 7 (review of 4 Nov): after a plan, the result is the whole fix's, never only its last step's. Each step's receipt
// used to replace the one before, so a plan whose last step only ran the tests again ended on "Fixed and proven" over
// "Nothing changed", with part of the cost and no Undo.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initial, receiptVerdict, reduce, type Model } from "./model.ts";
import { undoCan } from "./homeHero.ts";
import { verdictOf } from "./verdict.ts";
import { repliesIn } from "./speech.ts";
import { S } from "./strings.ts";

const P = "/Users/me/site";
const A = "companion";
const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = { ...initial(), folder: P }) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const plan = ev({ type: "plan.ready", agent: A, steps: [{ title: "Fix the form" }, { title: "Run the tests" }], truncated: false, estimateUsd: 0.2 });
const step = (index: number, cp: string, changed: { file: string; kind: string }[], proof: string, usd: number, extra: Record<string, unknown> = {}) => [
  ev({ type: "drive.step", agent: A, index, total: 2, title: `step ${index}`, status: "started" }),
  ev({ type: "checkpoint.created", project: P, agent: A, checkpoint: cp, label: `Before: Step ${index} of 2`, files: 3, skipped: [] }),
  ev({ type: "receipt", agent: A, checkpoint: cp, changed, commands: 1, notUndoable: index === 1 ? ["sent an email"] : [], proof, usdEstimate: usd, ended: "done", inPlan: true, ...extra }),
  ev({ type: "drive.step", agent: A, index, total: 2, title: `step ${index}`, status: "done" }),
];
const fixThenTests = [plan, ...step(1, "cp_0004", [{ file: "src/form.js", kind: "modified" }, { file: "src/new.js", kind: "added" }], "passed", 0.08),
  ...step(2, "cp_0005", [], "passed", 0.02)];
const done = ev({ type: "drive.done", agent: A, status: "done", completed: 2, total: 2, usdEstimate: 0.1 });

describe("a plan ends with one receipt for the whole fix", () => {
  test("before the plan ends, the last step's own receipt shows", () => {
    const m = run(fixThenTests);
    expect(m.receipt?.checkpoint).toBe("cp_0005");
    expect(m.receipt?.changed).toEqual([]);
  });
  test("at the end: every changed file, the whole cost, and Undo back to before the first step", () => {
    const m = run([...fixThenTests, done]);
    expect(m.receipt?.checkpoint).toBe("cp_0004");
    expect(m.receipt?.changed).toEqual([{ file: "src/form.js", kind: "modified" }, { file: "src/new.js", kind: "added" }]);
    expect(m.receipt?.usdEstimate).toBe(0.1);
    expect(m.receipt?.commands).toBe(2);
    expect(m.receipt?.notUndoable).toEqual(["sent an email"]);
    expect(m.receipt?.wholePlan).toEqual({ steps: 2, last: "cp_0005" });
    const v = receiptVerdict(m)!;
    expect(v.kind).toBe("proven");
    expect(v.offer).toBe("undo");
    expect(undoCan(m, P)).toBe(true);
  });
  test("a file added in one step and deleted in a later one is not listed; one deleted then added is modified", () => {
    const m = run([plan, ...step(1, "cp_0004", [{ file: "tmp.txt", kind: "added" }, { file: "a.js", kind: "deleted" }], "passed", 0.05),
      ...step(2, "cp_0005", [{ file: "tmp.txt", kind: "deleted" }, { file: "a.js", kind: "added" }], "passed", 0.05), done]);
    expect(m.receipt?.changed).toEqual([{ file: "a.js", kind: "modified" }]);
  });
  test("the whole cost is never less than the steps' own costs added up", () => {
    const m = run([...fixThenTests, ev({ type: "drive.done", agent: A, status: "done", completed: 2, total: 2, usdEstimate: 0 })]);
    expect(m.receipt?.usdEstimate).toBeCloseTo(0.1, 6);
  });
  test("a plan that stopped on a failed check keeps that failure, with Undo of the whole fix", () => {
    const m = run([plan, ...step(1, "cp_0004", [{ file: "src/form.js", kind: "modified" }], "passed", 0.05),
      ...step(2, "cp_0005", [], "failed", 0.05, { ended: "failed", endedWhy: "check_failed" }),
      ev({ type: "drive.done", agent: A, status: "not_done", completed: 1, total: 2, usdEstimate: 0.1 })]);
    const v = receiptVerdict(m)!;
    expect(v.kind).toBe("failed");
    expect(v.offer).toBe("undo");
    expect(m.receipt?.checkpoint).toBe("cp_0004");
  });
  test("a one step plan keeps its own receipt as it was", () => {
    const one = run([plan, ...step(1, "cp_0004", [{ file: "a.js", kind: "modified" }], "passed", 0.05, { repeat: undefined })]);
    const after = run([ev({ type: "drive.done", agent: A, status: "done", completed: 1, total: 1, usdEstimate: 0.05 })], one);
    expect(after.receipt).toEqual(one.receipt);
  });
  test("a late picture of the last step still joins the whole receipt", () => {
    const m = run([...fixThenTests, done, ev({ type: "receipt.visual", agent: A, project: P, checkpoint: "cp_0005", made: true, image: "/tmp/x.png", caption: "After" })]);
    expect(m.receipt?.visual?.image).toBe("/tmp/x.png");
  });
  test("Undo of the whole fix marks it undone", () => {
    const m = run([...fixThenTests, done, ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_0004", safety: "cp_0006", recovered: [], largeLeftAlone: [], leftAlone: [], yours: [] })]);
    expect(m.receipt?.undone).toBe(true);
    expect(receiptVerdict(m)!.kind).toBe("undone");
  });
  test("a new plan starts its own whole receipt", () => {
    const first = run([...fixThenTests, done]);
    const m = run([plan, ...step(1, "cp_0007", [{ file: "b.js", kind: "modified" }], "passed", 0.03), ...step(2, "cp_0008", [], "passed", 0.01),
      ev({ type: "drive.done", agent: A, status: "done", completed: 2, total: 2, usdEstimate: 0.04 })], first);
    expect(m.receipt?.checkpoint).toBe("cp_0007");
    expect(m.receipt?.changed).toEqual([{ file: "b.js", kind: "modified" }]);
  });
  test("the whole fix's result is said once, after the last step's", () => {
    const before = repliesIn(run(fixThenTests), P).map((r) => r.key);
    const after = repliesIn(run([...fixThenTests, done]), P).map((r) => r.key);
    expect(after[0]).not.toBe(before[0]);
  });
  test("its Undo button says it undoes the whole fix", () => {
    expect(S.home.undoWholeFix).toBe("Undo the whole fix");
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("m.receipt.wholePlan ? S.home.undoWholeFix : S.home.undoFix");
  });
});

describe("a check that passed with nothing changed has its own words", () => {
  test("never Fixed and proven over Nothing changed", () => {
    const v = verdictOf({ proof: "passed", ended: "done", undone: false, changed: 0, missing: [] });
    expect(v.kind).toBe("passes");
    expect(v.headline).toBe(S.verdict.passes);
    expect(v.line).toBe(S.verdict.passesLine);
    expect(v.say).toBe("Checked, it passes. Nothing needed changing.");
    expect(v.headline).not.toMatch(/fixed/i);
    expect(v.offer).toBeNull();
  });
  test("the line beside the pointer says Fixed only over a real fix", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('const provenAt = receiptVerdict(m)?.kind === "proven" && !m.receipt!.gone');
    expect(S.followDone).toMatch(/^Fixed/);
  });
});
