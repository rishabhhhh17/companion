// Pro on the pages (the payments spec, sections 3, 4, 6, 8, 9a and 10; T17: Pro is a Dodo license key, checked on this
// Mac). Plain data only, so plan.test.ts can check every state: what the Plan card says and offers in each row of 9a, the
// limit card on Home, the card behind a Pro tag, where a Pro tag shows, Get Pro's two choices, and what Delete everything
// keeps. Everything comes from the shell's license_status (license.rs status_json) and the engine's plan.usage
// (runner/src/plan.ts). With payments off the shell answers { paymentsOn: false } without reading anything, and then every
// function here says what the app said before: Early access, no tag, no gate, no trial. The pages never see the key itself
// (only its last 4 characters) and never talk to Dodo: checkout and billing open in the person's own browser.
// Every word is in strings.ts; no dollar amount is written outside it.
import { S } from "./strings.ts";
import { WATERS } from "./lookfeel.ts";

/** The free fixes a month (the founder's call, 31 Oct 2026). The engine's plan.usage says the real number; this is only what
 *  the card says before that first arrives. */
export const FREE_FIXES = 3;
export const TRIAL_DAYS = 14;

/** keychain: the shell could not read the Keychain and has no plan decided yet; nothing is gated meanwhile. */
export type ProState = "off" | "free" | "trial" | "trialEnded" | "pro" | "proOverdue" | "proOffline" | "inactive" | "keychain";
export type Term = "yearly" | "monthly";
/** The shell's status (license_status, and the plan-status event), read with care: anything odd reads as payments off. */
export type PlanStatus = {
  paymentsOn: boolean;
  plan: "free" | "trial" | "pro";
  state: ProState;
  key: { last4: string; email: string; check: "ok" | "overdue" | "offline" | "inactive"; daysSinceCheck: number } | null;
  trial: { startedAt: string; endsAt: string; daysLeft: number; ended: boolean } | null;
  trialUsed: boolean;
  checkout: Record<Term, boolean>;
  portal: boolean;
};
/** The engine's free fix count (plan.usage). everUsed: a free fix was proven on this Mac before. */
export type Usage = { used: number; limit: number; resetsOn: string; everUsed: boolean };

export const OFF: PlanStatus = { paymentsOn: false, plan: "free", state: "off", key: null, trial: null, trialUsed: false, checkout: { yearly: false, monthly: false }, portal: false };

const STATES: readonly ProState[] = ["off", "free", "trial", "trialEnded", "pro", "proOverdue", "proOffline", "inactive", "keychain"];
const CHECKS = ["ok", "overdue", "offline", "inactive"] as const;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The status the shell sent, or payments off. Payments count as on only when the shell says so in so many words. */
export function statusFrom(v: unknown): PlanStatus {
  if (!v || typeof v !== "object") return OFF;
  const o = v as Record<string, unknown>;
  if (o.paymentsOn !== true) return OFF;
  const state = STATES.includes(o.state as ProState) && o.state !== "off" ? (o.state as ProState) : "free";
  const plan = o.plan === "pro" || o.plan === "trial" ? o.plan : "free";
  const k = o.key && typeof o.key === "object" ? (o.key as Record<string, unknown>) : null;
  const t = o.trial && typeof o.trial === "object" ? (o.trial as Record<string, unknown>) : null;
  const c = o.checkout && typeof o.checkout === "object" ? (o.checkout as Record<string, unknown>) : {};
  return {
    paymentsOn: true, plan, state,
    // Only the last 4 characters ever reach a page; anything longer is cut, so a page can never show more of a key.
    key: k ? { last4: str(k.last4).slice(-4), email: str(k.email), check: (CHECKS as readonly unknown[]).includes(k.check) ? (k.check as (typeof CHECKS)[number]) : "ok", daysSinceCheck: num(k.daysSinceCheck) } : null,
    trial: t ? { startedAt: str(t.startedAt), endsAt: str(t.endsAt), daysLeft: num(t.daysLeft), ended: t.ended === true } : null,
    trialUsed: o.trialUsed === true || !!t,
    checkout: { yearly: c.yearly === true, monthly: c.monthly === true },
    portal: o.portal === true,
  };
}
/** The engine's plan.usage, or null for anything else. */
export function usageFrom(e: unknown): Usage | null {
  if (!e || typeof e !== "object") return null;
  const o = e as Record<string, unknown>;
  if (typeof o.used !== "number" || typeof o.limit !== "number" || typeof o.resetsOn !== "string") return null;
  return { used: num(o.used), limit: num(o.limit), resetsOn: o.resetsOn, everUsed: o.everUsed === true || num(o.used) > 0 };
}

