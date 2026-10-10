// Point at the problem, as the card sees it: press the key, the project is checked, the place comes back, the pointer
// flies there. A failed check during a task also keeps its place, so "Show me where" can point at it later.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { findProblem } from "./commands.ts";
import { characterWords, initial, reduce, visualState, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const place = { kind: "line", file: "src/App.tsx", line: 5, lineText: "const total: number = \"three\";", message: "Type 'string' is not assignable to type 'number'.", from: "checks" };

describe("pressing the key", () => {
  test("the command is valid protocol and names the project", () => {
    const c = findProblem("/Users/me/site");
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c).toMatchObject({ type: "problem.find", project: "/Users/me/site" });
  });
  test("while the project is checked, the character says so", () => {
    const m = run([ev({ type: "ui.findProblem" })]);
    expect(m.point?.stage).toBe("checking");
    expect(visualState(m)).toBe("checking");
    expect(characterWords(m)).toBe("Checking your project");
  });
  test("a failure comes back with its place", () => {
    const m = run([ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "failed", label: "Building and checking the code", detail: "tsc failed", problem: place })]);
    expect(m.point).toEqual({ stage: "found", label: "Building and checking the code", message: "tsc failed", agent: "a", problem: place as never });
    expect(m.where).toEqual(place as never);
  });
  test("a healthy project is not pointed at", () => {
    expect(run([ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "passed" })]).point?.stage).toBe("clear");
    expect(run([ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "nothing_to_check" })]).point?.stage).toBe("nothing");
  });
  test("stopping, closing or changing project clears it", () => {
    const found = [ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "failed", label: "x", detail: "y", problem: place })];
    for (const end of ["app.stop_everything", "ui.pointClosed", "ui.projectChanged"]) {
      const m = run([...found, ev({ type: end })]);
      expect(m.point).toBeNull();
      if (end !== "ui.pointClosed") expect(m.where).toBeNull();
    }
    expect(run([ev({ type: "ui.findProblem" }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "cancelled" })]).point).toBeNull();
  });
});

describe("a failed check during a task keeps its place", () => {
  const steps = (problem?: unknown) => [{ rung: "tests", label: "Running the tests", status: "failed", detail: "1 failed", ...(problem ? { problem } : {}) }];
  test("the place of the failed step is kept", () => {
    const m = run([ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp", label: "Before", files: 1, skipped: [] }), ev({ type: "proof.result", agent: "a", verdict: "failed", steps: steps(place), tries: 1 })]);
    expect(m.where).toEqual(place as never);
  });
  test("even with no task card open (Rescue checks the project too)", () => {
    expect(run([ev({ type: "proof.result", agent: "a", verdict: "failed", steps: steps(place), tries: 1 })]).where).toEqual(place as never);
  });
  test("a pass forgets the old place", () => {
    const m = run([ev({ type: "proof.result", agent: "a", verdict: "failed", steps: steps(place), tries: 1 }), ev({ type: "proof.result", agent: "a", verdict: "passed", steps: [], tries: 2 })]);
    expect(m.where).toBeNull();
  });
  test("a failure with no place leaves nothing to point at", () => {
    expect(run([ev({ type: "proof.result", agent: "a", verdict: "failed", steps: steps(), tries: 1 })]).where).toBeNull();
  });
  test("an answer that arrives after Stop or a folder change is ignored", () => {
    for (const end of ["app.stop_everything", "ui.projectChanged"]) {
      const m = run([ev({ type: "ui.findProblem" }), ev({ type: end }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "failed", label: "x", detail: "y", problem: place })]);
      expect(m.point).toBeNull(); expect(m.where).toBeNull();
    }
  });
  test("closing the card puts the character back to rest", () => {
    const m = run([ev({ type: "ui.findProblem" }), ev({ type: "agent.state", agent: "a", state: "checking" }), ev({ type: "agent.state", agent: "a", state: "needsYou" }), ev({ type: "problem.found", project: "p", agent: "a", verdict: "failed", label: "x", detail: "y", problem: place }), ev({ type: "ui.pointClosed" })]);
    expect(m.character).toBe("idle");
  });
});
