// M91: the real plan usage reading in the pages. One real run on a Max plan (14 Nov 2026) showed the plan route sends its
// numbers on every turn, per window (runner/src/runway.ts picks the window closest to its limit). The notch's ring now names
// that window ("5 hour" or "week"), and near starts at NEAR_PCT (80%) used, as Home's warning does by default.
import { describe, expect, test } from "bun:test";
import { NEAR_PCT, runwayFrom, runwayMark, runwayNow, warnBeforeJob, warnTitle, windowName, type Runway } from "./runway.ts";
import { S } from "./strings.ts";

const NOW = Date.UTC(2026, 10, 14, 13, 0);
const NO_DASH = /[—–]/;
const reset = (iso?: string) => (iso ? "on Wed at 9:00 am" : "");
const plan = (o: Partial<Runway>): Runway => ({ state: "ok", source: "plan", at: NOW, ...o });
// What runway.ts in the runner makes of the real run's event (runner/test/m91-plan-runway.test.ts).
const REAL = { type: "usage.runway", state: "ok", source: "plan", usedPct: 46, resetsAt: new Date(1794888000 * 1000).toISOString(), window: "seven_day" };

describe("the window, named", () => {
  test("5 hour, week, and the model weeks; nothing for a window it cannot name", () => {
    expect(windowName("five_hour")).toBe(S.m91.window.five_hour);
    expect(windowName("seven_day")).toBe(S.m91.window.seven_day);
    expect(S.m91.window.five_hour).toBe("5 hour");
    expect(S.m91.window.seven_day).toBe("week");
    expect(windowName("seven_day_opus")).toBe(S.m91.window.seven_day_opus);
    expect(windowName("seven_day_sonnet")).toBe(S.m91.window.seven_day_sonnet);
    expect(windowName("overage")).toBe("");
    expect(windowName("other")).toBe("");
    expect(windowName(undefined)).toBe("");
  });
});

describe("the notch's ring on the plan route", () => {
  test("the short text says the share is used, with the window on a line over it (the M91 review: never read as left, or as a time)", () => {
    expect(S.m91.used(46)).toBe("46% used");
    expect(S.m91.over("week")).toBe("Week");
    expect(S.m91.over("5 hour")).toBe("5 hour");
  });
  test("the real run's reading: room left, the week named, its share and its reset", () => {
    const r = runwayFrom(REAL, NOW)!;
    expect(runwayMark(r, NOW, true, reset)).toEqual({ level: "ok", fill: 0.46, short: S.m91.used(46), over: "Week", say: "The Claude week limit is 46% used. It resets on Wed at 9:00 am." });
  });
  test("the 5 hour window, named", () => {
    expect(runwayMark(plan({ usedPct: 91, window: "five_hour", resetsAt: "2026-11-14T15:40:00.000Z" }), NOW, true, reset)).toMatchObject({ level: "near", short: S.m91.used(91), over: "5 hour", say: "The Claude 5 hour limit is 91% used. It resets on Wed at 9:00 am." });
  });
  test(`near from ${NEAR_PCT}% used, even when the plan still says allowed`, () => {
    expect(NEAR_PCT).toBe(80);
    expect(runwayMark(plan({ usedPct: 79, window: "seven_day" }), NOW, true, reset)?.level).toBe("ok");
    expect(runwayMark(plan({ usedPct: 80, window: "seven_day" }), NOW, true, reset)?.level).toBe("near");
    expect(runwayMark(plan({ state: "near", usedPct: 30, window: "five_hour" }), NOW, true, reset)?.level).toBe("near");
  });
  test("reached, and close with no share: the window is named too", () => {
    expect(runwayMark(plan({ state: "out", usedPct: 100, window: "five_hour", resetsAt: "2026-11-14T15:40:00.000Z" }), NOW, true, reset)?.say).toBe("The Claude 5 hour limit is reached. It resets on Wed at 9:00 am.");
    expect(runwayMark(plan({ state: "near", window: "seven_day" }), NOW, true, reset)?.say).toBe("The Claude week limit is close.");
    expect(runwayMark(plan({ state: "out", window: "seven_day" }), NOW, true, reset)?.say).toBe("The Claude week limit is reached for now.");
  });
  test("no window it can name: the words stay as before", () => {
    expect(runwayMark(plan({ usedPct: 40 }), NOW, true, reset)).toMatchObject({ short: S.m89.runway.used(40), say: S.m89.runway.say(40, "") });
    expect(runwayMark(plan({ usedPct: 40, window: "other" }), NOW, true, reset)?.short).toBe(S.m89.runway.used(40));
    expect(runwayMark(plan({ usedPct: 40, window: "other" }), NOW, true, reset)).not.toHaveProperty("over");
  });
});

describe("Home's warning on the plan route", () => {
  test("room left on the real reading: no warning; 80% or more of a window, at the usual mark: the warning", () => {
    expect(warnBeforeJob(runwayFrom(REAL, NOW), NOW, "80")).toBe(false);
    expect(warnBeforeJob(runwayFrom({ ...REAL, usedPct: 85 }, NOW), NOW, "80")).toBe(true);
    expect(warnBeforeJob(runwayFrom({ ...REAL, usedPct: 85 }, NOW), NOW, "90")).toBe(false);
    expect(warnBeforeJob(runwayFrom({ ...REAL, state: "near", usedPct: 50 }, NOW), NOW, "90")).toBe(true);
  });
  test("the warning's title names the window when it can", () => {
    expect(S.m91.warnTitle("week")).toBe("The Claude week limit is close");
    expect(warnTitle(plan({ state: "near", usedPct: 85, window: "seven_day" }), NOW)).toBe(S.m91.warnTitle("week"));
    expect(warnTitle(plan({ state: "out", window: "five_hour" }), NOW)).toBe(S.m91.warnTitleOut("5 hour"));
    expect(S.m91.warnTitleOut("5 hour")).toBe("The Claude 5 hour limit is reached");
    expect(warnTitle(plan({ state: "near", window: "other" }), NOW)).toBe(S.m89.warn.title);
  });
});

