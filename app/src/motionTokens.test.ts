// One motion system (M66 Part 1): the scripts (motionTokens.ts), the stylesheets (ui/tokens.css) and the shell
// (src-tauri/src/motion.rs) move on one table. These fail the moment the three disagree, and pin the interface spring.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DUR, DUR_COUNT, DUR_FLASH, STAGGER_LIST_MS, STAGGER_ROWS, STAGGER_ROW_MS, EASE_EXIT, EASE_EXIT_CSS, EASE_OUT, EASE_OUT_CSS, EXIT_MS, MOTION_SPRING, bezierAt, springLinear, springPath, springSettleSecs, transition } from "./motionTokens.ts";
import { TOKENS_CSS } from "./ui/cssFiles.ts";

const tokens = TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
const rust = readFileSync(new URL("../src-tauri/src/motion.rs", import.meta.url), "utf8");
/** A token's own value in :root (the first place it is written). */
const raw = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(tokens)?.[1]?.trim() ?? "";
/** A duration token in ms, following var() to the token it names. */
function ms(name: string): number {
  const v = raw(name), alias = /^var\((--[\w-]+)\)$/.exec(v);
  if (alias) return ms(alias[1]);
  const m = /^(\d*\.?\d+)(ms|s)$/.exec(v);
  if (!m) throw new Error(`${name}: ${v}`);
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
}
const rustNum = (name: string) => Number(new RegExp(`pub const ${name}: \\w+ = ([\\d.]+);`).exec(rust)?.[1]);
const rustCurve = (name: string) => new RegExp(`pub const ${name}: \\[f32; 4\\] = \\[([^\\]]+)\\];`).exec(rust)?.[1]?.split(",").map(Number);

describe("the three copies of the table agree", () => {
  test("the four durations", () => {
    expect([ms("--dur-1"), ms("--dur-2"), ms("--dur-3"), ms("--dur-4")]).toEqual([DUR[1], DUR[2], DUR[3], DUR[4]]);
    expect([rustNum("DUR_1_MS"), rustNum("DUR_2_MS"), rustNum("DUR_3_MS"), rustNum("DUR_4_MS")]).toEqual([DUR[1], DUR[2], DUR[3], DUR[4]]);
    expect([DUR[1], DUR[2], DUR[3], DUR[4]]).toEqual([120, 200, 240, 320]);
    expect([ms("--dur-count"), ms("--dur-flash")]).toEqual([DUR_COUNT, DUR_FLASH]);
  });
  test("M73: the rows' stagger and the list's wait after the lead, and the whole stagger stays under 100 ms", () => {
    expect([ms("--stagger-row"), ms("--stagger-list")]).toEqual([STAGGER_ROW_MS, STAGGER_LIST_MS]);
    expect(STAGGER_ROW_MS * (STAGGER_ROWS - 1)).toBeLessThan(100);
    expect(STAGGER_LIST_MS).toBeLessThan(DUR[2]);
  });
  test("the exits, each shorter than what it closes", () => {
    expect({ menu: ms("--dur-exit-menu"), toast: ms("--dur-exit-toast"), sheet: ms("--dur-exit-sheet"), scrim: ms("--dur-1") }).toEqual({ ...EXIT_MS });
    expect(EXIT_MS.menu).toBeLessThan(DUR[1]);       // a menu comes in on --dur-1
    expect(EXIT_MS.toast).toBeLessThan(DUR[2]);      // a toast on --dur-2
    expect(EXIT_MS.sheet).toBeLessThan(DUR[3]);      // a sheet on --dur-3
    expect(EXIT_MS.scrim).toBeLessThan(DUR[2]);      // its scrim on --dur-2
  });
  test("the two curves", () => {
    expect(raw("--ease-out")).toBe(EASE_OUT_CSS);
    expect(raw("--ease-exit")).toBe(EASE_EXIT_CSS);
    expect(EASE_OUT_CSS).toBe("cubic-bezier(.23, 1, .32, 1)");
    expect(EASE_EXIT_CSS).toBe("cubic-bezier(.4, 0, 1, 1)");
    expect(rustCurve("EASE_OUT")).toEqual([...EASE_OUT]);
    expect(rustCurve("EASE_EXIT")).toEqual([...EASE_EXIT]);
  });
  test("the interface spring, and its curve in the stylesheets is generated from it", () => {
    expect([rustNum("MOTION_SPRING_K"), rustNum("MOTION_SPRING_C")]).toEqual([MOTION_SPRING.k, MOTION_SPRING.c]);
    expect(raw("--ease-spring")).toBe(springLinear(MOTION_SPRING));
  });
  test("what each motion is for names one of the four (M55's names are aliases now)", () => {
    for (const n of ["--dur-press", "--dur-release", "--dur-hover", "--dur-enter", "--dur-exit", "--dur-move", "--dur-open", "--dur-close"]) expect(raw(n), n).toMatch(/^var\(--dur-[1-4]\)$/);
    expect(ms("--dur-press")).toBeLessThan(ms("--dur-release"));
    expect(ms("--dur-exit")).toBeLessThan(ms("--dur-enter"));
    expect(ms("--dur-close")).toBeLessThan(ms("--dur-open"));
    // The old curve names are gone: one ease out, one exit.
    for (const n of ["--ease-enter", "--ease-move", "--ease-hover", "--ease:", "--dur:", "--dur-slow"]) expect(tokens, n).not.toContain(`${n.endsWith(":") ? n : `${n}:`}`);
  });
  test("no look writes its own durations or curves: both looks share the table (M66)", () => {
    for (const n of ["--dur-1", "--dur-2", "--dur-3", "--dur-4", "--dur-enter", "--dur-move", "--ease-out", "--ease-exit", "--ease-spring"]) expect(tokens.split(`${n}:`).length - 1, n).toBe(1);
  });
});

