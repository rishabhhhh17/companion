import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen } from "./tauri.ts";
import { islandAlert, islandLine, islandWord } from "./home.ts";
import { visualState } from "./model.ts";
import { useModel } from "./useModel.ts";
import { S } from "./strings.ts";
import "./style.css";

// The island in the notch (F18): Companion's home base, quiet until something needs the person. The app decides its size
// (island.rs): the notch itself or a small pill at rest, a little wider when something needs you, one line taller while the
// pointer is on it. This page only draws it, from the same runner events as the character and Home. A click opens Home
// below it. The island never takes the keyboard (it is a borderless panel), so nothing here listens for keys.
type Shape = { mode: "rest" | "alert" | "peek"; notch: boolean };
const shapeFrom = (v: unknown): Shape | null => {
  const o = v as { mode?: unknown; notch?: unknown } | null;
  return o && (o.mode === "rest" || o.mode === "alert" || o.mode === "peek") && typeof o.notch === "boolean" ? { mode: o.mode, notch: o.notch } : null;
};

function Island() {
  const [m] = useModel();
  const [shape, setShape] = useState<Shape>({ mode: "rest", notch: false });
  useEffect(() => {
    void invoke("island_state").then((v) => { const s = shapeFrom(v); if (s) setShape(s); }).catch(() => {});
    const off = listen("island-mode", (e) => { const s = shapeFrom(e.payload); if (s) setShape(s); });
    return () => { off.then((f) => f()); };
  }, []);
  // A question waiting, listening, or just done: the island grows a little so the mark shows beside the notch.
  const alert = islandAlert(m);
  useEffect(() => { void invoke("island_alert", { on: alert }).catch(() => {}); }, [alert]);
  const line = islandLine(m);
  const state = visualState(m);
  const waiting = m.approvals.length;
  return (
    <main className={`island ${shape.notch ? "notch" : "pill"}`} data-mode={shape.mode}>
      <button className="island-hit" type="button" aria-label={`${S.islandOpen}. ${line}`} onClick={() => void invoke("island_click")}>
        {shape.notch && shape.mode === "alert" && <>
          <span className="ear left" aria-hidden="true"><span className="mark" data-state={state} /></span>
          <span className="ear right" aria-hidden="true">{waiting > 0 ? waiting : ""}</span>
        </>}
        {!shape.notch && shape.mode !== "peek" && <span className="pillrow" aria-hidden="true"><span className="mark" data-state={state} />{islandWord(m)}</span>}
        {shape.mode === "peek" && <span className="peekline" aria-hidden="true">{line}</span>}
      </button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Island /></StrictMode>);
