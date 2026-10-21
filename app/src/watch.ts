// Watch routines on the pages (F21): the plain logic behind the Watch list in Home's Now tab and the island's alert line. Every
// word a person reads is in strings.ts (rule 21); nothing here scores, praises or counts (rule 16).
import type { WatchKind, WatchView } from "../../protocol/index.ts";
import { WATCH_KINDS } from "../../protocol/index.ts";
import { S } from "./strings.ts";

export const SCHEDULE_CHOICES = ["5m", "15m", "30m", "1h", "daily"] as const;
export type ScheduleChoice = (typeof SCHEDULE_CHOICES)[number];

/** The schedule the engine takes for a choice in the form: "daily" with an hour is "daily@9". An hour outside 0 to 23 is 9. */
export function scheduleOf(choice: string, hour: number): string {
  if (choice === "daily") return `daily@${Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9}`;
  return (SCHEDULE_CHOICES as readonly string[]).includes(choice) ? choice : "30m";
}
/** The usual schedule choice from Settings (watch.schedule), kept to the ones the form offers. */
export const choiceOf = (v: unknown): ScheduleChoice => ((SCHEDULE_CHOICES as readonly string[]).includes(String(v)) ? (v as ScheduleChoice) : "30m");

export const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return url; } };

/** The watch as a short name: "Your site (example.com)", "Your latest Vercel deploy". */
export const nameOf = (w: Pick<WatchView, "kind" | "target">): string => (w.kind === "site_up" && w.target ? S.watch.siteName(hostOf(w.target)) : S.watch.names[w.kind] ?? S.watch.names.site_up);

/** A time as people say it: "10:02" today, "20 Oct at 09:05" on another day. */
export function whenText(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t), n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === n.toDateString() ? S.watch.today(hm) : S.watch.otherDay(`${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`, hm);
}

/** The watches of one project, in the order they were added (the engine sends them that way). */
export const watchesOf = (all: Record<string, WatchView>, project: string): WatchView[] => Object.values(all).filter((w) => w.project === project);

/** One line the person reads for a watch: its state, since when, and why. */
export function stateLine(w: WatchView, now: number = Date.now()): string {
  const s = S.watch.states[w.state] ?? w.state;
  if (w.checking) return `${s}. ${S.watch.checking}.`;
  return `${s} ${S.watch.since(whenText(w.since, now))}. ${w.reason}`.trim();
}

/** Valid events only: a damaged one is dropped, never guessed at. */
export function validView(v: unknown): v is WatchView {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.project === "string" && !!o.project && typeof o.watch === "string" && !!o.watch && (WATCH_KINDS as readonly string[]).includes(o.kind as string)
    && ["ok", "failing", "unknown", "paused"].includes(o.state as string) && typeof o.schedule === "string" && typeof o.since === "string" && typeof o.reason === "string" && Array.isArray(o.history);
}

/** The line and the task text for Fix it, from the evidence the engine sent. */
export const fixWhat = (kind: WatchKind, target?: string): string => (S.watch.fixWhat[kind] ?? S.watch.fixWhat.project_checks)(target ? hostOf(target) : "");
