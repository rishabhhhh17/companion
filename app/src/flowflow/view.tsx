// Flowflow in a page: a canvas, the controller, and the picture poses underneath as the fallback. React only mounts and
// unmounts it and passes the app's state in; the animation itself never goes through React state.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CharacterState } from "../model.ts";
import type { Reaction } from "../moods.ts";
import type { Liveliness } from "../lookfeel.ts";
import { FlowflowController } from "./controller.ts";
import { flowflowPool } from "./pool.ts";
import type { Side } from "./engine.ts";
import type { Tuning } from "./physics.ts";

export type FlowflowViewProps = {
  state: CharacterState;
  /** Less motion: one still picture on each change. */
  reduced?: boolean;
  tuning?: Partial<Tuning>;
  followRange?: number;
  /** Called once if the live character cannot run (no WebGL, or the GPU context was lost): show the pictures instead. */
  onFallback?: () => void;
  className?: string;
  /** The water's colours (lookfeel.ts flowColours); today's ocean when not given. */
  colours?: { light: string; deep: string };
  /** M37c: a surface the water clings to: Home's waterline (`below`, `at` from the top, 0 to 1), with how much it joins it at rest. */
  surface?: { side: Side; at?: number; cling?: number };
  /** Gives the preview a handle to the controller (for its numbers). */
  controllerRef?: { current: FlowflowController | null };
  /** M46 (F28, character.lively): Still unless given. A change shows at once (it is news). */
  liveliness?: Liveliness;
  /** M46: hold still (a call, Low Power Mode, tucked away), except while listening. */
  resting?: boolean;
  /** M46: a small Flowflow (the notch's wing): working draws at WORK_INTERVAL in every choice, Lively included. */
  small?: boolean;
  /** M90 review: pinned for the peek out of the notch: its place and size hold and nothing leaves it (FlowflowEngine.pinned). */
  pinned?: boolean;
  /** M60: the orb's soft halo on a dark page; on unless turned off (Home draws its own glow behind it). */
  halo?: boolean;
  /** M55 (character.reacts): its small moves for what happens; on unless turned off. */
  reacts?: boolean;
  /** M55: the id of the page's ask box. While the person types in it, its eyes go to it (Gentle and Lively). Only that a key
   *  went in is used, never what was typed. */
  askId?: string;
  /** M55: the id of the card it leans toward while changes wait for a review, or null when nothing waits. */
  leanTo?: string | null;
  /** M66 (pool.ts): a small character that mounts as something opens (History, the notch's wings, a panel) never starts or
   *  compiles a drawing then: it shows `placeholder` (its still picture) until a warm one is ready, made in an idle moment. */
  waitForWarm?: boolean;
  placeholder?: ReactNode;
  /** M83: the reaction in force (useMood.ts, from a real event), or null. */
  mood?: Reaction | null;
};

/** M83: the way from the middle of the canvas to the middle of the screen it is on, in points (y down), or null. Reads only
 *  where the window and the canvas are, never anything on the screen. */
export function towardScreenMiddle(from: Element): { dx: number; dy: number } | null {
  const a = from.getBoundingClientRect(), sc = window.screen;
  if (!(a.width > 0) || !sc || !(sc.width > 0)) return null;
  const left = (sc as Screen & { availLeft?: number }).availLeft ?? 0, top = (sc as Screen & { availTop?: number }).availTop ?? 0;
  return { dx: left + sc.width / 2 - (window.screenX + a.left + a.width / 2), dy: top + sc.height / 2 - (window.screenY + a.top + a.height / 2) };
}

/** M55: the way from the middle of the canvas to the middle of an element, in points (y down), or null if either is not laid
 *  out. Reads only where the two boxes are, never what is in them. */
export function toward(from: Element, to: Element): { dx: number; dy: number } | null {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (!(a.width > 0) || !(b.width > 0) || !(b.height > 0)) return null;
  return { dx: b.left + b.width / 2 - (a.left + a.width / 2), dy: b.top + b.height / 2 - (a.top + a.height / 2) };
}
/** How often the way to the ask box is measured again while keys keep coming (ms): typing never lays the page out per key. */
const ASK_MEASURE_MS = 400;
/** The card is measured again once it has grown in (smoothMotion.ts, --dur-enter and a little). */
const LEAN_SETTLED_MS = 450;

