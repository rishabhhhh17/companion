import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type TransitionEvent } from "react";
import { invoke, listen } from "./tauri.ts";
import { reducedMotion } from "./motion.ts";
import { bodyHeight, contentClip, foldMs, geomFrom, growMs, homeNext, pieceSizes, shapeTransforms, type FromRect, type HomeGeom, type HomePhase } from "./homeShape.ts";
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
  // M70: opened while the notch showed its small panel: for one frame the shape is drawn as that panel, under it and with no
  // motion (`snap`), then it grows on from there. `tok` calls off a start that a close or a stop overtook. The `from` is kept
  // until Home closes (M70 step 4): the band keeps the panel's width while the shape opens, then eases back.
  const [from, setFrom] = useState<FromRect | null>(null);
  const [snap, setSnap] = useState(false);
  const tok = useRef(0);
  // Feel round 1 (18 Nov 2026): a close while Home is still opening reverses at once (`quick`, no hold for the content), and
  // an opening while it is still folding brings the content back at once (`reopen`): the shape is mostly there already.
  const [quick, setQuick] = useState(false);
  const [reopen, setReopen] = useState(false);
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
  // The opening ends on the body's transitionend (onEnd), and on this timer when none comes (growMs): a keyboard opening,
  // Reduce motion or Less motion, a shape that does not change ("free"), or a hidden page. A close or a stop clears it.
  const grownLater = (now: boolean) => {
    window.clearTimeout(backstop.current);
    backstop.current = window.setTimeout(() => setPhase((p) => homeNext(p, "shown")), growMs(now, reducedMotion()));
  };
  useEffect(() => {
    void invoke("home_geom").then((v) => {
      const o = v as { geom?: unknown; shown?: unknown } | null;
      const g = geomFrom(o?.geom);
      if (g) setGeom(g);
      if (o?.shown === true) { setPhase((p) => homeNext(p, "open")); grownLater(false); }
    }).catch(() => {});
    const offGeom = listen("home-geom", (e) => { const g = geomFrom(e.payload); if (g) setGeom(g); });
    const offHover = listen("home-hover", (e) => setHover((e.payload as { on?: unknown } | null)?.on === true));
    // Closing: fold back; the page's transitionend ends it, and this timer only if that never comes (a hidden page). The
    // page starts its own close the moment the X or Escape is pressed (close below), so the shell's word that follows finds
    // it already closing and changes nothing.
    const offClosing = listen("closing", () => closeNow());
    // Closed by the shell itself (Stop everything, Hide, a display change, or after the fold): closed at once.
    const offClosed = listen("closed", () => { tok.current++; setFrom(null); setSnap(false); setHover(false); window.clearTimeout(backstop.current); setPhase((p) => homeNext(p, "stop")); });
    return () => { for (const o of [offGeom, offHover, offClosing, offClosed]) o.then((f) => f()); window.clearTimeout(backstop.current); };
  }, []);
  function closeNow() {
    const was = phaseRef.current;
    if (was === "closing" || was === "closed") return;
    tok.current++; setFrom(null); setSnap(false);
    setInstant(false); setReopen(false); setQuick(was === "opening");
    phaseRef.current = homeNext(was, "close");
    setPhase((p) => homeNext(p, "close"));
    window.clearTimeout(backstop.current);
    backstop.current = window.setTimeout(folded, foldMs(reducedMotion()));
  }
  const open = (now = false, f: FromRect | null = null) => {
    setReopen(phaseRef.current === "closing"); setQuick(false);
    window.clearTimeout(backstop.current); setHover(false); setInstant(now);
    const t = ++tok.current;
    if (f && !now && phaseRef.current === "closed" && !reducedMotion()) {
      setFrom(f); setSnap(true);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (tok.current !== t) return; setSnap(false); setPhase((p) => homeNext(p, "open")); grownLater(false); }));
      return;
    }
    setFrom(null); setSnap(false);
    setPhase((p) => homeNext(p, "open")); grownLater(now);
  };
  return { geom, phase, hover, instant, contentH, setContentH, open, close: closeNow, folded, setPhase, from, snap, quick, reopen };
}

type Stage = ReturnType<typeof useHomeStage>;

/** Appended to every piece's transform when a motion turns round mid way (HomeStage `turned`): a hundredth of a point, so
 *  the new target is never exactly the old start and each piece runs a whole new spring from where it is. */
export const INTERRUPT_NUDGE = "translate(0px, 0.01px)";
/** How long an open Home's resize runs (OPEN_H's whole curve, homeShape.css), after which its edge and shadow come back. */
export const RESIZE_MS = 380;

