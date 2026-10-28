// The character as a whole, without a screen: what it does when the app and the pointer act on it.
import { describe, expect, test } from "bun:test";
import { BODY_RADIUS, FlowflowEngine, FOLLOW_HOLD, gazeOf, HOP_EVERY, LOOK_HOLD, PUSH_MAX } from "./engine.ts";
import { MAX_DROPLETS } from "./particles.ts";

const run = (e: FlowflowEngine, s: number, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) e.update(dt); };

describe("it only reflects what really happened", () => {
  test("a fresh character is calm, with no ripple, no drop and no success or error", () => {
    const e = new FlowflowEngine(); run(e, 6);
    expect(e.behavior.state).toBe("idle"); expect(e.ripples.alive).toBe(0); expect(e.behavior.look.glow).toBeLessThan(0.01); expect(e.behavior.look.cloud).toBeLessThan(0.01);
  });
  test("done: it brightens, sends a ripple and a few drops out, then settles", () => {
    const e = new FlowflowEngine(); run(e, 1); e.applyApp("done"); run(e, 0.2);
    expect(e.behavior.state).toBe("success"); expect(e.ripples.alive).toBeGreaterThan(0); expect(e.droplets.alive).toBeGreaterThan(0);
    run(e, 6); expect(e.behavior.state).toBe("idle"); expect(e.ripples.alive).toBe(0);
  });
  test("an error clouds the water and wobbles, but less than a success", () => {
    const a = new FlowflowEngine(), b = new FlowflowEngine(); run(a, 1); run(b, 1); a.applyApp("error"); b.applyApp("done");
    let wa = 0, wb = 0; for (let t = 0; t < 1; t += 1 / 60) { wa = Math.max(wa, Math.abs(a.update(1 / 60).pose.wobble2)); wb = Math.max(wb, Math.abs(b.update(1 / 60).pose.wobble2)); }
    run(a, 3); expect(a.behavior.look.cloud).toBeGreaterThan(0.6); expect(wa).toBeLessThan(wb);
  });
  test("the same state again does not repeat the reaction", () => {
    const e = new FlowflowEngine(); e.applyApp("done"); run(e, 6); e.applyApp("done"); run(e, 0.3); expect(e.ripples.alive).toBe(0);
  });
});

describe("the pointer", () => {
  test("the eyes follow the pointer and the body leans after it, with inertia", () => {
    const e = new FlowflowEngine(); run(e, 0.5); e.pointer(0.9, 0.3); const s = e.update(1 / 60);
    expect(Math.abs(s.pose.x)).toBeLessThan(0.05);
    for (let t = 0; t < 1.5; t += 1 / 60) { e.pointer(0.9, 0.3); e.update(1 / 60); }   // a cursor that keeps reporting where it is
    const t = e.update(1 / 60); expect(t.eyes.lx).toBeGreaterThan(0.3); expect(t.pose.x).toBeGreaterThan(0.1); expect(t.state).toBe("following");
  });
  test("it stops following and looking after a while, and returns", () => {
    const e = new FlowflowEngine(); e.pointer(0.9, 0); run(e, LOOK_HOLD + 4);
    expect(e.behavior.state).toBe("idle"); expect(Math.abs(e.body.pose.x)).toBeLessThan(0.05);
  });
  test("a pointer that leaves sends the body home", () => { const e = new FlowflowEngine(); e.pointer(1, 1); run(e, 1); e.pointerLeft(); run(e, 6); expect(Math.abs(e.body.pose.x)).toBeLessThan(0.02); });
  test("a nonsense pointer changes nothing", () => { const e = new FlowflowEngine(); e.pointer(NaN, 0); e.pointer(0, Infinity); run(e, 0.2); expect(e.behavior.state).toBe("idle"); });
  test("the eyes keep following while the app is busy, and busy work is not interrupted by the pointer", () => {
    const e = new FlowflowEngine(); e.applyApp("working"); e.pointer(1, 0); run(e, 0.5); expect(e.behavior.state).toBe("working");
  });
  test("the body never leaves the frame, however far the pointer", () => {
    const e = new FlowflowEngine(); e.followRange = 5; e.setFrame(1.2, 1.0); e.pointer(1, 1); run(e, 4);
    expect(Math.abs(e.body.pose.x)).toBeLessThanOrEqual(1.2 - BODY_RADIUS * 1.08 + 1e-6); expect(Math.abs(e.body.pose.y)).toBeLessThanOrEqual(1.0 - BODY_RADIUS * 1.08 + 1e-6);
  });
  test("the follow hold is longer than the time between pointer events at 60 a second", () => { expect(FOLLOW_HOLD).toBeGreaterThan(1 / 30); });
});

describe("touch", () => {
  test("a touch squishes at the point, ripples out, and returns to what it was doing", () => {
    const e = new FlowflowEngine(); e.applyApp("working"); run(e, 1); e.touch(0.3, 0.1); run(e, 0.1);
    expect(e.behavior.state).toBe("interacting"); expect(e.body.pose.contact).toBeGreaterThan(0.01); expect(e.ripples.alive).toBeGreaterThan(0);
    run(e, 6); expect(e.behavior.state).toBe("working"); expect(e.body.pose.contact).toBeLessThan(0.003); expect(e.ripples.alive).toBe(0);
  });
});

