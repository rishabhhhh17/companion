// Detection beyond the daily cap (Anthropic's support asked for it, 27 Oct 2026). It reads only the small request records (counts,
// cost, times: never text) and names the owners a person should look at. A signal is a reason to look, never a reason to cut off:
// a heavy honest user raises them too. The thresholds are in one place, and the output is the same every time for the same records.
import { dayKey, planOf } from "./plans.ts";
import type { Store, UsageRecord } from "./store.ts";

export const LIMITS = {
  /** "Near the limit" means this share of the plan's daily limit... */
  nearLimitShare: 0.9,
  /** ...on this many of the last 7 days. */
  nearLimitDays: 3,
  /** This many requests inside any window of burstSeconds. */
  burstRequests: 40,
  burstSeconds: 300,
  /** Today's cost this many times the owner's own average over the 6 days before (never below jumpFloorUsd as the baseline),
   *  and at least jumpMinUsd in absolute terms. */
  jumpTimes: 5,
  jumpFloorUsd: 0.1,
  jumpMinUsd: 0.5,
};
const DAY = 86_400_000, WEEK_DAYS = 7;

export type Signal = { ownerId: string; kind: "at_limit" | "burst" | "jump"; detail: string; metadataUserId: string };
const usd = (n: number) => `$${n.toFixed(2)}`;

export function findSignals(records: UsageRecord[], now: number): Signal[] {
  const byOwner = new Map<string, UsageRecord[]>();
  for (const r of records) { if (r.at > now) continue; (byOwner.get(r.userId) ?? byOwner.set(r.userId, []).get(r.userId)!).push(r); }
  const out: Signal[] = [];
  for (const ownerId of [...byOwner.keys()].sort()) {
    const rs = byOwner.get(ownerId)!.sort((a, b) => a.at - b.at);
    const last = rs[rs.length - 1], plan = planOf(last.plan), sent = last.metadataUserId;
    const weekStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - (WEEK_DAYS - 1) * DAY;
    const perDay = new Map<string, number>();
    for (const r of rs) if (r.at >= weekStart) perDay.set(dayKey(r.at), (perDay.get(dayKey(r.at)) ?? 0) + r.usd);

    const nearDays = [...perDay.values()].filter((v) => v >= plan.dailyUsd * LIMITS.nearLimitShare).length;
    if (nearDays >= LIMITS.nearLimitDays) out.push({ ownerId, kind: "at_limit", metadataUserId: sent, detail: `near the ${plan.name} daily limit (${usd(plan.dailyUsd)}) on ${nearDays} of the last ${WEEK_DAYS} days` });

    const win = LIMITS.burstSeconds * 1000;
    for (let i = 0, j = 0; i < rs.length; i++) {
      while (rs[i].at - rs[j].at > win) j++;
      if (i - j + 1 >= LIMITS.burstRequests) { out.push({ ownerId, kind: "burst", metadataUserId: sent, detail: `${LIMITS.burstRequests} or more requests within ${LIMITS.burstSeconds / 60} minutes (around ${new Date(rs[i].at).toISOString()})` }); break; }
    }

    const today = perDay.get(dayKey(now)) ?? 0;
    let before = 0;
    for (let n = 1; n <= WEEK_DAYS - 1; n++) before += perDay.get(dayKey(now - n * DAY)) ?? 0;
    const baseline = Math.max(before / (WEEK_DAYS - 1), LIMITS.jumpFloorUsd);
    if (today >= LIMITS.jumpMinUsd && today >= baseline * LIMITS.jumpTimes) out.push({ ownerId, kind: "jump", metadataUserId: sent, detail: `today ${usd(today)} against about ${usd(baseline)} a day before` });
  }
  return out;
}

/** What the operator command prints. Plain sentences, ids and counts only. */
export async function signalLines(store: Store, now: number): Promise<string[]> {
  const found = findSignals(await store.recordsSince(now - (WEEK_DAYS + 1) * DAY), now);
  if (found.length === 0) return ["No signals. Nothing looks unusual in the last 7 days."];
  return [
    `${found.length} thing${found.length === 1 ? "" : "s"} to look at. A signal is a reason to look, not to cut off.`,
    ...found.map((s) => `- ${s.ownerId} (id Anthropic sees: ${s.metadataUserId}): ${s.kind.replace("_", " ")}: ${s.detail}`),
  ];
}
