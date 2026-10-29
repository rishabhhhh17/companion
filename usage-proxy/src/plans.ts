// Plans and limits (F22, M13). The limits are real dollars of Anthropic cost, so they stay true when prices change. One table.
// F25 (29 Oct 2026): Free, and Pro at $10 a month ($8 a month billed yearly). The model limits below are only for the light
// features this proxy may carry (F22); the fixing engine always runs on the person's own Claude. A plan's model allowance
// stays well under its price. "max" is no longer sold: it is kept so an entitlement written before F25 still reads.
export type Plan = { name: string; priceUsdMonthly: number; priceUsdYearly: number; dailyUsd: number; monthlyUsd: number };
export const PLANS: Record<string, Plan> = {
  free: { name: "free", priceUsdMonthly: 0, priceUsdYearly: 0, dailyUsd: 0.2, monthlyUsd: 2 },
  pro: { name: "pro", priceUsdMonthly: 10, priceUsdYearly: 96, dailyUsd: 0.75, monthlyUsd: 5 },
  max: { name: "max", priceUsdMonthly: 10, priceUsdYearly: 96, dailyUsd: 0.75, monthlyUsd: 5 },
};
/** An unknown plan name is never better than free. */
export const planOf = (name: unknown): Plan => (typeof name === "string" && Object.hasOwn(PLANS, name) ? PLANS[name] : PLANS.free);

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (ms: number): string => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const monthKey = (ms: number): string => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
/** When today, or this month, ends (UTC), in ms. */
export function nextReset(kind: "day" | "month", ms: number): number {
  const d = new Date(ms);
  return kind === "day" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export type Spent = { day: number; month: number };
export type Budget = { ok: true } | { ok: false; reason: "day" | "month"; resetsAt: number };
/** May this user send another request? Refused at or over a limit. One request can run past by what it costs (its size and
 *  max_tokens are limited), and a few at the same time past by that many times (the proxy limits how many run at once). */
export function budgetCheck(plan: Plan, spent: Spent, now: number): Budget {
  if (spent.month >= plan.monthlyUsd) return { ok: false, reason: "month", resetsAt: nextReset("month", now) };
  if (spent.day >= plan.dailyUsd) return { ok: false, reason: "day", resetsAt: nextReset("day", now) };
  return { ok: true };
}
