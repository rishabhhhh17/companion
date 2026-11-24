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

/** Counts only: the words the notch says are the app's (app/src/strings.ts S.m119.headline), never the engine's. */
export type AttentionSummary = {
  attentionCount: number;
  workingCount: number;
  top: RankedSession | null;
};

/** Summarizes multi-agent state: how many sessions need the person, how many are working, and the top one. */
export function attentionSummary(sessions: readonly AgentSession[]): AttentionSummary {
  const ranked = rankSessions(sessions);
  const attention = ranked.filter((s) => s.ring);
  const workingCount = ranked.filter((s) => s.state === "working").length;
  return { attentionCount: attention.length, workingCount, top: attention[0] ?? null };
}

// M120 (docs/milestones/M120-auto-pr-review.md): automated PR review entry and prioritization.
// A pull request finding becomes an attention session, and severity maps onto the urgency ladder.

export type ReviewSeverity = "blocker" | "high" | "medium" | "low" | "nit";

export type PrFinding = {
  id: string;
  repo: string;
  pr: number;
  severity: ReviewSeverity;
  title: string;
  summary: string;
};

const SEVERITY_STATE: Readonly<Record<ReviewSeverity, SessionState>> = {
  blocker: "needs_approval",
  high: "blocked",
  medium: "finished_with_issues",
  low: "finished_with_issues",
  nit: "finished_with_issues",
};

/** Maps a pull request review severity onto the attention urgency ladder. */
export function severityToState(sev: ReviewSeverity): SessionState {
  return SEVERITY_STATE[sev];
}

/** Turns a PR review finding into an attention session the notch can rank. */
export function prFindingToSession(f: PrFinding, now: number = Date.now()): AgentSession {
  return {
    id: `pr:${f.repo}#${f.pr}`,
    tool: "github",
    repo: f.repo,
    state: severityToState(f.severity),
    summary: `${f.pr}: ${f.title}`,
    updatedAt: now,
  };
}
