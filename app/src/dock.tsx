import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "./tauri.ts";
import { motionFor, stateLabel } from "./model.ts";
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
  const label = stateLabel(m.character);
  return (
    <main className="dock">
      <button className="character" type="button" data-state={m.character} data-motion={motionFor(m.character, reduced)}
        aria-label={`${S.characterName}: ${label}`}
        onPointerDown={() => { void invoke("char_click"); void invoke("toggle_card"); }}>
        {m.approvals.length > 0 && <span className="badge" aria-label={S.needsYouTitle}>{m.approvals.length}</span>}
      </button>
      <div className="muted" aria-live="polite">{label}</div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Dock /></StrictMode>);
