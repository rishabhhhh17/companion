// What the character and cards show, decided by plain code that can be tested without a screen.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { approvePlan, planDrive } from "./commands.ts";
import { driveWords, characterWords, formatUsd, historyWords, isFixing, triesNote, initial, motionFor, notDoneReason, plainError, plainPath, reduce, stateLabel, type Model } from "./model.ts";

const ev = (o: Record<string, unknown>) => ({ v: 1, id: "e", ...o });
const run = (events: Record<string, unknown>[], from: Model = initial()) => events.reduce<Model>((m, e) => reduce(m, e as never), from);
const start = [ev({ type: "checkpoint.created", agent: "a", checkpoint: "cp_0001", label: "Before: add a page", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "thinking" })];

describe("the character's state", () => {
  test("starts idle, and off when the engine is down", () => {
    expect(initial().character).toBe("idle");
    expect(run([ev({ type: "app.runner_down" })]).character).toBe("off");
  });
  test("follows the agent", () => {
    expect(run([...start]).character).toBe("thinking");
    expect(run([...start, ev({ type: "agent.state", agent: "a", state: "working" })]).character).toBe("working");
    expect(run([...start, ev({ type: "agent.state", agent: "a", state: "done" })]).character).toBe("done");
  });
  test("needs you outranks working, and an error outranks both", () => {
    const m = run([...start, ev({ type: "agent.state", agent: "a", state: "working" }), ev({ type: "agent.state", agent: "b", state: "needsYou" })]);
    expect(m.character).toBe("needsYou");
    expect(run([ev({ type: "agent.state", agent: "a", state: "working" }), ev({ type: "agent.state", agent: "b", state: "error" }), ev({ type: "agent.state", agent: "c", state: "needsYou" })]).character).toBe("error");
  });
  test("with two agents it shows the busiest one, not the last event", () => {
    const m = run([ev({ type: "agent.state", agent: "a", state: "working" }), ev({ type: "agent.state", agent: "b", state: "done" })]);
    expect(m.character).toBe("working");
  });
  test("done settles back to idle when the page says so", () => {
    const m = run([ev({ type: "agent.state", agent: "a", state: "done" })]);
    expect(reduce(m, { type: "ui.settle" } as never).character).toBe("idle");
  });
  test("a stop everything returns the character to idle, drops waiting approvals and says so", () => {
    const m = run([...start, ev({ type: "approval.request", approval: "ap_9", agent: "a", checkpoint: "cp_0001", toolUseId: "t", risk: "git", title: "x", expiresAt: "z" }), ev({ type: "agent.state", agent: "a", state: "needsYou" }), ev({ type: "app.stop_everything" })]);
    expect(m.character).toBe("idle");
    expect(m.notice).toMatch(/stopped everything/i);
    expect(m.approvals).toEqual([]);
  });
});

describe("approvals", () => {
  const req = ev({ type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp_0001", toolUseId: "t", risk: "git", title: "git push sends your work to a remote", expiresAt: "2026-10-08T12:30:00Z" });
  test("a request becomes a card with plain words", () => {
    const m = run([...start, req]);
    expect(m.approvals.length).toBe(1);
    expect(m.approvals[0]).toMatchObject({ id: "ap_1", title: "git push sends your work to a remote", risk: "git" });
  });
  test("answering removes the card", () => {
    const m = reduce(run([req]), { type: "ui.approvalAnswered", approval: "ap_1" } as never);
    expect(m.approvals).toEqual([]);
  });
  test("a repeated request does not stack duplicates", () => {
    expect(run([req, req]).approvals.length).toBe(1);
  });
});

describe("task, receipt and undo", () => {
  test("the task shows what it is doing and the cost so far", () => {
    const m = run([...start, ev({ type: "agent.tool", agent: "a", tool: "Write", summary: "Write: index.html", toolUseId: "t1", undoable: true, outcome: "ran" }), ev({ type: "cost.update", agent: "a", usdEstimate: 0.034, basis: "x", tokens: {} })]);
    expect(m.task?.lines.at(-1)).toMatchObject({ text: "Write: index.html", outcome: "ran" });
    expect(m.task?.costUsd).toBeCloseTo(0.034, 6);
  });
  test("a blocked step is shown as blocked, in plain words", () => {
    const m = run([...start, ev({ type: "agent.tool", agent: "a", tool: "Write", summary: "Write: ../x.txt", toolUseId: "t", undoable: true, outcome: "blocked" })]);
    expect(m.task?.lines.at(-1)?.outcome).toBe("blocked");
  });
  test("the receipt keeps the checkpoint so Undo can use it", () => {
    const m = run([...start, ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [{ file: "index.html", kind: "added" }], commands: 1, notUndoable: ["git push"], proof: "skipped", usdEstimate: 0.05 })]);
    expect(m.receipt).toMatchObject({ checkpoint: "cp_0001", changed: [{ file: "index.html", kind: "added" }], notUndoable: ["git push"], usdEstimate: 0.05 });
  });
  test("starting a new task clears the old receipt", () => {
    const m = run([ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0 }), ...start]);
    expect(m.receipt).toBeNull();
  });
});

