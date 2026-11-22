// M119 (docs/milestones/M119-multi-agent-board.md): cross-repo shared context board and multi-agent attention state.
// Tests first (TDD): temporary folders only, no model calls, no network.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SharedBoard, formatBoardForStart } from "../src/sharedboard.ts";
import { attentionSummary, rankSessions, type AgentSession } from "../src/attention.ts";

describe("M119 cross-repo shared context board", () => {
  test("persists tasks and decisions across repos and redacts secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "m119-board-"));
    try {
      const board = new SharedBoard(dir);
      const t1 = board.upsertTask({ id: "T1", repo: "api", title: "Add user.plan to applyDiscount", status: "in_progress", owner: "claude" });
      board.upsertTask({ id: "T2", repo: "web", title: "Update checkout call for new discount signature", status: "open", owner: "codex" });
      board.addDecision({ repo: "api", text: "Stripe key sk_live_1234567890abcdefghij stays on server only", source: "founder" });
      expect(t1.id).toBe("T1");

      const reloaded = new SharedBoard(dir).snapshot();
      expect(reloaded.tasks.length).toBe(2);
      expect(reloaded.decisions.length).toBe(1);
      expect(reloaded.decisions[0].text).not.toContain("sk_live_1234567890abcdefghij");

      const block = formatBoardForStart(reloaded, "web");
      expect(block).toContain("api: Add user.plan to applyDiscount");
      expect(block).toContain("web: Update checkout call");
      expect(block.split("\n").length).toBeLessThanOrEqual(20);
      expect(block).not.toContain("—");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("caps start block at 20 lines even with many tasks and decisions", () => {
    const dir = mkdtempSync(join(tmpdir(), "m119-cap-"));
    try {
      const board = new SharedBoard(dir);
      for (let i = 1; i <= 30; i++) {
        board.upsertTask({ id: `T${i}`, repo: i % 2 ? "web" : "api", title: `Task number ${i}`, status: "open", owner: "claude" });
      }
      const block = formatBoardForStart(board.snapshot(), "web");
      expect(block.split("\n").length).toBeLessThanOrEqual(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("M119 multi-agent attention ring", () => {
  const s = (id: string, state: AgentSession["state"], updatedAt: number): AgentSession => ({
    id,
    tool: "claude",
    repo: `repo-${id}`,
    state,
    summary: `Summary for ${id}`,
    updatedAt,
  });

  test("ranks sessions by urgency and flags attention ring only on states needing the person", () => {
    const sessions: AgentSession[] = [
      s("idle", "idle", 100),
      s("work", "working", 200),
      s("issues", "finished_with_issues", 150),
      s("blocked", "blocked", 120),
      s("approve", "needs_approval", 110),
    ];
    const ranked = rankSessions(sessions);
    expect(ranked.map((x) => x.id)).toEqual(["approve", "blocked", "issues", "work", "idle"]);
    expect(ranked.filter((x) => x.ring).map((x) => x.id)).toEqual(["approve", "blocked", "issues"]);

    const summary = attentionSummary(sessions);
    expect(summary.attentionCount).toBe(3);
    expect(summary.top?.id).toBe("approve");
    expect(summary.headline).toContain("3");
    expect(summary.headline).not.toContain("—");
  });

  test("handles empty or all-quiet sessions cleanly", () => {
    const summary = attentionSummary([s("a", "working", 10), s("b", "idle", 5)]);
    expect(summary.attentionCount).toBe(0);
    expect(summary.top).toBeNull();
    expect(summary.headline).toBe("1 agent working");
  });
});
