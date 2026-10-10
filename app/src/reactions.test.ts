// Reactions: what earns one, and how they are kept calm.
import { describe, expect, test } from "bun:test";
import { Reactor, reactionFor } from "./reactions.ts";
import { at, confetti } from "./pointer.ts";

describe("what earns a reaction", () => {
  test("checks: a nod for a pass, a wince for a fail, nothing while running", () => {
    expect(reactionFor({ type: "proof.step", status: "passed" })).toBe("nod");
    expect(reactionFor({ type: "proof.step", status: "failed" })).toBe("wince");
    expect(reactionFor({ type: "proof.step", status: "running" })).toBeNull();
  });
  test("the big moments: a task proven, a whole plan done, going live", () => {
    expect(reactionFor({ type: "receipt", proof: "passed", changed: [{}] })).toBe("party");
    expect(reactionFor({ type: "drive.done", status: "done" })).toBe("party");
    expect(reactionFor({ type: "ship.status", stage: "live" })).toBe("party");
  });
  test("no party for each step of a plan, the ship safety check, Rescue's look, or a task that changed nothing", () => {
    expect(reactionFor({ type: "receipt", proof: "passed", changed: [{}], inPlan: true })).toBeNull();
    expect(reactionFor({ type: "proof.result", verdict: "passed" })).toBeNull();   // ship gates and Rescue send this too
    expect(reactionFor({ type: "receipt", proof: "passed", changed: [] })).toBeNull();
    expect(reactionFor({ type: "drive.done", status: "not_done" })).toBeNull();
  });
  test("smaller good moments: a preview ready, the right click, a receipt picture", () => {
    expect(reactionFor({ type: "ship.status", stage: "ready" })).toBe("cheer");
    expect(reactionFor({ type: "app.showme", stage: "your_turn_done" })).toBe("cheer");
    expect(reactionFor({ type: "receipt.visual", made: true })).toBe("cheer");
  });
  test("no celebration for a check that did not really pass", () => {
    for (const v of ["failed", "skipped"]) expect(reactionFor({ type: "receipt", proof: v, changed: [{}] })).toBeNull();
    expect(reactionFor({ type: "receipt.visual", made: false })).toBeNull();
    expect(reactionFor({ type: "ship.status", stage: "failed" })).toBeNull();
  });
});

describe("kept calm", () => {
  test("a run of passing checks is one nod", () => {
    const r = new Reactor();
    expect(r.push("nod", 0)).toBe("nod");
    expect(r.push("nod", 1300)).toBeNull();
    expect(r.push("nod", 2600)).toBeNull();
    expect(r.push("nod", 3100)).toBe("nod");
  });
  test("a pause between reactions, but the celebration is never swallowed", () => {
    const r = new Reactor();
    expect(r.push("wince", 0)).toBe("wince");
    expect(r.push("cheer", 800)).toBe("cheer");   // bigger than what is playing
    expect(r.push("nod", 1000)).toBeNull();       // smaller, while the cheer plays
    expect(r.push("party", 1100)).toBe("party");
  });
  test("after a pause anything can play again", () => {
    const r = new Reactor();
    r.push("cheer", 0);
    expect(r.push("wince", 2500)).toBe("wince");
  });
});

describe("confetti", () => {
  test("it flies away from the edge the character sits on, upwards first, then falls", () => {
    for (const right of [true, false]) {
      for (const p of confetti(12, right)) {
        expect(Math.sign(p.vx)).toBe(right ? -1 : 1);
        expect(p.vy).toBeLessThan(0);
        expect(at(p, 1.5).dy).toBeGreaterThan(at(p, 0.2).dy);
      }
    }
  });
  test("the same every time", () => expect(confetti(8, true)).toEqual(confetti(8, true)));
});