describe("errors and sign in, in plain words", () => {
  test("the spending limit says so plainly", () => expect(plainError("error_max_budget_usd: the spending limit was reached")).toMatch(/spending limit/i));
  test("not connected tells you what to do", () => expect(plainError("engine error: Not connected: add your API key, or sign in with your Claude plan.")).toMatch(/add your API key/i));
  test("an unknown error is shown without raw jargon prefixes", () => expect(plainError("engine error: boom")).toBe("Something went wrong: boom"));
  test("auth none shows a not connected notice, auth api_key clears it", () => {
    const m = run([ev({ type: "auth.status", method: "none" })]);
    expect(m.connected).toBe("none");
    expect(m.notice).toMatch(/not connected/i);
    expect(run([ev({ type: "auth.status", method: "api_key" })], m).notice).toBeNull();
  });
  test("a protocol error becomes a visible message", () => {
    expect(run([ev({ type: "protocol.error", reason: "error_max_budget_usd: x" })]).error).toMatch(/spending limit/i);
  });
  test("unknown events are ignored, not crashed on", () => expect(run([ev({ type: "something.new" })])).toEqual(initial()));
});

describe("motion and money", () => {
  test("reduced motion freezes every state", () => {
    for (const s of ["idle", "thinking", "working", "checking", "needsYou", "done", "error", "off"] as const) expect(motionFor(s, true)).toBe("none");
  });
  test("with motion allowed, working and thinking move, off and idle barely", () => {
    expect(motionFor("working", false)).not.toBe("none");
    expect(motionFor("thinking", false)).not.toBe("none");
    expect(motionFor("off", false)).toBe("none");
  });
  test("money is shown in plain amounts", () => {
    expect(formatUsd(0)).toBe("free so far");
    expect(formatUsd(0.004)).toBe("less than 1 cent");
    expect(formatUsd(0.069)).toBe("7 cents");
    expect(formatUsd(1.234)).toBe("$1.23");
  });
});

describe("paths in plain words", () => {
  test("the project folder is dropped from a path", () => expect(plainPath("Write: /Users/me/Developer/companion-playground/index.html", "/Users/me/Developer/companion-playground")).toBe("Write: index.html"));
  test("a path outside the project is left alone", () => expect(plainPath("Write: /etc/hosts", "/Users/me/p")).toBe("Write: /etc/hosts"));
  test("no project means no change", () => expect(plainPath("Write: /a/b", "")).toBe("Write: /a/b"));
  test("works for several paths in one line", () => expect(plainPath("mv /p/a.txt /p/b.txt", "/p")).toBe("mv a.txt b.txt"));
});

describe("answered approvals and step lines stay in step on every page", () => {
  const req = ev({ type: "approval.request", approval: "ap_1", agent: "a", checkpoint: "cp", toolUseId: "t1", risk: "git", title: "git push", expiresAt: "z" });
  test("an announced answer removes the card and the badge on a page that never saw the click", () => {
    const m = run([req, ev({ type: "approval.resolved", approval: "ap_1", agent: "a", outcome: "denied" })]);
    expect(m.approvals).toEqual([]);
  });
  test("an expired or cancelled approval also goes away", () => {
    for (const outcome of ["expired", "cancelled", "allowed"]) expect(run([req, ev({ type: "approval.resolved", approval: "ap_1", agent: "a", outcome })]).approvals).toEqual([]);
  });
  test("the same step is updated, not repeated", () => {
    const m = run([...start,
      ev({ type: "agent.tool", agent: "a", tool: "Bash", summary: "Running: git push", toolUseId: "t1", undoable: false, outcome: "needs_approval" }),
      ev({ type: "agent.tool", agent: "a", tool: "Bash", summary: "Running: git push", toolUseId: "t1", undoable: false, outcome: "ran" })]);
    expect(m.task?.lines.length).toBe(1);
    expect(m.task?.lines[0].outcome).toBe("ran");
  });
  test("different steps stay separate", () => {
    const m = run([...start,
      ev({ type: "agent.tool", agent: "a", tool: "Write", summary: "Write: a", toolUseId: "t1", undoable: true, outcome: "ran" }),
      ev({ type: "agent.tool", agent: "a", tool: "Write", summary: "Write: b", toolUseId: "t2", undoable: true, outcome: "ran" })]);
    expect(m.task?.lines.length).toBe(2);
  });
});

