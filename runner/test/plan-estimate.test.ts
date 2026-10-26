// Finding E (first Mac session): the plan card showed "about 25 cents" for a task that cost 3 cents. The figure is now the
// measured cost of a step times a safety factor, never below one cent. Only the figure shown changes: the budget caps (what
// a task may spend at most) are separate and are not touched here.
import { describe, expect, test } from "bun:test";
import { estimateUsd, MEASURED_STEP_USD, STEP_SAFETY } from "../src/drive.ts";
import { MODELS } from "../src/models.ts";
import { defOf } from "../../protocol/settings.ts";

// What real steps cost on Sonnet 5.5 (docs/milestones/M11-real-run-results.md, evals/*/results, the first Mac session).
const MEASURED_CENTS = [3.2, 3.3, 4, 4.6, 5.1, 9.4, 12];

describe("the cost shown before Start", () => {
  test("is the measured median cost of a step times 1.5", () => {
    const sorted = [...MEASURED_CENTS].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] / 100;
    expect(MEASURED_STEP_USD).toBeGreaterThanOrEqual(0.03);
    expect(MEASURED_STEP_USD).toBeLessThanOrEqual(median);
    expect(STEP_SAFETY).toBe(1.5);
    expect(estimateUsd(1, MODELS.agent)).toBe(0.06);
  });
  test("is about the cost of what was measured, no longer eight times it: one step is at least 3 cents and under 10", () => {
    const one = estimateUsd(1, MODELS.agent);
    expect(one).toBeGreaterThanOrEqual(0.03);
    expect(one).toBeLessThan(0.1);
    expect(estimateUsd(1)).toBe(one);
  });
  test("grows with the steps, and is never below one cent for a plan that has a step", () => {
    expect(estimateUsd(4, MODELS.agent)).toBe(0.24);
    expect(estimateUsd(4)).toBeGreaterThan(estimateUsd(2));
    expect(estimateUsd(1, "claude-haiku-4-5")).toBeGreaterThanOrEqual(0.01);
    expect(estimateUsd(1, "claude-haiku-5-5")).toBeGreaterThanOrEqual(0.01);
    expect(estimateUsd(0)).toBe(0);
  });
  test("follows the model by list price: Opus is twice Sonnet, Haiku 4.5 half", () => {
    expect(estimateUsd(5, "claude-opus-5-5")).toBe(0.6);
    expect(estimateUsd(5, "claude-haiku-4-5")).toBe(estimateUsd(5, "claude-sonnet-5-5") / 2);
  });
  test("a model that is not known is priced at the dearest, so the figure is never too low", () => {
    expect(estimateUsd(3, "claude-future-9")).toBeGreaterThanOrEqual(estimateUsd(3, "claude-opus-5-5"));
  });
  test("the budget caps are not the estimate: their usual values are unchanged", () => {
    expect([defOf("budget.task")?.default, defOf("budget.plan")?.default, defOf("budget.rescue")?.default, defOf("budget.research")?.default]).toEqual([3, 5, 5, 2]);
  });
});
