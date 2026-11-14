// M89 (research feature 5, group F in research-1113/user-needs.md, F1 to F9): how much of the person's Claude is left, for
// Squibby's own runs only. What the pinned Agent SDK (0.3.293) really gives:
//   - On the plan route (a Claude subscription, behind the remote switch, off until Anthropic says yes in writing): seen on one
//     real run with a Max plan login (M91, 14 Nov 2026, fixtures/real-run-1114). A `rate_limit_event` comes on every turn, even
//     with status allowed, not only near the limit. It has no top level utilization. The share used per window is in
//     `unifiedWindows` ({five_hour: {utilization: 0.2, resetsAt}, seven_day: {utilization: 0.46, resetsAt}}): a fraction from 0
//     to 1 and a reset in seconds since 1970. rateLimitType names one window (five_hour on that run, while the week was the
//     fuller one). unifiedWindows is not in the SDK's type yet; the top level utilization the type names is still read.
//   - On the API key route (the usual one), nothing about how much is left: no rate_limit_event even when the stand in sends
//     the plan headers, and the SDK's usage call says rate_limits_available false (m89-runway-spike.test.ts). Only a request
//     turned away with 429 is seen: an `api_retry` system message (error "rate_limit", error_status 429, retry_delay_ms) and,
//     when the tries run out, the reply's error "rate_limit".
// So a reading here is either the plan's own numbers, or "Claude turned a request away just now". Nothing is guessed from
// token counts. Numbers and times only: never a message's words, never an account or organisation id.

export type RunwayState = "ok" | "near" | "out";
export type RunwayWindow = "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "overage" | "other";
/** One reading. source plan: the plan's own numbers (rate_limit_event). source limit_hit: a request was turned away (429). */
export type RunwayReading = { state: RunwayState; source: "plan" | "limit_hit"; usedPct?: number; resetsAt?: string; window?: RunwayWindow; retryInS?: number;
  /** The M91 review: the fullest of the windows that reset after the one shown, so the reading still holds once the shown
   *  window resets (the pages switch to it then). Only a window with a share and a reset of its own. */
  nextPct?: number; nextResetsAt?: string; nextWindow?: RunwayWindow };

const WINDOWS: readonly RunwayWindow[] = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "overage"];
/** Seconds since 1970 to an ISO time, only for a time that makes sense (after 2020, before 2100). */
function isoFromSeconds(s: unknown): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  // The SDK says seconds; a value that already looks like milliseconds is taken as such rather than read as the year 50000.
  const ms = s > 1e12 ? s : s * 1000;
  return ms > Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? new Date(Math.round(ms)).toISOString() : undefined;
}
/** The share used as a whole percent from 0 to 100, for the top level utilization the SDK's type names without a unit. A value
 *  up to 1 is read as a fraction, above it as a percent. The real plan event (M91) carries no top level utilization; its
 *  windows are always fractions and are read with fractionPct. */
export function percentOf(u: unknown): number | undefined {
  if (typeof u !== "number" || !Number.isFinite(u) || u < 0) return undefined;
  const pct = u <= 1 ? u * 100 : u;
  return Math.min(100, Math.round(pct));
}
/** A window's share used (always a fraction, 0 to 1, as the real plan event sent it) as a whole percent. Above 1 (over the
 *  limit) is 100, never read as a percent. */
export function fractionPct(u: unknown): number | undefined {
  if (typeof u !== "number" || !Number.isFinite(u) || u < 0) return undefined;
  return Math.min(100, Math.round(u * 100));
}

const windowOf = (k: unknown): RunwayWindow | undefined => (typeof k === "string" ? (WINDOWS.includes(k as RunwayWindow) ? (k as RunwayWindow) : "other") : undefined);
type Candidate = { key: string; pct: number; resetsAt?: string };

/** A rate_limit_event from the SDK, as a reading. Null for anything that is not one, or one with no status it knows.
 *  Status allowed is room (ok), allowed_warning is near, rejected is out. The window shown is the one closest to its limit
 *  (unifiedWindows, plus a top level utilization for the window rateLimitType names); a tie goes to the named window. Near or
 *  reached, the named window is shown, since its reset is when work can go on (with no percent when it has no share). The
 *  fullest window that resets later rides along as next (the M91 review). */
