// M69 step 2, Home at rest (homeRest.ts): the two tone hero, the Last fix card and the Since then card, from real state only.
import { describe, expect, test } from "bun:test";
import type { ReviewRowView } from "../../protocol/index.ts";
import type { HistoryItem } from "./model.ts";
import { checkedAgo, lastFix, lastProven, outcomeTitle, restCards, restHero, restMainLabel, resultHero, sinceRows, PILL_TONE, SINCE_MAX } from "./homeRest.ts";
import { homeStatus } from "./homeHero.ts";
import { initial } from "./model.ts";
import { S } from "./strings.ts";

const P = "/Users/me/my-shop";
const NOW = Date.parse("2026-11-04T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
let n = 0;
const task = (o: Partial<HistoryItem> = {}): HistoryItem => ({ id: ++n, label: "Before: fix the sign up button", status: "done", usd: 0.1, startedAt: ago(125), endedAt: ago(120), checkpoint: `cp_${n}`, changed: 2, proof: "passed", ...o });
const review = (o: Partial<ReviewRowView> = {}): ReviewRowView => ({ id: ++n, at: ago(40), count: 3, files: ["a.ts"], rating: "safe", touches: [], checks: "passed", did: "looks_fine", summary: "", ...o });
const statusOf = (history: HistoryItem[], sinceChanged = false) => homeStatus({ ...initial(), history, sinceCheck: sinceChanged ? { project: P, changed: true } : undefined }, P, NOW);
const hero = (history: HistoryItem[], o: { sinceChanged?: boolean; reviews?: ReviewRowView[]; pointClear?: boolean } = {}) =>
  restHero({ project: P, status: statusOf(history, o.sinceChanged), history, now: NOW, ...o });
const NOT_CHECKED = S.homeNow.pill.new;

describe("the hero at rest, two tones from the latest real state", () => {
  test("a proven fix: the outcome, then when it was proven, under LAST CHECK PASSED", () => {
    expect(hero([task()])).toEqual({ pill: "passed", first: "my-shop checked out fine.", second: "Proven 2 hours ago." });
  });
  test("proven, then files changed: says so, counted only when one review counted them", () => {
    expect(hero([task()], { sinceChanged: true }).second).toBe("Proven 2 hours ago. Files changed since.");
    expect(hero([task()], { sinceChanged: true, reviews: [review({ count: 3 })] }).second).toBe("Proven 2 hours ago. 3 files changed since.");
    expect(hero([task()], { sinceChanged: true, reviews: [review(), review({ at: ago(10), count: 2 })] }).second).toBe("Proven 2 hours ago. Files changed since.");
    // A review older than the proven fix is not "since".
    expect(hero([task()], { sinceChanged: true, reviews: [review({ at: ago(300) })] }).second).toBe("Proven 2 hours ago. Files changed since.");
  });
  test("a failed check: red tag, the problem in the project's name", () => {
    const h = hero([task({ proof: "failed" })]);
    expect(h.pill).toBe("failed");
    expect(h.first).toBe("my-shop has a problem.");
    expect(PILL_TONE[h.pill!]).toBe("stop");
  });
  test("never NOT CHECKED YET next to a proven run, whatever came after it", () => {
    for (const later of [task({ status: "interrupted", proof: null, startedAt: ago(30), endedAt: ago(29) }), task({ undone: true, startedAt: ago(30), endedAt: ago(29) }), task({ proof: null, startedAt: ago(30), endedAt: ago(29) })]) {
      const h = hero([task(), later]);
      expect(h.pill).not.toBe("new");
      expect(`${h.first} ${h.second}`).not.toContain(S.home.notChecked);
      expect(h.second).toBe("Last proven 2 hours ago.");
    }
  });
  test("NOT CHECKED YET only for a project whose log is empty", () => {
    expect(hero([]).pill).toBe("new");
    expect(S.homeNow.pill.new).toBe(NOT_CHECKED);
    const once = hero([task({ status: "interrupted", proof: null })]);
    expect(once.pill).toBe("look");
    expect(once.second).toContain("Last task: stopped");
  });
  test("its own checks passed (Check my project found nothing): a pass, never a fix", () => {
    const h = restHero({ project: P, status: { kind: "unchecked", ago: "" }, history: [], pointClear: true, now: NOW });
    expect(h.pill).toBe("passed");
    expect(h.second).toContain("Nothing was fixed");
  });
  test("no project: no tag, a plain way in", () => {
    expect(restHero({ project: "", status: { kind: "noProject", ago: "" }, history: [], now: NOW }).pill).toBeNull();
  });
  test("Check my project says Check it again once the project was checked", () => {
    expect(restMainLabel("check", "Check my project", { history: [], status: { kind: "unchecked", ago: "" } })).toBe("Check my project");
    expect(restMainLabel("check", "Check my project", { history: [task()], status: { kind: "changed", ago: "" } })).toBe(S.homeNow.checkAgain);
    expect(restMainLabel("shipCheck", "Check before going live", { history: [task()], status: { kind: "works", ago: "" } })).toBe("Check before going live");
  });
});

describe("the top bar's Checked line", () => {
  test("the last check's own time, never a task that stopped before a check ran", () => {
    expect(checkedAgo({ kind: "works", ago: "2 hours ago" }, [], NOW)).toBe("2 hours ago");
    expect(checkedAgo({ kind: "unchecked", ago: "28 minutes ago" }, [task(), task({ status: "interrupted", proof: null, startedAt: ago(30), endedAt: ago(28) })], NOW)).toBe("2 hours ago");
    expect(checkedAgo({ kind: "unchecked", ago: "28 minutes ago" }, [task({ status: "interrupted", proof: null })], NOW)).toBe("");
  });
});

describe("the Last fix card", () => {
  test("the newest finished task, its name without Before:, its tag and ticks from M45's verdict", () => {
    const f = lastFix([task({ startedAt: ago(500), endedAt: ago(499), label: "older" }), task()], NOW)!;
    expect(f.title).toBe("Sign up button fixed");   // M69 step 3: a proven fix is said as its outcome
    expect(f.tag).toBe("proven");
    expect(f.ticks).toEqual([{ ok: true, words: S.homeNow.tick.passed }]);
    expect(f.meta).toBe("2 files changed · 2 hours ago");
  });
  test("undone, failed, partly and not checked say so; an unknown count is never a number", () => {
    expect(lastFix([task({ undone: true })], NOW)!.tag).toBe("undone");
    expect(lastFix([task({ proof: "failed" })], NOW)!.ticks[0].ok).toBe(false);
    expect(lastFix([task({ proof: "partial" })], NOW)!.tag).toBe("partly");
    expect(lastFix([task({ proof: null, changed: null })], NOW)!.meta).toBe("2 hours ago");
  });
  test("only a finished task: a stopped one or a running one is not a fix", () => {
    expect(lastFix([task({ status: "interrupted" }), task({ status: "running" })], NOW)).toBeNull();
    expect(lastProven([task({ proof: "failed" })])).toBeNull();
  });
});

describe("the Since then card", () => {
  const fix = task();
  const f = lastFix([fix], NOW);
  test("files changed (counted by a review) and tasks that did not finish, at most three; Changed since the last check is the hero's Check it again, never a second row", () => {
    const rows = sinceRows({ history: [fix, task({ status: "interrupted", label: "Before: price page", startedAt: ago(20), endedAt: ago(19) })], reviews: [review({ count: 3, at: ago(40) })], sinceChanged: true, fix: f, now: NOW });
    expect(rows.map((r) => r.words)).toEqual(["3 files changed", "Left off: price page"]);
    expect(rows.map((r) => r.act)).toEqual(["look", "open"]);
    const many = sinceRows({ history: [fix], reviews: [review(), review(), review(), review()], fix: f, now: NOW });
    expect(many.length).toBe(SINCE_MAX);
  });
  test("honest words: never who changed the files, never a tool's name", () => {
    const rows = sinceRows({ history: [fix], reviews: [review()], sinceChanged: true, fix: f, now: NOW });
    for (const r of rows) expect(r.words).not.toMatch(/\bby\b|Lovable|Bolt|Replit|Cursor|Claude/);
    for (const v of Object.values(S.homeNow)) if (typeof v === "string") expect(v).not.toMatch(/changed by|Lovable changed/);
  });
  test("only what came after the fix; nothing new says nothing", () => {
    expect(sinceRows({ history: [task({ status: "interrupted", startedAt: ago(900), endedAt: ago(899) }), fix], reviews: [review({ at: ago(600) })], fix: f, now: NOW })).toEqual([]);
  });
});

describe("what Home at rest draws under the hero", () => {
  test("the Last fix card once a fix finished, else the practice offer, nothing without a project", () => {
    expect(restCards({ project: P, history: [task()] })).toBe("fix");
    expect(restCards({ project: P, history: [] })).toBe("practice");
    expect(restCards({ project: "", history: [] })).toBeNull();
  });
});

describe("M69 step 3: the outcome, in the words a person uses", () => {
  test("a proven fix of a thing is said as that thing fixed", () => {
    expect(outcomeTitle("fix the sign up button", "proven")).toBe("Sign up button fixed");
    expect(outcomeTitle("Please fix my checkout page.", "proven")).toBe("Checkout page fixed");
    expect(lastFix([task()], NOW)!.title).toBe("Sign up button fixed");
  });
  test("anything else keeps the task's own words: not proven is never said as fixed", () => {
    expect(outcomeTitle("fix the sign up button", "failed")).toBe("Fix the sign up button");
    expect(outcomeTitle("add a dark mode", "proven")).toBe("Add a dark mode");
    expect(lastFix([task({ proof: null })], NOW)!.title).toBe("Fix the sign up button");
  });
});

describe("M69 step 3: the hero over a result says the outcome once", () => {
  test("proven: the thing fixed, then how it was proven", () => {
    expect(resultHero({ project: P, label: "fix the sign up button", kind: "proven", said: "Checked in a browser in 6 seconds." }))
      .toEqual({ pill: "proven", first: "Sign up button fixed.", second: "Checked in a browser in 6 seconds." });
  });
  test("failed: the thing not fixed yet, then why, in one plain sentence", () => {
    expect(resultHero({ project: P, label: "fix the sign up button", kind: "failed", said: "A test expected a thank you message." }))
      .toEqual({ pill: "failed", first: "The sign up button is not fixed yet.", second: "A test expected a thank you message." });
    expect(resultHero({ project: P, label: "add a dark mode", kind: "failed", said: "" })).toEqual({ pill: "failed", first: "my-shop is not fixed yet.", second: S.homeNow.checkFailed });
  });
  test("anything else keeps the result's own verdict line", () => {
    expect(resultHero({ project: P, label: "fix it", kind: "other", said: "" })).toBeNull();
  });
});

