// Which task broke it, the search itself (no git, no checks): how a check of an earlier version is judged, which saved
// versions belong to which task, and the binary search with its hard cap on runs.
import { describe, expect, test } from "bun:test";
import { classify, findFirstBad, MAX_RUNS, packagesKey, taskPoints, WINDOW, type TaskPoint, type Verdict } from "../src/bisect.ts";
import type { LadderResult } from "../src/proof/ladder.ts";
import type { TaskRow } from "../src/tasklog.ts";

const step = (rung: string, status: string) => ({ rung, label: rung, status, detail: "", ms: 1 }) as never;
const res = (verdict: LadderResult["verdict"], steps: unknown[]): LadderResult => ({ verdict, steps: steps as never });

describe("judging one earlier version against the step that fails now", () => {
  test("the same step failing is bad; the same step passing, or not there yet, is good", () => {
    expect(classify(res("failed", [step("install", "skipped"), step("checks", "passed"), step("tests", "failed")]), "tests")).toBe("bad");
    expect(classify(res("passed", [step("checks", "passed"), step("tests", "passed")]), "tests")).toBe("good");
    expect(classify(res("nothing_to_check", [step("checks", "skipped"), step("tests", "skipped")]), "tests")).toBe("good");
    // A later step failing means the step that fails now passed then.
    expect(classify(res("failed", [step("checks", "passed"), step("tests", "passed"), step("start", "failed")]), "tests")).toBe("good");
  });
  test("a version that failed earlier, before it got to that step, says nothing either way", () => {
    expect(classify(res("failed", [step("install", "skipped"), step("checks", "failed")]), "tests")).toBe("skip");
    expect(classify(null, "tests")).toBe("skip");
  });
  test("a stopped check is a stop", () => expect(classify(res("cancelled", []), "tests")).toBe("cancelled"));
});

const row = (id: number, checkpoint: string | null, changed: number | null, label = `task ${id}`): TaskRow =>
  ({ id, project: "/p", agent: "a", mode: "drive", label, status: "done", usd: 0, startedAt: `2026-10-${String(10 + id).padStart(2, "0")}T12:00:00.000Z`, endedAt: null, checkpoint, changed, proof: "passed" });
const cp = (n: number, label: string) => ({ id: `cp_${String(n).padStart(4, "0")}`, label });

describe("which saved versions belong to which task", () => {
  test("each task that changed something gets the version before it and the last version saved after it, oldest first", () => {
    const cps = [cp(1, "Before: one"), cp(2, "After: one"), cp(3, "After: one"), cp(4, "Point at the problem: the project as it was found"), cp(5, "Before: two"), cp(6, "After: two"), cp(7, "Before: three"), cp(8, "After: three")];
    // The log lists newest first.
    const pts = taskPoints([row(3, "cp_0007", 1), row(2, "cp_0005", 0), row(1, "cp_0001", 2)], cps);
    expect(pts.map((p) => [p.label, p.before, p.after])).toEqual([["task 1", "cp_0001", "cp_0003"], ["task 3", "cp_0007", "cp_0008"]]);
    expect(pts[0].at).toBe("2026-10-11T12:00:00.000Z");
  });
  test("a task with no saved version, or whose versions are gone, is left out", () => {
    const pts = taskPoints([row(2, null, 3), row(1, "cp_0009", 1)], [cp(1, "Before: x"), cp(2, "After: x")]);
    expect(pts).toEqual([]);
  });
  test("an after version belongs to its own task, never to the next one", () => {
    const pts = taskPoints([row(2, "cp_0003", 1), row(1, "cp_0001", 1)], [cp(1, "Before: a"), cp(2, "Ship check"), cp(3, "Before: b"), cp(4, "After: b")]);
    expect(pts.map((p) => p.label)).toEqual(["task 2"]);
  });
});

