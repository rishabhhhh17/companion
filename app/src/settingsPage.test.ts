import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { placeShown } from "./settingsPage.tsx";
import { S } from "./strings.ts";

describe("nothing unfinished in Settings (M28)", () => {
  test("Google shows only once this build has it set up, or an account is already kept", () => {
    expect(placeShown("google", false)).toBe(false);
    expect(placeShown("google", true)).toBe(true);
    expect(placeShown("key", false)).toBe(true);
  });
  test("no note for the team ever reaches a person", () => {
    const all = JSON.stringify(S);
    expect(all).not.toMatch(/for the team|google\.json|build again/i);
    expect(readFileSync(new URL("./strings.ts", import.meta.url), "utf8")).not.toMatch(/For the team:/);
  });
});
