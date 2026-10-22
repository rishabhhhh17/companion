// The character's pictures: which one shows for each state, and that the files are what the code expects.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POSES, poseFor, poseUrl, type Pose } from "./characters.ts";
import type { CharacterState } from "./model.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(here, "..", "public", "characters", "water");
const STATES: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];

describe("which picture shows", () => {
  test("every state has one, and it is a pose we have", () => {
    for (const s of STATES) expect(POSES).toContain(poseFor(s));
  });
  test("the states tell apart: each working state has its own picture", () => {
    const own: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];
    const shown = own.map((s) => poseFor(s));
    // listening and idle may share nothing else: the ring tells them apart, but the pictures differ too
    expect(new Set(shown).size).toBe(own.length);
  });
  test("error is a quiet 'uh oh', never a sad or angry face", () => {
    expect(poseFor("error")).toBe("worry");
    for (const p of POSES) expect(p).not.toMatch(/sad|angry|cry|mad/);
  });
  test("working: the laptop. checking: the magnifier. thinking: the bulb. needs you: the wave. done: the splash", () => {
    expect(poseFor("working")).toBe("laptop");
    expect(poseFor("checking")).toBe("magnify");
    expect(poseFor("thinking")).toBe("idea");
    expect(poseFor("needsYou")).toBe("wave");
    expect(poseFor("done")).toBe("splash");
  });
  test("a trip across the screen swims, but only when nothing else needs showing", () => {
    expect(poseFor("idle", { roam: "travel" })).toBe("swim");
    expect(poseFor("idle", { roam: "return" })).toBe("swim");
    expect(poseFor("idle", { roam: "settle" })).toBe("look");
    expect(poseFor("working", { roam: "travel" })).toBe("laptop");
    expect(poseFor("needsYou", { roam: "travel" })).toBe("wave");
    expect(poseFor("off", { roam: "travel" })).toBe("sleep");
  });
  test("a cheer or a party splashes, but never hides that something waits for you or that the screen is being looked at", () => {
    expect(poseFor("idle", { react: "cheer" })).toBe("splash");
    expect(poseFor("idle", { react: "party" })).toBe("splash");
    expect(poseFor("idle", { react: "nod" })).toBe("look");
    expect(poseFor("needsYou", { react: "party" })).toBe("wave");
    expect(poseFor("checking", { react: "cheer" })).toBe("magnify");
    expect(poseFor("listening", { react: "cheer" })).toBe("glance");
    expect(poseFor("off", { react: "party" })).toBe("sleep");
  });
  test("an unknown trip or reaction changes nothing", () => {
    expect(poseFor("idle", { roam: "sideways", react: "flip" })).toBe("look");
  });
});

describe("the picture files", () => {
  test("a file for every pose, and no stray ones (the angry and the sad pictures are not shipped)", () => {
    const files = readdirSync(FOLDER).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")).sort();
    expect(files).toEqual([...POSES].sort());
    expect(readdirSync(FOLDER).filter((f) => !f.endsWith(".png"))).toEqual([]);
  });
  test("the web address of each is relative, so the built app finds it", () => {
    for (const p of POSES) expect(poseUrl(p)).toBe(`./characters/water/${p}.png`);
  });
  const png = (p: Pose) => readFileSync(join(FOLDER, `${p}.png`));
  test("every picture is a real PNG with a see through background", () => {
    for (const p of POSES) {
      const b = png(p);
      expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(b.readUInt8(25)).toBe(6);   // colour type 6: red, green, blue and see through
    }
  });
  test("every picture is the same size, so the character never jumps between states", () => {
    const sizes = new Set(POSES.map((p) => `${png(p).readUInt32BE(16)}x${png(p).readUInt32BE(20)}`));
    expect(sizes.size).toBe(1);
  });
  test("sized for a small dock: sharp up to three times the size it is shown at, and light to load", () => {
    const w = png("look").readUInt32BE(16);
    expect(w).toBeGreaterThanOrEqual(336);
    expect(w).toBeLessThanOrEqual(512);
    for (const p of POSES) expect(statSync(join(FOLDER, `${p}.png`)).size).toBeLessThan(160 * 1024);
  });
});

describe("the dock uses them", () => {
  const dock = readFileSync(join(here, "dock.tsx"), "utf8");
  const css = readFileSync(join(here, "style.css"), "utf8");
  test("the dock shows the picture for the state, and the picture takes no clicks (the character does)", () => {
    expect(dock).toContain("poseFor(");
    expect(dock).toContain("poseUrl(");
    expect(css).toMatch(/\.character \.pose\s*\{[^}]*pointer-events:\s*none/);
  });
  test("the picture is described by the character's own words, not twice", () => {
    expect(dock).toMatch(/<img[^>]*alt=""/);
  });
  test("a lit ring for listening, checking, needs you and done still shows around the picture (rule 5: the light shows first)", () => {
    for (const s of ["listening", "checking", "needsYou", "done"]) {
      expect(css).toMatch(new RegExp(`\\.character\\[data-pose\\]\\[data-state="${s}"\\][^{]*\\{[^}]*drop-shadow`));
    }
  });
  test("thinking tilts the picture instead of spinning it upside down", () => {
    expect(css).toMatch(/\.character\[data-pose\]\[data-motion="swirl"\]\s*\{[^}]*animation:\s*tilt/);
  });
});
