// M90: Flowflow peeks out of the notch (F32, the founder, 14 Nov 2026: the notch at rest is no longer bare). Only Flowflow's
// eyes and the top of its head show, tucked against the notch's left or right edge, while something goes on; it reacts,
// and it hides when nothing does. Plain decisions, tested in m90PeekOut.test.ts; peekOutPage.tsx only draws them and the
// shell (peekout.rs) places the small window and keeps its own hard rules (a call, a capture, Home open, Stop everything).
// (peek.ts is the character peeking past a screen edge, M26; notchPeek.ts is the notch's hover panel, M84.)
//
// What each state shows, first that holds:
//   waiting   a tool waits on you (a question, an approval, Claude Code's waiting hook): a gentle look and a small amber dot
//   proud     a review's checks passed (or a proven fix: moods.ts), for MOOD_MS.proud
//   worried   a check failed, or a review said Not safe yet (or a key was caught: moods.ts), for MOOD_MS.worried
//   watching  Squibby's own job or review runs, or a connected tool runs commands (hook.busy: only from the saved copy
//             signal, its guard hook, after the person's yes, and only for shell commands; a tool editing files shows nothing)
//   hello     once, for HELLO_MS after launch
//   rest      the quiet spell after anything went on (the resting face), then
//   sleepy    for the last part of that spell, then hidden.
// Every change has a real cause, never chance (flowflow/behavior.ts): only events the page already receives.
import type { CharacterState, Model } from "./model.ts";
import { visualState } from "./model.ts";
import type { Pose } from "./characters.ts";
import { moodEvent, type Reaction } from "./moods.ts";
import { MOOD_MS } from "./motionTokens.ts";

export const PEEK_LOOKS = ["hello", "watching", "waiting", "proud", "worried", "sleepy", "rest"] as const;
export type PeekLook = (typeof PEEK_LOOKS)[number];
/** Why it is hidden now: turned off, Home or the hover panel open, a call in front, a capture or Show me how on, Stop
 *  everything pressed, or nothing going on. */
export type PeekHide = "off" | "home" | "call" | "capture" | "stopped" | "idle";
export type PeekResult = "proud" | "worried";

/** The settings' choices (protocol/settings.json notch.peekSide and notch.peekHideAfter). */
export const PEEK_SIDES = ["left", "right"] as const;
export type PeekSide = (typeof PEEK_SIDES)[number];
export const PEEK_HIDE_AFTER = ["1", "2", "5", "10"] as const;
const HIDE_AFTER_USUAL = "2";

/** How long the hello at launch shows. */
export const HELLO_MS = 2400;
/** How long a connected tool counts as busy after its hook last said so with nothing since (a hook says busy as a tool
 *  runs a command; its done hook ends it at once). */
export const BUSY_HOLD_MS = 90_000;
/** At most this long of the quiet spell is sleepy, and never more than a third of it. */
const SLEEPY_MAX_MS = 20_000;
export const sleepyMs = (hideAfterMs: number): number => Math.min(SLEEPY_MAX_MS, Math.round(hideAfterMs / 3));

export const peekSide = (v: unknown): PeekSide => (v === "right" ? "right" : "left");
export const peekHideAfterMs = (v: unknown): number => {
  const s = typeof v === "string" && (PEEK_HIDE_AFTER as readonly string[]).includes(v) ? v : HIDE_AFTER_USUAL;
  return Number(s) * 60_000;
};

// ---------- what the model says ----------

/** `busyUntil`: when a tool said busy stops counting by itself (so the page's one timer wakes then), or null. */
export type PeekSignals = { working: boolean; waiting: boolean; busyUntil: number | null };

const OWN_WORK: readonly CharacterState[] = ["thinking", "working", "checking"];
/** Work and waiting now, from the page's model: Squibby's own job or review, a connected tool said busy (any project: the
 *  latest one counts, each ended only by its own done), and
 *  anything that waits on the person (any project: the peek is for every AI tool, the hover panel says which). */
export function peekSignals(m: Model, now: number): PeekSignals {
  const times = Object.values(m.toolBusy ?? {});
  const busyAt = times.length ? Math.max(...times) : null;
  const busyUntil = busyAt !== null && now - busyAt < BUSY_HOLD_MS ? busyAt + BUSY_HOLD_MS : null;
  const v = visualState(m);
  const working = OWN_WORK.includes(v) || m.review?.stage === "reviewing" || busyUntil !== null;
  const waiting = v === "needsYou" || m.approvals.length > 0 || !!m.claudeWaiting || !!m.agentsAsk || !!m.stuck || !!m.costPause || !!m.paused;
  return { working, waiting, busyUntil };
}

/** A result that just came, from the model before and after one event: a review's checks passing is proud, a check failing
 *  or a review saying Not safe yet is worried (once per result); otherwise the character's own proud and worried (moods.ts:
 *  a proven fix, a key caught). Null for anything else. */
