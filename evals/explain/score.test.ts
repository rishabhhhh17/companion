// Explain's scorer: the rules any explanation must meet (two lines, plain words, a fair check question), checked in code,
// plus the parts only a reader can judge (is it true of the change, is the marked answer right), asked of a grader model
// through a small interface. Here the grader is a stand in.
import { describe, expect, test } from "bun:test";
import { gradeRequest, judge, parseGrade, plainProblems, ruleChecks } from "./score.ts";

const good = { why: ["The settings file had an extra comma after its last value, so the app could not read it.", "Taking the comma out makes the file valid again, so the app can start."], question: { text: "Why could the app not start?", options: ["A stray comma in the settings file", "A wrong port number"], correct: 0 } };
const raw = (o: unknown) => JSON.stringify(o);

describe("plain words", () => {
  test("ordinary sentences pass, and setting names in capitals are fine", () => {
    expect(plainProblems("The page now reads PUBLIC_SITE_NAME, so your shop name shows.")).toEqual([]);
  });
  test("code, file names, code style names and programming words are not plain", () => {
    expect(plainProblems("It calls `withTax()` now.").length).toBeGreaterThan(0);
    expect(plainProblems("The fix is in config.json.").join(" ")).toMatch(/file name/);
    expect(plainProblems("siteTitle reads the name.").join(" ")).toMatch(/code style name/);
    expect(plainProblems("The variable was undefined.").join(" ")).toMatch(/variable|undefined/);
    expect(plainProblems("It returns a promise => done").length).toBeGreaterThan(0);
  });
  test("a very long sentence is not plain", () => {
    expect(plainProblems(`It works now because ${"the part that ".repeat(12)}was wrong.`).join(" ")).toMatch(/long/);
  });
});

describe("the rules", () => {
  test("a good explanation meets every rule", () => {
    expect(ruleChecks(raw(good))).toMatchObject({ parsed: true, twoLines: true, plain: true, question: true, problems: [] });
  });
  test("one line, three lines, or a line far too long is not two lines", () => {
    expect(ruleChecks(raw({ ...good, why: [good.why[0]] })).twoLines).toBe(false);
    expect(ruleChecks(raw({ ...good, why: [...good.why, "And more."] })).twoLines).toBe(false);
    expect(ruleChecks(raw({ ...good, why: [good.why[0], "x ".repeat(120)] })).twoLines).toBe(false);
  });
  test("no question, a question that is not a question, or a broken one fails the question rule", () => {
    expect(ruleChecks(raw({ why: good.why })).question).toBe(false);
    expect(ruleChecks(raw({ ...good, question: { ...good.question, text: "Pick one." } })).question).toBe(false);
    expect(ruleChecks(raw({ ...good, question: { ...good.question, correct: 5 } })).question).toBe(false);
    expect(ruleChecks(raw({ ...good, question: { ...good.question, options: ["Same", "same"] } })).question).toBe(false);
  });
  test("nothing usable is not parsed", () => {
    expect(ruleChecks("Sure! It works now.")).toMatchObject({ parsed: false, twoLines: false, question: false });
  });
});

describe("the grader", () => {
  test("is shown the rubric, the change and the explanation, and asked for JSON", () => {
    const r = gradeRequest("THE RUBRIC", "The change:\n+ { \"port\": 3000 }", good);
    expect(r.system).toContain("THE RUBRIC");
    expect(r.text).toContain("\"port\": 3000");
    expect(r.text).toContain(good.why[0]);
    expect(r.text).toContain("Why could the app not start?");
    expect(r.text).toContain("(the marked answer)");
  });
  test("its answer is read strictly: anything unclear is no grade, never a pass", () => {
    expect(parseGrade('{"correct": true, "questionRight": true, "plain": true, "why": "fine"}')).toEqual({ correct: true, questionRight: true, plain: true, why: "fine" });
    expect(parseGrade('Here: {"correct": false, "questionRight": true, "plain": true, "why": "the comma was not the cause"}')?.correct).toBe(false);
    expect(parseGrade('{"correct": "yes"}')).toBeNull();
    expect(parseGrade("Looks good to me.")).toBeNull();
  });
});

describe("the verdict", () => {
  const grade = { correct: true, questionRight: true, plain: true, why: "" };
  test("passes only when every rule and every graded part holds", () => {
    expect(judge(ruleChecks(raw(good)), grade).outcome).toBe("pass");
    expect(judge(ruleChecks(raw(good)), { ...grade, correct: false }).outcome).toBe("fail");
    expect(judge(ruleChecks(raw(good)), { ...grade, questionRight: false }).outcome).toBe("fail");
    expect(judge(ruleChecks(raw({ why: good.why })), grade).outcome).toBe("fail");
    expect(judge(ruleChecks(raw(good)), null).outcome).toBe("not_graded");
    expect(judge(ruleChecks("nothing"), grade).outcome).toBe("no_explanation");
  });
});
