// The practice's thread (find, fix, prove): drawn from the practice's own stage only (practice.ts threadOf).
import { describe, expect, test } from "bun:test";
import { threadOf } from "./practice.ts";
import { S } from "./strings.ts";

describe("the thread says only what the stage knows", () => {
  test("start: only find is under way", () => { expect(threadOf({ stage: "start" })).toEqual({ find: "now", fix: "todo", prove: "todo" }); });
  test("found, lesson and fixing: find is done, fix is now, prove waits", () => {
    for (const stage of ["found", "lesson", "fixing"]) expect(threadOf({ stage })).toEqual({ find: "done", fix: "now", prove: "todo" });
  });
  test("proving: fix is done and prove is under way", () => { expect(threadOf({ stage: "proving" })).toEqual({ find: "done", fix: "done", prove: "now" }); });
  test("done: all three, and only done", () => { expect(threadOf({ stage: "done" })).toEqual({ find: "done", fix: "done", prove: "done" }); });
  test("failed with a receipt leaves the third step empty; failed without one means the fix itself failed", () => {
    expect(threadOf({ stage: "failed", result: {} })).toEqual({ find: "done", fix: "done", prove: "failed" });
    expect(threadOf({ stage: "failed" })).toEqual({ find: "done", fix: "failed", prove: "todo" });
  });
  test("blocked: the first step did not happen", () => { expect(threadOf({ stage: "blocked" }).find).toBe("failed"); });
  test("an unknown stage claims nothing", () => { expect(threadOf({ stage: "wat" })).toEqual({ find: "todo", fix: "todo", prove: "todo" }); });
});

describe("what Flowflow says", () => {
  // M51 polish (next to HeyClicky): sentence case, as every other line in Squibby; the all lowercase lines read as cute.
  test("one short sentence each, in sentence case, at most one exclamation mark, no em dash", () => {
    for (const line of [...Object.values(S.practiceSay), ...Object.values(S.look.say)]) {
      expect(line[0], line).toBe(line[0].toUpperCase());
      expect(line).not.toMatch(/\b[A-Z]{2,}\b/);
      expect(line.split(" ").length).toBeLessThanOrEqual(5);
      expect(line).not.toMatch(/!|—|\p{Extended_Pictographic}/u);
    }
  });
});
