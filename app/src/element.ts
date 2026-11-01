// The room's element (the brand language, 1 Nov 2026): Home is a dark room lit from inside by the group at work, one element
// per room. Flow's water is the home colour (Now, History, Memory, Settings), Guide's sunbeam lights Learn, Voice's bloom
// takes the room while the talk keys are held, and Files' moss while a file is dragged over Home. The
// stylesheets swap every colour on data-element (ui/tokens.css), so this file only answers which element, and whether the
// light may move. Plain code, tested in element.test.ts.
import { useEffect, useState } from "react";
import type { GroupId } from "./groups.ts";
import type { Tab } from "./home.ts";

export const ELEMENTS = ["flow", "guide", "voice", "files"] as const;
export type ElementId = (typeof ELEMENTS)[number];

/** The element lighting Home now (groups.ts activeGroup says which group is at work). What you are doing this moment wins:
 *  holding the talk keys, or Prompt help reading the words you picked, is Voice's room, and a file dragged over Home is
 *  Files', on any place but Settings (the accents on the page you are changing never flicker). Learn is Guide's room, and
 *  so is Now while a practice or a lesson runs. Everything else is Flow's water, the home colour. */
export function roomElement(o: { tab: Tab; active: GroupId | null }): ElementId {
  if (o.tab !== "settings") {
    if (o.active === "voice" || o.active === "prompt") return "voice";
    if (o.active === "files") return "files";
  }
  if (o.tab === "learn") return "guide";
  if (o.tab === "now" && o.active === "guide") return "guide";
  return "flow";
}

/** How long Home may sit untouched before its light holds still (a single frame, nothing redrawn). */
export const ROOM_IDLE_MS = 10_000;

/** Whether the light holds still: Home closed or hidden, or nobody has touched it for ROOM_IDLE_MS. Reduce motion and Less
 *  motion stop it in the stylesheet, whatever this says. */
export function roomStill(o: { open: boolean; hidden: boolean; sinceTouch: number }): boolean {
  return !o.open || o.hidden || o.sinceTouch >= ROOM_IDLE_MS;
}

/** Live: true while the light should hold still. Any pointer, key or scroll in Home wakes it; hiding the page stills it. */
export function useRoomStill(open: boolean): boolean {
  const [idle, setIdle] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    if (!open) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const wake = () => { setIdle(false); if (t) clearTimeout(t); t = setTimeout(() => setIdle(roomStill({ open: true, hidden: false, sinceTouch: ROOM_IDLE_MS })), ROOM_IDLE_MS); };
    const seen = () => setHidden(document.hidden);
    wake();
    const evs = ["pointermove", "pointerdown", "keydown", "wheel"] as const;
    for (const e of evs) window.addEventListener(e, wake, { passive: true });
    document.addEventListener("visibilitychange", seen);
    return () => { if (t) clearTimeout(t); for (const e of evs) window.removeEventListener(e, wake); document.removeEventListener("visibilitychange", seen); };
  }, [open]);
  return roomStill({ open, hidden, sinceTouch: idle ? ROOM_IDLE_MS : 0 });
}
