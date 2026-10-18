import { describe, expect, test } from "bun:test";
import { filterHistory, historyFiltering, HISTORY_STATUSES, statusGroup } from "./history.ts";
import type { HistoryItem } from "./model.ts";
import { S } from "./strings.ts";

const t = (id: number, label: string, status: string, proof: string | null = null): HistoryItem =>
  ({ id, label, status, usd: 0.01, startedAt: "2026-10-17T10:00:00Z", endedAt: "2026-10-17T10:01:00Z", checkpoint: `cp_${id}`, changed: 1, proof });
const tasks = [
  t(6, "Add a contact form", "done", "passed"),
  t(5, "Fix the signup button", "not_done", "failed"),
  t(4, "Make the Signup page blue", "done", "partial"),
  t(3, "Café menu prices", "interrupted"),
  t(2, "Add tests for signup", "error_max_budget_usd"),
  t(1, "Something odd", "error"),
  t(7, "Deploy it", "running"),
];
const ids = (l: HistoryItem[]) => l.map((x) => x.id);

describe("search in What I did", () => {
  test("nothing typed and every status: the whole list, in the same order", () => {
    expect(ids(filterHistory(tasks, { words: "", status: "all" }))).toEqual(ids(tasks));
    expect(ids(filterHistory(tasks, { words: "   ", status: "all" }))).toEqual(ids(tasks));
  });
  test("words: every word must be in the label, in any order, any case, accents or not", () => {
    expect(ids(filterHistory(tasks, { words: "signup", status: "all" }))).toEqual([5, 4, 2]);
    expect(ids(filterHistory(tasks, { words: "SIGNUP button", status: "all" }))).toEqual([5]);
    expect(ids(filterHistory(tasks, { words: "button signup", status: "all" }))).toEqual([5]);
    expect(ids(filterHistory(tasks, { words: "cafe", status: "all" }))).toEqual([3]);
    expect(ids(filterHistory(tasks, { words: "café", status: "all" }))).toEqual([3]);
    expect(ids(filterHistory(tasks, { words: "payments", status: "all" }))).toEqual([]);
  });
  test("status: grouped the way the list words them", () => {
    expect(statusGroup("done")).toBe("done");
    expect(statusGroup("not_done")).toBe("not_done");
    expect(statusGroup("error")).toBe("not_done");
    expect(statusGroup("something new")).toBe("not_done");
    expect(statusGroup("interrupted")).toBe("stopped");
    expect(statusGroup("error_max_budget_usd")).toBe("stopped");
    expect(statusGroup("running")).toBe("running");
    expect(ids(filterHistory(tasks, { words: "", status: "done" }))).toEqual([6, 4]);
    expect(ids(filterHistory(tasks, { words: "", status: "not_done" }))).toEqual([5, 1]);
    expect(ids(filterHistory(tasks, { words: "", status: "stopped" }))).toEqual([3, 2]);
    expect(ids(filterHistory(tasks, { words: "", status: "running" }))).toEqual([7]);
  });
  test("words and status together", () => {
    expect(ids(filterHistory(tasks, { words: "signup", status: "done" }))).toEqual([4]);
    expect(ids(filterHistory(tasks, { words: "signup", status: "stopped" }))).toEqual([2]);
  });
  test("odd input never throws: a label that is not text, a status nobody knows", () => {
    const odd = [{ ...t(9, "x", "done"), label: undefined as unknown as string }, t(8, "regex (.*) [chars]", "done")];
    expect(ids(filterHistory(odd, { words: "(.*)", status: "all" }))).toEqual([8]);
    expect(ids(filterHistory(odd, { words: "", status: "nonsense" as never }))).toEqual([9, 8]);
  });
  test("every status choice has a name to show", () => {
    for (const s of HISTORY_STATUSES) expect(S.historyStatus[s].length).toBeGreaterThan(0);
  });
  test("the line under the search says how many match, and says so when none do", () => {
    expect(historyFiltering({ words: "", status: "all" })).toBe(false);
    expect(historyFiltering({ words: "x", status: "all" })).toBe(true);
    expect(historyFiltering({ words: "", status: "done" })).toBe(true);
    expect(S.historyMatches(2, 7)).toBe("2 of 7 tasks match.");
    expect(S.historyMatches(1, 7)).toBe("1 of 7 tasks matches.");
    expect(S.historyNoMatch.length).toBeGreaterThan(0);
  });
});
