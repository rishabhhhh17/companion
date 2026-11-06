// M73 (fluid, item 8): the ask box's list as you type (palette.ts). The ask itself is always first, so Return does what it
// always did unless the person moves; actions match by the start of a word; past asks by their words; a short list.
import { describe, expect, test } from "bun:test";
import { paletteMove, paletteRows, paletteShown, type PaletteAction } from "./palette.ts";

const ACTS: PaletteAction[] = [
  { id: "find", label: "Check my project" },
  { id: "shipCheck", label: "Check before going live", words: ["ship", "publish"] },
  { id: "review", label: "Review changes" },
  { id: "learn", label: "Learn" },
  { id: "did", label: "History" },
  { id: "memory", label: "Memory" },
  { id: "settings", label: "Settings" },
];

describe("the ask box's list", () => {
  test("nothing for no words", () => {
    expect(paletteRows("", ACTS, ["fix the login"])).toEqual([]);
    expect(paletteRows("   ", ACTS, [])).toEqual([]);
  });
  test("the ask is always first, with the person's own words", () => {
    const rows = paletteRows("  the checkout button does nothing ", ACTS, []);
    expect(rows[0]).toEqual({ kind: "ask", text: "the checkout button does nothing" });
    expect(paletteShown(rows)).toBe(false);
  });
  test("actions match the start of a word, the label's start first", () => {
    const rows = paletteRows("check", ACTS, []);
    expect(rows.map((r) => r.kind === "action" ? r.id : r.kind)).toEqual(["ask", "find", "shipCheck"]);
    expect(paletteRows("live", ACTS, []).map((r) => r.kind === "action" ? r.id : r.kind)).toEqual(["ask", "shipCheck"]);
    expect(paletteRows("ship", ACTS, []).map((r) => r.kind === "action" ? r.id : r.kind)).toEqual(["ask", "shipCheck"]);
    expect(paletteRows("hist", ACTS, []).some((r) => r.kind === "action" && r.id === "did")).toBe(true);
    // Every word must start a word of the action: "check live" finds one, "check cart" none.
    expect(paletteRows("check live", ACTS, []).filter((r) => r.kind === "action").map((r) => (r as { id: string }).id)).toEqual(["shipCheck"]);
    expect(paletteRows("check cart", ACTS, []).filter((r) => r.kind === "action")).toEqual([]);
    // Not inside a word: "eck" is no match.
    expect(paletteRows("eck", ACTS, []).filter((r) => r.kind === "action")).toEqual([]);
    expect(paletteShown(paletteRows("check", ACTS, []))).toBe(true);
  });
  test("past asks that hold the words, newest first, each once, never the words themselves", () => {
    const past = ["Fix the login button", "fix the login button", "Make the cart faster", "Fix the login page", "fix login"];
    const rows = paletteRows("fix login", ACTS, past);
    expect(rows.filter((r) => r.kind === "past").map((r) => (r as { text: string }).text)).toEqual(["Fix the login button", "Fix the login page"]);
    expect(paletteRows("cart", ACTS, past).filter((r) => r.kind === "past")).toEqual([{ kind: "past", text: "Make the cart faster" }]);
  });
  test("at most six rows", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, label: `Check thing ${i}` }));
    expect(paletteRows("check", many, ["check a", "check b", "check c"]).length).toBe(6);
  });
  test("arrows loop", () => {
    expect(paletteMove(0, 3, 1)).toBe(1);
    expect(paletteMove(2, 3, 1)).toBe(0);
    expect(paletteMove(0, 3, -1)).toBe(2);
    expect(paletteMove(0, 0, 1)).toBe(0);
  });
});