export function FlowflowView({ state, reduced, tuning, followRange, onFallback, className, controllerRef, colours, surface, liveliness, resting, small, halo, reacts, askId, leanTo, waitForWarm, placeholder, pinned, mood = null }: FlowflowViewProps) {
  // M66: the canvas is the pool's (pool.ts), put into this host and taken out again on close; the host has no box of its
  // own (display: contents), so the canvas is styled and placed as if it were here directly.
  const host = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const ctl = useRef<FlowflowController | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(() => !waitForWarm || flowflowPool().ready > 0);
  const initial = useRef({ state, reduced, tuning, followRange, onFallback, liveliness, resting, small, pinned, className, waitForWarm, mood });

  // Waiting for a warm drawing: asked for in an idle moment, and kept warm from then on for the next open.
  useEffect(() => {
    if (ready || failed) return;
    let live = true;
    flowflowPool().keepWarm();
    flowflowPool().warmSoon().then((ok) => { if (!live) return; if (ok) setReady(true); else { setFailed(true); initial.current.onFallback?.(); } });
    return () => { live = false; };
  }, [ready, failed]);

  useEffect(() => {
    const h = host.current; if (!h || !ready) return;
    const i = initial.current;
    const fail = () => { setFailed(true); i.onFallback?.(); };
    const wait = !!i.waitForWarm;
    const got = flowflowPool().take() ?? (wait ? null : flowflowPool().fresh());
    if (!got) { if (wait) setReady(false); else fail(); return; }   // another small one took the warm one: wait for the next
    const c = got.canvas;
    c.className = i.className ?? "flowflow"; c.setAttribute("aria-hidden", "true");
    h.appendChild(c); canvas.current = c;
    let given = false;
    const giveBack = () => { if (given) return; given = true; c.remove(); flowflowPool().give(got); };
    const made = FlowflowController.create({ canvas: c, host: h.parentElement ?? h, tuning: i.tuning, reduced: i.reduced, followRange: i.followRange, onFallback: fail, small: i.small, pinned: i.pinned, renderer: got.renderer, release: giveBack });
    if (!made) { giveBack(); fail(); return; }
    ctl.current = made; if (controllerRef) controllerRef.current = made;
    made.setLiveliness(i.liveliness ?? "still");
    made.setState(i.state);
    if (i.mood === "watching") { const w = towardScreenMiddle(c); if (w) made.watchToward(w.dx, w.dy); }
    made.setReaction(i.mood);
    if (i.resting) made.setResting(true);
    return () => { made.dispose(); giveBack(); canvas.current = null; ctl.current = null; if (controllerRef) controllerRef.current = null; };
  }, [controllerRef, ready]);

  useEffect(() => { ctl.current?.setState(state); }, [state]);
  // M83: the reaction, and where the middle of the screen is while it watches (measured when watching starts).
  useEffect(() => {
    const c = canvas.current, made = ctl.current; if (!made) return;
    if (mood === "watching" && c) { const w = towardScreenMiddle(c); if (w) made.watchToward(w.dx, w.dy); }
    made.setReaction(mood);
  }, [mood, ctl.current]);
  useEffect(() => { ctl.current?.setLiveliness(liveliness ?? "still"); }, [liveliness]);
  useEffect(() => { ctl.current?.setResting(!!resting); }, [resting, ctl.current]);
  useEffect(() => { ctl.current?.setReduced(!!reduced); }, [reduced]);
  useEffect(() => { if (colours) ctl.current?.setColours(colours.light, colours.deep); }, [colours?.light, colours?.deep, ctl.current]);
  useEffect(() => { if (tuning) ctl.current?.setTuning(tuning); }, [tuning]);
  useEffect(() => { ctl.current?.setHalo(halo !== false); }, [halo, ctl.current]);
  // The page's sky (--pond), read now and again whenever the theme, its tone or its contrast changes (the audit, item 30).
  useEffect(() => {
    const c = canvas.current, made = ctl.current; if (!c || !made) return;
    const readSky = () => made.setEnvBase(getComputedStyle(c).getPropertyValue("--pond"));
    readSky();
    if (typeof MutationObserver === "undefined") return;
    const o = new MutationObserver(readSky);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-tone", "data-contrast", "data-colour", "class"] });
    return () => o.disconnect();
  }, [ctl.current]);
  useEffect(() => { if (surface) ctl.current?.setSurface(surface.side, surface.at ?? 1, surface.cling ?? 0); }, [surface?.side, surface?.at, surface?.cling, ctl.current]);
  // M55 (the character reacts, plan section 4).
  useEffect(() => { ctl.current?.setReacts(reacts !== false); }, [reacts, ctl.current]);
  // The ask box: each key typed in it (an input event on that one box, which carries no text) turns the eyes to it. The way
  // to it is measured at most every ASK_MEASURE_MS. The controller decides whether it may look (not in Still).
  useEffect(() => {
    const c = canvas.current, made = ctl.current; if (!c || !made || !askId) return;
    let at = -Infinity, way: { dx: number; dy: number } | null = null;
    const onInput = (e: Event) => {
      const box = e.target as Element | null;
      if (!box || box.id !== askId) return;
      const t = e.timeStamp;
      if (!way || t - at > ASK_MEASURE_MS) { way = toward(c, box); at = t; }
      if (way) made.attend(way.dx, way.dy);
    };
    document.addEventListener("input", onInput, { passive: true });
    return () => document.removeEventListener("input", onInput);
  }, [askId, ctl.current]);
  // Changes waiting: lean toward their card. Measured once laid out, again once it has grown in, and when the window resizes.
  useEffect(() => {
    const c = canvas.current, made = ctl.current; if (!c || !made) return;
    if (!leanTo) { made.leanToward(null); return; }
    const aim = () => { const card = document.getElementById(leanTo); made.leanToward(card ? toward(c, card) : null); };
    const raf = requestAnimationFrame(aim), later = setTimeout(aim, LEAN_SETTLED_MS);
    window.addEventListener("resize", aim, { passive: true });
    return () => { cancelAnimationFrame(raf); clearTimeout(later); window.removeEventListener("resize", aim); };
  }, [leanTo, ctl.current]);

  if (failed) return null;
  if (!ready) return <>{placeholder ?? null}</>;
  return <span ref={host} className="ff-host" style={{ display: "contents" }} aria-hidden="true" />;
}
