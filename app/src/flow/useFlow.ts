// Flowflow in the dock page: makes the renderer when the canvas appears, keeps it told about the pose, the state and the
// motion setting, and says when to use the plain picture instead (no WebGL, a failure, a lost context). The dock page
// (dock.tsx) draws a canvas and a picture and shows only one of them.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { SKIN, poseFile } from "../skins.ts";
import { FlowRenderer } from "./renderer.ts";
import type { Motion } from "./physics.ts";

export type FlowApi = {
  /** A click or touch at a point of the page (client pixels). */
  poke: (clientX: number, clientY: number, strength?: number) => void;
  /** The same at a point across the picture (0 to 1 each way). */
  touchAt: (x: number, y: number, strength?: number) => void;
  /** How fast the window moves, pixels per second. */
  velocity: (vx: number, vy: number) => void;
  /** A big moment: a ripple and droplets thrown from this point of the page. */
  big: (x: number, y: number) => void;
};

export type Flow = { canvasRef: RefObject<HTMLCanvasElement | null>; dropRef: RefObject<HTMLCanvasElement | null>; ready: boolean; failed: boolean; api: FlowApi };

export function useFlow(o: { pose: string; state: string; calm: boolean }): Flow {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dropRef = useRef<HTMLCanvasElement | null>(null);
  const fr = useRef<FlowRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The newest values, for the moment the renderer is made.
  const now = useRef(o); now.current = o;
  const motion = (calm: boolean): Motion => (calm ? "calm" : "full");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return;
    const r = FlowRenderer.create({
      canvas, dropCanvas: dropRef.current, skin: SKIN, motion: SKIN.motion, pose: now.current.pose, urlFor: (p) => poseFile(SKIN, p),
      onReady: () => setReady(true),
      onLost: () => { fr.current = null; setReady(false); setFailed(true); },
    });
    if (!r) { setFailed(true); return; }
    r.motion = motion(now.current.calm);
    r.setState(now.current.state);
    fr.current = r;
    return () => { r.dispose(); if (fr.current === r) fr.current = null; };
  }, [failed]);

  useEffect(() => { fr.current?.setPose(o.pose); }, [o.pose]);
  useEffect(() => { fr.current?.setState(o.state); }, [o.state]);
  useEffect(() => { fr.current?.setMotion(motion(o.calm)); }, [o.calm]);

  const api = useMemo<FlowApi>(() => ({
    poke: (x, y, s) => fr.current?.poke(x, y, s),
    touchAt: (x, y, s) => fr.current?.touchAt(x, y, s),
    velocity: (vx, vy) => fr.current?.velocity(vx, vy),
    big: (x, y) => fr.current?.big(x, y),
  }), []);
  return { canvasRef, dropRef, ready, failed, api };
}
