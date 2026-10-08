import { useCallback, useEffect, useReducer } from "react";
import { initial, reduce, type Model } from "./model.ts";
import { invoke, listen } from "./tauri.ts";

// Both pages (the character and the card) read the same stream of events, so they always agree.
export function useModel(): [Model, (e: { type: string; [k: string]: unknown }) => void] {
  const [m, dispatch] = useReducer((s: Model, e: { type: string }) => reduce(s, e), undefined, initial);
  useEffect(() => {
    // A page that loads after the engine started asks for the status messages it missed.
    void invoke("replay_events").then((list) => { for (const e of (list as { type: string }[] | undefined) ?? []) dispatch(e); });
    const off = listen("runner-event", (e) => dispatch(e.payload as { type: string }));
    return () => { off.then((f) => f()); };
  }, []);
  // "Done" settles back to ready after a while, long enough to notice it.
  useEffect(() => {
    if (m.character !== "done") return;
    const t = setTimeout(() => dispatch({ type: "ui.settle" }), 4000);
    return () => clearTimeout(t);
  }, [m.character]);
  return [m, useCallback((e) => dispatch(e), [])];
}
