// After the engine restarts (M11 audit A58, A59, A64, 20 Oct 2026). The new engine keeps nothing of the old one in memory:
// no task to follow up or try again, no turn to check. Before this, Home still offered the follow up box and Try again (both
// refused, and the typed answer was lost), dropped a turn while the old code was still in the file (with no way left to put
// the fix back), and always said the files were as they were, even when a task had changed some before it stopped.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AGENT } from "./commands.ts";
import { canFollowUp, canRetry, initial, receiptSaid, reduce, teachActions, teachLines, waitsForAnswer, type Model } from "./model.ts";
import { S } from "./strings.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const P = "/Users/me/site";
const state = (s: string) => ev({ type: "agent.state", agent: AGENT, state: s });
const begin = [ev({ type: "checkpoint.created", project: P, agent: AGENT, checkpoint: "cp_1", label: "Before: make the button", files: 3, skipped: [] }), state("working")];
const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: AGENT, checkpoint: "cp_1", changed: [{ file: "a.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.1, ...o });
const restart = [ev({ type: "app.runner_down" }), ev({ type: "app.runner_restarted" })];
const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");

describe("A58: a finished task cannot be followed up once the engine restarted", () => {
  const asked = run([...begin, receipt({ said: "Which colour do you want?", asks: true }), state("needsYou")]);
  test("before: the box is where the answer goes", () => {
    expect(canFollowUp(asked, P)).toBe(true);
  });
  test("after: no follow up box and no Try again, and the receipt says to start a new task", () => {
    const m = run(restart, asked);
    expect(m.receipt?.gone).toBe(true);
    expect(canFollowUp(m, P)).toBe(false);
    expect(waitsForAnswer(m)).toBe(false);
    expect(receiptSaid(m)?.lead).toBe(S.receiptSaid);
    const failed = run([...begin, receipt({ proof: "failed" }), state("error"), ...restart]);
    expect(canRetry(failed, P)).toBe(false);
    expect(card).toContain("{m.receipt.gone && <div className=\"line\">{S.receiptGone}</div>}");
  });
  test("a check that was running when the engine stopped is not left saying Running", () => {
    const m = run([...begin, ev({ type: "proof.step", agent: AGENT, rung: "checks", label: "Running the tests", status: "running", detail: "" }), ...restart]);
    expect(m.task?.proof?.steps.map((s) => s.status)).toEqual(["skipped"]);
    expect(m.task?.proof?.steps[0].detail).toBe(S.stepStoppedRestart);
  });
  test("a follow up the engine refused comes back into the box, as the ask box does", () => {
    expect(card).toContain("const followWords = useRef<string | null>(null);");
    expect(card).toContain("followWords.current = words ? followTextNow.current : null;");
    expect(card).toMatch(/const o = sentOutcome\(payload, AGENT\);\s*if \(o === "started"\) followWords\.current = null;\s*else if \(o === "refused"\) \{ const back = putBack\(\{ prompt: followWords\.current, attached: \[\], off: false \}, \{ text: followTextNow\.current, attached: \[\] \}\)\.text; followWords\.current = null; if \(back !== undefined\) setFollowText\(back\); \}/);
  });
});

describe("A59: a turn left open keeps the way to put the fix back", () => {
  const ready = ev({ type: "teach.ready", project: P, checkpoint: "cp_1", made: true, target: { file: "src/b.js", line: 2, lineText: "return title(user.name);" }, restore: "cp_3" });
  const open = run([ev({ type: "ui.teachAsked", checkpoint: "cp_1" }), ready]);
  test("the turn stays with Put my fix back and Leave it as it is; Check my change is gone, since it cannot run", () => {
    const m = run(restart, open);
    expect(m.teach?.orphan).toBe(true);
    expect(m.teach?.restore).toBe("cp_3");
    expect(teachActions(m.teach!)).toEqual(["where", "putBack", "leave"]);
    expect(teachLines(m.teach!)).toEqual([S.teachOrphan("src/b.js", 2)]);
    expect(m.notice).toBe(S.restartedTurn("src/b.js", 2));
  });
  test("a check that was running, or a put back that had not finished, goes back to the same choice", () => {
    const checking = run([ev({ type: "ui.teachChecking", agent: AGENT }), ...restart], open);
    expect(teachActions(checking.teach!)).toEqual(["where", "putBack", "leave"]);
    const restoring = run([ev({ type: "ui.teachRestore" }), ...restart], open);
    expect(teachActions(restoring.teach!)).toEqual(["where", "putBack", "leave"]);
  });
  test("Put my fix back still works with the new engine, then the turn can be closed", () => {
    const m = run([...restart, ev({ type: "ui.teachRestore" }), ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_3", safety: "s", recovered: [], largeLeftAlone: [], leftAlone: [] })], open);
    expect(m.teach?.stage).toBe("restored");
    expect(teachActions(m.teach!)).toEqual(["close"]);
  });
  test("left as it is, it can be closed, since nothing more can be checked", () => {
    const m = run([...restart, ev({ type: "ui.teachLeft" })], open);
    expect(m.teach?.stage).toBe("left");
    expect(teachActions(m.teach!)).toEqual(["where", "putBack", "close"]);
  });
  test("a turn that was finished goes, as before", () => {
    const passed = run([ev({ type: "ui.teachChecking", agent: AGENT }), ev({ type: "teach.result", project: P, checkpoint: "cp_1", verdict: "passed", same: true })], open);
    expect(run(restart, passed).teach).toBeNull();
  });
});

describe("A64: the restart notice says what is true", () => {
  test("with a task running, it says anything changed before is still in the files", () => {
    expect(run([...begin, ...restart]).notice).toBe(S.restartedStopped);
  });
  test("with nothing running, it says nothing was stopped", () => {
    expect(run(restart).notice).toBe(S.restartedNothing);
    expect(run([...begin, receipt(), state("done"), ...restart]).notice).toBe(S.restartedNothing);
  });
  test("it never claims the files are as they were", () => {
    for (const w of [S.restartedStopped, S.restartedNothing, S.restartedTurn("a.js", 1)]) expect(w).not.toMatch(/as they were/);
  });
});
