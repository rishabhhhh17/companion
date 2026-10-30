// Flowflow's moods: every change has a real cause, every change is smooth, and any change may interrupt another.
import { describe, expect, test } from "bun:test";
import { BEHAVIOR_STATES, Behavior, FLASH_SECONDS, LOOKS, LOOK_KEYS, NEEDS_PULSES, PULSE_SECONDS, fromApp } from "./behavior.ts";
import type { CharacterState } from "../model.ts";

const APP: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];
const settle = (b: Behavior, seconds = 3) => { for (let t = 0; t < seconds; t += 1 / 60) b.update(1 / 60); };

describe("what the app's state means", () => {
  test("every state the app can report has a mood", () => { for (const s of APP) expect(BEHAVIOR_STATES).toContain(fromApp(s).base); });
  test("off sleeps, work works, an error is an error, and done is a flash of success that settles to calm", () => {
    expect(fromApp("off").base).toBe("sleeping"); expect(fromApp("working").base).toBe("working"); expect(fromApp("thinking").base).toBe("working");
    expect(fromApp("checking").base).toBe("working"); expect(fromApp("error").base).toBe("error");
    expect(fromApp("done")).toEqual({ base: "idle", flash: "success" });
    expect(fromApp("listening").base).toBe("curious");
    // M46: needs you is its own mood (amber, eyes forward), never the same as listening.
    expect(fromApp("needsYou").base).toBe("needsYou"); expect(fromApp("needsYou").base).not.toBe(fromApp("listening").base);
  });
});

describe("success and error come only from what happened", () => {
  test("a fresh Flowflow is calm: no success, no error, until the app says so", () => {
    const b = new Behavior(); settle(b, 10);
    expect(b.state).toBe("idle"); expect(b.look.glow).toBeLessThan(0.01); expect(b.look.cloud).toBeLessThan(0.01);
  });
  test("the same app state twice does nothing the second time", () => {
    const b = new Behavior(); b.applyApp("done"); expect(b.takeEntered()).toBe("success"); b.applyApp("done"); expect(b.takeEntered()).toBeNull();
  });
  test("success brightens and expands, then settles back by itself", () => {
    const b = new Behavior(); b.applyApp("done");
    for (let t = 0; t < 0.6; t += 1 / 60) b.update(1 / 60);
    expect(b.state).toBe("success"); expect(b.look.glow).toBeGreaterThan(0.6); expect(b.look.expand).toBeGreaterThan(0.03);
    settle(b, FLASH_SECONDS.success + 2);
    expect(b.state).toBe("idle"); expect(b.look.glow).toBeLessThan(0.05); expect(b.look.expand).toBeLessThan(0.01);
  });
  test("an error clouds and darkens, holds while the app is in error, and clears when the app moves on", () => {
    const b = new Behavior(); b.applyApp("error"); settle(b, 3);
    expect(b.state).toBe("error"); expect(b.look.cloud).toBeGreaterThan(0.6); expect(b.look.glow).toBeLessThan(0.05);
    settle(b, 10); expect(b.look.cloud).toBeGreaterThan(0.6);
    b.applyApp("idle"); settle(b, 3); expect(b.look.cloud).toBeLessThan(0.05);
  });
  test("success and error look different from each other and from idle", () => {
    const d = (a: keyof typeof LOOKS, b: keyof typeof LOOKS) => LOOK_KEYS.reduce((s, k) => s + Math.abs(LOOKS[a][k] - LOOKS[b][k]), 0);
    expect(d("success", "error")).toBeGreaterThan(1); expect(d("success", "idle")).toBeGreaterThan(0.5); expect(d("error", "idle")).toBeGreaterThan(0.5);
  });
});

