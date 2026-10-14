import { describe, expect, test } from "bun:test";
import { aimDecision, flightMs, LOW_CONFIDENCE, notSureWords } from "./pointer.ts";

describe("the pointer's flight", () => {
  test("short hops are not too quick to follow, long ones not too slow", () => {
    expect(flightMs(10)).toBe(600); expect(flightMs(800)).toBe(1000); expect(flightMs(5000)).toBe(1400);
  });
});

describe("low confidence draws nothing (F17 4.2)", () => {
  test("a confident answer is drawn, a guess is not, and a missing number counts as a guess", () => {
    expect(aimDecision(0.9)).toBe("draw");
    expect(aimDecision(LOW_CONFIDENCE)).toBe("draw");
    expect(aimDecision(LOW_CONFIDENCE - 0.01)).toBe("words");
    for (const bad of [undefined, null, "0.9", Number.NaN, -1]) expect(aimDecision(bad as never)).toBe("words");
  });
  test("the words say what to look for and never claim a place", () => {
    const w = notSureWords("Environment Variables", "It is in the sidebar.");
    expect(w).toContain("not sure");
    expect(w).toContain('Look for "Environment Variables"');
    expect(notSureWords("", "")).not.toContain("Look for");
  });
});
