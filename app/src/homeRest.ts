// M69 step 2, Home at rest is never empty (the YC benchmark spec 3.1 and 3.2, corrected in docs/milestones/M69-full-fledged.md):
// the two tone hero driven by the latest real state, the Last fix card and the Since then card. Every word comes from what
// Squibby already holds for the open project (its task log, its review rows, whether files changed since the last check),
// never a guess, never a made up number, and never who changed a file (M57: Squibby cannot tell another tool's edits from
// the person's own). Plain code, tested in homeRest.test.ts; homeRest.tsx and card.tsx only draw what this says.
import type { CaughtView, ReviewRowView } from "../../protocol/index.ts";
import { caughtParts } from "./safetyNet.ts";
import { historyFacts, type HistoryItem } from "./model.ts";
import { verdictOf } from "./verdict.ts";
import { agoWords, type HomeStatus } from "./homeHero.ts";
import { taskName } from "./itemLook.ts";
import { failedCheckWords, S } from "./strings.ts";
import { FIX_MEANING, type Meaning } from "./meaning.ts";
import type { IconName } from "./icons.tsx";

/** The hero's status tag at rest: the last check passed, something needs a look, a check failed, or (only for a project
 *  with nothing in its log at all) not checked yet. */
export type RestPill = "passed" | "look" | "failed" | "new";
/** The tag's tone, as ui/parts.css .ui-status reads it (green, amber, red, grey). */
export const PILL_TONE: Record<RestPill, "proven" | "needs" | "stop" | "plain"> = { passed: "proven", look: "needs", failed: "stop", new: "plain" };
/** The two tone headline: the outcome, then the why in the softer tone, at the same size (spec 1.1). */
export type RestHero = { pill: RestPill | null; first: string; second: string };

const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const at = (h: HistoryItem): string => h.endedAt ?? h.startedAt;
const newestFirst = (a: HistoryItem, b: HistoryItem) => (at(b) > at(a) ? 1 : at(b) < at(a) ? -1 : 0);

/** The newest task whose checks proved it (M45's proven: done, its checks passed, not taken back), or null. */
export function lastProven(history: readonly HistoryItem[]): HistoryItem | null {
  return [...history].filter((h) => h.status !== "running" && verdictOf(historyFacts(h)).proven).sort(newestFirst)[0] ?? null;
}

/** The review rows newer than a time (the files that changed after it), newest first. */
const reviewsAfter = (reviews: readonly ReviewRowView[], after: string | null): ReviewRowView[] =>
  [...reviews].filter((r) => !after || r.at > after).sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));

export type RestInput = {
  project: string;
  status: Pick<HomeStatus, "kind" | "ago" | "failed">;
  history: readonly HistoryItem[];
  reviews?: readonly ReviewRowView[];
  /** The engine says the files changed since the version its last check passed on (tasks.list sinceCheck). */
  sinceChanged?: boolean;
  /** Check my project just answered and found nothing (point clear): a pass, never a fix. */
  pointClear?: boolean;
  /** The check before going live answered (homeHero.ts goLiveAnswer): the page says what the go live card says. */
  goLive?: "ready" | "blocked" | null;
  now: number;
};

