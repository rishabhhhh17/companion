import { describe, expect, test } from "bun:test";
import { answered, asksWorked, atLimit, clicked, failed, judged, MAX_ANYWHERE_STEPS, nextQuestion, unchecked, waitsForPage } from "./anywhere.ts";
import { readFileSync } from "node:fs";

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

// HeyClicky v1.0.53 parity: walkthroughs stopped asking you to say continue after a correct click. Ours asks "Did that
// work?" after every click unless "Ask Did that work? after each step" is set to only when unsure (showme.askWorked; the
// usual is every step, the 12 Oct design). Then a clean click on a solid ring moves on by itself, the step is written down
// as clicked but not checked (a guess, never as worked), and the next look is asked to check it first.
describe("asking Did that work?", () => {
  const clean = { how: "your_turn_done" as const, soft: false, missed: false };
  test("asked after every step unless the setting says only when unsure (the usual is every step)", () => {
    expect(asksWorked({ ...clean, setting: "everyStep" })).toBe(true);
    expect(asksWorked({ ...clean, setting: undefined })).toBe(true);
    expect(asksWorked({ ...clean, setting: "whenUnsure" })).toBe(false);
  });
  test("still asked when unsure: a soft ring (a guess), a click off the target first, or a press Companion made", () => {
    expect(asksWorked({ ...clean, setting: "whenUnsure", soft: true })).toBe(true);
    expect(asksWorked({ ...clean, setting: "whenUnsure", missed: true })).toBe(true);
    expect(asksWorked({ ...clean, setting: "whenUnsure", how: "done_for_you" })).toBe(true);
  });
  test("a step moved on without asking is written down as clicked, not checked, never as worked", () => {
    const w = clicked({ goal: "Export the file", steps: ["Open the File menu"] });
    expect(unchecked(w.steps[0])).toBe(true);
    expect(failed(w.steps[0])).toBe(false);
    const q = nextQuestion(w);
    expect(q).toContain("Open the File menu");
    expect(q).toMatch(/clicked.*not checked/i);
    expect(q).toMatch(/check first whether it worked|first look whether it worked/i);
  });
  test("an answer later replaces the not checked mark, and the not checked mark is never added twice", () => {
    let w = clicked(clicked({ goal: "g", steps: ["a"] }));
    expect(w.steps[0].match(/not checked/g)?.length).toBe(1);
    w = answered(w, false);
    expect(failed(w.steps[0])).toBe(true);
    expect(unchecked(w.steps[0])).toBe(false);
    expect(answered(clicked({ goal: "g", steps: ["a"] }), true).steps[0]).toBe("a");
  });
  test("only the last step is asked to be checked first; earlier ones that were never checked stay named", () => {
    const w = { goal: "g", steps: [clicked({ goal: "g", steps: ["a"] }).steps[0], "b"] };
    const q = nextQuestion(w);
    expect(q).toContain("So far I did:");
    expect(q).not.toMatch(/check first whether it worked|first look whether it worked/i);
  });
});

// HeyClicky v1.0.53 parity: walkthroughs wait for slow pages to load before looking again. Ours waits (bounded, Stop ends
// it) only when "Wait for the page before the next step" is on, or when the next look starts by itself after a click.
describe("waiting for the page", () => {
  test("off unless turned on, and always when the next look follows a click by itself", () => {
    expect(waitsForPage(false, "everyStep")).toBe(false);
    expect(waitsForPage(undefined, undefined)).toBe(false);
    expect(waitsForPage(true, "everyStep")).toBe(true);
    expect(waitsForPage(false, "whenUnsure")).toBe(true);
  });
  test("the card asks the shell to wait only for a look that follows an action, and reads both settings", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/invoke\("showme_start", \{ question, allScreens: allScreensOn\(\), settle, mode, before \}\)/);   // mode and before: an everyday look (everyday.ts)
    expect(card).toContain('waitsForPage(setting("showme.waitForPage"), setting("showme.askWorked"))');
    // The question asked by itself after a clean click: the setting decides, and a soft ring, a miss or Do it for me ask.
    expect(card).toContain('asksWorked({ setting: setting("showme.askWorked"), how: stage, soft: ringLook.current.soft, missed: ringLook.current.missed })');
  });
});

// Found in review (19 Oct 2026): the next look was asked whether a step moved on from without asking had worked, but its
// answer was never read back, so a step that had not worked stayed "clicked, not checked yet" and could be suggested
// again. The answer now carries the verdict (assist.point lastStepWorked), and it is written down here.
describe("the next look's verdict on the step before", () => {
  const w0 = () => clicked({ goal: "Export the file", steps: ["Open the File menu"] });
  test("no: written down as did not work, and never suggested again", () => {
    const w = judged(w0(), "no");
    expect(failed(w.steps[0])).toBe(true);
    expect(nextQuestion(w)).toContain("These did NOT work, so do not suggest them again: Open the File menu.");
  });
  test("yes: written down as a guess from the screen, never as checked by the person", () => {
    const w = judged(w0(), "yes");
    expect(unchecked(w.steps[0]) || failed(w.steps[0])).toBe(false);
    expect(w.steps[0]).toBe("Open the File menu (looked like it worked)");
    expect(nextQuestion(w)).not.toMatch(/first look whether it worked/i);
  });
  test("unsure or no verdict: still clicked, not checked yet", () => {
    for (const v of ["unsure", undefined, "maybe"]) expect(judged(w0(), v).steps).toEqual(w0().steps);
  });
  test("only a step that was not checked is judged: the person's own answer is never changed", () => {
    const told = answered({ goal: "g", steps: ["a"] }, true);
    expect(judged(told, "no")).toEqual(told);
    const bad = answered({ goal: "g", steps: ["a"] }, false);
    expect(judged(bad, "yes")).toEqual(bad);
    expect(judged({ goal: "g", steps: [] }, "no")).toEqual({ goal: "g", steps: [] });
  });
  test("the card writes the verdict down before the new step is added", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("setWalk((w) => (w ? { ...w, steps: [...judged(w, verdict).steps, stepsLine(steps)] } : w));");
  });
});
