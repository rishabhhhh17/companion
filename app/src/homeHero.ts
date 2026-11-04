// Home, one column and status first (F28, the overhaul spec 4.1 and 4.2), with Flowflow living on its water at the top (the
// founder, 31 Oct: "Where did the home screen of the Squibby go, where it lives... that's a good thing"). What its top says,
// how the project is, the one main button that status picks, the working card's four steps, which quiet buttons the top
// bar has, and when Undo and Stop show. Plain code, tested in homeHero.test.ts; card.tsx only draws what this decides. Fun
// comes from the motion, the size and the character, never from the words (rule 16).
import { activityNow, canFollowUp, canRetry, receiptUndone, cardWorking, type About, characterWords, costWords, formatUsd, historyFacts, isFixing, receiptVerdict, type HistoryItem, type LiveFile, type Model, type ProofLine } from "./model.ts";
import { verdictOf, type Tone, type Verdict } from "./verdict.ts";
import { need, type Need, type Tab } from "./home.ts";
import { S } from "./strings.ts";
import { pointFixRoute, practiceOf } from "./practice.ts";
import { canFix, fixedSince, keyWarned, type ReviewCard } from "./review.ts";
import type { Ring } from "./characters.ts";

/** The quiet buttons with words in the top bar, in order: Learn (only until the first practice is done, or while it has
 *  something for the person or is open), then History, Memory and Settings. Now is Home itself. */
export type BarPlace = "learn" | "did" | "memory" | "settings";
export function barPlaces(o: { practiceDone: boolean; learnWaits?: boolean; learnOpen?: boolean; learnOn?: boolean }): BarPlace[] {
  const learn = o.learnOn !== false && (!o.practiceDone || !!o.learnWaits || !!o.learnOpen);
  return [...(learn ? ["learn" as const] : []), "did", "memory", "settings"];
}

/** A round button pressed twice goes back to Now, as the back arrow does. */
export const placeAfter = (open: Tab, pressed: Tab): Tab => (pressed === open ? "now" : pressed);

/** What the top of Home says: the job in big words and one short line under it. `tone` names the state for the page.
 *  detail: after a result, the verdict's own sentence (M45), drawn muted under the line. */
export type HeroTone = "idle" | "working" | "needsYou" | "done" | "notDone" | "partly" | "plain";
/** `count`: the line is workingLine(count), so the page can count the cost up to it (M55, smoothMotion.ts CountUp). */
export type Hero = { headline: string; line: string; detail?: string; tone: HeroTone; say?: string; count?: number; /** Friendly's words where they differ (ReviewLead) */ friendly?: { headline: string; line: string } };
/** The working line with what the job has cost so far ("About 12 cents so far"). */
export const workingLine = (usd: number): string => S.look.working(formatUsd(usd));

/** The verdict's tone as the page's (M45, mapped here once, never in a surface): only a proven fix is "done" (green). */
const HERO_TONE: Record<Tone, HeroTone> = { good: "done", bad: "notDone", mixed: "partly", plain: "plain", ask: "needsYou" };
/** A task's name as it starts a line: its first letter capital. */
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const folderLine = (project: string): string => {
  const name = project.split("/").filter(Boolean).at(-1);
  return name ? S.look.inFolder(name) : S.look.noFolder;
};

