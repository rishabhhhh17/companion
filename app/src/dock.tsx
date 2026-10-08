import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen, type AppState } from "./tauri.ts";
import { S } from "./strings.ts";
import "./style.css";

function Dock() {
  const [state, setState] = useState<AppState>({ clicks: 0, front: "", card_key: false });
  useEffect(() => {
    const off = listen("state", (e) => setState(e.payload as AppState));
    return () => { off.then((f) => f()); };
  }, []);
  return (
    <main>
      <div className="row"><b>{S.product}</b> <span className="muted">{S.characterName}</span></div>
      <div className="row muted">Clicks: {state.clicks}</div>
      <div className="row muted">Front app: {state.front || "?"}</div>
      <button className="type" type="button" onPointerDown={() => { void invoke("ui_click", { label: "dock:type" }); void invoke("open_card_cmd"); }}>{S.type}</button>
      <button className="character" type="button" aria-label={S.characterName} onPointerDown={() => void invoke("char_click")} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Dock /></StrictMode>);
