import { describe, expect, test } from "bun:test";
import { lineFor, speechOn } from "./speech.ts";

const walk = (o: Record<string, unknown> = {}) => ({ id: "w1", index: 0, variant: "main", stage: "step", say: "Open settings.", ...o }) as never;

describe("what is said", () => {
  test("it is off unless turned on (and without storage it is off)", () => { expect(speechOn()).toBe(false); });
  test("a lesson step says its words, once per step and variant", () => {
    expect(lineFor({ walk: walk(), showme: null })).toEqual({ key: "walk:w1:0:main", text: "Open settings." });
    expect(lineFor({ walk: walk({ index: 1 }), showme: null })?.key).toBe("walk:w1:1:main");
    expect(lineFor({ walk: walk({ variant: "instead" }), showme: null })?.key).toBe("walk:w1:0:instead");
  });
  test("asking 'did that work' keeps the step's key, so the step is not said twice", () => {
    expect(lineFor({ walk: walk({ stage: "asking" }), showme: null })?.key).toBe("walk:w1:0:main");
  });
  test("after a pause, the step is said with the question, under its own key", () => {
    expect(lineFor({ walk: walk({ stage: "already" }), showme: null })).toEqual({ key: "walk:w1:0:already", text: "Open settings. Did you already do this?" });
  });
  test("help, done say something; stopped is silent", () => {
    expect(lineFor({ walk: walk({ stage: "help", note: "I could not tell." }), showme: null })?.text).toBe("I could not tell.");
    expect(lineFor({ walk: walk({ stage: "done" }), showme: null })?.text).toContain("All done");
    expect(lineFor({ walk: walk({ stage: "stopped", note: "Stopped." }), showme: null })).toBeNull();
  });
  test("while a lesson is on, the ring's caption is not also said", () => {
    expect(lineFor({ walk: walk(), showme: { stage: "pointing", message: "Click here", req: "sm_1" } })?.text).toBe("Open settings.");
  });
  test("a ring says its caption; a guess says it is a guess", () => {
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Save.", req: "sm_1" } })?.text).toBe("Click Save.");
    expect(lineFor({ walk: null, showme: { stage: "pointing_roughly", message: "Click Save.", req: "sm_1" } })?.text).toBe("I think it is here. Click Save.");
  });
  test("not being sure, a missing permission and an error are said in words; chatter is not", () => {
    for (const stage of ["not_sure", "needs_permission", "error", "window_changed"]) expect(lineFor({ walk: null, showme: { stage, message: "Words." } })?.text).toBe("Words.");
    for (const stage of ["looking", "thinking", "your_turn_done", "done_for_you", "your_turn_miss"]) expect(lineFor({ walk: null, showme: { stage, message: "x" } })).toBeNull();
    expect(lineFor({ walk: null, showme: null })).toBeNull();
  });
});