export function heroWords(m: Model, project: string, n: Need | null = need(m)): Hero {
  // A question waits for the person: it is the job now, and it is drawn just below.
  if (n?.question) return { headline: n.why, line: S.look.below, tone: "needsYou" };
  // Return was just pressed and the engine has not answered yet (the audit, item 27): the words, and that it is starting.
  if (m.sending && !cardWorking(m)) return { headline: title(m.sending.words), line: S.look.starting, tone: "working" };
  if (cardWorking(m)) {
    // The job's name as an order, first letter capital ("Fix the signup button", the overhaul spec 4.2).
    const label = title(m.task?.label || characterWords(m));
    const now = activityNow(m, 1)[0]?.words;
    if (m.task && m.task.costUsd > 0) return { headline: label, line: workingLine(m.task.costUsd), tone: "working", count: m.task.costUsd };
    return { headline: label, line: m.task ? S.look.workingFree : now ?? characterWords(m), tone: "working" };
  }
  // A practice open in this folder (its card is on Learn): the one next step in words, and Flowflow says the practice's own
  // word for the moment, so the bubble never says one thing while the line says another (the founder, 2 Nov 2026).
  if (n && m.practice && n.key.startsWith("practice:")) {
    const st = m.practice.stage as keyof typeof S.home.practiceLine;
    return { headline: n.why, line: S.home.practiceLine[st] ?? characterWords(m), tone: "needsYou", say: S.practiceSay[st] ?? "" };
  }
  // A problem found, with its card on Now: the hero says the finding itself and which check found it, so the card under it
  // need not repeat What's wrong (the audit, item 53; the card's title is for VoiceOver only then).
  if (n?.key.startsWith("point:") && m.point?.stage === "found") {
    const finding = (m.point.problem?.message || m.point.message || "").trim();
    if (finding) return { headline: finding, line: m.point.label || characterWords(m), tone: "needsYou" };
  }
  // Something else waits for a look (a problem found, Prompt help, the error explainer, a pointer): its own words. A problem
  // found says what broke, never a bare state word like Ready (the audit, item 13: it is the one line of the folded hero).
  // Never a bare Ready under it (the audit, item 53): on Now its card is just below, and the line says so.
  if (n) return { headline: n.why, line: m.point?.stage === "found" ? (m.point.problem?.message || m.point.label || characterWords(m)) : n.tab === "now" ? S.look.answerBelow : characterWords(m), tone: "needsYou" };
  // An answer from Look it up or Rescue: its name, and that it is just below.
  if (m.research) return { headline: m.research.title, line: S.look.answerBelow, tone: "done" };
  if (m.rescue) return { headline: S.rescueTitle, line: S.look.answerBelow, tone: "done" };
  // A result: the verdict in big words, then what was asked and what it cost, then the verdict's own sentence (M45).
  if (m.receipt && m.task) {
    const v = receiptVerdict(m)!;
    const what = title(m.task.label || characterWords(m));
    return { headline: v.headline, line: S.look.doneLine(what, costWords(m.receipt.usdEstimate)), ...(v.line ? { detail: v.line } : {}), tone: HERO_TONE[v.tone] };
  }
  return { headline: S.look.idleHeadline, line: folderLine(project), tone: "idle" };
}

/** Flowflow's one short line in its bubble on Now: the hero's own when it has one (a practice), else by the hero's tone. A
 *  finished task's line only while its result is on Now (not an answer from Look it up or Rescue). */
export function sayFor(m: Pick<Model, "receipt" | "research" | "rescue">, h: Hero): string {
  if (h.say !== undefined) return h.say;
  if (h.tone === "working") return S.look.say.working;
  if (h.tone === "notDone") return S.look.say.notDone;
  if (h.tone === "needsYou") return S.look.say.needsYou;
  if (h.tone === "done" && !!m.receipt && !m.research && !m.rescue) return S.look.say.done;
  return "";
}

/** The main button when something waits on another place (the founder, 2 Nov 2026: a practice open, and "no clear next
 *  step" above the fold): its next step, right on Now. Check my project runs its checks, Fix it fixes what was found (a practice
 *  fixed by a task), anything else in the practice opens it on Learn. Only this folder's practice; nothing for a question
 *  (its card is on Now, just below) or when nothing waits. */
export type NeedMain = "practiceStart" | "practiceFix" | "openLearn";
export function needMainFor(m: Model, n: Need | null, project: string): NeedMain | null {
  if (!n || n.question || n.tab === "now" || !project) return null;
  if (m.practice && n.key.startsWith("practice:")) {
    if (m.practice.project !== project) return null;
    if (m.practice.stage === "start") return "practiceStart";
    if (m.practice.stage === "found" && practiceOf(m.practice.kind)?.fix === "task") return "practiceFix";
    return "openLearn";
  }
  return n.tab === "learn" ? "openLearn" : null;
}

/** Undo shows only when the result offers it (the last task changed files, and no Undo put them back since, unless they
 *  were brought back), nothing is being undone, and a folder is open (M45: the verdict's offer, so an Undo of one task from
 *  "which task broke it" hides it too). */
export const undoCan = (m: Model, project: string): boolean => receiptVerdict(m)?.offer === "undo" && (!m.undo || broughtBackIdle(m)) && !!project;
/** Bring back left some files as the person changed them, and its line (with Put those back too) is still up: nothing runs,
 *  so Undo may show again. */
const broughtBackIdle = (m: Model): boolean => !!m.undo && m.undo.back === true && m.undo.stage === "done" && m.undo.putBack !== "confirm" && m.undo.putBack !== "working";

/** Bring the fix back shows after an Undo whose safety copy is known, with a folder open and nothing at work. While the
 *  Undo's own "Undone." line is up it may show too (that is where it belongs); never while another undo is asked or runs. */
export const bringBackCan = (m: Model, project: string): boolean =>
  receiptVerdict(m)?.offer === "bringBack" && (!m.undo || (m.undo.stage === "done" && !m.undo.back && m.undo.putBack !== "confirm" && m.undo.putBack !== "working")) && !!project && !cardWorking(m);

