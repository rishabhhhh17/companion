// The physics under Flowflow, tested without a screen: the spring step, how a squash recovers, how the top lags behind a
// moving window, how long a dissolve takes and how a ripple dies away. The renderer (renderer.ts) only draws what this decides.
import { describe, expect, test } from "bun:test";
import { WATER } from "../skins.ts";
import { Droplets, FlowState, dissolveCoverage, frameGap, rippleAmp, springStep, stateProfile } from "./physics.ts";

const M = WATER.motion;
const run = (s: FlowState, seconds: number, motion: "full" | "calm" = "full", dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) s.step(dt, motion); };

describe("the spring step", () => {
  test("at rest on its target it stays there", () => {
    expect(springStep({ x: 1, v: 0 }, 1, 1 / 60, 100, 10)).toEqual({ x: 1, v: 0 });
  });
  test("it is pulled toward the target, from either side", () => {
    expect(springStep({ x: 0, v: 0 }, 1, 1 / 60, 100, 10).x).toBeGreaterThan(0);
    expect(springStep({ x: 2, v: 0 }, 1, 1 / 60, 100, 10).x).toBeLessThan(2);
  });
  test("an underdamped spring overshoots once and then settles (that is the wobble)", () => {
    let s = { x: 0, v: 0 }, peak = 0, crossed = false;
    for (let i = 0; i < 600; i++) { s = springStep(s, 1, 1 / 60, M.squashK, M.squashC); peak = Math.max(peak, s.x); if (s.x > 1) crossed = true; }
    expect(crossed).toBe(true);
    expect(peak).toBeLessThan(1.6);
    expect(Math.abs(s.x - 1)).toBeLessThan(1e-3);
  });
  test("a long frame (the window was hidden) cannot blow it up", () => {
    let s = { x: 5, v: 40 };
    for (let i = 0; i < 20; i++) s = springStep(s, 0, 0.5, M.squashK, M.squashC);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(1e-2);
  });
  test("the skin's numbers are underdamped but settle: a drop of water, not jelly that never stops", () => {
    const zeta = M.squashC / (2 * Math.sqrt(M.squashK));
    expect(zeta).toBeGreaterThan(0.15);
    expect(zeta).toBeLessThan(0.7);
    const lz = M.lagC / (2 * Math.sqrt(M.lagK));
    expect(lz).toBeGreaterThan(0.2);
    expect(lz).toBeLessThan(0.8);
  });
});

describe("a click squashes and it comes back", () => {
  test("a poke pushes the body in at once, then it recovers to rest", () => {
    const s = new FlowState(M);
    s.poke(0.5, 0.5);
    s.step(1 / 60, "full");
    expect(s.squash.x).toBeLessThan(-0.01);
    run(s, 3);
    expect(Math.abs(s.squash.x)).toBeLessThan(1e-3);
    expect(Math.abs(s.squash.v)).toBeLessThan(1e-2);
  });
  test("it springs back past rest once (the wobble) before it settles", () => {
    const s = new FlowState(M);
    s.poke(0.5, 0.5);
    let max = -Infinity;
    for (let i = 0; i < 120; i++) { s.step(1 / 60, "full"); max = Math.max(max, s.squash.x); }
    expect(max).toBeGreaterThan(0.005);
  });
  test("a harder poke squashes further", () => {
    const a = new FlowState(M), b = new FlowState(M);
    a.poke(0.5, 0.5, 0.5); b.poke(0.5, 0.5, 1.5);
    a.step(1 / 60, "full"); b.step(1 / 60, "full");
    expect(b.squash.x).toBeLessThan(a.squash.x);
  });
  test("a poke starts a ripple where it touched", () => {
    const s = new FlowState(M);
    expect(s.ripple.age).toBe(-1);
    s.poke(0.3, 0.6);
    expect(s.ripple.age).toBe(0);
    expect([s.ripple.x, s.ripple.y]).toEqual([0.3, 0.6]);
  });
  test("a touch outside the picture is kept inside it", () => {
    const s = new FlowState(M);
    s.poke(-4, 9);
    expect(s.ripple.x).toBe(0);
    expect(s.ripple.y).toBe(1);
  });
});

describe("jelly lag from how the window moves", () => {
  test("the top trails toward the speed it is moving at", () => {
    const s = new FlowState(M);
    s.setVelocity(400, 0);
    run(s, 1.5);
    expect(s.lag.x).toBeGreaterThan(300);
    expect(s.lag.x).toBeLessThan(500);
    expect(Math.abs(s.lag.y)).toBeLessThan(1);
  });
  test("when the window stops, the top swings forward past rest and then settles", () => {
    const s = new FlowState(M);
    s.setVelocity(500, 0);
    run(s, 1.5);
    s.setVelocity(0, 0);
    let min = Infinity;
    for (let i = 0; i < 90; i++) { s.step(1 / 60, "full"); min = Math.min(min, s.lag.x); }
    expect(min).toBeLessThan(-5);
    run(s, 3);
    expect(Math.abs(s.lag.x)).toBeLessThan(0.5);
  });
  test("a wild speed is held to the limit, so the body never tears", () => {
    const s = new FlowState(M);
    s.setVelocity(1e9, -1e9);
    run(s, 3);
    expect(Math.abs(s.lag.x)).toBeLessThanOrEqual(M.lagMax * 1.4);
    expect(Math.abs(s.lag.y)).toBeLessThanOrEqual(M.lagMax * 1.4);
  });
  test("a speed that is not a number is no speed", () => {
    const s = new FlowState(M);
    s.setVelocity(Number.NaN, Number.POSITIVE_INFINITY);
    run(s, 1);
    expect(Number.isFinite(s.lag.x) && Number.isFinite(s.lag.y)).toBe(true);
  });
});

