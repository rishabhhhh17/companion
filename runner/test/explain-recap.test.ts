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
  test("more than two lines are cut to two (two short lines of why), and long ones are shortened", () => {
    const e = parseExplain(JSON.stringify({ why: ["a", "b", "c", "d", "x".repeat(500)] }))!;
    expect(e.bullets).toEqual(["a", "b"]);
    expect(parseExplain(JSON.stringify({ why: ["x".repeat(500)] }))!.bullets[0].length).toBeLessThanOrEqual(241);
  });
  test("the check question has two or three options with the right one marked", () => {
    const three = parseExplain(JSON.stringify({ why: ["Reason."], question: { text: "Why?", options: ["One", "Two", "Three"], correct: 2 } }))!;
    expect(three.question).toEqual({ text: "Why?", options: ["One", "Two", "Three"], correct: 2 });
  });
  test("a broken question is dropped but the bullets stay", () => {
    for (const q of [{ text: "Q?", options: ["only one"], correct: 0 }, { text: "Q?", options: ["a", "b"], correct: 5 }, { text: "", options: ["a", "b"], correct: 0 },
      { text: "Q?", options: ["a", "b", "c", "d"], correct: 0 }, { text: "Q?", options: ["Same", "same "], correct: 0 }, { text: "Q?", options: ["a", "b"], correct: 0.5 }, { text: "Q?", options: ["a", 7], correct: 0 }, { text: "Q?", options: "a,b", correct: 0 }]) {
      const e = parseExplain(JSON.stringify({ why: ["Reason."], question: q }))!;
      expect(e.bullets).toEqual(["Reason."]); expect(e.question).toBeUndefined();
    }
  });
  test("nothing usable gives null", () => { expect(parseExplain("no json")).toBeNull(); expect(parseExplain('{"why":[]}')).toBeNull(); expect(parseExplain('{"why":[3,{}]}')).toBeNull(); });
  test("keys and passwords in the answer are hidden", () => {
    expect(parseExplain('{"why":["I set the key to sk_live_abcdefghijklmnop1234 in the page."]}')!.bullets[0]).not.toContain("sk_live_abcdef");
  });
  test("the request holds what changed in plain form and never a whole file", () => {
    const r = explainRequest({ label: "Add a contact page", changed: [{ file: "contact.html", kind: "added" }], said: "I added a form.", diff: "--- contact.html\n@@ line 1\n+ <form>" });
    expect(r.text).toContain("contact.html"); expect(r.text).toContain("Add a contact page"); expect(r.system).toMatch(/plain words/i);
  });
  test("the request carries the real change, and asks for the why from it, not from the assistant's own words", () => {
    const r = explainRequest({ label: "Fix the total", changed: [{ file: "src/cart.js", kind: "modified" }], said: "I fixed it.", diff: "--- src/cart.js\n@@ line 4\n- return price;\n+ return price * qty;" });
    expect(r.text).toContain("+ return price * qty;"); expect(r.text).toContain("- return price;");
    expect(r.system).toMatch(/real change/i); expect(r.system).toMatch(/two short lines/i); expect(r.system).toMatch(/two or three/i);
  });
  test("settings and key files are named as settings only, never with what is in them", () => {
    const r = explainRequest({ label: "Add the key", changed: [{ file: ".env", kind: "modified" }, { file: "certs/site.pem", kind: "added" }], said: "", diff: "" });
    expect(r.text).toMatch(/\.env.*not shown/); expect(r.text).toMatch(/site\.pem.*not shown/);
  });
  test("a request with no readable change says so instead of pretending", () => {
    expect(explainRequest({ label: "x", changed: [{ file: "a.bin", kind: "modified" }], said: "", diff: "" }).text).toMatch(/could not be shown/i);
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
  // Second audit: a task waiting for an answer is waiting for the person, and stops for other reasons are named.
  test("a task that ended by asking a question is waiting for the person", () => {
    const l = recapLines([row({ status: "needs_you", proof: "skipped", startedAt: "2026-10-09T11:10:00.000Z", endedAt: "2026-10-09T11:20:00.000Z" })], since, 0);
    expect(l[1]).toMatch(/1 task ended/); expect(l[1]).toMatch(/1 waiting for your answer/);
    expect(l[2]).toBe("1 thing is waiting for you");
    // With an approval pending as well, both count.
    expect(recapLines([row({ status: "needs_you", startedAt: "2026-10-09T11:10:00.000Z" })], since, 2)[2]).toBe("3 things are waiting for you");
  });
  test("a question that was answered afterwards no longer waits", () => {
    const l = recapLines([
      row({ id: 5, status: "needs_you", startedAt: "2026-10-09T11:10:00.000Z", endedAt: "2026-10-09T11:12:00.000Z" }),
      row({ id: 6, status: "done", startedAt: "2026-10-09T11:13:00.000Z", endedAt: "2026-10-09T11:15:00.000Z" }),
    ], since, 0);
    expect(l[2]).toBe("Nothing is waiting for you");
  });
  test("tasks cut off by no connection, Claude being busy or the turn limit are stopped, and an error is not done", () => {
    const l = recapLines([
      row({ id: 7, status: "no_connection", proof: null, startedAt: "2026-10-09T11:10:00.000Z" }),
      row({ id: 8, status: "claude_busy", proof: null, startedAt: "2026-10-09T11:11:00.000Z" }),
      row({ id: 9, status: "error_max_turns", proof: null, startedAt: "2026-10-09T11:12:00.000Z" }),
      row({ id: 10, status: "error", proof: null, startedAt: "2026-10-09T11:13:00.000Z" }),
    ], since, 0);
    expect(l[1]).toMatch(/4 tasks ended/); expect(l[1]).toMatch(/3 stopped/); expect(l[1]).toMatch(/1 not done/);
  });
  test("a task still running is said as running", () => {
    const l = recapLines([row({ status: "running", endedAt: null, startedAt: "2026-10-09T11:10:00.000Z" })], since, 0);
    expect(l.join(" ")).toMatch(/still running/i);
  });
});
