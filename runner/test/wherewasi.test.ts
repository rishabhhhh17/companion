// Where was I (F21): plain lines from the task history, the project's watches and what waits. Written by code, so every
// sentence here is exact. Nothing is sent anywhere, and a task run off the record is never named.
import { describe, expect, test } from "bun:test";
import type { TaskRow } from "../src/tasklog.ts";
import { clock, watchName, whereWasI, type WatchLite, type WhereInput } from "../src/wherewasi.ts";

const NOW = new Date(2026, 9, 22, 15, 0, 0).getTime();
const at = (h: number, m = 0, d = 22) => new Date(2026, 9, d, h, m, 0).toISOString();
let id = 0;
const row = (o: Partial<TaskRow> = {}): TaskRow => ({ id: ++id, project: "/p", agent: "builder-1", mode: "drive", label: "Add a contact form", status: "done", usd: 0.1, startedAt: at(9), endedAt: at(9, 5), checkpoint: "cp", changed: 2, proof: "passed", ...o });
const input = (o: Partial<WhereInput> = {}): WhereInput => ({ rows: [], since: null, now: NOW, watches: [], pendingApprovals: 0, waitingPlans: 0, pausedPlans: 0, question: null, ...o });
const watch = (o: Partial<WatchLite> = {}): WatchLite => ({ id: "w_1", kind: "site_up", target: "https://shop.example.com/", state: "failing", since: at(10, 2), reason: "The site answered with an error on its side (503).", history: [], ...o });

describe("what you were doing", () => {
  test("the last task and how it ended", () => {
    const r = whereWasI(input({ rows: [row({ id: 1 }), row({ id: 2, label: "Fix the cart", status: "done", proof: "passed" })] }));
    expect(r.lines[0]).toBe("You were working on: Fix the cart. It finished and its checks passed.");
    expect(r.lines[1]).toBe("Nothing is unfinished.");
    expect(r.next).toEqual({ action: "none" });
  });
  test("a task that did not pass its checks is unfinished, and the next step is to point at the problem", () => {
    const r = whereWasI(input({ rows: [row({ status: "not_done", proof: "failed", label: "Add login" })] }));
    expect(r.lines).toEqual(["You were working on: Add login. It did not pass its checks.", "Not finished: The last task did not pass its checks."]);
    expect(r.next).toEqual({ action: "findProblem" });
  });
  test("stopped, still running, asked something", () => {
    expect(whereWasI(input({ rows: [row({ status: "interrupted", proof: null })] })).lines[0]).toMatch(/You stopped it\.$/);
    expect(whereWasI(input({ rows: [row({ status: "running", proof: null, endedAt: null })] })).lines[0]).toMatch(/still running\.$/);
    expect(whereWasI(input({ rows: [row({ status: "needs_you", proof: null })] })).lines[0]).toMatch(/asked you something\.$/);
    expect(whereWasI(input({ rows: [row({ status: "error_max_budget_usd", proof: null })] })).lines[0]).toMatch(/stopped before it was done\.$/);
  });
  test("no tasks yet", () => {
    expect(whereWasI(input()).lines).toEqual(["You have not run a task in this project yet.", "Nothing is unfinished."]);
  });
  test("a task run off the record is never named, and a project with only those says so without detail", () => {
    const off = row({ label: "Off the record task", status: "not_done", proof: "failed" });
    const r = whereWasI(input({ rows: [row({ id: 1, label: "Add a footer" }), { ...off, id: 2 }] }));
    expect(r.lines[0]).toBe("You were working on: Add a footer. It finished and its checks passed.");
    expect(r.lines.join(" ")).not.toMatch(/Off the record task/);
    expect(r.next).toEqual({ action: "none" });
    const only = whereWasI(input({ rows: [off] }));
    expect(only.lines[0]).toBe("Your last tasks here were off the record, so nothing is shown about them.");
  });
  test("a question from an off the record task is waiting, but its words are not shown", () => {
    expect(whereWasI(input({ rows: [row()], question: { text: null } })).lines).toContain("Not finished: A task is waiting for your answer.");
    const r = whereWasI(input({ rows: [row()], question: { text: "Which colour should the button be? token=abcdef123456" } }));
    const line = r.lines.find((l) => l.includes("waiting for your answer"))!;
    expect(line).toContain("Which colour should the button be?");
    expect(line).not.toContain("abcdef123456");
    expect(r.next).toEqual({ action: "open" });
  });
});