describe("the liquid dissolve between poses", () => {
  test("a new pose starts a dissolve that takes the skin's time, and ends on the new one", () => {
    const s = new FlowState(M, "look");
    expect(s.setPose("idea", "full")).toBe(true);
    expect(s.mix).toBe(0);
    run(s, M.dissolveS * 0.5);
    expect(s.mix).toBeGreaterThan(0.3);
    expect(s.mix).toBeLessThan(0.7);
    run(s, M.dissolveS * 0.7);
    expect(s.mix).toBe(1);
    expect(s.from).toBe("idea");
    expect(s.to).toBe("idea");
  });
  test("the same pose again changes nothing", () => {
    const s = new FlowState(M, "look");
    expect(s.setPose("look", "full")).toBe(false);
    expect(s.mix).toBe(1);
  });
  test("a pose change also pushes the body in a little, as if it were poked", () => {
    const s = new FlowState(M, "look");
    s.setPose("idea", "full");
    s.step(1 / 60, "full");
    expect(s.squash.x).toBeLessThan(0);
  });
  test("a change in the middle of a dissolve is not lost, and does not pop: it waits its turn and the dissolve hurries", () => {
    const s = new FlowState(M, "look");
    s.setPose("idea", "full");
    run(s, M.dissolveS * 0.4);
    const mid = s.mix;
    s.setPose("laptop", "full");
    expect(s.mix).toBe(mid);
    expect(s.pending).toBe("laptop");
    run(s, M.dissolveS * 3);
    expect(s.to).toBe("laptop");
    expect(s.from).toBe("laptop");
    expect(s.mix).toBe(1);
    expect(s.pending).toBeNull();
  });
  test("changing back to where it was heading drops the waiting change", () => {
    const s = new FlowState(M, "look");
    s.setPose("idea", "full");
    s.setPose("laptop", "full");
    s.setPose("idea", "full");
    expect(s.pending).toBeNull();
  });
  test("only the newest of several quick changes is shown at the end", () => {
    const s = new FlowState(M, "look");
    for (const p of ["idea", "laptop", "magnify", "wave"]) s.setPose(p, "full");
    run(s, 4);
    expect(s.to).toBe("wave");
    expect(s.visible()).toBe("wave");
  });
  test("coverage: nothing of the new pose at the start, all of it at the end, wherever the noise is", () => {
    for (const n of [0, 0.25, 0.5, 0.75, 1]) {
      expect(dissolveCoverage(0, n)).toBe(0);
      expect(dissolveCoverage(1, n)).toBe(1);
    }
  });
  test("coverage only grows with time, so the water never flows backward", () => {
    for (const n of [0, 0.3, 0.6, 1]) {
      let last = 0;
      for (let m = 0; m <= 1.0001; m += 0.05) { const c = dissolveCoverage(m, n); expect(c).toBeGreaterThanOrEqual(last - 1e-9); last = c; }
    }
  });
  test("it spreads: at the half way point some of the picture is new and some is old", () => {
    const covers = [0, 0.2, 0.4, 0.6, 0.8, 1].map((n) => dissolveCoverage(0.5, n));
    expect(Math.min(...covers)).toBeLessThan(0.5);
    expect(Math.max(...covers)).toBeGreaterThan(0.5);
  });
});

describe("a ripple dies away", () => {
  test("it is strongest at the touch and fades, then is over", () => {
    const a = [0, 0.3, 0.8, 1.5, 2.4].map((t) => rippleAmp(t, M.rippleFade));
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeLessThan(a[i - 1]);
    expect(a[0]).toBe(1);
    expect(a[a.length - 1]).toBeLessThan(0.05);
    expect(rippleAmp(-1, M.rippleFade)).toBe(0);
  });
  test("it ends by itself after its life", () => {
    const s = new FlowState(M);
    s.poke(0.5, 0.5);
    run(s, M.rippleLife + 0.2);
    expect(s.ripple.age).toBe(-1);
  });
});

