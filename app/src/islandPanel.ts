// The panel that hangs from the notch while the pointer rests on it (27 Oct 2026, the founder: "like HeyClicky's notch
// hover", "Flowflow is not the main guy, he is the water agent"). Not a character: the ask bar, the two things Squibby is
// for, and each piece of work as a little card, its agent's face, what it is doing (the plan's step while it works) and
// then its result. Plain decisions only; islandPanel.tsx draws them and island.rs sizes the window to what is drawn.
import { characterWords, formatUsd, receiptProofWords, visualState, type CharacterState, type Model } from "./model.ts";
import { S } from "./strings.ts";

export type JobTone = "working" | "needsYou" | "done" | "failed";
export type JobCard = { key: string; state: CharacterState; tone: JobTone; title: string; sub: string; cost: string | null; approval?: string; risk?: string };

/** M23: the questions answered right in the notch, once: the ones that can be taken back. Anything that cannot be undone
 *  (send, pay, delete, go live) or that changes the person's git, and any kind not known here, opens Home to look first. */
const HERE: readonly string[] = ["network", "install", "outside_project", "settings"];
export const answerHere = (risk: string): boolean => HERE.includes(risk);
/** The buttons work only once the card has been on screen this long, so a pointer that happens to sit where the panel
 *  springs open cannot answer by accident. `since`: when the card was first drawn, null while hidden. */
export const ARM_MS = 600;
export const armed = (since: number | null, now: number): boolean => since !== null && now - since >= ARM_MS;

/** At most this many cards, so the panel stays a glance (island.rs PANEL_MAX); the rest are in Home. */
export const MAX_JOBS = 3;
const BUSY: readonly CharacterState[] = ["thinking", "working", "checking"];
const money = (usd: number) => (usd > 0 ? formatUsd(usd) : null);
/** A task's name as a title: its first letter capital ("fix the join button" reads "Fix the join button"). */
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The cards, most urgent first: questions waiting for the person, then the work going on, then the last result. */
export function islandJobs(m: Model): JobCard[] {
  const out: JobCard[] = m.approvals.map((a) => ({ key: `ask:${a.id}`, state: "needsYou" as const, tone: "needsYou" as const, title: a.title, sub: answerHere(a.risk) ? S.panel.askHere : S.panel.needsYou, cost: null, approval: a.id, risk: a.risk }));
  const v = visualState(m);
  if (m.task && BUSY.includes(v)) {
    const d = m.drive && !m.drive.finished ? m.drive : null;
    out.push({ key: `task:${m.task.agent}`, state: v, tone: "working", title: title(m.task.label), sub: d ? S.panel.step(d.index, d.total, d.title) : characterWords(m), cost: money(m.task.costUsd) });
  } else if (m.task && m.receipt) {
    const failed = m.receipt.proof === "failed";
    out.push({ key: `done:${m.receipt.checkpoint}`, state: failed ? "error" : "done", tone: failed ? "failed" : "done", title: title(m.task.label), sub: receiptProofWords(m), cost: money(m.receipt.usdEstimate) });
  }
  return out.slice(0, MAX_JOBS);
}

/** M26: work cards hang from the notch by themselves for a moment when something changes (a job starts, moves a step,
 *  ends with its proof), like a phone's live activity, then tuck back so nothing stays over the person's windows. This is
 *  what counts as a change: each card's kind, title and line, never its cost. "" when there is no work. */
export const workPeekKey = (jobs: JobCard[]): string => jobs.filter((j) => !j.approval).map((j) => `${j.key}|${j.tone}|${j.sub}`).join("\n");
export const WORK_PEEK_MS = 3500;

/** The one line under the cards (not connected, an update, the engine stopped): only when no card already says what is
 *  happening, so nothing is said twice. */
export const panelNote = (line: string, jobs: JobCard[]): string => (jobs.length ? "" : line);

/** What the two quick buttons ask Home to do when it opens (main.rs open_card_cmd, settingswin.rs arrival). */
export const PANEL_DO = { find: { do: "find" }, ship: { do: "shipCheck" }, settings: { place: "settings" } } as const;
