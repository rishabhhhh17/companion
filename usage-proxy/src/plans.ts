// Plans and limits (F22, M13). The limits are real dollars of Anthropic cost, so they stay true when prices change. One table.
// Prices are not here: they live only in app/src/prices.json (M79), set by F25 as changed by the founder on 6 Nov 2026 and
// by F31 (13 Nov 2026). There is one paid plan, Pro, sold monthly and yearly; Max is gone (M97). A plan's model allowance
// stays well under its price (a test reads prices.json to hold that).
// The Pro allowance below was sized for the light features this proxy may carry (F22).
// It has not been checked against the cost of fixing now that Squibby pays for every job (F29). It is not changed here:
// M100 measures real fixes (runner/scripts/measure-fixes.ts, 10 fixture fixes on Squibby's own loop; real numbers need a
// run with --spend), allowanceReport below says how many an allowance covers, and the founder sets the number.
export type Plan = { name: string; dailyUsd: number; monthlyUsd: number };
export const PLANS: Record<string, Plan> = {
  free: { name: "free", dailyUsd: 0.2, monthlyUsd: 2 },
  pro: { name: "pro", dailyUsd: 0.75, monthlyUsd: 5 },
};
/** F25, M116 section 9 call 3: Pro includes the report (to be confirmed by the founder). While it does, a Pro person is never
 *  sold the report, and starts one without spending a credit. */
export const PRO_INCLUDES_REPORT = true;
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
/** May this user send another request? Refused at or over a limit. `need`: what the request is sure to cost on top of `spent`
 *  (its prompt, audit run 2 finding 6), refused when the two together pass a limit. Only its answer can run past: by its
 *  max_tokens (limited), and a few at the same time by that many times (the proxy limits how many run at once), each held
 *  while it runs so the next one sees it. */
export function budgetCheck(plan: Plan, spent: Spent, now: number, need = 0): Budget {
  if (spent.month >= plan.monthlyUsd || spent.month + need > plan.monthlyUsd) return { ok: false, reason: "month", resetsAt: nextReset("month", now) };
  if (spent.day >= plan.dailyUsd || spent.day + need > plan.dailyUsd) return { ok: false, reason: "day", resetsAt: nextReset("day", now) };
  return { ok: true };
}

// ---------- M97: how many fixes an allowance covers (the measuring, not the number) ----------

export type AllowanceReport = {
  plan: string; runs: number; medianUsd: number; highestUsd: number;
  perMonthTypical: number; perMonthDearest: number; perDayTypical: number; perDayDearest: number; lines: string[];
};
const cents = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${n.toFixed(2)}`;
const fits = (limit: number, cost: number) => Math.floor(limit / cost + 1e-9);
const fixes = (n: number, what: string) => (n === 0 ? "none" : `${n} ${what}${n === 1 ? "" : "es"}`);
const some = (n: number) => (n === 0 ? "none" : String(n));
/** From measured costs of whole fixes (dollars of model cost each, e.g. from M100's runs on fixture projects): how many a
 *  plan's allowance covers, for a typical (median) fix and the dearest one. Amounts that are not a real cost are left out;
 *  null when none is left. It reads and changes nothing. */
export function allowanceReport(plan: Plan, costsUsd: readonly number[]): AllowanceReport | null {
  const c = costsUsd.filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (c.length === 0) return null;
  const mid = c.length >> 1;
  const median = c.length % 2 ? c[mid] : (c[mid - 1] + c[mid]) / 2, highest = c[c.length - 1];
  const r = {
    plan: plan.name, runs: c.length, medianUsd: cents(median), highestUsd: cents(highest),
    perMonthTypical: fits(plan.monthlyUsd, median), perMonthDearest: fits(plan.monthlyUsd, highest),
    perDayTypical: fits(plan.dailyUsd, median), perDayDearest: fits(plan.dailyUsd, highest),
  };
  const day = `The daily allowance of ${usd(plan.dailyUsd)} covers about ${fixes(r.perDayTypical, "typical fix")} a day, or ${some(r.perDayDearest)} of the dearest`;
  return {
    ...r,
    lines: [
      `${plan.name}: ${fixes(r.runs, "measured fix")}. A typical one cost ${usd(r.medianUsd)} and the dearest ${usd(r.highestUsd)}.`,
      r.perMonthTypical === 0 ? `The monthly allowance of ${usd(plan.monthlyUsd)} is less than a typical fix.`
        : `The monthly allowance of ${usd(plan.monthlyUsd)} covers about ${fixes(r.perMonthTypical, "typical fix")}, or ${some(r.perMonthDearest)} of the dearest.`,
      r.perDayTypical === 0 ? `The daily allowance of ${usd(plan.dailyUsd)} is less than a typical fix, so a typical fix cannot finish in one day.`
        : r.perDayDearest === 0 ? `${day}: a fix that costs more than that cannot finish in one day.` : `${day}.`,
      "Nothing was changed. The allowance is the founder's call (M97, M100).",
    ],
  };
}
/** Measured costs from a JSON value: a list of amounts, a list of records with costUsd, { costsUsd: [...] }, or what
 *  runner/scripts/measure-fixes.ts --out saves ({ standIn, costsUsd, fixes: [{ costUsd }] }). */
export function costsFrom(v: unknown): number[] {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as { costsUsd?: unknown; fixes?: unknown }) : null;
  const list: unknown[] = Array.isArray(v) ? v : o && Array.isArray(o.costsUsd) ? o.costsUsd : o && Array.isArray(o.fixes) ? o.fixes : [];
  const out: number[] = [];
  for (const x of list) {
    const n = typeof x === "number" ? x : x && typeof x === "object" ? (x as { costUsd?: unknown }).costUsd : undefined;
    if (typeof n === "number") out.push(n);
  }
  return out;
}
