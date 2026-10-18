import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { aimDecision, flightMs, LOW_CONFIDENCE, notSureWords, RING_MS, ringMsOf } from "./pointer.ts";

describe("the pointer's flight", () => {
  test("short hops are not too quick to follow, long ones not too slow", () => {
    expect(flightMs(10)).toBe(600); expect(flightMs(800)).toBe(1000); expect(flightMs(5000)).toBe(1400);
  });
});

describe("low confidence draws nothing (F17 4.2)", () => {
  test("a confident answer is drawn, a guess is not, and a missing number counts as a guess", () => {
    expect(aimDecision(0.9)).toBe("draw");
    expect(aimDecision(LOW_CONFIDENCE)).toBe("draw");
    expect(aimDecision(LOW_CONFIDENCE - 0.01)).toBe("words");
    for (const bad of [undefined, null, "0.9", Number.NaN, -1]) expect(aimDecision(bad as never)).toBe("words");
  });
  test("the words say what to look for and never claim a place", () => {
    const w = notSureWords("Environment Variables", "It is in the sidebar.");
    expect(w).toContain("not sure");
    expect(w).toContain('Look for "Environment Variables"');
    expect(notSureWords("", "")).not.toContain("Look for");
  });
});

describe("how long a ring that does not wait stays (rule 22)", () => {
  // Found in review, 16 Oct 2026: the overlay counted its ten seconds from landing, after a flight of up to 1.6 s, while
  // the shell watched the ring (and held confetti back) for 10.5 s from the draw. The last part of the ring went unwatched.
  const overlay = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8");
  const show = overlay.slice(overlay.indexOf("function show("), overlay.indexOf('void listen("overlay-point"'));
  const land = show.slice(show.indexOf("const land ="), show.indexOf("if (reduced) { land(); return; }"));
  test("the overlay counts the ring's time from when the draw was ordered, the flight included", () => {
    expect(RING_MS).toBe(10_000);
    expect(show).toContain("if (!p.hold) timer = setTimeout(clear, ringMsOf(p.ringMs));");
    expect(show.indexOf("setTimeout(clear, ringMsOf(p.ringMs))")).toBeLessThan(show.indexOf("const land ="));
    expect(land).not.toContain("setTimeout(clear");
  });
  test("the shell watches it half a second longer than the time it sends, however long the flight", () => {
    // How long a ring stays is a setting (point.ringSeconds, 5 to 30 s); the shell sends the time with the ring and watches
    // its window for that time and half a second (anchor.rs watch_ms, tested for every value there).
    const anchor = readFileSync(new URL("../src-tauri/src/anchor.rs", import.meta.url), "utf8");
    expect(anchor).toContain("pub fn watch_ms(ring_ms: u64) -> u64 { ring_ms + 500 }");
    for (let s = 5; s <= 30; s++) expect(ringMsOf(s * 1000)).toBe(s * 1000);
    expect(flightMs(1e9, "slower")).toBeLessThan(ringMsOf(5000));   // the flight is part of the ring's time, never on top of it
  });
});
