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

// A second, in code guard: the eval showed the model still slips jargon in now and then, so an answer that fails the same plain
// words check as the eval is asked for once more, naming what was wrong. Never blocks the explanation.
import { explainPlain, explanationProblems, plainProblems } from "../src/explain.ts";

const GOOD = JSON.stringify({ why: ["The page asked for the name before anyone had signed in.", "Now it waits until someone has."], question: { text: "Why did the page break?", options: ["It asked too early", "The page was too slow"], correct: 0 } });
const BAD = JSON.stringify({ why: ["The variable was undefined when the function ran.", "Now it checks first."], question: { text: "What was wrong?", options: ["A missing value", "A slow page"], correct: 0 } });
const BAD2 = JSON.stringify({ why: ["The variable was undefined, the string was null and the array failed.", "Now the function checks the variable."] });
const req = { system: "s", text: "the change" };
const asker = (answers: string[]) => { const calls: { text: string }[] = []; const ask = async (r: { text: string; system: string }) => { calls.push(r); return { text: answers[Math.min(calls.length - 1, answers.length - 1)], costUsd: 0.003 }; }; return { ask, calls }; };

describe("plain words guard: one retry when the answer is not plain", () => {
  test("plainProblems is the one definition the eval and the app share", () => {
    expect(plainProblems("The variable was undefined.").length).toBeGreaterThan(0);
    expect(plainProblems("The page asked too early.")).toEqual([]);
  });
  test("a plain answer is asked for once and costs once", async () => {
    const a = asker([GOOD]);
    const r = await explainPlain(a.ask, req, { question: true });
    expect(a.calls.length).toBe(1);
    expect(r.explanation?.bullets[0]).toMatch(/asked for the name/);
    expect(r.costUsd).toBeCloseTo(0.003);
  });
  test("an answer with jargon is asked for again, naming what was wrong, and the plain second answer is used; both calls are paid", async () => {
    const a = asker([BAD, GOOD]);
    const r = await explainPlain(a.ask, req, { question: true });
    expect(a.calls.length).toBe(2);
    expect(a.calls[1].text).toContain("the change");
    expect(a.calls[1].text).toMatch(/not plain enough/);
    expect(a.calls[1].text).toMatch(/variable/);
    expect(r.explanation?.bullets[0]).toMatch(/asked for the name/);
    expect(r.costUsd).toBeCloseTo(0.006);
  });
  test("never more than one retry, and the answer with fewer problems wins even if neither is clean", async () => {
    const a = asker([BAD2, BAD]);
    const r = await explainPlain(a.ask, req, { question: true });
    expect(a.calls.length).toBe(2);
    expect(r.explanation?.bullets[0]).toMatch(/variable was undefined when the function ran/);   // BAD has three problems, BAD2 has six
    const b = asker([BAD, BAD2]);
    expect((await explainPlain(b.ask, req, { question: true })).explanation?.bullets[0]).toMatch(/when the function ran/);   // the first stays: the second is worse
  });
  test("a retry that fails or gives nothing keeps the first answer and what was spent", async () => {
    let n = 0;
    const ask = async () => { if (++n === 2) throw new Error("network"); return { text: BAD, costUsd: 0.003 }; };
    const r = await explainPlain(ask, req, { question: true });
    expect(r.explanation?.bullets[0]).toMatch(/variable/);
    expect(r.costUsd).toBeCloseTo(0.003);
    const a = asker([BAD, "not json"]);
    expect((await explainPlain(a.ask, req, { question: true })).explanation?.bullets[0]).toMatch(/variable/);
  });
  test("an answer that cannot be read is not retried (nothing to compare), and short reasons never look at a question", async () => {
    const a = asker(["not json"]);
    const r = await explainPlain(a.ask, req, { question: true });
    expect(r.explanation).toBeNull(); expect(a.calls.length).toBe(1);
    const e = { bullets: ["Fine words here."], question: { text: "The variable?", options: ["a", "b"], correct: 0 } };
    expect(explanationProblems(e, false)).toEqual([]);
    expect(explanationProblems(e, true).length).toBeGreaterThan(0);
  });
});

// The last misses of the real eval (22 Oct 2026) were lines a little too long: the same retry now covers length and sentence count.
describe("the retry also covers lines that are too long or run on", () => {
  const LONG = JSON.stringify({ why: ["The page asked for the name before anyone had signed in, so it showed nothing at all on the screen until the next time the whole page was loaded again.", "Now it waits."], question: { text: "Why?", options: ["Too early", "Too slow"], correct: 0 } });
  const TWO_SENTENCES_PLUS = JSON.stringify({ why: ["The page asked early. It showed nothing. It stayed blank.", "Now it waits."], question: { text: "Why?", options: ["Too early", "Too slow"], correct: 0 } });
  test("explanationProblems names a line over 150 characters and one with more than two sentences", () => {
    const e1 = { bullets: [JSON.parse(LONG).why[0], "Now it waits."] };
    expect(explanationProblems(e1, false).join(" ")).toMatch(/150 characters/);
    const e2 = { bullets: ["The page asked early. It showed nothing. It stayed blank.", "Now it waits."] };
    expect(explanationProblems(e2, false).join(" ")).toMatch(/two sentences/);
    expect(explanationProblems({ bullets: ["The page asked early.", "Now it waits."] }, false)).toEqual([]);
  });
  test("a long line is asked for again, saying how short it must be", async () => {
    const a = asker([LONG, GOOD]);
    const r = await explainPlain(a.ask, req, { question: true });
    expect(a.calls.length).toBe(2);
    expect(a.calls[1].text).toMatch(/150 characters/);
    expect(r.explanation?.bullets[0]).toMatch(/asked for the name before anyone had signed in\.$/);
    const b = asker([TWO_SENTENCES_PLUS, GOOD]);
    await explainPlain(b.ask, req, { question: true });
    expect(b.calls.length).toBe(2);
  });
});
