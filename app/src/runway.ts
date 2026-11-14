// M89 (research feature 5, the usage runway; complaints F1 to F9 in research-1113/user-needs.md): what the pages do with the
// runner's usage.runway readings and the jobs saved for after the reset. Only what Claude really reported (runner/src/runway.ts):
// the plan's own numbers on the plan route, or "a request was turned away just now" on either route. Nothing is guessed.
//   - The notch's panel shows a small ring with the share used and when it resets (runwayMark), when there is a reading and
//     Show how much of the Claude limit is used (runway.mark) is on.
//   - Before Hand Squibby the job or Rescue, a warning when the limit is close (warnBeforeJob, runway.warnAt), with Start
//     anyway, Save for after the reset and Not now.
//   - A saved job waits in Now until one tap starts it (savedRows).
import type { SavedJobView, UsageRunway } from "../../protocol/index.ts";
import { S } from "./strings.ts";
import { shortClock, shortDay } from "./clock.ts";
import { sentOutcome } from "./askbox.ts";

export type Runway = Pick<UsageRunway, "state" | "source" | "usedPct" | "resetsAt" | "window" | "retryInS"> & { at: number };
/** How long "Claude turned a request away" counts as near the limit when Claude named no reset: the API key route's limits
 *  are per minute, so a few minutes covers them, and the mark never stays up for hours on a guess. */
export const LIMIT_HIT_MS = 5 * 60_000;
export const WARN_AT = ["off", "70", "80", "90"] as const;
export type WarnAt = (typeof WARN_AT)[number];

const STATES = ["ok", "near", "out"];
const WINDOWS = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "overage", "other"];
/** A usage.runway event as the pages keep it, with when it arrived. Null for anything else or anything malformed. */
export function runwayFrom(e: unknown, now: number): Runway | null {
  const o = e as Record<string, unknown> | null;
  if (!o || o.type !== "usage.runway" || !STATES.includes(o.state as string) || (o.source !== "plan" && o.source !== "limit_hit")) return null;
  const pct = typeof o.usedPct === "number" && Number.isInteger(o.usedPct) && o.usedPct >= 0 && o.usedPct <= 100 ? o.usedPct : undefined;
  const reset = typeof o.resetsAt === "string" && !Number.isNaN(Date.parse(o.resetsAt)) ? o.resetsAt : undefined;
  const retry = typeof o.retryInS === "number" && o.retryInS > 0 && o.retryInS <= 86_400 ? o.retryInS : undefined;
  return { state: o.state as Runway["state"], source: o.source, at: now, ...(pct !== undefined ? { usedPct: pct } : {}), ...(reset ? { resetsAt: reset } : {}),
    ...(WINDOWS.includes(o.window as string) ? { window: o.window as Runway["window"] } : {}), ...(retry ? { retryInS: retry } : {}) };
}

/** The reading as it stands now: none once its window has reset, and a limit hit with no reset only for a few minutes (or
 *  as long as Claude said it waits, if longer). */
export function runwayNow(r: Runway | null | undefined, now: number): Runway | null {
  if (!r) return null;
  if (r.resetsAt && Date.parse(r.resetsAt) <= now) return null;
  if (r.source === "limit_hit" && !r.resetsAt && now - r.at > Math.max(LIMIT_HIT_MS, (r.retryInS ?? 0) * 1000)) return null;
  return r;
}

/** Whether a big job (Hand Squibby the job, Rescue) should ask first: the limit reached or close as Claude said, or the
 *  share used at or above the chosen mark. Off: never. */
export function warnBeforeJob(r: Runway | null | undefined, now: number, warnAt: unknown): boolean {
  const at = (WARN_AT as readonly unknown[]).includes(warnAt) ? (warnAt as WarnAt) : "80";
  if (at === "off") return false;
  const x = runwayNow(r, now);
  if (!x) return false;
  if (x.state === "out" || x.state === "near") return true;
  return x.usedPct !== undefined && x.usedPct >= Number(at);
}

/** When a job saved now should start (the M89 review): the reset Claude named, else, for a request turned away with no reset
 *  (the API key route, the usual one), the end of the wait that the reading counts for (LIMIT_HIT_MS, or as long as Claude
 *  said it waits). Undefined when there is neither. */
export function resetOrWait(r: Runway | null | undefined): string | undefined {
  if (!r) return undefined;
  if (r.resetsAt) return r.resetsAt;
  if (r.source === "limit_hit") return new Date(r.at + Math.max(LIMIT_HIT_MS, (r.retryInS ?? 0) * 1000)).toISOString();
  return undefined;
}

/** "at 3:40 pm", "tomorrow at 9:00 am" or "on Fri at 9:00 am", in the same clock style as the rest of Home (clock.ts).
 *  Empty when there is no reset. */
export function resetWords(iso: string | undefined, now: number, clock: (d: Date) => string = shortClock, day: (d: Date) => string = shortDay): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t), today = new Date(now);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (sameDay(d, today)) return S.m89.runway.at(clock(d));
  if (sameDay(d, tomorrow)) return S.m89.runway.tomorrowAt(clock(d));
  return S.m89.runway.onDayAt(day(d), clock(d));
}

export type RunwayLevel = "ok" | "near" | "out";
/** The notch's small ring: how full (0 to 1), the colour's meaning, the short text beside it and the sentence it says.
 *  Null when off, or when Claude has said nothing that still holds. Near means the plan said so, or 80% or more is used. */
