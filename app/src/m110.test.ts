// M110 (docs/milestones/M110-daily-feel.md): daily habits, first-minute click count, keyboard reach, and Learn padding.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dayStamp, dailyRecapDue, firstMinuteChecks, rememberTab, savedTab, LAST_TAB_KEY, DAILY_RECAP_KEY } from "./dailyFeel.ts";
import { homeKey } from "./homeKeys.ts";
import { ALL_CSS } from "./ui/cssFiles.ts";

const k = (key: string, o: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean; composing: boolean }> = {}) =>
  ({ key, meta: false, ctrl: false, alt: false, shift: false, composing: false, ...o });
const PLACES = ["now", "learn", "did", "memory"] as const;

describe("M110 notch remembers where you were", () => {
  test("saves and restores main tabs, never settings or unknown values", () => {
    const store = new Map<string, string>();
    const io = { get: (x: string) => store.get(x) ?? null, set: (x: string, v: string) => { store.set(x, v); } };
    expect(savedTab(io)).toBe("now");
    rememberTab("learn", io);
    expect(store.get(LAST_TAB_KEY)).toBe("learn");
    expect(savedTab(io)).toBe("learn");
    rememberTab("settings", io);
    expect(savedTab(io)).toBe("learn");
    store.set(LAST_TAB_KEY, "bogus");
    expect(savedTab(io)).toBe("now");
  });
});

describe("M110 first time each day recap", () => {
  test("due once on the first open of a new local calendar day, never twice, never when off", () => {
    const yesterday = new Date(2026, 10, 22, 23, 30, 0).getTime();
    const todayMorning = new Date(2026, 10, 23, 0, 10, 0).getTime();
    const todayLater = new Date(2026, 10, 23, 9, 0, 0).getTime();
    expect(DAILY_RECAP_KEY).toBeTruthy();
    expect(dailyRecapDue(yesterday, "", todayMorning, "30min")).toBe(true);
    expect(dailyRecapDue(yesterday, dayStamp(todayMorning), todayLater, "30min")).toBe(false);
    expect(dailyRecapDue(yesterday, "", todayMorning, "off")).toBe(false);
    expect(dailyRecapDue(0, "", todayMorning, "30min")).toBe(false);
    expect(dailyRecapDue(todayMorning, "", todayLater, "30min")).toBe(false);
  });
});

describe("M110 keyboard reach inside Home", () => {
  test("Command K focuses the ask box anywhere; slash focuses it outside fields", () => {
    expect(homeKey(k("k", { meta: true }), { inField: false, places: PLACES })).toEqual({ ask: true });
    expect(homeKey(k("K", { meta: true }), { inField: true, places: PLACES })).toEqual({ ask: true });
    expect(homeKey(k("/"), { inField: false, places: PLACES })).toEqual({ ask: true });
    expect(homeKey(k("/"), { inField: true, places: PLACES })).toBeNull();
  });
  test("Command period stops running work", () => {
    expect(homeKey(k(".", { meta: true }), { inField: false, places: PLACES })).toEqual({ stop: true });
    expect(homeKey(k(".", { meta: true }), { inField: true, places: PLACES })).toEqual({ stop: true });
  });
  test("Command Z opens Undo confirmation outside text fields only", () => {
    expect(homeKey(k("z", { meta: true }), { inField: false, places: PLACES })).toEqual({ undo: true });
    expect(homeKey(k("z", { meta: true }), { inField: true, places: PLACES })).toBeNull();
  });
});

describe("M110 first minute and Learn polish", () => {
  // The 24 Nov review: only what is read from the first run itself (onboarding.ts COUNTED); the click counts and the
  // permissions were constants, so they are no longer claimed here.
  test("first-minute path stays within 2 counted screens, read from the first run's own list", () => {
    const c = firstMinuteChecks();
    expect(c.countedScreens).toBeLessThanOrEqual(2);
    expect(Object.keys(c)).toEqual(["countedScreens"]);
  });
  test("Learn page styles align Not this one and What you have learned footnote", () => {
    const css = ALL_CSS();
    expect(css).toContain(".tutor-not-this");
    expect(css).toContain(".home .learn > .page-caption");
    // The 24 Nov review: Not this one keeps the button's own minimum target size.
    expect(css).not.toMatch(/\.tutor-not-this \.btn \{[^}]*min-height:\s*(auto|0)/);
  });
  test("card.tsx focuses the ask box without a 30ms dead timeout", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).not.toContain("setTimeout(() => box.current?.focus(), 30)");
  });
});
