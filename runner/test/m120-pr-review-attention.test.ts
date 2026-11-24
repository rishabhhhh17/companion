// M120 (docs/milestones/M120-auto-pr-review.md): automated PR review entry and prioritization.
// Tests first: severity maps to the attention ladder, and a PR finding becomes an attention session.
import { describe, expect, test } from "bun:test";
import { attentionSummary, rankSessions, prFindingToSession, severityToState, type PrFinding } from "../src/attention.ts";

describe("M120 automated PR review attention", () => {
  const finding = (over: Partial<PrFinding>): PrFinding => ({
    id: "F1",
    repo: "web",
    pr: 42,
    severity: "medium",
    title: "Checkout calls old discount signature",
    summary: "Calls applyDiscount with the old shape",
    ...over,
  });

  test("maps blocker severity to needs approval", () => {
    expect(severityToState("blocker")).toBe("needs_approval");
  });

  test("maps high severity to blocked", () => {
    expect(severityToState("high")).toBe("blocked");
  });

  test("maps medium and lower severities to finished with issues", () => {
    expect(severityToState("medium")).toBe("finished_with_issues");
    expect(severityToState("low")).toBe("finished_with_issues");
    expect(severityToState("nit")).toBe("finished_with_issues");
  });

  test("turns a PR finding into an attention session for the repo and PR", () => {
    const session = prFindingToSession(finding({ severity: "blocker", pr: 7 }));
    expect(session.id).toBe("pr:web#7");
    expect(session.repo).toBe("web");
    expect(session.state).toBe("needs_approval");
    expect(session.summary).toContain("7");
  });

  test("ranks a blocker PR above a low severity PR through the existing attention ladder", () => {
    const blocker = prFindingToSession(finding({ severity: "blocker", pr: 7, repo: "web" }));
    const low = prFindingToSession(finding({ severity: "low", pr: 9, repo: "api" }));
    const ranked = rankSessions([low, blocker]);
    expect(ranked[0].id).toBe(blocker.id);
    expect(ranked[0].state).toBe("needs_approval");
    const summary = attentionSummary([low, blocker]);
    expect(summary.top?.id).toBe(blocker.id);
    expect(summary.attentionCount).toBe(2);
    expect("headline" in summary).toBe(false);
  });
});