describe("what is unfinished", () => {
  test("a failing watch first, with since when and why, and the next step is Fix it for that watch", () => {
    const r = whereWasI(input({ rows: [row()], watches: [watch(), watch({ id: "w_2", kind: "ci_status", state: "ok" })] }));
    expect(r.lines[1]).toBe("Not finished: Your site (shop.example.com) has been failing since 10:02: The site answered with an error on its side (503).");
    expect(r.next).toEqual({ action: "fixWatch", watch: "w_1" });
  });
  test("a failing watch outranks a failed task in the suggested step", () => {
    const r = whereWasI(input({ rows: [row({ status: "not_done", proof: "failed" })], watches: [watch({ kind: "deploy_status", target: undefined })] }));
    expect(r.lines.filter((l) => l.startsWith("Not finished:"))).toHaveLength(2);
    expect(r.next).toEqual({ action: "fixWatch", watch: "w_1" });
  });
  test("plans waiting, a paused plan and an approval wait for you", () => {
    const r = whereWasI(input({ rows: [row()], waitingPlans: 2, pausedPlans: 1, pendingApprovals: 3 }));
    expect(r.lines).toContain("Not finished: 2 plans are waiting for your approval.");
    expect(r.lines).toContain("Not finished: A plan is paused, waiting for you to carry on.");
    expect(r.lines).toContain("Not finished: 3 tasks need your yes or no.");
    expect(r.next).toEqual({ action: "open" });
  });
  test("a watch that is fine, paused or cannot be read is not unfinished", () => {
    for (const state of ["ok", "paused", "unknown"]) expect(whereWasI(input({ rows: [row()], watches: [watch({ state })] })).lines).toContain("Nothing is unfinished.");
  });
  test("the reason is cleaned of secrets", () => {
    const r = whereWasI(input({ rows: [row()], watches: [watch({ reason: "It said password=hunter2hunter2 and more" })] }));
    expect(r.lines.join("\n")).not.toContain("hunter2hunter2");
  });
});

describe("what changed since", () => {
  test("tasks that ended while you were away, and watches that moved", () => {
    const rows = [row({ id: 1, startedAt: at(8) }), row({ id: 2, label: "Fix the cart", startedAt: at(11), status: "not_done", proof: "failed" })];
    const w = watch({ history: [{ at: at(7), state: "ok" }, { at: at(10, 2), state: "failing" }, { at: at(10, 40), state: "ok" }, { at: at(12, 5), state: "failing" }] });
    const r = whereWasI(input({ rows, since: at(9, 30), watches: [w] }));
    expect(r.lines).toContain("Since then: 1 task ended, 1 not done");
    expect(r.lines).toContain("Since then: your site (shop.example.com) was fine again at 10:40, then started failing at 12:05.");   // the last two moves
  });
  test("with no time given, it is since the last task began; nothing happened, nothing is said", () => {
    const only = whereWasI(input({ rows: [row()], watches: [watch({ state: "ok", history: [{ at: at(8), state: "ok" }] })] }));
    expect(only.lines.filter((l) => l.startsWith("Since then"))).toEqual([]);
  });
  test("a day other than today is named", () => {
    expect(clock(new Date(2026, 9, 22, 10, 2).getTime(), NOW)).toBe("10:02");
    expect(clock(new Date(2026, 9, 20, 9, 5).getTime(), NOW)).toMatch(/^20 Oct at 09:05$/);
  });
  test("the names of the kinds", () => {
    expect(watchName({ kind: "deploy_status" })).toBe("Your latest Vercel deploy");
    expect(watchName({ kind: "ci_status" })).toBe("Your GitHub checks");
    expect(watchName({ kind: "project_checks" })).toBe("Your project's own checks");
    expect(watchName({ kind: "site_up" })).toBe("Your site");
  });
});