export function fromRateLimitEvent(m: unknown): RunwayReading | null {
  const o = m as { type?: unknown; rate_limit_info?: Record<string, unknown> } | null;
  if (!o || o.type !== "rate_limit_event" || !o.rate_limit_info || typeof o.rate_limit_info !== "object") return null;
  const i = o.rate_limit_info;
  const state: RunwayState | null = i.status === "allowed" ? "ok" : i.status === "allowed_warning" ? "near" : i.status === "rejected" ? "out" : null;
  if (!state) return null;
  const named = typeof i.rateLimitType === "string" ? i.rateLimitType : undefined;
  const topReset = isoFromSeconds(i.resetsAt);
  const cands: Candidate[] = [];
  const w = i.unifiedWindows;
  if (w && typeof w === "object" && !Array.isArray(w)) {
    for (const [key, v] of Object.entries(w as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as { utilization?: unknown; resetsAt?: unknown };
      const pct = fractionPct(e.utilization);
      if (pct === undefined) continue;
      const r = isoFromSeconds(e.resetsAt) ?? (key === named ? topReset : undefined);
      cands.push({ key, pct, ...(r ? { resetsAt: r } : {}) });
    }
  }
  const top = percentOf(i.utilization);
  if (top !== undefined && named && !cands.some((c) => c.key === named)) cands.push({ key: named, pct: top, ...(topReset ? { resetsAt: topReset } : {}) });
  if (top !== undefined && !named && cands.length === 0) {
    return { state, source: "plan", usedPct: top, ...(topReset ? { resetsAt: topReset } : {}) };
  }
  // The M91 review: the fullest of the windows that reset after the one shown (a share and a reset of its own), carried so
  // the reading does not end when the shown window resets while another is still nearly full.
  const nextAfter = (key: string | undefined, reset: string | undefined): Partial<RunwayReading> => {
    if (!reset) return {};
    let n: Candidate | undefined;
    for (const c of cands) if (c.key !== key && c.resetsAt && c.resetsAt > reset && (!n || c.pct > n.pct)) n = c;
    return n ? { nextPct: n.pct, nextResetsAt: n.resetsAt!, nextWindow: windowOf(n.key)! } : {};
  };
  let pick: Candidate | undefined;
  if (state !== "ok" && named) {
    pick = cands.find((c) => c.key === named);
    // The M91 review: near or reached on a window with no share of its own (the Opus week, say) is that window, with the
    // top level reset and no percent, never the fullest other window with the wrong reset.
    if (!pick) return { state, source: "plan", ...(topReset ? { resetsAt: topReset } : {}), window: windowOf(named)!, ...nextAfter(named, topReset) };
  }
  if (!pick) for (const c of cands) if (!pick || c.pct > pick.pct || (c.pct === pick.pct && c.key === named)) pick = c;
  if (pick) {
    const window = windowOf(pick.key)!;
    return { state, source: "plan", usedPct: pick.pct, ...(pick.resetsAt ? { resetsAt: pick.resetsAt } : {}), window, ...nextAfter(pick.key, pick.resetsAt) };
  }
  const window = windowOf(named);
  return { state, source: "plan", ...(topReset ? { resetsAt: topReset } : {}), ...(window ? { window } : {}) };
}

/** An api_retry system message that says Claude turned the request away (429, rate_limit), as a reading. Null otherwise
 *  (a server error or an overloaded service is not the person's limit). */
export function fromRetry(m: unknown): RunwayReading | null {
  const o = m as { type?: unknown; subtype?: unknown; error?: unknown; error_status?: unknown; retry_delay_ms?: unknown } | null;
  if (!o || o.type !== "system" || o.subtype !== "api_retry") return null;
  if (o.error !== "rate_limit" && o.error_status !== 429) return null;
  const d = typeof o.retry_delay_ms === "number" && Number.isFinite(o.retry_delay_ms) && o.retry_delay_ms > 0 ? Math.min(24 * 3600, Math.ceil(o.retry_delay_ms / 1000)) : undefined;
  return { state: "out", source: "limit_hit", ...(d ? { retryInS: d } : {}) };
}

/** A reply that ended on Claude Code's own "rate_limit" error (the tries ran out), as a reading. */
export const limitHit = (): RunwayReading => ({ state: "out", source: "limit_hit" });

/** Whether a new reading says something the last one did not, so the same reading is not sent again on every reply. */
export function changed(last: RunwayReading | null, next: RunwayReading): boolean {
  if (!last) return true;
  return last.state !== next.state || last.source !== next.source || last.usedPct !== next.usedPct || last.resetsAt !== next.resetsAt || last.window !== next.window || last.nextPct !== next.nextPct || last.nextResetsAt !== next.nextResetsAt || last.nextWindow !== next.nextWindow || (next.source === "limit_hit");
}
