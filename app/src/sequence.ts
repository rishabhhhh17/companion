// Multi step pointing: one answer from Show me may name up to five targets in order ("type your name here, then your
// email, then click Save"). The card plays them one after another: the pointer flies to each (the lead in), its line is
// shown and said, a short pause, then the next. Only the last one waits for the person's click. A target below the
// confidence line is said in words and never drawn (F17 4.2). The Mac side snaps and draws each one, and refuses when the
// window the picture was taken of has changed (rule 22); then the rest are not shown.
import { aimDecision, notSureWords } from "./pointer.ts";

export const MAX_TARGETS = 5;
/** Before each line: the pointer flies to its target. */
export const LEAD_MS = 900;
/** After each line, before the next target. */
export const AFTER_MS = 350;

export type Mark = "ring" | "arrow" | "underline" | "box";
export type Target = { x: number; y: number; ocrId?: string; targetText: string; confidence: number; caption: string; mark?: Mark; screen?: number };
/** One step of a sequence. draw: pointed at (otherwise said in words). hold: the last step, drawn, waiting for the click. */
export type Step = { target: Target; index: number; total: number; draw: boolean; hold: boolean; text: string };

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
function asTarget(t: unknown): Target | null {
  if (typeof t !== "object" || t === null) return null;
  const o = t as Record<string, unknown>;
  if (!finite(o.x) || !finite(o.y) || typeof o.caption !== "string") return null;
  return {
    x: o.x, y: o.y, caption: o.caption, targetText: typeof o.targetText === "string" ? o.targetText : "",
    confidence: finite(o.confidence) ? o.confidence : 0,
    ...(typeof o.ocrId === "string" ? { ocrId: o.ocrId } : {}),
    ...(typeof o.mark === "string" ? { mark: o.mark as Mark } : {}),
    ...(Number.isInteger(o.screen) ? { screen: o.screen as number } : {}),
  };
}

/** The targets an assist.point event carries, in order: its list when it has one, otherwise the event itself. */
export function targetsOf(ev: unknown): Target[] {
  if (typeof ev !== "object" || ev === null) return [];
  const list = (ev as { targets?: unknown }).targets;
  const raw = Array.isArray(list) && list.length ? list : [ev];
  return raw.map(asTarget).filter((t): t is Target => t !== null).slice(0, MAX_TARGETS);
}

/** The steps to play. In a lesson only the click target (the last one) is used, because a lesson step is one click. */
export function planSteps(targets: Target[], o: { lesson?: boolean } = {}): Step[] {
  const click = clickTarget(targets);
  const use = (o.lesson ? (click ? [click] : []) : targets).slice(0, MAX_TARGETS);
  return use.map((target, index) => {
    const draw = aimDecision(target.confidence) === "draw";
    return { target, index, total: use.length, draw, hold: draw && index === use.length - 1, text: draw ? target.caption : notSureWords(target.targetText, target.caption) };
  });
}

/** The whole answer as one line, for the walkthrough's record of what was done. */
export const stepsLine = (steps: Step[]): string => steps.map((s) => s.target.caption.trim()).filter(Boolean).join("; then ");

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** The slowest speed Settings offers (voiceset.rs SPEEDS). */
const SLOWEST = 0.5;
/** What the speed does to a spoken line's time: slower is longer. Faster never makes it shorter (an estimate: how fast the
 *  Mac's voice really goes at each speed needs a real Mac, and a line cut off by the next one is worse than a short pause).
 *  Anything odd is normal speed. */
const slowdown = (speed: number) => (Number.isFinite(speed) && speed > 0 ? 1 / Math.min(1, Math.max(SLOWEST, speed)) : 1);
/** How long a line stays (an estimate): as long as the Mac's voice takes to say it (about three words a second at the
 *  normal speed; `speed` is the one picked in Settings), or as long as it takes to read when nothing is said. */
