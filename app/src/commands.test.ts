import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { answerApproval, startTask, stopAgent, undo, listTasks, warmEngine } from "./commands.ts";
import { stateLabel } from "./model.ts";

describe("commands from the pages are valid protocol", () => {
  for (const [name, c] of [["start", startTask("/p", "Add a page")], ["allow", answerApproval("ap_1", true)], ["deny", answerApproval("ap_1", false)], ["undo", undo("/p", "cp_0001")], ["stop", stopAgent()], ["timeline", listTasks("/p")]] as const) {
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

describe("the zero cost warm up", () => {
  test("is valid protocol, names no folder, and asks for nothing to be run or sent", () => {
    const c = warmEngine() as Record<string, unknown>;
    expect(parseCommand(serialize(warmEngine())).ok).toBe(true);
    expect(Object.keys(c).sort()).toEqual(["id", "type", "v"]);
    expect(c.type).toBe("engine.warm");
  });
  test("Home asks for it when it opens and when the ask box gets the keyboard, at most once a minute from the page", () => {
    const card = require("node:fs").readFileSync(new URL("./card.tsx", import.meta.url), "utf8") as string;
    const opened = card.slice(card.indexOf('listen("opened"'), card.indexOf("touch();", card.indexOf('listen("opened"')));
    expect(opened).toContain("warmSoon()");
    expect(card).toMatch(/<textarea ref=\{box\}[\s\S]*?onFocus=\{\(\) => warmSoon\(\)\}/);
    expect(card).toMatch(/const warmSoon = \(\) => \{[^\n]*60_000[^\n]*send\(warmEngine\(\)\)/);
  });
});
