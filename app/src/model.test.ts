// What the character and cards show, decided by plain code that can be tested without a screen.
import { describe, expect, test } from "bun:test";
import { parseCommand, serialize } from "../../protocol/index.ts";
import { checkShip, askResearch, approvePlan, chooseLoop, diagnose, DIAGNOSE_MODEL, pauseDrive, planDrive, resumeDrive } from "./commands.ts";
import { canFollowUp, confirmable, costWords, lookState, resultShown, shipWords, phWords, blockedNote, pausedWords, driveWords, characterWords, formatUsd, historyWords, isFixing, triesNote, initial, motionFor, notDoneReason, plainError, plainPath, receiptVerdict, reduce, stateLabel, type Model } from "./model.ts";
import { S } from "./strings.ts";

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
  test("the most turns limit names the setting that stopped it, and never says try again", () => {
    const w = plainError("error_max_turns: the run stopped");
    expect(w).toBe(S.turnsStopped(S.set["work.maxTurns"].label));
    expect(w).toContain("Most turns in one task");
    expect(w).toContain("Settings");
    expect(w).not.toMatch(/error_max_turns|Something went wrong|Try again/i);
    expect(run([ev({ type: "protocol.error", reason: "error_max_turns: the run stopped" })]).error).toBe(w);
  });
  test("not connected tells you what to do", () => expect(plainError("engine error: Not connected: add your API key, or sign in with your Claude plan.")).toMatch(/add your API key/i));
  test("an unknown error is one plain sentence, never the raw words (they stay in the log)", () => { expect(plainError("engine error: boom")).toBe(S.somethingWrong); expect(plainError("engine error: boom")).not.toContain("boom"); });
  test("auth none shows a not connected notice, auth api_key clears it", () => {
    const m = run([ev({ type: "auth.status", method: "none" })]);
    expect(m.connected).toBe("none");
    expect(m.notice).toBe(S.notConnectedNotice);   // M69 (F29): never "add your key"; Home shows the setup list instead
    expect(m.notice).not.toMatch(/key/i);
    expect(run([ev({ type: "auth.status", method: "api_key" })], m).notice).toBeNull();
  });
  test("a saved key's check result is kept with when it came; a later status without one keeps it", () => {
    expect(initial().keyTested).toBeNull();
    const m = run([ev({ type: "auth.status", method: "api_key", tested: "refused" })]);
    expect(m.keyTested?.result).toBe("refused");
    expect(typeof m.keyTested?.at).toBe("number");
    expect(run([ev({ type: "auth.status", method: "api_key" })], m).keyTested).toEqual(m.keyTested);
    expect(run([ev({ type: "auth.status", method: "api_key", tested: "nonsense" })]).keyTested).toBeNull();
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
    expect(formatUsd(0)).toBe("0 cents");
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
    // M45: one plain sentence, never the raw output (that is behind Details on the step's row).
    expect(notDoneReason(m)).toBe(`Opening it in a browser: ${S.checkDidNotPass}`);
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
    expect(historyWords(task(1, "x", "done", "passed"))).toBe("Fixed and proven");
    expect(historyWords(task(1, "x", "done", "skipped"))).toBe("Changed, not proven");
    expect(historyWords(task(1, "x", "not_done", "failed"))).toBe("Not fixed yet");
    expect(historyWords(task(1, "x", "interrupted"))).toBe("Stopped");
    expect(historyWords(task(1, "x", "error_max_budget_usd"))).toBe("Stopped at this task's spending limit");
    expect(historyWords(task(1, "x", "error_max_turns"))).toBe(S.historyTurns);
    expect(S.historyTurns).not.toMatch(/Something went wrong/);
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
    expect(triesNote(run([...start, res("failed", 1), res("passed", 2)]))).toBe("Passed after 2 tries");
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
  test("a task that ended on a failed check says Not fixed yet, not Something went wrong", () => {
    expect(characterWords(run([...start, failed, ev({ type: "agent.state", agent: "a", state: "error" })]))).toBe(S.verdict.failed);
    const receipt = ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [{ file: "a.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "failed", usdEstimate: 0.01, ended: "failed", endedWhy: "check_failed" });
    expect(characterWords(run([...start, failed, receipt, ev({ type: "agent.state", agent: "a", state: "error" })]))).toBe(S.verdict.failed);
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
    expect(done("error_max_turns", 1)).toBe(`Stopped after 1 of 3 steps: ${S.driveTurns(S.set["work.maxTurns"].label)}`);
    expect(done("error_max_turns", 1)).toContain("Most turns in one task");
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

describe("Drive: the 'this keeps failing' card", () => {
  const stuck = ev({ type: "loop.stuck", agent: "a", index: 2, title: "Add a form", failure: { label: "Opening it in a browser", detail: "x is not defined" }, options: [{ id: "different", label: "Try a different approach" }, { id: "stop", label: "Stop here" }] });
  test("it shows the evidence and the options", () => {
    const m = run([stuck]);
    expect(m.stuck).toMatchObject({ index: 2, title: "Add a form", failure: { label: "Opening it in a browser", parts: { summary: S.checkDidNotPass, raw: "x is not defined" } } });
    expect(m.stuck?.options.map((o) => o.id)).toEqual(["different", "stop"]);
  });
  test("answering removes it", () => expect(reduce(run([stuck]), { type: "ui.stuckAnswered" } as never).stuck).toBeNull());
  test("the plan carrying on removes it too", () => {
    expect(run([stuck, ev({ type: "drive.step", agent: "a", index: 2, total: 3, title: "Add a form", status: "done" })]).stuck).toBeNull();
    expect(run([stuck, ev({ type: "drive.done", agent: "a", status: "not_done", completed: 1, total: 3, usdEstimate: 0 })]).stuck).toBeNull();
  });
  test("the answer is valid protocol", () => {
    expect(parseCommand(serialize(chooseLoop("different"))).ok).toBe(true);
    expect(parseCommand(serialize(chooseLoop("stop"))).ok).toBe(true);
  });
});

describe("the daily limit in plain words", () => {
  test("the error says what happened and what to do", () => {
    expect(plainError("daily_limit: this project has reached its daily limit. New work starts again tomorrow, or you can raise the limit.")).toBe("This project has reached its daily spending limit. New work starts again tomorrow, or you can raise the limit.");
  });
  test("with no project open the error does not say this project", () => {
    const w = plainError("daily_limit: you have reached your daily limit. New work starts again tomorrow, or you can raise the limit.");
    expect(w).toBe("You have reached your daily spending limit. New work starts again tomorrow, or you can raise the limit.");
    expect(w).not.toMatch(/project/i);
  });
  test("a plan that stopped on it says so", () => {
    expect(driveWords(run([ev({ type: "drive.done", agent: "a", status: "daily_limit", completed: 1, total: 3, usdEstimate: 0 })]))).toBe("Stopped after 1 of 3 steps: the daily limit for this project was reached");
  });
});

describe("Drive: paused because you took the wheel", () => {
  const paused = (reason: string, path?: string) => ev({ type: "drive.paused", agent: "a", reason, ...(path ? { path } : {}) });
  test("a pause shows why, in plain words", () => {
    expect(pausedWords(run([paused("files_changed", "src/app.js")]))).toBe("Paused because you changed src/app.js");
    expect(pausedWords(run([paused("editor")]))).toBe("Paused because you opened your editor");
    expect(pausedWords(run([paused("terminal")]))).toBe("Paused because you opened your terminal");
    expect(pausedWords(run([paused("you")]))).toBe("Paused because you asked it to");
  });
  test("it is not paused until told so", () => expect(pausedWords(run([...start]))).toBeNull());
  test("resuming clears the pause", () => expect(pausedWords(reduce(run([paused("editor")]), { type: "ui.resumed" } as never))).toBeNull());
  test("the plan carrying on or ending clears it too", () => {
    expect(pausedWords(run([paused("editor"), ev({ type: "drive.step", agent: "a", index: 1, total: 2, title: "x", status: "started" })]))).toBeNull();
    expect(pausedWords(run([paused("editor"), ev({ type: "drive.done", agent: "a", status: "interrupted", completed: 0, total: 1, usdEstimate: 0 })]))).toBeNull();
  });
  test("the commands are valid protocol", () => {
    expect(parseCommand(serialize(resumeDrive())).ok).toBe(true);
    expect(parseCommand(serialize(pauseDrive())).ok).toBe(true);
  });
});

describe("telling you when something was blocked", () => {
  const tool = (id: string, summary: string, outcome: string) => ev({ type: "agent.tool", agent: "a", tool: "Edit", summary, toolUseId: id, undoable: true, outcome });
  test("blocked and refused actions are listed in plain words", () => {
    const m = run([...start, tool("1", "Edit: pricing.txt", "blocked"), tool("2", "Write: index.html", "ran"), tool("3", "Running: git push", "denied")]);
    expect(blockedNote(m, "")).toBe("2 actions were not done: Edit: pricing.txt; Running: git push");
  });
  test("one blocked action reads naturally", () => {
    expect(blockedNote(run([...start, tool("1", "Edit: pricing.txt", "blocked")]), "")).toBe("1 action was not done: Edit: pricing.txt");
  });
  test("a step that was blocked and then allowed is not listed", () => {
    expect(blockedNote(run([...start, tool("1", "Running: git push", "needs_approval"), tool("1", "Running: git push", "ran")]), "")).toBeNull();
  });
  test("nothing blocked means no note", () => expect(blockedNote(run([...start, tool("1", "Write: a", "ran")]), "")).toBeNull());
  test("the project folder is left out of the file names", () => {
    expect(blockedNote(run([...start, tool("1", "Edit: /Users/me/proj/pricing.txt", "blocked")]), "/Users/me/proj")).toBe("1 action was not done: Edit: pricing.txt");
  });
});

describe("starting a plan clears the last task from the card", () => {
  const finished = [...start, ev({ type: "agent.tool", agent: "a", tool: "Edit", summary: "Edit: a.txt", toolUseId: "t", undoable: true, outcome: "ran" }), ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [{ file: "a.txt", kind: "added" }], commands: 0, notUndoable: [], proof: "skipped", usdEstimate: 0.01 })];
  test("asking for a plan removes the old task, receipt and error", () => {
    const m = reduce({ ...run(finished), error: "old problem" }, { type: "ui.planRequested" } as never);
    expect(m.task).toBeNull();
    expect(m.receipt).toBeNull();
    expect(m.error).toBeNull();
    expect(m.drive).toBeNull();
  });
  test("the plan arriving also leaves the card clean", () => {
    const m = run([...finished, ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "x" }], truncated: false, estimateUsd: 0.2 })]);
    expect(m.task).toBeNull();
    expect(m.receipt).toBeNull();
  });
});

