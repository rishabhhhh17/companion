// M72 (the walkthrough, item 12): a failed check says which check failed. The task log keeps the failed check's rung (never
// its output) with the task, tasks.list carries it, and an older log file gets the column and keeps its tasks.
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskLog } from "../src/tasklog.ts";

const AT = "2026-11-06T10:00:00.000Z";

describe("the failed check is kept with its task", () => {
  test("a failed task keeps the rung that failed; a passed one keeps none", () => {
    const log = new TaskLog(":memory:");
    const a = log.start({ project: "/p", agent: "a", mode: "task", label: "Fix the Join button", startedAt: AT, checkpoint: "cp_0001" });
    log.finish(a, "not_done", 0, AT, { checkpoint: "cp_0001", changed: 1, proof: "failed", failedCheck: "tests" });
    const b = log.start({ project: "/p", agent: "b", mode: "task", label: "Fix the page", startedAt: AT, checkpoint: "cp_0002" });
    log.finish(b, "done", 0, AT, { checkpoint: "cp_0002", changed: 1, proof: "passed", failedCheck: "tests" });
    const rows = log.list("/p");
    expect(rows.find((r) => r.id === a)?.failedCheck).toBe("tests");
    expect(rows.find((r) => r.id === b)?.failedCheck).toBeUndefined();
  });
  test("only a known rung is kept, never free text", () => {
    const log = new TaskLog(":memory:");
    const a = log.start({ project: "/p", agent: "a", mode: "task", label: "x", startedAt: AT });
    log.finish(a, "not_done", 0, AT, { checkpoint: "cp_0001", changed: 0, proof: "failed", failedCheck: "sk_live_secret words" });
    expect(log.list("/p")[0].failedCheck).toBeUndefined();
  });
  test("an older log file gets the column and keeps its tasks", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "companion-m72-")));
    const path = join(dir, "tasks.db");
    const old = new Database(path);
    old.run("CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, agent TEXT NOT NULL, mode TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL, usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT)");
    old.run("INSERT INTO tasks (project, agent, mode, label, status, started_at) VALUES ('/p', 'a', 'task', 'Old one', 'done', ?)", [AT]);
    old.close();
    const log = new TaskLog(path);
    expect(log.list("/p").map((r) => r.label)).toEqual(["Old one"]);
    expect(log.list("/p")[0].failedCheck).toBeUndefined();
  });
  test("tasks.list sends it, and the engine records the rung of the check that failed", () => {
    const src = readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8");
    expect(src).toContain("...(t.failedCheck ? { failedCheck: t.failedCheck } : {})");
    expect(src).toContain("failedCheck = fl.rung");
    expect(src).toContain("...(proof === \"failed\" && failedCheck ? { failedCheck } : {})");
  });
});
