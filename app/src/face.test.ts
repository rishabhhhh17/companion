// Every state has its own face, and the character goes still when nothing is happening.
import { describe, expect, test } from "bun:test";
import { faceFor, settled, SETTLE_MS } from "./face.ts";
import type { CharacterState } from "./model.ts";

const ALL: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];

describe("a face for every state", () => {
  test("no two states look the same", () => {
    const seen = new Set(ALL.map((s) => JSON.stringify(faceFor(s))));
    expect(seen.size).toBe(ALL.length);
  });
  test("needing you is amber, done is green, stuck and off are grey", () => {
    expect(faceFor("needsYou").ring).toBe("amber");
    expect(faceFor("done").ring).toBe("ok");
    expect(faceFor("error").grey).toBe(true);
    expect(faceFor("off").grey).toBe(true);
    expect(faceFor("working").grey).toBe(false);
  });
  test("listening shows sound rings, thinking shows dots", () => {
    expect(faceFor("listening").extra).toBe("rings");
    expect(faceFor("thinking").extra).toBe("dots");
  });
});

describe("light on battery", () => {
  test("ready, done, stuck and off settle after a while", () => {
    for (const s of ["idle", "done", "error", "off"] as const) {
      expect(settled(s, SETTLE_MS - 1)).toBe(false);
      expect(settled(s, SETTLE_MS)).toBe(true);
    }
  });
  test("work in progress and anything that needs the person never settle", () => {
    for (const s of ["listening", "thinking", "working", "checking", "needsYou"] as const) expect(settled(s, 10 * SETTLE_MS)).toBe(false);
  });
});
