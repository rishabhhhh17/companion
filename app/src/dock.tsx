import { StrictMode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import type { FlowflowController } from "./flowflow/controller.ts";
import { characterName } from "./companion.ts";
import { useLook } from "./useLook.ts";
import { play, wantSound, type Cue } from "./sound.ts";
import { livelinessOf, SIZE_SCALE, sizeOf } from "./lookfeel.ts";
import { useRest } from "./useRest.ts";
import { LENGTH_MS, Reactor, reactionFor, reactionsOn, type Reaction } from "./reactions.ts";
import { characterWords, motionFor } from "./model.ts";
import { characterShows } from "./home.ts";
import { poseFor, poseUrl } from "./characters.ts";
import { useModel } from "./useModel.ts";
import { roamFrom, type Roam } from "./roam.ts";
import { usePeek } from "./peek.ts";
import { followLessMotion, playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { S } from "./strings.ts";
import { setting, startSettings, useSetting } from "./settingsStore.ts";
import { DropRing, useDrop } from "./dropRing.tsx";
import { SKIN, skinVars } from "./skins.ts";
import { useFlow } from "./flow/useFlow.ts";
import { activeGroup, groupLook, groupOn } from "./groups.ts";
import { running } from "./dropmenu.ts";
import { PartBoundary } from "./partBoundary.tsx";
import "./style.css";

// The live drawing (and the three.js it needs) is loaded only when asked for: with character.live off, nothing of it is fetched.
const FlowflowView = lazy(() => import("./flowflow/view.tsx").then((m) => ({ default: m.FlowflowView })));

function Dock() {
  const [m] = useModel();
  // The Mac's Reduce motion setting, through the one helper (motion.ts): the state's own motion stops with it.
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => watchReducedMotion(setReduced), []);
  // Reactions: short one off moves when something happens; the big one also sends confetti from the character. None with
  // reactions turned off or when the Mac asks for less motion.
  const [react, setReact] = useState<{ r: Reaction; id: number } | null>(null);
  const reactor = useRef(new Reactor());
  const seq = useRef(0);
  useEffect(() => {
    const off = listen("runner-event", async (e) => {
      if (!playful(reactionsOn(), reducedMotion())) return;
      const r = reactionFor(e.payload as never);
      if (!r) return;
      // Quiet during calls (rule 7): the app says only whether it should be quiet (a call app is in front), nothing more.
      if (await invoke("quiet_now").then((q) => q === true, () => false)) return;
      const got = reactor.current.push(r, Date.now());
      if (!got) return;
      const id = ++seq.current;   // each reaction is its own, so an older timer never cuts a newer one short
      // Cleared for one frame first, so the same move twice in a row plays again (the button itself is never rebuilt,
      // so keyboard focus and a drag in progress are kept).
      setReact(null);
      requestAnimationFrame(() => setReact({ r: got, id }));
      setTimeout(() => setReact((c) => (c?.id === id ? null : c)), LENGTH_MS[got]);
      if (got === "party") void invoke("celebrate");
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Coming to what it is about (F18 item 2): the app moves the character and says which named state it is in (surface,
  // travel, settle, visiting, return, home) and which way to face, so the founder's art can follow. The dot only hints.
  // F19: a file dragged over this window lights the character (no motion with reduced motion, style.css); a drop opens the
  // ring of what can be done with it around the character.
  const drop = useDrop();
  const dropMark = drop.s.hover ? "over" : drop.s.menu?.at === "dock" ? "menu" : undefined;
  // Peeking from past the edge (peek.ts): only a lean toward the screen, as data.
  const peek = usePeek();
  // M46: rest. The shell's (a call with Quiet during calls, Low Power Mode), or tucked past the edge: it holds still.
  const shellRest = useRest();
  // The live water (M20): a handle to move it from here, the window's speed felt as jelly lag, and in Lively the eyes
  // following the pointer anywhere on the screen (the shell sends where it is only in Lively with Follow my pointer on).
  const ffCtl = useRef<FlowflowController | null>(null);
  const vel = (vx: number, vy: number) => { flow.api.velocity(vx, vy); ffCtl.current?.push(vx, vy); };
  // M46 (F28): how lively it is (character.lively, Still unless chosen). The pointer is news only in Lively.
  const liveliness = livelinessOf(useSetting("character.lively"));
  // M55 (the character reacts): on the edge it lifts when it needs you and dips when something fails (character.reacts).
  const reacts = useSetting("character.reacts") !== false;
  const livelyNow = useRef(liveliness);
  livelyNow.current = liveliness;
  useEffect(() => {
    const off = listen("gaze", (e) => { if (livelyNow.current !== "lively") return; const g = (e.payload ?? {}) as { dx?: number; dy?: number }; ffCtl.current?.gaze(Number(g.dx), Number(g.dy)); });
    return () => { off.then((f) => f()); };
  }, []);
  // Coming in from the edge: the window slides in (peek.rs IN_SECS), the water lags behind it, then splashes as it stops.
  // Going back out: it stretches toward the edge. None with less motion (the controller is still then).
  const lastPeek = useRef(peek.pose);
  useEffect(() => {
    const was = lastPeek.current; lastPeek.current = peek.pose;
    if (was === peek.pose || !peek.edge) return;
    const out = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[peek.edge as "left" | "right" | "top" | "bottom"] ?? [1, 0];
    const coming = peek.pose === "in" || (peek.pose === "peek" && was === "hidden");
    const speed = 1400, [ox, oy] = out;
    if (coming) { vel(-ox * speed, -oy * speed); const t = setTimeout(() => { vel(0, 0); ffCtl.current?.arrive(ox, oy); }, 320); return () => clearTimeout(t); }
    vel(ox * speed, oy * speed); const t = setTimeout(() => vel(0, 0), 450); return () => clearTimeout(t);
  }, [peek.pose, peek.edge]);
  const [roam, setRoam] = useState<Roam>({ phase: "home", toward: null });
  useEffect(() => {
    const off = listen("roam", (e) => setRoam(roamFrom(e.payload)));
    return () => { off.then((f) => f()); };
  }, []);
  // Its state, as the model says. With When something needs me set to only mark the tab and no island in the notch, it
  // also carries the island's mark (home.ts characterShows); its own lights for the screen and the microphone stay.
  const state = characterShows(m, useSetting("home.goToNeeds") === "markTab", useSetting("island.show") !== false);
  const label = characterWords(m);
  // The group at work and its named look, as data for the founder's art (F20 item 4): Flow is water, clearer when the checks
  // pass and murkier when they fail. Only names on the element; the art decides what they look like, and the reduced motion
  // rules above still apply to every motion.
  const look = groupLook(m, activeGroup(m, running(drop.s)) ?? (groupOn("flow") && (m.receipt || m.character === "error") ? "flow" : null), running(drop.s));
  const waiting = m.approvals.length;
  // Its name, as chosen in Settings or the first run (character.name), or its own.
  const nameSet = useSetting("character.name");
  // The look (M19): the water's colour on this page and the character's size on the edge.
  const colours = useLook();
  const sizeSet = useSetting("look.size");
  const spoken = `${characterName(nameSet)}: ${label}${waiting ? `, ${waiting} ${S.waitingForYou}` : ""}`;
  // Two ways to draw Flowflow, one setting (character.live). On is the usual since 27 Oct 2026 (the founder: "I didn't see the
  // fluidity mechanics"). Off: the pose pictures,
  // moved by src/flow/ (a soft body of water in WebGL over the picture; the plain picture is the fallback). On: the founder's
  // live water (src/flowflow/, physics, eyes and droplets, loaded on demand), and src/flow/ stands down. If the live drawing
  // cannot start, or the GPU context is lost, the pictures come back and nothing else about the character changes.
  const liveOn = useSetting("character.live") === true;
  const [liveFailed, setLiveFailed] = useState(false);
  const live = liveOn && !liveFailed;
  const pose = poseFor(state, { roam: roam.phase, react: react?.r });
  const flow = useFlow({ pose, state, calm: reduced, off: liveOn && !liveFailed });
  const button = useRef<HTMLButtonElement>(null);
  const centre = () => { const r = button.current?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.5 } : { x: 80, y: 66 }; };
  // A click opens or closes the card; dragging moves the character anywhere on the screen, or to any edge or corner. M47:
  // the page says once that a drag began and the shell moves the window itself from then on (main.rs drag_follow), so it
  // keeps up with the pointer; the page only feels the speed: the top of the body trails behind it.
  const press = useRef<{ x: number; y: number; dragging: boolean; at: number } | null>(null);
  const still = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const down = (e: React.PointerEvent) => { press.current = { x: e.screenX, y: e.screenY, dragging: false, at: e.timeStamp }; (e.target as HTMLElement).setPointerCapture(e.pointerId); flow.api.poke(e.clientX, e.clientY); void invoke("char_click"); };
  const move = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.hypot(e.screenX - p.x, e.screenY - p.y) > 5) { p.dragging = true; void invoke("drag_dock"); }
    if (p.dragging) {
      const dt = (e.timeStamp - p.at) / 1000;
      if (dt > 0.004) vel((e.screenX - p.x) / dt, (e.screenY - p.y) / dt);
      p.x = e.screenX; p.y = e.screenY; p.at = e.timeStamp;
      clearTimeout(still.current);
      still.current = setTimeout(() => vel(0, 0), 90);   // the pointer stopped, so the window did
    }
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    clearTimeout(still.current);
    vel(0, 0);
    if (!p) return;
    if (p.dragging) void invoke("drop_dock"); else void invoke("toggle_card");
  };
  // The release never reached the page (macOS took the pointer, the capture was lost): a drag still lets go, so its place is
  // saved and the shell clears its drag; a press that never became a drag opens nothing. After a normal release press is
  // already empty, so this does nothing (and drop_dock is safe to say twice).
  const lost = () => {
    const p = press.current;
    press.current = null;
    clearTimeout(still.current);
    vel(0, 0);
    if (p?.dragging) void invoke("drop_dock");
  };
  // M37c: dragged into its edge, the water flattens against it, harder the harder it is pushed, and wobbles back when let
  // go (the shell measures the press: docking.rs press_of). Let go in the middle of the screen, nothing to cling to.
  // M37d (the founder: "it needs to stick… it just needs to dwell there… when I pull it, it needs to come out"): tucked
  // into its edge it stays stuck half in view, flattened against the screen's real edge like a drop on glass; the pointer
  // on it brings it out and it springs back into shape; dragged, it pulls away from the edge.
  useEffect(() => {
    const EDGES = ["left", "right", "top", "bottom"] as const;
    type Edge = (typeof EDGES)[number];
    const across = (edge: Edge, screenAt: unknown): number => {
      const r = document.querySelector(".character .flowflow")?.getBoundingClientRect();
      if (!r || typeof screenAt !== "number" || !Number.isFinite(screenAt)) return edge === "left" || edge === "top" ? 0 : 1;
      return edge === "left" || edge === "right" ? (screenAt - r.left) / Math.max(1, r.width) : (screenAt - r.top) / Math.max(1, r.height);
    };
    const edgeOf = (v: unknown): Edge | null => (typeof v === "string" && (EDGES as readonly string[]).includes(v) ? (v as Edge) : null);
    const offPress = listen("dock-press", (e) => {
      const p = (e.payload ?? {}) as { edge?: unknown; press?: unknown; screenAt?: unknown; firm?: unknown };
      const c = ffCtl.current; if (!c) return;
      const edge = edgeOf(p.edge);
      if (p.edge === null) c.setSurface(null);
      else if (edge) c.setSurface(edge, across(edge, p.screenAt), 0.2);
      c.press(typeof p.press === "number" ? p.press : 0, p.firm === true);
    });
    const offPeek = listen("peek", (e) => {
      const p = (e.payload ?? {}) as { pose?: unknown; edge?: unknown; screenAt?: unknown };
      const c = ffCtl.current, edge = edgeOf(p.edge); if (!c || !edge) return;
      const stuck = p.pose === "peek" || p.pose === "hidden";
      c.setSurface(edge, across(edge, p.screenAt), stuck ? 0.9 : 0.2);
      c.press(stuck ? 0.5 : 0);
    });
    return () => { offPress.then((f) => f()); offPeek.then((f) => f()); };
  }, []);
  // A trip across the screen leans the body the way it goes; surfacing and settling are a soft touch.
  useEffect(() => {
    const lean = 320, dir = { left: [-lean, 0], right: [lean, 0], up: [0, -lean], down: [0, lean] } as const;
    if (roam.phase === "travel" || roam.phase === "return") { const [vx, vy] = dir[roam.toward ?? "left"]; vel(vx * 3, vy * 3); return; }
    vel(0, 0);
    if (roam.phase === "surface") flow.api.touchAt(0.5, 0.9, 0.5);
    if (roam.phase === "settle") flow.api.touchAt(0.5, 0.7, 0.8);
  }, [roam.phase, roam.toward]);
  // A reaction is a small push; the big one, and finishing a task, add ripples and droplets. None with reactions off or less motion.
  useEffect(() => {
    if (!react) return;
    if (react.r === "nod") flow.api.touchAt(0.5, 0.35, 0.4);
    else if (react.r === "wince") flow.api.touchAt(0.5, 0.5, 1.1);
    else if (react.r === "cheer") flow.api.touchAt(0.5, 0.6, 0.8);
    else { const c = centre(); flow.api.big(c.x, c.y); }
  }, [react?.id]);
  // The water pointer (M17): a drop splits off the side facing the target, and lands back on top when it comes home.
  // None with reactions off or less motion.
  // Sounds (M19, sound.ts): only when turned on, and never while a call app is in front (the shell says only whether to be quiet).
  const cue = (c: Cue) => { if (setting("sound.on") !== true) return; void invoke("quiet_now").then((q) => { if (wantSound(true, q === true)) play(c, setting("sound.volume")); }, () => {}); };
  useEffect(() => {
    const off = listen("flowflow-move", (e) => {
      const m = (e.payload ?? {}) as { kind?: string; dx?: number; dy?: number };
      if (m.kind === "give") cue("drop"); else if (m.kind === "catch") cue("catch");
      if (!playful(reactionsOn(), reducedMotion())) return;
      const live = ffCtl.current;
      if (m.kind === "give") {
        const dx = Number(m.dx) || 0, dy = Number(m.dy) || 0, n = Math.hypot(dx, dy) || 1;
        if (live) live.give(dx, dy); else flow.api.touchAt(0.5 + (0.4 * dx) / n, 0.5 + (0.4 * dy) / n, 0.9);
      } else if (m.kind === "catch") { if (live) live.catch(); else flow.api.touchAt(0.5, 0.2, 1); }
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Done and waiting for you have their own sounds, once each time the state arrives.
  const lastState = useRef(state);
  useEffect(() => { if (state !== lastState.current) { if (state === "done") cue("done"); else if (state === "needsYou") cue("needsYou"); } lastState.current = state; }, [state]);
  const wasDone = useRef(false);
  useEffect(() => {
    if (state === "done" && !wasDone.current && playful(reactionsOn(), reducedMotion())) { const c = centre(); flow.api.big(c.x, c.y); }
    wasDone.current = state === "done";
  }, [state]);
  return (
    <main className="dock" data-drop={dropMark}>
      <button ref={button} className="character" type="button" style={{ ...skinVars(SKIN), "--char-scale": String(SIZE_SCALE[sizeOf(sizeSet)]) } as React.CSSProperties} data-flow={flow.ready ? "on" : undefined} data-live={live ? "on" : undefined} data-state={state} data-motion={live ? undefined : motionFor(state, reduced)} data-pose={pose} data-group={look.group ?? undefined} data-group-state={look.group ? look.state : undefined} data-react={react?.r}
        data-roam={roam.phase} data-toward={roam.toward ?? undefined} data-drop={dropMark} data-peek={peek.pose} data-peek-edge={peek.edge}
        aria-label={spoken}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={lost} onLostPointerCapture={lost}
        onClick={(e) => { if (e.detail === 0) void invoke("toggle_card"); /* keyboard or VoiceOver press; a mouse press is handled on release */ }}>
        {liveOn && !liveFailed
          ? <Suspense fallback={<img className="pose" src={poseUrl(pose)} alt="" draggable={false} />}><FlowflowView state={state} reduced={reduced} followRange={0.3} controllerRef={ffCtl} colours={colours} liveliness={liveliness} resting={shellRest || peek.pose === "hidden"} reacts={reacts} onFallback={() => setLiveFailed(true)} /></Suspense>
          : <>
            {!flow.failed && <canvas ref={flow.canvasRef} className="flow" aria-hidden="true" />}
            <img className={`pose${flow.ready ? " flow-ready" : ""}`} src={poseUrl(pose)} alt="" draggable={false} />
          </>}
        {waiting > 0 && <span className="badge" aria-hidden="true">{waiting}</span>}
      </button>
      {/* M26: the words show only when there is something to say; resting, "Ready" is for VoiceOver only, so Flowflow is not
          labelled like a debug readout. */}
      <div className={`dock-label${state === "idle" && !waiting ? " sr" : ""}`} role="status" aria-live="polite">{label}</div>
      {!flow.failed && !(liveOn && !liveFailed) && <canvas ref={flow.dropRef} className="drops" aria-hidden="true" />}
      {drop.s.hover && <div className="sr" role="status">{S.drop.over}</div>}
      <DropRing drop={drop} />
    </main>
  );
}
// The settings in force (reactions, motion), kept in step with every change (settingsStore.ts).
startSettings();
followLessMotion();
// Must fix 4: a draw error never leaves this window blank for good (partBoundary.tsx).
createRoot(document.getElementById("root")!).render(<StrictMode><PartBoundary part="dock" auto><Dock /></PartBoundary></StrictMode>);
