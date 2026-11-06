// M73 (fluid, item 9): one keyboard model inside Home (homeKeys.ts). Only once Home has the keyboard (the person clicked
// into it, rule 9), never a global key (F28). Command 1 to 4 open the places shown, in their order; Up and Down move between
// the one list's rows, except inside a field; nothing while composing or with Control or Option.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { homeKey } from "./homeKeys.ts";

const k = (key: string, o: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean; composing: boolean }> = {}) =>
  ({ key, meta: false, ctrl: false, alt: false, shift: false, composing: false, ...o });
const PLACES = ["now", "learn", "did", "memory"] as const;

describe("Home's keys", () => {
  test("Command 1 to 4 open the places in the order shown", () => {
    expect(PLACES.map((_, i) => homeKey(k(String(i + 1), { meta: true }), { inField: false, places: PLACES }))).toEqual(PLACES.map((p) => ({ go: p })));
    // Learn hidden (until the first practice): Command 2 is History, Command 4 nothing.
    const three = ["now", "did", "memory"] as const;
    expect(homeKey(k("2", { meta: true }), { inField: false, places: three })).toEqual({ go: "did" });
    expect(homeKey(k("4", { meta: true }), { inField: false, places: three })).toBeNull();
    // From inside the ask box too: a Command key is never typing.
    expect(homeKey(k("1", { meta: true }), { inField: true, places: PLACES })).toEqual({ go: "now" });
  });
  test("never with Control, Option or Shift, never while composing, never a bare number", () => {
    for (const o of [{ meta: true, ctrl: true }, { meta: true, alt: true }, { meta: true, shift: true }, { meta: true, composing: true }, {}]) {
      expect(homeKey(k("1", o), { inField: false, places: PLACES })).toBeNull();
    }
  });
  test("Up and Down move between rows, but not inside a field", () => {
    expect(homeKey(k("ArrowDown"), { inField: false, places: PLACES })).toEqual({ rows: 1 });
    expect(homeKey(k("ArrowUp"), { inField: false, places: PLACES })).toEqual({ rows: -1 });
    expect(homeKey(k("ArrowDown"), { inField: true, places: PLACES })).toBeNull();
    expect(homeKey(k("ArrowDown", { meta: true }), { inField: false, places: PLACES })).toBeNull();
  });
  test("Home's page reads these keys only on its own key events (no global shortcut, rule 9 and F28)", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("const hk = homeKey(");
    expect(readFileSync(new URL("./homeKeys.ts", import.meta.url), "utf8")).not.toMatch(/register|globalShortcut|invoke\(/);
  });
});
