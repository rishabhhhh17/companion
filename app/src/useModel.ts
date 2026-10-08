import { useCallback, useEffect, useReducer } from "react";
import { initial, reduce, type Model } from "./model.ts";
import { listen } from "./tauri.ts";

// Both pages (the character and the card) read the same stream of events, so they always agree.
export function useModel(): [Model, (e: { type: string; [k: string]: unknown }) => void] {
  const [m, dispatch] = useReducer((s: Model, e: { type: string }) => reduce(s, e), undefined, initial);
  useEffect(() => {
    const off = listen("runner-event", (e) => dispatch(e.payload as { type: string }));
    return () => { off.then((f) => f()); };
  }, []);
  // "Done" settles back to ready after a few seconds.
  useEffect(() => {
    if (m.character !== "done") return;
    const t = setTimeout(() => dispatch({ type: "ui.settle" }), 4000);
    return () => clearTimeout(t);
  }, [m.character]);
  return [m, useCallback((e) => dispatch(e), [])];
}