/** "2026-11-01" as "1 Nov". A date that cannot be read is said as the 1st of next month on this Mac. */
export function dayWords(day: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const month = m ? Number(m[2]) - 1 : (now.getMonth() + 1) % 12;
  const d = m ? Number(m[3]) : 1;
  return `${d} ${S.plan.months[Math.min(11, Math.max(0, month))]}`;
}

const limitOf = (u: Usage | null): number => (u && u.limit > 0 ? u.limit : FREE_FIXES);
const nextMonth = (u: Usage | null): string => dayWords(u?.resetsOn ?? "");

const two = (n: number) => String(n).padStart(2, "0");
/** This Mac's local day, YYYY-MM-DD, as the engine writes resetsOn (runner/src/plan.ts resetsOnOf). */
const localDay = (d: Date): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
/** The 1st of the month after `d`, local time, YYYY-MM-DD. */
const firstAfter = (d: Date): string => { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${n.getFullYear()}-${two(n.getMonth() + 1)}-01`; };
/** The count as it stands today. The engine says it again only when something happens, so on the 1st (local time) a count
 *  from last month is read as a new month's: none used, back on the next 1st. Then Fix it is never held back by a count the
 *  month already reset, and the engine stays the judge. */
export function usageNow(u: Usage | null, now: Date = new Date()): Usage | null {
  if (!u || !/^\d{4}-\d{2}-\d{2}$/.test(u.resetsOn) || localDay(now) < u.resetsOn) return u;
  return { ...u, used: 0, resetsOn: firstAfter(now) };
}

// ---------- the rows of 9a ----------

export type Row = "off" | "freeNew" | "free" | "freeLast" | "freeLimit" | "trial" | "trialEnded" | "pro" | "proOverdue" | "proOffline" | "inactive" | "keychain";

/** Which row of section 9a the Plan card is in. The free rows read the engine's count; before it arrives, "Free. 3 fixes a
 *  month." A trial that ended is Free again, so at the limit it is the limit row (with Get Pro only). */
export function planRow(s: PlanStatus, given: Usage | null, now: Date = new Date()): Row {
  if (!s.paymentsOn) return "off";
  const u = usageNow(given, now);
  switch (s.state) {
    case "off": return "off";
    case "keychain": return "keychain";
    case "trial": return "trial";
    case "pro": return "pro";
    case "proOverdue": return "proOverdue";
    case "proOffline": return "proOffline";
    case "inactive": return "inactive";
    case "trialEnded": return u && u.used >= limitOf(u) ? "freeLimit" : "trialEnded";
    case "free": {
      if (!u) return "freeNew";
      if (u.used >= limitOf(u)) return "freeLimit";
      if (!u.everUsed && u.used === 0) return "freeNew";
      return limitOf(u) - u.used === 1 ? "freeLast" : "free";
    }
  }
}

export type PlanButtonId = "trial" | "getPro" | "billing" | "otherMac" | "checkAgain" | "pasteKey" | "notNow";
export type PlanButton = { id: PlanButtonId; label: string; kind: "primary" | "secondary" | "quiet" };
/** A card's words and buttons. mark: a dot before the line (amber when Pro needs a look). At most one primary button. */
export type PlanCard = { row: Row; line: string; mark: "none" | "amber"; facts: string[]; buttons: PlanButton[] };

const btn = (id: PlanButtonId, kind: PlanButton["kind"]): PlanButton => ({ id, kind, label: S.plan.buttons[id] });

/** May the trial be offered here? Never with payments off, never twice on this Mac, never during Pro or a trial. In
 *  Settings only after the first proven fix (section 6); on the limit card and the card behind a Pro tag, always. */
export function trialOffered(where: "settings" | "card", s: PlanStatus, u: Usage | null): boolean {
  if (!s.paymentsOn || s.trialUsed || s.plan !== "free" || s.state === "trialEnded") return false;
  if (s.state === "inactive" || s.state === "proOffline") return false;   // a key is here: Pro is the way back, not a trial
  return where === "card" || !!u?.everUsed;
}
/** Try Pro free (the main button) and Get Pro, or Get Pro alone. */
const buyButtons = (trial: boolean): PlanButton[] => (trial ? [btn("trial", "primary"), btn("getPro", "secondary")] : [btn("getPro", "primary")]);

/** The Plan card on Account, for one row of section 9a. No renewal date, no price and no account row, in any state. */
export function planCard(s: PlanStatus, given: Usage | null, now: Date = new Date()): PlanCard {
  const u = usageNow(given, now);
  const row = planRow(s, u, now);
  const limit = limitOf(u);
  const card = (line: string, facts: string[], buttons: PlanButton[], mark: PlanCard["mark"] = "none"): PlanCard => ({ row, line, mark, facts, buttons });
  switch (row) {
    // Payments off: exactly today's card. Nothing to buy, nothing to check.
    case "off": return card(S.plan.earlyAccess, [S.plan.nothingCharged], []);
    case "freeNew": return card(S.plan.freeNew(limit), [], buyButtons(trialOffered("settings", s, u)));
    case "free": return card(S.plan.freeUsed(u?.used ?? 0, limit), [], buyButtons(trialOffered("settings", s, u)));
    case "freeLast": return card(S.plan.freeUsed(u?.used ?? 0, limit), [S.plan.lastFree(nextMonth(u))], buyButtons(trialOffered("settings", s, u)));
    case "freeLimit": return card(S.plan.limitLine(limit), [S.plan.backOn(nextMonth(u))], buyButtons(trialOffered("card", s, u)));
    case "trial": return card(S.plan.trialLine(s.trial?.daysLeft ?? 0), [], [btn("getPro", "primary")]);
    case "trialEnded": return card(S.plan.trialEnded(limit), [], [btn("getPro", "primary")]);
    // Billing shows only when the portal is filled in (status portal): a press would otherwise only say it is not ready.
    case "pro": return card(S.plan.keyEnds(s.key?.last4 ?? ""), s.key?.email ? [S.plan.keyFor(s.key.email)] : [], [...(s.portal ? [btn("billing", "secondary")] : []), btn("otherMac", "quiet")]);
    case "proOverdue": return card(S.plan.overdue(Math.max(10, s.key?.daysSinceCheck ?? 10)), [], [btn("checkAgain", "primary")], "amber");
    case "proOffline": return card(S.plan.offline, [S.plan.offlineWhy], [btn("checkAgain", "primary")], "amber");
    case "inactive": return card(S.plan.notActive, [S.plan.notActiveWhy], s.portal ? [btn("billing", "primary"), btn("pasteKey", "secondary"), btn("checkAgain", "quiet")] : [btn("pasteKey", "primary"), btn("checkAgain", "secondary")], "amber");
    case "keychain": return card(S.plan.keychainLine, [], [btn("checkAgain", "secondary")]);
  }
}

// ---------- the gate as the pages see it ----------

/** Does the plan cover Pro features (Ship, Recaps, extra water colours)? Always with payments off: nobody is gated. Also
 *  while the shell cannot read the Keychain (keychain): the engine gates nothing then either. */
export const proCovers = (s: PlanStatus): boolean => !s.paymentsOn || s.plan !== "free" || s.state === "keychain";
/** Is this Mac at its free fix limit now? Never with payments off, on Pro or in a trial, and never on a count the month
 *  already reset (usageNow). */
export const atLimit = (s: PlanStatus, given: Usage | null, now: Date = new Date()): boolean => {
  const u = usageNow(given, now);
  return !proCovers(s) && !!u && u.used >= limitOf(u);
};
/** The one quiet line under Fix it on Home before the last free fix (section 3), or none. */
export function lastFreeLine(s: PlanStatus, given: Usage | null, now: Date = new Date()): string | null {
  const u = usageNow(given, now);
  if (proCovers(s) || !u) return null;
  return limitOf(u) - u.used === 1 ? S.plan.lastFree(nextMonth(u)) : null;
}

export type ProFeature = "ship" | "recaps" | "looks";
/** A small Pro tag shows on a Pro feature only while payments are on and the plan does not cover it. */
export const proTag = (_f: ProFeature, s: PlanStatus): boolean => !proCovers(s);

/** "Looks" in Pro means extra water colours only (section 2): every water but the usual one. How lively, the theme, the
 *  size, the text size and the motion are free on every plan, and are never tagged. */
export const USUAL_WATER = "ocean";
export const PRO_WATERS: readonly string[] = WATERS.filter((w) => w !== USUAL_WATER);
export function proOnly(key: string, value: unknown): boolean {
  return key === "look.water" && typeof value === "string" && PRO_WATERS.includes(value);
}

export type LimitReason = "fixes" | "ship" | "recaps" | "looks";
/** What the engine said it did not start (plan.limit), or what a page saw it should not send. */
export type LimitView = { reason: LimitReason; resetsOn?: string; command?: string };
export type LimitCard = { lines: string[]; buttons: PlanButton[] };
/** The limit card on Home (section 3) and the card behind a Pro tag: calm, never an error, always a way out (Not now). The
 *  trial is the main button only while it is still unused. */
export function limitCard(v: LimitView, s: PlanStatus, given: Usage | null, now: Date = new Date()): LimitCard {
  const u = usageNow(given, now);
  const trial = trialOffered("card", s, u);
  const out = [...buyButtons(trial), btn("notNow", "quiet")];
  if (v.reason === "fixes") {
    const back = dayWords(v.resetsOn ?? u?.resetsOn ?? "");
    return { lines: [S.plan.limitLine(limitOf(u)), S.plan.limitBack(back)], buttons: out };
  }
  return { lines: [S.plan.partOfPro[v.reason], S.plan.stillFree], buttons: out };
}
/** Which plan.limit events get a card: a recap is asked by Home on its own, never by a press, so it never shows one. */
export const limitShown = (v: LimitView): boolean => v.reason !== "recaps";

// ---------- Get Pro ----------

export type Choice = { term: Term; label: string; ready: boolean };
/** Get Pro's two choices, Yearly first and nothing chosen for the person (section 4), and the lines under them. */
export function getProSheet(s: PlanStatus): { choices: Choice[]; lines: string[]; ready: boolean } {
  const choices: Choice[] = [
    { term: "yearly", label: S.plan.choose(S.plan.yearly, S.plan.yearlyPrice), ready: s.paymentsOn && s.checkout.yearly },
    { term: "monthly", label: S.plan.choose(S.plan.monthly, S.plan.monthlyPrice), ready: s.paymentsOn && s.checkout.monthly },
  ];
  const ready = choices.some((c) => c.ready);
  return { choices, ready, lines: [S.plan.usPrices, ...(s.plan === "trial" ? [S.plan.billingToday] : []), ready ? S.plan.opensBrowser : S.plan.notReady] };
}

/** A pasted key, tidied: spaces and line breaks from an email are dropped. The shell checks its shape again. */
export const tidyKey = (raw: string): string => raw.replace(/\s+/g, "");

/** The shell's short reason word, in calm words. Never the raw error: a sentence from somewhere else never reaches a page. */
export function planProblem(e: unknown): string {
  const word = String(e instanceof Error ? e.message : e ?? "").trim();
  return S.plan.problems[word] ?? S.plan.problems.other;
}
/** Delete everything's two reasons that come from Pro, or null for any other answer (which the page says as before). */
export const proDeleteProblem = (e: unknown): string | null => (["proUnreachable", "proKeychain"].includes(String(e)) ? planProblem(e) : null);

// ---------- Delete everything (section 10, Option 2) ----------

/** What the wipe screen hears about Pro (data_inventory's pro): null while payments are off. */
export type ProInventory = { keySaved: boolean; trialKept: boolean; fixCountResets: boolean } | null;
export function proInventoryFrom(v: unknown): ProInventory {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return { keySaved: o.keySaved === true, trialKept: o.trialKept === true, fixCountResets: o.fixCountResets !== false };
}
/** Ask "Also turn off Pro on this Mac?" only while payments are on and a Pro key is saved. */
export const askTurnOffPro = (p: ProInventory): boolean => !!p?.keySaved;
/** What Delete everything keeps: the projects always; the trial date once there is one (so a trial cannot restart); the Pro
 *  key when the person keeps it. */
export function deleteKeeps(p: ProInventory, turnOffPro: boolean): string[] {
  return [S.dangerKeepsProjects, ...(p?.trialKept ? [S.dangerKeepsTrial] : []), ...(p?.keySaved && !turnOffPro ? [S.plan.keptKey] : [])];
}
/** What it deletes that is Pro's: the free fix count starts again (it lives with the engine's data). */
export const deleteGoesPro = (p: ProInventory): string[] => (p?.fixCountResets ? [S.plan.fixCountGoes] : []);