describe("which versions can use the packages installed today", () => {
  const pj = (o: Record<string, unknown>) => JSON.stringify(o);
  const base = { "package.json": pj({ name: "a", version: "1.0.0", scripts: { test: "vitest" }, dependencies: { react: "18.3.1" }, devDependencies: { vitest: "2.1.0" } }) };
  const lock = { "package-lock.json": "0a1b" };
  test("only the package lists and the lockfiles count, not scripts, names or the order of keys", () => {
    const k = packagesKey(base, lock);
    expect(packagesKey({ "package.json": pj({ devDependencies: { vitest: "2.1.0" }, dependencies: { react: "18.3.1" }, name: "b", version: "2.0.0", scripts: { test: "vitest run" } }) }, lock)).toBe(k);
    expect(packagesKey({ "package.json": pj({ name: "a", dependencies: { react: "19.0.0" }, devDependencies: { vitest: "2.1.0" } }) }, lock)).not.toBe(k);
    expect(packagesKey({ "package.json": pj({ name: "a", dependencies: { react: "18.3.1" } }) }, lock)).not.toBe(k);
    expect(packagesKey(base, { "package-lock.json": "ffff" })).not.toBe(k);
    expect(packagesKey(base, {})).not.toBe(k);
  });
  test("a workspace's own package list counts, and a package.json that cannot be read is compared as it is", () => {
    const k = packagesKey(base, lock);
    expect(packagesKey({ ...base, "packages/ui/package.json": pj({ dependencies: { clsx: "2.0.0" } }) }, lock)).not.toBe(k);
    expect(packagesKey({ "package.json": "{ not json" }, lock)).not.toBe(packagesKey({ "package.json": "{ not json either" }, lock));
    expect(packagesKey({ "package.json": "{ not json" }, lock)).toBe(packagesKey({ "package.json": "{ not json" }, lock));
  });
});

// A pretend project: versions after task `bad` and later fail. States: 0 is before the first task, k is after task k.
function world(n: number, badFrom: number, o: { skip?: Set<number>; gaps?: Set<number>; badBefore?: Set<number>; unusable?: Set<string> } = {}) {
  const points: TaskPoint[] = Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `task ${i + 1}`, at: `2026-10-1${i}T12:00:00Z`, before: `b${i + 1}`, after: `a${i + 1}` }));
  const probed: string[] = [];
  const stateOf = (cp: string) => (cp.startsWith("a") ? Number(cp.slice(1)) : Number(cp.slice(1)) - 1);
  const probe = async (cp: string): Promise<Verdict> => {
    probed.push(cp);
    if (cp.startsWith("b") && o.badBefore?.has(Number(cp.slice(1)))) return "bad";
    const s = stateOf(cp);
    if (o.skip?.has(s) && cp.startsWith("a")) return "skip";
    return s >= badFrom ? "bad" : "good";
  };
  // gaps: the person changed files between task k and task k+1.
  const differs = async (a: string, b: string) => (b === "now" ? true : o.gaps?.has(Number(a.slice(1))) ?? false);
  const usable = o.unusable ? async (cp: string) => !o.unusable!.has(cp) : undefined;
  return { points, probed, run: (max = MAX_RUNS - 1) => findFirstBad({ points, nowId: "now", probe, differs, maxProbes: max, ...(usable ? { usable } : {}) }) };
}