describe("the words", () => {
  test("plain, no dashes", () => {
    for (const t of [S.m91.used(46), S.m91.over("week"), S.m91.say("5 hour", 91, "at 3 pm"), S.m91.say("week", 46, ""), S.m91.sayNear("week", "at 3 pm"), S.m91.sayOut("week", ""), S.m91.warnTitle("week"), S.m91.warnTitleOut("week"), ...Object.values(S.m91.window)]) expect(t).not.toMatch(NO_DASH);
  });
});

describe("the M91 review: the next window", () => {
  const H = 3600_000;
  const FIVE = new Date(NOW + 2 * H).toISOString(), WEEK = new Date(NOW + 3 * 24 * H).toISOString();
  const both = { type: "usage.runway", state: "ok", source: "plan", usedPct: 85, resetsAt: FIVE, window: "five_hour", nextPct: 84, nextResetsAt: WEEK, nextWindow: "seven_day" };
  test("kept from the event, all three or none", () => {
    expect(runwayFrom(both, NOW)).toEqual({ state: "ok", source: "plan", usedPct: 85, resetsAt: FIVE, window: "five_hour", nextPct: 84, nextResetsAt: WEEK, nextWindow: "seven_day", at: NOW });
    expect(runwayFrom({ ...both, nextWindow: undefined }, NOW)).not.toHaveProperty("nextPct");
    expect(runwayFrom({ ...both, nextPct: 140 }, NOW)).not.toHaveProperty("nextPct");
  });
  test("5 hour 85% resets in 2 hours, week 84%: 2 hours later the week is the reading, and Run it still asks at 80", () => {
    const r = runwayFrom(both, NOW)!;
    expect(warnBeforeJob(r, NOW, "80")).toBe(true);
    const later = NOW + 2 * H + 1000;
    expect(runwayNow(r, later)).toMatchObject({ state: "ok", source: "plan", usedPct: 84, resetsAt: WEEK, window: "seven_day" });
    expect(runwayNow(runwayNow(r, later), later)).toMatchObject({ usedPct: 84, window: "seven_day" });
    expect(warnBeforeJob(r, later, "80")).toBe(true);
    expect(runwayMark(r, later, true, reset, "80")).toMatchObject({ level: "near", short: S.m91.used(84), over: "Week" });
    expect(warnTitle(r, later)).toBe(S.m91.warnTitle("week"));
    // Once the week resets too, nothing holds.
    expect(runwayNow(r, Date.parse(WEEK) + 1)).toBeNull();
  });
  test("reached on the 5 hour window: after its reset the week is shown as room or close by its share, not as reached", () => {
    const r = runwayFrom({ ...both, state: "out", usedPct: 100, nextPct: 40 }, NOW)!;
    expect(runwayNow(r, NOW + 2 * H + 1000)?.state).toBe("ok");
    expect(warnBeforeJob(r, NOW + 2 * H + 1000, "80")).toBe(false);
  });
});

describe("the M91 review: the ring's amber follows Warn me before a big job", () => {
  const at = (pct: number, warnAt: unknown) => runwayMark(plan({ usedPct: pct, window: "seven_day" }), NOW, true, reset, warnAt)?.level;
  test("at 70: amber from 70, as the warning; at 90: grey until 90, as the warning", () => {
    expect(at(69, "70")).toBe("ok");
    expect(at(72, "70")).toBe("near");
    expect(warnBeforeJob(plan({ usedPct: 72, window: "seven_day" }), NOW, "70")).toBe(true);
    expect(at(85, "90")).toBe("ok");
    expect(warnBeforeJob(plan({ usedPct: 85, window: "seven_day" }), NOW, "90")).toBe(false);
    expect(at(90, "90")).toBe("near");
  });
  test("off, or not known: the colour still shows from 80", () => {
    expect(at(79, "off")).toBe("ok");
    expect(at(80, "off")).toBe("near");
    expect(at(80, undefined)).toBe("near");
    expect(at(80, "55")).toBe("near");
  });
  test("near or reached as Claude said stays amber at any mark", () => {
    expect(runwayMark(plan({ state: "near", usedPct: 30, window: "five_hour" }), NOW, true, reset, "90")?.level).toBe("near");
  });
});

describe("the M91 review: a window named with no share of its own", () => {
  test("reached on the Opus week: the ring and the title name the Opus week, with no percent", () => {
    const r = plan({ state: "out", window: "seven_day_opus", resetsAt: new Date(NOW + 86_400_000).toISOString() });
    expect(runwayMark(r, NOW, true, reset)).toMatchObject({ level: "out", short: S.m89.runway.outShort, over: "Opus week", say: "The Claude Opus week limit is reached. It resets on Wed at 9:00 am." });
    expect(warnTitle(r, NOW)).toBe(S.m91.warnTitleOut("Opus week"));
  });
});