describe("limits and stability", () => {
  test("droplets and ripples never pass their caps, whatever happens", () => {
    const e = new FlowflowEngine(); for (let i = 0; i < 200; i++) { e.touch(0.3, 0.1); e.applyApp(i % 2 ? "done" : "idle"); run(e, 0.05); e.pointer(Math.sin(i), Math.cos(i)); }
    expect(e.droplets.alive).toBeLessThanOrEqual(MAX_DROPLETS); expect(e.ripples.alive).toBeLessThanOrEqual(4);
  });
  test("a suspended frame and bad times leave it sane", () => {
    const e = new FlowflowEngine(); e.pointer(1, 0); e.update(1000); e.update(NaN); e.update(-5);
    const s = e.update(1 / 60); for (const v of Object.values(s.pose)) expect(Number.isFinite(v)).toBe(true);
  });
  test("the same run twice gives the same character (no hidden randomness)", () => {
    const go = () => { const e = new FlowflowEngine({}, 5); e.pointer(0.5, 0.2); run(e, 2); e.applyApp("done"); run(e, 3); return JSON.stringify([e.body.pose.x, e.body.pose.stretch, e.face.eyes.open, e.droplets.alive, e.behavior.look.glow]); };
    expect(go()).toBe(go());
  });
  test("reduced motion: one still pose in the state's own look, nothing sliding", () => {
    const e = new FlowflowEngine(); e.applyApp("error"); const s = e.still(); expect(s.look.cloud).toBeCloseTo(0.8, 5); expect(s.pose.x).toBe(0);
  });
  test("dials reach the body and the ripples", () => {
    const e = new FlowflowEngine(); e.setTuning({ ripple: 0 }); e.touch(0, 0); expect(e.ripples.alive).toBe(0);
    e.setTuning({ ripple: 1, stiffness: 2 }); expect(e.tune.stiffness).toBe(2);
  });
});

describe("alive on the side (M20)", () => {
  test("a pointer anywhere on the screen: the eyes look that way, a little when near, fully when far, never past their edge", () => {
    expect(gazeOf(0, 0)).toEqual({ nx: 0, ny: 0 });
    const near = gazeOf(40, 0), far = gazeOf(2000, 0);
    expect(near.nx).toBeGreaterThan(0); expect(far.nx).toBeGreaterThan(near.nx); expect(far.nx).toBeLessThanOrEqual(1);
    expect(gazeOf(0, -500).ny).toBeGreaterThan(0);   // above on the screen is up for the eyes
    expect(gazeOf(NaN, 3)).toEqual({ nx: 0, ny: 0 });
    const e = new FlowflowEngine(); run(e, 0.5);
    for (let t = 0; t < 1; t += 1 / 60) { e.gaze(-900, 0); e.update(1 / 60); }
    expect(e.update(1 / 60).eyes.lx).toBeLessThan(-0.2);
  });
  test("its window moving: the water lags behind, never too far, then catches up, squashing and wobbling as it settles", () => {
    const e = new FlowflowEngine(); run(e, 0.5);
    for (let t = 0; t < 0.3; t += 1 / 60) { e.push(-1400, 0); e.update(1 / 60); }   // the window moves left, fast
    const lag = e.body.pose.x;
    expect(lag).toBeGreaterThan(0.1); expect(lag).toBeLessThanOrEqual(PUSH_MAX * 1.15);   // a spring overshoots a little, never runs away
    e.push(0, 0);
    let wob = 0; for (let t = 0; t < 1.2; t += 1 / 60) wob = Math.max(wob, Math.abs(e.update(1 / 60).pose.wobble2));
    expect(wob).toBeGreaterThan(0);
    run(e, 5); expect(Math.abs(e.body.pose.x)).toBeLessThan(0.02); expect(e.body.settled).toBe(true);
  });
  test("coming in from the edge makes a splash, a ripple and drops", () => {
    const e = new FlowflowEngine(); run(e, 0.5); e.arrive(1); run(e, 0.1);
    expect(e.ripples.alive).toBeGreaterThan(0); expect(e.droplets.alive).toBeGreaterThan(0);
  });
  test("Lively: with nothing happening it hops now and then; never when not Lively, and not while it is followed", () => {
    const calm = new FlowflowEngine(); run(calm, HOP_EVERY[1] + 6); expect(calm.ripples.alive).toBe(0);
    const lively = new FlowflowEngine(); lively.lively = true;
    let hopped = false; for (let t = 0; t < HOP_EVERY[1] + 6; t += 1 / 60) { lively.update(1 / 60); if (lively.body.pose.y > 0.08) hopped = true; }
    expect(hopped).toBe(true);
    const followed = new FlowflowEngine(); followed.lively = true;
    let up = false; for (let t = 0; t < HOP_EVERY[1] + 6; t += 1 / 60) { followed.pointer(0.5, 0); followed.update(1 / 60); if (followed.body.pose.y > 0.08) up = true; }
    expect(up).toBe(false);
  });
});
