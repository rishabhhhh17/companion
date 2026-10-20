import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import { LENGTH_MS, Reactor, reactionFor, reactionsOn, type Reaction } from "./reactions.ts";
import { characterWords, motionFor } from "./model.ts";
import { characterShows } from "./home.ts";
import { useModel } from "./useModel.ts";
import { roamFrom, type Roam } from "./roam.ts";
import { followLessMotion, playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { S } from "./strings.ts";
import { startSettings, useSetting } from "./settingsStore.ts";
import { DropRing, useDrop } from "./dropRing.tsx";
import "./style.css";

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
  const [roam, setRoam] = useState<Roam>({ phase: "home", toward: null });
  useEffect(() => {
    const off = listen("roam", (e) => setRoam(roamFrom(e.payload)));
    return () => { off.then((f) => f()); };
  }, []);
  // Its state, as the model says. With When something needs me set to only mark the tab and no island in the notch, it
  // also carries the island's mark (home.ts characterShows); its own lights for the screen and the microphone stay.
  const state = characterShows(m, useSetting("home.goToNeeds") === "markTab", useSetting("island.show") !== false);
  const label = characterWords(m);
  const waiting = m.approvals.length;
  const spoken = `${S.characterName}: ${label}${waiting ? `, ${waiting} ${S.waitingForYou}` : ""}`;
  // A click opens or closes the card; dragging moves the character to any edge or corner of the screen.
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const down = (e: React.PointerEvent) => { press.current = { x: e.screenX, y: e.screenY, dragging: false }; (e.target as HTMLElement).setPointerCapture(e.pointerId); void invoke("char_click"); };
  const move = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.hypot(e.screenX - p.x, e.screenY - p.y) > 5) p.dragging = true;
    if (p.dragging) void invoke("drag_dock", { x: e.screenX, y: e.screenY });
  };
  const up = () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.dragging) void invoke("drop_dock"); else void invoke("toggle_card");
  };
  return (
    <main className="dock">
      <button className="character" type="button" data-state={state} data-motion={motionFor(state, reduced)} data-react={react?.r}
        data-roam={roam.phase} data-toward={roam.toward ?? undefined} data-drop={dropMark}
        aria-label={spoken}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onClick={(e) => { if (e.detail === 0) void invoke("toggle_card"); /* keyboard or VoiceOver press; a mouse press is handled on release */ }}>
        {waiting > 0 && <span className="badge" aria-hidden="true">{waiting}</span>}
      </button>
      <div className="muted" role="status" aria-live="polite">{label}</div>
      {drop.s.hover && <div className="sr" role="status">{S.drop.over}</div>}
      <DropRing drop={drop} />
    </main>
  );
}
// The settings in force (reactions, motion), kept in step with every change (settingsStore.ts).
startSettings();
followLessMotion();
createRoot(document.getElementById("root")!).render(<StrictMode><Dock /></StrictMode>);
