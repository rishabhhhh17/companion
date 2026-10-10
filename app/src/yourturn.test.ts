// Your turn, as the card and the character see it: the ring waits for the person's click, a miss keeps it waiting,
// a hit is a small celebration, and Do it for me is always one button away.
import { describe, expect, test } from "bun:test";
import { burst } from "./pointer.ts";
import { characterWords, initial, reduce, visualState, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", type: "app.showme", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);

describe("the ring waits for the person", () => {
  test("a pointer that waits says so and the character needs you", () => {
    const m = run([ev({ stage: "pointing", message: "Click Deploy", req: "sm_1", turn: true })]);
    expect(m.showme).toEqual({ stage: "pointing", message: "Click Deploy", req: "sm_1", turn: true });
    expect(visualState(m)).toBe("needsYou");
  });
  test("a miss keeps it waiting (Do it for me still offered)", () => {
    const m = run([ev({ stage: "pointing", message: "Click Deploy", turn: true }), ev({ stage: "your_turn_miss", message: "Not quite. Click inside the ring." })]);
    expect(m.showme?.turn).toBe(true);
    expect(visualState(m)).toBe("needsYou");
  });
  test("a hit, or Do it for me, ends with the character done", () => {
    for (const s of ["your_turn_done", "done_for_you"]) expect(visualState(run([ev({ stage: "pointing", message: "x", turn: true }), ev({ stage: s, message: "That's it." })]))).toBe("done");
  });
  test("a pointer that does not wait (a line in the editor) offers no turn", () => {
    expect(run([ev({ stage: "pointing", message: "This line fails", turn: false })]).showme?.turn).toBeUndefined();
  });
  test("closing clears it", () => {
    expect(run([ev({ stage: "pointing", message: "x", turn: true }), ev({ stage: "done", message: "" })]).showme).toBeNull();
  });
});

describe("the celebration", () => {
  test("dots start on the ring's edge, spread evenly and move outwards", () => {
    const rect = { x: 100, y: 100, w: 120, h: 40 };
    const dots = burst(rect, 8);
    expect(dots).toHaveLength(8);
    const cx = 160, cy = 120;
    for (const d of dots) {
      expect(Math.hypot(d.x + d.dx - cx, d.y + d.dy - cy)).toBeGreaterThan(Math.hypot(d.x - cx, d.y - cy));
    }
    expect(burst(rect, 8)).toEqual(dots);   // the same every time
  });
  test("a tiny target still gets a ring big enough to see", () => {
    const d = burst({ x: 0, y: 0, w: 4, h: 4 }, 4)[0];
    expect(Math.hypot(d.x - 2, d.y - 2)).toBeGreaterThanOrEqual(26);
  });
});

describe("ending it", () => {
  test("Stop everything clears the pointer, so nothing moves on to a next step", () => {
    const m = run([ev({ stage: "pointing", message: "x", req: "sm_1", turn: true }), ev({ stage: "your_turn_done", message: "That's it." }), { v: 1, id: "k", type: "app.stop_everything" }]);
    expect(m.showme).toBeNull();
  });
  test("a hit keeps the walkthrough's request, a fresh pointing does not inherit an old one", () => {
    const hit = run([ev({ stage: "pointing", message: "x", req: "sm_1", turn: true }), ev({ stage: "your_turn_done", message: "That's it." })]);
    expect(hit.showme?.req).toBe("sm_1");
    const fresh = run([ev({ stage: "pointing", message: "x", req: "sm_1", turn: true }), ev({ stage: "looking", message: "Looking at your screen" }), ev({ stage: "pointing", message: "Pressing this button breaks the page", turn: true }), ev({ stage: "your_turn_done", message: "That's it." })]);
    expect(fresh.showme?.req).toBeUndefined();
  });
});
