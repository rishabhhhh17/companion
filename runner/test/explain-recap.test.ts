import { describe, expect, test } from "bun:test";
import { explainRequest, parseExplain } from "../src/explain.ts";
import { recapLines } from "../src/recap.ts";
import type { TaskRow } from "../src/tasklog.ts";

describe("reading the explanation Claude wrote", () => {
  test("two or three why bullets and one check question", () => {
    const e = parseExplain('{"why":["The form needs a name so you can tell messages apart.","I used a plain form because it works everywhere."],"question":{"text":"Why a plain form?","options":["It works everywhere","It is faster to type"],"correct":0}}')!;
    expect(e.bullets.length).toBe(2);
    expect(e.question).toEqual({ text: "Why a plain form?", options: ["It works everywhere", "It is faster to type"], correct: 0 });
  });
  test("it finds the answer inside other words or a code block", () => {
    expect(parseExplain('Here:\n```json\n{"why":["One reason."]}\n```')!.bullets).toEqual(["One reason."]);
  });
  test("more than three bullets are cut to three, and long ones are shortened", () => {
    const e = parseExplain(JSON.stringify({ why: ["a", "b", "c", "d", "x".repeat(500)] }))!;
    expect(e.bullets.length).toBe(3);
    expect(parseExplain(JSON.stringify({ why: ["x".repeat(500)] }))!.bullets[0].length).toBeLessThanOrEqual(241);
  });
  test("a broken question is dropped but the bullets stay", () => {
    for (const q of [{ text: "Q?", options: ["only one"], correct: 0 }, { text: "Q?", options: ["a", "b"], correct: 5 }, { text: "", options: ["a", "b"], correct: 0 }]) {
      const e = parseExplain(JSON.stringify({ why: ["Reason."], question: q }))!;
      expect(e.bullets).toEqual(["Reason."]); expect(e.question).toBeUndefined();
    }
  });
  test("nothing usable gives null", () => { expect(parseExplain("no json")).toBeNull(); expect(parseExplain('{"why":[]}')).toBeNull(); expect(parseExplain('{"why":[3,{}]}')).toBeNull(); });
  test("keys and passwords in the answer are hidden", () => {
    expect(parseExplain('{"why":["I set the key to sk_live_abcdefghijklmnop1234 in the page."]}')!.bullets[0]).not.toContain("sk_live_abcdef");
  });
  test("the request holds what changed in plain form and never a whole file", () => {
    const r = explainRequest({ label: "Add a contact page", changed: [{ file: "contact.html", kind: "added" }], said: "I added a form." });
    expect(r.text).toContain("contact.html"); expect(r.text).toContain("Add a contact page"); expect(r.system).toMatch(/plain words/i);
  });
});

const row = (o: Partial<TaskRow>): TaskRow => ({ id: 1, project: "/p", agent: "b", mode: "drive", label: "Add a page", status: "done", usd: 0.1, startedAt: "2026-10-09T10:00:00.000Z", endedAt: "2026-10-09T10:05:00.000Z", checkpoint: null, changed: 2, proof: "passed", ...o });
describe("Where was I", () => {
  const since = "2026-10-09T11:00:00.000Z";
  test("nothing happened while away means nothing to say", () => {
    expect(recapLines([row({})], since, 0)).toEqual([]);
    expect(recapLines([], since, 0)).toEqual([]);
  });
  test("three lines: what you were doing, what finished, what waits", () => {
    const rows = [
      row({ id: 3, label: "Add pricing", status: "done", proof: "passed", startedAt: "2026-10-09T11:10:00.000Z", endedAt: "2026-10-09T11:20:00.000Z" }),
      row({ id: 2, label: "Fix the form", status: "not_done", proof: "failed", startedAt: "2026-10-09T11:05:00.000Z", endedAt: "2026-10-09T11:08:00.000Z" }),
      row({ id: 1, label: "Add a contact page", startedAt: "2026-10-09T10:00:00.000Z", endedAt: "2026-10-09T10:50:00.000Z" }),
    ];
    const l = recapLines(rows, since, 1);
    expect(l.length).toBe(3);
    expect(l[0]).toContain("Add a contact page");
    expect(l[1]).toMatch(/2 tasks/); expect(l[1]).toMatch(/1 checked/); expect(l[1]).toMatch(/1 (was )?not done/);
    expect(l[2]).toMatch(/1 .*waiting for you/);
  });
  test("when nothing waits, it says so", () => {
    const l = recapLines([row({ startedAt: "2026-10-09T11:10:00.000Z", endedAt: "2026-10-09T11:20:00.000Z" })], since, 0);
    expect(l[l.length - 1]).toMatch(/nothing is waiting/i);
  });
  test("off the record tasks are not described at all", () => {
    expect(recapLines([row({ label: "Off the record task", startedAt: "2026-10-09T11:10:00.000Z", endedAt: "2026-10-09T11:20:00.000Z" })], since, 0)).toEqual([]);
  });
  test("a task still running is said as running", () => {
    const l = recapLines([row({ status: "running", endedAt: null, startedAt: "2026-10-09T11:10:00.000Z" })], since, 0);
    expect(l.join(" ")).toMatch(/still running/i);
  });
});