/** The hero at rest. Never "Not checked yet" next to a proven run: that tag is only for a project with an empty log. */
export function restHero(i: RestInput): RestHero {
  const name = nameOf(i.project);
  if (!name || i.status.kind === "noProject") return { pill: null, first: S.homeNow.noProject, second: S.homeNow.noProjectLine };
  const proven = lastProven(i.history);
  if (i.status.kind === "failing") return { pill: "failed", first: S.homeNow.problem(name), second: i.status.ago ? S.homeNow.failedAgo(i.status.ago, i.status.failed) : S.homeNow.foundNow };
  if (i.status.kind === "works" || i.status.kind === "changed") {
    const ago = i.status.ago || agoWords(proven ? at(proven) : null, i.now);
    if (i.status.kind === "works") return { pill: "passed", first: S.homeNow.fine(name), second: S.homeNow.proven(ago) };
    // Changed since: how many only when one review counted them (two reviews may name the same files twice).
    const since = reviewsAfter(i.reviews ?? [], proven ? at(proven) : null);
    const more = since.length === 1 && since[0].count > 0 ? S.homeNow.filesChangedSince(since[0].count) : S.homeNow.changedSince;
    return { pill: "passed", first: S.homeNow.fine(name), second: `${S.homeNow.proven(ago)} ${more}` };
  }
  if (i.goLive === "blocked") return { pill: "look", first: S.home.notReadyOnline(name), second: S.home.notReadyOnlineSub };
  if (i.pointClear || i.goLive === "ready") return { pill: "passed", first: S.homeNow.checksPass(name), second: S.homeNow.checksPassLine };
  if (proven) return { pill: "look", first: S.homeNow.fresh(name), second: S.homeNow.lastProven(agoWords(at(proven), i.now)) };
  const last = [...i.history].filter((h) => h.status !== "running").sort(newestFirst)[0];
  if (last) return { pill: "look", first: S.homeNow.notProven(name), second: S.homeNow.lastTask(verdictOf(historyFacts(last)).headline, agoWords(at(last), i.now)) };
  return { pill: "new", first: S.homeNow.newFirst(name), second: S.homeNow.newSecond };
}

/** When the project was last checked, for the top bar's "Checked 2 hours ago": the last check's own time, never a task
 *  that stopped before any check ran (that would say Checked over work nothing checked). */
export function checkedAgo(status: Pick<HomeStatus, "kind" | "ago">, history: readonly HistoryItem[], now: number): string {
  if (status.kind === "works" || status.kind === "changed" || status.kind === "failing") return status.ago;
  const c = [...history].filter((h) => h.status !== "running" && (h.proof === "passed" || h.proof === "partial" || h.proof === "failed")).sort(newestFirst)[0];
  return c ? agoWords(at(c), now) : "";
}

/** The main button's words at rest: Check my project says Check it again once the project was checked before. */
export function restMainLabel(main: string, label: string, i: Pick<RestInput, "history" | "status">): string {
  const checkedBefore = i.status.kind === "changed" || i.history.some((h) => h.proof === "passed" || h.proof === "partial" || h.proof === "failed");
  return main === "check" && checkedBefore ? S.homeNow.checkAgain : label;
}

// ---------- the Last fix card ----------

export type FixTag = "proven" | "undone" | "failed" | "partly" | "unchecked";
export type Tick = { ok: boolean | null; words: string };
export type LastFix = { item: HistoryItem; title: string; tag: FixTag; meta: string; ticks: Tick[] };

/** The newest task that finished (done), with a name: the Last fix card. Its tag and ticks are M45's verdict, whole. */
export function lastFix(history: readonly HistoryItem[], now: number): LastFix | null {
  const item = [...history].filter((h) => h.status === "done" && taskName(h.label)).sort(newestFirst)[0];
  if (!item) return null;
  const v = verdictOf(historyFacts(item));
  const tag: FixTag = v.kind === "undone" ? "undone" : v.proven ? "proven" : v.kind === "failed" ? "failed" : v.kind === "partial" ? "partly" : "unchecked";
  const proof = item.proof === "passed" || item.proof === "partial" || item.proof === "failed" ? item.proof : "none";
  const ticks: Tick[] = [];
  if (tag === "undone") ticks.push({ ok: null, words: S.homeNow.tick.undone });
  else if (proof === "passed") ticks.push({ ok: true, words: S.homeNow.tick.passed });
  else if (proof === "partial") ticks.push({ ok: true, words: S.homeNow.tick.partly });
  else if (proof === "failed") ticks.push({ ok: false, words: item.failedCheck ? failedCheckWords(item.failedCheck) : S.homeNow.tick.failed });
  else ticks.push({ ok: null, words: S.homeNow.tick.none });
  // The count is the engine's own; an unknown count is never said as a number.
  const meta = [item.changed != null ? S.homeNow.files(item.changed) : "", agoWords(at(item), now)].filter(Boolean).join(" · ");
  return { item, title: outcomeTitle(item.label, tag), tag, meta, ticks };
}