describe("droplets on a big moment", () => {
  test("a big moment throws some drops up, and gravity brings them down", () => {
    const d = new Droplets(() => 0.5);
    d.spawn(10, 80, 60);
    expect(d.list.length).toBe(10);
    const y0 = d.list[0].y, vy0 = d.list[0].vy;
    d.step(1 / 60);
    expect(d.list[0].vy).toBeGreaterThan(vy0);
    expect(d.list[0].y).not.toBe(y0);
  });
  test("every drop is gone within a second or two", () => {
    const d = new Droplets(Math.random);
    d.spawn(20, 80, 60);
    for (let i = 0; i < 180; i++) d.step(1 / 60);
    expect(d.list.length).toBe(0);
  });
  test("there are never more than a few at once", () => {
    const d = new Droplets(Math.random);
    for (let i = 0; i < 10; i++) d.spawn(20, 0, 0);
    expect(d.list.length).toBeLessThanOrEqual(32);
  });
  test("the state makes some on a big moment, and none with less motion", () => {
    const s = new FlowState(M, "look", () => 0.5);
    s.big("full");
    expect(s.drops.list.length).toBeGreaterThan(5);
    const c = new FlowState(M, "look", () => 0.5);
    c.big("calm");
    expect(c.drops.list.length).toBe(0);
  });
});

describe("less motion: no wobble, no dissolve, just a crossfade", () => {
  test("a poke, a speed and a big moment do nothing", () => {
    const s = new FlowState(M);
    s.poke(0.5, 0.5); s.setVelocity(500, 500); s.big("calm");
    run(s, 0.5, "calm");
    expect(s.squash.x).toBe(0);
    expect(s.lag.x).toBe(0);
    expect(s.ripple.age).toBe(-1);
    expect(s.uniforms("calm")).toMatchObject({ wobble: 0, shimmer: 0, calm: 1, sq: 0 });
  });
  test("a new pose is a plain crossfade that is quicker than the dissolve", () => {
    expect(M.calmFadeS).toBeLessThan(M.dissolveS);
    const s = new FlowState(M, "look");
    s.setPose("idea", "calm");
    s.step(1 / 60, "calm");
    expect(s.squash.x).toBe(0);
    run(s, M.calmFadeS + 0.05, "calm");
    expect(s.mix).toBe(1);
  });
  test("switching to less motion in the middle of a wobble stills it at once", () => {
    const s = new FlowState(M);
    s.poke(0.5, 0.5); s.setVelocity(400, 0);
    run(s, 0.3, "full");
    s.step(1 / 60, "calm");
    expect(s.squash.x).toBe(0);
    expect(s.lag.x).toBe(0);
    expect(s.ripple.age).toBe(-1);
    expect(s.drops.list.length).toBe(0);
  });
  test("with nothing changing it asks for no frames at all (the picture is still)", () => {
    const s = new FlowState(M);
    run(s, 0.3, "calm");
    expect(s.isActive("calm")).toBe(false);
    s.setPose("idea", "calm");
    expect(s.isActive("calm")).toBe(true);
  });
});

describe("how often it draws", () => {
  test("full motion at rest breathes at the quiet rate; touched or changing, at the full rate", () => {
    const s = new FlowState(M);
    run(s, 4);
    expect(s.isActive("full")).toBe(false);
    expect(frameGap(s, "full", M)).toBeCloseTo(1 / M.idleFps, 5);
    s.poke(0.5, 0.5);
    expect(s.isActive("full")).toBe(true);
    expect(frameGap(s, "full", M)).toBeCloseTo(1 / M.activeFps, 5);
  });
  test("a window being dragged is active", () => {
    const s = new FlowState(M);
    s.setVelocity(300, 0);
    run(s, 0.2);
    expect(s.isActive("full")).toBe(true);
  });
  test("less motion: nothing to draw means never", () => {
    const s = new FlowState(M);
    expect(frameGap(s, "calm", M)).toBe(Infinity);
  });
});

describe("each state has its own way of moving", () => {
  test("every state has a profile, and the profiles tell the states apart", () => {
    const states = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];
    const seen = new Set(states.map((s) => JSON.stringify(stateProfile(s))));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
  test("asleep moves least; working and waiting for you move most", () => {
    expect(stateProfile("off").wobble).toBeLessThan(stateProfile("idle").wobble);
    expect(stateProfile("working").bob).toBeGreaterThan(stateProfile("idle").bob);
    expect(stateProfile("needsYou").bob).toBeGreaterThan(stateProfile("idle").bob);
  });
  test("an unknown state moves like the usual one", () => {
    expect(stateProfile("whatever")).toEqual(stateProfile("idle"));
  });
  test("an error droops a little and does not shake", () => {
    expect(stateProfile("error").droop).toBeGreaterThan(0);
    expect(stateProfile("error").wobble).toBeLessThanOrEqual(stateProfile("idle").wobble);
  });
});

describe("what the shader is given", () => {
  test("every number is finite, in every mode", () => {
    const s = new FlowState(M);
    s.poke(0.4, 0.4); s.setVelocity(300, -200); s.setPose("idea", "full");
    run(s, 0.3);
    for (const mode of ["full", "calm"] as const) {
      const u = s.uniforms(mode);
      for (const v of [u.t, u.sq, u.lagX, u.lagY, u.mix, u.calm, u.wobble, u.shimmer, ...u.rip]) expect(Number.isFinite(v)).toBe(true);
    }
  });
  test("the clock does not grow without end (float precision in the shader)", () => {
    const s = new FlowState(M);
    s.t = 1e7;
    s.step(1 / 60, "full");
    expect(s.uniforms("full").t).toBeLessThan(1000);
  });
});
