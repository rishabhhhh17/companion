// M57 feature 1: the reviews of changes to the open project, as History's own rows (the engine's task log, sent with
// tasks.list). Names of files only, never their text; the summary had secrets hidden before it was kept. Plain code,
// tested in reviewEveryDay.test.ts; card.tsx only draws what this says. Nothing here counts days or praises a habit.
import { REVIEW_CHECKS, REVIEW_DID, REVIEW_RATINGS, REVIEW_TOUCHES, type ReviewRating, type ReviewRowView } from "../../protocol/index.ts";
import { redact } from "../../runner/src/redact.ts";
import type { IconName } from "./icons.tsx";
import { S } from "./strings.ts";

/** The most rows History shows, whatever an event carries. */
const MAX_ROWS = 50;

/** The rows that keep to the protocol (the engine's protocol/index.ts reviewRowsOk), at most 50; anything else is left out. */
export function reviewRowsOf(v: unknown): ReviewRowView[] {
  if (!Array.isArray(v)) return [];
  const out: ReviewRowView[] = [];
  for (const x of v as Record<string, unknown>[]) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    if (!Number.isInteger(x.id) || typeof x.at !== "string" || Number.isNaN(Date.parse(x.at)) || !Number.isInteger(x.count) || (x.count as number) < 0) continue;
    if (!Array.isArray(x.files) || !(x.files as unknown[]).every((f) => typeof f === "string" && f.length > 0)) continue;
    if (!(REVIEW_RATINGS as readonly string[]).includes(x.rating as string) || !(REVIEW_CHECKS as readonly string[]).includes(x.checks as string) || !(REVIEW_DID as readonly string[]).includes(x.did as string)) continue;
    if (!Array.isArray(x.touches) || !(x.touches as unknown[]).every((t) => (REVIEW_TOUCHES as readonly string[]).includes(t as string)) || typeof x.summary !== "string") continue;
    out.push({ id: x.id as number, at: x.at, count: x.count as number, files: (x.files as string[]).slice(0, 20).map((f) => f.slice(0, 300)), rating: x.rating as ReviewRating,
      touches: [...new Set(x.touches as ReviewRowView["touches"])], checks: x.checks as ReviewRowView["checks"], did: x.did as ReviewRowView["did"], summary: redact(x.summary).slice(0, 400) });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

const RATING_ICON: Record<ReviewRating, IconName> = { safe: "shield", worth_a_look: "warn", stop: "halt" };
const RATING_TONE: Record<ReviewRating, "good" | "mixed" | "bad"> = { safe: "good", worth_a_look: "mixed", stop: "bad" };

/** "5 minutes ago", as History's task rows say it (homeHero.ts agoWords; kept here so the model can read rows without it). */
function ago(iso: string, now: number): string {
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60000);
  if (min < 1) return S.home.justNow;
  if (min < 60) return S.home.minutesAgo(min);
  const h = Math.floor(min / 60);
  if (h < 24) return S.home.hoursAgo(h);
  const d = Math.floor(h / 24);
  return d < 2 ? S.home.yesterday : S.home.daysAgo(d);
}

/** A row as History draws it: its own mark (Review), the rating in words with its drawing (never colour alone), and one quiet
 *  line: what was done with it, how many files, when. The files are named under it, by name only. */
export function reviewRowLook(r: ReviewRowView, now: number): { mark: string; name: string; meta: string; icon: IconName; tone: "good" | "mixed" | "bad"; files: string } {
  const files = r.count === 1 ? "1 file" : `${r.count} files`;
  return {
    mark: S.history.reviewMark,
    name: `${S.review.rating[r.rating]}: ${r.summary || S.review.lead(r.count)}`,
    meta: `${S.history.reviewDid[r.did]} · ${files} · ${ago(r.at, now)}`,
    icon: RATING_ICON[r.rating], tone: RATING_TONE[r.rating],
    files: r.files.join(", ") + (r.count > r.files.length ? ` ${S.history.reviewMore(r.count - r.files.length)}` : ""),
  };
}
