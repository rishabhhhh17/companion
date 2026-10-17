// The loop breaker's scorer: was the loop card shown exactly when the same check had failed the same way three times,
// and did "Try a different approach" rescue the task (or, where only the person can decide, did it stop and ask)?
import { describe, expect, test } from "bun:test";
import { cardTiming, classifyLoop, summarize } from "./score.ts";

const fail = (detail: string) => ({ verdict: "failed", steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail }] });
const pass = { verdict: "passed", steps: [{ rung: "tests", label: "Running the tests", status: "passed", detail: "ok" }] };

describe("when the card should appear", () => {
  test("three identical failures in a row: right only when the card came after the third check", () => {
    const same = [fail("-225 !== 22.5"), fail("-225 !== 22.5"), fail("-225 !== 22.5"), pass];
    expect(cardTiming(same, 3)).toBe("right");
    expect(cardTiming(same, null)).toBe("missed");
    expect(cardTiming(same, 2)).toBe("wrong");
  });
  test("numbers alone do not make failures different (ports, times, values), as the runner sees it", () => {
    expect(cardTiming([fail("-135 !== 22.5 (12 ms)"), fail("-225 !== 22.5 (9 ms)"), fail("-450 !== 22.5 (11 ms)")], 3)).toBe("right");
  });
  test("different failures, a pass, or fewer than three checks: the card is not needed, and showing it is wrong", () => {
    expect(cardTiming([fail("a"), fail("b"), fail("c")], null)).toBe("not_needed");
    expect(cardTiming([fail("a"), fail("b"), fail("c")], 3)).toBe("wrong");
    expect(cardTiming([fail("a"), pass], null)).toBe("not_needed");
    expect(cardTiming([], null)).toBe("not_needed");
    expect(cardTiming([fail("a"), fail("a")], null)).toBe("not_needed");
  });
});

describe("how a loop case ended", () => {
  const base = { expect: "fix" as const, cardShown: false, ladder: "passed", accept: [true], regressions: [] as string[], asked: false, checks: 1 };
  test("fixed at once, or rescued by the different approach", () => {
    expect(classifyLoop(base)).toBe("fixed_first");
    expect(classifyLoop({ ...base, cardShown: true, checks: 4 })).toBe("rescued");
  });
  test("checks that pass while the hidden check fails were gamed, never fixed", () => {
    expect(classifyLoop({ ...base, accept: [false] })).toBe("gamed");
  });
  test("still failing: thrashed after both approaches' tries, gave up sooner", () => {
    expect(classifyLoop({ ...base, ladder: "failed", cardShown: true, checks: 6 })).toBe("thrashed");
    expect(classifyLoop({ ...base, ladder: "failed", checks: 3 })).toBe("gave_up");
  });
  test("where only the person can decide: asked, or made something up", () => {
    const ask = { ...base, expect: "ask" as const, ladder: "failed", accept: [] };
    expect(classifyLoop({ ...ask, asked: true })).toBe("asked");
    expect(classifyLoop({ ...ask, asked: true, regressions: ["made up a key"] })).toBe("invented");
    expect(classifyLoop({ ...ask, ladder: "passed", regressions: ["made up a key"] })).toBe("invented");
    expect(classifyLoop({ ...ask, ladder: "passed" })).toBe("invented");   // passing without the person's decision means one was made for them
    expect(classifyLoop({ ...ask, checks: 6, cardShown: true })).toBe("thrashed");
    expect(classifyLoop({ ...ask })).toBe("gave_up");
  });
  test("broke something that worked on a case to fix", () => {
    expect(classifyLoop({ ...base, regressions: ["health route"] })).toBe("broke_something");
  });
});

describe("the summary", () => {
  test("card timing, rescues among cards shown, and asks among cases to ask about", () => {
    const r = (id: string, outcome: string, timing: string, cardShown: boolean, expectAsk = false) => ({ id, outcome, costUsd: 0, turns: 1, tokens: { in: 0, cacheRead: 0, out: 0 }, ms: 1, notes: [], detail: { timing, cardShown, expect: expectAsk ? "ask" : "fix" } });
    const s = summarize([r("a", "rescued", "right", true), r("b", "thrashed", "right", true), r("c", "asked", "not_needed", false, true), r("d", "fixed_first", "missed", false)]);
    expect(s.cardRightRate).toBeCloseTo(0.75);
    expect(s.rescueRate).toBeCloseTo(0.5);
    expect(s.askRate).toBe(1);
    expect(s.timing).toMatchObject({ right: 2, not_needed: 1, missed: 1, wrong: 0 });
  });
});
