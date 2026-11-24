// M119 (docs/milestones/M119-multi-agent-board.md): cross-repo shared context board and multi-agent attention state.
// Tests first (TDD): temporary folders only, no model calls, no network.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SharedBoard, formatBoardForStart } from "../src/sharedboard.ts";
import { attentionSummary, rankSessions, type AgentSession } from "../src/attention.ts";
import { DoneSignals } from "../src/donesignal.ts";
import { SessionStartNotes } from "../src/memory/sessionstart.ts";

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

      // The 24 Nov review: one repo's tasks and decisions never go into another project's block.
      const block = formatBoardForStart(reloaded, "web");
      expect(block).not.toContain("api: Add user.plan to applyDiscount");
      expect(block).not.toContain("Stripe key");
      expect(block).toContain("web: Update checkout call");
      expect(formatBoardForStart(reloaded, "api")).toContain("api: Add user.plan to applyDiscount");
      expect(formatBoardForStart(reloaded, "other")).toBe("");
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

  // The 24 Nov review: nothing writes to the board yet, and its lines would not be visible or forgettable in What I
  // remember (rule 15), so the session start block never includes it, even when the board has this repo's own tasks.
  test("SessionStartNotes.refresh never adds the shared board (kept off until its lines can be seen and forgotten)", () => {
    const dir = mkdtempSync(join(tmpdir(), "m119-start-"));
    const data = join(dir, "data");
    const proj = join(dir, "web");
    try {
      const signals = new DoneSignals(data);
      const start = new SessionStartNotes({ data, signals, memoryDir: join(dir, "mem") });
      const board = new SharedBoard(data);
      board.upsertTask({ id: "T1", repo: "api", title: "Ship billing v2", status: "in_progress", owner: "claude" });
      board.upsertTask({ id: "T2", repo: "web", title: "Fix the web header", status: "open", owner: "claude" });
      const view = start.refresh(proj);
      expect(view.text).not.toContain("Shared work across repos");
      expect(view.text).not.toContain("Ship billing v2");
      expect(view.text).not.toContain("Fix the web header");
      expect(view.forms.map((f) => f.text).join("\n")).not.toContain("Ship billing v2");
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
    // The 24 Nov review: the engine gives counts only; the words are the app's (app/src/strings.ts S.m119.headline).
    expect("headline" in summary).toBe(false);
  });

  test("handles empty or all-quiet sessions cleanly", () => {
    const summary = attentionSummary([s("a", "working", 10), s("b", "idle", 5)]);
    expect(summary.attentionCount).toBe(0);
    expect(summary.top).toBeNull();
    expect(summary.workingCount).toBe(1);
    expect("headline" in summary).toBe(false);
  });
});