describe("the curves and the spring", () => {
  test("no control point outside 0 to 1, and ease out answers at once while an exit starts gently", () => {
    for (const p of [EASE_OUT, EASE_EXIT]) for (const v of p) expect(v >= 0 && v <= 1).toBe(true);
    expect(bezierAt(EASE_OUT, 0.25)).toBeGreaterThan(0.6);
    expect(bezierAt(EASE_EXIT, 0.25)).toBeLessThan(0.1);
    expect(bezierAt(EASE_OUT, 0)).toBe(0);
    expect(bezierAt(EASE_OUT, 1)).toBe(1);
  });
  test("the spring never passes its target and settles in about a third of a second", () => {
    const path = springPath(MOTION_SPRING);
    expect(Math.max(...path)).toBeLessThanOrEqual(1);
    const secs = springSettleSecs(MOTION_SPRING);
    expect(secs).toBeGreaterThan(0.25);
    expect(secs).toBeLessThan(0.45);
  });
  test("its linear() curve: at most 64 stops, from 0 to 1, never past 1, and within half a percent of the spring", () => {
    const css = springLinear(MOTION_SPRING), stops = /^linear\((.*)\)$/.exec(css)![1].split(",").map(Number);
    expect(stops.length).toBeLessThanOrEqual(64);
    expect(stops[0]).toBe(0);
    expect(stops.at(-1)).toBe(1);
    expect(Math.max(...stops)).toBeLessThanOrEqual(1);
    const path = springPath(MOTION_SPRING);
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, at = t * (stops.length - 1), lo = Math.floor(at), hi = Math.min(stops.length - 1, lo + 1);
      const drawn = stops[lo] + (stops[hi] - stops[lo]) * (at - lo), real = path[Math.round(t * (path.length - 1))];
      expect(Math.abs(drawn - real), `t ${t}`).toBeLessThan(0.05);
    }
    for (let i = 1; i < stops.length - 1; i++) expect(Math.abs(stops[i] - path[Math.round((i / (stops.length - 1)) * (path.length - 1))])).toBeLessThan(0.005);
    expect(springLinear(MOTION_SPRING, 200).split(",").length).toBe(64);
  });
  test("a transition written from the system reads like the stylesheets", () => {
    expect(transition("opacity", DUR[1])).toBe("opacity 120ms cubic-bezier(.23, 1, .32, 1)");
    expect(transition("opacity", DUR[1], "linear")).toBe("opacity 120ms linear");
  });
});
