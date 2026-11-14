// M89 (research feature 5, group F in research-1113/user-needs.md, F1 to F9): how much of the person's Claude is left, for
// Squibby's own runs only. What the pinned Agent SDK (0.3.293) really gives, as the M89 spike found it
// (runner/test/m89-runway-spike.test.ts, docs/research/technical_research.md section 20):
//   - On the plan route (a Claude subscription, behind the remote switch, off until Anthropic says yes in writing), a
//     `rate_limit_event` with status allowed, allowed_warning or rejected, and when present the share of the window used
//     (utilization), which window (five_hour, seven_day, ...) and when it resets (resetsAt, seconds since 1970). [verify]: read
//     from the SDK's types only; no plan login was used, so a real event has not been seen.
//   - On the API key route (the usual one), nothing about how much is left: no rate_limit_event even when the stand in sends
//     the plan headers, and the SDK's usage call says rate_limits_available false. Only a request turned away with 429 is
//     seen: an `api_retry` system message (error "rate_limit", error_status 429, retry_delay_ms) and, when the tries run out,
//     the reply's error "rate_limit".
// So a reading here is either the plan's own numbers, or "Claude turned a request away just now". Nothing is guessed from
// token counts. Numbers and times only: never a message's words, never an account or organisation id.

export type RunwayState = "ok" | "near" | "out";
export type RunwayWindow = "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "overage" | "other";
/** One reading. source plan: the plan's own numbers (rate_limit_event). source limit_hit: a request was turned away (429). */
export type RunwayReading = { state: RunwayState; source: "plan" | "limit_hit"; usedPct?: number; resetsAt?: string; window?: RunwayWindow; retryInS?: number };

const WINDOWS: readonly RunwayWindow[] = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "overage"];
/** Seconds since 1970 to an ISO time, only for a time that makes sense (after 2020, before 2100). */
function isoFromSeconds(s: unknown): string | undefined {
  if (typeof s !== "number" || !Number.isFinite(s)) return undefined;
  // The SDK says seconds; a value that already looks like milliseconds is taken as such rather than read as the year 50000.
  const ms = s > 1e12 ? s : s * 1000;
  return ms > Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? new Date(Math.round(ms)).toISOString() : undefined;
}
/** The share used as a whole percent from 0 to 100. The SDK's type says utilization without a unit; the headers it is made
 *  from carry a fraction (0.91). A value up to 1 is read as a fraction, above it as a percent. [verify] on a real plan event. */
export function percentOf(u: unknown): number | undefined {
  if (typeof u !== "number" || !Number.isFinite(u) || u < 0) return undefined;
  const pct = u <= 1 ? u * 100 : u;
  return Math.min(100, Math.round(pct));
}

/** A rate_limit_event from the SDK, as a reading. Null for anything that is not one, or one with no status it knows. */
export function fromRateLimitEvent(m: unknown): RunwayReading | null {
  const o = m as { type?: unknown; rate_limit_info?: Record<string, unknown> } | null;
  if (!o || o.type !== "rate_limit_event" || !o.rate_limit_info || typeof o.rate_limit_info !== "object") return null;
  const i = o.rate_limit_info;
  const state: RunwayState | null = i.status === "allowed" ? "ok" : i.status === "allowed_warning" ? "near" : i.status === "rejected" ? "out" : null;
  if (!state) return null;
  const usedPct = percentOf(i.utilization);
  const resetsAt = isoFromSeconds(i.resetsAt);
  const window = typeof i.rateLimitType === "string" ? (WINDOWS.includes(i.rateLimitType as RunwayWindow) ? (i.rateLimitType as RunwayWindow) : "other") : undefined;
  return { state, source: "plan", ...(usedPct !== undefined ? { usedPct } : {}), ...(resetsAt ? { resetsAt } : {}), ...(window ? { window } : {}) };
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
  return last.state !== next.state || last.source !== next.source || last.usedPct !== next.usedPct || last.resetsAt !== next.resetsAt || last.window !== next.window || (next.source === "limit_hit");
}
