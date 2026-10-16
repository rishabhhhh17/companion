// Multi step pointing, as the card plays it: one answer may name up to five targets in order. Each is pointed at in turn
// (the pointer flies there, then its line), with a short pause between, and only the last one waits for the person's
// click. Targets below the confidence line are said in words, never drawn (F17 4.2). Timers are fake here.
import { describe, expect, jest, test } from "bun:test";
import { AFTER_MS, LEAD_MS, lineMs, MAX_TARGETS, planSteps, play, sequenceOver, startTimes, stepsLine, targetsOf, type Step } from "./sequence.ts";
import { lineFor } from "./speech.ts";
import { initial, reduce } from "./model.ts";

// Bun's fake timers work at run time; its type file does not list advanceTimersByTime yet.
const clock = jest as unknown as { useFakeTimers(): void; useRealTimers(): void; advanceTimersByTime(ms: number): void };
const tg = (o: Record<string, unknown> = {}) => ({ x: 10, y: 20, targetText: "Save", confidence: 0.9, caption: "Click Save", ...o });
const point = (o: Record<string, unknown> = {}) => ({ type: "assist.point", req: "sm_1", step: 1, ...tg(), ...o });

describe("the targets an answer carries", () => {
  test("an answer with a list gives the list in order; one without gives itself", () => {
    const ev = point({ targets: [tg({ caption: "A" }), tg({ x: 300, caption: "B" }), tg({ x: 600, caption: "C" })] });
    expect(targetsOf(ev).map((t) => t.caption)).toEqual(["A", "B", "C"]);
    expect(targetsOf(point({ caption: "Only" })).map((t) => t.caption)).toEqual(["Only"]);
  });
  test("junk in the list is dropped, and never more than five", () => {
    const ev = point({ targets: [tg({ caption: "A" }), null, { x: "left" }, "nope", ...Array.from({ length: 8 }, (_, i) => tg({ x: 100 + i, caption: `n${i}` }))] });
    const got = targetsOf(ev);
    expect(got.length).toBe(MAX_TARGETS);
    expect(got[0].caption).toBe("A");
    expect(targetsOf({ type: "assist.point" })).toEqual([]);
    expect(targetsOf(null)).toEqual([]);
  });
});

describe("planning the steps", () => {
  test("each target is a step; only the last one waits for a click", () => {
    const s = planSteps(targetsOf(point({ targets: [tg({ caption: "A" }), tg({ caption: "B" }), tg({ caption: "C" })] })));
    expect(s.map((x) => [x.index, x.total, x.draw, x.hold])).toEqual([[0, 3, true, false], [1, 3, true, false], [2, 3, true, true]]);
    expect(s.map((x) => x.text)).toEqual(["A", "B", "C"]);
  });
  test("a target below the confidence line is said in words, never drawn, and never waits for a click", () => {
    const s = planSteps([tg({ caption: "A" }), tg({ caption: "B", confidence: 0.2, targetText: "Settings" })]);
    expect(s[1].draw).toBe(false); expect(s[1].hold).toBe(false);
    expect(s[1].text).toContain("not sure"); expect(s[1].text).toContain('Look for "Settings"');
    expect(s[0].hold).toBe(false);
  });
  test("one target alone behaves as it always did: drawn and waiting, or words when it is a guess", () => {
    expect(planSteps([tg()])).toMatchObject([{ draw: true, hold: true, total: 1 }]);
    expect(planSteps([tg({ confidence: 0.1 })])).toMatchObject([{ draw: false, hold: false }]);
  });
  test("in a lesson only the first target is used: a lesson step is one click", () => {
    expect(planSteps([tg({ caption: "A" }), tg({ caption: "B" })], { lesson: true }).map((x) => [x.text, x.hold])).toEqual([["A", true]]);
  });
  test("the walkthrough remembers the whole answer as one step", () => {
    expect(stepsLine(planSteps([tg({ caption: "Type your name" }), tg({ caption: "Click Save" })]))).toBe("Type your name; then Click Save");
  });
});

describe("timing", () => {
  test("a line lasts as long as it takes to say or to read, within sensible bounds", () => {
    expect(lineMs("Click Save", false)).toBeGreaterThanOrEqual(1500);
    expect(lineMs("Click Save", true)).toBeGreaterThanOrEqual(1200);
    expect(lineMs("word ".repeat(200), true)).toBeLessThanOrEqual(8000);
    expect(lineMs("word ".repeat(200), false)).toBeLessThanOrEqual(6000);
    expect(lineMs("one two three four five six seven eight", true)).toBeGreaterThan(lineMs("one two", true));
  });
  test("each step starts after the last one's lead in, its line, and a short pause", () => {
    const s = planSteps([tg({ caption: "First line" }), tg({ caption: "Second" }), tg({ caption: "Third" })]);
    const at = startTimes(s, false);
    expect(at[0]).toBe(0);
    expect(at[1]).toBe(LEAD_MS + lineMs("First line", false) + AFTER_MS);
    expect(at[2]).toBe(at[1] + LEAD_MS + lineMs("Second", false) + AFTER_MS);
    expect(LEAD_MS).toBe(900); expect(AFTER_MS).toBe(350);
  });
});

