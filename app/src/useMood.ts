// M83: the reaction a page's character shows now (moods.ts), from the page's own model (useModel.ts, the same events every
// page reads) and the pointer on the character. One timer at a time, set for when the reaction can next change by itself
// (a short one ending, or sleepy beginning after long quiet); nothing runs on a loop. The pointer is only felt arriving,
// moving and leaving the character's own element; where it is on the screen is never read.
import { useEffect, useRef, useState, type RefObject } from "react";
import type { CharacterState, Model } from "./model.ts";
import { MOOD_MS } from "./motionTokens.ts";
import { moodAt, moodEvent, moodHello, moodNextMs, moodSee, moodShown, moodStart, watchingNow, type MoodClock, type Reaction } from "./moods.ts";

export type MoodOptions = {
  /** The state the character shows (a reaction shows only over rest, and proud over done). */
  state: CharacterState;
  /** The character's own element: the pointer coming to rest on it says hello once, and any move on it is activity. */
  host?: RefObject<Element | null>;
  /** Something outside also says your AI tool is working (a hand off waiting for your tool, card.tsx). */
  watching?: boolean;
  /** Changes when the pointer came to rest somewhere that greets for it (the notch): hello, once per change. */
  hello?: number | string | null;
};

export function useMood(m: Model | null, o: MoodOptions): Reaction | null {
  const opened = useRef(Date.now());
  const clock = useRef<MoodClock>(moodStart(Date.now()));
  const prev = useRef<Model | null>(m);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  // Each new model is an event that arrived. The events a page replays as it opens are the past, never news (MOOD_MS.quietOnOpen).
  if (m && prev.current !== m) {
    const now = Date.now();
    const e = prev.current ? moodEvent(prev.current, m) : null;
    clock.current = moodSee(clock.current, now - opened.current < MOOD_MS.quietOnOpen && e !== "calm" ? null : e, now, true);
    prev.current = m;
  }

  // The pointer on the character: activity, and hello when it comes to rest there (once per arrival).
  useEffect(() => {
    const el = o.host?.current; if (!el) return;
    let armed = true, rest: ReturnType<typeof setTimeout> | undefined;
    const wake = () => { const was = moodAt(clock.current, Date.now(), false); clock.current = moodSee(clock.current, null, Date.now(), true); if (was === "sleepy") bump(); };
    const onMove = () => {
      wake();
      clearTimeout(rest);
      if (armed) rest = setTimeout(() => { armed = false; clock.current = moodHello(clock.current, Date.now()); bump(); }, MOOD_MS.helloRest);
    };
    const onLeave = () => { clearTimeout(rest); armed = true; };
    el.addEventListener("pointerenter", onMove, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => { clearTimeout(rest); el.removeEventListener("pointerenter", onMove); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); };
  }, [o.host?.current]);

  // The pointer came to rest on the notch (island.tsx): hello once per change.
  const firstHello = useRef(o.hello);
  useEffect(() => {
    if (o.hello == null || o.hello === firstHello.current) return;
    clock.current = moodHello(clock.current, Date.now()); bump();
  }, [o.hello]);

  const watching = (!!m && watchingNow(m)) || !!o.watching;
  const now = Date.now();
  const shown = moodShown(o.state, moodAt(clock.current, now, watching));
  // One timer, for the next change by itself.
  const next = moodNextMs(clock.current, now, watching);
  useEffect(() => {
    if (next === null) return;
    const t = setTimeout(bump, Math.max(0, next) + 5);
    return () => clearTimeout(t);
  }, [next === null ? null : Math.round((now + next) / 50)]);
  return shown;
}
