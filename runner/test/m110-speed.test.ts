// M110 (docs/milestones/M110-daily-feel.md): speed budget evaluation and report formatting.
// Pure logic tests first (TDD), no model calls, no network.
import { describe, expect, test } from "bun:test";
import { evaluateSpeed, formatSpeedReport, SPEED_BUDGETS, type SpeedSample } from "../src/speed.ts";

const fast: SpeedSample = {
  launchToNotchMs: 180,
  hoverToSmallMs: 42,
  clickToOpenMs: 95,
  askKeyToTypingMs: 28,
  doneToNotchMs: 110,
  idleCpuPct: 1.2,
  idleRssMb: 92,
};

describe("M110 speed budgets", () => {
  test("all budgets match the M110 targets", () => {
    expect(SPEED_BUDGETS.hoverToSmallMs).toBeLessThanOrEqual(100);
    expect(SPEED_BUDGETS.clickToOpenMs).toBeLessThanOrEqual(200);
    expect(SPEED_BUDGETS.askKeyToTypingMs).toBeLessThanOrEqual(100);
    expect(SPEED_BUDGETS.launchToNotchMs).toBeLessThanOrEqual(500);
    expect(SPEED_BUDGETS.doneToNotchMs).toBeLessThanOrEqual(500);
    expect(SPEED_BUDGETS.idleCpuPct).toBeLessThanOrEqual(5);
    expect(SPEED_BUDGETS.idleRssMb).toBeLessThanOrEqual(180);
  });

  test("passes when every measurement is within budget", () => {
    const r = evaluateSpeed(fast);
    expect(r.ok).toBe(true);
    expect(r.over).toEqual([]);
    expect(r.rows.length).toBe(7);
  });

  test("fails and names every metric that is over budget", () => {
    const slow: SpeedSample = { ...fast, hoverToSmallMs: 145, clickToOpenMs: 260 };
    const r = evaluateSpeed(slow);
    expect(r.ok).toBe(false);
    expect(r.over.map((x) => x.key)).toEqual(["hoverToSmallMs", "clickToOpenMs"]);
  });

  test("treats non-finite or negative numbers as failures so a broken probe cannot pass", () => {
    const bad: SpeedSample = { ...fast, askKeyToTypingMs: Number.NaN, idleCpuPct: -1 };
    const r = evaluateSpeed(bad);
    expect(r.ok).toBe(false);
    expect(r.over.map((x) => x.key)).toEqual(["askKeyToTypingMs", "idleCpuPct"]);
  });

  test("formats a plain report showing measured value, budget, and PASS or FAIL", () => {
    const out = formatSpeedReport(evaluateSpeed({ ...fast, hoverToSmallMs: 120 }));
    expect(out).toContain("Hover to small notch");
    expect(out).toContain("120 ms");
    expect(out).toContain("FAIL");
    expect(out).toContain("PASS");
    expect(out).not.toContain("—");
  });
});
