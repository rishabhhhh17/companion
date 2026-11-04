import { useCallback, useEffect, useReducer } from "react";
import { initial, reduce, type Model } from "./model.ts";
import { invoke, listen } from "./tauri.ts";
import { failureDetail } from "./partBoundary.tsx";
import { FrameBatch } from "./homeFlow.ts";

/** One event that the page cannot read (a shape it never expected) keeps the page as it was, instead of ending its
 *  drawing (must fix 4). What broke is noted for a report: the event's kind, the error's own message and the functions it
 *  was in (keys hidden, 400 characters at most), never what the event carried. */
export function safeReduce(s: Model, e: { type: string }): Model {
  try { return reduce(s, e); } catch (err) {
    void invoke("note_failure", { kind: "event", detail: eventFailureDetail(e, err) }).catch(() => {});
    return s;
  }
}

/** The note for an event the reducer could not read. A stack in either form (WebKit's `name@url`, V8's `at name (url)`)
 *  is cut down to the function names, so no address of a file is kept. */
export function eventFailureDetail(e: { type?: unknown; [k: string]: unknown }, err: unknown): string {
  const kind = typeof e?.type === "string" ? e.type.slice(0, 60) : "unknown";
  const stack = err instanceof Error && typeof err.stack === "string" ? err.stack : "";
  const names = stack.split("\n").map((l) => l.trim()).map((l) => (l.startsWith("at ") ? l.slice(3).split(" ")[0] : l.includes("@") ? l.split("@")[0] : ""))
    .filter((n) => n && !n.includes("/")).map((n) => `at ${n}`);
  return `${kind}: ${failureDetail(err, names.join("\n"))}`.slice(0, 400);
}

// Both pages (the character and the card) read the same stream of events, so they always agree.
export function useModel(): [Model, (e: { type: string; [k: string]: unknown }) => void] {
  const [m, dispatch] = useReducer(safeReduce, undefined, initial);
  useEffect(() => {
    // A page that loads after the engine started asks for the status messages it missed.
    void invoke("replay_events").then((list) => { for (const e of (list as { type: string }[] | undefined) ?? []) dispatch(e); });
    // M66 fix 4: streamed text arrives a token at a time; its deltas are joined and drawn once a frame (homeFlow.ts).
    // A page the Mac is not drawing gets no frames, so a timer stands in after 50 ms: nothing ever waits behind a delta.
    const batch = new FrameBatch((e) => dispatch(e as { type: string }), (f) => {
      let ran = false;
      const go = () => { if (!ran) { ran = true; f(); } };
      // A frame to draw on, not a motion: nothing moves here, so the Less motion check does not apply (motion.test.ts).
      const frame = globalThis.requestAnimationFrame;
      if (typeof frame === "function") frame(go);
      setTimeout(go, 50);
    });
    const off = listen("runner-event", (e) => batch.push(e.payload as { type: string }));
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
