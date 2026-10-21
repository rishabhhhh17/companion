import { describe, expect, test } from "bun:test";
import { EXPLAIN_REASONS_SYSTEM, EXPLAIN_SYSTEM } from "../src/explain.ts";

// The real paid run (22 Oct 2026) passed only 21% of explanations for plain words: the model was never told which words are
// off limits. The rules the grader checks are now in the prompt itself.
describe("Explain is told the plain words rules, not left to guess", () => {
  for (const [name, system] of [["with a question", EXPLAIN_SYSTEM], ["reasons only", EXPLAIN_REASONS_SYSTEM]] as const) {
    test(name, () => {
      for (const w of ["variable", "function", "syntax", "string", "JSON", "CSS", "class", "undefined", "promise"]) expect(system, w).toContain(w);
      expect(system).toMatch(/never quote/i);
      expect(system).toMatch(/file name|names of files/i);
      expect(system).toMatch(/at most 150 characters/i);
      expect(system).toMatch(/one sentence/i);
      expect(system).toMatch(/instead/i);
    });
  }
  test("the check question asks about the reason, with wrong options that could be believed", () => {
    expect(EXPLAIN_SYSTEM).toMatch(/believable/i);
    expect(EXPLAIN_SYSTEM).toMatch(/never a number|not a number/i);
    expect(EXPLAIN_SYSTEM).toMatch(/obvious from the wording|picked from the wording/i);
  });
  test("a line that says what the change did stays true to the change shown", () => {
    expect(EXPLAIN_SYSTEM).toMatch(/only what the change shows|only what the change above shows/i);
  });
});
