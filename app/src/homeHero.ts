// Home, one column and status first (F28, the overhaul spec 4.1 and 4.2), with Flowflow living on its water at the top (the
// founder, 31 Oct: "Where did the home screen of the Squibby go, where it lives... that's a good thing"). What its top says,
// how the project is, the one main button that status picks, the working card's four steps, which quiet buttons the top
// bar has, and when Undo and Stop show. Plain code, tested in homeHero.test.ts; card.tsx only draws what this decides. Fun
// comes from the motion, the size and the character, never from the words (rule 16).
import { activityNow, cardWorking, characterWords, costWords, formatUsd, historyFacts, isFixing, receiptVerdict, type HistoryItem, type Model } from "./model.ts";
import { verdictOf, type Tone, type Verdict } from "./verdict.ts";
import { need, type Need, type Tab } from "./home.ts";
import { S } from "./strings.ts";

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
export type Hero = { headline: string; line: string; detail?: string; tone: HeroTone };

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
  if (cardWorking(m)) {
    // The job's name as an order, first letter capital ("Fix the signup button", the overhaul spec 4.2).
    const label = title(m.task?.label || characterWords(m));
    const now = activityNow(m, 1)[0]?.words;
    return { headline: label, line: m.task ? (m.task.costUsd > 0 ? S.look.working(formatUsd(m.task.costUsd)) : S.look.workingFree) : now ?? characterWords(m), tone: "working" };
  }
  // Something else waits for a look (a problem found, Prompt help, the error explainer, a pointer): its own words.
  if (n) return { headline: n.why, line: characterWords(m), tone: "needsYou" };
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

/** The project's last check: the result on Home now, else the newest finished row of History. Its verdict is M45's, whole. */
export function lastResult(m: Pick<Model, "receipt" | "task" | "teach" | "history">, project: string): { verdict: Verdict; at: string | null } | null {
  if (m.receipt && m.task && (!m.task.project || m.task.project === project)) {
    const v = receiptVerdict(m);
    const row = m.history.find((h) => h.checkpoint === m.receipt!.checkpoint);
    if (v) return { verdict: v, at: row?.endedAt ?? null };
  }
  const done = recentOf(m.history.filter((h) => h.status !== "running"))[0];
  return done ? { verdict: verdictOf(historyFacts(done)), at: done.endedAt ?? done.startedAt } : null;
}

export type StatusKind = "works" | "failing" | "unchecked" | "noProject";
/** The one main button: Fix it, Check before going live, Check my project, or (no project yet) Choose a project. */
export type MainAct = "fix" | "shipCheck" | "check" | "folder";
/** `verdict`: what the headline draws (ui/parts.tsx VerdictLine). Its mark is the last check's own: a tick only when that
 *  check was proven, a cross only when one failed, the status dot otherwise. */
export type HomeStatus = { kind: StatusKind; verdict: Verdict; sub: string; ago: string; main: MainAct };
const said = (v: Verdict, headline: string): Verdict => ({ ...v, headline, say: S.verdict.say(headline, v.line) });
/** The status dot, for a project nothing has proven yet: never a tick, never a colour. */
const dot = (headline: string): Verdict => ({ kind: "noChange", headline, line: null, say: headline, tone: "plain", icon: "wait", offer: null, proven: false });

/** How the project is, in its own name, from the last check only (F28): "test-shop works" (proven), "test-shop has a
 *  problem" (a check failed), or "Not checked yet" (nothing proven: never checked, stopped, undone, partly checked). */
export function homeStatus(m: Pick<Model, "receipt" | "task" | "teach" | "history"> & { point?: Model["point"] }, project: string, now: number): HomeStatus {
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
  if (last?.verdict.proven) return { kind: "works", verdict: said(last.verdict, S.home.works(name)), sub: S.home.checkedAgo(ago), ago, main: "shipCheck" };
  if (last?.verdict.kind === "failed") return { kind: "failing", verdict: said(last.verdict, S.home.failing(name)), sub: S.home.failedAgo(ago), ago, main: "fix" };
  return { kind: "unchecked", verdict: dot(S.home.notChecked), sub: last ? S.home.lastWas(last.verdict.headline, ago) : S.home.inProject(name), ago, main: "check" };
}

/** The notch's one true line when nothing is live (4.3), from the same status. */
export function notchStatusLine(s: HomeStatus, project: string): string {
  const name = nameOf(project);
  // A check that just answered has no time of its own (homeStatus, the point): its headline as one sentence.
  if (!s.ago && (s.kind === "failing" || (s.kind === "unchecked" && s.verdict.headline !== S.home.notChecked))) return S.verdict.say(s.verdict.headline, null);
  return s.kind === "works" ? S.home.notchWorks(name, s.ago) : s.kind === "failing" ? S.home.notchFailing(name, s.ago) : s.kind === "unchecked" ? S.home.notchNotChecked(name) : S.home.notchNothing;
}

/** What Now is about: at rest, a job at work, a question, something else that needs a look, an answer, or a result. Same
 *  order as heroWords. */
export type HomeMode = "rest" | "working" | "question" | "needs" | "answer" | "result";
export function homeMode(m: Model, n: Need | null = need(m)): HomeMode {
  if (n?.question) return "question";
  if (cardWorking(m)) return "working";
  if (n) return "needs";
  if (m.research || m.rescue) return "answer";
  if (m.receipt && m.task) return "result";
  return "rest";
}
/** The ask buttons each main action sends (groups.ts ENTRY): Fix it and Check my project send findProblem, Check before
 *  going live sends shipCheck. Choose a project needs no tool. */
export const MAIN_TOOL: Record<MainAct, string | null> = { fix: "findProblem", check: "findProblem", shipCheck: "shipCheck", folder: null };
/** The one main button for this moment, or none: only at rest and under a result is there one (one per screen). While a job
 *  works, a question waits, or another card needs a look, that card has the screen and no main button competes with it.
 *  `shown` is groups.ts buttonShown: with the action's tool switched off (F20) there is no main button, as there is no
 *  chip, so Home never offers what the engine would refuse. */
export const mainFor = (mode: HomeMode, s: HomeStatus, shown: (button: string) => boolean = () => true): MainAct | null => {
  if (mode !== "rest" && mode !== "result") return null;
  const tool = MAIN_TOOL[s.main];
  return tool === null || shown(tool) ? s.main : null;
};

// ---- the working card ----

const EDITS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
/** 0 Finding, 1 Fixing, 2 Checking, 3 Proven. Read only from the runner's real states: a file written means Fixing, a check
 *  running means Checking, a failed check being fixed steps back to Fixing (and says which try), and only a proven
 *  verdict fills the last step. */
export type JobStep = 0 | 1 | 2 | 3;
export function jobStep(m: Model, maxTries = 3): { step: JobStep; retry: string | null } {
  if (m.receipt && receiptVerdict(m)?.proven) return { step: 3, retry: null };
  const p = m.task?.proof;
  if (isFixing(m)) return { step: 1, retry: S.home.tryingAgain(Math.min(maxTries, (p?.tries ?? 1) + 1), maxTries) };
  if (m.character === "checking" || (p?.steps.length ?? 0) > 0) return { step: 2, retry: null };
  if (m.task?.lines.some((l) => EDITS.includes(l.tool))) return { step: 1, retry: null };
  return { step: 0, retry: null };
}

/** A running time as m:ss (h:mm:ss past an hour), in tabular figures on the card. */
export function clockWords(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

