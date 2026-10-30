import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { RESTING_FRAME_MS, RING_FRAGMENT, rgb, ringNext, ringStretch, voiceEnvelope } from "./follow.ts";

describe("the water ring around the pointer (M37)", () => {
  test("it keeps its ring shape: no stretch when slow, a gentle one along the way it moves when fast, never more than a third", () => {
    expect(ringStretch(0, 0)).toEqual({ x: 0, y: 0 });
    expect(ringStretch(40, 10)).toEqual({ x: 0, y: 0 });
    const fast = ringStretch(1100, 0);
    expect(fast.x).toBeCloseTo(1100 / 4000, 5); expect(fast.y).toBeCloseTo(0, 5);
    expect(Math.hypot(ringStretch(9000, 9000).x, ringStretch(9000, 9000).y)).toBeCloseTo(0.35, 5);
    expect(ringStretch(0, 1100).y).toBeLessThan(0);   // the page's y points up
    expect(ringStretch(NaN, 3)).toEqual({ x: 0, y: 0 });
  });
  test("water colours become numbers the shader takes", () => {
    expect(rgb("#FF0080")).toEqual([1, 0, 128 / 255]);
    expect(rgb("nope")).toEqual([0.35, 0.82, 1]);
  });
  test("it is a ring centred on the pointer, drawn live, calm with Reduce motion", () => {
    const page = readFileSync(new URL("./follow.ts", import.meta.url), "utf8");
    expect(RING_FRAGMENT).toContain("sdTorus");
    expect(page).toContain("const calm = still();");
    // Battery: every refresh only while it moves; at rest in Lively a slower timer; otherwise nothing (ringNext below).
    expect(page).toContain("window.setTimeout(() => frame(performance.now()), n.ms)");
    const html = readFileSync(new URL("../follow.html", import.meta.url), "utf8");
    expect(html).toContain('<canvas class="ring" id="d"');
    expect(html).not.toMatch(/\.(png|jpe?g|gif|svg)\b/);
  });
  test("its page only listens, in the water's colours, and is built with the others", () => {
    const page = readFileSync(new URL("./follow.ts", import.meta.url), "utf8");
    expect(page).not.toContain("invoke(");
    expect(page).toContain('listen("follow-move"');
    expect(page).toContain("WATER_TINTS[waterOf(p.water)]");
    expect(readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8")).toContain('follow: resolve(__dirname, "follow.html")');
    const cap = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/overlay.json", import.meta.url), "utf8"));
    expect(cap.windows).toContain("follow");
    expect(cap.permissions).toEqual(["core:event:allow-listen", "core:event:allow-unlisten"]);
  });
  test("it breathes with the voice: up fast as you speak, down gently, still in a quiet room (M39)", () => {
    let v = 0;
    for (let i = 0; i < 6; i++) v = voiceEnvelope(v, 0.5, 1 / 60);
    expect(v).toBeGreaterThan(0.7);
    const loud = v;
    v = voiceEnvelope(v, 0, 1 / 60);
    expect(v).toBeGreaterThan(loud * 0.85);   // a pause between words does not drop it at once
    let q = 0; for (let i = 0; i < 60; i++) q = voiceEnvelope(q, 0.015, 1 / 60);
    expect(q).toBe(0);
    expect(voiceEnvelope(0.4, NaN, 1 / 60)).toBeLessThan(0.4);
    expect(RING_FRAGMENT).toContain("uVoice");
  });
});

// M46 (F28): the ring shows at rest only in Lively, and while listening in every choice (the shell decides, follow.rs
// shown). This page draws only while shown, and outside Lively schedules nothing at rest.
describe("the ring page stops when it is put away (M46)", () => {
  const base = { shown: true, reduced: false, lively: false, moving: false, pulsing: false, voice: false };
  test("hidden, nothing is scheduled, whatever else is going on", () => {
    for (const k of ["reduced", "lively", "moving", "pulsing", "voice"] as const) expect(ringNext({ ...base, shown: false, [k]: true }), k).toEqual({ kind: "none" });
  });
  test("at rest outside Lively it schedules nothing; in Lively its slow timer", () => {
    expect(ringNext(base)).toEqual({ kind: "none" });
    expect(ringNext({ ...base, lively: true })).toEqual({ kind: "timer", ms: RESTING_FRAME_MS });
  });
  test("moving, pulsing or hearing a voice: the next refresh, in every choice", () => {
    for (const k of ["moving", "pulsing", "voice"] as const) for (const lively of [false, true]) expect(ringNext({ ...base, lively, [k]: true })).toEqual({ kind: "frame" });
  });
  test("with Reduce motion or Less motion it is drawn still; outside Lively not even a timer", () => {
    expect(ringNext({ ...base, reduced: true, voice: true })).toEqual({ kind: "none" });
    expect(ringNext({ ...base, reduced: true, lively: true })).toEqual({ kind: "timer", ms: 250 });
  });
  test("the page listens for show and hide, starts with nothing drawn, and freezes its small waves outside Lively", () => {
    const page = readFileSync(new URL("./follow.ts", import.meta.url), "utf8");
    expect(page).toContain('void listen("follow-hide", () => { shown = false; halt(); });');
    expect(page).toContain('void listen("follow-show"');
    expect(page).toContain("let shown = false, lively = false;");
    expect(page).toContain("if (lively && !calm) waves += dt;");
    expect(RING_FRAGMENT).toContain("sin(a * 3.0 + uW * 2.6)");
    expect(RING_FRAGMENT).toContain("uVoice * (0.018 * sin(a * 6.0 - uT * 9.0)");   // the voice still ripples it
    const main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
    expect(main).toContain('app.emit_to("follow", "follow-show", json!({ "water": water, "lively": lively }))');
    expect(main).toContain('app.emit_to("follow", "follow-hide", json!({}))');
  });
  test("the line beside the pointer is a flat near black card in the system font", () => {
    const html = readFileSync(new URL("../follow.html", import.meta.url), "utf8");
    expect(html).toContain("background:#141416;color:#fff");
    expect(html).not.toContain("linear-gradient");
    expect(html).not.toContain("inset 0 1px 0 #fff");
    expect(html).toContain('-apple-system,"SF Pro Text",system-ui');
  });
});
