// Bug bash (m67): what Home shows once Check my project has found a problem, with the exact events the runner sends
// (runner/src/agent.ts problemFind: problem.found, then agent.state needsYou).
import { expect, test } from "bun:test";
import { cardWorking, initial, reduce } from "./model.ts";
import { heroWords } from "./homeHero.ts";

// Was a test.failing probe; m67 bug 22 is fixed (model.ts foundWaits), so it is a plain test now.
test("a found problem is not shown as work in progress", () => {
  let m = initial();
  const ev = (e: Record<string, unknown>) => { m = reduce(m, { v: 1, id: "e", ts: "2026-11-05T00:00:00Z", ...e } as never); };
  m = reduce(m, { type: "ui.findProblem", fresh: true } as never);
  ev({ type: "agent.state", agent: "builder-1", state: "checking" });
  ev({ type: "problem.found", project: "/p", agent: "builder-1", verdict: "failed", label: "Running the tests", detail: "The tests did not pass. AssertionError: price should be 10, got 12", problem: { kind: "line", file: "t.js", line: 1, lineText: "x", message: "AssertionError: price should be 10, got 12" } });
  ev({ type: "agent.state", agent: "builder-1", state: "needsYou" });
  const h = heroWords(m, "/p");
  console.log("cardWorking:", cardWorking(m), "hero:", JSON.stringify(h));
  expect(cardWorking(m)).toBe(false);
  expect(h.headline).toContain("price should be 10");
});