/** Stop shows only while something works (not while a finished task waits for an answer: nothing runs then). */
export const stopCan = (m: Model): boolean => cardWorking(m);
/** Stop in the top row of a place: only where the open place has no Stop of its own. Now has one (the hero or the working
 *  card), and Learn has the practice's own (Stop the fix, Stop the checks) while it fixes or checks, so there is one Stop,
 *  in the card (M51 review, 1 Nov). */
export const barStopCan = (m: Model, tab: Tab): boolean =>
  stopCan(m) && tab !== "now" && !(tab === "learn" && ["fixing", "proving"].includes(m.practice?.stage ?? ""));

// ---- the recent fixes ----

export const RECENT_MAX = 4;
/** The tasks to list: the newest first, at most RECENT_MAX, only ones with a name. */
export function recentOf(items: HistoryItem[]): HistoryItem[] {
  return [...items].filter((i) => i.label.trim()).sort((a, b) => (b.startedAt > a.startedAt ? 1 : b.startedAt < a.startedAt ? -1 : 0)).slice(0, RECENT_MAX);
}

// ---- how the project is (the status headline) ----

/** How long ago, in plain words. A time that cannot be read is said as just now, never as a date that is wrong. */
export function agoWords(iso: string | null | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return S.home.justNow;
  const min = Math.floor(Math.max(0, now - t) / 60000);
  if (min < 1) return S.home.justNow;
  if (min < 60) return S.home.minutesAgo(min);
  const h = Math.floor(min / 60);
  if (h < 24) return S.home.hoursAgo(h);
  const d = Math.floor(h / 24);
  return d < 2 ? S.home.yesterday : S.home.daysAgo(d);
}

const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const samePlace = (a: string, b: string): boolean => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** The project's last check: the result on Home now, else the newest finished row of History. Its verdict is M45's, whole. */
export function lastResult(m: Pick<Model, "receipt" | "task" | "teach" | "history">, project: string): { verdict: Verdict; at: string | null } | null {
  if (m.receipt && m.task && (!m.task.project || m.task.project === project)) {
    const v = receiptVerdict(m);
    const at = m.receipt.wholePlan?.last ?? m.receipt.checkpoint;
    const row = m.history.find((h) => h.checkpoint === at);
    if (v) return { verdict: v, at: row?.endedAt ?? null };
  }
  const done = recentOf(m.history.filter((h) => h.status !== "running"))[0];
  return done ? { verdict: verdictOf(historyFacts(done)), at: done.endedAt ?? done.startedAt } : null;
}

export type StatusKind = "works" | "changed" | "failing" | "unchecked" | "noProject";
/** The one main button: Fix it, Check before going live, Check my project, or (no project yet) Choose a project. M55, adapts
 *  to you: also Carry on (a task left half way) and Explain an error (a terminal in front); mainChoices says when. */
export type MainAct = "fix" | "shipCheck" | "check" | "folder" | "carryOn" | "explain";
/** `verdict`: what the headline draws (ui/parts.tsx VerdictLine). Its mark is the last check's own: a tick only when that
 *  check was proven, a cross only when one failed, the status dot otherwise. */
export type HomeStatus = { kind: StatusKind; verdict: Verdict; sub: string; ago: string; main: MainAct };
const said = (v: Verdict, headline: string): Verdict => ({ ...v, headline, say: S.verdict.say(headline, v.line) });
/** The status dot, for a project nothing has proven yet: never a tick, never a colour. */
const dot = (headline: string): Verdict => ({ kind: "noChange", headline, line: null, say: headline, tone: "plain", icon: "wait", offer: null, proven: false });

/** How the project is, in its own name, from the last check only (F28): "test-shop works" (proven), "test-shop has a
 *  problem" (a check failed), or "Not checked yet" (nothing proven: never checked, stopped, undone, partly checked). */
