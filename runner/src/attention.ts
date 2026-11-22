// M119 (docs/milestones/M119-multi-agent-board.md): multi-agent attention ring and urgency ranking.
// Pure model for highlighting whichever agent session across repos/worktrees needs the person right now.

export type SessionState = "needs_approval" | "blocked" | "finished_with_issues" | "working" | "idle";

export type AgentSession = {
  id: string;
  tool: string;
  repo: string;
  state: SessionState;
  summary: string;
  updatedAt: number;
};

export type RankedSession = AgentSession & {
  ring: boolean;
  priority: number;
};

const PRIORITY: Readonly<Record<SessionState, number>> = {
  needs_approval: 0,
  blocked: 1,
  finished_with_issues: 2,
  working: 3,
  idle: 4,
};

const NEEDS_RING = new Set<SessionState>(["needs_approval", "blocked", "finished_with_issues"]);

/** Ranks sessions by urgency (approvals and blocked first, then most recently updated) and flags attention rings. */
export function rankSessions(sessions: readonly AgentSession[]): RankedSession[] {
  return sessions
    .map((s) => ({ ...s, ring: NEEDS_RING.has(s.state), priority: PRIORITY[s.state] }))
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : b.updatedAt - a.updatedAt));
}

export type AttentionSummary = {
  attentionCount: number;
  workingCount: number;
  top: RankedSession | null;
  headline: string;
};

/** Summarizes multi-agent state into a plain one-line headline for the notch. */
export function attentionSummary(sessions: readonly AgentSession[]): AttentionSummary {
  const ranked = rankSessions(sessions);
  const attention = ranked.filter((s) => s.ring);
  const workingCount = ranked.filter((s) => s.state === "working").length;
  const top = attention[0] ?? null;
  const headline = attention.length > 0
    ? `${attention.length} agent${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} you`
    : workingCount > 0
      ? `${workingCount} agent${workingCount === 1 ? "" : "s"} working`
      : "All agents quiet";
  return { attentionCount: attention.length, workingCount, top, headline };
}