export type RunwayMark = { level: RunwayLevel; fill: number; short: string; say: string };
export function runwayMark(r: Runway | null | undefined, now: number, on: unknown, reset: (iso: string | undefined) => string = (iso) => resetWords(iso, now)): RunwayMark | null {
  if (on === false) return null;
  const x = runwayNow(r, now);
  if (!x) return null;
  const when = reset(x.resetsAt);
  if (x.source === "limit_hit") return { level: "out", fill: 1, short: S.m89.runway.outShort, say: when ? S.m89.runway.sayOut(when) : S.m89.runway.sayHit };
  const pct = x.usedPct;
  const level: RunwayLevel = x.state === "out" ? "out" : x.state === "near" || (pct ?? 0) >= 80 ? "near" : "ok";
  // No share named: only a limit reached or close is worth a mark; "allowed" with no number says nothing.
  if (pct === undefined) return level === "ok" ? null : { level, fill: level === "out" ? 1 : 0.85, short: level === "out" ? S.m89.runway.outShort : "", say: level === "out" ? S.m89.runway.sayOut(when) : S.m89.runway.sayNear(when) };
  return { level, fill: Math.min(1, pct / 100), short: S.m89.runway.used(pct), say: level === "out" ? S.m89.runway.sayOut(when) : S.m89.runway.say(pct, when) };
}

/** The warning's title for the reading that raised it. */
export function warnTitle(r: Runway | null | undefined, now: number): string {
  const x = runwayNow(r, now);
  if (x?.source === "limit_hit") return S.m89.warn.titleHit;
  return x?.state === "out" ? S.m89.warn.titleOut : S.m89.warn.title;
}

/** The warning's line (the M89 review): what happens and when it resets, for the reading that raised it. Close: a big job can
 *  stop part way, and when it resets. Reached: it is reached, and when it resets. Turned away: until about when to wait (the
 *  same end of the wait a saved job keeps, resetOrWait). Off the record: nothing is saved. */
export function warnLine(r: Runway | null | undefined, now: number, offRecord: boolean, reset: (iso: string | undefined) => string = (iso) => resetWords(iso, now)): string {
  if (offRecord) return S.m89.warn.offRecord;
  const x = runwayNow(r, now);
  if (x?.source === "limit_hit") return S.m89.warn.hit(reset(resetOrWait(x)));
  const when = reset(x?.resetsAt);
  return x?.state === "out" ? S.m89.warn.out(when) : S.m89.warn.job(when);
}

/** A job by its words on one line (at most 90 characters), Rescue by name. */
export function jobTitle(kind: SavedJobView["kind"], prompt: string): string {
  if (kind === "rescue") return S.m89.saved.rescue;
  const words = prompt.replace(/\s+/g, " ").trim();
  return words.length > 90 ? `${words.slice(0, 89)}…` : words;
}

/** What an engine event means for a saved job just started (the M89 review: it leaves the list only once it really began).
 *  Hand Squibby the job: as for any task sent with Start (askbox.ts sentOutcome). Rescue: the agent at work (checking first),
 *  or refused, stopped before it began, or the engine stopped. */
export function savedStartOutcome(e: unknown, kind: SavedJobView["kind"], agent: string): "started" | "refused" | null {
  if (kind === "job") return sentOutcome(e, agent);
  const o = e as { type?: unknown; agent?: unknown; state?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  if (o.type === "app.runner_down") return "refused";
  if (o.agent !== agent) return null;
  if (o.type === "protocol.error") return "refused";
  if (o.type === "agent.state") return o.state === "idle" ? "refused" : o.state === "checking" || o.state === "thinking" || o.state === "working" ? "started" : null;
  if (o.type === "plan.ready" || o.type === "rescue.report") return "started";
  return null;
}

/** A saved job as Now shows it: its words (Rescue by name), whether its reset has passed, and the line under it. */
export type SavedRow = { id: string; kind: SavedJobView["kind"]; title: string; ready: boolean; line: string; prompt: string };
export function savedRows(jobs: readonly SavedJobView[] | null | undefined, now: number, reset: (iso: string | undefined) => string = (iso) => resetWords(iso, now)): SavedRow[] {
  return (jobs ?? []).map((j) => {
    const ready = !j.resetsAt || Date.parse(j.resetsAt) <= now;
    return { id: j.id, kind: j.kind, prompt: j.prompt, title: jobTitle(j.kind, j.prompt), ready, line: ready ? S.m89.saved.ready : S.m89.saved.waits(reset(j.resetsAt)) };
  });
}
/** The saved jobs in a jobs.saved event for this project, or null when the event is about something else. */
export function savedFrom(e: unknown, project: string): SavedJobView[] | null {
  const o = e as { type?: unknown; project?: unknown; jobs?: unknown } | null;
  if (!o || o.type !== "jobs.saved" || o.project !== project || !Array.isArray(o.jobs)) return null;
  return o.jobs.filter((j): j is SavedJobView => !!j && typeof j === "object" && typeof (j as SavedJobView).id === "string" && typeof (j as SavedJobView).prompt === "string" && ((j as SavedJobView).kind === "job" || (j as SavedJobView).kind === "rescue")).slice(0, 10);
}