describe("proof: the checklist and Not done", () => {
  const step = (rung: string, status: string, detail = "", label = rung) => ev({ type: "proof.step", agent: "a", rung, label, status, detail, ms: 5 });
  const result = (verdict: string, steps: unknown[], tries = 1) => ev({ type: "proof.result", agent: "a", verdict, steps, tries });
  test("each check appears and updates in place as it moves from running to passed", () => {
    const m = run([...start, step("checks", "running", "", "Building and checking the code"), step("checks", "passed", "", "Building and checking the code"), step("tests", "running", "", "Running the tests")]);
    expect(m.task?.proof?.steps.map((s) => [s.rung, s.status])).toEqual([["checks", "passed"], ["tests", "running"]]);
  });
  test("a failed check says why in plain words and the task is marked not done", () => {
    const m = run([...start, step("browser", "failed", "The page threw an error: foo is not defined", "Opening it in a browser"),
      result("failed", [{ rung: "browser", label: "Opening it in a browser", status: "failed", detail: "The page threw an error: foo is not defined" }]),
      ev({ type: "agent.state", agent: "a", state: "error" })]);
    expect(m.task?.proof?.verdict).toBe("failed");
    expect(notDoneReason(m)).toBe("Opening it in a browser: The page threw an error: foo is not defined");
  });
  test("a passing result is not a Not done", () => {
    const m = run([...start, result("passed", [])]);
    expect(notDoneReason(m)).toBeNull();
  });
  test("a retry starts a fresh checklist instead of stacking on the old one", () => {
    const m = run([...start, step("browser", "failed", "boom"), result("failed", [], 1), step("checks", "running")]);
    expect(m.task?.proof?.steps.map((s) => s.rung)).toEqual(["checks"]);
    expect(m.task?.proof?.verdict).toBeUndefined();
  });
  test("a new task clears the old checklist", () => {
    const m = run([...start, step("browser", "passed"), result("passed", []), ...start]);
    expect(m.task?.proof).toBeUndefined();
  });
  test("the receipt carries whether the work was proven", () => {
    const m = run([...start, ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [], commands: 0, notUndoable: [], proof: "passed", usdEstimate: 0 })]);
    expect(m.receipt?.proof).toBe("passed");
  });
  test("a proof step does not break when there is no task yet", () => {
    expect(() => run([step("checks", "running")])).not.toThrow();
  });
  test("checking is shown as the word Checking", () => {
    expect(stateLabel("checking")).toBe("Checking");
  });
});

describe("the timeline of past tasks", () => {
  const task = (id: number, label: string, status: string, proof: string | null = null) => ({ id, label, status, usd: 0.04, startedAt: "2026-10-08T10:00:00Z", endedAt: "t", checkpoint: "cp_000" + id, changed: 1, proof });
  test("a list from the engine becomes the history", () => {
    const m = run([ev({ type: "tasks.list", project: "/p", tasks: [task(2, "add a page", "done", "passed"), task(1, "fix it", "not_done", "failed")] })]);
    expect(m.history.map((h) => h.label)).toEqual(["add a page", "fix it"]);
  });
  test("each line says in plain words how it ended", () => {
    expect(historyWords(task(1, "x", "done", "passed"))).toBe("Done, checked");
    expect(historyWords(task(1, "x", "done", "skipped"))).toBe("Done, not checked");
    expect(historyWords(task(1, "x", "not_done", "failed"))).toBe("Not done");
    expect(historyWords(task(1, "x", "interrupted"))).toBe("Stopped");
    expect(historyWords(task(1, "x", "error_max_budget_usd"))).toBe("Stopped at the spending limit");
    expect(historyWords(task(1, "x", "running"))).toBe("Running");
    expect(historyWords(task(1, "x", "error"))).toBe("Something went wrong");
  });
  test("a newer list replaces the old one", () => {
    const m = run([ev({ type: "tasks.list", project: "/p", tasks: [task(1, "a", "done")] }), ev({ type: "tasks.list", project: "/p", tasks: [] })]);
    expect(m.history).toEqual([]);
  });
});

describe("saying how many tries it took", () => {
  const res = (verdict: string, tries: number) => ev({ type: "proof.result", agent: "a", verdict, steps: [], tries });
  test("a pass on the first try says nothing extra", () => {
    expect(triesNote(run([...start, res("passed", 1)]))).toBeNull();
  });
  test("a pass after a fix says how many tries it took", () => {
    expect(triesNote(run([...start, res("failed", 1), res("passed", 2)]))).toBe("Fixed after 2 tries");
  });
  test("a failure after all tries says so", () => {
    expect(triesNote(run([...start, res("failed", 3)]))).toBe("Still failing after 3 tries");
  });
  test("no result yet means no note", () => {
    expect(triesNote(run([...start]))).toBeNull();
  });
});

