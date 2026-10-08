import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke, listen, type AppState } from "./tauri.ts";
import { S } from "./strings.ts";
import "./style.css";

// Privacy: what is typed here never goes anywhere in this step; only the app's own logic will receive it.
function Card() {
  const box = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<AppState>({ clicks: 0, front: "", card_key: false });
  useEffect(() => {
    const a = listen("state", (e) => setState(e.payload as AppState));
    const b = listen("opened", () => { if (box.current) box.current.value = ""; setTimeout(() => box.current?.focus(), 30); });
    return () => { a.then((f) => f()); b.then((f) => f()); };
  }, []);
  return (
    <main onPointerDown={(e) => void invoke("ui_click", { label: "card:" + (e.target as HTMLElement).tagName })}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); box.current?.blur(); void invoke("close_card"); } }}>
      <div className="titlebar-space" />
      <div className="row"><b>{S.cardTitle}</b> <span className="muted">({S.cardHint})</span></div>
      <input ref={box} type="text" autoComplete="off" spellCheck={false} />
      <div className="row muted">{S.cardKey}: {state.card_key ? S.yes : S.no}</div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Card /></StrictMode>);
