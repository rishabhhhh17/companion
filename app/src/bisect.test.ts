// Which task broke it, as the card sees it: the button shows only when a check failed and there are earlier tasks to
// compare, the search reports its progress, the answer is said in plain words, and undoing just that task asks first.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { findBreakingTask, undoOneTask } from "./commands.ts";
import { bisectLines, canBisect, initial, reduce, whenWords, type HistoryItem, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const task = (id: number, changed: number | null = 1): HistoryItem => ({ id, label: `task ${id}`, status: "done", usd: 0.1, startedAt: "2026-10-14T12:00:00Z", endedAt: null, checkpoint: `cp_000${id}`, changed, proof: "passed" });
const found = { type: "problem.found", project: "p", agent: "builder-1", verdict: "failed", label: "Running the tests", detail: "1 failed" };
const result = (o: Record<string, unknown>) => ev({ type: "bisect.result", project: "p", agent: "builder-1", runs: 4, maxRuns: 6, ...o });
const FOUND = { outcome: "found", step: { rung: "tests", label: "Running the tests" }, task: { label: "Add a contact form", at: "2026-10-14T12:30:00.000Z", checkpoint: "cp_0005" }, changed: [{ file: "src/Contact.tsx", kind: "added" }, { file: "src/App.tsx", kind: "modified" }], changedCount: 2, undo: "safe", diff: "--- src/App.tsx\n+x" };

describe("the commands", () => {
  test("they are valid protocol; undoing one task always carries the yes", () => {
    expect(parseCommand(serialize(findBreakingTask("/Users/me/site"))).ok).toBe(true);
    expect(findBreakingTask("/p")).toMatchObject({ type: "bisect.start", project: "/p" });
    const u = undoOneTask("/p", "cp_0005");
    expect(parseCommand(serialize(u)).ok).toBe(true);
    expect(u).toMatchObject({ type: "bisect.undo", project: "/p", checkpoint: "cp_0005", confirm: true });
  });
});

describe("when the button shows", () => {
  const failed = (history: HistoryItem[]) => run([ev({ type: "tasks.list", project: "p", tasks: history }), ev({ type: "ui.findProblem" }), ev(found)]);
  test("a failed check and at least two earlier tasks that changed something", () => {
    expect(canBisect(failed([task(1), task(2)]))).toBe(true);
    expect(canBisect(failed([task(1)]))).toBe(false);
    expect(canBisect(failed([task(1), task(2, 0)]))).toBe(false);
    expect(canBisect(failed([task(1), { ...task(2), checkpoint: null }]))).toBe(false);
  });
  test("not when nothing failed, and not while a search runs", () => {
    const ok = run([ev({ type: "tasks.list", project: "p", tasks: [task(1), task(2)] }), ev({ type: "ui.findProblem" }), ev({ ...found, verdict: "passed" })]);
    expect(canBisect(ok)).toBe(false);
    expect(canBisect(reduce(failed([task(1), task(2)]), { type: "ui.bisectAsked" }))).toBe(false);
  });
  test("a task whose checks failed counts too, once it is no longer fixing", () => {
    const m = run([ev({ type: "tasks.list", project: "p", tasks: [task(1), task(2)] }), ev({ type: "checkpoint.created", agent: "builder-1", checkpoint: "cp_9", label: "Before: x", files: 1, skipped: [] }),
      ev({ type: "proof.result", agent: "builder-1", verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "x" }], tries: 3 }), ev({ type: "agent.state", agent: "builder-1", state: "error" })]);
    expect(canBisect(m)).toBe(true);
    expect(canBisect(reduce(m, { type: "agent.state", agent: "builder-1", state: "working" }))).toBe(false);
  });
});