describe("Rescue: the report", () => {
  const report = ev({ type: "rescue.report", agent: "a", summary: "A portfolio site made with Vite.", works: ["The pages are all there"], broken: "The build fails because a package is missing.", steps: [{ id: 1, title: "Install it" }, { id: 2, title: "Build again" }], evidence: [{ label: "Building and checking the code", status: "failed", detail: "Cannot find module 'left-pad'" }, { label: "Installing what the project needs", status: "skipped", detail: "Nothing new" }], estimateUsd: 0.5 });
  test("the report keeps what it is, what works and what is broken", () => {
    expect(run([report]).rescue).toMatchObject({ summary: "A portfolio site made with Vite.", works: ["The pages are all there"], broken: "The build fails because a package is missing." });
  });
  test("what the checks found is shown as plain lines, failures first", () => {
    expect(run([report]).rescue?.evidence.map((e) => e.status)).toEqual(["failed", "skipped"]);
  });
  test("the report arriving with its plan leaves the plan card ready", () => {
    const m = run([report, ev({ type: "plan.ready", agent: "a", steps: [{ id: 1, title: "Install it" }], truncated: false, estimateUsd: 0.5 })]);
    expect(m.rescue).not.toBeNull();
    expect(m.plan?.steps).toEqual(["Install it"]);
  });
  test("starting or cancelling the plan removes the report too", () => {
    expect(reduce(run([report]), { type: "ui.planCancelled" } as never).rescue).toBeNull();
    expect(run([report, ev({ type: "drive.step", agent: "a", index: 1, total: 2, title: "x", status: "started" })]).rescue).toBeNull();
  });
  test("asking for a new diagnosis clears the old one", () => {
    expect(reduce(run([report]), { type: "ui.planRequested" } as never).rescue).toBeNull();
  });
  test("the command is valid protocol", () => expect(parseCommand(serialize(diagnose("/p"))).ok).toBe(true));
  test("Rescue asks the stronger model for the diagnosis", () => expect((diagnose("/p") as any).model).toBe(DIAGNOSE_MODEL));
});