// "fix the sign up button", "Please fix my checkout page.": the thing that was fixed ("sign up button"), or null for a task
// that was not a fix of one thing.
const FIX_OF = /^(?:please\s+)?(?:fix|repair)\s+(?:the\s+|my\s+|a\s+|an\s+)?(.+?)[.!]*$/i;
const thingFixed = (label: string): string | null => {
  const m = FIX_OF.exec(taskName(label));
  return m && m[1].trim().length > 0 && m[1].trim().split(/\s+/).length <= 8 ? m[1].trim() : null;
};
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** M69 step 3: a fix's title as an outcome. Only a proven fix of one thing is said as that thing fixed ("Sign up button
 *  fixed"); anything else keeps the task's own words, so a fix that was not proven is never called fixed. */
export function outcomeTitle(label: string, tag: FixTag): string {
  const thing = tag === "proven" ? thingFixed(label) : null;
  return thing ? S.homeNow.fixedThing(thing) : cap(taskName(label).replace(/[.!]+$/, ""));
}

/** M69 step 3: the hero over a result says the outcome once (the receipt under it no longer repeats it). proven: the thing
 *  fixed, then how it was proven. failed: the thing not fixed yet (or the project), then why in one sentence. Anything
 *  else (a partial check, no change, an answer) keeps its own verdict line: null. */
export type ResultHero = { pill: "proven" | "failed"; first: string; second: string };
export function resultHero(i: { project: string; label: string; kind: "proven" | "failed" | "other"; said: string | null }): ResultHero | null {
  if (i.kind === "other") return null;
  const name = nameOf(i.project), thing = thingFixed(i.label);
  if (i.kind === "proven") return { pill: "proven", first: `${thing ? S.homeNow.fixedThing(thing) : S.homeNow.works(name)}.`, second: i.said || "" };
  return { pill: "failed", first: thing ? S.homeNow.notFixedThing(thing) : S.homeNow.notFixed(name), second: i.said || S.homeNow.checkFailed };
}

// ---------- the Since then card ----------

export type SinceRow = { id: string; kind: "files" | "unchecked" | "task"; words: string; meta: string; act: "look" | "check" | "open"; item?: HistoryItem };
export const SINCE_MAX = 3;

/** What happened after the Last fix, newest first, at most three: files that changed (counted by a review), that nothing
 *  checked them since, and tasks that did not finish. Never who changed the files. */
export function sinceRows(i: { history: readonly HistoryItem[]; reviews?: readonly ReviewRowView[]; sinceChanged?: boolean; fix: Pick<LastFix, "item"> | null; now: number }): SinceRow[] {
  const after = i.fix ? at(i.fix.item) : null;
  const rows: SinceRow[] = [];
  for (const r of reviewsAfter(i.reviews ?? [], after)) if (r.count > 0) rows.push({ id: `review:${r.id}`, kind: "files", words: S.homeNow.sinceFiles(r.count), meta: agoWords(r.at, i.now), act: "look" });
  // M69 step 3: "Changed since the last check" is the hero's own words and its Check it again, so it is not a row here too.
  const tasks = [...i.history].filter((h) => h.status !== "running" && h.status !== "done" && taskName(h.label) && (!i.fix || (h.id !== i.fix.item.id && at(h) > at(i.fix.item)))).sort(newestFirst);
  for (const h of tasks) {
    const name = taskName(h.label);
    const words = h.undone ? S.homeNow.undoneTask(name) : h.status === "interrupted" || h.status === "needs_you" ? S.homeNow.leftOff(name) : S.homeNow.notFinished(name);
    rows.push({ id: `task:${h.id}`, kind: "task", words, meta: agoWords(at(h), i.now), act: "open", item: h });
  }
  return rows.slice(0, SINCE_MAX);
}

/** What Home at rest draws under the hero: the Last fix and Since then cards, or the practice offer for a project with no
 *  fixes yet. Nothing without a project. */
