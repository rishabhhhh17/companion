// The founder's usage view (M116 step 5): the operator command `usage`, reached through POST /v1/operator with OPERATOR_KEY and
// printed on the founder's Mac by scripts/usage-report.ts. For one month: each account by owner id, sorted by cost, with its plan,
// requests, tokens and dollars; totals by plan and by model; today's model requests against Cloudflare's free daily limits; and
// anyone paying for two subscriptions at once. It reads only. No prompt or reply exists to show, and no email is printed unless
// --email asked for that one person.
//
// M116 step 5 review: one Worker request may make only so many calls to the store (Cloudflare counts each Durable Object call
// as a subrequest), so the server reads the owners a page at a time (USAGE_PAGE) and answers one page with a cursor. The
// founder's script (scripts/usage-report.ts) asks for every page and prints the report from all of them (usageLines).
import { dayKey, monthKey } from "./plans.ts";
import { countsNow, type ModelUse, type OwnerUsage, type RefundNeeded, type Store } from "./store.ts";
import type { OperatorResult } from "./operator.ts";
import { PRODUCT_S } from "./names.ts";

/** Cloudflare's free plan: rows written a day in Durable Objects, and Durable Object requests a day
 *  (https://developers.cloudflare.com/durable-objects/platform/pricing/). Both reset at 00:00 UTC. */
export const FREE_ROWS_PER_DAY = 100_000;
export const FREE_STORE_REQUESTS_PER_DAY = 100_000;
/** At most 3 rows written per model request (M116 step 3), and about 3 store requests each. */
export const ROWS_PER_MODEL_REQUEST = 3;
export const STORE_REQUESTS_PER_MODEL_REQUEST = 3;
/** The share of a free daily limit that, passed on WARN_DAYS or more of the last 7 days, earns a one line warning. */
export const WARN_SHARE = 0.7;
export const WARN_DAYS = 2;

/** Owners read in one Worker request: each is one store call, plus a few for the list and the refunds. The Workers Free plan
 *  allows 50 subrequests a request (https://developers.cloudflare.com/workers/platform/limits/), and this stays under that even
 *  if Durable Object calls count against it. [verify] whether they do, on a real deploy (step 12). */
export const USAGE_PAGE = 40;
/** The most pages the script asks for (40,000 accounts), so a bad cursor can never loop for ever. */
export const MAX_USAGE_PAGES = 1000;
const USAGE = [
  "Usage:",
  "  usage [--month YYYY-MM] [--email <address>] [--after <cursor>]",
  "  Reads only. Without --email no email is shown. One page of accounts a call; scripts/usage-report.ts reads them all.",
];
/** One page as the script reads it: the accounts on it (email only when --email asked and matched), the cursor for the next
 *  page (null on the last), and the refund lines (on the first page only). */
export type UsagePage = { month: string; today: string; owners: [string, OwnerUsage][]; next: number | null; refunds?: RefundNeeded[] };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const n = (x: number) => x.toLocaleString("en-US");
const usd = (x: number) => `$${(Math.round(x * 100) / 100).toFixed(2)}`;
const requests = (x: number) => `${n(x)} ${x === 1 ? "request" : "requests"}`;
const pct = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** Today's line against the free daily limits, and one warning line when they were passed on several of the last 7 days.
 *  `byDay`: model requests a day (UTC). Only model requests are counted: sign ins, /v1/me and update checks add a little. */