describe("Research: the notes card", () => {
  const done = ev({ type: "research.done", agent: "a", title: "Taking payments", answer: "Use a hosted checkout page.", notes: [{ text: "Checkout is hosted.", source: "https://docs.stripe.com/payments/checkout" }], file: ".companion/research/2026-10-09-taking-payments.md" });
  test("the answer, the notes with their sources and where they were filed", () => {
    expect(run([done]).research).toMatchObject({ title: "Taking payments", answer: "Use a hosted checkout page.", file: ".companion/research/2026-10-09-taking-payments.md" });
    expect(run([done]).research?.notes[0]).toEqual({ text: "Checkout is hosted.", source: "https://docs.stripe.com/payments/checkout" });
  });
  test("a new task or plan or question clears it", () => {
    expect(run([done, ...start]).research).toBeNull();
    expect(reduce(run([done]), { type: "ui.planRequested" } as never).research).toBeNull();
    expect(reduce(run([done]), { type: "ui.researchRequested" } as never).research).toBeNull();
  });
  test("it can be dismissed", () => expect(reduce(run([done]), { type: "ui.researchClosed" } as never).research).toBeNull());
  test("the command is valid protocol, and uses the everyday model", () => {
    const c = askResearch("/p", "How do I take payments?") as any;
    expect(parseCommand(serialize(c)).ok).toBe(true);
    expect(c.model).not.toBe(DIAGNOSE_MODEL);
  });
  test("an empty question makes no command", () => expect(askResearch("/p", "   ")).toBeNull());
});

