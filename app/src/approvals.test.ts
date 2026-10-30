import { describe, expect, test } from "bun:test";
import { approvalWords, whatOf } from "./approvals.ts";
import { initial, reduce } from "./model.ts";
import { islandJobs } from "./islandPanel.ts";
import { S } from "./strings.ts";
import { readFileSync } from "node:fs";

describe("approval cards a person can read (M28)", () => {
  test("the card leads with a plain question for its kind of risk", () => {
    expect(approvalWords({ risk: "git", title: "git push sends your work", action: "Running: git push origin main", undoable: false }))
      .toEqual({ question: S.approval.question.git, what: "git push origin main", why: "Git push sends your work.", undo: S.approval.undoNo, canUndo: false });
    expect(approvalWords({ risk: "something new", title: "x", action: undefined, undoable: undefined }).question).toBe(S.approval.question.irreversible);
  });
  test("what will happen is the command or the file, never the tool's name prefix", () => {
    expect(whatOf("Running: npm install zod")).toBe("npm install zod");
    expect(whatOf("Write: /Users/me/shop/.env")).toBe("/Users/me/shop/.env");
    expect(whatOf("WebFetch")).toBe("WebFetch");
    expect(whatOf("")).toBeNull();
    expect(whatOf(undefined)).toBeNull();
  });
  test("an older engine without the new fields still makes a card, and never promises Undo (M45)", () => {
    expect(approvalWords({ risk: "install", title: "a package", action: undefined, undoable: undefined }).undo).toBe(S.approval.undoNo);
  });
  test("the notch card shows the question and what will happen, not the safety rule's words", () => {
    const m = reduce(initial(), { v: 1, id: "e", type: "approval.request", approval: "ap1", agent: "a", checkpoint: "cp", toolUseId: "t", risk: "install", title: "This installs a tool for this project.", expiresAt: "2099-01-01T00:00:00Z", action: "Running: npm install zod", undoable: true } as never);
    const [c] = islandJobs(m);
    expect(c.title).toBe(S.approval.question.install);
    expect(c.sub).toBe("npm install zod");
    expect(m.approvals[0]).toMatchObject({ action: "Running: npm install zod", undoable: true });
  });
  test("a script the engine cannot read is never called undoable, whatever an older engine sent (M45)", () => {
    const w = approvalWords({ risk: "irreversible", title: "a script I cannot read", action: "Running: sh deploy.sh", undoable: true });
    expect(w.question).toBe(S.approval.question.irreversible);
    expect(w.undo).toBe(S.approval.undoNo);
    expect(w.canUndo).toBe(false);
  });
});

describe("M45: the approval card never says it can and can't at once", () => {
  const RISKS = ["irreversible", "git", "outside_project", "install", "network", "settings", "house_rule", "something new"];
  test("never says it can and can't at once", () => {
    for (const risk of RISKS) for (const undoable of [true, false, undefined]) {
      const w = approvalWords({ risk, title: "x", action: "Running: x", undoable }), name = `${risk} ${undoable}`;
      if (w.question === S.approval.question.irreversible) expect(w.undo, name).toBe(S.approval.undoNo);
      if (risk === "git") expect(w.undo, name).toBe(S.approval.undoNo);
      expect(w.canUndo, name).toBe(w.undo === S.approval.undoYes);
    }
  });
  test("missing undoable says Undo can't", () => {
    expect(approvalWords({ risk: "network", title: "x", action: "Running: curl x", undoable: undefined }).undo).toBe(S.approval.undoNo);
  });
  test("house_rule has its own question", () => {
    expect(S.approval.question.house_rule).toBe("Allow this? One of your house rules asks first.");
    const w = approvalWords({ risk: "house_rule", title: "Your house rule says: \"ask before editing pricing.txt\"", action: "Write: /Users/me/shop/pricing.txt", undoable: true });
    expect(w.question).toBe(S.approval.question.house_rule);
    expect(w.undo).toBe(S.approval.undoYes);
  });
  test("reads show no Undo line", () => {
    expect(approvalWords({ risk: "outside_project", title: "x", action: "Read: /Users/me/other/a.txt", undoable: true }).undo).toBeNull();
    // A read whose call names no file: the engine sends the bare tool name (BashOutput of another shell, Grep or Glob outside).
    for (const action of ["BashOutput", "Grep", "Glob", "LS", "TaskOutput"]) {
      const w = approvalWords({ risk: "outside_project", title: "This reads the output of a program this task did not start.", action, undoable: true });
      expect(w.undo, action).toBeNull();
    }
    // A tool whose name only starts like a read is not one.
    expect(approvalWords({ risk: "outside_project", title: "x", action: "Running: cat ../a.txt", undoable: true }).undo).toBe(S.approval.undoYes);
  });
  test("a house rule on a command never promises Undo", () => {
    // npm install is allowed, and so undoable to the engine, but Undo leaves node_modules alone (spec M45 section 8).
    const w = approvalWords({ risk: "house_rule", title: 'Your house rule says: "ask before installing packages"', action: "Running: npm install zod", undoable: true });
    expect(w).toMatchObject({ undo: S.approval.undoNo, canUndo: false });
    // A house rule on an edit inside the project can still be taken back.
    expect(approvalWords({ risk: "house_rule", title: "x", action: "Edit: /p/src/a.ts", undoable: true }).canUndo).toBe(true);
  });
  test("paths are shown from the project", () => {
    expect(approvalWords({ risk: "settings", title: "x", action: "Write: /Users/me/shop/.env", undoable: true }, "/Users/me/shop").what).toBe(".env");
    expect(whatOf("Write: /Users/me/shop/src/a.ts", "/Users/me/shop")).toBe("src/a.ts");
  });
  test("the card's colour and buttons follow the words, with Allow and Don't allow of equal weight", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    const ask = card.slice(card.indexOf("m.approvals.map((a) => { const w = approvalWords(a, project)"), card.indexOf("{m.stuck && ("));
    expect(ask).toContain('className={`line ask-undo${w.canUndo ? "" : " no"}`}');
    expect(ask).not.toContain("a.undoable");
    expect(ask).not.toContain('className="btn primary"');
  });
});
