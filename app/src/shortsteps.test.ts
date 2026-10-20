// Spoken answers that fit (M11, everyday apps): with "Say steps short, one at a time" (talk.shortSteps) on and Speak to me
// on, each step of a Show me answer or a lesson is said as one short line when its ring lands, paced with the rings
// (sequence.ts). Off (the usual value), every line is said exactly as before. Nothing here plays a sound.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { lineFor, SHORT_WORDS, shortLine } from "./speech.ts";
import { leadMs, lineMs, planSteps, startTimes } from "./sequence.ts";
import { defOf } from "../../protocol/settings.ts";
import { S } from "./strings.ts";

const walk = (o: Record<string, unknown> = {}) => ({ id: "w1", index: 0, variant: "main", stage: "step", say: "Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives.", ...o }) as never;
const words = (t: string) => t.trim().split(/\s+/).length;

describe("one short line", () => {
  test("the first sentence only: one step at a time", () => {
    expect(shortLine("Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives.")).toBe("Click Rules at the top of the Settings window.");
    expect(shortLine("Open the Mail menu! Then choose Settings.")).toBe("Open the Mail menu!");
  });
  test("a long first sentence is cut at a natural break, never in the middle of a phrase", () => {
    const long = "Set the condition to From contains, then type the sender's address in the box on the right of the window that opens";
    const s = shortLine(long);
    expect(words(s)).toBeLessThanOrEqual(SHORT_WORDS);
    expect(s).toBe("Set the condition to From contains.");
  });
  test("a long sentence with no break is said whole rather than cut off", () => {
    const long = "Press and hold the small round button at the very top left corner of the photo window until the list of tools opens up";
    expect(shortLine(long)).toBe(long);
  });
  test("short lines, versions and numbers stay as they are", () => {
    expect(shortLine("Click Save")).toBe("Click Save");
    expect(shortLine("Choose version 2.5 from the list.")).toBe("Choose version 2.5 from the list.");
    expect(shortLine("  ")).toBe("");
  });
});

describe("what is said, with the setting", () => {
  test("in the registry: a switch, off, read by the pages, with its words", () => {
    expect(defOf("talk.shortSteps")).toMatchObject({ kind: "switch", default: false, applies: ["pages"], section: "talking" });
    expect(S.set["talk.shortSteps"].label).toBeTruthy();
  });
  test("off (the usual value): a lesson step and a Show me step are said whole, as before", () => {
    expect(lineFor({ walk: walk(), showme: null })?.text).toBe("Click Rules at the top of the Settings window. Rules sort your mail for you as it arrives.");
    expect(lineFor({ walk: walk(), showme: null }, undefined, undefined, false)?.text).toContain("as it arrives");
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Rules. It is at the top.", req: "r" } })?.text).toBe("Click Rules. It is at the top.");
  });
  test("on: one short line per step, under the same key, so it is still said once", () => {
    const on = lineFor({ walk: walk(), showme: null }, undefined, undefined, true)!;
    expect(on).toEqual({ key: "walk:w1:0:main", text: "Click Rules at the top of the Settings window." });
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Click Rules. It is at the top.", req: "r" } }, undefined, undefined, true)?.text).toBe("Click Rules.");
    expect(lineFor({ walk: null, showme: { stage: "pointing_roughly", message: "Click Rules. It is at the top.", req: "r" } }, undefined, undefined, true)?.text).toBe("I think it is here. Click Rules.");
  });
  test("on: after a pause the step is short and the question is still asked", () => {
    expect(lineFor({ walk: walk({ stage: "already" }), showme: null }, undefined, undefined, true)?.text).toBe(`Click Rules at the top of the Settings window. ${S.lessonAlready}`);
  });
  test("on: help, errors and the end of a lesson are never cut, since they say what to do next", () => {
    const note = "I could not tell that this worked. I will not point at it again. What to look for: the Rules tab.";
    expect(lineFor({ walk: walk({ stage: "help", note }), showme: null }, undefined, undefined, true)?.text).toBe(note);
    expect(lineFor({ walk: null, showme: { stage: "error", message: "Could not find it. Try again.", req: "r" } }, undefined, undefined, true)?.text).toBe("Could not find it. Try again.");
  });
  test("each step waits for its ring: the line is said when its pointer lands, as before", () => {
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Then click OK. Mail asks first.", req: "r", step: 2, of: 3 } }, undefined, "normal", true)).toMatchObject({ text: "Then click OK.", delayMs: leadMs("normal") });
  });
});

describe("paced with the rings", () => {
  const t = (caption: string, x: number) => ({ x, y: 10, targetText: "", confidence: 0.9, caption });
  const steps = planSteps([t("Open the Mail menu at the top left. It is next to the Apple menu.", 10), t("Choose Settings. A window opens.", 200), t("Click Rules.", 400)]);
  test("a short line always fits in its step's time, so the next ring never cuts it off", () => {
    for (const pace of ["slower", "normal", "faster"]) for (const speed of [0.5, 1, 1.5]) for (const s of steps) {
      expect(lineMs(shortLine(s.text), true, speed, pace)).toBeLessThanOrEqual(lineMs(s.text, true, speed, pace));
    }
  });
  test("the steps still come one after another", () => {
    const at = startTimes(steps, true);
    expect(at[0]).toBe(0);
    expect(at[1]).toBeGreaterThan(at[0]);
    expect(at[2]).toBeGreaterThan(at[1]);
  });
  test("the card reads the setting and passes it to what is said, only when speaking is on", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain('const spoken = lineFor({ walk: m.walk, showme: m.showme }, keys, setting("point.pace"), setting("talk.shortSteps"));');
    // What is said goes through speakWhen first: nothing is said unless Speak to me (or Answer out loud) says so.
    expect(card.indexOf("speakWhen({ speech: speechOn()")).toBeGreaterThan(card.indexOf("const spoken = lineFor("));
  });
});