describe("Prompt help on the card", () => {
  const stage = (s: string, o: Record<string, unknown> = {}) => ev({ type: "app.prompt_help", stage: s, ...o });
  const done = ev({ type: "assist.prompt.done", req: "ph_1", text: "Build a photo gallery page.", diff: [["-", "make"], ["+", "Build"], ["=", " a gallery thing"]], usdEstimate: 0.003, handback: "paste", question: "Open full size on click?", options: ["Yes", "No"] });
  test("pressing the hotkey lights the reading stage right away, with the app's name", () => {
    expect(run([stage("reading", { app: "Claude" })]).ph).toMatchObject({ stage: "reading", app: "Claude" });
  });
  test("the improved text streams in while it thinks", () => {
    const m = run([stage("thinking", { app: "Claude", req: "ph_1" }), ev({ type: "assist.prompt.delta", req: "ph_1", text: "Build a " }), ev({ type: "assist.prompt.delta", req: "ph_1", text: "photo gallery" })]);
    expect(m.ph).toMatchObject({ stage: "thinking", streaming: "Build a photo gallery" });
  });
  test("when it is done the card is ready with the diff, the question and quick answers", () => {
    const m = run([stage("thinking", { app: "Claude", req: "ph_1" }), done]);
    expect(m.ph).toMatchObject({ stage: "ready", text: "Build a photo gallery page.", handback: "paste", question: "Open full size on click?", options: ["Yes", "No"], req: "ph_1" });
    expect(m.ph?.diff[1]).toEqual(["+", "Build"]);
  });
  test("an error is shown in plain words and ends the stage", () => {
    expect(run([stage("thinking", { req: "ph_1" }), ev({ type: "assist.error", req: "ph_1", reason: "The improved version came out much longer than yours, so I left yours alone." })]).ph).toMatchObject({ stage: "error", message: "The improved version came out much longer than yours, so I left yours alone." });
  });
  test("a cancelled request leaves nothing on the card", () => {
    expect(run([stage("thinking", { req: "ph_1" }), ev({ type: "assist.error", req: "ph_1", reason: "cancelled" })]).ph).toBeNull();
  });
  test("a result belongs to its own request: one cancelled, or an older box's, never comes back", () => {
    const thinking = (req: string, app = "Claude") => stage("thinking", { app, req });
    const doneFor = (req: string) => ev({ type: "assist.prompt.done", req, text: "Better.", diff: [], handback: "paste" });
    // Cancelled while it thought: the result that still comes back is not shown again.
    expect(run([thinking("ph_1"), stage("dismissed"), doneFor("ph_1")]).ph).toBeNull();
    expect(run([thinking("ph_1"), stage("dismissed"), ev({ type: "assist.prompt.delta", req: "ph_1", text: "x" })]).ph).toBeNull();
    // A newer press in another box: the older box's answer is never taken as the newer box's.
    const m = run([thinking("ph_1"), stage("reading", { app: "Slack" }), thinking("ph_2", "Slack"), doneFor("ph_1"), ev({ type: "assist.prompt.delta", req: "ph_1", text: "old" })]);
    expect(m.ph).toMatchObject({ stage: "thinking", app: "Slack", req: "ph_2" });
    expect(m.ph?.text).toBeUndefined(); expect(m.ph?.streaming).toBeUndefined();
    // Still reading the newer box (no request yet): the older answer is not taken either.
    expect(run([thinking("ph_1"), stage("reading", { app: "Slack" }), doneFor("ph_1")]).ph).toMatchObject({ stage: "reading", app: "Slack" });
    // The older request's cancel or error never ends the newer one.
    expect(run([thinking("ph_2"), ev({ type: "assist.error", req: "ph_1", reason: "cancelled" })]).ph).toMatchObject({ stage: "thinking", req: "ph_2" });
    expect(run([thinking("ph_2"), ev({ type: "assist.error", req: "ph_1", reason: "Could not improve the prompt (x)" })]).ph?.stage).toBe("thinking");
    // Its own result is kept with its request, so Use it hands back the right one; an answer to its question is a new one.
    expect(run([thinking("ph_2"), doneFor("ph_2")]).ph).toMatchObject({ stage: "ready", text: "Better.", req: "ph_2" });
    expect(run([thinking("ph_2"), doneFor("ph_2"), stage("thinking", { req: "ph_3" }), doneFor("ph_3")]).ph).toMatchObject({ stage: "ready", app: "Claude", req: "ph_3" });
  });
  test("every ending has a message: pasted, copied, restored, refused", () => {
    for (const s of ["pasted", "copied", "restored", "refused", "error"]) expect(run([stage(s, { message: "Done." })]).ph?.message, s).toBe("Done.");
  });
  test("needing Accessibility, consent and nothing to read are their own stages", () => {
    expect(run([stage("needs_accessibility")]).ph?.stage).toBe("needs_accessibility");
    expect(run([stage("consent", { app: "Cursor" })]).ph).toMatchObject({ stage: "consent", app: "Cursor" });
    expect(run([stage("nothing_to_read", { app: "Cursor" })]).ph?.stage).toBe("nothing_to_read");
  });
  test("dismissing clears it", () => expect(run([stage("reading"), stage("dismissed")]).ph).toBeNull());
  test("a new press starts over, with the old text gone", () => {
    const m = run([stage("thinking", { req: "ph_1" }), done, stage("reading", { app: "Cursor" })]);
    expect(m.ph).toMatchObject({ stage: "reading", app: "Cursor" });
    expect(m.ph?.text).toBeUndefined();
  });
  test("a Prompt help event is not mistaken for the agent's task", () => {
    const m = run([stage("thinking", { req: "ph_1" }), done]);
    expect(m.ph?.stage).toBe("ready");
    expect(m.task).toBeNull();
    expect(m.character).toBe("idle");
  });
  test("what to show for each stage, in plain words", () => {
    expect(phWords(run([stage("reading", { app: "Claude" })]))).toBe("Reading your text in Claude");
    expect(phWords(run([stage("thinking", { app: "Claude" })]))).toBe("Improving it");
    expect(phWords(run([stage("needs_accessibility")]))).toMatch(/Accessibility/);
    expect(phWords(run([stage("nothing_to_read", { app: "Cursor" })]))).toMatch(/Cursor/);
    expect(phWords(run([]))).toBeNull();
  });
});

