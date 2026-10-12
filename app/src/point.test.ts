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

describe("the visual receipt on the card", () => {
  const receipt = ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "index.html", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1 });
  test("the picture joins its own receipt", () => {
    const m = run([receipt, ev({ type: "receipt.visual", agent: "a", project: "p", checkpoint: "cp_1", made: true, image: "abc", caption: "This works now. What changed is circled.", circles: 1 })]);
    expect(m.receipt?.visual).toEqual({ image: "abc", caption: "This works now. What changed is circled." });
  });
  test("a picture for an older receipt is not shown on a newer one", () => {
    const m = run([receipt, ev({ type: "receipt.visual", agent: "a", project: "p", checkpoint: "cp_0", made: true, image: "old", caption: "x", circles: 1 })]);
    expect(m.receipt?.visual).toBeUndefined();
  });
  test("the card waits only when a picture was promised, and stops waiting when none comes", () => {
    const promised = ev({ type: "receipt", agent: "a", checkpoint: "cp_1", changed: [{ file: "index.html", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1, picture: true });
    expect(run([promised]).receipt?.picture).toBe(true);
    expect(run([receipt]).receipt?.picture).toBeUndefined();
    const m = run([promised, ev({ type: "receipt.visual", agent: "a", project: "p", checkpoint: "cp_1", made: false, caption: "", circles: 0 })]);
    expect(m.receipt?.visual).toEqual({ caption: "" });
  });
});

describe("the it's live card on the card", () => {
  const live = ev({ type: "ship.status", project: "p", stage: "live", detail: "It is live", productionUrl: "https://mug-shop.vercel.app" });
  const card = ev({ type: "ship.card", project: "p", url: "https://mug-shop.vercel.app", title: "Mug shop", image: "abc", withShot: true });
  test("the card joins the live site", () => {
    expect(run([live, card]).shipFlow?.card).toEqual({ image: "abc", url: "https://mug-shop.vercel.app", title: "Mug shop" });
  });
  test("after a close or a roll back it is not shown", () => {
    expect(run([live, ev({ type: "ui.shipClosed" }), card]).shipFlow).toBeNull();
    expect(run([live, ev({ type: "ship.status", project: "p", stage: "rolled_back", detail: "back" }), card]).shipFlow?.card).toBeUndefined();
  });
});

describe("draw it for me on the card", () => {
  const asked = [ev({ type: "ui.diagramAsked" })];
  test("asking shows the character thinking", () => {
    const m = run(asked); expect(m.diagram?.stage).toBe("asking"); expect(visualState(m)).toBe("thinking"); expect(characterWords(m)).toBe("Drawing it");
  });
  test("a diagram answer shows the reason and the caption", () => {
    const m = run([...asked, ev({ type: "diagram.ready", project: "p", made: true, diagram: { caption: "Renamed route.", broken: { node: "db", reason: "The route does not exist" } } })]);
    expect(m.diagram).toEqual({ stage: "shown", caption: "Renamed route.", brokenReason: "The route does not exist" });
  });
  test("no diagram says why in plain words", () => {
    expect(run([...asked, ev({ type: "diagram.ready", project: "p", made: false, reason: "I could not draw that." })]).diagram).toEqual({ stage: "none", reason: "I could not draw that." });
  });
  test("an answer after Stop or a folder change is ignored", () => {
    for (const end of ["app.stop_everything", "ui.projectChanged"]) expect(run([...asked, ev({ type: end }), ev({ type: "diagram.ready", project: "p", made: true, diagram: { caption: "x", broken: { node: "a", reason: "r" } } })]).diagram).toBeNull();
  });
});
