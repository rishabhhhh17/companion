// The panel that hangs from the notch while the pointer rests on it (F28, the overhaul spec 4.3): only what is live, one
// thing at a time. A job with Stop, a result with Undo and See proof, a question, "Add your key" when Claude is not
// connected, or one true line about the project. No greeting and no launcher buttons: a click on the notch always opens
// Home. Plain decisions only; islandPanel.tsx draws them and island.rs sizes the window to what is drawn.
import { characterWords, formatUsd, receiptVerdict, visualState, type CharacterState, type Model } from "./model.ts";
import type { Tone, Verdict } from "./verdict.ts";
import { S } from "./strings.ts";
import { approvalWords } from "./approvals.ts";
import { jobStep } from "./homeHero.ts";
import type { Wings } from "./home.ts";

export type JobTone = "working" | "needsYou" | "done" | "failed" | "partly" | "plain";
// here: a question that may be answered right in the notch (answerHere).
// code: the line under it is the exact command or path (drawn monospace); otherwise plain words in the system font (M46).
export type JobCard = { key: string; state: CharacterState; tone: JobTone; title: string; sub: string; cost: string | null; approval?: string; risk?: string; here?: boolean; code?: boolean };

/** M23: the questions answered right in the notch, once. Anything irreversible (send, pay, delete, go live) or that changes
 *  the person's git, and any kind not known here, opens Home to look first. `canUndo` (approvals.ts): a file outside the
 *  project that Undo cannot take back (Git pointed at another folder, M45) opens Home too, where the card says so. Network
 *  and install asks are answered here as before (M23), though Undo can't take them back. */
const HERE: readonly string[] = ["network", "install", "outside_project", "settings"];
export const answerHere = (risk: string, canUndo = true): boolean => HERE.includes(risk) && (risk !== "outside_project" || canUndo);
/** The buttons work only once the card has been on screen this long, so a pointer that happens to sit where the panel
 *  springs open cannot answer by accident. `since`: when the card was first drawn, null while hidden. */
export const ARM_MS = 600;
export const armed = (since: number | null, now: number): boolean => since !== null && now - since >= ARM_MS;
/** M46: may a card in the panel be pressed now? Opened by the pointer (`openedAt` null), at once. Opened by itself, only once
 *  the panel has been open ARM_MS and this card has been on screen ARM_MS too (`seenAt`, null before it was drawn), so a
 *  card that drops into a panel already open waits its own moment. */
export const cardReady = (openedAt: number | null, seenAt: number | null, now: number): boolean =>
  openedAt === null || (armed(openedAt, now) && armed(seenAt, now));

/** At most this many cards, so the panel stays a glance (island.rs PANEL_MAX); the rest are in Home. */
export const MAX_JOBS = 3;
const BUSY: readonly CharacterState[] = ["thinking", "working", "checking"];
const money = (usd: number) => (usd > 0 ? formatUsd(usd) : null);
/** A task's name as a title: its first letter capital ("fix the join button" reads "Fix the join button"). */
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The verdict's tone as the notch card's tone and state (M45, mapped here once): only a proven fix is green and "done". */
const JOB_TONE: Record<Tone, JobTone> = { good: "done", bad: "failed", mixed: "partly", plain: "plain", ask: "needsYou" };
const JOB_STATE: Record<Tone, CharacterState> = { good: "done", bad: "error", mixed: "idle", plain: "idle", ask: "needsYou" };

/** The cards, most urgent first: questions waiting for the person, then the work going on, then the last result. */
export function islandJobs(m: Model): JobCard[] {
  // M28: the plain question, and exactly what will happen under it (approvals.ts), never the safety rule's own words.
  // Paths are shown from the project folder down, as on Home's card (M45).
  const project = m.task?.project ?? m.folder ?? "";
  const out: JobCard[] = m.approvals.map((a) => { const w = approvalWords(a, project), here = answerHere(a.risk, w.canUndo || w.undo === null); return { key: `ask:${a.id}`, state: "needsYou" as const, tone: "needsYou" as const, title: w.question, sub: w.what ?? (here ? S.panel.askHere : S.panel.needsYou), cost: null, approval: a.id, risk: a.risk, here, ...(w.what ? { code: true } : {}) }; });
  const v = visualState(m);
  if (m.task && BUSY.includes(v)) {
    const d = m.drive && !m.drive.finished ? m.drive : null;
    out.push({ key: `task:${m.task.agent}`, state: v, tone: "working", title: title(m.task.label), sub: d ? S.panel.step(d.index, d.total, d.title) : characterWords(m), cost: money(m.task.costUsd) });
  } else if (m.task && m.receipt) {
    // The result, as the verdict says it (M45): an Undo turns the card plain, and its words change, so it peeks once.
    const v = receiptVerdict(m)!;
    out.push({ key: `done:${m.receipt.checkpoint}`, state: JOB_STATE[v.tone], tone: JOB_TONE[v.tone], title: title(m.task.label), sub: v.say, cost: money(m.receipt.usdEstimate) });
  }
  return out.slice(0, MAX_JOBS);
}

