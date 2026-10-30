// M45 (Tell the truth): the task history knows which tasks an Undo took back, so What I did never calls an undone task
// proven, and Bring the fix back puts the mark away again. Only the log's own rows change: nothing here touches git.
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskLog } from "../src/tasklog.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-tasklog-"))); made.push(d); return d; };

const AT = "2026-10-30T10:00:00.000Z";
function three(log: TaskLog, project = "/p") {
  for (const [i, cp] of ["cp_0001", "cp_0003", "cp_0005"].entries()) {
    const id = log.start({ project, agent: "b", mode: "drive", label: `Task ${i + 1}`, startedAt: AT, checkpoint: cp });
    log.finish(id, "done", 0.01, AT, { checkpoint: cp, changed: 1, proof: "passed" });
  }
}
// Undone and not brought back: what What I did files under Undone.
const undone = (log: TaskLog, project = "/p") => Object.fromEntries(log.list(project).map((r) => [r.label, !!r.undone && !r.back]));
const back = (log: TaskLog, project = "/p") => Object.fromEntries(log.list(project).map((r) => [r.label, !!r.back]));

describe("undone tasks in the task history", () => {
  test("list carries undone, false for a task nobody undid", () => {
    const log = new TaskLog(":memory:");
    three(log);
    expect(log.list("/p").map((r) => r.undone)).toEqual([false, false, false]);
    expect(log.list("/p").map((r) => r.back)).toEqual([false, false, false]);
  });
  test("undo marks rows undone: restoring T.before marks T and later rows", () => {
    const log = new TaskLog(":memory:");
    three(log);
    log.markUndone("/p", 3, "cp_0007");
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": true, "Task 3": true });
  });
  test("only that project's rows, and a row already undone keeps the Undo that took it back", () => {
    const log = new TaskLog(":memory:");
    three(log); three(log, "/other");
    log.markUndone("/p", 5, "cp_0007");
    log.markUndone("/p", 1, "cp_0009");
    expect(undone(log)).toEqual({ "Task 1": true, "Task 2": true, "Task 3": true });
    expect(undone(log, "/other")).toEqual({ "Task 1": false, "Task 2": false, "Task 3": false });
    // Bringing back one Undo's safety copy clears only the rows that Undo marked.
    log.bringBack("/p", "cp_0009");
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": false, "Task 3": true });
    log.bringBack("/p", "cp_0007");
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": false, "Task 3": false });
  });
  test("bring back clears them, and the rows say they are back", () => {
    const log = new TaskLog(":memory:");
    three(log);
    log.markUndone("/p", 3, "cp_0007");
    log.bringBack("/p", "cp_0007");
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": false, "Task 3": false });
    // The same facts as the receipt after Bring back: undone and back, so the row says "The fix is back", not proven.
    expect(log.list("/p").map((r) => [r.label, r.undone, r.back])).toEqual([["Task 3", true, true], ["Task 2", true, true], ["Task 1", false, false]]);
  });
  test("an Undo after a bring back marks the row undone again", () => {
    const log = new TaskLog(":memory:");
    three(log);
    log.markUndone("/p", 5, "cp_0007");
    log.bringBack("/p", "cp_0007");
    log.markUndone("/p", 5, "cp_0011");
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": false, "Task 3": true });
    expect(back(log)).toEqual({ "Task 1": false, "Task 2": false, "Task 3": false });
  });
  test("a task that changed nothing is never marked, one cut short is", () => {
    const log = new TaskLog(":memory:");
    const asked = log.start({ project: "/p", agent: "b", mode: "drive", label: "Question", startedAt: AT, checkpoint: "cp_0002" });
    log.finish(asked, "done", 0, AT, { checkpoint: "cp_0002", changed: 0, proof: "skipped" });
    log.start({ project: "/p", agent: "b", mode: "drive", label: "Cut short", startedAt: AT, checkpoint: "cp_0003" });
    log.markUndone("/p", 1, "cp_0007");
    expect(undone(log)).toEqual({ "Question": false, "Cut short": true });
  });
  test("bring back of an id that is not a safety copy changes nothing", () => {
    const log = new TaskLog(":memory:");
    three(log);
    log.markUndone("/p", 3, "cp_0007");
    log.bringBack("/p", "cp_0003");
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": true, "Task 3": true });
  });
  test("a single task undo can mark just that task", () => {
    const log = new TaskLog(":memory:");
    three(log);
    log.markUndone("/p", 3, "cp_0007", 3);
    expect(undone(log)).toEqual({ "Task 1": false, "Task 2": true, "Task 3": false });
  });
  test("a task with no undo point is never marked", () => {
    const log = new TaskLog(":memory:");
    const id = log.start({ project: "/p", agent: "b", mode: "drive", label: "Asked only", startedAt: AT });
    log.finish(id, "done", 0, AT);
    log.markUndone("/p", 0, "cp_0007");
    expect(log.list("/p")[0].undone).toBe(false);
  });
  test("old log files get the column, and keep their tasks", () => {
    const path = join(tmp(), "tasks.db");
    const old = new Database(path);
    old.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL,
      label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT, checkpoint TEXT, changed INTEGER, proof TEXT)`);
    old.run("INSERT INTO tasks (project, agent, mode, label, status, started_at, checkpoint, changed, proof) VALUES ('/p', 'b', 'drive', 'Old task', 'done', ?, 'cp_0002', 1, 'passed')", [AT]);
    old.close();
    const log = new TaskLog(path);
    expect(log.list("/p")).toMatchObject([{ label: "Old task", undone: false }]);
    log.markUndone("/p", 2, "cp_0004");
    expect(new TaskLog(path).list("/p")[0].undone).toBe(true);
  });
});