export function lineMs(text: string, speaking: boolean, speed = 1): number {
  const n = words(text);
  return Math.round(speaking ? clamp(400 + n * 340, 1200, 8000) * slowdown(speed) : clamp(900 + n * 260, 1500, 6000));
}

/** When each step starts, in ms after the answer arrived: one after another, each after the last one's lead in, its line
 *  and a short pause. */
export function startTimes(steps: Step[], speaking: boolean, speed = 1): number[] {
  const at: number[] = [];
  let t = 0;
  for (const s of steps) { at.push(t); t += LEAD_MS + lineMs(s.text, speaking, speed) + AFTER_MS; }
  return at;
}

/** Whether what the card now shows ends a sequence that is still playing: the pointer went away (Stop, closing the card,
 *  holding to talk, Point at the problem: the shell then says "done"), or the Mac side took a step's ring away because its
 *  window changed while it was up (rule 22). */
export function sequenceOver(showme: { stage: string } | null | undefined): boolean {
  return !showme || showme.stage === "window_changed";
}

/** Whether an answer that has just arrived is still wanted: the card is still on that question. Once its question was
 *  ended (closing the card or Stop while "Finding it", its window changed), it is not played, not even in words. */
export const stillWanted = (showme: { stage: string } | null | undefined): boolean => !sequenceOver(showme);

/** The target of an answer the person clicks: the last one (the vision prompt lists them in the order to look at them,
 *  ending with where to click). */
export function clickTarget(targets: Target[]): Target | null { return targets.length ? targets[targets.length - 1] : null; }

export type Actions = {
  /** Snap and draw this step. Resolves false when it could not be drawn (its window changed, or the pointer was cleared). */
  aim: (s: Step) => Promise<boolean>;
  /** Say this step in words; nothing is drawn. */
  words: (s: Step) => void;
};
type Timers = { set: (f: () => void, ms: number) => unknown; clear: (t: unknown) => void };
const realTimers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/** The card's one Show me answer at a time: the steps still to come and the one line still waiting to be said (a step's
 *  line waits for its pointer to land). hush() ends both at once: closing the card, holding to talk, Point at the problem,
 *  Stop, a new question. */
export function answerPlayer(timers: Timers = realTimers) {
  let stop: () => void = () => {};
  let line: unknown;
  const cancelLine = () => { if (line !== undefined) { timers.clear(line); line = undefined; } };
  return {
    /** Plays a new answer; whatever was playing or waiting to be said before it is dropped. `speed`: the one picked in
     *  Settings, so each spoken line is said whole before the next step's line. */
    start(steps: Step[], act: Actions, speaking: boolean, speed = 1) { this.hush(); stop = play(steps, act, speaking, timers, speed); },
    /** Says a line after a pause, unless it is hushed or replaced first. One line waits at a time. */
    sayLater(say: () => void, ms: number) { cancelLine(); line = timers.set(() => { line = undefined; say(); }, ms); },
    cancelLine,
    /** Nothing more of the answer is drawn or said. */
    hush() { stop(); stop = () => {}; cancelLine(); },
  };
}

/** Plays the steps in order. Each next step is scheduled only once the one before it was shown, so a step that could not
 *  be drawn stops the rest. Returns the stop switch (Stop everything, Esc, a new question). */
export function play(steps: Step[], act: Actions, speaking: boolean, timers: Timers = realTimers, speed = 1): () => void {
  let stopped = false;
  let timer: unknown;
  const run = async (i: number) => {
    if (stopped || i >= steps.length) return;
    const s = steps[i];
    let ok = true;
    if (s.draw) { try { ok = await act.aim(s); } catch { ok = false; } } else act.words(s);
    if (stopped || !ok || i + 1 >= steps.length) return;
    timer = timers.set(() => { void run(i + 1); }, LEAD_MS + lineMs(s.text, speaking, speed) + AFTER_MS);
  };
  void run(0);
  return () => { stopped = true; if (timer !== undefined) timers.clear(timer); };
}