/** M46 (F28, replacing M26's work peek): a card hangs from the notch by itself, for a moment, only for a result that
 *  matters: a proven fix or a failure. A job starting, moving a step, its cost, a partly checked or a plain result (stopped,
 *  not checked) and Undo never drop it; the pointer on the notch shows them. The key is each such card's own key and tone,
 *  never its line. "" when there is none. */
export const resultPeekKey = (jobs: JobCard[]): string => jobs.filter((j) => !j.approval && (j.tone === "done" || j.tone === "failed")).map((j) => `${j.key}|${j.tone}`).join("\n");
/** As long as the done tick shows on the wings (home.ts DONE_WINGS_MS). */
export const RESULT_PEEK_MS = 4000;

/** The one line under the cards (not connected, an update, the engine stopped): only when no card already says what is
 *  happening, so nothing is said twice. */
export const panelNote = (line: string, jobs: JobCard[]): string => (jobs.length ? "" : line);

/** What the panel's buttons ask Home to do when it opens (main.rs open_card_cmd, arrival.rs): ask Undo's own question
 *  on the result (Home's receipt asks "are you sure" first), and open Settings on Account at the key. */
export const PANEL_DO = { undo: { do: "undo" }, key: { set: "account.claude" } } as const;

/** The one live thing the hover panel shows (4.3), most urgent first. `line`: the true sentence when nothing is live. */
export type PanelView =
  | { kind: "questions" }
  | { kind: "job"; job: JobCard }
  | { kind: "result"; job: JobCard; verdict: Verdict; canUndo: boolean }
  | { kind: "connect" }
  | { kind: "line"; line: string };
export function panelView(m: Model, jobs: JobCard[], o: { note: string; status: string }): PanelView {
  if (jobs.some((j) => j.approval)) return { kind: "questions" };
  const job = jobs.find((j) => j.key.startsWith("task:"));
  if (job) return { kind: "job", job };
  const done = jobs.find((j) => j.key.startsWith("done:"));
  const v = done ? receiptVerdict(m) : null;
  // Undo only where the result offers it and no undo is under way (the question itself is asked in Home).
  if (done && v) return { kind: "result", job: done, verdict: v, canUndo: v.offer === "undo" && !m.undo };
  if (m.connected === "none") return { kind: "connect" };
  return { kind: "line", line: o.note || o.status };
}

/** M55, live progress on the notch: while the task works, the step it is on in a word (the work card's own four steps,
 *  homeHero.ts jobStep, so the two never disagree) and the four steps as a thin line: done, the one now, and the ones
 *  ahead. Only while the wings show work going on (thinking, or the turning mark), and only for the task's own agent:
 *  never over a question waiting, the listening light, the look at the screen (rule 5), or a result. So it never says
 *  Proven: that is only ever a result, which the notch shows as a result (rule 14). */
export type StepMark = "done" | "now" | "ahead";
export type NotchStep = { word: string; marks: StepMark[] };
export function notchStep(m: Model, w: Wings | null, maxTries = 3): NotchStep | null {
  if (!m.task || !w || (w.mark !== "dots" && w.mark !== "arc") || !BUSY.includes(m.character) || m.agents[m.task.agent] !== m.character) return null;
  const { step } = jobStep(m, maxTries);
  if (step > 3) return null;
  return { word: S.home.steps[step], marks: S.home.steps.map((_, i): StepMark => (i < step ? "done" : i === step ? "now" : "ahead")) };
}
