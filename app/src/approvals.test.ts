import { describe, expect, test } from "bun:test";
import { approvalWords, whatOf } from "./approvals.ts";
import { initial, reduce } from "./model.ts";
import { islandJobs } from "./islandPanel.ts";
import { S } from "./strings.ts";

describe("approval cards a person can read (M28)", () => {
  test("the card leads with a plain question for its kind of risk", () => {
    expect(approvalWords({ risk: "git", title: "git push sends your work", action: "Running: git push origin main", undoable: false }))
      .toEqual({ question: S.approval.question.git, what: "git push origin main", why: "Git push sends your work.", undo: S.approval.undoNo });
    expect(approvalWords({ risk: "something new", title: "x", action: undefined, undoable: undefined }).question).toBe(S.approval.question.irreversible);
  });
  test("what will happen is the command or the file, never the tool's name prefix", () => {
    expect(whatOf("Running: npm install zod")).toBe("npm install zod");
    expect(whatOf("Write: /Users/me/shop/.env")).toBe("/Users/me/shop/.env");
    expect(whatOf("WebFetch")).toBe("WebFetch");
    expect(whatOf("")).toBeNull();
    expect(whatOf(undefined)).toBeNull();
  });
  test("an older engine without the new fields still makes a card, saying nothing about Undo", () => {
    expect(approvalWords({ risk: "install", title: "a package", action: undefined, undoable: undefined }).undo).toBeNull();
  });
  test("the notch card shows the question and what will happen, not the safety rule's words", () => {
    const m = reduce(initial(), { v: 1, id: "e", type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp", toolUseId: "t", risk: "install", title: "a script I cannot read", expiresAt: "2099-01-01T00:00:00Z", action: "Running: npm install zod", undoable: true } as never);
    const [c] = islandJobs(m);
    expect(c.title).toBe(S.approval.question.install);
    expect(c.sub).toBe("npm install zod");
    expect(m.approvals[0]).toMatchObject({ action: "Running: npm install zod", undoable: true });
  });
});
