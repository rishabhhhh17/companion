// M59: the first run, rendered and clicked through to a found problem: nothing is checked until the person presses, the
// found line shows with Fix it, and Back keeps it found (See the problem goes back to it, never a second check).
import { describe, expect, test } from "bun:test";
import { PROJECT, app, buttons, hasButton, press, renderHome, runner, screen } from "./render.tsx";

const problem = { kind: "line", file: "src/math.test.ts", line: 5, column: 21, lineText: "expect(add(2, 3)).toBe(5);", message: "AssertionError: expected -1 to be 5", from: "tests" };
const finds = () => app.sent().filter((c) => c.type === "problem.find");

async function toFound() {
  await renderHome({ onboarded: false });
  expect(screen.getByRole("region", { name: /Welcome/ })).toBeTruthy();
  await press("Continue");
  expect(finds()).toEqual([]);
  await press("Look for problems in shop");
  expect(finds()).toEqual([expect.objectContaining({ project: PROJECT, first: true })]);
  expect(hasButton("Stop the check")).toBe(true);
  await runner({ type: "problem.found", project: PROJECT, agent: finds()[0].agent, verdict: "failed", label: "Running the tests", detail: "The tests did not pass.", problem });
}

describe("the first run", () => {
  test("the person's press starts the one check, and the found line shows with Fix it and a way out", async () => {
    await toFound();
    expect(screen.getAllByText("AssertionError: expected -1 to be 5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("src/math.test.ts").length).toBeGreaterThan(0);
    expect(hasButton("Fix it")).toBe(true);
    expect(hasButton("Go to my project")).toBe(true);
    expect(hasButton("Stop the check")).toBe(false);
  });

  test("Back keeps the problem found: the project screen offers See the problem, and it goes back with no new check", async () => {
    await toFound();
    await press("Back");
    expect(hasButton("See the problem")).toBe(true);
    expect(buttons()).not.toContain("Look for problems in shop");
    await press("See the problem");
    expect(finds().length).toBe(1);
    expect(screen.getAllByText("AssertionError: expected -1 to be 5").length).toBeGreaterThan(0);
    expect(hasButton("Fix it")).toBe(true);
  });

  test("Stop the check sends one interrupt and nothing else starts", async () => {
    await renderHome({ onboarded: false });
    await press("Continue");
    await press("Look for problems in shop");
    await press("Stop the check");
    expect(app.sent().filter((c) => c.type === "agent.interrupt").length).toBe(1);
    expect(app.sentTypes().filter((t) => t === "agent.start" || t === "review.fix")).toEqual([]);
  });
});
