// The daily spending limit: how much of the person's own Claude each project may use in one day, by Companion's own
// estimate (the ledger). It only guards the person's own spend: we never pay for, resell or route anyone's Claude usage.
// The person can change it in Settings, within sane bounds; it is kept in Companion's data folder and read at start.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_DAILY_LIMIT_USD = 10;
export const MIN_DAILY_LIMIT_USD = 1;
export const MAX_DAILY_LIMIT_USD = 500;
export const SPENDING_FILE = "spending.json";
/** Said by the small answers that spend on the person's key outside a task (Draw it for me, the error explainer, Prompt help)
 *  once a project has reached its limit. */
export const LIMIT_REACHED = "This project has reached its daily spending limit. New work starts again tomorrow, or you can raise the limit in Settings.";
/** The same refusal for work that belongs to no project (nothing open, or the stand in project's own day): it must not say
 *  "this project". */
export const LIMIT_REACHED_NO_PROJECT = "You have reached your daily spending limit. New work starts again tomorrow, or you can raise the limit in Settings.";
/** The stand in project's name (the same string as NO_PROJECT in agent.ts, which imports this file, so it is not imported here;
 *  spending.test.ts checks they agree). */
const STAND_IN = "no-project";
/** The refusal words for work in this project: none named, or the stand in, gets the sentence without "this project". */
export const limitReached = (project?: string): string => (!project || project === STAND_IN ? LIMIT_REACHED_NO_PROJECT : LIMIT_REACHED);
/** The engine error for a task or plan that cannot start (the page turns the "daily_limit:" start into its own plain words). */
export const dailyLimitReason = (project?: string): string =>
  !project || project === STAND_IN
    ? "daily_limit: you have reached your daily limit. New work starts again tomorrow, or you can raise the limit."
    : "daily_limit: this project has reached its daily limit. New work starts again tomorrow, or you can raise the limit.";
const OUT_OF_BOUNDS = `The daily limit must be between ${MIN_DAILY_LIMIT_USD} and ${MAX_DAILY_LIMIT_USD} dollars.`;

/** A limit the person asked for: a number of dollars within the bounds, kept to cents. Anything else is refused in plain words. */
export function checkDailyLimit(n: unknown): { ok: true; usd: number } | { ok: false; reason: string } {
  if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false, reason: OUT_OF_BOUNDS };
  const usd = Math.round(n * 100) / 100;
  if (usd < MIN_DAILY_LIMIT_USD || usd > MAX_DAILY_LIMIT_USD) return { ok: false, reason: OUT_OF_BOUNDS };
  return { ok: true, usd };
}

/** Where the person's chosen limit is kept. A missing, damaged or out of bounds file means no choice was made. */
export class SpendingStore {
  constructor(private file: string) {}
  read(): number | null {
    try {
      const c = checkDailyLimit(JSON.parse(readFileSync(this.file, "utf8"))?.dailyLimitUsd);
      return c.ok ? c.usd : null;
    } catch { return null; }
  }
  /** Throws if it cannot be written, so the caller can keep the old limit and say so. */
  save(usd: number): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ dailyLimitUsd: usd }), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

/** The limit at start: a developer's setting (COMPANION_DAILY_CEILING_USD, used by the real Claude checks) first, then the
 *  person's saved choice, then the default. */
export function startingLimit(envValue: string | undefined, saved: number | null): number {
  const dev = Number(envValue);
  if (envValue && Number.isFinite(dev) && dev > 0) return dev;
  return saved ?? DEFAULT_DAILY_LIMIT_USD;
}
