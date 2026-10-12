import { describe, expect, test } from "bun:test";
import { answered, atLimit, failed, MAX_ANYWHERE_STEPS, nextQuestion } from "./anywhere.ts";

describe("anywhere mode", () => {
  test("a step that worked is carried on as done", () => {
    const w = answered({ goal: "Export the file", steps: ["Open the File menu"] }, true);
    expect(nextQuestion(w)).toBe("Export the file. So far I did: Open the File menu. What is the next step?");
  });
  test("a step that did not work is named so it is not suggested again", () => {
    const w = answered({ goal: "Export the file", steps: ["Open the File menu", "Click Export"] }, false);
    expect(failed(w.steps[1])).toBe(true);
    const q = nextQuestion(w);
    expect(q).toContain("So far I did: Open the File menu.");
    expect(q).toContain("did NOT work, so do not suggest them again: Click Export.");
  });
  test("answering twice does not mark it twice", () => {
    let w = { goal: "g", steps: ["a"] };
    w = answered(answered(w, false), false);
    expect(w.steps[0]).toBe("a (did not work)");
  });
  test("with no steps yet nothing changes", () => { expect(answered({ goal: "g", steps: [] }, false).steps).toEqual([]); });
  test("it stops at 15 steps", () => {
    expect(atLimit({ goal: "g", steps: Array(MAX_ANYWHERE_STEPS - 1).fill("x") })).toBe(false);
    expect(atLimit({ goal: "g", steps: Array(MAX_ANYWHERE_STEPS).fill("x") })).toBe(true);
  });
});
