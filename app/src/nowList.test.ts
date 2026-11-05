// M71: Now's one list (homeRest.ts nowRows): the last fix with how its check went, then what happened after it, at most
// three rows, each with its meaning's colour; a project with no fixes gets the practice row and says what will appear.
import { describe, expect, test } from "bun:test";
import { lastFix, nowRows, NOW_ROWS_MAX, sinceRows } from "./homeRest.ts";
import { MEANING_COLOUR } from "./meaning.ts";
import type { HistoryItem } from "./model.ts";
import { S } from "./strings.ts";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const task = (o: Partial<HistoryItem> & { id: number }): HistoryItem => ({ label: "Fix the sign up button", status: "done", usd: 0, startedAt: ago(3), endedAt: ago(2), checkpoint: "cp_1", changed: 1, proof: "passed", ...o } as HistoryItem);

describe("Now's list", () => {
  test("a proven last fix is one green row: its outcome, its check and files, and when", () => {
    const fix = lastFix([task({ id: 1 })], NOW);
    const rows = nowRows({ fix, since: [], practice: false, undo: false, now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ meaning: "proven", icon: "tick", title: "Sign up button fixed", line: `${S.homeNow.tick.passed} · 1 file changed`, fact: "2 hours ago", act: "open", action: null });
    expect(MEANING_COLOUR[rows[0].meaning]).toBe("green");
  });
  test("a failed check is red; with Undo on the right the time moves into the line", () => {
    const fix = lastFix([task({ id: 2, proof: "failed" })], NOW);
    const [row] = nowRows({ fix, since: [], practice: false, undo: true, now: NOW });
    expect(row.meaning).toBe("problem");
    expect(MEANING_COLOUR[row.meaning]).toBe("red");
    expect(row.action).toBe("undo");
    expect(row.fact).toBe("");
    expect(row.line).toContain("2 hours ago");
  });
  test("files changed since are orange and never say who changed them; at most three rows", () => {
    const history = [task({ id: 1 }), task({ id: 3, status: "interrupted", startedAt: ago(1), endedAt: ago(1), label: "Make the cart faster" }), task({ id: 4, status: "interrupted", startedAt: ago(0.5), endedAt: ago(0.5), label: "Add a footer" })];
    const fix = lastFix(history, NOW);
    const reviews = [{ id: 9, at: ago(1.5), count: 3, files: ["a.ts"], rating: "clean", touches: [], checks: "passed", did: "nothing", summary: "" }] as never;
    const since = sinceRows({ history, reviews, fix, now: NOW });
    const rows = nowRows({ fix, since, practice: false, undo: false, now: NOW });
    expect(rows.length).toBe(NOW_ROWS_MAX);
    expect(rows[1]).toMatchObject({ meaning: "review", action: "show", title: S.homeNow.sinceFiles(3) });
    for (const r of rows) expect(`${r.title} ${r.line}`).not.toMatch(/\b(Cursor|Claude|Copilot|you changed|another tool)\b/i);
  });
  test("a project with no fixes: the practice row in purple, and a row that says what will appear", () => {
    const rows = nowRows({ fix: null, since: [], practice: true, undo: false, now: NOW });
    expect(rows.map((r) => r.meaning)).toEqual(["practice", "notChecked"]);
    expect(MEANING_COLOUR.practice).toBe("purple");
    expect(rows[0].action).toBe("start");
    expect(rows[1].line).toBe(S.homeNow.noFixesLine);
  });
});
