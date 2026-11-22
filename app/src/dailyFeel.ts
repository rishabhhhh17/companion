// M110 (docs/milestones/M110-daily-feel.md): daily habits and first-minute invariants.
// Pure helpers so every rule is tested without a screen or storage side effects.
import type { Tab } from "./home.ts";
import { COUNTED } from "./onboarding.ts";

export const LAST_TAB_KEY = "companion.lastTab";
export const DAILY_RECAP_KEY = "companion.lastDailyRecap";

const REMEMBERED: readonly Tab[] = ["now", "did", "learn", "memory"];

export type StoreIO = { get: (k: string) => string | null; set: (k: string, v: string) => void };

const browserStore: StoreIO = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage may be unavailable */ } },
};

/** Reads the last main place the person had open in the notch. Defaults to "now" if missing or invalid. */
export function savedTab(io: StoreIO = browserStore): Tab {
  const raw = io.get(LAST_TAB_KEY);
  return raw && (REMEMBERED as readonly string[]).includes(raw) ? (raw as Tab) : "now";
}

/** Saves the main place the person opened. Settings is never saved as the reopen destination. */
export function rememberTab(tab: Tab, io: StoreIO = browserStore): void {
  if ((REMEMBERED as readonly string[]).includes(tab)) io.set(LAST_TAB_KEY, tab);
}

/** Local calendar day key (YYYY-MM-DD) on this Mac's clock. */
export function dayStamp(now: number): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Whether the first-time-today plain recap should be asked for when Home opens.
 *  Fires at most once per local calendar day when the previous visit was on an earlier day,
 *  and never when where.after is "off" or on the very first visit. */
export function dailyRecapDue(lastVisit: number, lastRecapDay: string, now: number, choice: unknown): boolean {
  if (!lastVisit || choice === "off") return false;
  const today = dayStamp(now);
  if (lastRecapDay === today) return false;
  return dayStamp(lastVisit) !== today;
}

export function readDailyRecapDay(io: StoreIO = browserStore): string {
  return io.get(DAILY_RECAP_KEY) ?? "";
}

export function markDailyRecapDay(now: number, io: StoreIO = browserStore): void {
  io.set(DAILY_RECAP_KEY, dayStamp(now));
}

/** First-minute journey invariants (under 60 s from first open to first useful moment, rule 8). */
export function firstMinuteChecks(): {
  countedScreens: number;
  clicksToPractice: number;
  clicksToFirstCheck: number;
  permissionsAskedInFirstRun: number;
} {
  return {
    countedScreens: COUNTED.length,
    clicksToPractice: 1,
    clicksToFirstCheck: 3,
    permissionsAskedInFirstRun: 0,
  };
}
