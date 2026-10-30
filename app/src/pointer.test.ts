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

// M46: the words beside the ring live in strings.ts (rule 21), and the plain lettering is the Mac's own system face.
import { S } from "./strings.ts";
import { captionStyle, guessWords } from "./pointer.ts";
describe("the pointer's words and lettering (M46)", () => {
  test("a ring that is not exact: the caption, then the hint, as two sentences, never a run on", () => {
    expect(S.pointer.aroundHere("Open the Format menu")).toBe("Open the Format menu. Somewhere around here.");
    expect(S.pointer.aroundHere("Click Save.")).toBe("Click Save. Somewhere around here.");
    expect(S.pointer.aroundHere("Is it this one? ")).toBe("Is it this one? Somewhere around here.");
  });
  test("every word comes from S.pointer, none typed in the pages", () => {
    expect(notSureWords("Save", "Click it.")).toBe(`${S.pointer.notSure} ${S.pointer.lookFor("Save")} Click it.`);
    expect(guessWords("Save", "")).toBe(`${S.pointer.guessing} ${S.pointer.lookFor("Save")}`);
    const o = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8"), p = readFileSync(new URL("./pointer.ts", import.meta.url), "utf8");
    for (const gone of ['"Your turn: "', '" (around here)"', '"That\'s it."']) expect(o, gone).not.toContain(gone);
    expect(p).not.toContain("I am only guessing where");
    expect(o).toContain("S.pointer.yourTurn(words)");
    expect(o).toContain("S.pointer.aroundHere");
    expect(o).toContain("cap.textContent = S.pointer.done;");
  });
  test("plain captions use the system face; the caption and the talk captions in overlay.html too, with a short ease out", () => {
    expect(captionStyle("plain", "standard").font).toContain("-apple-system");
    expect(captionStyle("plain", "standard").font).not.toContain("Rounded");
    expect(captionStyle("handwritten", "standard").font).toContain("Bradley Hand");   // still a choice
    const html = readFileSync(new URL("../overlay.html", import.meta.url), "utf8");
    expect(html).not.toContain("SF Pro Rounded");
    expect(html).not.toContain("cubic-bezier(.34,1.56,.64,1)");   // no overshoot
    expect(html).toContain("transform .2s cubic-bezier(.23,1,.32,1)");
  });
  test("with Fly to the place first off, the ring lands at once: no bud, arc, trail or squash", () => {
    const o = readFileSync(new URL("./overlay.ts", import.meta.url), "utf8");
    const show = o.slice(o.indexOf("function show("), o.indexOf('void listen("overlay-point"'));
    const atOnce = show.indexOf("if (!fly) { land(); return; }");
    expect(atOnce).toBeGreaterThan(0);
    for (const flight of ["bud(", "arcAt(", "trail.push(", "LAND_MS"]) expect(show.indexOf(flight), flight).toBeGreaterThan(atOnce);
    expect(show).toContain('const fly = setting("point.fly") === true');
  });
});
