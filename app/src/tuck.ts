// M111 (the founder, 16 Nov 2026: "When I put Flowflow in the notch, it should just disappear, and it should just dock up
// there"): Flowflow tucked into the notch. The shell decides (docking.rs tuck_zone, Drag::over_notch, Landing::Tuck) and
// tells the pages: the character's page shrinks toward the notch while it is over it ("tuck-hint") and shrinks up into it
// on the let go ("dock-tuck"); the notch says it will take it (island-mode `take`). Dragging the face out of the notch
// starts a real drag in the shell ("untuck_drag"), let go as any drag ("drop_dock"). Words in strings.ts.
import { useEffect, useRef, useState } from "react";
import { invoke, listen } from "./tauri.ts";

/** The tuck's motion, the same numbers as docking.rs TUCK_MS and TUCK_FADE_MS (tokens.css --dur-tuck, --dur-tuck-fade). */
export const TUCK_MS = 240;
export const TUCK_FADE_MS = 150;
/** How far the pointer must move on the face before it is a drag out of the notch, not a click (as the character's own). */
export const DRAG_OUT_PX = 5;

/** What the character's page shows: over the notch ("take", shrunk a little toward it), tucking up into it ("in"),
 *  coming back out ("out"), or nothing. */
export type TuckLook = "take" | "in" | "out" | null;

/** The shell's "dock-tuck", read safely: on (tucking) or off (coming out), and whether motion is calm (a fade). */
export function tuckFrom(v: unknown): { on: boolean; calm: boolean } {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return { on: o.on === true, calm: o.calm === true };
}
/** The shell's "tuck-hint": the pointer is over the notch while dragging. */
export function hintFrom(v: unknown): boolean { return (typeof v === "object" && v !== null ? (v as Record<string, unknown>).on : false) === true; }
/** How long the look takes: the short spring, or a plain fade with Reduce Motion or Less motion. */
export function tuckMs(calm: boolean): number { return calm ? TUCK_FADE_MS : TUCK_MS; }

/** One change to the look, as a plain step so it can be tested: the pointer over the notch or off it ("hint"), a tuck in
 *  or out ("tuck"), or the out timer firing ("clear"). The timer clears only the out look it was started for, so the
 *  pointer coming over the notch while the character comes out keeps it shrinking toward the notch (the M111 review). */
export type TuckEvent = { kind: "hint"; on: boolean } | { kind: "tuck"; on: boolean } | { kind: "clear" };
export function tuckStep(was: TuckLook, ev: TuckEvent): TuckLook {
  if (ev.kind === "hint") return ev.on ? "take" : was === "take" ? null : was;
  if (ev.kind === "tuck") return ev.on ? "in" : "out";
  return was === "out" ? null : was;
}

/** The character's page: the look the shell asks for now. "out" plays once and clears. */
export function useTuck(): { look: TuckLook; calm: boolean } {
  const [look, setLook] = useState<TuckLook>(null);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | undefined;
    const offHint = listen("tuck-hint", (e) => { clearTimeout(clear); const on = hintFrom(e.payload); setLook((was) => tuckStep(was, { kind: "hint", on })); });
    const offTuck = listen("dock-tuck", (e) => {
      const t = tuckFrom(e.payload);
      clearTimeout(clear);
      setCalm(t.calm);
      setLook((was) => tuckStep(was, { kind: "tuck", on: t.on }));
      if (!t.on) clear = setTimeout(() => setLook((was) => tuckStep(was, { kind: "clear" })), tuckMs(t.calm) + 40);
    });
    return () => { clearTimeout(clear); offHint.then((f) => f()); offTuck.then((f) => f()); };
  }, []);
  return { look, calm };
}

/** The drag out of the notch, as plain steps so it can be tested: a press on the face, moves, and the let go. A move past
 *  DRAG_OUT_PX begins the drag once (the shell shows Flowflow under the pointer and follows it); the let go of a drag lets
 *  it go and swallows the click (the face would open the chat), a plain click stays a click. */