describe("smooth and interruptible", () => {
  test("a change slides in: nothing jumps in one frame", () => {
    const b = new Behavior(); settle(b); const before = { ...b.look };
    b.applyApp("error"); b.update(1 / 60);
    for (const k of LOOK_KEYS) expect(Math.abs(b.look[k] - before[k]), k).toBeLessThan(0.2 * (Math.abs(LOOKS.error[k] - before[k]) + 0.05) + 0.05);
  });
  test("a new state interrupts a flash part way and the look keeps moving toward it", () => {
    const b = new Behavior(); b.applyApp("done"); for (let t = 0; t < 0.5; t += 1 / 60) b.update(1 / 60);
    b.applyApp("error");
    expect(b.state).toBe("error"); settle(b, 3); expect(b.look.cloud).toBeGreaterThan(0.6); expect(b.look.glow).toBeLessThan(0.05);
  });
  test("a touch squishes, interrupts anything, and then hands back to what it was doing", () => {
    const b = new Behavior(); b.applyApp("working"); settle(b);
    b.touch(); expect(b.state).toBe("interacting"); expect(b.takeEntered()).toBe("interacting");
    settle(b, FLASH_SECONDS.interacting + 1.5); expect(b.state).toBe("working");
  });
  test("a touch wakes a sleeper for a moment and it goes back to sleep", () => {
    const b = new Behavior(); b.applyApp("off"); settle(b, 4); expect(b.look.eyeOpen).toBeLessThan(0.05);
    b.touch(); settle(b, 0.5); expect(b.look.eyeOpen).toBeGreaterThan(0.6);
    settle(b, FLASH_SECONDS.interacting + 4); expect(b.state).toBe("sleeping"); expect(b.look.eyeOpen).toBeLessThan(0.05);
  });
  test("only an idle Flowflow follows the pointer: it never leaves work, an alert or sleep to chase it", () => {
    const b = new Behavior(); b.setFollowing(true); expect(b.state).toBe("following"); b.setFollowing(false); expect(b.state).toBe("idle");
    for (const app of ["working", "error", "off", "needsYou"] as CharacterState[]) { const c = new Behavior(); c.applyApp(app); const s = c.state; c.setFollowing(true); expect(c.state, app).toBe(s); }
  });
  test("snap jumps straight to the state's look (reduced motion)", () => {
    const b = new Behavior(); b.applyApp("error"); b.snap(); for (const k of LOOK_KEYS) expect(b.look[k]).toBe(LOOKS.error[k]);
  });
  test("no time passing changes nothing, and a bad time is ignored", () => {
    const b = new Behavior(); b.applyApp("error"); const l = { ...b.look }; b.update(0); b.update(NaN); b.update(-1); expect(b.look).toEqual(l);
  });
});

describe("needs you (M46)", () => {
  test("an amber core, the eyes straight ahead, three pulses, then it holds steady", () => {
    expect(LOOKS.needsYou.amber).toBe(1); expect(LOOKS.needsYou.gazeGain).toBe(0);
    for (const st of BEHAVIOR_STATES) if (st !== "needsYou") expect(LOOKS[st].amber, st).toBe(0);
    const b = new Behavior(); b.applyApp("needsYou");
    expect(b.state).toBe("needsYou"); expect(b.pulsesDone).toBe(false);
    let peaks = 0, was = 0, rising = false;
    for (let t = 0; t < NEEDS_PULSES * PULSE_SECONDS + 3; t += 1 / 60) {
      b.update(1 / 60);
      const p = b.pulse;
      if (rising && p < was) peaks++;
      rising = p > was; was = p;
    }
    expect(peaks).toBe(NEEDS_PULSES);
    expect(b.pulse).toBe(0); expect(b.pulsesDone).toBe(true); expect(b.look.amber).toBeGreaterThan(0.95);
  });
  test("each new time it needs you pulses again; other states never pulse", () => {
    const b = new Behavior(); b.applyApp("needsYou"); settle(b, 6); expect(b.pulsesDone).toBe(true);
    b.applyApp("working"); expect(b.pulsesDone).toBe(true); expect(b.pulse).toBe(0);
    b.applyApp("needsYou"); b.update(0.3); expect(b.pulsesDone).toBe(false); expect(b.pulse).toBeGreaterThan(0);
  });
});