export function ceilingLines(byDay: readonly [string, number][], today: string): string[] {
  const todays = byDay.find(([d]) => d === today)?.[1] ?? 0;
  const rows = todays * ROWS_PER_MODEL_REQUEST, calls = todays * STORE_REQUESTS_PER_MODEL_REQUEST;
  const lines = [`Today (UTC): ${n(todays)} model requests. About ${n(rows)} of ${n(FREE_ROWS_PER_DAY)} rows written (${pct(rows, FREE_ROWS_PER_DAY)}) and about ${n(calls)} of ${n(FREE_STORE_REQUESTS_PER_DAY)} store requests (${pct(calls, FREE_STORE_REQUESTS_PER_DAY)}).`];
  const last7 = new Set<string>();
  const t = Date.parse(`${today}T00:00:00Z`);
  for (let i = 0; i < 7; i++) last7.add(dayKey(t - i * 86_400_000));
  const hot = byDay.filter(([d, c]) => last7.has(d) && (c * ROWS_PER_MODEL_REQUEST >= WARN_SHARE * FREE_ROWS_PER_DAY || c * STORE_REQUESTS_PER_MODEL_REQUEST >= WARN_SHARE * FREE_STORE_REQUESTS_PER_DAY)).length;
  if (hot >= WARN_DAYS) lines.push(`On ${hot} of the last 7 days the server passed ${Math.round(WARN_SHARE * 100)}% of a free daily limit. Moving to the $5 Workers plan is your call.`);
  return lines;
}

