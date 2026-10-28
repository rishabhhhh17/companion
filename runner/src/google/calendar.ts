// Google Calendar over its REST API, on the account's main calendar: list events, find free time, and create an event.
// Creating one changes the person's calendar (and invites people), so calendar_create needs their tap (tools.ts).
import { GoogleError, type GoogleClient } from "./core.ts";

const API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_MAX_EVENTS = 50;
export const FREE_MAX_SLOTS = 10;

type When = { dateTime?: string; date?: string };
type Event = { summary?: string; start?: When; end?: When; location?: string; attendees?: unknown[]; status?: string };

/** A time the person or the AI gave, checked. Throws a plain refusal when it is not a time. */
export function time(v: string, what: string): Date {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) throw new GoogleError(`The ${what} "${v}" is not a time I can read. Use a form like 2026-11-03T14:00:00+01:00.`);
  return d;
}
function range(from: string, to: string): [Date, Date] {
  const a = time(from, "start of the range");
  const b = time(to, "end of the range");
  if (b <= a) throw new GoogleError("The end of the range must come after its start.");
  return [a, b];
}
const whenText = (w: When | undefined) => w?.dateTime ?? (w?.date ? `${w.date} (all day)` : "");

export async function calendarList(c: GoogleClient, from: string, to: string, max?: number): Promise<string> {
  const [a, b] = range(from, to);
  const n = Math.max(1, Math.min(Math.floor(max ?? CALENDAR_MAX_EVENTS), CALENDAR_MAX_EVENTS));
  const q = `timeMin=${encodeURIComponent(a.toISOString())}&timeMax=${encodeURIComponent(b.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=${n}`;
  const res = await c.json<{ items?: Event[] }>(`${API}/calendars/primary/events?${q}`);
  const items = (res.items ?? []).filter((e) => e.status !== "cancelled").slice(0, n);
  if (items.length === 0) return `No events in the ${c.account.label} calendar between ${a.toISOString()} and ${b.toISOString()}.`;
  const lines = items.map((e, i) =>
    [
      `${i + 1}. ${e.summary || "(no title)"}`,
      `   start: ${whenText(e.start)}`,
      `   end: ${whenText(e.end)}`,
      ...(e.location ? [`   location: ${e.location}`] : []),
      `   attendees: ${Array.isArray(e.attendees) ? e.attendees.length : 0}`,
    ].join("\n"),
  );
  return `${items.length} event${items.length === 1 ? "" : "s"} in the ${c.account.label} calendar:\n\n${lines.join("\n\n")}`;
}

/** The gaps of at least `minutes` inside [from, to] that no busy block covers. */
export function freeSlots(from: Date, to: Date, busy: { start: Date; end: Date }[], minutes: number): { start: Date; end: Date }[] {
  const need = minutes * 60_000;
  const blocks = busy
    .filter((x) => x.end > from && x.start < to)
    .sort((x, y) => x.start.getTime() - y.start.getTime());
  const out: { start: Date; end: Date }[] = [];
  let cursor = from;
  for (const blk of blocks) {
    if (blk.start.getTime() - cursor.getTime() >= need) out.push({ start: cursor, end: blk.start });
    if (blk.end > cursor) cursor = blk.end;
  }
  if (to.getTime() - cursor.getTime() >= need) out.push({ start: cursor, end: to });
  return out;
}

export async function calendarFree(c: GoogleClient, from: string, to: string, minutes: number): Promise<string> {
  const [a, b] = range(from, to);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 24 * 60) throw new GoogleError("The length must be between 5 minutes and 24 hours.");
  const res = await c.json<{ calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>(`${API}/freeBusy`, {
    method: "POST",
    body: { timeMin: a.toISOString(), timeMax: b.toISOString(), items: [{ id: "primary" }] },
  });
  const cal = res.calendars?.primary;
  if (cal?.errors?.length) throw new GoogleError(`Google could not say when the ${c.account.label} calendar is busy.`);
  const busy = (cal?.busy ?? []).map((x) => ({ start: new Date(x.start), end: new Date(x.end) })).filter((x) => !Number.isNaN(x.start.getTime()) && !Number.isNaN(x.end.getTime()));
  const slots = freeSlots(a, b, busy, minutes);
  if (slots.length === 0) return `No free time of ${minutes} minutes in the ${c.account.label} calendar between ${a.toISOString()} and ${b.toISOString()}.`;
  const shown = slots.slice(0, FREE_MAX_SLOTS);
  const more = slots.length > shown.length ? `\n\n(${slots.length - shown.length} more free times not shown.)` : "";
  return `Free times of at least ${minutes} minutes in the ${c.account.label} calendar (UTC):\n\n${shown
    .map((s, i) => `${i + 1}. ${s.start.toISOString()} to ${s.end.toISOString()}`)
    .join("\n")}${more}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function calendarCreate(
  c: GoogleClient,
  a: { title: string; start: string; end: string; attendees?: string[]; description?: string; location?: string },
): Promise<string> {
  const title = a.title.trim();
  if (!title) throw new GoogleError("An event needs a title.");
  const allDay = DATE_ONLY.test(a.start) && DATE_ONLY.test(a.end);
  const s = time(a.start, "start");
  const e = time(a.end, "end");
  if (allDay ? e < s : e <= s) throw new GoogleError("The event must end after it starts.");
  const attendees = (a.attendees ?? []).map((x) => x.trim()).filter(Boolean);
  for (const x of attendees) if (!/^[^\s@]+@[^\s@]+$/.test(x)) throw new GoogleError(`"${x}" is not an email address.`);
  const body: Record<string, unknown> = {
    summary: title,
    start: allDay ? { date: a.start } : { dateTime: a.start },
    end: allDay ? { date: a.end } : { dateTime: a.end },
  };
  if (a.description) body.description = a.description;
  if (a.location) body.location = a.location;
  if (attendees.length) body.attendees = attendees.map((email) => ({ email }));
  const send = attendees.length ? "all" : "none";
  const made = await c.json<{ id?: string; htmlLink?: string }>(`${API}/calendars/primary/events?sendUpdates=${send}`, { method: "POST", body });
  const invited = attendees.length ? ` Google sent invitations to ${attendees.join(", ")}.` : "";
  return `Added "${title}" to the ${c.account.label} calendar, from ${a.start} to ${a.end}.${invited}${made.htmlLink ? ` Link: ${made.htmlLink}` : ""}`;
}