export function homeStatus(m: Pick<Model, "receipt" | "task" | "teach" | "history"> & { point?: Model["point"]; sinceCheck?: Model["sinceCheck"] }, project: string, now: number): HomeStatus {
  const name = nameOf(project);
  if (!name) return { kind: "noProject", verdict: dot(S.home.noProject), sub: "", ago: "", main: "folder" };
  // The project's own checks just answered (the first run's first check, or Point at the problem), with no task result on
  // Home: Home says what they said. A failure is a problem with Fix it; a pass is said, but nothing was fixed or proven.
  // The point is this project's (it is cleared when the folder changes).
  const pt = m.receipt ? null : m.point;
  if (pt?.stage === "found") return { kind: "failing", verdict: { kind: "failed", headline: S.home.failing(name), line: null, say: S.verdict.say(S.home.failing(name), null), tone: "bad", icon: "cross", offer: null, proven: false }, sub: S.home.inProject(name), ago: "", main: "fix" };
  if (pt?.stage === "clear") return { kind: "unchecked", verdict: dot(S.home.checksPass(name)), sub: S.home.inProject(name), ago: "", main: "check" };
  const last = lastResult(m, project);
  const ago = last ? agoWords(last.at, now) : "";
  // The engine says the files changed since the version its last check passed on (must fix 11): never "works" over them.
  if (last?.verdict.proven && m.sinceCheck?.changed && samePlace(m.sinceCheck.project, project)) return { kind: "changed", verdict: dot(S.home.changedSince(name)), sub: S.home.checkedAgo(ago), ago, main: "check" };
  if (last?.verdict.proven) return { kind: "works", verdict: said(last.verdict, S.home.works(name)), sub: S.home.checkedAgo(ago), ago, main: "shipCheck" };
  if (last?.verdict.kind === "failed") return { kind: "failing", verdict: said(last.verdict, S.home.failing(name)), sub: S.home.failedAgo(ago), ago, main: "fix" };
  return { kind: "unchecked", verdict: dot(S.home.notChecked), sub: last ? S.home.lastWas(last.verdict.headline, ago) : S.home.inProject(name), ago, main: "check" };
}

/** The notch's one true line when nothing is live (4.3), from the same status. */
export function notchStatusLine(s: HomeStatus, project: string): string {
  const name = nameOf(project);
  // A check that just answered has no time of its own (homeStatus, the point): its headline as one sentence.
  if (!s.ago && (s.kind === "failing" || (s.kind === "unchecked" && s.verdict.headline !== S.home.notChecked))) return S.verdict.say(s.verdict.headline, null);
  if (s.kind === "changed") return S.home.notchChanged(name);
  return s.kind === "works" ? S.home.notchWorks(name, s.ago) : s.kind === "failing" ? S.home.notchFailing(name, s.ago) : s.kind === "unchecked" ? S.home.notchNotChecked(name) : S.home.notchNothing;
}

/** What Now is about: at rest, a job at work, a question, something else that needs a look, an answer, or a result. Same
 *  order as heroWords. */
export type HomeMode = "rest" | "working" | "question" | "needs" | "answer" | "result" | "blocked" | "review";
/** o.blocker: what stops any work (blockerOf); o.review: changes waiting for a review (reviewLead). Both are worked out in
 *  card.tsx, which knows Claude's own state and whether the review card shows. */
export function homeMode(m: Model, n: Need | null = need(m), o: { blocker?: Blocker | null; review?: ReviewLead | null } = {}): HomeMode {
  if (n?.question) return "question";
  if (cardWorking(m) || (m.sending && !o.blocker)) return "working";
  // Nothing can run (no key, the engine stopped, Claude missing): that is the job now, whatever the last check said.
  if (o.blocker) return "blocked";
  if (n) return "needs";
  // Changes another AI tool made wait for a review: they lead, so Home never says the project works over code nobody checked.
  if (o.review) return "review";
  if (m.research || m.rescue) return "answer";
  if (m.receipt && m.task) return "result";
  return "rest";
}
/** The ask buttons each main action sends (groups.ts ENTRY): Fix it and Check my project send findProblem, Check before
 *  going live sends shipCheck. Choose a project needs no tool. Carry on is a follow up (Try again's own command), Explain an
 *  error is the error explainer. */
export const MAIN_TOOL: Record<MainAct, string | null> = { fix: "findProblem", check: "findProblem", shipCheck: "shipCheck", folder: null, carryOn: "carryOn", explain: "explainError" };

// ---- adapts to you (M55 section 3) ----

/** The kind of app in front: all the shell tells Home (everyday.rs home_kind), never its id, its name, a window's title or
 *  anything in it (rules 5 and 7). Only from the shell, only while Home follows the app in front (home.followFrontApp). */
export type FrontKind = "editor" | "aiApp" | "browser" | "terminal" | "other";
export const FRONT_KINDS: readonly FrontKind[] = ["editor", "aiApp", "browser", "terminal", "other"];
/** The kind in what the shell sent ({ kind }), or null for anything else, which Home ignores. Nothing else in it is read. */
export function frontKindOf(payload: unknown): FrontKind | null {
  const k = payload !== null && typeof payload === "object" ? (payload as { kind?: unknown }).kind : undefined;
  return typeof k === "string" && (FRONT_KINDS as readonly string[]).includes(k) ? (k as FrontKind) : null;
}
/** The kind Home goes by: none while Home follows the app in front is off (then the project alone picks). */
export const frontFollowed = (kind: FrontKind | null, setting: unknown): FrontKind | null => (setting === false ? null : kind);