describe("the search and its answer", () => {
  test("progress, then the task, its date and what it changed", () => {
    let m = run([ev({ type: "ui.bisectAsked" }), ev({ type: "bisect.progress", project: "p", agent: "builder-1", run: 2, maxRuns: 6, what: "after", label: "task 3" })]);
    expect(m.bisect).toMatchObject({ stage: "running", run: 2, maxRuns: 6, label: "task 3" });
    expect(bisectLines(m)[0]).toBe('Checking a private copy of your project as it was after "task 3" (check 2 of at most 6). Your project is not touched.');
    m = reduce(m, result(FOUND) as never);
    expect(m.bisect).toMatchObject({ stage: "done", outcome: "found", undo: "safe", task: { label: "Add a contact form", checkpoint: "cp_0005" } });
    expect(bisectLines(m)[0]).toBe(`It started failing after the task "Add a contact form" on ${whenWords("2026-10-14T12:30:00.000Z")}.`);
  });
  test("a date reads as a day and a time", () => expect(whenWords("2026-10-14T12:30:00.000Z")).toMatch(/1[45] October/));
  test("every answer is a plain sentence", () => {
    const outcomes: Record<string, unknown>[] = [
      { outcome: "not_failing" }, { outcome: "already_failing", earlier: { label: "a", at: "2026-10-14T12:00:00Z" } }, { outcome: "after_last_task", earlier: { label: "b", at: "2026-10-14T12:00:00Z" } },
      { outcome: "outside_change", earlier: { label: "a", at: "x" }, later: { label: "b", at: "x" } }, { outcome: "unsure", earlier: { label: "a", at: "x" }, later: { label: "b", at: "x" } }, { outcome: "unsure" },
      { outcome: "too_few" }, { outcome: "cannot_check", detail: "This project's packages are not installed, so it cannot be checked yet." }, { outcome: "busy", detail: "Companion is already working on this project." }, { outcome: "failed" },
      { ...FOUND, undo: "show_only", why: "Later work changed the same file (src/App.tsx), so undoing this task on its own would lose that work." },
    ];
    for (const o of outcomes) {
      const lines = bisectLines(run([ev({ type: "ui.bisectAsked" }), result(o)]));
      expect(lines.length, JSON.stringify(o)).toBeGreaterThan(0);
      for (const l of lines) { expect(l, JSON.stringify(o)).toMatch(/[.?]$/); expect(l).not.toMatch(/—|undefined|null/); }
    }
  });
  test("an unclear answer says why when the engine knows (earlier versions needed other packages)", () => {
    const why = "Some earlier versions needed other packages than the ones installed now, so they could not be checked.";
    const lines = bisectLines(run([ev({ type: "ui.bisectAsked" }), result({ outcome: "unsure", earlier: { label: "a", at: "x" }, later: { label: "b", at: "x" }, detail: why })]));
    expect(lines).toContain(why);
  });
  test("when it can only be shown, the card says why", () => {
    const lines = bisectLines(run([ev({ type: "ui.bisectAsked" }), result({ ...FOUND, undo: "show_only", why: "Later work changed the same file (src/App.tsx), so undoing this task on its own would lose that work." })]));
    expect(lines.join(" ")).toContain("src/App.tsx");
  });
  test("closing the answer lets the character rest again, so the other buttons come back", () => {
    // The engine leaves the character waiting on the person while the answer is on screen.
    const m = run([ev({ type: "ui.bisectAsked" }), ev({ type: "agent.state", agent: "builder-1", state: "checking" }), result(FOUND), ev({ type: "agent.state", agent: "builder-1", state: "needsYou" })]);
    expect(m.character).toBe("needsYou");
    const closed = reduce(m, { type: "ui.bisectClosed" });
    expect(closed.bisect).toBeNull();
    expect(closed.character).toBe("idle");
    // A task that started meanwhile on another agent is not touched.
    const other = reduce(reduce(m, ev({ type: "agent.state", agent: "builder-2", state: "working" }) as never), { type: "ui.bisectClosed" });
    expect(other.agents["builder-2"]).toBe("working");
    // Nothing but the search's own waiting is reset.
    const busy = run([ev({ type: "ui.bisectAsked" }), result(FOUND), ev({ type: "agent.state", agent: "builder-1", state: "working" }), ev({ type: "ui.bisectClosed" })]);
    expect(busy.character).toBe("working");
  });
  test("a stopped search, Stop everything, a restart or another folder clears it; a late answer is ignored", () => {
    expect(run([ev({ type: "ui.bisectAsked" }), result({ outcome: "cancelled" })]).bisect).toBeNull();
    for (const end of ["app.stop_everything", "app.runner_restarted", "ui.projectChanged", "ui.bisectClosed"]) expect(run([ev({ type: "ui.bisectAsked" }), ev({ type: end })]).bisect, end).toBeNull();
    expect(run([result(FOUND)]).bisect).toBeNull();
    expect(run([ev({ type: "bisect.progress", project: "p", agent: "a", run: 1, maxRuns: 6, what: "now" })]).bisect).toBeNull();
  });
});

describe("undoing just that task", () => {
  const done = () => run([ev({ type: "ui.bisectAsked" }), result(FOUND)]);
  test("asks first, then waits for the engine, and says what it did", () => {
    let m = reduce(done(), { type: "ui.bisectUndoAsked" });
    expect(m.bisect?.undoStage).toBe("confirm");
    m = reduce(m, { type: "ui.bisectUndoSent" });
    expect(m.bisect?.undoStage).toBe("working");
    m = reduce(m, ev({ type: "bisect.undone", project: "p", checkpoint: "cp_0005", ok: true, reverted: ["src/App.tsx", "src/Contact.tsx"], safety: "cp_0009" }) as never);
    expect(m.bisect).toMatchObject({ undoStage: "done", reverted: 2 });
    expect(bisectLines(m).join(" ")).toMatch(/later/i);
  });
  test("a refusal says why; an answer about another task is ignored; keeping it closes the question", () => {
    const working = reduce(reduce(done(), { type: "ui.bisectUndoAsked" }), { type: "ui.bisectUndoSent" });
    expect(reduce(working, ev({ type: "bisect.undone", project: "p", checkpoint: "cp_0001", ok: true, reverted: [] }) as never).bisect?.undoStage).toBe("working");
    const no = reduce(working, ev({ type: "bisect.undone", project: "p", checkpoint: "cp_0005", ok: false, reverted: [], reason: "Later work changed the same file (src/App.tsx), so undoing this task on its own would lose that work. Nothing was changed." }) as never);
    expect(no.bisect).toMatchObject({ undoStage: "failed" });
    expect(no.bisect?.note).toContain("Nothing was changed");
    expect(reduce(reduce(done(), { type: "ui.bisectUndoAsked" }), { type: "ui.bisectUndoCancelled" }).bisect?.undoStage).toBeUndefined();
  });
});
