// Multi step pointing, as the card plays it: one answer may name up to five targets in order. Each is pointed at in turn
// (the pointer flies there, then its line), with a short pause between, and only the last one waits for the person's
// click. Targets below the confidence line are said in words, never drawn (F17 4.2). Timers are fake here.
import { describe, expect, jest, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AFTER_MS, answerPlayer, clickTarget, LEAD_MS, lineMs, MAX_TARGETS, planSteps, play, sequenceOver, startTimes, stepsLine, stillWanted, targetsOf, type Step } from "./sequence.ts";
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
  test("in a lesson only the click target is used: a lesson step is one click", () => {
    // Found in review, 16 Oct 2026: the vision prompt lists targets in the order to look at them, the last one being where
    // to click. A lesson used the first, so it rang a "look here" target as "Your turn" and the right click was a miss.
    const s = planSteps([tg({ caption: "Look at the sidebar", x: 40 }), tg({ caption: "Click Save", x: 900 })], { lesson: true });
    expect(s.map((x) => [x.text, x.hold, x.target.x, x.total])).toEqual([["Click Save", true, 900, 1]]);
    expect(planSteps([tg({ caption: "Only" })], { lesson: true }).map((x) => x.text)).toEqual(["Only"]);
    expect(planSteps([], { lesson: true })).toEqual([]);
  });
  test("the click target of an answer is its last one", () => {
    expect(clickTarget([tg({ caption: "A" }), tg({ caption: "B" }), tg({ caption: "C" })])?.caption).toBe("C");
    expect(clickTarget([tg({ caption: "Only" })])?.caption).toBe("Only");
    expect(clickTarget([])).toBeNull();
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
  // Found in review, 18 Oct 2026: the gaps were timed for the Mac's normal speaking speed. At the slowest speed an 8 word
  // step needs about 5.3 s but got about 4.4 s, and the next step's line cut it off (the Mac's voice stops what it is saying).
  test("at a slower speed a spoken line lasts longer, and the next step waits for it", () => {
    const eight = "Type your email in the box up there";
    expect(lineMs(eight, true, 0.5)).toBe(2 * lineMs(eight, true, 1));
    expect(lineMs(eight, true, 0.75)).toBeGreaterThan(lineMs(eight, true, 1));
    // From a line's start to the next step's line: its time, the pause and the next lead in. About 5.3 s are needed at half speed.
    expect(lineMs(eight, true, 1) + AFTER_MS + LEAD_MS).toBeLessThan(5300);   // what it got before
    expect(lineMs(eight, true, 0.5) + AFTER_MS + LEAD_MS).toBeGreaterThan(5300);
    expect(lineMs("word ".repeat(200), true, 0.5)).toBeLessThanOrEqual(16_000);
    const s = planSteps([tg({ caption: eight }), tg({ caption: "Then click Save" }), tg({ caption: "Done" })]);
    const slow = startTimes(s, true, 0.5), normal = startTimes(s, true, 1);
    expect(slow[1]).toBe(LEAD_MS + lineMs(eight, true, 0.5) + AFTER_MS);
    expect(slow[1]).toBeGreaterThan(normal[1]);
    expect(slow[2] - slow[1]).toBeGreaterThan(normal[2] - normal[1]);
    expect(startTimes(s, true)).toEqual(normal);   // no speed given: normal speed, as before
  });
  test("a faster speed never shortens a line, a line only read ignores the speed, and an odd speed is normal speed", () => {
    // How fast the Mac's voice really goes at each speed needs a real Mac; a line cut off is worse than a short pause.
    const t = "Click the blue Deploy button at the top";
    expect(lineMs(t, true, 1.5)).toBe(lineMs(t, true, 1));
    expect(lineMs(t, true, 1.25)).toBe(lineMs(t, true, 1));
    expect(lineMs(t, false, 0.5)).toBe(lineMs(t, false, 1));
    for (const odd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.1]) expect(lineMs(t, true, odd)).toBeLessThanOrEqual(lineMs(t, true, 0.5));
    for (const odd of [0, -1, Number.NaN]) expect(lineMs(t, true, odd)).toBe(lineMs(t, true, 1));
    expect(lineMs(t, true, 0.1)).toBe(lineMs(t, true, 0.5));   // never slower than the slowest offered
  });
});