describe("Ship: the report on the card", () => {
  const gates = (o: Record<string, unknown> = {}) => ev({ type: "ship.gates", project: "/p", canShip: false, blockedBy: ["secrets"], needsYou: ["database_access"], confirmed: [], allowedCount: 0, gates: [
    { id: "checked", label: "The work was checked", status: "passed", detail: "The checks passed on this exact version." },
    { id: "secrets", label: "No secrets would be published", status: "blocked", detail: "Found a Stripe live key in src/pay.js (line 3).", findings: ["Found a Stripe live key in src/pay.js (line 3)."] },
    { id: "database_access", label: "Database access is protected", status: "could_not_check", detail: "I could not check your live database.", overridable: true },
  ], ...o });
  test("each gate is shown with its words, in order", () => {
    const m = run([gates()]);
    expect(m.ship?.gates.map((g) => [g.id, g.status])).toEqual([["checked", "passed"], ["secrets", "blocked"], ["database_access", "could_not_check"]]);
  });
  test("one plain sentence says whether it may ship", () => {
    expect(shipWords(run([gates()]))).toBe("Not ready to go live: 1 thing is blocking it and 1 needs you");
    expect(shipWords(run([gates({ canShip: true, blockedBy: [], needsYou: [], gates: [{ id: "checked", label: "x", status: "passed", detail: "" }] })]))).toBe("Ready to go live: every check passed");
    expect(shipWords(run([gates({ blockedBy: ["a", "b"], needsYou: [] })]))).toBe("Not ready to go live: 2 things are blocking it");
    expect(shipWords(run([]))).toBeNull();
  });
  test("only a gate that says it may be confirmed offers a confirm button", () => {
    const m = run([gates()]);
    expect(confirmable(m)).toEqual(["database_access"]);
  });
  test("the report keeps what you confirmed", () => {
    const m = run([gates({ confirmed: ["database_access"], canShip: true, blockedBy: [], needsYou: [] })]);
    expect(m.ship?.confirmed).toEqual(["database_access"]);
  });
  test("a new task or plan or closing clears it", () => {
    expect(run([gates(), ...start]).ship).toBeNull();
    expect(reduce(run([gates()]), { type: "ui.planRequested" } as never).ship).toBeNull();
    expect(reduce(run([gates()]), { type: "ui.shipClosed" } as never).ship).toBeNull();
  });
  test("the commands are valid protocol, and confirming names the gates", () => {
    expect(parseCommand(serialize(checkShip("/p", { runChecks: true }))).ok).toBe(true);
    expect((checkShip("/p", { confirm: ["database_access"] }) as any).confirm).toEqual(["database_access"]);
  });
});

describe("the engine's first words after a restart", () => {
  test("the restart notice is not wiped by the connection news the new engine sends right after it starts", () => {
    let m = run([{ type: "app.runner_restarted" }]);
    expect(m.notice).toBe(S.restartedNothing);
    m = run([{ type: "runner.hello" }, { type: "auth.status", method: "none" }, { type: "auth.status", method: "api_key" }], m);
    expect(m.notice).toBe(S.restartedNothing);
    expect(m.connected).toBe("api_key");
  });
  test("the not connected line comes and goes with the connection, and only that line", () => {
    let m = run([{ type: "auth.status", method: "none" }]);
    expect(m.notice).toBe(S.notConnectedNotice);
    m = run([{ type: "auth.status", method: "api_key" }], m);
    expect(m.notice).toBeNull();
    m = run([{ type: "app.notice", message: "Stopped everything." }, { type: "auth.status", method: "api_key" }], m);
    expect(m.notice).toBe("Stopped everything.");
  });
});

