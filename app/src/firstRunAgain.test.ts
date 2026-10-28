import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AGAIN_EVENT, ONBOARDED_KEY, onboardedNow, showFirstRunAgain } from "./firstRunAgain.ts";

const mem = (v: Record<string, string>) => ({ getItem: (k: string) => v[k] ?? null, removeItem: (k: string) => { delete v[k]; } });

describe("show the first run again", () => {
  test("forgets only that the first run was finished, and tells the page", () => {
    const v: Record<string, string> = { [ONBOARDED_KEY]: "1", "companion.draft": "keep me" };
    const told: string[] = [];
    if (typeof Event === "undefined") (globalThis as Record<string, unknown>).Event = class { constructor(public type: string) {} };
    showFirstRunAgain(mem(v), (e) => told.push(e.type));
    expect(v).toEqual({ "companion.draft": "keep me" });
    expect(told).toEqual([AGAIN_EVENT]);
    expect(onboardedNow(mem(v))).toBe(false);
  });
  test("storage that cannot be read never forces the first run", () => {
    expect(onboardedNow(null)).toBe(true);
    expect(onboardedNow({ getItem: () => { throw new Error("no"); } })).toBe(true);
  });
  test("Home listens on its own page and to the Settings window, and Settings offers it under the character", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("window.addEventListener(AGAIN_EVENT, again);");
    expect(card).toContain('window.addEventListener("storage", again);');
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("showFirstRunAgain();");
  });
});