/** The stage: the shape's pieces, and Home's frame (its content) on top of them. Without measures yet (the very first
 *  moment), Home fills the window as before, with no shape. */
export function HomeStage({ stage, children }: { stage: Stage; children: ReactNode }) {
  const { geom: g, phase, hover, contentH } = stage;
  const bodyH = g ? bodyHeight(g, contentH) : 0;
  // Feel round 3 (19 Nov 2026): a place of another height (Now to Learn) used to resize Home in one frame. Open, the shape
  // now springs to the new height on OPEN_H. Growing, the content's clip starts at the old height for one frame and then
  // follows the shape on the same spring, so nothing is drawn past the shape; getting smaller, the content is cut at once and
  // the shape folds up under it. The hairline edge and the shadow wait until the shape is there.
  const [grow, setGrow] = useState(0);
  const [resizing, setResizing] = useState(false);
  const lastH = useRef(bodyH);
  useLayoutEffect(() => {
    const was = lastH.current;
    lastH.current = bodyH;
    if (phase !== "open" || was === bodyH || !was || reducedMotion()) return;
    setResizing(true);
    if (bodyH > was) { setGrow(bodyH - was); requestAnimationFrame(() => setGrow(0)); }
    const t = window.setTimeout(() => setResizing(false), RESIZE_MS);
    return () => window.clearTimeout(t);
  }, [bodyH, phase]);
  const from = phase === "closing" ? null : stage.from;
  const t = g ? shapeTransforms(g, { phase, hover: hover && phase === "closed" && !from, bodyH, from }) : null;
  const P = g ? pieceSizes(g) : null;
  // Feel round 2: the content is cut to the shape while it grows (homeShape.css), never drawn past it.
  const clip = g ? contentClip(g, { phase, hover: false, bodyH, from }) : null;
  const px = (n: number) => `${Math.round(n * 100) / 100}px`;
  // Feel round 3 (19 Nov 2026): a close while Home is still opening (or an opening while it still folds) must not be a CSS
  // "reversal": a reversed transition is cut short by how far its value had moved, and with the spring curves each piece
  // had moved a different share, so the height fell in one frame while the width still eased. A target a hundredth of a
  // point away is a new transition instead: every piece starts from where it is, on the same spring and the same clock.
  const turned = (stage.quick && phase === "closing") || (stage.reopen && phase === "opening");
  const tt = (s: string) => (turned ? `${s} ${INTERRUPT_NUDGE}` : s);
  const nudge = turned ? 0.01 : 0;
  const vars = (g && t && P ? {
    "--cx": px(g.cx), "--band-w": px(P.band.w), "--band-h": px(P.band.h), "--mid-w": px(P.mid.w), "--mid-h": px(P.mid.h), "--strip-w": px(P.strip.w),
    "--hx": px(g.cx - g.body.w / 2), "--hy": px(g.body.top), "--hw": px(g.body.w), "--hh": px(bodyH),
    "--t-band": tt(t.band), "--t-mid-y": tt(t.midY), "--t-mid-x": tt(t.midX), "--t-foot-y": tt(t.footY), "--t-strip": tt(t.strip), "--t-corner-l": tt(t.cornerL), "--t-corner-r": tt(t.cornerR),
    "--t-top-l": tt(t.topL), "--t-top-r": tt(t.topR), "--t-join-l": tt(t.joinL), "--t-join-r": tt(t.joinR), "--t-content": t.content, "--o-content": String(t.contentOpacity),
    "--clip-x": `${Math.round(((clip?.x ?? 0) + nudge) * 100) / 100}px`, "--clip-b": `${Math.round(((clip?.b ?? 0) + nudge + (phase === "open" ? grow : 0)) * 100) / 100}px`,
  } : {}) as CSSProperties;
  // The body's height piece ends last on open and on close: its transitionend is the motion's end.
  const onEnd = (e: TransitionEvent) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (phase === "closing") stage.folded();
    else if (phase === "opening") stage.setPhase((p) => homeNext(p, "shown"));
  };
  return (
    <div className="home-stage" data-phase={phase} data-quick={stage.quick && phase === "closing" ? "" : undefined} data-reopen={stage.reopen && phase !== "closed" ? "" : undefined} data-instant={(stage.instant || stage.snap) && phase !== "closing" ? "" : undefined} data-hover={hover && phase === "closed" ? "" : undefined} data-from={from && g ? "" : undefined} data-kind={g?.kind} data-told={g ? "" : undefined} data-resizing={resizing && phase === "open" ? "" : undefined} data-grow-start={grow > 0 && phase === "open" ? "" : undefined} style={vars}>
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
