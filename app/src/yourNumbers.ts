// M88 (a), Your numbers: a page under History with this week's counts for the open project, from the person's own task log
// only (the M79 week.summary, asked for on the press of its row), and the AI tools connected (donesignal.state). Nothing
// leaves the Mac by itself: "Send these numbers" shows the exact JSON first, and only a second press hands it to the shell,
// which checks it again and opens a mail draft (the person sends it, or not). The JSON holds counts and dates only: no
// project name, no file name, no words from any review, no decision. Settings, Privacy turns the page off (numbers.yours).
// Every word is in strings.ts; the address is in numbers.json, the one config spot (empty until the founder sets one).
import type { WeekView } from "../../protocol/index.ts";
import { connection } from "./aiTools.ts";
import { DONE_TOOLS, type DoneState } from "./doneSignal.ts";
import NUMBERS_FILE from "./numbers.json";
import { S } from "./strings.ts";

/** The counts, as sent. Dates are days only (YYYY-MM-DD on this Mac's clock). A count that was not counted is left out. */
export type YourNumbers = {
  numbers: 1; from: string; to: string;
  changesReviewed: number; filesReviewed: number;
  caught: { keys: number; weakenedChecks: number; falseDones: number; riskyPackages: number };
  fixesProven: number; undos: number; savedCopies: number; savedCopiesUsed: number;
  jobsHanded?: number; aiToolsConnected?: number; daysUsed?: number;
};

/** The one config spot for where the numbers go: an email address, or empty (the draft opens with an empty To line). */
export const NUMBERS_TO: string = (() => { const v = (NUMBERS_FILE as { to?: unknown }).to; return typeof v === "string" && /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[a-z]{2,}$/i.test(v) ? v : ""; })();

const two = (n: number) => String(n).padStart(2, "0");
/** An instant as a day on this Mac's clock, never a time. */
export const dayOf = (iso: string): string => { const d = new Date(iso); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

/** How many AI tools have every hook Connect adds on, from the engine's state; null when the state is not known. */
export const toolsConnected = (st: DoneState | null): number | null => (st ? DONE_TOOLS.filter((t) => connection(st, t) === "on").length : null);

/** The numbers from the week and the tools. The decisions are left out on purpose: they are words. */
export function numbersOf(w: WeekView, tools: number | null): YourNumbers {
  return {
    numbers: 1, from: dayOf(w.since), to: dayOf(w.until),
    changesReviewed: w.reviews, filesReviewed: w.files,
    caught: { keys: w.caught.keys, weakenedChecks: w.caught.weakened, falseDones: w.caught.falseDones, riskyPackages: w.caught.packages },
    fixesProven: w.proven, undos: w.undone, savedCopies: w.saved, savedCopiesUsed: w.savedUsed,
    ...(typeof w.jobs === "number" ? { jobsHanded: w.jobs } : {}),
    ...(typeof tools === "number" ? { aiToolsConnected: tools } : {}),
    ...(typeof w.days === "number" ? { daysUsed: w.days } : {}),
  };
}

/** The exact text shown before sending and put in the mail draft. Keys in a fixed order, so what is seen is what is sent. */
export function numbersJson(n: YourNumbers): string {
  const o: Record<string, unknown> = {
    numbers: n.numbers, from: n.from, to: n.to, changesReviewed: n.changesReviewed, filesReviewed: n.filesReviewed,
    caught: { keys: n.caught.keys, weakenedChecks: n.caught.weakenedChecks, falseDones: n.caught.falseDones, riskyPackages: n.caught.riskyPackages },
    fixesProven: n.fixesProven, undos: n.undos, savedCopies: n.savedCopies, savedCopiesUsed: n.savedCopiesUsed,
  };
  if (n.jobsHanded !== undefined) o.jobsHanded = n.jobsHanded;
  if (n.aiToolsConnected !== undefined) o.aiToolsConnected = n.aiToolsConnected;
  if (n.daysUsed !== undefined) o.daysUsed = n.daysUsed;
  return JSON.stringify(o, null, 2);
}

/** The page's rows: every count with its label, in words. A count not known says so; nothing is made up. */
export function numbersRows(n: YourNumbers): { id: keyof typeof S.m88.numbers.rows; label: string; value: string }[] {
  const r = S.m88.numbers.rows;
  const v = (x: number | undefined) => (typeof x === "number" ? String(x) : S.m88.numbers.notCounted);
  return ([
    ["reviews", n.changesReviewed], ["files", n.filesReviewed], ["keys", n.caught.keys], ["weakened", n.caught.weakenedChecks],
    ["falseDones", n.caught.falseDones], ["packages", n.caught.riskyPackages], ["proven", n.fixesProven], ["undone", n.undos],
    ["saved", n.savedCopies], ["savedUsed", n.savedCopiesUsed], ["jobs", n.jobsHanded], ["tools", n.aiToolsConnected], ["days", n.daysUsed],
  ] as const).map(([id, x]) => ({ id, label: r[id], value: v(x) }));
}

/** What the shell is handed on the second press: the JSON and the subject's words (it reads the address itself, from the
 *  same numbers.json, and checks the JSON again). */
export const mailArgs = (n: YourNumbers): { json: string; subject: string } => ({ json: numbersJson(n), subject: S.m88.numbers.mailSubject });
