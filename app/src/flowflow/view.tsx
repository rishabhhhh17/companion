// Flowflow in a page: a canvas, the controller, and the picture poses underneath as the fallback. React only mounts and
// unmounts it and passes the app's state in; the animation itself never goes through React state.
import { useEffect, useRef, useState } from "react";
import type { CharacterState } from "../model.ts";
import { FlowflowController } from "./controller.ts";
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
  /** Gives the preview a handle to the controller (for its numbers). */
  controllerRef?: { current: FlowflowController | null };
};

export function FlowflowView({ state, reduced, tuning, followRange, onFallback, className, controllerRef, colours }: FlowflowViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<FlowflowController | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = useRef({ state, reduced, tuning, followRange, onFallback });

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const i = initial.current;
    const fail = () => { setFailed(true); i.onFallback?.(); };
    const made = FlowflowController.create({ canvas: c, host: c.parentElement ?? c, tuning: i.tuning, reduced: i.reduced, followRange: i.followRange, onFallback: fail });
    if (!made) { fail(); return; }
    ctl.current = made; if (controllerRef) controllerRef.current = made;
    made.setState(i.state);
    return () => { made.dispose(); ctl.current = null; if (controllerRef) controllerRef.current = null; };
  }, [controllerRef]);

  useEffect(() => { ctl.current?.setState(state); }, [state]);
  useEffect(() => { ctl.current?.setReduced(!!reduced); }, [reduced]);
  useEffect(() => { if (colours) ctl.current?.setColours(colours.light, colours.deep); }, [colours?.light, colours?.deep, ctl.current]);
  useEffect(() => { if (tuning) ctl.current?.setTuning(tuning); }, [tuning]);

  if (failed) return null;
  return <canvas ref={canvas} className={className ?? "flowflow"} aria-hidden="true" />;
}