/** A task left half way: the last task on Now stopped before it finished (Stop, or its spending limit or turns ran out),
 *  was not undone, and its conversation can still carry on (canFollowUp: same project, the engine still knows it). Not the
 *  daily limit, where carrying on would stop again at once, and not a task that asked something (that is answered). */
export function halfWay(m: Model, project: string): boolean {
  if (!m.receipt || m.receipt.asks || !canFollowUp(m, project)) return false;
  const v = receiptVerdict(m);
  return v?.kind === "stopped" || (v?.kind === "limit" && m.receipt.limit !== "daily");
}

/** What the main action adapts to: the kind of app in front (null: not known, or not followed) and a task left half way. */
export type Adapt = { front?: FrontKind | null; halfWay?: boolean };
/** The main actions for this moment, the one to show first, then the project's own if that one's tool is off. The project
 *  comes first when it needs something or has a next step of its own: no project yet (Choose a project), a task left half
 *  way (Carry on), a failure (Fix it), a proven fix (Check before going live), whatever app is in front (the review, 3 Nov
 *  2026: with an editor in front, the usual case, going live was hidden). Otherwise, while it is not checked yet, the app
 *  in front picks: an editor, an AI coding app or a browser, Check my project; a terminal, Explain an error. Changes waiting for a review lead Home
 *  before any of this (homeMode "review", Review the changes), in every app. One name for each action (the audit, item 9). */
export function mainChoices(s: Pick<HomeStatus, "main">, a: Adapt = {}): MainAct[] {
  const own = s.main;
  if (own === "folder") return ["folder"];
  const first: MainAct | null = a.halfWay ? "carryOn" : own === "fix" || own === "shipCheck" ? null
    : a.front === "editor" || a.front === "aiApp" ? "check" : a.front === "terminal" ? "explain" : null;
  return first && first !== own ? [first, own] : [own];
}
/** The one main button for this moment, or none: only at rest and under a result is there one (one per screen). While a job
 *  works, a question waits, or another card needs a look, that card has the screen and no main button competes with it.
 *  `shown` is groups.ts buttonShown: with the action's tool switched off (F20) there is no main button, as there is no
 *  chip, so Home never offers what the engine would refuse. */
/** A result that offers Try again owns the next step: Try again is the one primary, so Home's main button steps aside
 *  (the audit, item 34: a failed fix showed four similar ways forward). */
export const retryOwnsMain = (m: Model, project: string): boolean => !!m.receipt && !receiptUndone(m.receipt) && canRetry(m, project);

export const mainFor = (mode: HomeMode, s: HomeStatus, shown: (button: string) => boolean = () => true, adapt: Adapt = {}): MainAct | null => {
  if (mode !== "rest" && mode !== "result") return null;
  return mainChoices(s, adapt).find((act) => { const tool = MAIN_TOOL[act]; return tool === null || shown(tool); }) ?? null;
};

// ---- the working card ----

const EDITS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
/** An edit the engine did not let run (refused, said no to, or waiting for a yes): no fixing has begun. */
const NOT_RUN = ["blocked", "denied", "needs_approval"];
/** 0 Finding, 1 Fixing, 2 Checking, and 4 when all four are done. Each step is done the moment the runner says it
 *  finished, never before (rule 14, M55 live progress): Finding once an edit was let through or a file really changed
 *  (agent.file); Fixing once a check runs (the engine checks only work that changed files); Checking and Proven together,
 *  only on a proven result. Proven is never the step under way (3 is never returned): until the receipt says proven, it is
 *  Checking, even once every check passed. A failed check being fixed steps back to Fixing (and says which
 *  try), and a partly checked fix (a check could not run) is never shown past Checking. */
export type JobStep = 0 | 1 | 2 | 4;   // never 3: Proven is a result, not a step under way
export function jobStep(m: Model, maxTries = 3): { step: JobStep; retry: string | null } {
  if (m.receipt && receiptVerdict(m)?.proven) return { step: 4, retry: null };
  const p = m.task?.proof;
  if (isFixing(m)) return { step: 1, retry: S.home.tryingAgain(Math.min(maxTries, (p?.tries ?? 1) + 1), maxTries) };
  // Every check passed is not proven yet (Stop or a spending limit can still end it): it stays on Checking until the
  // result says proven, so "Proven" is never shown as the step under way (rule 14; the review, 3 Nov 2026).
  if (p?.verdict === "passed" || m.character === "checking" || (p?.steps.length ?? 0) > 0) return { step: 2, retry: null };
  if ((m.task?.files?.length ?? 0) > 0 || m.task?.lines.some((l) => EDITS.includes(l.tool) && !NOT_RUN.includes(l.outcome))) return { step: 1, retry: null };
  return { step: 0, retry: null };
}

