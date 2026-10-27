import { StrictMode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import { LENGTH_MS, Reactor, reactionFor, reactionsOn, type Reaction } from "./reactions.ts";
import { characterWords, motionFor } from "./model.ts";
import { characterShows } from "./home.ts";
import { poseFor, poseUrl } from "./characters.ts";
import { useModel } from "./useModel.ts";
import { roamFrom, type Roam } from "./roam.ts";
import { usePeek } from "./peek.ts";
import { followLessMotion, playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { S } from "./strings.ts";
import { startSettings, useSetting } from "./settingsStore.ts";
import { DropRing, useDrop } from "./dropRing.tsx";
import { SKIN, skinVars } from "./skins.ts";
import { useFlow } from "./flow/useFlow.ts";
import { activeGroup, groupLook, groupOn } from "./groups.ts";
import { running } from "./dropmenu.ts";
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
  const spoken = `${S.characterName}: ${label}${waiting ? `, ${waiting} ${S.waitingForYou}` : ""}`;
  // Two ways to draw Flowflow, one setting (character.live). Off (the usual until it is seen on a real Mac): the pose pictures,
  // moved by src/flow/ (a soft body of water in WebGL over the picture; the plain picture is the fallback). On: the founder's
  // live water (src/flowflow/, physics, eyes and droplets, loaded on demand), and src/flow/ stands down. If the live drawing
  // cannot start, or the GPU context is lost, the pictures come back and nothing else about the character changes.
  const liveOn = useSetting("character.live") === true;
  const [liveFailed, setLiveFailed] = useState(false);
  const pose = poseFor(state, { roam: roam.phase, react: react?.r });
  const flow = useFlow({ pose, state, calm: reduced, off: liveOn && !liveFailed });
  const button = useRef<HTMLButtonElement>(null);
  const centre = () => { const r = button.current?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.5 } : { x: 80, y: 66 }; };
  // A click opens or closes the card; dragging moves the character to any edge or corner of the screen. The window moves
  // under the pointer, so the screen position gives how fast: the top of the body trails behind it.
  const press = useRef<{ x: number; y: number; dragging: boolean; at: number } | null>(null);
  const still = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const down = (e: React.PointerEvent) => { press.current = { x: e.screenX, y: e.screenY, dragging: false, at: e.timeStamp }; (e.target as HTMLElement).setPointerCapture(e.pointerId); flow.api.poke(e.clientX, e.clientY); void invoke("char_click"); };
  const move = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.hypot(e.screenX - p.x, e.screenY - p.y) > 5) p.dragging = true;
    if (p.dragging) {
      void invoke("drag_dock", { x: e.screenX, y: e.screenY });
      const dt = (e.timeStamp - p.at) / 1000;
      if (dt > 0.004) flow.api.velocity((e.screenX - p.x) / dt, (e.screenY - p.y) / dt);
      p.x = e.screenX; p.y = e.screenY; p.at = e.timeStamp;
      clearTimeout(still.current);
      still.current = setTimeout(() => flow.api.velocity(0, 0), 90);   // the pointer stopped, so the window did
    }
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    clearTimeout(still.current);
    flow.api.velocity(0, 0);
    if (!p) return;
    if (p.dragging) void invoke("drop_dock"); else void invoke("toggle_card");
  };
  // A trip across the screen leans the body the way it goes; surfacing and settling are a soft touch.
  useEffect(() => {
    const lean = 320, dir = { left: [-lean, 0], right: [lean, 0], up: [0, -lean], down: [0, lean] } as const;
    if (roam.phase === "travel" || roam.phase === "return") { const [vx, vy] = dir[roam.toward ?? "left"]; flow.api.velocity(vx, vy); return; }
    flow.api.velocity(0, 0);
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
  const wasDone = useRef(false);
  useEffect(() => {
    if (state === "done" && !wasDone.current && playful(reactionsOn(), reducedMotion())) { const c = centre(); flow.api.big(c.x, c.y); }
    wasDone.current = state === "done";
  }, [state]);
  return (
    <main className="dock" data-drop={dropMark}>
      <button ref={button} className="character" type="button" style={skinVars(SKIN) as React.CSSProperties} data-flow={flow.ready ? "on" : undefined} data-state={state} data-motion={motionFor(state, reduced)} data-pose={pose} data-group={look.group ?? undefined} data-group-state={look.group ? look.state : undefined} data-react={react?.r}
        data-roam={roam.phase} data-toward={roam.toward ?? undefined} data-drop={dropMark} data-peek={peek.pose} data-peek-edge={peek.edge}
        aria-label={spoken}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onClick={(e) => { if (e.detail === 0) void invoke("toggle_card"); /* keyboard or VoiceOver press; a mouse press is handled on release */ }}>
        {liveOn && !liveFailed
          ? <Suspense fallback={<img className="pose" src={poseUrl(pose)} alt="" draggable={false} />}><FlowflowView state={state} reduced={reduced} followRange={0.3} onFallback={() => setLiveFailed(true)} /></Suspense>
          : <>
            {!flow.failed && <canvas ref={flow.canvasRef} className="flow" aria-hidden="true" />}
            <img className={`pose${flow.ready ? " flow-ready" : ""}`} src={poseUrl(pose)} alt="" draggable={false} />
          </>}
        {waiting > 0 && <span className="badge" aria-hidden="true">{waiting}</span>}
      </button>
      <div className="dock-label" role="status" aria-live="polite">{label}</div>
      {!flow.failed && !(liveOn && !liveFailed) && <canvas ref={flow.dropRef} className="drops" aria-hidden="true" />}
      {drop.s.hover && <div className="sr" role="status">{S.drop.over}</div>}
      <DropRing drop={drop} />
    </main>
  );
}
// The settings in force (reactions, motion), kept in step with every change (settingsStore.ts).
startSettings();
followLessMotion();
createRoot(document.getElementById("root")!).render(<StrictMode><Dock /></StrictMode>);