describe("playing them in order (fake timers)", () => {
  const rig = (steps: Step[], aimResult: (s: Step) => boolean = () => true) => {
    const log: string[] = [];
    const stop = play(steps, {
      aim: async (s) => { log.push(`aim ${s.index}${s.hold ? " hold" : ""}`); return aimResult(s); },
      words: (s) => { log.push(`words ${s.index}`); },
    }, false);
    return { log, stop };
  };
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  test("the first target is pointed at at once, the next ones only when their time comes", async () => {
    clock.useFakeTimers();
    try {
      const s = planSteps([tg({ caption: "A" }), tg({ caption: "B" }), tg({ caption: "C" })]);
      const at = startTimes(s, false);
      const r = rig(s);
      await flush();
      expect(r.log).toEqual(["aim 0"]);
      clock.advanceTimersByTime(at[1] - 1); await flush();
      expect(r.log).toEqual(["aim 0"]);
      clock.advanceTimersByTime(1); await flush();
      expect(r.log).toEqual(["aim 0", "aim 1"]);
      clock.advanceTimersByTime(at[2] - at[1]); await flush();
      expect(r.log).toEqual(["aim 0", "aim 1", "aim 2 hold"]);
      clock.advanceTimersByTime(60_000); await flush();
      expect(r.log.length).toBe(3);   // nothing after the last one: it waits for the click
    } finally { clock.useRealTimers(); }
  });
  test("a step said in words comes in its turn like the others", async () => {
    clock.useFakeTimers();
    try {
      const s = planSteps([tg({ caption: "A" }), tg({ caption: "B", confidence: 0.1 }), tg({ caption: "C" })]);
      const r = rig(s);
      clock.advanceTimersByTime(60_000); await flush();
      // Each step is scheduled only after the one before it was shown.
      for (let i = 0; i < 4; i++) { clock.advanceTimersByTime(60_000); await flush(); }
      expect(r.log).toEqual(["aim 0", "words 1", "aim 2 hold"]);
    } finally { clock.useRealTimers(); }
  });
  test("when a target cannot be pointed at (its window changed, or the pointer was cleared), the rest are not shown", async () => {
    clock.useFakeTimers();
    try {
      const s = planSteps([tg({ caption: "A" }), tg({ caption: "B" }), tg({ caption: "C" })]);
      const r = rig(s, (x) => x.index !== 1);
      for (let i = 0; i < 6; i++) { clock.advanceTimersByTime(60_000); await flush(); }
      expect(r.log).toEqual(["aim 0", "aim 1"]);
    } finally { clock.useRealTimers(); }
  });
  test("stopping it (Stop everything, Esc, a new question) cancels everything still to come", async () => {
    clock.useFakeTimers();
    try {
      const s = planSteps([tg({ caption: "A" }), tg({ caption: "B" })]);
      const r = rig(s);
      await flush();
      r.stop();
      for (let i = 0; i < 4; i++) { clock.advanceTimersByTime(60_000); await flush(); }
      expect(r.log).toEqual(["aim 0"]);
    } finally { clock.useRealTimers(); }
  });
  test("stopping while the first target is still being pointed at shows nothing more", async () => {
    clock.useFakeTimers();
    try {
      let release!: (v: boolean) => void;
      const log: string[] = [];
      const s = planSteps([tg({ caption: "A" }), tg({ caption: "B" })]);
      const stop = play(s, { aim: (x) => { log.push(`aim ${x.index}`); return new Promise<boolean>((res) => { release = res; }); }, words: () => {} }, false);
      stop(); release(true);
      for (let i = 0; i < 4; i++) { clock.advanceTimersByTime(60_000); await Promise.resolve(); await Promise.resolve(); }
      expect(log).toEqual(["aim 0"]);
    } finally { clock.useRealTimers(); }
  });
});

describe("what ends a sequence that is still playing", () => {
  // Found 16 Oct 2026: when the Mac side took a step's ring away because its window changed while it was up, the page
  // went on and said the next steps in words over the "the window changed" message.
  test("the window changing under a step, or the pointer going away, ends it", () => {
    expect(sequenceOver(null)).toBe(true);
    expect(sequenceOver(undefined)).toBe(true);
    expect(sequenceOver({ stage: "window_changed" })).toBe(true);
  });
  test("its own steps do not end it", () => {
    for (const stage of ["pointing", "pointing_roughly", "not_sure", "thinking", "looking"]) expect(sequenceOver({ stage })).toBe(false);
  });
});

describe("each line of a sequence is said once, after the pointer has flown there", () => {
  const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", type: "app.showme", ...o });
  test("the card keeps which step of how many it is on", () => {
    const m = reduce(initial(), ev({ stage: "pointing", message: "Then your email", req: "sm_1", step: 2, of: 3 }) as never);
    expect(m.showme).toMatchObject({ stage: "pointing", req: "sm_1", step: 2, of: 3 });
  });
  test("two steps of the same answer are two lines; a sequence step waits for the pointer to land", () => {
    const a = lineFor({ walk: null, showme: { stage: "pointing", message: "First", req: "sm_1", step: 1, of: 2 } });
    const b = lineFor({ walk: null, showme: { stage: "pointing", message: "Second", req: "sm_1", step: 2, of: 2 } });
    expect(a?.key).not.toBe(b?.key);
    expect(a?.delayMs).toBe(LEAD_MS);
    expect(lineFor({ walk: null, showme: { stage: "pointing", message: "Only", req: "sm_1" } })?.delayMs ?? 0).toBe(0);
  });
});
