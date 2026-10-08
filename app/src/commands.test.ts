import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { answerApproval, startTask, stopAgent, undo } from "./commands.ts";
import { stateLabel } from "./model.ts";

describe("commands from the pages are valid protocol", () => {
  for (const [name, c] of [["start", startTask("/p", "Add a page")], ["allow", answerApproval("ap_1", true)], ["deny", answerApproval("ap_1", false)], ["undo", undo("/p", "cp_0001")], ["stop", stopAgent()]] as const) {
    test(name, () => expect(parseCommand(serialize(c)).ok).toBe(true));
  }
  test("a task starts with a spending limit and the drive mode", () => {
    const c = startTask("/p", "x") as any;
    expect(c.budgetUsd).toBeGreaterThan(0);
    expect(c.mode).toBe("drive");
  });
  test("every command has its own id", () => {
    expect(startTask("/p", "a").id).not.toBe(startTask("/p", "a").id);
  });
  test("approval answers are 'once', never a blanket yes", () => expect((answerApproval("a", true) as any).scope).toBe("once"));
});

describe("labels", () => {
  test("every state has plain words", () => {
    for (const s of ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"] as const) expect(stateLabel(s).length).toBeGreaterThan(2);
  });
});
