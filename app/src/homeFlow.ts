// M66 step 3, Home and its cards: the pure parts of the fixes that keep Home still while things arrive. Tested in
// homeFlow.test.ts; card.tsx and useModel.ts only use them.
// - Streaming text (fix 4): deltas are merged so the page draws once a frame, and the text is shown in whole words, a
//   chunk at a time, in a box that keeps its height. Home grows once, when the answer is ready.
// - A card that needs you is scrolled to, never jumped to (fix 15).
// - The proven check lands once (fix 17), never again on a re-render or a reopen.
// - A practice copy is checked once when it is first opened (fix 16), so Home shows its real verdict.

/** The streaming box keeps this many lines, pinned to the bottom, whatever arrives. */
export const STREAM_LINES = 4;
/** A chunk is shown once at least this many new characters have come, or a sentence or a line ended. */
export const STREAM_CHUNK = 24;

type Ev = { type: string; [k: string]: unknown };
const DELTAS = new Set(["assist.prompt.delta"]);

/** Events that came in one frame, with each run of streamed deltas for the same request joined into one, in order. Any
 *  other event keeps its place, so nothing is ever reordered around it. */
export function mergeDeltas(list: readonly Ev[]): Ev[] {
  const out: Ev[] = [];
  for (const e of list) {
    const last = out.at(-1);
    if (last && DELTAS.has(e.type) && last.type === e.type && last.req === e.req) out[out.length - 1] = { ...last, text: String(last.text ?? "") + String(e.text ?? "") };
    else out.push(e);
  }
  return out;
}

/** Holds a frame's events and hands them on once, merged, on the next frame (`schedule` is requestAnimationFrame in the
 *  page). An event that is not a delta while nothing waits goes on at once: only streaming waits for a frame. */
export class FrameBatch {
  private queue: Ev[] = [];
  private armed = false;
  constructor(private readonly out: (e: Ev) => void, private readonly schedule: (f: () => void) => void) {}
  push(e: Ev): void {
    if (!this.queue.length && !DELTAS.has(e.type)) { this.out(e); return; }
    this.queue.push(e);
    if (this.armed) return;
    this.armed = true;
    this.schedule(() => this.flush());
  }
  flush(): void {
    this.armed = false;
    const list = mergeDeltas(this.queue);
    this.queue = [];
    for (const e of list) this.out(e);
  }
}

/** What the streaming box shows next, from what it shows now and all the text so far: whole words only, and only once a
 *  chunk is worth it (STREAM_CHUNK characters, or the end of a sentence or a line), so the box changes a few times a
 *  second, never each token. Text that was replaced (a new request) starts again from its own beginning. */
export function revealTo(shown: string, full: string): string {
  if (!full.startsWith(shown)) shown = "";
  const fresh = full.slice(shown.length);
  if (!fresh) return shown;
  // The last place a word ended: a space or a line break, or after a sentence's end.
  const cut = Math.max(full.lastIndexOf(" "), full.lastIndexOf("\n")) + 1;
  if (cut <= shown.length) return shown;
  const ready = full.slice(shown.length, cut);
  return ready.length >= STREAM_CHUNK || /[.!?:\n]\s*$/.test(ready) ? full.slice(0, cut) : shown;
}

/** True when the only change between two models is streamed text: Home then needs no measuring, because the streaming box
 *  keeps its size (useHomeMotion's skip). Anything else, or no earlier model, measures as usual. */
export function onlyStreamChanged<M extends { ph?: unknown }>(was: M | null, now: M): boolean {
  if (!was || was === now) return false;
  const a = was as Record<string, unknown>, b = now as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] === b[k]) continue;
    if (k !== "ph") return false;
    const p = a.ph as Record<string, unknown> | null, q = b.ph as Record<string, unknown> | null;
    if (!p || !q) return false;
    for (const j of new Set([...Object.keys(p), ...Object.keys(q)])) if (j !== "streaming" && p[j] !== q[j]) return false;
  }
  return true;
}

/** How a card that waits on the person comes into view: smoothly, except while Home is opening (its content is not drawn
 *  yet, so it is simply placed before the shape opens) and with motion reduced. */
export const waitScroll = (o: { opening: boolean; reduced: boolean }): ScrollBehavior => (o.opening || o.reduced ? "auto" : "smooth");

/** The proven check's one landing: true the first time a proven result is seen, never again for the same one (a
 *  re-render, Home opened again, another place and back). */
export class Landing {
  private seen = new Set<string>();
  lands(id: string | null | undefined, proven: boolean): boolean {
    if (!id || !proven || this.seen.has(id)) return false;
    this.seen.add(id);
    return true;
  }
}
/** A practice's thread lands when it moves into done while it is on screen (not when it was already done). */
export const threadLands = (was: string | null | undefined, now: string | null | undefined): boolean => !!was && was !== "done" && now === "done";

/** A practice copy just opened (not one opened again, which checks itself as before): its checks run once, quietly, so
 *  Home and the notch say how it really is instead of Not checked yet. Once per folder (`seen`), never while busy or
 *  before the folder is in use. */
export function checksOnOpen(o: { practice: { project: string; stage: string; resumed?: boolean } | null; project: string; busy: boolean; switched: boolean; seen: string }): boolean {
  const p = o.practice;
  return !!p && p.stage === "start" && p.project === o.project && !o.busy && o.switched && o.seen !== p.project;
}

/** M71 part 2 (the wide review state cut its tag and character off the top): a card that waits comes into view only when
 *  its start is not already on screen. When its top is in view (with room for its first line), Home stays where it is, so
 *  the lead above it is never scrolled off; a tall card is read by scrolling down, from the top the person already sees. */
export function waitNeedsScroll(o: { cardTop: number; viewTop: number; viewBottom: number; firstLine?: number }): boolean {
  const line = o.firstLine ?? 48;
  return !(o.cardTop >= o.viewTop && o.cardTop <= o.viewBottom - line);
}
/** The element that scrolls a card: its nearest ancestor that can scroll, else the page's own scroller. */
export function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
