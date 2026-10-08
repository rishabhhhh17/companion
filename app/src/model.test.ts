// What the character and cards show, decided by plain code that can be tested without a screen.
import { describe, expect, test } from "bun:test";
import { formatUsd, initial, motionFor, plainError, plainPath, reduce, type Model } from "./model.ts";

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