const add = (into: ModelUse, u: ModelUse) => { into.requests += u.requests; into.inputTokens += u.inputTokens; into.outputTokens += u.outputTokens; into.usd += u.usd; };
const zero = (): ModelUse => ({ requests: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
const byCost = (m: Map<string, ModelUse>) => [...m].sort(([a, x], [b, y]) => y.usd - x.usd || (a < b ? -1 : 1));

/** The refund lines that are money in the Dodo that is running now: once live, only live mode ones (a test card's payment is
 *  not in live Dodo). Audit run 2, finding 5, round 3. */
const refundsNow = async (store: Store, liveNow: boolean) => (await store.refundsNeeded()).filter((r) => countsNow(r, liveNow));

/** `liveNow`: Dodo is live, so a plan or subscription from test mode is not counted (audit run 2, finding 5, round 3). */
export async function runUsage(argv: string[], store: Store, now: () => number, liveNow = false): Promise<OperatorResult> {
  const bad = (why: string): OperatorResult => ({ code: 2, lines: [why, ...USAGE] });
  let month = monthKey(now()), email: string | undefined, after: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--month") { if (!v || !MONTH.test(v)) return bad("The month must look like 2026-11."); month = v; i++; }
    else if (a === "--email") { if (!v || !v.includes("@") || v.length > 320) return bad("An email address is needed after --email."); email = v.trim().toLowerCase(); i++; }
    else if (a === "--after") { if (!v || !/^\d{1,12}$/.test(v)) return bad("The cursor after --after is a number from the last page."); after = Number(v); i++; }
    else return bad("That option is not known.");
  }

  const at = now(), page = await store.ownerPage({ ...(after !== undefined ? { after } : {}), limit: USAGE_PAGE });
  const owners: [string, OwnerUsage][] = [];
  for (const o of page.owners) {
    const u = await store.ownerUsage(o, { month, now: at, ...(liveNow ? { liveNow: true } : {}) });
    if (email ? u.email?.toLowerCase() === email : true) owners.push([o, email ? u : { ...u, email: null }]);
  }
  const refunds = after === undefined ? await refundsNow(store, liveNow) : undefined;
  const data: UsagePage = { month, today: dayKey(at), owners, next: page.next, ...(refunds ? { refunds } : {}) };
  if (email && owners.length === 0 && page.next === null && after === undefined) return { code: 1, lines: ["No account has that email."], data };
  const lines = usageLines([data], email !== undefined);
  if (page.next !== null) lines.push(`More accounts: run again with --after ${page.next}. scripts/usage-report.ts reads every page for you.`);
  return { code: 0, lines, data };
}

/** The report, from every page read. `email`: one person was asked for, so their email is shown. */
export function usageLines(pages: readonly UsagePage[], email: boolean): string[] {
  const first = pages[0], month = first?.month ?? "", today = first?.today ?? "";
  const all = pages.flatMap((p) => p.owners), refunds = pages.flatMap((p) => p.refunds ?? []);
  const used = all.filter(([, u]) => u.total.requests > 0 || email).sort(([a, x], [b, y]) => y.total.usd - x.total.usd || (a < b ? -1 : 1));
  const lines: string[] = [];
  // Money first: a deleted account's payment was taken and nothing was given for it.
  if (refunds.length) {
    lines.push(`Refund needed: ${refunds.length} ${refunds.length === 1 ? "payment" : "payments"} reached Dodo for a deleted account, and nothing was given for ${refunds.length === 1 ? "it" : "them"}. Refund each in Dodo, then run: refunds done <id>.`);
    for (const r of refunds) lines.push(r.kind === "payment"
      ? `  payment ${r.id}${r.customerId ? ` (customer ${r.customerId})` : ""}, ${new Date(r.at).toISOString().slice(0, 10)}: refund it.`
      : `  subscription ${r.id}${r.customerId ? ` (customer ${r.customerId})` : ""}, ${new Date(r.at).toISOString().slice(0, 10)}: cancel it, and refund its payments.`);
  }
  lines.push(email ? `Usage for ${month} (UTC), one account.` : `Usage for ${month} (UTC). ${n(used.length)} ${used.length === 1 ? "account" : "accounts"} used ${PRODUCT_S} included use.`);
  for (const [o, u] of used) {
    lines.push(`${o} (${u.plan})${email ? `, ${u.email}` : ""}: ${requests(u.total.requests)}, ${n(u.total.inputTokens)} input and ${n(u.total.outputTokens)} output tokens, ${usd(u.total.usd)}`);
  }
  const plans = new Map<string, ModelUse>(), models = new Map<string, ModelUse>(), sum = zero();
  for (const [, u] of used) {
    add(sum, u.total);
    const p = plans.get(u.plan) ?? zero(); add(p, u.total); plans.set(u.plan, p);
    for (const [m, x] of u.byModel) { const y = models.get(m) ?? zero(); add(y, x); models.set(m, y); }
  }
  lines.push(`All accounts: ${requests(sum.requests)}, ${usd(sum.usd)}.`);
  if (plans.size) lines.push(`By plan: ${byCost(plans).map(([p, x]) => `${p} ${requests(x.requests)} ${usd(x.usd)}`).join("; ")}.`);
  if (models.size) lines.push(`By model: ${byCost(models).map(([m, x]) => `${m} ${requests(x.requests)} ${usd(x.usd)}`).join("; ")}.`);

  if (!email) {
    // The free limits are the whole server's, so they count everyone, whatever month was asked for.
    const days = new Map<string, number>();
    for (const [, u] of all) for (const [d, c] of u.byDay) days.set(d, (days.get(d) ?? 0) + c);
    lines.push(...ceilingLines([...days], today));
  }
  const twice = all.filter(([, u]) => u.liveSubs >= 2);
  if (twice.length) lines.push(`Two live subscriptions: ${twice.map(([o, u]) => `${o} (${u.liveSubs})`).join(", ")}. Refund one in Dodo.`);
  return lines;
}

const REFUND_ID = /^[A-Za-z0-9_.:-]{1,100}$/;
/** `refunds`: the refund lines. `refunds done <id>`: the operator refunded it in Dodo, so the line goes. */
export async function runRefunds(argv: string[], store: Store, liveNow = false): Promise<OperatorResult> {
  if (argv.length === 0) {
    const list = await refundsNow(store, liveNow);
    if (!list.length) return { code: 0, lines: ["No refund is needed."] };
    return { code: 0, lines: usageLines([{ month: "", today: "", owners: [], next: null, refunds: list }], false).filter((l) => l.startsWith("Refund needed") || l.startsWith("  ")) };
  }
  if (argv[0] === "done" && argv.length === 2 && REFUND_ID.test(argv[1])) {
    return (await store.clearRefund(argv[1])) ? { code: 0, lines: [`Done: ${argv[1]} is off the refund list.`] } : { code: 1, lines: ["That id is not on the refund list. Nothing was changed."] };
  }
  return { code: 2, lines: ["Usage:", "  refunds              the payments for deleted accounts to refund in Dodo", "  refunds done <id>    after you refunded it in Dodo"] };
}
