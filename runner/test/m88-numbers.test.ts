// M88 (a), Your numbers: two more counts for the week, from real rows only. jobs: tasks Squibby ran for the person (never a
// saved copy or an ask). days: the days with any row. They ride on the M79 week.summary answer, which is asked for on a
// press only. Temporary folders only; no model.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../src/agent.ts";
import { ScriptedEngine } from "../src/engine.ts";
import { TaskLog } from "../src/tasklog.ts";
import { parseEvent } from "../../protocol/index.ts";

const made: string[] = [];
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });
const tmp = () => { const d = realpathSync(mkdtempSync(join(tmpdir(), "companion-test-m88n-"))); made.push(d); return d; };
const NOW = new Date(2026, 10, 14, 12, 0, 0);
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString();

function rig() {
  const d = tmp(), project = join(d, "shop");
  mkdirSync(project);
  const log = new TaskLog(join(d, "tasks.db"));
  const task = (at: string, mode = "drive") => { const id = log.start({ project, agent: "a", mode, label: "Fix the form", startedAt: at, checkpoint: `cp_${Math.random().toString(16).slice(2)}` }); log.finish(id, "done", 0, at); };
  const review = (at: string) => log.addReview({ project, batch: `rv_${Math.random()}`, at, files: ["a.ts"], count: 1, rating: "safe", touches: [], checks: "passed", summary: "x", kinds: [] });
  return { d, project, log, task, review };
}

describe("jobs and days, from the task log", () => {
  test("jobs count tasks only; days count every day with any row; older rows are left out", () => {
    const { project, log, task, review } = rig();
    task(ago(0, 1)); task(ago(0, 2), "explain"); task(ago(2));
    task(ago(9));   // too old
    log.saved({ project, label: "Before Claude ran: rm -rf dist", checkpoint: "cp_0000000000000001", at: ago(3) });
    log.asked({ project, command: "supabase db reset", reason: "live", at: ago(4), by: "tool" });
    review(ago(5)); review(ago(5, 1));
    review(ago(20));   // too old
    expect(log.usage(project, NOW)).toEqual({ jobs: 3, days: 5 });
  });
  test("an empty week is zero, and another project's rows never count", () => {
    const { d, project, log } = rig();
    expect(log.usage(project, NOW)).toEqual({ jobs: 0, days: 0 });
    const other = join(d, "other"); mkdirSync(other);
    const id = log.start({ project: other, agent: "a", mode: "drive", label: "x", startedAt: ago(1) }); log.finish(id, "done", 0, ago(1));
    expect(log.usage(project, NOW)).toEqual({ jobs: 0, days: 0 });
  });
  test("week.show carries them, and the event keeps to the protocol", async () => {
    const { d, project, log, task } = rig();
    task(ago(1)); task(ago(1, 1));
    const events: Record<string, any>[] = [];
    const runner = new AgentRunner({ shadowRoot: join(d, "shadow"), engine: new ScriptedEngine([]), log, memoryDir: d, emit: (e: unknown) => events.push(e as never), now: () => NOW } as never);
    await runner.handle({ v: 1, id: "w", type: "week.show", project } as never);
    const e = events.find((x) => x.type === "week.summary")!;
    expect(e.week.jobs).toBe(2);
    expect(e.week.days).toBe(1);
    // Counts only: nothing from the task's words rides along.
    expect(JSON.stringify(e)).not.toContain("Fix the form");
    const p = parseEvent(JSON.stringify({ v: 1, id: "x", ...e }));
    expect(p.ok, p.ok ? "" : p.error).toBe(true);
  });
  test("the protocol refuses a jobs or days count that is not a count, and more than 8 days", () => {
    const line = readFileSync(new URL("../../protocol/fixtures/events.jsonl", import.meta.url), "utf8").split("\n").find((l) => l.includes('"id":"m79e2"'))!;
    const ok = JSON.parse(line);
    expect(ok.week).toMatchObject({ jobs: 4, days: 5 });
    expect(parseEvent(line).ok).toBe(true);
    for (const [k, v] of [["jobs", -1], ["jobs", 1.5], ["days", 9], ["days", "3"]] as const) {
      const bad = JSON.parse(line); bad.week[k] = v;
      expect(parseEvent(JSON.stringify(bad)).ok, `${k}=${v}`).toBe(false);
    }
    // An older engine's answer (no jobs or days) still reads.
    const old = JSON.parse(line); delete old.week.jobs; delete old.week.days;
    expect(parseEvent(JSON.stringify(old)).ok).toBe(true);
  });
});