describe("the search", () => {
  test("it names the first task after which the check fails", async () => {
    for (const bad of [1, 2, 5, 9, 14]) {
      const w = world(14, bad);
      const r = await w.run();
      expect(r.outcome).toMatchObject({ kind: "found", task: { label: `task ${bad}` } });
      expect(r.probes).toBeLessThanOrEqual(4);
    }
  });
  test("never more than the cap of runs, the check of the project as it is now included", async () => {
    expect(MAX_RUNS).toBe(6);
    expect(WINDOW).toBeLessThanOrEqual(14);
    for (let bad = 0; bad <= 15; bad++) {
      const w = world(WINDOW, bad, { gaps: new Set([3, 7]) });
      const r = await w.run();
      expect(r.probes + 1).toBeLessThanOrEqual(MAX_RUNS);
      expect(w.probed.length).toBe(r.probes);
    }
  });
  test("already failing before the oldest task, or only since the last task", async () => {
    expect((await world(5, 0).run()).outcome).toMatchObject({ kind: "already_failing", oldest: { label: "task 1" } });
    expect((await world(5, 6).run()).outcome).toMatchObject({ kind: "after_last_task", last: { label: "task 5" } });
  });
  test("when the person changed files between two tasks, the version before the task decides", async () => {
    // Their own change between task 3 and task 4 broke it: the version before task 4 already fails.
    const own = world(6, 4, { gaps: new Set([3]), badBefore: new Set([4]) });
    expect((await own.run()).outcome).toMatchObject({ kind: "outside_change", earlier: { label: "task 3" }, later: { label: "task 4" } });
    expect(own.probed).toContain("b4");
    // Their change was harmless: task 4 itself broke it.
    const task = world(6, 4, { gaps: new Set([3]) });
    expect((await task.run()).outcome).toMatchObject({ kind: "found", task: { label: "task 4" } });
  });
  test("no extra run when nothing changed between the two tasks", async () => {
    const w = world(6, 4);
    await w.run();
    expect(w.probed.some((p) => p.startsWith("b") && p !== "b1")).toBe(false);
  });
  test("versions that cannot be checked that far are stepped round, and an unclear answer is said as unclear", async () => {
    const w = world(8, 5, { skip: new Set([4]) });
    const r = await w.run();
    expect(r.outcome.kind === "found" || r.outcome.kind === "unsure").toBe(true);
    if (r.outcome.kind === "found") expect(r.outcome.task.label).toBe("task 5");
    // Everything in the middle skipped: no task is blamed.
    const all = world(4, 3, { skip: new Set([0, 1, 2, 3, 4]) });
    const u = await all.run();
    expect(u.outcome.kind).toBe("unsure");
  });
  test("running out of runs is unsure, never a guess", async () => {
    const r = await world(14, 9).run(2);
    expect(r.outcome.kind).toBe("unsure");
    expect(r.probes).toBe(2);
  });
  test("a stop ends the search at once", async () => {
    const points = [1, 2, 3].map((i) => ({ id: i, label: `t${i}`, at: "x", before: `b${i}`, after: `a${i}` }));
    let n = 0;
    const r = await findFirstBad({ points, nowId: "now", maxProbes: 5, differs: async () => false, probe: async () => (++n === 2 ? "cancelled" : "good") });
    expect(r.outcome.kind).toBe("cancelled");
    expect(n).toBe(2);
  });
  test("versions that need other packages than today's are stepped round without spending a run", async () => {
    // Task 4 changed the packages: the versions before it cannot use the ones installed now.
    const w = world(6, 5, { unusable: new Set(["b1", "a1", "a2", "a3"]) });
    const r = await w.run();
    expect(r.outcome).toMatchObject({ kind: "found", task: { label: "task 5" } });
    expect(w.probed.some((p) => ["b1", "a1", "a2", "a3"].includes(p))).toBe(false);
    expect(r.probes).toBe(w.probed.length);
    // Only such versions left where the answer is: unsure, never a task blamed.
    const u = world(6, 2, { unusable: new Set(["b1", "a1", "a2", "a3"]) });
    expect((await u.run()).outcome.kind).toBe("unsure");
    expect(u.probed.some((p) => ["b1", "a1", "a2", "a3"].includes(p))).toBe(false);
    // The version before a task, checked when the person changed files just before it, is no exception.
    const g = world(6, 4, { gaps: new Set([3]), unusable: new Set(["b4"]) });
    expect((await g.run()).outcome.kind).toBe("unsure");
    expect(g.probed).not.toContain("b4");
  });
  test("the same files giving a different answer (a flaky check) is unsure", async () => {
    const points = [1, 2].map((i) => ({ id: i, label: `t${i}`, at: "x", before: `b${i}`, after: `a${i}` }));
    const r = await findFirstBad({ points, nowId: "now", maxProbes: 5, differs: async () => false, probe: async () => "good" });
    expect(r.outcome.kind).toBe("unsure");
  });
});