describe("M45: the receipt tells the truth", () => {
  const P = "/p";
  const begin = [ev({ type: "checkpoint.created", project: P, agent: "a", checkpoint: "cp_0001", label: "Before: fix the cart", files: 3, skipped: [] }), ev({ type: "agent.state", agent: "a", state: "working" })];
  const receipt = (o: Record<string, unknown> = {}) => ev({ type: "receipt", agent: "a", checkpoint: "cp_0001", changed: [{ file: "cart.js", kind: "modified" }], commands: 1, notUndoable: [], proof: "passed", usdEstimate: 0.05, ended: "done", ...o });
  const finished = (o: Record<string, unknown> = {}, state = "done") => run([...begin, receipt(o), ev({ type: "agent.state", agent: "a", state })]);
  const restored = (checkpoint = "cp_0001", safety = "cp_0002") => ev({ type: "checkpoint.restored", project: P, checkpoint, safety, recovered: [], largeLeftAlone: [], leftAlone: [] });

  test("receipt keeps how it ended", () => {
    expect(finished({ ended: "failed", endedWhy: "spending_limit", proof: "skipped" }, "error").receipt).toMatchObject({ end: "limit", limit: "spending" });
    expect(finished({ ended: "failed", endedWhy: "daily_limit", proof: "skipped" }, "error").receipt).toMatchObject({ end: "limit", limit: "daily" });
    expect(finished({ ended: "failed", endedWhy: "turns", proof: "skipped" }, "error").receipt).toMatchObject({ end: "limit", limit: "turns" });
    expect(finished({ ended: "failed", endedWhy: "no_connection", proof: "skipped" }, "error").receipt).toMatchObject({ end: "failed", failWhy: "noConnection" });
    expect(finished({ ended: "failed", endedWhy: "claude_busy", proof: "skipped" }, "error").receipt).toMatchObject({ end: "failed", failWhy: "claudeBusy" });
    expect(finished({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error").receipt).toMatchObject({ end: "failed", failWhy: "check" });
    expect(finished({ ended: "failed", proof: "skipped" }, "error").receipt).toMatchObject({ end: "failed", failWhy: "error" });
    expect(finished({ ended: "stopped", proof: "skipped" }, "idle").receipt?.end).toBe("stopped");
    expect(finished({ ended: "needs_you" }, "needsYou").receipt?.end).toBe("needsYou");
    expect(finished().receipt?.end).toBe("done");
    const old = finished({ ended: undefined });
    expect(old.receipt?.end, "no ending sent: unknown, never done").toBeUndefined();
  });

  test("undo marks the receipt and rests the character", () => {
    const m = run([ev({ type: "ui.undoAsked", checkpoint: "cp_0001" }), ev({ type: "ui.undoSent" }), restored()], finished());
    expect(m.receipt).toMatchObject({ undone: true, undoSafety: "cp_0002", back: false });
    expect(m.agents.a).toBe("idle");
    expect(m.character).toBe("idle");
    expect(receiptVerdict(m)?.kind).toBe("undone");
    // A task that ended in an error rests too.
    const e = run([restored()], finished({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error"));
    expect(e.agents.a).toBe("idle");
  });

  test("bisect undo marks the receipt", () => {
    const found = run([ev({ type: "ui.bisectAsked" }), ev({ type: "bisect.result", agent: "a", outcome: "found", task: { label: "fix the cart", at: "t", checkpoint: "cp_0001" }, undo: "safe" }), ev({ type: "ui.bisectUndoAsked" }), ev({ type: "ui.bisectUndoSent" })], finished());
    const m = run([ev({ type: "bisect.undone", project: P, checkpoint: "cp_0001", ok: true, reverted: ["cart.js"], safety: "cp_0009" })], found);
    expect(m.receipt).toMatchObject({ undone: true, undoSafety: "cp_0009", back: false });
    expect(m.agents.a).toBe("idle");
    expect(receiptVerdict(m)?.kind).toBe("undone");
  });

  test("bring back sets back, not a second undo", () => {
    const undone = run([ev({ type: "ui.undoAsked", checkpoint: "cp_0001" }), ev({ type: "ui.undoSent" }), restored()], finished());
    const asked = run([ev({ type: "ui.bringBackAsked" })], undone);
    expect(asked.undo).toEqual({ stage: "confirm", checkpoint: "cp_0002", back: true });
    const m = run([ev({ type: "ui.undoSent" }), restored("cp_0002", "cp_0003")], asked);
    expect(m.receipt).toMatchObject({ undone: true, back: true });
    expect(m.receipt?.undoSafety).toBeUndefined();
    expect(m.undo).toBeNull();
    expect(canFollowUp(m, P)).toBe(false);
    expect(receiptVerdict(m)?.kind).toBe("back");
    expect(receiptVerdict(m)?.offer).toBe("undo");
    // Undo again after bringing it back: undone once more, with the new safety copy.
    const again = run([ev({ type: "ui.undoAsked", checkpoint: "cp_0001" }), ev({ type: "ui.undoSent" }), restored("cp_0001", "cp_0004")], m);
    expect(again.receipt).toMatchObject({ undone: true, back: false, undoSafety: "cp_0004" });
  });

  test("a bisect undo of an earlier task leaves the last result alone", () => {
    // M45 review: "Which task broke it" found an older task (cp_0000) and undid only it. The last task's fix is still in the
    // files, so its result, its Undo and its words stay; only its conversation can no longer be followed up.
    const found = run([ev({ type: "ui.bisectAsked" }), ev({ type: "bisect.result", agent: "a", outcome: "found", task: { label: "add the cart", at: "t", checkpoint: "cp_0000" }, undo: "safe" }), ev({ type: "ui.bisectUndoAsked" }), ev({ type: "ui.bisectUndoSent" })], finished());
    const before = receiptVerdict(found);
    const m = run([ev({ type: "bisect.undone", project: P, checkpoint: "cp_0000", ok: true, reverted: ["cart.js"], safety: "cp_0009" })], found);
    expect(m.receipt?.undone).toBeUndefined();
    expect(m.receipt?.undoSafety).toBeUndefined();
    expect(m.receipt?.earlierUndone).toBe(true);
    expect(receiptVerdict(m)).toEqual(before!);
    expect(receiptVerdict(m)?.offer).toBe("undo");
    expect(m.bisect?.undoStage).toBe("done");
    expect(canFollowUp(m, P)).toBe(false);
    // An older task's question waits for nothing once its files changed under it (the engine refuses the answer).
    const asked = run([ev({ type: "bisect.undone", project: P, checkpoint: "cp_0000", ok: true, reverted: [], safety: "cp_0009" })],
      { ...found, receipt: { ...found.receipt!, asks: true, said: "Which colour?" }, agents: { a: "needsYou" }, character: "needsYou" });
    expect(asked.agents.a).toBe("idle");
  });

  test("bring back over the person's own edit says so and offers Put those back too", () => {
    const undone = run([ev({ type: "ui.undoAsked", checkpoint: "cp_0001" }), ev({ type: "ui.undoSent" }), restored()], finished());
    const asked = run([ev({ type: "ui.bringBackAsked" }), ev({ type: "ui.undoSent" })], undone);
    const m = run([ev({ type: "checkpoint.restored", project: P, checkpoint: "cp_0002", safety: "cp_0003", recovered: [], largeLeftAlone: [], leftAlone: [], yours: ["cart.js"] })], asked);
    expect(m.receipt).toMatchObject({ undone: true, back: true, backPartly: true });
    expect(m.undo).toMatchObject({ stage: "done", checkpoint: "cp_0002", back: true, yours: ["cart.js"] });
    const v = receiptVerdict(m)!;
    expect(v.kind).toBe("back");
    expect(v.line).toBe(S.verdict.backPartlyLine);
    expect(v.line).not.toContain("passed its checks");
    // Put those back too, with the safety copy: then the whole fix is back.
    const put = run([ev({ type: "ui.putBackAsked" }), ev({ type: "ui.putBackSent" }), ev({ type: "checkpoint.putBackDone", project: P, checkpoint: "cp_0002", ok: true, putBack: ["cart.js"], skipped: [] })], m);
    expect(put.receipt?.backPartly).toBeUndefined();
    expect(receiptVerdict(put)?.line).toBe(S.verdict.backLine);
  });

  test("another agent's error is not this result", () => {
    // M45 review: a proven fix, then an explain (agent b) fails. The overall character is error, but the result is still the
    // task's: the words do not say "Fixed and proven" for an error, and the error keeps its own words.
    const m = run([ev({ type: "agent.state", agent: "b", state: "error" })], finished());
    expect(m.character).toBe("error");
    expect(resultShown(m)).toBe(false);
    expect(characterWords(m)).toBe(stateLabel("error"));
    expect(resultShown(finished())).toBe(true);
  });

  test("only a proven fix takes the done look", () => {
    expect(lookState(finished())).toBe("done");
    expect(lookState(finished({ proof: "skipped" }))).toBe("idle");
    expect(lookState(finished({ proof: "partial" }))).toBe("idle");
    expect(lookState(finished({ proof: "skipped", changed: [] }))).toBe("idle");
    // Other states are drawn as they are.
    expect(lookState(finished({ ended: "failed", endedWhy: "check_failed", proof: "failed" }, "error"))).toBe("error");
  });

  test("What I did does not claim nothing changed when it does not know, and says when a fix is back", () => {
    expect(historyWords({ status: "done", proof: null, changed: null })).not.toBe(S.verdict.noChange);
    expect(historyWords({ status: "done", proof: null, changed: 0 })).toBe(S.verdict.noChange);
    expect(historyWords({ status: "done", proof: "passed", changed: 1, undone: true, back: true })).toBe(S.verdict.back);
    expect(historyWords({ status: "done", proof: "passed", changed: 1, undone: true })).toBe(S.verdict.undone);
  });

  test("a new receipt clears undone", () => {
    const undone = run([restored()], finished());
    const m = run([...begin, receipt()], undone);
    expect(m.receipt?.undone).toBeUndefined();
    expect(m.receipt?.back).toBeUndefined();
    expect(m.receipt?.undoSafety).toBeUndefined();
  });

  test("putting the fix back on a turn is not an Undo", () => {
    const turn = run([ev({ type: "ui.teachAsked", checkpoint: "cp_0001" }), ev({ type: "teach.ready", checkpoint: "cp_0001", made: true, target: { file: "b.js", line: 2, lineText: "x" }, restore: "cp_0003" })], finished());
    expect(receiptVerdict(turn)?.kind).toBe("turn");
    const back = run([ev({ type: "ui.teachRestore" }), restored("cp_0003", "cp_0004")], turn);
    expect(back.receipt?.undone, "the conversation no longer matches the files").toBe(true);
    expect(receiptVerdict(back)?.kind).toBe("proven");
  });

  test("notDoneReason has no raw output", () => {
    const m = run([...begin, ev({ type: "proof.result", agent: "a", verdict: "failed", tries: 1, steps: [{ rung: "tests", label: "Running the tests", status: "failed", detail: "Tests failed.\n  at x.ts:3 expected 2" }] })]);
    expect(notDoneReason(m)).toBe("Running the tests: Tests failed.");
  });

  test("loop card keeps raw output behind Details", () => {
    const m = run([ev({ type: "loop.stuck", agent: "a", index: 0, title: "Fix the cart", failure: { label: "Running the tests", detail: "Tests failed.\n  at x.ts:3 expected 2" }, options: [] })]);
    expect(m.stuck?.failure.label).toBe("Running the tests");
    expect(m.stuck?.failure.parts.summary).toBe("Tests failed.");
    expect(m.stuck?.failure.parts.raw).toContain("at x.ts:3");
    expect(m.stuck?.options.map((o) => o.label)).toEqual([S.stuckDifferent, S.stuckStop]);
  });

  test("historyWords for every status", () => {
    const h = (status: string, proof: string | null = null, undone?: boolean) => historyWords({ status, proof, changed: 1, ...(undone ? { undone } : {}) });
    expect(h("daily_limit")).toBe("Stopped at today's limit");
    expect(h("error_max_budget_usd")).toBe("Stopped at this task's spending limit");
    expect(h("error_max_turns")).toBe(S.historyTurns);
    expect(h("done", "passed", true)).toBe("Undone");
    expect(h("done", "passed")).toBe("Fixed and proven");
    expect(h("done", "partial")).toBe("Fixed, not fully proven");
    expect(h("done", "skipped")).toBe("Changed, not proven");
    expect(h("not_done", "failed")).toBe("Not fixed yet");
    expect(h("interrupted")).toBe("Stopped");
    expect(h("needs_you", "skipped")).toBe(S.historyNeedsYou);
    expect(h("no_connection")).toBe(S.historyNoConnection);
    expect(h("claude_busy")).toBe(S.historyClaudeBusy);
    expect(h("running")).toBe("Running");
    expect(h("error")).toBe("Something went wrong");
  });

  test("characterWords after a limit stop", () => {
    const m = finished({ ended: "failed", endedWhy: "spending_limit", proof: "skipped" }, "error");
    expect(characterWords(m)).toBe("Stopped at this task's spending limit");
    expect(characterWords(m)).not.toBe("Something went wrong");
    expect(characterWords(finished())).toBe("Fixed and proven");
    expect(characterWords(finished({ proof: "skipped" }))).toBe("Changed, not proven");
  });

  test("zero cost says No cost", () => {
    expect(costWords(0)).toBe(S.noCost);
    expect(costWords(0.05)).toBe("5 cents");
    expect(formatUsd(0)).toBe("0 cents");
  });

  test("tries say the check passed, and nothing after an Undo", () => {
    const res = (verdict: string, tries: number) => ev({ type: "proof.result", agent: "a", verdict, steps: [], tries });
    const m = run([...begin, res("failed", 1), res("passed", 2), receipt()]);
    expect(triesNote(m)).toBe(S.passedAfter(2));
    expect(triesNote(run([restored()], m))).toBeNull();
  });
});