describe("a failed check that Claude is still fixing", () => {
  const failed = ev({ type: "proof.result", agent: "a", verdict: "failed", steps: [], tries: 1 });
  test("while Claude is working again, it is fixing, not Not done", () => {
    const m = run([...start, failed, ev({ type: "agent.state", agent: "a", state: "working" })]);
    expect(isFixing(m)).toBe(true);
  });
  test("once everything has stopped on a failure, it is not fixing any more", () => {
    const m = run([...start, failed, ev({ type: "agent.state", agent: "a", state: "error" })]);
    expect(isFixing(m)).toBe(false);
    expect(notDoneReason(m)).not.toBeNull();
  });
  test("a task that never failed is never fixing", () => {
    expect(isFixing(run([...start, ev({ type: "agent.state", agent: "a", state: "working" })]))).toBe(false);
  });
});

describe("the word under the character", () => {
  const failed = ev({ type: "proof.result", agent: "a", verdict: "failed", steps: [{ rung: "checks", label: "Building", status: "failed", detail: "x" }], tries: 3 });
  test("a task that ended on a failed check says Not done, not Something went wrong", () => {
    expect(characterWords(run([...start, failed, ev({ type: "agent.state", agent: "a", state: "error" })]))).toBe("Not done");
  });
  test("a real error still says something went wrong", () => {
    expect(characterWords(run([...start, ev({ type: "agent.state", agent: "a", state: "error" })]))).toBe("Something went wrong");
  });
  test("while fixing it says so", () => {
    expect(characterWords(run([...start, failed, ev({ type: "agent.state", agent: "a", state: "working" })]))).toBe("Fixing a failed check");
  });
  test("an ordinary state keeps its usual word", () => {
    expect(characterWords(run([...start]))).toBe("Thinking");
  });
});

describe("Drive: the plan card and progress", () => {
  const plan = ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "Make the page" }, { id: 2, title: "Add a form" }], truncated: false, estimateUsd: 0.5 });
  test("a plan waiting for approval is shown with its steps and cost estimate", () => {
    const m = run([plan]);
    expect(m.plan).toMatchObject({ agent: "a", steps: ["Make the page", "Add a form"], truncated: false, estimateUsd: 0.5 });
  });
  test("the character asks for you while a plan waits", () => {
    expect(run([plan, ev({ type: "agent.state", agent: "a", state: "needsYou" })]).character).toBe("needsYou");
  });
  test("starting the work removes the plan card and shows progress", () => {
    const m = run([plan, ev({ type: "drive.step", agent: "a", index: 1, total: 2, title: "Make the page", status: "started" })]);
    expect(m.plan).toBeNull();
    expect(m.drive).toMatchObject({ index: 1, total: 2, title: "Make the page", status: "started" });
  });
  test("progress moves from step to step", () => {
    const m = run([plan, ev({ type: "drive.step", agent: "a", index: 1, total: 2, title: "Make the page", status: "started" }), ev({ type: "drive.step", agent: "a", index: 1, total: 2, title: "Make the page", status: "done" }), ev({ type: "drive.step", agent: "a", index: 2, total: 2, title: "Add a form", status: "started" })]);
    expect(m.drive).toMatchObject({ index: 2, status: "started", completed: 1 });
  });
  test("the finished plan says how far it got, in plain words", () => {
    const m = run([plan, ev({ type: "drive.step", agent: "a", index: 1, total: 2, title: "x", status: "done" }), ev({ type: "drive.done", agent: "a", status: "not_done", completed: 1, total: 2, usdEstimate: 0.1 })]);
    expect(driveWords(m)).toBe("Stopped after 1 of 2 steps: a check failed");
  });
  test("each ending has its own plain sentence", () => {
    const done = (status: string, completed: number) => driveWords(run([ev({ type: "drive.done", agent: "a", status, completed, total: 3, usdEstimate: 0 })]));
    expect(done("done", 3)).toBe("All 3 steps are done");
    expect(done("interrupted", 1)).toBe("Stopped after 1 of 3 steps: you stopped it");
    expect(done("error_max_budget_usd", 2)).toBe("Stopped after 2 of 3 steps: the spending limit was reached");
  });
  test("cancelling the plan removes the card", () => {
    expect(reduce(run([plan]), { type: "ui.planCancelled" } as never).plan).toBeNull();
  });
  test("a new plan replaces progress from an old one", () => {
    const m = run([ev({ type: "drive.done", agent: "a", status: "done", completed: 1, total: 1, usdEstimate: 0 }), plan]);
    expect(m.drive).toBeNull();
  });
  test("a plan that is too long says it was shortened", () => {
    expect(run([ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "x" }], truncated: true, estimateUsd: 0.2 })]).plan?.truncated).toBe(true);
  });
  test("the new commands are valid protocol", () => {
    expect(parseCommand(serialize(planDrive("/p", "a booking page"))).ok).toBe(true);
    expect(parseCommand(serialize(approvePlan(["a", "b"]))).ok).toBe(true);
  });
});
