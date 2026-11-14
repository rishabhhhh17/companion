import { StrictMode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { settingsReady, startSettings, useSetting } from "./settingsStore.ts";
import { followLessMotion, reducedMotion, watchReducedMotion } from "./motion.ts";
import { invoke, listen } from "./tauri.ts";
import { useModel } from "./useModel.ts";
import { useLook } from "./useLook.ts";
import { useRest } from "./useRest.ts";
import { livelinessOf, flowColours } from "./lookfeel.ts";
import { poseUrl } from "./characters.ts";
import { DUR, EXIT_MS, MOOD_MS } from "./motionTokens.ts";
import type { Model } from "./model.ts";
import { S } from "./strings.ts";
import { PartBoundary } from "./partBoundary.tsx";
import { peekClock, peekDraw, peekHideAfterMs, peekNextMs, peekNow, peekResult, peekSee, peekSide, peekSignals, type PeekLook } from "./peekOut.ts";
import "./style.css";
import "./ui/peekout.css";

// M90 (F32, the founder, 14 Nov 2026): Flowflow peeks out of the notch. This page fills a small non activating window the
// shell keeps beside the notch (peekout.rs, shell_peekout.rs). It decides what to show from the same events every page
// reads (peekOut.ts, tested), tells the shell whether it wants to be out (peekout_want), and slides in only when the shell
// allows it too (peekout-allow: not during a call, a capture, Show me how, with Home or the hover panel open, or after
// Stop everything). Only Flowflow's eyes and the top of its head show: the live water (Draw live, flowflow/) with its own
// reactions, or with Draw live off the existing pictures. Hidden, nothing is drawn at all: the live drawing is given back
// once the slide out ends, so no frame runs while it is away. A click opens Home (island_click, as the notch's own click);
// pointing at it opens the notch's hover panel (the shell reads the pointer's place only, never keys or the screen).

const FlowflowView = lazy(() => import("./flowflow/view.tsx").then((x) => ({ default: x.FlowflowView })));
/** How long after the slide out begins the drawing is taken away (the exit, and a frame of room). */
export const UNMOUNT_MS = EXIT_MS.sheet + 40;

export function PeekOut() {
  useLook({ keepNight: true });
  const [m] = useModel();
  // Nothing is asked for before the settings are read, so a peek turned off never shows for a moment at launch.
  const [ready, setReady] = useState(false);
  useEffect(() => { let live = true; void settingsReady().then(() => { if (live) setReady(true); }); return () => { live = false; }; }, []);
  const peekOn = useSetting("notch.peek") !== false;   // read every render: a hook is never skipped
  const on = ready && peekOn;
  const side = peekSide(useSetting("notch.peekSide"));
  const hideAfterMs = peekHideAfterMs(useSetting("notch.peekHideAfter"));
  const liveOn = useSetting("character.live") === true;
  const lively = livelinessOf(useSetting("character.lively"));
  const reactsOn = useSetting("character.reacts") !== false;
  const resting = useRest();
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  const [failed, setFailed] = useState(false);
  // The shell's own rules (a call, a capture, Home or the panel open, Stop, the notch hidden). False until it says.
  const [allow, setAllow] = useState(false);
  useEffect(() => {
    void invoke("peekout_state").then((v) => setAllow((v as { on?: unknown } | null)?.on === true)).catch(() => {});
    const off = listen("peekout-allow", (e) => setAllow((e.payload as { on?: unknown } | null)?.on === true));
    return () => { off.then((f) => f()); };
  }, []);

  // The clock: each model change is one look at what goes on. Events replayed as the page opens are the past, not news.
  const opened = useRef(Date.now());
  const clock = useRef(peekClock(Date.now()));
  const prev = useRef<Model | null>(null);
  const [, bump] = useState(0);
  const now = Date.now();
  const signals = peekSignals(m, now);
  if (prev.current !== m) {
    const was = prev.current;
    const fresh = now - opened.current >= MOOD_MS.quietOnOpen;
    const result = was && fresh ? peekResult(was, m) : null;
    const stopped = !!was && (m.stopped ?? 0) !== (was.stopped ?? 0);
    clock.current = peekSee(clock.current, { signals, result, stopped }, now);
    prev.current = m;
  } else if ((signals.working || signals.waiting) !== clock.current.on) {
    clock.current = peekSee(clock.current, { signals, result: null, stopped: false }, now);   // a busy tool went quiet
  }
  const capturing = !!m.showme || !!m.walk || m.voice?.stage === "listening";
  const rules = { on, quiet: false, capturing, homeOpen: false, hideAfterMs };
  const p = peekNow(clock.current, signals, rules, now);
  const next = peekNextMs(clock.current, signals, rules, now);
  useEffect(() => {
    if (next === null) return;
    const t = setTimeout(() => bump((n) => n + 1), Math.max(0, next) + 5);
    return () => clearTimeout(t);
  }, [next === null ? null : Math.round((now + next) / 50)]);

  useEffect(() => { void invoke("peekout_want", { show: p.show }).catch(() => {}); }, [p.show]);

  // Out only when both agree. The last look stays drawn while it slides back, then the drawing is given back.
  const visible = p.show && allow;
  const lastLook = useRef<PeekLook>("rest");
  if (p.look) lastLook.current = p.look;
  const look = lastLook.current;
  const [mounted, setMounted] = useState(false);
  const [inNow, setIn] = useState(false);
  useEffect(() => {
    if (visible) { setMounted(true); return; }
    setIn(false);
    const t = setTimeout(() => setMounted(false), UNMOUNT_MS);
    return () => clearTimeout(t);
  }, [visible]);
  // In one frame after it is drawn, so the slide runs from behind the notch (a fade with Reduce Motion).
  useEffect(() => {
    if (!visible || !mounted) return;
    const t = setTimeout(() => setIn(true), DUR[1] / 6);
    return () => clearTimeout(t);
  }, [visible, mounted]);

  const d = peekDraw(look);
  const picture = <img className="peekout-pic" src={poseUrl(d.pose)} alt="" draggable={false} />;
  const live = liveOn && !failed;
  return (
    <main className="peekout" data-side={side} data-in={inNow ? "" : undefined} data-reduced={reduced ? "" : undefined} data-look={look} data-live={live ? "on" : "off"}>
      {mounted && (
        <button className="peekout-hit" type="button" aria-label={S.m90.name(S.m90.look[look])} onClick={() => { void invoke("island_click").catch(() => {}); }}>
          <span className="peekout-slide" aria-hidden="true">
            <span className="peekout-lip" />
            <span className="peekout-head">
              {live ? (
                <Suspense fallback={picture}>
                  <FlowflowView state={d.state} mood={d.mood} reduced={reduced} followRange={0} colours={flowColours("ocean")} className="peekout-canvas" liveliness={lively} resting={resting} small pinned reacts={reactsOn} halo={false} onFallback={() => setFailed(true)} waitForWarm placeholder={picture} />
                </Suspense>
              ) : picture}
              {p.dot || (d.dot && !visible) ? <i className="peekout-dot" /> : null}
            </span>
          </span>
        </button>
      )}
    </main>
  );
}

if (typeof document !== "undefined" && document.getElementById("root") && document.body.dataset.label === "peekout") {
  startSettings();
  followLessMotion();
  createRoot(document.getElementById("root")!).render(<StrictMode><PartBoundary part="peekout" auto><PeekOut /></PartBoundary></StrictMode>);
}
