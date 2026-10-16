// What a follow up, a Try again and a different approach say to Claude. Plain, testable text.
import { describe, expect, test } from "bun:test";
import { differentTaskPrompt, endingOf, evidence, followUpPrompt, freshDifferentTaskPrompt, freshFollowUpPrompt, freshRetryPrompt, MAX_FOLLOW_UP_CHARS, retryPrompt, type Ending } from "../src/followup.ts";

const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";
const fail = { label: "Running the tests", detail: `1 failed: expected blue, got grey (API_KEY=${secret})` };

describe("the evidence of a failed check", () => {
  test("is redacted", () => {
    const e = evidence(fail);
    expect(e.detail).not.toContain(secret);
    expect(e.detail).toContain("expected blue, got grey");
    expect(e.label).toBe("Running the tests");
  });
  test("is clipped, by whole characters", () => {
    const e = evidence({ label: "x".repeat(500), detail: "😀".repeat(5000) });
    expect(Array.from(e.label).length).toBeLessThanOrEqual(120);
    expect(Array.from(e.detail).length).toBeLessThanOrEqual(1500);
    expect(e.detail).not.toMatch(/[\ud800-\udbff]$/);
  });
});

describe("a follow up", () => {
  test("in the same conversation, says what the person said", () => {
    const p = followUpPrompt("the button is still grey");
    expect(p).toContain("the button is still grey");
    expect(p).toMatch(/small/i);
  });
  test("off the record, starts afresh: the request is said again, and Claude is told to look first", () => {
    const p = freshFollowUpPrompt("Add a signup button", "the button is still grey");
    expect(p).toContain("Add a signup button");
    expect(p).toContain("the button is still grey");
    expect(p).toMatch(/look/i);
  });
  test("a very long follow up is cut", () => {
    expect(followUpPrompt("a".repeat(MAX_FOLLOW_UP_CHARS * 3)).length).toBeLessThan(MAX_FOLLOW_UP_CHARS + 400);
  });
});

describe("Try again", () => {
  test("gives the request and what failed, redacted", () => {
    const p = retryPrompt("Add a signup button", "failed_check", fail);
    expect(p).toContain("Add a signup button");
    expect(p).toContain("did not pass the checks");
    expect(p).toContain("Running the tests");
    expect(p).toContain("expected blue, got grey");
    expect(p).not.toContain(secret);
    expect(p).toMatch(/do not change or weaken the tests/i);
  });
  test("a failed check with no details still says the checks failed, with no empty lines", () => {
    const p = retryPrompt("Add a signup button", "failed_check");
    expect(p).toContain("did not pass the checks");
    expect(p).not.toMatch(/failed check:/i);
  });
  test("says how the last attempt really ended when no check failed", () => {
    const cases: [Ending, RegExp][] = [["spending_limit", /spending limit/i], ["error", /error/i], ["stopped", /was stopped/i], ["unfinished", /before it finished/i], ["finished", /tried again/i]];
    for (const [how, words] of cases) {
      for (const p of [retryPrompt("Add a signup button", how, fail), freshRetryPrompt("Add a signup button", "Add a signup button", how, fail)]) {
        expect(p).toContain("Add a signup button");
        expect(p).toMatch(words);
        expect(p).not.toMatch(/did not pass the checks|failed check/i);   // nothing false about checks, and no stale failure
      }
    }
  });
  test("how a task ended, from its status and its check", () => {
    expect(endingOf("not_done", "failed")).toBe("failed_check");
    expect(endingOf("interrupted", "failed")).toBe("failed_check");   // a check did fail before Stop
    expect(endingOf("error_max_budget_usd", "failed")).toBe("failed_check");
    expect(endingOf("error_max_budget_usd", "skipped")).toBe("spending_limit");
    expect(endingOf("error", "skipped")).toBe("error");
    expect(endingOf("interrupted", "skipped")).toBe("stopped");
    expect(endingOf("error_max_turns", "skipped")).toBe("unfinished");
    expect(endingOf("done", "passed")).toBe("finished");
  });
  test("off the record, also says earlier work may already be in the files", () => {
    const p = freshRetryPrompt("Add a signup button", "Add a signup button", "failed_check", fail);
    expect(p).toContain("Add a signup button");
    expect(p).toContain("did not pass the checks");
    expect(p).toContain("expected blue, got grey");
    expect(p).toMatch(/look/i);
  });
  test("off the record after a follow up, both the first request and the follow up are said", () => {
    const p = freshRetryPrompt("Add a signup button", "make it blue", "failed_check", fail);
    expect(p).toContain("Add a signup button");
    expect(p).toContain("make it blue");
  });
});

describe("a different approach in a single task", () => {
  test("says the same check failed three times and asks for a clearly different way", () => {
    const p = differentTaskPrompt(fail);
    expect(p).toMatch(/three times/i);
    expect(p).toMatch(/different approach/i);
    expect(p).toContain("expected blue, got grey");
    expect(p).not.toContain(secret);
  });
  test("off the record, the request is said again", () => {
    const p = freshDifferentTaskPrompt("Fix the signup page", fail);
    expect(p).toContain("Fix the signup page");
    expect(p).toMatch(/different approach/i);
  });
});
