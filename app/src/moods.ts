// M83 Part B, the character reacts to what really happens (the founder, 12 Nov 2026: "it only has one reaction, it always
// has the same reaction"). Plain decisions, tested in m83Reactions.test.ts; useMood.ts runs the clock on a page, and each
// style draws the reaction in its own art (flowflow/behavior.ts LOOKS, characters.ts poseFor, visorReaction, orbReaction).
//
// Every reaction has a real cause, never chance (the rule in flowflow/behavior.ts):
//   proud     a fix proven (a new proven receipt), the project's checks passing (Point at the problem), the practice fixed
//   worried   a review that says Not safe yet, or a key caught in the code (the instant key warning)
//   relieved  an Undo done (the restore came back), or a receipt newly undone
//   watching  your AI tool is working for you: Claude Code waiting for you in this project (hook.waiting), or a hand off
//             waiting for your tool (the page passes it); held while it lasts
//   hello     the pointer comes to rest on the character (or on the notch); once per arrival
//   sleepy    no activity at all for MOOD_MS.sleepy; any event or the pointer wakes it
// Stop everything ends any reaction at once. A reaction shows only over rest (and proud over done): work, a question, an
// error, listening and off always keep their own look. The protocol is untouched: only events the pages already receive.
import { receiptUndone, receiptVerdict, type CharacterState, type Model } from "./model.ts";
import { keyWarned } from "./review.ts";
import { MOOD_MS } from "./motionTokens.ts";

export const REACTIONS = ["proud", "worried", "relieved", "watching", "hello", "sleepy"] as const;
export type Reaction = (typeof REACTIONS)[number];
/** The short reactions: each shows for its MOOD_MS, then settles back to rest. */
export type Flash = "proud" | "worried" | "relieved" | "hello";
/** What one event means: a short reaction, or calm (Stop everything ends any reaction). */
export type MoodEvent = Exclude<Flash, "hello"> | "calm";

const provenNow = (m: Model): boolean => !!m.task && !!m.receipt && !!receiptVerdict(m)?.proven && !receiptUndone(m.receipt);

/** What just happened, from the model before and after one event (the reducer's own result). Null for anything else. */
export function moodEvent(prev: Model, next: Model): MoodEvent | null {
  if ((next.stopped ?? 0) !== (prev.stopped ?? 0)) return "calm";
  // Relieved: an Undo came back done, or the last result was newly undone.
  if (next.undo?.stage === "done" && prev.undo?.stage !== "done") return "relieved";
  if (receiptUndone(next.receipt) && !receiptUndone(prev.receipt) && next.receipt?.checkpoint === prev.receipt?.checkpoint) return "relieved";
  // Worried: a review that says Not safe yet, or a key newly caught in the code.
  const rv = next.review, was = prev.review;
  if (rv?.result?.rating === "stop" && rv.result !== was?.result) return "worried";
  if (keyWarned(rv) && (!keyWarned(was) || was.batch !== rv.batch || (rv.keys?.length ?? 0) > (was.keys?.length ?? 0))) return "worried";
  // Proud: a newly proven fix, the checks passing, the practice fixed.
  if (provenNow(next) && next.receipt !== prev.receipt && !(provenNow(prev) && prev.receipt?.checkpoint === next.receipt?.checkpoint)) return "proud";
  if (next.point?.stage === "clear" && prev.point?.stage !== "clear") return "proud";
  if (next.practice?.stage === "done" && prev.practice?.stage !== "done" && !next.practice.undone) return "proud";
  return null;
}

/** Your AI tool is working for you in the project open here: Claude Code is waiting for you (the waiting hook). */
export function watchingNow(m: Model): boolean {
  const w = m.claudeWaiting, here = m.task?.project ?? m.folder ?? "";
  return !!w && !!here && w.project.replace(/\/+$/, "") === here.replace(/\/+$/, "");
}

/** The clock of one character: the short reaction in force and until when, and when anything last happened. */
export type MoodClock = { flash: Flash | null; until: number; active: number };
export const moodStart = (now: number): MoodClock => ({ flash: null, until: 0, active: now });

/** An event (or none) arrived at `now`. `activity`: anything happened at all (it wakes a sleepy character). */
export function moodSee(c: MoodClock, e: MoodEvent | null, now: number, activity = true): MoodClock {
  const active = activity || e ? now : c.active;
  if (e === "calm") return { flash: null, until: 0, active };
  if (e) return { flash: e, until: now + MOOD_MS[e], active };
  return active === c.active ? c : { ...c, active };
}

/** The pointer came to rest on it: hello, unless another reaction is still showing (it is never cut short). Always activity. */
export function moodHello(c: MoodClock, now: number): MoodClock {
  if (c.flash && now < c.until) return { ...c, active: now };
  return { flash: "hello", until: now + MOOD_MS.hello, active: now };
}

/** The reaction at `now`: a short one in force, else watching while your tool works, else sleepy after long quiet. */
export function moodAt(c: MoodClock, now: number, watching: boolean): Reaction | null {
  if (c.flash && now < c.until) return c.flash;
  if (watching) return "watching";
  if (now - c.active >= MOOD_MS.sleepy) return "sleepy";
  return null;
}

/** How long until moodAt may change by itself (a short reaction ending, or sleepy beginning); null when only an event can. */
export function moodNextMs(c: MoodClock, now: number, watching: boolean): number | null {
  if (c.flash && now < c.until) return c.until - now;
  if (watching) return null;
  const sleepIn = c.active + MOOD_MS.sleepy - now;
  return sleepIn > 0 ? sleepIn : null;
}

/** The reaction shown over the app's state: only over rest, and proud over done. */
export function moodShown(state: CharacterState, r: Reaction | null): Reaction | null {
  if (!r) return null;
  if (state === "idle") return r;
  if (state === "done" && r === "proud") return r;
  return null;
}