/** The newest files the work card lists while it fixes; the rest are counted ("and 3 more"). */
export const LIVE_FILES_MAX = 4;
export function liveFiles(m: Pick<Model, "task">, max = LIVE_FILES_MAX): { shown: LiveFile[]; more: number } {
  const all = m.task?.files ?? [];
  return { shown: all.slice(-max), more: Math.max(0, all.length - max) };
}
/** One check as the work card lists it while the checks run. */
export type LiveCheck = { rung: string; label: string; status: ProofLine["status"] };
/** The live part of the work card, by the step it is on: the files changed so far while it fixes, each check as it runs,
 *  passes or fails while it checks, nothing more while it is still finding (the step under way says that). */
export type JobLive = { kind: "none" } | { kind: "files"; files: LiveFile[]; more: number } | { kind: "checks"; checks: LiveCheck[] };
export function jobLive(m: Model, maxTries = 3): JobLive {
  const { step } = jobStep(m, maxTries);
  const checks = m.task?.proof?.steps ?? [];
  if (step >= 2 && checks.length > 0) return { kind: "checks", checks: checks.map((c) => ({ rung: c.rung, label: c.label, status: c.status })) };
  const f = liveFiles(m);
  if (step === 1 && f.shown.length > 0) return { kind: "files", files: f.shown, more: f.more };
  return { kind: "none" };
}

/** A running time as m:ss (h:mm:ss past an hour), in tabular figures on the card. */
export function clockWords(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}
/** The work card's time so far, from the seconds the job has run ("1:05 so far"). A count on its way between two times
 *  lands on whole seconds (M55, smoothMotion.ts CountUp). */
export const timeLine = (seconds: number): string => S.home.timeSoFar(clockWords(Math.round(seconds) * 1000));


// ---- cards that would say nothing (the founder, 2 Nov 2026: "About this project: A project: A plain web page." and "Where
// you left off: Nothing is unfinished." took the screen and pushed the next step out of view) ----

/** About this project earns a card only when it has something to act on or know: packages to install, settings that are
 *  not set, or notes. A bare one line description is not a card. */
export function aboutWorthACard(a: About | null, project: string): boolean {
  return !!a && !!project && a.project === project && (a.needsInstall || a.missingCount > 0 || a.notes.length > 0);
}
/** The lines of Where you left off that say something: "Nothing is unfinished." and "You have not run a task in this
 *  project yet." say nothing on their own. */
const EMPTY_RECAP = new Set(["Nothing is unfinished.", "You have not run a task in this project yet."]);
export const recapShownLines = (lines: readonly string[]): string[] => lines.filter((l) => !EMPTY_RECAP.has(l.trim()));
/** Where you left off earns a card only when a line says something, or there is a next step to press. */
export const recapWorthACard = (r: { lines: readonly string[]; next?: unknown } | null): boolean => !!r && (recapShownLines(r.lines).length > 0 || !!r.next);


// ---- the ranked UI audit, 2 Nov 2026 (auditFirstHalf.test.ts) ----

/** What Home's main Fix it starts (item 1): the same route as the point card's Fix it when a failure is known (the practice's
 *  own fix, one small checked fix when Settings says so and the problem is one line, else a deeper look first), and only a
 *  check when nothing failed yet (its label then is Check my project). Never the read only check under the name Fix it. */
export function homeFixRoute(m: Pick<Model, "point" | "practice" | "receipt">, s: Pick<HomeStatus, "main">, project: string, fixWith: unknown): "practice" | "smallFix" | "rescue" | "check" {
  if (s.main !== "fix" || !project) return "check";
  const pt = !m.receipt && m.point?.stage === "found" ? m.point : null;
  return pointFixRoute(fixWith, pt?.problem ?? null, m.practice, project);
}

/** Where Return sends the words (item 2): a new folder only when Make it in a new folder is ticked; with no project open
 *  the words wait while the person picks their project or starts a new one from them; never a silent new project. */
export type AskRoute = "newFolder" | "chooseProject" | "needWords" | "here";
export function askRoute(o: { prompt: string; project: string; newFolder: boolean }): AskRoute {
  if (!o.prompt.trim()) return "needWords";
  if (o.newFolder) return "newFolder";
  return o.project ? "here" : "chooseProject";
}

/** What stops any work right now (item 12): no Claude key or plan, the engine stopped, or Anthropic's Claude missing or
 *  being fetched. Unknown (the engine has not said yet) blocks nothing. claude: claude_status's state, null until known. */
