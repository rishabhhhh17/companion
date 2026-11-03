// Smooth motion (M55 section 1). Moving between places is a short cross fade (out, then in) and a small slide, a card that goes folds
// away, what stays slides to its new place instead of jumping, and the time and the cost count up. Every duration and
// curve is read from ui/tokens.css (the one place they are written); a token that cannot be read means no motion, never a
// guess. Only transform, translate and opacity move, so the page never lays out again while it moves. Every move asks
// motion.ts first: with Reduce motion or Less motion everything is simply there. Nothing here runs at rest, and nothing is
// measured while Home is away: each move answers something that changed, and a later change takes over from wherever the
// last one is.
import { createElement, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { reducedMotion } from "./motion.ts";

/** The tokens this file reads, by what they are for. */
export const MOTION_TOKENS = {
  enter: "--dur-enter", exit: "--dur-exit", move: "--dur-move", count: "--dur-count",
  easeEnter: "--ease-enter", easeExit: "--ease-exit", easeMove: "--ease-move",
  slide: "--slide-place", growFrom: "--grow-from",
} as const;
export type MotionTokens = { enter: number; exit: number; move: number; count: number; easeEnter: string; easeExit: string; easeMove: string; slide: number; growFrom: number };

/** A slide further than this is a jump across the page: the thing is simply in its new place. */
export const MAX_SLIDE = 480;
/** More cards gone at once than this is a new page of work, not a card going: no fold. */
export const MAX_FOLDS = 4;
/** The most of a place that goes that fades out under the new one (only what was on screen is drawn again at all). */
export const MAX_FADES = 12;

/** A duration written in ms or s (".2s") as milliseconds; anything else is null. */
export function msOf(v: string): number | null {
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(v);
  return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : null;
}
/** "6px" as a number; anything else is null. */
export function pxOf(v: string): number | null {
  const m = /^\s*(-?\d*\.?\d+)px\s*$/.exec(v);
  return m ? Number(m[1]) : null;
}
/** The vertical part of a computed `translate` ("0px 12px", "4px" or "none"). */
export function translateYOf(v: string): number {
  const parts = v.trim().split(/\s+/);
  return parts.length >= 2 ? pxOf(parts[1]) ?? 0 : 0;
}

/** The motion tokens as numbers and curves, from a reader of the page's custom properties. Null when one is missing. */
export function readTokens(get: (name: string) => string): MotionTokens | null {
  const v = (k: keyof typeof MOTION_TOKENS) => get(MOTION_TOKENS[k]).trim();
  const enter = msOf(v("enter")), exit = msOf(v("exit")), move = msOf(v("move")), count = msOf(v("count")), slide = pxOf(v("slide"));
  const growFrom = Number(v("growFrom")), easeEnter = v("easeEnter"), easeExit = v("easeExit"), easeMove = v("easeMove");
  if (enter == null || exit == null || move == null || count == null || slide == null || !v("growFrom") || !Number.isFinite(growFrom) || !easeEnter || !easeExit || !easeMove) return null;
  return { enter, exit, move, count, easeEnter, easeExit, easeMove, slide, growFrom };
}

// ---- what stays, what went (plain arithmetic, tested) ----

/** Where a box sits in Home's content (transforms left out). It is measured from the top of the content that scrolls,
 *  so scrolling Home never moves it: only a change of the layout does. */
export type Spot = { top: number; left: number };

/** For each box that stayed and moved on screen: how far it starts back from where it is now, so it seems to slide from
 *  where it was. `shift` is how far Home's scroll moved while the page changed (content that got shorter pulls the
 *  scroll up with it; the person's own scrolling is never counted). `carried` is how far a slide still under way shows
 *  it off its place, so a second change takes over from there. A move under a pixel, one that changed column, or one
 *  longer than MAX_SLIDE is no slide. */
export function slides<K>(before: Map<K, Spot>, after: Map<K, Spot>, carried: (k: K) => number = () => 0, shift = 0): { key: K; dy: number }[] {
  const out: { key: K; dy: number }[] = [];
  for (const [k, now] of after) {
    const was = before.get(k);
    if (!was || Math.abs(was.left - now.left) >= 1) continue;
    const moved = was.top - now.top + shift;
    if (Math.abs(moved) < 1 || Math.abs(moved) > MAX_SLIDE) continue;
    out.push({ key: k, dy: moved + carried(k) });
  }
  return out;
}
/** The boxes that were there and are not now (gone from the page, or no longer drawn). */
export function gone<K>(before: Map<K, Spot>, after: Map<K, Spot>): K[] {
  return [...before.keys()].filter((k) => !after.has(k));
}
/** Of the boxes that went, the ones a person could see: drawn, and inside the part of Home on screen (`seen`, from the
 *  top of the content). At most MAX_FADES, top first. */
export function onScreen<K>(went: K[], before: Map<K, Spot & { height: number }>, seen: { top: number; height: number }): K[] {
  const out: K[] = [];
  for (const k of went) {
    const s = before.get(k);
    if (!s || s.height <= 0 || s.top + s.height <= seen.top || s.top >= seen.top + seen.height) continue;
    out.push(k);
    if (out.length >= MAX_FADES) break;
  }
  return out;
}

/** A number counting from `from` to `to`, `t` of the way through its time (0 to 1), on an ease out; exactly `to` at the end. */
export function countAt(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  const k = 1 - Math.pow(1 - Math.max(0, t), 3);
  return from + (to - from) * k;
}
/** A number counts only when it goes up by more than one `step` (the clock's one second tick is simply the next second),
 *  both ends are real numbers, and motion is not reduced. */
export function counts(from: number, to: number, reduced: boolean, step = 0): boolean {
  return !reduced && Number.isFinite(from) && Number.isFinite(to) && to - from > step;
}

// ---- the page ----

type Seen = Spot & { rel: Spot; width: number; height: number; parent: Element | null; offsetParent: Element | null };
const GHOST = "data-ghost";
const LOADS = "iframe, video, audio, object, embed";

const tokensOf = (el: Element): MotionTokens | null => {
  try { const cs = getComputedStyle(el); return readTokens((n) => cs.getPropertyValue(n)); } catch { return null; }
};
/** The boxes a container shows: its children, looking through any that draw no box of their own (display: contents) and
 *  into the ones named in `open`; never a ghost still fading. */
function boxesIn(parent: Element, open: Set<Element>, out: HTMLElement[] = []): HTMLElement[] {
  for (const c of Array.from(parent.children)) {
    if (!(c instanceof HTMLElement) || c.hasAttribute(GHOST)) continue;
    if (open.has(c) || getComputedStyle(c).display === "contents") boxesIn(c, open, out);
    else out.push(c);
  }
  return out;
}
/** Where a box sits from the top left of `content` (an ancestor that is positioned and scrolls with it, Home's .inner),
 *  added up box by box. Null for a box drawn nowhere, or one that is not inside `content`. */
function inContent(el: HTMLElement, content: Element): Spot | null {
  let top = 0, left = 0;
  for (let n: Element | null = el; n !== content; n = (n as HTMLElement).offsetParent) {
    if (!(n instanceof HTMLElement) || !n.offsetParent) return null;
    top += n.offsetTop; left += n.offsetLeft;
  }
  return { top, left };
}
/** The positioned box Home's parts are measured from (Home's .inner): the work column's own, or the one its parts sit in
 *  when the column draws no box of its own (the tall Home, display: contents). */
function contentOf(top: HTMLElement): Element | null {
  if (top.offsetParent) return top.offsetParent;
  for (const c of Array.from(top.children)) if (c instanceof HTMLElement && c.offsetParent) return c.offsetParent;
  return null;
}
/** Every box's place, read in one go (reads only, so the page lays out at most once for all of them). */
function measure(content: Element, boxes: HTMLElement[]): Map<HTMLElement, Seen> {
  const out = new Map<HTMLElement, Seen>();
  for (const b of boxes) {
    const at = inContent(b, content);
    if (!at || (!b.offsetWidth && !b.offsetHeight)) continue;
    out.set(b, { ...at, rel: { top: b.offsetTop, left: b.offsetLeft }, width: b.offsetWidth, height: b.offsetHeight, parent: b.parentElement, offsetParent: b.offsetParent });
  }
  return out;
}

/** What is new in a place that came in fades in and rises a little (--dur-enter, --ease-enter), once the old place has
 *  faded out (it waits --dur-exit, unseen), so text is never drawn over text. Its cards do not grow in a second time. */
function enterPlace(boxes: HTMLElement[], t: MotionTokens): void {
  if (reducedMotion()) return;
  for (const b of boxes) {
    if (b.matches(".bar")) continue;   // the top bar stays where it is: it is how a person knows where they are
    for (const a of b.getAnimations({ subtree: true })) if ((a as CSSAnimation).animationName === "card-in") a.finish();
    b.animate([{ opacity: 0, transform: `translateY(${t.slide}px)` }, { opacity: 1, transform: "none" }], { duration: t.enter, delay: t.exit, easing: t.easeEnter, fill: "backwards" });
  }
}

/** A box that went, drawn once more where it was, out of the way of VoiceOver, the keyboard and the pointer. It writes
 *  only: nothing is read here, so many ghosts cost one layout, not one each (drawGhosts reads them all after). */
function ghostOf(el: HTMLElement, was: Seen, shift: number): HTMLElement | null {
  const parent = was.parent;
  // Never a copy of something that would load or play again (a page in a frame, a video, a sound): it simply goes.
  if (!parent || !parent.isConnected || el.matches(LOADS) || el.querySelector(LOADS)) return null;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.setAttribute(GHOST, "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.removeAttribute("id");
  ghost.removeAttribute("hidden");
  for (const n of Array.from(ghost.querySelectorAll("[id]"))) n.removeAttribute("id");
  // A copied choice keeps no name, so it can never join (and change) the real one's group.
  for (const n of Array.from(ghost.querySelectorAll("[name]"))) n.removeAttribute("name");
  // A copied canvas comes up blank (live Flowflow is drawn on one, and reading it back would stall the graphics card), so
  // the copy has none: the still picture of the same pose under it (homeCharacter.tsx, hidden by .flow-ready) shows instead.
  for (const c of Array.from(ghost.querySelectorAll("canvas"))) c.remove();
  for (const n of Array.from(ghost.querySelectorAll(".flow-ready"))) n.classList.remove("flow-ready");
  Object.assign(ghost.style, { position: "absolute", top: `${was.rel.top + shift}px`, left: `${was.rel.left}px`, width: `${was.width}px`, height: `${was.height}px`, margin: "0", boxSizing: "border-box", pointerEvents: "none", animation: "none", transition: "none", transformOrigin: "top center" });
  parent.insertBefore(ghost, parent.firstChild);   // first, so what slides into its place is drawn over it
  return ghost;
}
/** Draws the ghosts (one layout for all), drops any that would not sit where its box was, and plays `frames` on the rest,
 *  removing each when it ends or is stopped. */
function drawGhosts(list: { el: HTMLElement; was: Seen }[], shift: number, frames: Keyframe[], duration: number, easing: string): void {
  if (reducedMotion()) return;
  const made = list.map(({ el, was }) => ({ ghost: ghostOf(el, was, shift), was }));
  for (const { ghost, was } of made) {
    if (!ghost) continue;
    if (ghost.offsetParent !== was.offsetParent) { ghost.remove(); continue; }
    const a = ghost.animate(frames, { duration, easing, fill: "forwards" });
    const done = () => ghost.remove();
    a.onfinish = done; a.oncancel = done;
  }
}
/** Cards that went inside a place fold away where they were (--dur-exit, quicker than they came in), a little up and a
 *  little smaller, under whatever slides up into their place. */
function foldAway(list: { el: HTMLElement; was: Seen }[], shift: number, t: MotionTokens): void {
  if (reducedMotion()) return;
  drawGhosts(list, shift, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${-t.slide / 2}px) scale(${t.growFrom})` }], t.exit, t.easeExit);
}
/** The place that went fades out where it was (--dur-exit), and then the new one fades in: a short cross fade, one
 *  after the other, so the two never show at once. */
function fadeAway(list: { el: HTMLElement; was: Seen }[], shift: number, t: MotionTokens): void {
  if (reducedMotion()) return;
  drawGhosts(list, shift, [{ opacity: 1 }, { opacity: 0 }], t.exit, t.easeExit);
}

const sliding = new WeakMap<HTMLElement, Animation>();
/** A box that stayed starts `dy` back from its new place and slides into it (--dur-move). On `translate`, so a transform
 *  of its own (a card growing in) is left alone. */
function slideTo(el: HTMLElement, dy: number, t: MotionTokens): void {
  if (reducedMotion()) return;
  sliding.get(el)?.cancel();
  const a = el.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: t.move, easing: t.easeMove });
  sliding.set(el, a);
  a.onfinish = () => { if (sliding.get(el) === a) sliding.delete(el); };
}
const carriedOf = (el: HTMLElement): number => {
  if (!sliding.get(el)) return 0;
  try { return translateYOf(getComputedStyle(el).translate); } catch { return 0; }
};

/** Home's motion between renders: a new place cross fades in; within a place, a card that goes folds away; and in both,
 *  what stays slides to its new place. `scroller` is Home itself (it scrolls), `work` holds Home's parts, `view` the cards
 *  of the place open. Nothing is measured or moved while Home is away or motion is reduced. */
export function useHomeMotion(scroller: RefObject<HTMLElement | null>, work: RefObject<HTMLElement | null>, view: RefObject<HTMLElement | null>, place: string, shown: boolean): void {
  const last = useRef<{ place: string; seen: Map<HTMLElement, Seen>; content: Element } | null>(null);
  // Where Home was scrolled to, kept up as the person scrolls, so their own scrolling is never taken for a change.
  const scrolled = useRef(0);
  useEffect(() => {
    const host = scroller.current;
    if (!host) return;
    const keep = () => { scrolled.current = host.scrollTop; };
    host.addEventListener("scroll", keep, { passive: true });
    return () => host.removeEventListener("scroll", keep);
  }, []);
  useLayoutEffect(() => {
    const host = scroller.current, top = work.current;
    if (!shown || reducedMotion() || !host || !top) { last.current = null; return; }
    const content = contentOf(top);
    if (!content || !host.contains(content)) { last.current = null; return; }
    const open = new Set<Element>(view.current ? [view.current] : []);
    const boxes = boxesIn(top, open), seen = measure(content, boxes);
    const now = host.scrollTop, shift = now - scrolled.current;
    scrolled.current = now;
    const was = last.current;
    last.current = { place, seen, content };
    if (!was || was.content !== content) return;
    const t = tokensOf(host);
    if (!t) return;
    const went = gone(was.seen, seen).map((el) => ({ el, was: was.seen.get(el)! }));
    if (was.place !== place) {
      const shownBefore = new Set(onScreen(went.map((g) => g.el), was.seen, { top: now - shift, height: host.clientHeight }));
      fadeAway(went.filter((g) => shownBefore.has(g.el)), shift, t);
      enterPlace(boxes.filter((b) => seen.has(b) && !was.seen.has(b)), t);
    } else if (went.length <= MAX_FOLDS) foldAway(went, shift, t);
    for (const { key, dy } of slides(was.seen, seen, carriedOf, shift)) slideTo(key, dy, t);
  });
}

/** A number that counts up to its new value (--dur-count) instead of jumping, in the words `words` gives it. It writes its
 *  own words as it counts, and only when they change, so nothing else on the page draws again for it. Going down, by no
 *  more than one `step`, or with motion reduced, it is simply the new number. */
export function CountUp({ value, words, step = 0 }: { value: number; words: (n: number) => string; step?: number }) {
  const span = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useLayoutEffect(() => {
    const el = span.current;
    if (!el) return;
    const put = (n: number) => { shown.current = n; const w = words(n); if (el.textContent !== w) el.textContent = w; };
    const from = shown.current, t = tokensOf(el);
    if (!counts(from, value, reducedMotion(), step) || !t) { put(value); return; }
    // Timed by the frames' own clock from the first frame on, so the count always ends on time, whatever the page's clock.
    let frame = 0, start = -1;
    const tick = (at: number) => { if (start < 0) start = at; const n = countAt(from, value, (at - start) / t.count); put(n); if (n !== value) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, words, step]);
  return createElement("span", { ref: span });
}
