import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CUES, gainOf, lengthOf, play, VOLUMES, wantSound, type Cue } from "./sound.ts";

const reg = JSON.parse(readFileSync(new URL("../../protocol/settings.json", import.meta.url), "utf8")) as { settings: { key: string; default: unknown }[] };

describe("sounds", () => {
  test("off unless turned on, and never while a call app is in front", () => {
    expect(reg.settings.find((s) => s.key === "sound.on")!.default).toBe(false);
    expect(wantSound(undefined, false)).toBe(false);
    expect(wantSound(true, false)).toBe(true);
    expect(wantSound(true, true)).toBe(false);
  });
  test("every cue is short and gentle, and louder means louder", () => {
    for (const c of Object.keys(CUES) as Cue[]) expect(lengthOf(c), c).toBeLessThan(0.6);
    expect(VOLUMES.soft).toBeLessThan(VOLUMES.usual); expect(VOLUMES.usual).toBeLessThan(VOLUMES.loud);
    expect(VOLUMES.loud).toBeLessThanOrEqual(0.4);
    expect(gainOf("odd")).toBe(VOLUMES.soft);
  });
  test("plays each tone with a fade in and out, and a Mac with no audio stays silent instead of failing", () => {
    const made: string[] = [];
    const param = () => ({ setValueAtTime: () => made.push("set"), exponentialRampToValueAtTime: () => made.push("ramp") });
    const ctx = { currentTime: 0, destination: {}, createOscillator: () => ({ type: "", frequency: param(), connect: () => {}, start: () => made.push("start"), stop: () => made.push("stop") }), createGain: () => ({ gain: param(), connect: () => {} }) };
    play("done", "usual", () => ctx);
    expect(made.filter((x) => x === "start").length).toBe(CUES.done.length);
    expect(() => play("drop", "soft", () => { throw new Error("no audio"); })).not.toThrow();
  });
  test("the character's page plays them, asking first whether to be quiet", () => {
    const dock = readFileSync(new URL("./dock.tsx", import.meta.url), "utf8");
    expect(dock).toContain("const cue = (c: Cue) =>");
    expect(dock).toContain('invoke("quiet_now")');
    expect(dock).toContain('cue("drop")'); expect(dock).toContain('cue("catch")');
  });
});
