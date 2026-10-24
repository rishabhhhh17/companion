// A chain of sums ("6 + 7 + 8 = 22") must be redone as a whole. The audit (24 Oct 2026) stopped cutting chains into false pieces,
// which also made code miss a real slip in a chain; this judges the whole chain when it uses one kind of operator, and leaves a
// mixed chain ("4 + 2 x 3 = 10", written both ways by people) unjudged: a missed slip is left to the model's look, a false one never.
import { describe, expect, test } from "bun:test";
import { recompute } from "../src/secondlook.ts";

const claims = (t: string) => recompute(t).map((i) => i.issue);

describe("a chain judged as a whole", () => {
  test("a wrong total of three terms is caught, with the right total", () => {
    const r = recompute("Monday to Friday you logged 6, 7 and 8 hours on the big days, so 6 + 7 + 8 = 22 hours, plus the short days.");
    expect(r.length).toBe(1);
    expect(r[0].issue).toMatch(/21/);
    expect(r[0].by).toBe("recomputed");
  });
  test("right chains are left alone", () => {
    for (const t of ["30 + 45 + 75 = 150", "2+3+4=9", "10 - 3 - 2 = 5", "$1,000 + $2,000 + $3,000 = $6,000", "2 x 3 x 4 = 24", "100 / 5 / 4 = 5", "1 + 2 + 3 + 4 + 5 + 6 = 21"]) expect(claims(t), t).toEqual([]);
  });
  test("wrong chains are caught: minus, times, divide and longer", () => {
    expect(claims("10 - 3 - 2 = 6")[0]).toMatch(/5/);
    expect(claims("2 x 3 x 4 = 20")[0]).toMatch(/24/);
    expect(claims("100 / 5 / 4 = 6")[0]).toMatch(/5/);
    expect(claims("1 + 2 + 3 + 4 + 5 + 6 = 20")[0]).toMatch(/21/);
    expect(claims("$1,000 + $2,000 + $3,000 = $7,000")[0]).toMatch(/6,000/);
  });
  test("a mixed chain is not judged (people write it both ways)", () => {
    for (const t of ["4 + 2 x 3 = 10", "4 + 2 x 3 = 18", "10 - 2 x 3 = 4", "10 - 2 x 3 = 24", "2 x 3 + 4 = 10", "2 x 3 + 4 = 14"]) expect(claims(t), t).toEqual([]);
  });
  test("things that are not a chain are not read as one", () => {
    for (const t of ["10 - 4 = 2 x 3", "Call 555-1234-5678 = the office", "2024-10-24 = the date", "see rows 1 + 2 + 3 = the first three", "a = 1 + 2 + 3"]) expect(claims(t), t).toEqual([]);
  });
  test("a plain sum of two terms still works as before", () => {
    expect(claims("120 x 4 = 460")[0]).toMatch(/480/);
    expect(claims("300 + 250 = 550")).toEqual([]);
  });
  test("a chain with a division by zero is skipped, not a crash", () => {
    expect(claims("10 / 0 / 2 = 5")).toEqual([]);
  });
  test("a nasty long text is read quickly (no catastrophic backtracking)", () => {
    const nasty = ["1 + ".repeat(3000), "1,".repeat(6000), "1 x 1 ".repeat(2000) + "= ", "9 + 9 + ".repeat(1500) + "=", ("1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 ").repeat(400)];
    for (const t of nasty) { const t0 = performance.now(); recompute(t.slice(0, 12000)); expect(performance.now() - t0, t.slice(0, 20)).toBeLessThan(300); }
  });
});
