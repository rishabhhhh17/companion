// Flowflow in a page: a canvas, the controller, and the picture poses underneath as the fallback. React only mounts and
// unmounts it and passes the app's state in; the animation itself never goes through React state.
import { useEffect, useRef, useState } from "react";
import type { CharacterState } from "../model.ts";
import type { Liveliness } from "../lookfeel.ts";
import { FlowflowController } from "./controller.ts";
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
  /** M60: the orb's soft halo on a dark page; on unless turned off (Home draws its own glow behind it). */
  halo?: boolean;
  /** M55 (character.reacts): its small moves for what happens; on unless turned off. */
  reacts?: boolean;
  /** M55: the id of the page's ask box. While the person types in it, its eyes go to it (Gentle and Lively). Only that a key
   *  went in is used, never what was typed. */
  askId?: string;
  /** M55: the id of the card it leans toward while changes wait for a review, or null when nothing waits. */
  leanTo?: string | null;
};

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

export function FlowflowView({ state, reduced, tuning, followRange, onFallback, className, controllerRef, colours, surface, liveliness, resting, small, halo, reacts, askId, leanTo }: FlowflowViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<FlowflowController | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = useRef({ state, reduced, tuning, followRange, onFallback, liveliness, resting, small });

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const i = initial.current;
    const fail = () => { setFailed(true); i.onFallback?.(); };
    const made = FlowflowController.create({ canvas: c, host: c.parentElement ?? c, tuning: i.tuning, reduced: i.reduced, followRange: i.followRange, onFallback: fail, small: i.small });
    if (!made) { fail(); return; }
    ctl.current = made; if (controllerRef) controllerRef.current = made;
    made.setLiveliness(i.liveliness ?? "still");
    made.setState(i.state);
    if (i.resting) made.setResting(true);
    return () => { made.dispose(); ctl.current = null; if (controllerRef) controllerRef.current = null; };
  }, [controllerRef]);

  useEffect(() => { ctl.current?.setState(state); }, [state]);
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
  return <canvas ref={canvas} className={className ?? "flowflow"} aria-hidden="true" />;
}
