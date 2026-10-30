import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FINISH_AT, LEAD_WAIT_MS, RUN_AHEAD, SpeechClock } from "./speechClock.ts";

describe("drawing in step with speech (M38)", () => {
  test("the pen follows the words and is finished by the line's key part", () => {
    const c = new SpeechClock(0);
    c.word(100, 0.1);
    expect(c.leads()).toBe(true);
    expect(c.pen(100)).toBe(0);
    c.word(400, 0.3); c.word(700, 0.5);
    expect(c.pen(700)).toBeCloseTo((0.5 - 0.1) / (FINISH_AT - 0.1), 5);
    c.word(1000, FINISH_AT);
    expect(c.pen(1000)).toBe(1);
  });
  test("between words it goes on at the voice's pace, never far past the last word", () => {
    const c = new SpeechClock(0);
    c.word(0, 0.1); c.word(1000, 0.3);   // 0.2 a second
    expect(c.part(1500)).toBeCloseTo(0.4, 5);
    expect(c.part(60_000)).toBeCloseTo(0.3 + RUN_AHEAD, 5);
  });
  test("no voice, or a voice that starts too late, leaves the pen its own speed", () => {
    expect(new SpeechClock(0).leads()).toBe(false);
    const late = new SpeechClock(0); late.word(LEAD_WAIT_MS + 1, 0.2);
    expect(late.leads()).toBe(false);
  });
  test("a line that ends or is cut finishes the mark, and words never go backwards", () => {
    const c = new SpeechClock(0); c.word(10, 0.2); c.word(20, 0.1);
    expect(c.part(20)).toBeCloseTo(0.2, 2);   // the later, smaller word was dropped
    c.word(30, null);
    expect(c.pen(30)).toBe(1);
    const odd = new SpeechClock(0); odd.word(5, NaN); expect(odd.leads()).toBe(false);
  });
  test("the overlay asks the clock when the voice leads, and keeps its own timing otherwise", () => {
    const o = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8");
    expect(o).toContain('listen("speech-word"');
    expect(o).toContain("clock.leads() ? clock.pen(now) * at : now - t0");
  });
});