export type DragOut = { x: number; y: number; dragging: boolean } | null;
export function dragOutStep(s: DragOut, ev: { kind: "down" | "move" | "up" | "lost"; x: number; y: number; on: boolean }): { s: DragOut; say: "untuck_drag" | "drop_dock" | null; click: boolean } {
  if (ev.kind === "down") return { s: ev.on ? { x: ev.x, y: ev.y, dragging: false } : null, say: null, click: false };
  if (!s) return { s: null, say: null, click: ev.kind === "up" };
  if (ev.kind === "move") {
    if (!s.dragging && Math.hypot(ev.x - s.x, ev.y - s.y) > DRAG_OUT_PX) return { s: { ...s, dragging: true }, say: "untuck_drag", click: false };
    return { s, say: null, click: false };
  }
  return { s: null, say: s.dragging ? "drop_dock" : null, click: ev.kind === "up" && !s.dragging };
}

/** How soon after a drag's let go a click is the end of that drag, not a press of the face (ms). WebKit may send no
 *  click at all after a captured drag, so only a click this close to the let go is swallowed (the M111 review). */
export const SWALLOW_MS = 300;
export function swallowClick(dropAt: number | null, now: number): boolean { return dropAt !== null && now - dropAt >= 0 && now - dropAt <= SWALLOW_MS; }

/** Pointer handlers for Flowflow's face in the notch: only while it is tucked (`on`). A drag past the threshold pulls it
 *  out; the click right after a drag is swallowed. Never takes focus. */
export function useDragOut(on: boolean) {
  const st = useRef<DragOut>(null);
  const dropAt = useRef<number | null>(null);
  // Round 1 (the founder: "it does not make sense because it's always there"): from the moment the drag pulls Flowflow out
  // until the let go, its face leaves the notch's row, so only one Flowflow is ever on screen.
  const [dragging, setDragging] = useState(false);
  const go = (kind: "down" | "move" | "up" | "lost", e: { screenX: number; screenY: number; button?: number; pointerId?: number; currentTarget?: EventTarget | null }) => {
    if (kind === "down" && (e.button ?? 0) !== 0) return;
    if (kind === "down") dropAt.current = null;
    const r = dragOutStep(st.current, { kind, x: e.screenX, y: e.screenY, on });
    // Round 2: the capture sits on the handle that carries these handlers (never on the face drawn inside it, which hides
    // while the drag holds), so the let go always comes back here.
    if (kind === "down" && r.s && e.pointerId !== undefined) (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    if (r.say === "drop_dock") dropAt.current = performance.now();
    st.current = r.s;
    if (r.say === "untuck_drag") setDragging(true);
    else if (r.say === "drop_dock" || !r.s) setDragging(false);
    if (r.say) void invoke(r.say).catch(() => {});
  };
  // Round 2, the backstop: while the drag holds, a let go anywhere in this page ends it once, even if the capture was lost
  // on the way (a second let go finds no drag and says nothing).
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!dragging) return;
    const up = (e: PointerEvent) => goRef.current("up", e);
    const lost = (e: PointerEvent) => goRef.current("lost", e);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", lost);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", lost); };
  }, [dragging]);
  return {
    onPointerDown: (e: React.PointerEvent) => go("down", e),
    onPointerMove: (e: React.PointerEvent) => go("move", e),
    onPointerUp: (e: React.PointerEvent) => go("up", e),
    onPointerCancel: (e: React.PointerEvent) => go("lost", e),
    onLostPointerCapture: (e: React.PointerEvent) => go("lost", e),
    /** Flowflow is being pulled out right now: its face is hidden in the notch meanwhile (the handle stays, holding the drag). */
    dragging,
    /** Call first in the face's onClick: true when that click ended a drag and must do nothing. */
    swallowed: () => { const w = swallowClick(dropAt.current, performance.now()); dropAt.current = null; return w; },
  };
}
