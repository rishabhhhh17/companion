import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import { LENGTH_MS, Reactor, reactionFor, reactionsOn, type Reaction } from "./reactions.ts";
import { characterWords, motionFor, visualState } from "./model.ts";
import { useModel } from "./useModel.ts";
import { roamFrom, type Roam } from "./roam.ts";
import { S } from "./strings.ts";
import "./style.css";

const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function Dock() {
  const [m] = useModel();
  const [reduced, setReduced] = useState(reducedQuery.matches);
  useEffect(() => {
    const f = () => setReduced(reducedQuery.matches);
    reducedQuery.addEventListener("change", f);
    return () => reducedQuery.removeEventListener("change", f);
  }, []);
  // Reactions: short one off moves when something happens; the big one also sends confetti from the character.
  const [react, setReact] = useState<{ r: Reaction; id: number } | null>(null);
  const reactor = useRef(new Reactor());
  const seq = useRef(0);
  useEffect(() => {
    const off = listen("runner-event", async (e) => {
      if (!reactionsOn()) return;
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
      if (got === "party" && !reducedQuery.matches) void invoke("celebrate");
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Coming to what it is about (F18 item 2): the app moves the character and says which named state it is in (surface,
  // travel, settle, visiting, return, home) and which way to face, so the founder's art can follow. The dot only hints.
  const [roam, setRoam] = useState<Roam>({ phase: "home", toward: null });
  useEffect(() => {
    const off = listen("roam", (e) => setRoam(roamFrom(e.payload)));
    return () => { off.then((f) => f()); };
  }, []);
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
      <button className="character" type="button" data-state={visualState(m)} data-motion={motionFor(visualState(m), reduced)} data-react={react?.r}
        data-roam={roam.phase} data-toward={roam.toward ?? undefined}
        aria-label={spoken}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onClick={(e) => { if (e.detail === 0) void invoke("toggle_card"); /* keyboard or VoiceOver press; a mouse press is handled on release */ }}>
        {waiting > 0 && <span className="badge" aria-hidden="true">{waiting}</span>}
      </button>
      <div className="muted" role="status" aria-live="polite">{label}</div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Dock /></StrictMode>);