export function restCards(o: { project: string; history: readonly HistoryItem[] }): "fix" | "practice" | null {
  if (!o.project) return null;
  return o.history.some((h) => h.status === "done" && taskName(h.label)) ? "fix" : "practice";
}

// ---------- M71: Now's one list (docs/milestones/M71-black-with-colour.md) ----------

/** One row of Now's Since then list, by its meaning (meaning.ts): the last fix and how its check went, then what happened
 *  after it, at most three. `act`: what a press on the row or its action does. Never who changed a file (M57). */
export type NowRow = {
  id: string; meaning: Meaning; icon: IconName; title: string; line: string; fact: string;
  act: "open" | "look" | "practice"; action: "undo" | "show" | "start" | null; item?: HistoryItem;
};
export const NOW_ROWS_MAX = 3;
const FIX_ICON: Record<FixTag, IconName> = { proven: "tick", undone: "undo", failed: "cross", partly: "half", unchecked: "dash" };
const SINCE_MEANING: Record<SinceRow["kind"], Meaning> = { files: "review", unchecked: "review", task: "stopped" };

export function nowRows(i: { fix: LastFix | null; since: readonly SinceRow[]; practice: boolean; undo: boolean; now: number; caught?: CaughtView | null }): NowRow[] {
  const rows: NowRow[] = [];
  // M77: what the safety net caught this week, only when there is something (rule 16: a count, never praise). A press opens History.
  const parts = caughtParts(i.caught);
  if (parts.length) rows.push({ id: "caught", meaning: "review", icon: "shield", title: S.guard.caughtTitle, line: parts.join(", "), fact: "", act: "look", action: null });
  if (i.practice) rows.push({ id: "practice", meaning: "practice", icon: "learn", title: S.homeNow.practiceTitle, line: S.homeNow.practiceLine, fact: "", act: "practice", action: "start" });
  if (i.fix) {
    const f = i.fix, it = f.item;
    const files = it.changed != null ? S.homeNow.files(it.changed) : "";
    const ago = agoWords(at(it), i.now);
    const tick = f.ticks[0]?.words ?? "";
    rows.push({
      id: `fix:${it.id}`, meaning: FIX_MEANING[f.tag], icon: FIX_ICON[f.tag], title: f.title,
      // With Undo on the right, the time moves into the line, so the row still says when.
      line: [tick, files, i.undo ? ago : ""].filter(Boolean).join(" · "), fact: i.undo ? "" : ago,
      act: "open", action: i.undo ? "undo" : null, item: it,
    });
  }
  for (const r of i.since) {
    const undone = r.item?.undone === true;
    rows.push({
      id: r.id, meaning: undone ? "undone" : SINCE_MEANING[r.kind], icon: r.kind === "files" ? "eye" : undone ? "undo" : "stop",
      title: r.words, line: r.kind === "files" ? S.homeNow.sinceLine : S.homeNow.taskLine, fact: r.meta,
      act: r.act === "look" ? "look" : "open", action: r.act === "look" ? "show" : null, item: r.item,
    });
  }
  if (i.practice && !i.fix) rows.push({ id: "empty", meaning: "notChecked", icon: "dash", title: S.homeNow.noFixesTitle, line: S.homeNow.noFixesLine, fact: "", act: "open", action: null });
  return rows.slice(0, NOW_ROWS_MAX + (parts.length ? 1 : 0));
}

/** M73 (fluid, item 10): how long a finished fix worked, from the engine's own start and end times for the task whose undo
 *  point this result has ("Worked for 14 s"). Null when the engine has not said both times, so it is never guessed. */
export function workedFor(items: readonly Pick<HistoryItem, "checkpoint" | "startedAt" | "endedAt">[], checkpoint: string | null | undefined): string | null {
  if (!checkpoint) return null;
  const h = items.find((i) => i.checkpoint === checkpoint);
  const a = Date.parse(h?.startedAt ?? ""), b = Date.parse(h?.endedAt ?? "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const s = Math.max(1, Math.round((b - a) / 1000));
  return S.fixRun.workedFor(s < 60 ? S.fixRun.secs(s) : S.fixRun.mins(Math.floor(s / 60), s % 60));
}
