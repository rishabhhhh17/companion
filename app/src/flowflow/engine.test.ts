// The character as a whole, without a screen: what it does when the app and the pointer act on it.
import { describe, expect, test } from "bun:test";
import { BODY_RADIUS, FlowflowEngine, FOLLOW_HOLD, gazeOf, LOOK_HOLD, PUSH_MAX, SWAY, SWAY_FADE_S } from "./engine.ts";
import { MAX_DROPLETS } from "./particles.ts";

const run = (e: FlowflowEngine, s: number, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) e.update(dt); };

describe("it only reflects what really happened", () => {
  test("a fresh character is calm, with no ripple, no drop and no success or error", () => {
    const e = new FlowflowEngine(); run(e, 6);
    expect(e.behavior.state).toBe("idle"); expect(e.ripples.alive).toBe(0); expect(e.behavior.look.glow).toBeLessThan(0.01); expect(e.behavior.look.cloud).toBeLessThan(0.01);
  });
  test("done: it brightens, sends a ripple, its bubbles pop into a few drops (M60), then settles", () => {
    const e = new FlowflowEngine(); run(e, 1); e.applyApp("done"); run(e, 0.2);
    expect(e.behavior.state).toBe("success"); expect(e.ripples.alive).toBeGreaterThan(0); expect(e.droplets.alive).toBe(0);
    run(e, 1.1); expect(e.droplets.alive).toBeGreaterThan(0);   // the drops come from the pops, not the moment done arrives
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
  test("the eyes follow the pointer and the body leans after it, with inertia (Lively)", () => {
    const e = new FlowflowEngine(); e.mode = "lively"; run(e, 0.5); e.pointer(0.9, 0.3); const s = e.update(1 / 60);
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
    const e = new FlowflowEngine(); e.mode = "lively"; run(e, 0.5);
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
});

// M46 (F28): no idle tricks in any choice; Still's sway fades to exactly nothing; Gentle sways slower; only Lively looks.
describe("how lively (M46)", () => {
  const modes = ["still", "gentle", "lively"] as const;
  const make = (mode: (typeof modes)[number], seed = 7) => { const e = new FlowflowEngine({}, seed); e.mode = mode; return e; };
  test("no idle trick of any kind fires over two minutes in any choice: no hop, no drop, no ripple", () => {
    for (const mode of modes) {
      const e = make(mode);
      let high = 0, drops = 0, ripples = 0;
      for (let t = 0; t < 120; t += 1 / 60) { e.update(1 / 60); high = Math.max(high, e.body.pose.y); drops = Math.max(drops, e.droplets.alive); ripples = Math.max(ripples, e.ripples.alive); }
      expect(high, mode).toBeLessThan(0.02); expect(drops, mode).toBe(0); expect(ripples, mode).toBe(0);
    }
    expect(Object.keys(new FlowflowEngine())).not.toContain("idleDone");
  });
  test("Still's sway reaches exactly 0 by 3 s, and floats and breathes not at all once it has", () => {
    const e = make("lively"); run(e, 4); expect(e.sway).toBeCloseTo(SWAY.lively.amount, 6);
    e.mode = "still";
    run(e, 3);
    expect(SWAY_FADE_S).toBeLessThanOrEqual(3);
    expect(e.sway).toBe(0);
    const s = e.update(1 / 60);
    expect(s.sway).toBe(0); expect(s.float).toBe(0); expect(s.pose.breath).toBe(0);
  });
  test("Still sways while it has news, then fades back to nothing", () => {
    const e = make("still"); e.applyApp("working"); run(e, 3); expect(e.sway).toBe(SWAY.still.amount);
    e.applyApp("idle"); run(e, 3); expect(e.sway).toBe(0);
  });
  test("Gentle sways about 0.4, its clock at half the rate; Lively at 1, today's rate", () => {
    const g = make("gentle"), l = make("lively"); run(g, 5); run(l, 5);
    expect(g.sway).toBeCloseTo(0.4, 6); expect(l.sway).toBeCloseTo(1, 6);
    const g0 = g.update(1 / 60).swayTime, l0 = l.update(1 / 60).swayTime; run(g, 2); run(l, 2);
    const gr = g.update(1 / 60).swayTime - g0, lr = l.update(1 / 60).swayTime - l0;
    expect(gr / lr).toBeCloseTo(0.5, 2);
  });
  test("the pointer and the gaze do nothing unless Lively", () => {
    for (const mode of ["still", "gentle"] as const) {
      const e = make(mode); run(e, 0.5);
      for (let i = 0; i < 60; i++) { e.gaze(400, -100); e.pointer(0.9, 0.3); e.update(1 / 60); }
      expect(Math.abs((e.face.eyes.lx + e.face.eyes.rx) / 2), mode).toBeLessThan(0.02); expect(Math.abs(e.body.pose.x), mode).toBeLessThan(0.01);
      expect(e.behavior.state, mode).toBe("idle");
    }
    const l = make("lively"); run(l, 0.5); for (let i = 0; i < 60; i++) { l.gaze(400, -100); l.update(1 / 60); }
    expect(l.face.eyes.lx).toBeGreaterThan(0.2);
  });
  test("tiny drops shed as it moves only in Lively", () => {
    const shed = (mode: (typeof modes)[number]) => { const e = make(mode); let n = 0; for (let t = 0; t < 3; t += 1 / 60) { e.push(1500, 0); e.update(1 / 60); n = Math.max(n, e.droplets.alive); } return n; };
    expect(shed("still")).toBe(0); expect(shed("gentle")).toBe(0);
  });
  test("a still frame holds needs you's amber with no pulse", () => {
    const e = make("still"); e.applyApp("needsYou"); run(e, 0.5);
    const s = e.still(); expect(s.look.amber).toBe(1); expect(s.pulse).toBe(0);
  });
});

// M37c: water clings to a surface and flattens the harder it is pushed into it, then wobbles back like water.
import { FlowflowEngine as Engine37 } from "./engine.ts";
describe("clinging and pressing (M37c)", () => {
  test("the press follows how hard it is pushed, and letting go wobbles back past nothing before it settles", () => {
    const e = new Engine37();
    e.setSurface("right", 1, 0);
    e.press(1);
    for (let i = 0; i < 90; i++) e.update(1 / 60);
    expect(e.surface.press).toBeGreaterThan(0.9);
    e.press(0);
    let lowest = 1;
    for (let i = 0; i < 60; i++) { e.update(1 / 60); lowest = Math.min(lowest, e.surface.press); }
    expect(lowest).toBeLessThan(0);          // it springs back a little past its shape, like water
    expect(lowest).toBeGreaterThanOrEqual(-0.2);
    for (let i = 0; i < 240; i++) e.update(1 / 60);
    expect(Math.abs(e.surface.press)).toBeLessThan(0.02);
  });
  test("gone in at an edge it settles flat against it at once: no spring-back, no wobble (M51)", () => {
    const e = new Engine37();
    e.setSurface("right", 1, 0.9);
    e.press(1);
    for (let i = 0; i < 90; i++) e.update(1 / 60);
    e.press(0.5, true);
    let lowest = 1, highest = 0;
    for (let i = 0; i < 120; i++) { e.update(1 / 60); lowest = Math.min(lowest, e.surface.press); highest = Math.max(highest, e.surface.press); }
    expect(lowest).toBeGreaterThanOrEqual(0.49);
    expect(highest).toBeLessThanOrEqual(0.51);
  });
  test("a surface it does not know, or numbers that are not numbers, change nothing harmful", () => {
    const e = new Engine37();
    e.setSurface("sideways" as never, NaN, 9);
    expect(e.surface).toMatchObject({ side: null, at: 1, cling: 1 });
    e.press(NaN); e.update(1 / 60);
    expect(e.surface.press).toBe(0);
    e.setSurface("below", 0.67, 0.6);
    expect(e.surface).toMatchObject({ side: "below", at: 0.67, cling: 0.6 });
  });
});

// M60 (2 Nov 2026): the orb and its two follower bubbles. The orb is round; BODY_RADIUS is its reach.
import { ORB_RADIUS, REST_Y, REST_Y_FLAT } from "./engine.ts";
import { FOLLOWER_RADII } from "./particles.ts";
describe("the orb and its followers (M60)", () => {
  const make = (mode: "still" | "gentle" | "lively" = "still") => { const e = new FlowflowEngine(); e.mode = mode; e.setFrame(1.29, 1.1); return e; };
  test("the body's reach is the orb's, with a little room to breathe and squash", () => {
    expect(BODY_RADIUS).toBeGreaterThanOrEqual(ORB_RADIUS); expect(BODY_RADIUS).toBeLessThan(ORB_RADIUS * 1.15);
    expect(ORB_RADIUS).toBeGreaterThan(0.55); expect(ORB_RADIUS).toBeLessThan(0.75);
  });
  test("a fresh character starts with its bubbles already resting beside it, and every snapshot carries them", () => {
    const e = make(); const s = e.update(1 / 60);
    expect(s.followers).toBe(e.followers); expect(e.followers.r[0]).toBeCloseTo(FOLLOWER_RADII[0], 3);
    expect(e.followers.x[0]).toBeLessThan(0); expect(e.followers.y[0]).toBeLessThan(-ORB_RADIUS * 0.5);
  });
  test("the whole character, bubbles and all, fits its frame at rest", () => {
    const e = make(); run(e, 3);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(e.followers.x[i]) + e.followers.r[i]).toBeLessThanOrEqual(1.29 + 1e-6);
      expect(e.followers.y[i] + REST_Y - e.followers.r[i]).toBeGreaterThanOrEqual(-1.1 - 1e-6);
    }
    expect(REST_Y + ORB_RADIUS).toBeLessThan(1.1);
  });
  test("working: they orbit; done: they rise and pop; failed: they sink; listening: they gather close", () => {
    const w = make(); w.applyApp("working"); let front = 0, back = 0;
    for (let t = 0; t < 9; t += 1 / 60) { w.update(1 / 60); if (w.followers.z[0] > 0.3) front++; if (w.followers.z[0] < -0.3) back++; }
    expect(front).toBeGreaterThan(0); expect(back).toBeGreaterThan(0);
    const d = make(); run(d, 2); const y = d.followers.y[0]; d.applyApp("done"); let top = -9, popped = false;
    for (let t = 0; t < 1.6; t += 1 / 60) { d.update(1 / 60); top = Math.max(top, d.followers.y[0]); if (d.followers.r[0] === 0) popped = true; }
    expect(top).toBeGreaterThan(y + 0.5); expect(popped).toBe(true);
    run(d, 4); expect(d.followers.y[0]).toBeCloseTo(y, 2); expect(d.followers.r[0]).toBeCloseTo(FOLLOWER_RADII[0], 2);
    const f = make(); run(f, 2); const fy = f.followers.y[0]; f.applyApp("error"); run(f, 3); expect(f.followers.y[0]).toBeLessThan(fy - 0.05); expect(f.followers.settled).toBe(true);
    const l = make(); run(l, 2); const ld = Math.hypot(l.followers.x[0], l.followers.y[0]); l.applyApp("listening"); run(l, 3);
    expect(Math.hypot(l.followers.x[0], l.followers.y[0])).toBeLessThan(ld - 0.05);
  });
  test("a touch while it works does not stop the orbit", () => {
    const e = make(); e.applyApp("working"); run(e, 1); const z0 = e.followers.z[0]; e.touch(0.2, 0.1); run(e, 0.5);
    expect(e.behavior.state).toBe("interacting"); expect(e.followers.z[0]).not.toBeCloseTo(z0, 3);
  });
  test("they sit perfectly still at rest in Still and Gentle, and drift a little only in Lively", () => {
    for (const mode of ["still", "gentle"] as const) { const e = make(mode); run(e, 4); const x = e.followers.x[1]; run(e, 5); expect(e.followers.x[1], mode).toBe(x); expect(e.followers.settled, mode).toBe(true); }
    const l = make("lively"); run(l, 4); const x = l.followers.x[1], y = l.followers.y[1]; let m = 0;
    for (let t = 0; t < 5; t += 1 / 60) { l.update(1 / 60); m = Math.max(m, Math.hypot(l.followers.x[1] - x, l.followers.y[1] - y)); }
    expect(m).toBeGreaterThan(0.004);
  });
  test("docked on the left edge they trail to the right, into the screen; over Home's water they stay above it", () => {
    const e = make(); e.setSurface("left", 0, 0.2); run(e, 3); expect(e.followers.x[0]).toBeGreaterThan(0); expect(e.followers.x[1]).toBeGreaterThan(0);
    const h = new FlowflowEngine(); h.setFrame(1.55, 1.1); h.setSurface("below", 0.72, 0.6); run(h, 3);
    expect(h.update(1 / 60).restY).toBe(REST_Y_FLAT);
    const water = 1.1 - 0.72 * 2.2 - REST_Y_FLAT;   // the waterline in the body's own frame
    for (let i = 0; i < 2; i++) expect(h.followers.y[i] - h.followers.r[i]).toBeGreaterThanOrEqual(water - 1e-6);
  });
  test("over Home's water the orb rests lower and peeks over it (its bubbles trail to the side, so it needs no room below)", () => {
    const e = make(); expect(e.update(1 / 60).restY).toBe(REST_Y);
    e.setSurface("below", 0.72, 0.6); const s = e.update(1 / 60);
    expect(s.restY).toBeLessThan(REST_Y);
    const water = 1.1 - 0.72 * 2.2, dip = water - (s.restY - ORB_RADIUS);   // how deep its bottom sits under the waterline
    expect(dip / ORB_RADIUS).toBeGreaterThan(0.1); expect(dip / ORB_RADIUS).toBeLessThan(0.4);
    expect(s.restY + ORB_RADIUS).toBeLessThan(1.1 - 0.2);   // and its top well inside the frame (Home masks the top of its box)
    e.setSurface("right", 1, 0.2); expect(e.update(1 / 60).restY).toBe(REST_Y);
  });
  test("moving, they trail behind it", () => {
    const e = make(); run(e, 2); const restY = e.followers.y[0];
    e.body.setTarget(0.4, 0); let lifted = -9;   // it moves right: the trail swings round behind it, to the left
    for (let t = 0; t < 0.5; t += 1 / 60) { e.update(1 / 60); lifted = Math.max(lifted, e.followers.y[0] - restY); expect(e.followers.x[0]).toBeLessThan(e.body.pose.x); }
    expect(lifted).toBeGreaterThan(0.15);
  });
  test("a still frame (less motion) shows them at rest beside it, never mid orbit or popped", () => {
    const e = make(); e.applyApp("working"); run(e, 3); e.still();
    expect(e.followers.z[0]).toBe(0); expect(e.followers.r[1]).toBe(FOLLOWER_RADII[1]); expect(e.followers.x[0]).toBeLessThan(0);
  });
});

describe("M90 review: pinned for the peek out of the notch (a 60 by 32 point window)", () => {
  const pinned = () => { const e = new FlowflowEngine(); e.pinned = true; e.mode = "lively"; return e; };
  test("proud holds its place and size, sends no drops and no bubbles, and smiles so it reads as proud at this size", () => {
    const e = pinned(); run(e, 1); e.applyReaction("proud");
    let maxMove = 0, maxExpand = -1, s = e.update(1 / 60);
    for (let t = 0; t < 3; t += 1 / 60) { s = e.update(1 / 60); maxMove = Math.max(maxMove, Math.hypot(s.pose.x, s.pose.y), Math.abs(s.float)); maxExpand = Math.max(maxExpand, s.look.expand); }
    expect(maxMove).toBeLessThan(0.01);
    expect(maxExpand).toBeLessThanOrEqual(0);
    expect(e.droplets.alive).toBe(0);
    expect(s.pinned).toBe(true);   // the renderer draws no following bubbles
    expect(s.look.mouth).toBeGreaterThan(0.5);
    expect(s.look.eyeArc).toBeGreaterThan(1);
    // Its own look is untouched: only what is drawn for the peek changes.
    expect(e.behavior.look.expand).toBeGreaterThan(0);
  });
  test("sleepy has its heavy lids but no rising bubbles, which a 32 point window would cut", () => {
    const e = pinned(); run(e, 1); e.applyReaction("sleepy"); run(e, 6);
    const s = e.update(1 / 60);
    expect(s.look.zz).toBe(0);
    expect(s.look.lid).toBeGreaterThan(0.5);
  });
  test("hello, worried and the pointer never move it either", () => {
    for (const r of ["hello", "worried", "watching"] as const) {
      const e = pinned(); run(e, 1); e.applyReaction(r); e.pointer(0.9, 0.9); e.gaze(400, 0);
      let maxMove = 0; for (let t = 0; t < 2; t += 1 / 60) { const s = e.update(1 / 60); maxMove = Math.max(maxMove, Math.hypot(s.pose.x, s.pose.y)); }
      expect(maxMove).toBeLessThan(0.01);
    }
  });
  test("not pinned (the dock, Home): proud still grows and its bubbles still show", () => {
    const e = new FlowflowEngine(); run(e, 1); e.applyReaction("proud"); run(e, 1);
    const s = e.update(1 / 60);
    expect(s.look.expand).toBeGreaterThan(0);
    expect(s.pinned ?? false).toBe(false);
  });
});
