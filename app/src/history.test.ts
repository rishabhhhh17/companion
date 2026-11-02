import { describe, expect, test } from "bun:test";
import { filterHistory, historyFiltering, HISTORY_STATUSES, historyUndo, statusGroup } from "./history.ts";
import { recentMark } from "./recentList.tsx";
import { readFileSync } from "node:fs";
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

describe("a task waiting for an answer", () => {
  test("is not filed under Not done", () => {
    expect(statusGroup({ status: "needs_you" })).toBe("stopped");
    expect(statusGroup({ status: "daily_limit" })).toBe("stopped");
    expect(statusGroup({ status: "error" })).toBe("not_done");
    expect(statusGroup({ status: "" })).toBe("not_done");
  });
});

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
    expect(statusGroup({ status: "done" })).toBe("done");
    expect(statusGroup({ status: "not_done" })).toBe("not_done");
    expect(statusGroup({ status: "error" })).toBe("not_done");
    expect(statusGroup({ status: "something new" })).toBe("not_done");
    expect(statusGroup({ status: "interrupted" })).toBe("stopped");
    expect(statusGroup({ status: "error_max_budget_usd" })).toBe("stopped");
    expect(statusGroup({ status: "error_max_turns" })).toBe("stopped");
    expect(statusGroup({ status: "running" })).toBe("running");
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

// Finding H: Undo where people look. Restoring an undo point puts the whole project back to just before that task, so it is
// offered only on the newest task that changed files; an older task would also lose the work done after it.
describe("Undo in What I did", () => {
  const row = (id: number, status: string, changed: number | null, checkpoint: string | null = `cp_${id}`): HistoryItem =>
    ({ id, label: `Task ${id}`, status, usd: 0, startedAt: "2026-10-17T10:00:00Z", endedAt: null, checkpoint, changed, proof: null });
  const list = [row(5, "done", 0), row(4, "done", 2), row(3, "done", 1), row(2, "not_done", 3), row(1, "done", null, null)];   // newest first
  test("the newest task that changed files gets the button", () => {
    expect(historyUndo(list, list[1], null)).toBe("undo");
  });
  test("older tasks that changed files get the reason instead, never a button", () => {
    expect(historyUndo(list, list[2], null)).toBe("older");
    expect(historyUndo(list, list[3], null)).toBe("older");
  });
  test("a task that changed nothing, or has no undo point, gets neither", () => {
    expect(historyUndo(list, list[0], null)).toBeNull();
    expect(historyUndo(list, list[4], null)).toBeNull();
    expect(historyUndo(list, row(9, "done", 2, null), null)).toBeNull();
  });
  test("nothing is offered while a task is still working on the project", () => {
    const busy = [row(6, "running", null, null), ...list];
    for (const h of busy) expect(historyUndo(busy, h, null)).toBeNull();
  });
  test("a task already undone this session is not offered again, and the one before it is still not, until the list is read again", () => {
    expect(historyUndo(list, list[1], "cp_4")).toBeNull();
    expect(historyUndo(list, list[2], "cp_4")).toBe("older");
  });
  test("an empty or odd list offers nothing", () => {
    expect(historyUndo([], row(1, "done", 1), null)).toBeNull();
    expect(historyUndo([row(1, "done", 1)], row(1, "done", 1), null)).toBe("undo");
  });
  test("the page draws the button and the question on the item, and keeps the receipt's own button", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const panel = card.slice(card.indexOf("function HistoryPanel("), card.indexOf("function MemoryList("));
    expect(panel).toContain("historyUndo(items, h,");
    expect(panel).toContain("S.historyUndo");
    expect(panel).toContain('type: "ui.undoAsked", checkpoint: h.checkpoint');
    // Only after a yes, and through the same command as the receipt's Undo (the engine refuses it while a task works).
    expect(panel).toContain("S.undoSure"); expect(panel).toContain("send(undo(project, h.checkpoint!))");
    // The receipt's own Undo lives in the result card (F28, the overhaul spec 4.2): same id, same question, same checkpoint.
    expect(card).toContain("<Button id={undoId} onClick={() => { if (m.receipt) dispatch({ type: \"ui.undoAsked\", checkpoint: m.receipt.checkpoint }); }}>");
    expect(card).toContain('dispatch({ type: "ui.undoAsked", checkpoint: m.receipt.checkpoint })');
  });
  test("its words are in the strings file and say why only the newest task has it", () => {
    expect(S.historyUndoWhy).toContain("newest");
    expect(S.historyUndoWhy).not.toContain("—");
    expect(typeof S.historyUndo).toBe("string");
  });
});

