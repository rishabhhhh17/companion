// The logic inside the parts (ui/partsLogic.ts): a stepper never sends a value past its range and says so, the arrows move
// through a choice the way macOS does, a menu finds an option by its first letter and opens where it fits, and a verdict's
// mark is only ever what verdict.ts decided.
import { describe, expect, test } from "bun:test";
import { clampTo, commitText, menuOpensUp, moveIndex, numberFromText, stepBy, tabWrap, typeahead, verdictMark } from "./partsLogic.ts";
import { verdictOf, type Facts } from "../verdict.ts";

describe("Stepper", () => {
  test("reads a typed number in the person's own words, and nothing else", () => {
    expect(numberFromText("3")).toBe(3);
    expect(numberFromText(" 12.5 ")).toBe(12.5);
    expect(numberFromText("1,5")).toBe(1.5);
    // A thousands comma is not a decimal point: "1,000" is a thousand, not 1.
    expect(numberFromText("1,000")).toBe(1000);
    expect(numberFromText("1,000,000")).toBe(1_000_000);
    expect(numberFromText("1,250.5")).toBe(1250.5);
    expect(numberFromText("−1,000")).toBe(-1000);
    expect(numberFromText("0,25")).toBe(0.25);
    expect(numberFromText("1,5,5")).toBeNull();
    expect(numberFromText("12,34,567")).toBeNull();
    expect(numberFromText("−2")).toBe(-2);   // the minus sign the stepper itself shows
    expect(numberFromText(".5")).toBe(0.5);
    for (const t of ["", "abc", "3 seconds", "1e3", "--1", "1.2.3", "Infinity", "NaN"]) expect(numberFromText(t), t).toBeNull();
  });
  test("a value past an end is set to that end, and says which end", () => {
    const r = { min: 1, max: 10, step: 1 };
    expect(clampTo(12, r)).toEqual({ value: 10, note: "max" });
    expect(clampTo(0, r)).toEqual({ value: 1, note: "min" });
    expect(clampTo(5, r)).toEqual({ value: 5, note: null });
    expect(clampTo(5, {})).toEqual({ value: 5, note: null });
  });
  test("Return or leaving the box keeps a typed value, clamped; words that are not a number keep nothing", () => {
    const r = { min: 0, max: 50, step: 5 };
    expect(commitText("60", r)).toEqual({ value: 50, note: "max" });
    expect(commitText("15", r)).toEqual({ value: 15, note: null });
    expect(commitText("lots", r)).toBeNull();
  });
  test("one step up or down never passes an end, and decimals stay tidy", () => {
    expect(stepBy(9, 1, { min: 1, max: 10, step: 1 })).toBe(10);
    expect(stepBy(10, 1, { min: 1, max: 10, step: 1 })).toBe(10);
    expect(stepBy(1, -1, { min: 1, max: 10, step: 1 })).toBe(1);
    expect(stepBy(0.1, 1, { min: 0, max: 1, step: 0.2 })).toBe(0.3);
    expect(stepBy(2.5, -1, { step: 0.5 })).toBe(2);
  });
});

describe("the arrows in a choice and a menu", () => {
  test("right and down move on, left and up move back, round at each end; Home and End go to the ends", () => {
    expect(moveIndex("ArrowRight", 0, 3)).toBe(1);
    expect(moveIndex("ArrowDown", 2, 3)).toBe(0);
    expect(moveIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(moveIndex("ArrowUp", 1, 3)).toBe(0);
    expect(moveIndex("Home", 2, 3)).toBe(0);
    expect(moveIndex("End", 0, 3)).toBe(2);
  });
  test("in a menu's list they stop at the ends instead of going round", () => {
    expect(moveIndex("ArrowDown", 2, 3, false)).toBe(2);
    expect(moveIndex("ArrowUp", 0, 3, false)).toBe(0);
  });
  test("any other key is left to the page, and an empty list moves nowhere", () => {
    for (const k of ["a", "Enter", " ", "Tab", "Escape"]) expect(moveIndex(k, 0, 3), k).toBeNull();
    expect(moveIndex("ArrowDown", 0, 0)).toBeNull();
  });
  test("a letter finds the next option that starts with it, round to the start", () => {
    const keys = ["A", "B", "Space", "S", "T"];
    expect(typeahead(keys, 0, "s")).toBe(2);
    expect(typeahead(keys, 2, "S")).toBe(3);
    expect(typeahead(keys, 3, "s")).toBe(2);
    expect(typeahead(keys, 0, "z")).toBeNull();
    expect(typeahead(keys, 0, " ")).toBeNull();
    expect(typeahead(keys, 0, "ab")).toBeNull();
  });
  test("a menu opens upward only when there is no room under it and more room above", () => {
    expect(menuOpensUp({ top: 100, bottom: 128 }, 200, 640)).toBe(false);
    expect(menuOpensUp({ top: 500, bottom: 528 }, 200, 640)).toBe(true);
    expect(menuOpensUp({ top: 60, bottom: 88 }, 600, 640)).toBe(false);   // less room above than below: stays down, and scrolls
  });
});

describe("Verdict line: the mark is only what verdict.ts decided (M45)", () => {
  const base: Facts = { proof: "passed", ended: "done", undone: false, changed: 1, missing: [] };
  test("proven is a tick in the good tone; partly proven a half circle; not fixed a cross; stopped a square; undone the back arrow", () => {
    expect(verdictMark(verdictOf(base))).toEqual({ mark: "tick", tone: "good" });
    expect(verdictMark(verdictOf({ ...base, proof: "partial", missing: ["the tests"] }))).toEqual({ mark: "half", tone: "mixed" });
    expect(verdictMark(verdictOf({ ...base, proof: "failed", ended: "failed", failWhy: "check" }))).toEqual({ mark: "cross", tone: "bad" });
    expect(verdictMark(verdictOf({ ...base, ended: "stopped", proof: "none" }))).toEqual({ mark: "stop", tone: "plain" });
    expect(verdictMark(verdictOf({ ...base, undone: true }))).toEqual({ mark: "undo", tone: "plain" });
  });
  test("it never turns a result into a better one: the tick and the good tone come only with verdict.ts's proven", () => {
    const all: Facts[] = [];
    for (const proof of ["passed", "partial", "failed", "none"] as const) for (const ended of ["done", "stopped", "limit", "needsYou", "failed", "unknown"] as const) for (const undone of [false, true]) all.push({ ...base, proof, ended, undone });
    for (const f of all) {
      const v = verdictOf(f), m = verdictMark(v);
      expect(m.tone).toBe(v.tone);
      if (m.mark === "tick") expect(v.proven, JSON.stringify(f)).toBe(true);
    }
  });
});

describe("Tab stays inside a dialog", () => {
  test("from the last control it wraps to the first; Shift+Tab from the first or from the heading wraps to the last", () => {
    expect(tabWrap(2, 3, false)).toBe(0);
    expect(tabWrap(0, 3, true)).toBe(2);
    expect(tabWrap(-1, 3, true)).toBe(2);
    expect(tabWrap(-1, 3, false)).toBeNull();   // from the heading Tab goes on to the first control by itself
    expect(tabWrap(1, 3, false)).toBeNull(); expect(tabWrap(1, 3, true)).toBeNull();
    expect(tabWrap(0, 1, false)).toBe(0); expect(tabWrap(0, 1, true)).toBe(0);
    expect(tabWrap(0, 0, false)).toBeNull();
  });
});
