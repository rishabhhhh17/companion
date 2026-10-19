import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { startSettings, useSetting } from "./settingsStore.ts";
import { followLessMotion } from "./motion.ts";
import { invoke, listen } from "./tauri.ts";
import { islandAlert, islandLine, islandWord } from "./home.ts";
import { readyVersion } from "./updates.ts";
import { visualState } from "./model.ts";
import { useModel } from "./useModel.ts";
import { S } from "./strings.ts";
import "./style.css";

// The island in the notch (F18): Companion's home base, quiet until something needs the person. The app decides its size
// and what it sits on (island.rs): the notch itself, a small pill in the middle of the menu bar, or a thin line on the top
// edge where no menu bar shows. It only ever grows downward: a lip under the notch with a mark when something needs you
// (the pill shows the mark in itself; the thin line grows into the pill), and the status lines while the pointer rests on
// it. This page only draws it, from the same runner events as the character and Home. A click opens Home below it. The
// island never takes the keyboard (it is a borderless panel), so nothing here listens for keys.
type Kind = "notch" | "pill" | "edge";
const KINDS: readonly Kind[] = ["notch", "pill", "edge"];
type Shape = { mode: "rest" | "alert" | "peek"; kind: Kind };
const shapeFrom = (v: unknown): Shape | null => {
  const o = v as { mode?: unknown; kind?: unknown } | null;
  return o && (o.mode === "rest" || o.mode === "alert" || o.mode === "peek") && KINDS.includes(o.kind as Kind) ? { mode: o.mode, kind: o.kind as Kind } : null;
};

function Island() {
  const [m] = useModel();
  const [shape, setShape] = useState<Shape>({ mode: "rest", kind: "pill" });
  // A new version a check found (the shell's "update-ready"): the status says so when nothing else is going on.
  const [update, setUpdate] = useState<string | null>(null);
  useEffect(() => {
    void invoke("island_state").then((v) => { const s = shapeFrom(v); if (s) setShape(s); setUpdate(readyVersion((v as { update?: unknown } | null)?.update ?? null)); }).catch(() => {});
    const off = listen("island-mode", (e) => { const s = shapeFrom(e.payload); if (s) setShape(s); });
    const offUp = listen("update-ready", (e) => setUpdate(readyVersion(e.payload)));
    return () => { off.then((f) => f()); offUp.then((f) => f()); };
  }, []);
  // A question waiting, listening, or just done: a mark shows (the lip under the notch, or the pill). With When something
  // needs me set to only mark the tab (home.goToNeeds), anything that needs the person shows it too.
  const alert = islandAlert(m, useSetting("home.goToNeeds") === "markTab");
  useEffect(() => { void invoke("island_alert", { on: alert }).catch(() => {}); }, [alert]);
  const line = islandLine(m, { update });
  const state = visualState(m);
  const waiting = m.approvals.length;
  const pill = <span className="pillrow" aria-hidden="true"><span className="mark" data-state={state} />{islandWord(m)}</span>;
  return (
    <main className={`island ${shape.kind}`} data-mode={shape.mode}>
      <button className="island-hit" type="button" aria-label={`${S.islandOpen}. ${line}`} onClick={() => void invoke("island_click")}>
        {shape.kind === "notch" && shape.mode === "alert" && <span className="lip" aria-hidden="true"><span className="mark" data-state={state} />{waiting > 0 ? waiting : ""}</span>}
        {shape.kind === "pill" && shape.mode !== "peek" && pill}
        {shape.kind === "edge" && shape.mode === "alert" && pill}
        {shape.mode === "peek" && <span className="peekline" aria-hidden="true">{line}</span>}
      </button>
    </main>
  );
}
// The settings in force, kept in step with every change (settingsStore.ts), so the island reads them the same way.
startSettings();
followLessMotion();
createRoot(document.getElementById("root")!).render(<StrictMode><Island /></StrictMode>);
