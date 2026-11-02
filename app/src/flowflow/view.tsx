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
};

export function FlowflowView({ state, reduced, tuning, followRange, onFallback, className, controllerRef, colours, surface, liveliness, resting, small }: FlowflowViewProps) {
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

  if (failed) return null;
  return <canvas ref={canvas} className={className ?? "flowflow"} aria-hidden="true" />;
}
