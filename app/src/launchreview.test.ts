// From the 15 Oct 2026 launch review of the pages: states that could stick, claims without proof, and raw error words.
import { describe, expect, test } from "bun:test";
import { historyWords, initial, plainError, reduce, triesNote, type Model } from "./model.ts";
import { shouldTakeFocus } from "./cardlogic.ts";
import { S } from "./strings.ts";

const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);

describe("Undo says what happened, only when it is told", () => {
  const asked = [{ type: "ui.undoAsked", checkpoint: "cp_0003" }];
  test("it asks first, and can be cancelled", () => {
    expect(run(asked).undo).toMatchObject({ stage: "confirm", checkpoint: "cp_0003" });
    expect(run([...asked, { type: "ui.undoCancelled" }]).undo).toBeNull();
  });
  test("after the press it is working, not done", () => {
    expect(run([...asked, { type: "ui.undoSent" }]).undo?.stage).toBe("working");
  });
  test("it is done only when the engine says so, and the counts are kept", () => {
    const m = run([...asked, { type: "ui.undoSent" }, { type: "checkpoint.restored", checkpoint: "cp_0003", safety: "cp_0009", recovered: ["a.csv"], largeLeftAlone: ["b.db", "c.db"], leftAlone: [] }]);
    expect(m.undo).toMatchObject({ stage: "done", recovered: 1, large: 2 });
  });
  test("an answer for a different undo point does not finish this one", () => {
    expect(run([...asked, { type: "ui.undoSent" }, { type: "checkpoint.restored", checkpoint: "cp_0001", safety: "cp_9", recovered: [], largeLeftAlone: [], leftAlone: [] }]).undo?.stage).toBe("working");
  });
  test("an error while undoing is shown as the undo failing, in the engine's own plain words", () => {
    const m = run([...asked, { type: "ui.undoSent" }, { type: "protocol.error", reason: "Something is still working on this project. Wait for it to finish, or press Stop, then undo." }]);
    expect(m.undo).toMatchObject({ stage: "failed", note: "Something is still working on this project. Wait for it to finish, or press Stop, then undo." });
    expect(m.error).toBeNull();
  });
  test("Stop everything, a folder change and an engine restart clear it", () => {
    for (const end of ["app.stop_everything", "ui.projectChanged", "app.runner_restarted"]) expect(run([...asked, { type: "ui.undoSent" }, { type: end }]).undo, end).toBeNull();
  });
});

describe("a question that nobody answered does not wait forever", () => {
  const ask = (id: string, expiresAt: string) => ({ type: "approval.request", approval: id, agent: "a", checkpoint: "c", toolUseId: "t", risk: "irreversible", title: "Run a command?", expiresAt });
  test("expired questions are dropped, with a plain note; unexpired ones stay", () => {
    const m = run([ask("old", "2026-10-15T10:00:00Z"), ask("new", "2026-10-15T10:10:00Z"), { type: "ui.approvalsExpire", now: Date.parse("2026-10-15T10:05:00Z") }]);
    expect(m.approvals.map((a) => a.id)).toEqual(["new"]);
    expect(m.notice).toMatch(/ran out of time|no longer/i);
  });
  test("nothing expires when nothing is overdue", () => {
    const m = run([ask("a", "2026-10-15T10:10:00Z"), { type: "ui.approvalsExpire", now: Date.parse("2026-10-15T10:05:00Z") }]);
    expect(m.approvals).toHaveLength(1); expect(m.notice).toBeNull();
  });
});

describe("an engine restart leaves nothing stuck", () => {
  test("a lookup on the screen, a Prompt help read, an install and a practice fix all end", () => {
    const m = run([
      { type: "app.showme", stage: "thinking", message: "Finding it", req: "sm_1" }, { type: "ui.install", project: "p", stage: "installing", detail: "" },
      { type: "app.runner_restarted" },
    ]);
    expect(m.showme).toBeNull(); expect(m.install).toBeNull();
  });
});

describe("words that claim success", () => {
  test("a cancelled check is not 'fixed'", () => {
    const withProof = (verdict: string) => ({ ...initial(), task: { agent: "a", label: "x", lines: [], costUsd: 0, proof: { steps: [], verdict, tries: 2 } } }) as never;
    expect(triesNote(withProof("cancelled"))).toBeNull();
    // M45: the check passed; "fixed" is the verdict's word, never the tries note's.
    expect(triesNote(withProof("passed"))).toMatch(/passed after 2 tries/i);
    expect(triesNote(withProof("passed"))).not.toMatch(/fixed/i);
    expect(triesNote(withProof("passed_with_gaps"))).toMatch(/skipped/i);
  });
  test("a check that could not run all the way is said to be partly checked", () => {
    expect(historyWords({ status: "done", proof: "partial", changed: 1 })).toBe(S.verdict.partial);
    expect(historyWords({ status: "done", proof: "passed", changed: 1 })).toBe(S.verdict.proven);
    expect(historyWords({ status: "done", proof: "skipped", changed: 1 })).toBe(S.verdict.unchecked);
    expect(historyWords({ status: "done", proof: "skipped", changed: 0 })).toBe(S.verdict.noChange);
  });
  test("pressing the key when a check could not run all the way does not say everything passes", () => {
    const m = run([{ type: "ui.findProblem" }, { type: "problem.found", project: "p", agent: "a", verdict: "passed_with_gaps" }]);
    expect(m.point?.stage).toBe("gaps");
    expect(run([{ type: "ui.findProblem" }, { type: "problem.found", project: "p", agent: "a", verdict: "passed" }]).point?.stage).toBe("clear");
  });
});

describe("error words", () => {
  test("a sentence the engine wrote for a person is shown as it is", () => {
    const s = "Something is still working on this project. Wait for it to finish, or press Stop, then undo.";
    expect(plainError(s)).toBe(s);
    expect(plainError("That agent is already working. Wait for it to finish, or press Stop.")).toBe("That agent is already working. Wait for it to finish, or press Stop.");
  });
  test("a technical message is wrapped and never shown raw", () => {
    expect(plainError("ENOENT: no such file or directory, open '/Users/x/y'")).toMatch(/^Something went wrong/);
    expect(plainError("TypeError: undefined is not an object at /a/b.ts:4:5")).toMatch(/^Something went wrong/);
  });
  test("a question that is gone is said in plain words", () => {
    expect(plainError("unknown approval ui1abc3")).toBe("That question is not waiting for an answer any more.");
  });
});

describe("a text box in use is never robbed of its focus (found by the review: the next Space pressed Allow)", () => {
  test("typing wins", () => {
    expect(shouldTakeFocus({ tag: "TEXTAREA", editable: true }, true)).toBe(false);
    expect(shouldTakeFocus({ tag: "INPUT", editable: true }, true)).toBe(false);
    expect(shouldTakeFocus({ tag: "DIV", editable: true }, true)).toBe(false);
  });
  test("an idle card may take focus, a hidden window may not", () => {
    expect(shouldTakeFocus({ tag: "BODY", editable: false }, true)).toBe(true);
    expect(shouldTakeFocus({ tag: "BUTTON", editable: false }, true)).toBe(true);
    expect(shouldTakeFocus({ tag: "BODY", editable: false }, false)).toBe(false);
    expect(shouldTakeFocus(null, true)).toBe(true);
  });
});
