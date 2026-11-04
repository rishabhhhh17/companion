import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type TransitionEvent } from "react";
import { invoke, listen } from "./tauri.ts";
import { reducedMotion } from "./motion.ts";
import { bodyHeight, foldMs, geomFrom, homeNext, pieceSizes, shapeTransforms, type HomeGeom, type HomePhase } from "./homeShape.ts";
import "./ui/homeShape.css";

// Home's stage (M66 Part 2 step 1): the black shape that grows out of the notch, and Home's content inside it. The window
// never changes size; the shell tells the measures (home-geom) and when Home opens, closes or stops, and this page owns the
// whole motion: one clock, the stylesheet's transitions (homeShape.css), and its own transitionend says when a close has
// folded back (home_folded). The state is a React data attribute on the stage, so a re-render mid motion never changes it.

/** The stage's state, from the shell's words. Call `open` in the same update that sets the tab Home opens on. */
export function useHomeStage() {
  const [geom, setGeom] = useState<HomeGeom | null>(null);
  const [phase, setPhase] = useState<HomePhase>("closed");
  const [hover, setHover] = useState(false);
  const [contentH, setContentH] = useState(0);
  // M26: opened by a keyboard shortcut, Home is simply there (island.rs animates_open): no growing for that opening.
  const [instant, setInstant] = useState(false);
  const phaseRef = useRef<HomePhase>("closed");
  phaseRef.current = phase;
  const backstop = useRef(0);
  const folded = () => {
    window.clearTimeout(backstop.current);
    if (phaseRef.current !== "closing") return;
    phaseRef.current = "closed";
    setPhase("closed");
    void invoke("home_folded").catch(() => {});
  };
  useEffect(() => {
    void invoke("home_geom").then((v) => {
      const o = v as { geom?: unknown; shown?: unknown } | null;
      const g = geomFrom(o?.geom);
      if (g) setGeom(g);
      if (o?.shown === true) setPhase((p) => homeNext(p, "open"));
    }).catch(() => {});
    const offGeom = listen("home-geom", (e) => { const g = geomFrom(e.payload); if (g) setGeom(g); });
    const offHover = listen("home-hover", (e) => setHover((e.payload as { on?: unknown } | null)?.on === true));
    // Closing: fold back; the page's transitionend ends it, and this timer only if that never comes (a hidden page).
    const offClosing = listen("closing", () => {
      setInstant(false);
      setPhase((p) => homeNext(p, "close"));
      window.clearTimeout(backstop.current);
      backstop.current = window.setTimeout(folded, foldMs(reducedMotion()));
    });
    // Closed by the shell itself (Stop everything, Hide, a display change, or after the fold): closed at once.
    const offClosed = listen("closed", () => { window.clearTimeout(backstop.current); setPhase((p) => homeNext(p, "stop")); });
    return () => { for (const o of [offGeom, offHover, offClosing, offClosed]) o.then((f) => f()); window.clearTimeout(backstop.current); };
  }, []);
  const open = (now = false) => { window.clearTimeout(backstop.current); setHover(false); setInstant(now); setPhase((p) => homeNext(p, "open")); };
  return { geom, phase, hover, instant, contentH, setContentH, open, folded, setPhase };
}

type Stage = ReturnType<typeof useHomeStage>;

/** The stage: the shape's pieces, and Home's frame (its content) on top of them. Without measures yet (the very first
 *  moment), Home fills the window as before, with no shape. */
export function HomeStage({ stage, children }: { stage: Stage; children: ReactNode }) {
  const { geom: g, phase, hover, contentH } = stage;
  const bodyH = g ? bodyHeight(g, contentH) : 0;
  const t = g ? shapeTransforms(g, { phase, hover: hover && phase === "closed", bodyH }) : null;
  const P = g ? pieceSizes(g) : null;
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  const vars = (g && t && P ? {
    "--cx": px(g.cx), "--band-w": px(P.band.w), "--band-h": px(P.band.h), "--mid-w": px(P.mid.w), "--mid-h": px(P.mid.h), "--strip-w": px(P.strip.w),
    "--hx": px(g.cx - g.body.w / 2), "--hy": px(g.body.top), "--hw": px(g.body.w), "--hh": px(bodyH),
    "--t-band": t.band, "--t-mid-y": t.midY, "--t-mid-x": t.midX, "--t-foot-y": t.footY, "--t-strip": t.strip, "--t-corner-l": t.cornerL, "--t-corner-r": t.cornerR,
    "--t-top-l": t.topL, "--t-top-r": t.topR, "--t-join-l": t.joinL, "--t-join-r": t.joinR, "--t-content": t.content, "--o-content": String(t.contentOpacity),
  } : {}) as CSSProperties;
  // The body's height piece ends last on open and on close: its transitionend is the motion's end.
  const onEnd = (e: TransitionEvent) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (phase === "closing") stage.folded();
    else if (phase === "opening") stage.setPhase((p) => homeNext(p, "shown"));
  };
  return (
    <div className="home-stage" data-phase={phase} data-instant={stage.instant && phase !== "closing" ? "" : undefined} data-hover={hover && phase === "closed" ? "" : undefined} data-kind={g?.kind} data-told={g ? "" : undefined} style={vars}>
      {g && <div className="hs" aria-hidden="true">
        <i className="hs-band" />
        <i className="hs-top l" /><i className="hs-top r" />
        <i className="hs-join l" /><i className="hs-join r" />
        <span className="hs-mid-y" onTransitionEnd={onEnd}><i className="hs-mid" /></span>
        <span className="hs-foot-y"><i className="hs-strip" /><i className="hs-corner l" /><i className="hs-corner r" /></span>
      </div>}
      <div className="home-frame" inert={phase === "closed" || phase === "closing" ? true : undefined}>{children}</div>
    </div>
  );
}