export type Blocker = "key" | "engine" | "claude" | "claudeGetting";
export function blockerOf(o: { connected: Model["connected"] | string; runnerUp: boolean; claude: string | null }): Blocker | null {
  if (!o.runnerUp) return "engine";
  if (o.claude === "installing") return "claudeGetting";
  if (o.claude && o.claude !== "ready") return "claude";
  if (o.connected === "none") return "key";
  return null;
}

/** Changes from another AI tool that lead Home (item 11): waiting to be reviewed, being reviewed, or reviewed with something
 *  found that is not fixed yet. main: Review the changes, only while nothing has started; once reviewed, the card's own
 *  Fix it is the one main button, so the hero has none. */
export type ReviewLead = { headline: string; line: string; main: "review" | null; stop: boolean; friendly?: { headline: string; line: string } };
/** A stop's headline in Instrument is the problem itself (M65 step 4): the first reason that still holds (a recheck may
 *  have marked some "Changed since", as the runner's own stop line skips them, review/service.ts stateFor), as one line
 *  with no full stop at its end. With none left open, the rating's own words. */
const problemOf = (r: ReviewCard): string => {
  const open = r.result?.reasons.find((_, i) => !fixedSince(r, i));
  return (open?.say ?? S.review.rating.stop).trim().replace(/\.$/, "");
};
/** `friendly`: Friendly's words where they differ from Instrument's (M65 step 6, the review): Friendly is the look from
 *  before, so on a stop its headline still says Fix this first, and on a key, the key line under it. The page shows one of
 *  the two by a token (ui/parts.tsx Said), never by reading the style. */
export function reviewLead(r: ReviewCard | null | undefined, project: string): ReviewLead | null {
  if (!r || !project || r.project.replace(/\/+$/, "") !== project.replace(/\/+$/, "")) return null;
  // A fix asked for from the review, before its task has begun (the card closes when it begins).
  if (r.fix === "sent") return { headline: S.review.fixStarting, line: S.review.lead(r.count), main: null, stop: false };
  // M57 feature 5: the instant key warning leads, before any review ran. M65 step 4: the status line says Fix this first in
  // red; the headline names the file and the line under it says how much changed, once.
  if (r.stage === "ready" && keyWarned(r)) {
    const files = [...new Set(r.keys!.map((k) => k.file))];
    return { headline: S.review.keyHeadline(files), line: S.review.riskyLine(r.count, files.length), main: r.asked ? null : "review", stop: true,
      friendly: { headline: S.review.rating.stop, line: S.review.keyWarning } };
  }
  if (r.stage === "ready") return { headline: S.review.lead(r.count), line: r.away ? S.review.away[r.away] : S.review.heroLine(r.count), main: r.asked ? null : "review", stop: false };
  if (r.stage === "reviewing") return { headline: S.review.lead(r.count), line: r.proof ? S.review.reviewingChecks : S.review.reviewing, main: null, stop: false };
  if (r.result && r.result.rating !== "safe" && canFix(r)) {
    const stop = r.result.rating === "stop";
    const line = S.review.lead(r.count);
    return stop ? { headline: problemOf(r), line, main: null, stop, friendly: { headline: S.review.rating.stop, line } } : { headline: S.review.rating[r.result.rating], line, main: null, stop };
  }
  // Safe on a look, but the project's checks did not run on the changes: it keeps leading, so Home never says the project
  // works over them (must fix 11).
  if (r.result && r.result.rating === "safe" && r.result.checks !== "passed") return { headline: S.review.rating.safe, line: S.review.safeUnchecked, main: null, stop: false };
  return null;
}

/** Home's top already says the review's rating (its headline is the rating's words, or, on a stop, the status line says Fix
 *  this first over the problem itself), so the card leads with its one line only. */
export function reviewHeroSays(mode: HomeMode, lead: ReviewLead | null, r: ReviewCard | null | undefined): boolean {
  if (mode !== "review" || !lead || !r) return false;
  if (r.result) return lead.stop || lead.headline === S.review.rating[r.result.rating];
  return keyWarned(r) && lead.stop;
}

/** In the wide Home, the hero folds to one line (no pond, no main button) while a card that needs a tap shows (item 13): an
 *  approval, a stuck fix, the question about other agents, a found problem, the review, or a result that just came in. */
export function heroCompact(m: Model, reviewOn: boolean): boolean {
  return m.approvals.length > 0 || !!m.stuck || !!m.agentsAsk || m.point?.stage === "found" || reviewOn || (!!m.receipt && !!m.task && resultIsFresh(m));
}
const resultIsFresh = (m: Model): boolean => (m.character === "done" || m.character === "error") && m.agents[m.task!.agent] === m.character;

