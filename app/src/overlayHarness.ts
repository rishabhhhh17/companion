// Runs the real overlay page (overlay.ts) on a stand in page, in a process of its own (overlay.test.ts starts it), so its
// module is loaded fresh with the stand in app below. Prints what is on the overlay after each scenario, as JSON lines.
// Nothing here touches the screen: the "page" is plain objects.
export {};
type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Listener>();
let frames: ((t: number) => void)[] = [];
let clock = 0;

class El {
  tagName: string;
  children: El[] = [];
  parent: El | null = null;
  attrs = new Map<string, string>();
  style: Record<string, string> = {};
  textContent = "";
  private cls = new Set<string>();
  classList = { add: (c: string) => this.cls.add(c), remove: (c: string) => this.cls.delete(c), contains: (c: string) => this.cls.has(c), toggle: (c: string) => (this.cls.has(c) ? this.cls.delete(c) : this.cls.add(c)) };
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  setAttribute(k: string, v: string) { this.attrs.set(k, String(v)); if (k === "class") for (const c of String(v).split(/\s+/).filter(Boolean)) this.cls.add(c); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  toggleAttribute(k: string, on?: boolean) { if (on === false) this.attrs.delete(k); else this.attrs.set(k, ""); }
  appendChild(c: El) { c.parent = this; this.children.push(c); return c; }
  replaceChildren() { for (const c of this.children) c.parent = null; this.children = []; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
  getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0 }; }
  private all(): El[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  private matches(sel: string): boolean {
    const m = /^([a-z]+)?(?:\.([a-z-]+))?(?:\[([a-z-]+)\])?$/i.exec(sel.trim());
    if (!m) return false;
    return (!m[1] || this.tagName === m[1].toUpperCase()) && (!m[2] || this.cls.has(m[2])) && (!m[3] || this.attrs.has(m[3]));
  }
  querySelectorAll(sel: string): El[] { const parts = sel.split(","); return this.all().filter((e) => parts.some((p) => e.matches(p))); }
  querySelector(sel: string): El | null { return this.querySelectorAll(sel)[0] ?? null; }
}

const svg = new El("svg"), cap = new El("div"), root = new El("html");
const g = globalThis as Record<string, unknown>;
g.window = { __TAURI__: { core: { invoke: async () => undefined }, event: { listen: async (ev: string, cb: Listener) => { listeners.set(ev, cb); return () => {}; } } } };
g.document = { getElementById: (id: string) => (id === "s" ? svg : id === "cap" ? cap : null), createElementNS: (_: string, n: string) => new El(n), documentElement: root };
g.innerWidth = 1440; g.innerHeight = 900;
g.requestAnimationFrame = (f: (t: number) => void) => { frames.push(f); return frames.length; };
g.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, "performance", { value: { now: () => clock }, configurable: true });

/** Moves time on, running the animation frames that were asked for, as a page would. */
function advance(ms: number) {
  const end = clock + ms;
  while (clock < end) { clock = Math.min(end, clock + 16); const due = frames; frames = []; for (const f of due) f(clock); }
}
const fire = (ev: string, payload: unknown = null) => listeners.get(ev)?.({ payload });
const state = (name: string) => ({ name, captionOn: cap.classList.contains("on"), caption: cap.textContent, drawn: svg.querySelectorAll("ellipse, path, g").length });

const point = (caption: string, x: number) => ({ rect: { x, y: 300, w: 80, h: 30 }, from: { x: 20, y: 20 }, caption, exact: true, hold: true, reduced: false, flyMs: 600, settings: null });

await import("./overlay.ts");
const out: unknown[] = [];

// Cleared while it flies (Esc, Stop everything, the window changed): nothing lands, no caption stays.
fire("overlay-point", point("Click Save", 700));
advance(200);
fire("overlay-clear");
advance(1000);
out.push(state("cleared while flying"));

// A confetti celebration later never shows a caption nobody drew.
fire("overlay-party", { x: 1300, y: 800, settings: null });
advance(100);
out.push(state("party after the clear"));

// A new ring while the old one flies: only the new one lands, with its own caption.
fire("overlay-clear");
fire("overlay-point", point("Click Save", 700));
advance(200);
fire("overlay-point", point("Click Publish", 300));
advance(450);   // past the old ring's landing, before the new one's
out.push(state("the old ring's landing time"));
advance(2000);
out.push(state("a new ring during the flight"));

// The confetti with a ring on screen leaves the ring's caption as it is.
fire("overlay-party", { x: 1300, y: 800, settings: null });
advance(100);
out.push(state("party with the ring there"));

// A caption still on with no ring under it (here the ring is taken off the stand in page directly): the confetti, which
// brings the overlay to the front, turns it off rather than show it over another app.
for (const e of svg.querySelectorAll("ellipse")) e.remove();
fire("overlay-party", { x: 1300, y: 800, settings: null });
advance(100);
out.push(state("party with a caption and no ring"));

for (const o of out) console.log(JSON.stringify(o));