describe("the player waits as long as a line takes at the picked speed (fake timers)", () => {
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  test("at half speed the second step comes when its line has been said, not at the normal time", async () => {
    clock.useFakeTimers();
    try {
      const log: string[] = [];
      const p = answerPlayer({ set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) });
      const s = planSteps([tg({ caption: "Type your email in the box up there" }), tg({ caption: "Click Save" })]);
      p.start(s, { aim: async (x) => { log.push(`aim ${x.index}`); return true; }, words: () => {} }, true, 0.5);
      await flush();
      clock.advanceTimersByTime(startTimes(s, true, 1)[1]); await flush();
      expect(log).toEqual(["aim 0"]);   // the normal time has passed: still saying the first line
      clock.advanceTimersByTime(startTimes(s, true, 0.5)[1] - startTimes(s, true, 1)[1]); await flush();
      expect(log).toEqual(["aim 0", "aim 1"]);
    } finally { clock.useRealTimers(); }
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

describe("closing the card or holding to talk ends an answer still playing (fake timers)", () => {
  // Found in review, 16 Oct 2026: Esc closed the card and silenced only the current line. Every later step was still drawn,
  // and its line was said 900 ms later, for up to about 45 s with the card closed. Hold to talk did the same over the person.
  const fakeTimers = { set: (f: () => void, ms: number) => setTimeout(f, ms), clear: (t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>) };
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const rig = () => {
    const log: string[] = [];
    const p = answerPlayer(fakeTimers);
    const act = { aim: async (s: Step) => { log.push(`aim ${s.index}`); return true; }, words: (s: Step) => { log.push(`words ${s.index}`); } };
    return { log, p, act };
  };
  test("a closed card leaves no step still to come and no line still to be said", async () => {
    clock.useFakeTimers();
    try {
      const { log, p, act } = rig();
      p.start(planSteps([tg({ caption: "A" }), tg({ caption: "B" }), tg({ caption: "C" })]), act, true);
      await flush();
      p.sayLater(() => log.push("said A"), LEAD_MS);   // step A's line waits for the pointer to land
      expect(log).toEqual(["aim 0"]);
      p.hush();   // Esc, the character, or the hold to talk keys
      for (let i = 0; i < 6; i++) { clock.advanceTimersByTime(60_000); await flush(); }
      expect(log).toEqual(["aim 0"]);
    } finally { clock.useRealTimers(); }
  });
  test("the last step's line, still waiting after it was drawn, is not said either", async () => {
    clock.useFakeTimers();
    try {
      const { log, p, act } = rig();
      p.start(planSteps([tg({ caption: "Only" })]), act, true);
      await flush();
      p.sayLater(() => log.push("said"), LEAD_MS);
      p.hush();
      clock.advanceTimersByTime(60_000); await flush();
      expect(log).toEqual(["aim 0"]);
    } finally { clock.useRealTimers(); }
  });
  test("without a hush everything plays and is said in its turn", async () => {
    clock.useFakeTimers();
    try {
      const { log, p, act } = rig();
      p.start(planSteps([tg({ caption: "A" }), tg({ caption: "B" })]), act, false);
      await flush();
      p.sayLater(() => log.push("said A"), LEAD_MS);
      for (let i = 0; i < 4; i++) { clock.advanceTimersByTime(60_000); await flush(); }
      expect(log).toEqual(["aim 0", "said A", "aim 1"]);
    } finally { clock.useRealTimers(); }
  });
  test("a new answer replaces the one before, with its waiting line; a hush with nothing playing does nothing", async () => {
    clock.useFakeTimers();
    try {
      const { log, p, act } = rig();
      p.hush();
      p.start(planSteps([tg({ caption: "A" }), tg({ caption: "B" })]), act, false);
      await flush();
      p.sayLater(() => log.push("said old"), LEAD_MS);
      p.start(planSteps([tg({ caption: "X" })]), { aim: async () => { log.push("aim new"); return true; }, words: () => {} }, false);
      for (let i = 0; i < 4; i++) { clock.advanceTimersByTime(60_000); await flush(); }
      expect(log).toEqual(["aim 0", "aim new"]);
    } finally { clock.useRealTimers(); }
  });
  test("one line waits at a time: a newer one replaces it", async () => {
    clock.useFakeTimers();
    try {
      const { log, p } = rig();
      p.sayLater(() => log.push("first"), 900);
      p.sayLater(() => log.push("second"), 900);
      clock.advanceTimersByTime(2_000); await flush();
      expect(log).toEqual(["second"]);
      p.cancelLine();
      p.sayLater(() => log.push("third"), 900); p.cancelLine();
      clock.advanceTimersByTime(2_000); await flush();
      expect(log).toEqual(["second"]);
    } finally { clock.useRealTimers(); }
  });
  test("an answer that arrives after its question was ended is not played", () => {
    // Closing the card or Stop while "Finding it": the shell ended the answer and the card went back to nothing.
    expect(stillWanted(null)).toBe(false);
    expect(stillWanted(undefined)).toBe(false);
    expect(stillWanted({ stage: "window_changed" })).toBe(false);
    for (const stage of ["looking", "thinking", "pointing", "not_sure", "error"]) expect(stillWanted({ stage })).toBe(true);
  });
  test("the card ends the answer when it closes, when the hold to talk keys go down, and before Point at the problem", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toMatch(/listen\("hush", \(\) => player\.current\.hush\(\)\)/);
    expect(card).toMatch(/e\.key === "Escape"[^\n]*player\.current\.hush\(\);[^\n]*close_card/);
    // Only through pointProblem, which ends the answer first.
    expect(card.match(/invoke\("point_problem"/g)?.length).toBe(1);
    expect(card).toMatch(/const pointProblem = [^\n]*player\.current\.hush\(\);[^\n]*invoke\("point_problem"/);
    expect(card).toMatch(/if \(!stillWanted\(showmeNow\.current\)\) return;/);
    expect(card).toMatch(/player\.current\.sayLater\(/);
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
