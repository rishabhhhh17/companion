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

describe("moving between Settings pages", () => {
  // Found 3 Nov 2026 while shooting the orb's pictures: a page reads one setting per row (PageView's useSetting loop), so
  // going from General to About or Character changed how many it read and the whole Settings window went blank (React
  // error 300). Each page is its own component instance, keyed by the page, so the count never changes under it.
  test("each page is drawn fresh, so a page with fewer rows never breaks the window", () => {
    const src = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(src).toContain("for (const k of keys) useSetting(k);");
    expect(src).toContain("<PageView key={page} page={page} />");
    expect(src).not.toMatch(/<PageView page=/);
  });
});