describe("M45: an undone task reads Undone everywhere", () => {
  const undone = { ...t(6, "Add a contact form", "done", "passed"), undone: true };
  test("undone rows group as undone", () => {
    expect(statusGroup(undone)).toBe("undone");
    expect(HISTORY_STATUSES).toContain("undone");
    expect(S.historyStatus.undone).toBe("Undone");
    expect(ids(filterHistory([undone, ...tasks.slice(1)], { words: "", status: "undone" }))).toEqual([6]);
    expect(ids(filterHistory([undone, ...tasks.slice(1)], { words: "", status: "done" }))).toEqual([4]);
  });
  test("no Undo for an undone row", () => {
    const list = [undone, ...tasks.slice(1).filter((x) => x.status !== "running")];
    expect(historyUndo(list, undone, null)).toBeNull();
  });
  test("recentMark", () => {
    expect(recentMark(t(1, "a", "done", "passed"))).toEqual({ icon: "tick", words: "Fixed and proven", kind: "proven" });
    expect(recentMark({ ...t(1, "a", "done", "passed"), undone: true })).toEqual({ icon: "undo", words: "Undone", kind: "undone" });
    expect(recentMark(t(1, "a", "interrupted"))).toMatchObject({ icon: "stop", words: "Stopped" });
    expect(recentMark(t(1, "a", "done", "partial"))).toMatchObject({ icon: "wait", words: "Fixed, not fully proven" });
    expect(recentMark(t(1, "a", "not_done", "failed"))).toMatchObject({ icon: "cross", words: "Not fixed yet" });
    expect(recentMark(t(1, "a", "running"))).toEqual({ icon: "wait", words: S.historyRunning, kind: "running" });
    // Brought back after an Undo: the same words as the receipt, never a tick (M45 review).
    expect(recentMark({ ...t(1, "a", "done", "passed"), undone: true, back: true })).toEqual({ icon: "wait", words: S.verdict.back, kind: "back" });
  });
  test("a row brought back is not filed as Undone, and may be undone again", () => {
    const back = { ...tasks[0], undone: true, back: true };
    expect(statusGroup(back)).toBe("done");
    expect(historyUndo([back, ...tasks.slice(1).filter((x) => x.status !== "running")], back, null)).toBe("undo");
  });
  test("an Undo of a task that changed nothing does not file it as Undone", () => {
    expect(statusGroup({ ...t(1, "a", "done"), changed: 0, undone: true })).toBe("done");
    // An unknown count may have changed files.
    expect(statusGroup({ ...t(1, "a", "done"), changed: null, undone: true })).toBe("undone");
  });
  test("the recent list colours a proven tick green and a failure or a crash red", () => {
    // F28: Home's recent fixes are Recent rows (ui/parts.tsx RecentRow); the mark's colour is the verdict's tone, so only a
    // proven fix ("good") is green, and a failed check or a crash ("bad") is red.
    const parts = readFileSync(new URL("./ui/parts.css", import.meta.url), "utf8");
    expect(parts).toContain('.ui-recent[data-tone="good"] .ui-recent-mark { color: var(--ok); }');
    expect(parts).toContain('.ui-recent[data-tone="bad"] .ui-recent-mark { color: var(--bad); }');
    expect(readFileSync(new URL("./recentList.tsx", import.meta.url), "utf8")).toContain("<RecentRow key={i.id} verdict={");
    expect(recentMark({ status: "done", proof: "passed", changed: 1 }).kind).toBe("proven");
    expect(recentMark({ status: "not_done", proof: "failed", changed: 1 }).kind).toBe("failed");
  });
});
