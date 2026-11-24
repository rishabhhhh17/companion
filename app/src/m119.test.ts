// M119 (docs/milestones/M119-multi-agent-board.md): the notch's attention line, from the engine's own attention summary
// (runner/src/attention.ts) over the sessions the model keeps waiting about. Pure: the line the notch says, the top session it
// rings for, and the sessions an approval, a stuck loop or a task ask makes.
import { describe, expect, test } from "bun:test";
import { attentionHeadline, attentionSessions, attentionTop } from "./notchFeed.ts";
import { initial } from "./model.ts";
import { S } from "./strings.ts";
import { attentionSummary, type AgentSession } from "../../runner/src/attention.ts";

const sess = (o: Partial<AgentSession> = {}): AgentSession => ({ id: "s1", tool: "claude", repo: "/Users/me/shop", state: "working", summary: "Editing src/app.tsx", updatedAt: 1, ...o });

describe("the notch's attention line", () => {
  test("the engine's own summary says what the notch repeats: one needs you, some working, all quiet", () => {
    const one = [sess({ state: "needs_approval" })];
    expect(attentionHeadline(one)).toBe("1 agent needs you");
    const mixed = [sess({ state: "blocked" }), sess({ id: "s2", state: "working", summary: "Running the checks" })];
    expect(attentionHeadline(mixed)).toBe("1 agent needs you");
    const twoWorking = [sess({ state: "working" }), sess({ id: "s2", state: "working" })];
    expect(attentionHeadline(twoWorking)).toBe("2 agents working");
    expect(attentionHeadline([])).toBe("All agents quiet");
  });
  test("the top session is the one needing the person, the most recent wait among equals", () => {
    const top = attentionTop([sess({ state: "working", updatedAt: 5 }), sess({ id: "s2", state: "blocked", updatedAt: 9 }), sess({ id: "s3", state: "blocked", updatedAt: 3 })]);
    expect(top?.id).toBe("s2");
  });
  // The 24 Nov review: the engine gives counts only; the notch's words are strings.ts's, over those counts.
  test("the notch's line is strings.ts's words over the engine's own counts", () => {
    const one = [sess({ state: "needs_approval" })];
    const c = attentionSummary(one);
    expect(attentionHeadline(one)).toBe(S.m119.headline(c.attentionCount, c.workingCount));
    expect("headline" in c).toBe(false);
  });
});

describe("the sessions the model's waiting states make", () => {
  test("nothing waiting means all quiet, and an approval is one agent needing you", () => {
    expect(attentionHeadline(attentionSessions(initial()))).toBe("All agents quiet");
    const m = { ...initial(), approvals: [{ id: "a1", agent: "claude", title: "Add a test for the checkout", risk: "low", checkpoint: "", expiresAt: new Date(Date.now() + 60000).toISOString(), action: "add_test" }] };
    expect(attentionSessions(m)).toHaveLength(1);
    expect(attentionHeadline(attentionSessions(m))).toBe("1 agent needs you");
  });
  test("a stuck loop is one agent needing you, and a task that asked is one agent needing you", () => {
    const stuck = { ...initial(), stuck: { index: 2, title: "Add a form", failure: { label: "Opening it in a browser", parts: { summary: "x is not defined", place: "App.tsx:3", raw: "boom" } }, options: [{ id: "different", label: "Try a different approach" }, { id: "stop", label: "Stop here" }], agent: "claude" } };
    expect(attentionHeadline(attentionSessions(stuck))).toBe("1 agent needs you");
    const asked = { ...initial(), task: { agent: "claude", project: "/Users/me/shop", label: "Add a form", lines: [{ id: "l1", text: "Add a form", tool: "claude", words: "Add a form", outcome: "needs_approval" as const }], costUsd: 0.1 } };
    expect(attentionHeadline(attentionSessions(asked))).toBe("1 agent needs you");
  });
});