export function peekResult(prev: Model, next: Model): PeekResult | null {
  const r = next.review?.result ?? null;
  if (r && r !== prev.review?.result) {
    if (r.checks === "failed" || r.rating === "stop") return "worried";
    if (r.checks === "passed") return "proud";
  }
  const e = moodEvent(prev, next);
  return e === "proud" || e === "worried" ? e : null;
}

// ---------- the clock ----------

/** `started`: when the page started (the hello). `active`: when anything last went on (null: nothing yet). `on`: whether
 *  work or waiting was going on at the last look (its end starts the quiet spell). `stoppedAt`: Stop everything was pressed
 *  then, and nothing new has happened since. */
export type PeekClock = { started: number; active: number | null; on: boolean; result: { kind: PeekResult; at: number } | null; stoppedAt: number | null };
export const peekClock = (now: number): PeekClock => ({ started: now, active: null, on: false, result: null, stoppedAt: null });

/** One look at what is going on (each model change, and the timer). Only a change counts as news after a stop: work that
 *  was already said as going on is not. */
export function peekSee(c: PeekClock, o: { signals: PeekSignals; result: PeekResult | null; stopped: boolean }, now: number): PeekClock {
  if (o.stopped) return { ...c, active: null, on: o.signals.working || o.signals.waiting, result: null, stoppedAt: now };
  const on = o.signals.working || o.signals.waiting;
  const news = (on && !c.on) || !!o.result;
  let active = c.active;
  if (on || news || (c.on && !on)) active = now;   // going on, new, or just ended: the quiet spell counts from here
  return { ...c, on, active: c.stoppedAt !== null && !news ? c.active : active, result: o.result ? { kind: o.result, at: now } : c.result, stoppedAt: news ? null : c.stoppedAt };
}

export type PeekRules = { on: boolean; quiet: boolean; capturing: boolean; homeOpen: boolean; hideAfterMs: number };
export type PeekNow = { show: boolean; look: PeekLook | null; dot: boolean; hide: PeekHide | null };
const hidden = (hide: PeekHide): PeekNow => ({ show: false, look: null, dot: false, hide });
const shown = (look: PeekLook): PeekNow => ({ show: true, look, dot: look === "waiting", hide: null });

/** What the peek shows at `now`, or why it is hidden. */
export function peekNow(c: PeekClock, s: PeekSignals, r: PeekRules, now: number): PeekNow {
  if (!r.on) return hidden("off");
  if (r.homeOpen) return hidden("home");
  if (r.quiet) return hidden("call");
  if (r.capturing) return hidden("capture");
  if (c.stoppedAt !== null) return hidden("stopped");
  if (s.waiting) return shown("waiting");
  if (c.result && now - c.result.at < MOOD_MS[c.result.kind]) return shown(c.result.kind);
  if (s.working) return shown("watching");
  if (now - c.started < HELLO_MS && c.active === null) return shown("hello");
  if (c.active === null) return hidden("idle");
  const quietFor = now - c.active;
  if (quietFor < r.hideAfterMs - sleepyMs(r.hideAfterMs)) return shown("rest");
  if (quietFor < r.hideAfterMs) return shown("sleepy");
  return hidden("idle");
}

/** How long until peekNow may change by itself (the hello ending, a result ending, a busy tool going quiet, sleepy
 *  starting, the hide), or null when only an event can change it. The page sets one timer for this; nothing loops. */
export function peekNextMs(c: PeekClock, s: PeekSignals, r: PeekRules, now: number): number | null {
  const at: number[] = [];
  if (s.busyUntil !== null) at.push(s.busyUntil);
  if (!r.on || r.homeOpen || r.quiet || r.capturing || c.stoppedAt !== null) return null;
  if (c.result) at.push(c.result.at + MOOD_MS[c.result.kind]);
  if (c.active === null) at.push(c.started + HELLO_MS);
  else if (!s.working && !s.waiting) at.push(c.active + r.hideAfterMs - sleepyMs(r.hideAfterMs), c.active + r.hideAfterMs);
  const next = at.filter((t) => t > now).map((t) => t - now);
  return next.length ? Math.min(...next) : null;
}

// ---------- how each look is drawn ----------

/** The live drawing (the Draw live renderer, flowflow/: the app's state and a reaction over rest), the existing picture for
 *  Draw live off (glance, peek, worry and sleep only: no new art), and the amber dot. */
export type PeekDraw = { state: CharacterState; mood: Reaction | null; pose: Pose; dot: boolean };
const DRAW: Readonly<Record<PeekLook, PeekDraw>> = {
  hello: { state: "idle", mood: "hello", pose: "peek", dot: false },
  watching: { state: "idle", mood: "watching", pose: "glance", dot: false },
  waiting: { state: "idle", mood: null, pose: "glance", dot: true },
  proud: { state: "idle", mood: "proud", pose: "peek", dot: false },
  worried: { state: "idle", mood: "worried", pose: "worry", dot: false },
  sleepy: { state: "idle", mood: "sleepy", pose: "sleep", dot: false },
  rest: { state: "idle", mood: null, pose: "peek", dot: false },
};
export const peekDraw = (look: PeekLook): PeekDraw => DRAW[look];
