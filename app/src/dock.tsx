import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "./tauri.ts";
import { characterWords, motionFor } from "./model.ts";
import { useModel } from "./useModel.ts";
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
  const label = characterWords(m);
  // A click opens or closes the card; dragging moves the character along the screen edge.
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
      <button className="character" type="button" data-state={m.character} data-motion={motionFor(m.character, reduced)}
        aria-label={`${S.characterName}: ${label}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        {m.approvals.length > 0 && <span className="badge" aria-label={S.needsYouTitle}>{m.approvals.length}</span>}
      </button>
      <div className="muted" aria-live="polite">{label}</div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Dock /></StrictMode>);