/** The live line under the working card's steps (item 25): which try it is, else the check under way, else the last step,
 *  else what the character is doing (Listening, Checking your project, Working). */
export function jobNowWords(m: Pick<Model, "task"> & Partial<Model>, retry: string | null, lines: readonly { words: string }[]): string {
  return retry ?? m.task?.proof?.steps.find((s) => s.status === "running")?.label ?? lines.at(-1)?.words ?? characterWords(m as Model);
}
/** That line in each look (M65 step 6): Instrument's status line over the card already says Working, so there it says
 *  Getting started instead; Friendly keeps its own words (`friendly`, only where they differ; ui/parts.tsx Said). */
export function jobNowSays(words: string): { text: string; friendly?: string } {
  return words.trim().toLowerCase() === S.ui.status.working.toLowerCase() ? { text: S.home.gettingStarted, friendly: words } : { text: words };
}


// ---- the Instrument look (M65, 4 Nov 2026, the founder: the look is "too childish"; look A from the lab) ----

/** The status line's kind over Home's headline (ui/parts.tsx StatusLine): Needs you, Proven, Not checked yet, Working or
 *  Not fixed yet. A result says its own verdict (only a proven fix is Proven); at rest, how the project is from its last
 *  check. Nothing can run (no key, the engine stopped) is Needs you, never Not fixed yet. An answer from Look it up or
 *  Rescue is no check of anything, so it has no status line, and neither has Home with no project yet. */
export type HeroStatus = keyof typeof S.ui.status;
const RESULT_STATUS: Record<HeroTone, HeroStatus> = { done: "proven", notDone: "stop", partly: "notChecked", plain: "notChecked", needsYou: "needs", working: "working", idle: "notChecked" };
const REST_STATUS: Record<StatusKind, HeroStatus | null> = { works: "proven", failing: "stop", changed: "notChecked", unchecked: "notChecked", noProject: null };
export function heroStatusOf(mode: HomeMode, status: Pick<HomeStatus, "kind">, tone: HeroTone, reviewStop = false): HeroStatus | null {
  if (mode === "working") return "working";
  // Changes rated stop, or a key in the code (M65 step 4): red, as the card's own mark is, never amber.
  if (mode === "review" && reviewStop) return "fixFirst";
  if (mode === "question" || mode === "needs" || mode === "review" || mode === "blocked") return "needs";
  if (mode === "result") return RESULT_STATUS[tone];
  if (mode === "answer") return null;
  return REST_STATUS[status.kind];
}
/** The line under the headline says only what the status line says ("Working" under "Working"): Instrument leaves it out. */
export const lineSaidByStatus = (kind: HeroStatus | null, line: string): boolean => kind !== null && S.ui.status[kind].trim().toLowerCase() === line.trim().toLowerCase();
/** The line under the headline steps aside when the status line or the headline already says it ("Working" under
 *  "Working"), whether or not the status line shows (M68 step 3). */
export const heroLineSaid = (kind: HeroStatus | null, headline: string, line: string): boolean =>
  lineSaidByStatus(kind, line) || line.trim().toLowerCase() === headline.trim().toLowerCase();
/** The status line steps aside when the headline already says the same words ("Not checked yet" twice, one over the other). */
export const statusLineShown = (kind: HeroStatus | null, headline: string): kind is HeroStatus =>
  kind !== null && S.ui.status[kind].trim().toLowerCase() !== headline.trim().toLowerCase();

/** The orb's ring on Home agrees with the status line, so the colour never says one thing while the words say another. At
 *  rest it has none (the lab: no ring at rest), whatever the last check said; the status line says that. */
const STATUS_RING: Record<HeroStatus, Ring | null> = { needs: "needs", proven: "proven", stop: "stop", working: "working", notChecked: null, fixFirst: "stop" };
export const heroRingOf = (mode: HomeMode, kind: HeroStatus | null): Ring | null => (mode === "rest" || kind === null ? null : STATUS_RING[kind]);

/** The footer line under Home's work: when the project was last checked on one side, and Undo is ready on the other (only
 *  when the result offers it). None when it would say nothing. */
export type HomeFoot = { start: string; end: string };
export function homeFoot(status: Pick<HomeStatus, "ago">, undoReady: boolean): HomeFoot | null {
  const start = status.ago ? S.home.checkedAgo(status.ago) : "";
  const end = undoReady ? S.home.undoReady : "";
  return start || end ? { start, end } : null;
}
/** The line under the status headline, unless the footer already says it (Checked 4 min ago, once). */
export const statusSubShown = (sub: string, foot: HomeFoot | null): string => (sub && sub !== foot?.start ? sub : "");
