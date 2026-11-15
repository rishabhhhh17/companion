// M98 (F29): the engine never tells a person to add an API key, sign in with a Claude plan or bring their own Claude.
// While fixing is not switched on for this Mac, it says so, and says what still works.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MANAGED_FIXING_OFF, NOT_CONNECTED } from "../src/engines.ts";
import { NOT_CONNECTED_DIRECT } from "../src/direct.ts";
import { plainFailure } from "../src/plainfail.ts";

const BYO = /API key|Claude plan|your own Claude|add your|sign in|connect/i;

describe("the engine's not connected words", () => {
  test("none names a key, a Claude plan, a sign in or connecting", () => {
    for (const w of [NOT_CONNECTED, NOT_CONNECTED_DIRECT, MANAGED_FIXING_OFF]) {
      expect(w, w).not.toMatch(BYO);
      expect(w, w).toMatch(/not switched on/);
      expect(w, w).not.toContain("—");
    }
  });
  test("each says what still works", () => {
    expect(NOT_CONNECTED).toMatch(/Checking your project still works/);
    expect(NOT_CONNECTED_DIRECT).toMatch(/Checking your project still works/);
    // On managed usage the light features run on the sign in, so they are named as working.
    expect(MANAGED_FIXING_OFF).toMatch(/explanations/);
  });
  test("each reaches the page as it is, a sentence written for a person", () => {
    for (const w of [NOT_CONNECTED, NOT_CONNECTED_DIRECT, MANAGED_FIXING_OFF]) {
      expect(plainFailure(w)).toBe(w);
    }
  });
  test("the runner's own refusals for a missing helper say the same, never connect Claude", () => {
    const src = readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/connect Claude in Settings/);
    expect(src).not.toMatch(/which is not connected here/);
  });
});
