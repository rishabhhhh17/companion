// The pointer: a drop of Flowflow's water that splits off the character, flies to the target and spreads into a ring of
// water around it, then a short caption (M17, water.ts).
// Plain page, no framework, no input: the panel it sits in ignores the mouse and never takes the keyboard.
import { listen } from "./tauri.ts";
import { at, burst, captionPlace, captionStyle, confetti, CONFETTI_S, flightMs, ringLook, ringMsOf } from "./pointer.ts";
import { arcAt, BEAD_GAP, BEAD_R, bud, dropScale, DROP_R, easeInOut, HOME_DELAY_MS, HOME_MS, isHop, LAND_MS, ringBeads, settle, SPLIT_MS, SPREAD_MS, stretch, type Tint, waterTint } from "./water.ts";
import { fitLabel, wrapLines } from "./layout.ts";
import { sketchEllipse, sketchLine, sketchRect } from "./sketch.ts";
import { fadeMs, markFor, markStrokes, ringRadii } from "./marks.ts";
import { followLessMotion, playful, reducedMotion } from "./motion.ts";
import { reactionsOn } from "./reactions.ts";
import { setting, startSettings, takeSnapshot } from "./settingsStore.ts";

// mark: a hand drawn ring, arrow, underline or box for a confirmed target (marks.ts); a guess never gets one. flyMs: how
// long the flight takes (a step of a multi step answer flies for its lead in). fadeMs: how long the mark stays (its line).
// ringMs: how long a ring that does not wait stays (How long a ring stays in Settings), the time the shell watches it by.
// settings: the settings in force, sent with the ring because the overlay only listens (its colour, lettering and pace).
type Point = { clip?: { x: number; y: number; w: number; h: number } | null; rect: { x: number; y: number; w: number; h: number }; from: { x: number; y: number }; caption: string; exact: boolean; reduced?: boolean; hold?: boolean; mark?: string | null; flyMs?: number | null; fadeMs?: number | null; ringMs?: number | null; settings?: unknown };
const svg = document.getElementById("s")!;
const cap = document.getElementById("cap") as HTMLElement;
let timer: ReturnType<typeof setTimeout> | undefined;
let markTimer: ReturnType<typeof setTimeout> | undefined;
const NS = "http://www.w3.org/2000/svg";
const el = (name: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };


// Which draw is the current one. Every clear (Esc, Stop everything, the window changed, a new draw) makes the draw before
// it old, and an old draw's flight and landing do nothing, so a ring cleared while its arrow flies never lands: no caption
// and no mark come back after the clear (rule 22).
let drawGen = 0;
function clear() { drawGen += 1; svg.replaceChildren(); cap.classList.remove("on"); clearTimeout(timer); clearTimeout(markTimer); }

// The water pointer (M17, water.ts): where the last drop landed (a draw starting there is a hop to the next step, not a
// new split from the character), and the water layer's colours for the ring colour chosen in Settings.
let lastLanding: { x: number; y: number } | null = null;
// Where the drop went home to after a right click: the next step then splits off the character again, from there.
let wentHome: { x: number; y: number } | null = null;
function tintWater(t: Tint) {
  for (const [id, c] of [["wg-hi", t.hi], ["wg-mid", t.mid], ["wg-deep", t.deep]] as const) document.getElementById(id)?.setAttribute("stop-color", c);
}

function show(p: Point) {
  clear();
  const mine = drawGen;
  // A ring that waits for the person's click stays until they click, press Do it for me, or close it. Any other goes the
  // time the shell sent after this draw was ordered, the flight included, so it never outlives the shell's watch of its
  // window (rule 22).
  if (!p.hold) timer = setTimeout(clear, ringMsOf(p.ringMs));
  const reduced = p.reduced ?? reducedMotion();
  const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
  const { rx, ry } = ringRadii(p.rect);
  // Ring colour in Settings, for a confirmed target; a guess keeps its soft dashed look whatever the colour (rule 22).
  const look = ringLook(setting("point.colour"), p.exact);
  const color = look.stroke;
  tintWater(waterTint(setting("point.colour"), setting("look.water")));
  // The pointer's style and size (M19): water (the drop and its ring of water) or a plain ring; the drop small to large.
  const style = setting("point.style") === "ring" ? "ring" : "water", ks = dropScale(setting("point.dropSize")), R = DROP_R * ks;
  // The ring and the drop are drawn only inside the window they were confirmed in (nothing lands on a different app).
  let layer: Element = svg;
  if (p.clip) {
    const id = "winclip", cp = el("clipPath", { id });
    cp.appendChild(el("rect", { x: p.clip.x, y: p.clip.y, width: p.clip.w, height: p.clip.h }));
    svg.appendChild(cp);
    layer = el("g", { "clip-path": `url(#${id})` });
    svg.appendChild(layer);
  }
  // The drop leaves the character outside any window, so its split and flight are drawn unclipped; the ring is clipped.
  const water = el("g", { class: "water", filter: "url(#goo)" });
  svg.appendChild(water);
  const ringWater = el("g", { class: "water", filter: "url(#goo)" });
  layer.appendChild(ringWater);
  // A confirmed target may ask for a hand drawn mark; it is drawn on landing, stays while its line is said or read, then
  // fades and the steady ring takes over. Every point of it is inside the window (marks.ts), and the clip above holds too.
  const kind = markFor(p.mark, p.exact);
  const strokes = kind ? markStrokes(kind, p.rect, p.clip ?? null, p.caption, { x: 0, y: 0, w: innerWidth, h: innerHeight }) : null;
  // High contrast: a dark edge under the ring and the marks, so a white ring shows on any app.
  const halo = look.halo ? el("ellipse", { cx, cy, rx, ry, fill: "none", stroke: look.halo, "stroke-width": look.width + 4, class: "ring", opacity: reduced && !strokes ? 1 : 0 }) : null;
  if (halo) layer.appendChild(halo);
  // A confirmed target's ring is the water (the beads below); its line stays as the shape the celebration turns green. A
  // guess keeps the soft dashed ring and no water (rule 22), and high contrast keeps its solid white ring under the water.
  const ring = el("ellipse", { cx, cy, rx, ry, fill: "none", stroke: color, "stroke-width": look.width, "stroke-dasharray": look.dash, class: "ring", "data-main": 1, opacity: reduced && !strokes ? 1 : 0 });
  if (p.exact && !look.halo && style === "water") ring.setAttribute("data-water", "1");
  layer.appendChild(ring);
  // The water ring: beads evenly spaced around the target that spread out like water and wobble gently (still with less
  // motion). It starts when the plain ring would show.
  const beads = p.exact && style === "water" ? ringBeads(rx, ry, BEAD_GAP * ks).map((b) => ({ b, c: ringWater.appendChild(el("circle", { cx, cy, r: 0, fill: "url(#wg)" })) })) : [];
  const placeBeads = (k: number, now: number) => {
    const sk = reduced ? 1 : settle(k), grow = reduced ? 1 : Math.min(1, k * 2);
    for (const { b, c } of beads) {
      const wob = reduced ? 0 : Math.sin(now / 330 + b.ux * 4) * 2.2 + Math.sin(now / 190 + b.uy * 5) * 1.3;
      c.setAttribute("cx", String(cx + b.ux * rx * sk + b.nx * wob));
      c.setAttribute("cy", String(cy + b.uy * ry * sk + b.ny * wob));
      c.setAttribute("r", String(BEAD_R * ks * grow));
    }
  };
  const ringOn = () => {
    ring.setAttribute("opacity", "1"); halo?.setAttribute("opacity", "1");
    if (!beads.length) return;
    if (reduced) { placeBeads(1, 0); return; }
    const t0 = performance.now();
    // Once the ring has spread and settled, a held ring (waiting for the click, maybe for minutes) keeps its wobble at 20
    // frames a second rather than every refresh of the screen (M25): the same look, far less redrawing of the water filter.
    const wobble = (now: number) => {
      if (mine !== drawGen) return;
      placeBeads((now - t0) / SPREAD_MS, now);
      if (now - t0 > SPREAD_MS + 3000) setTimeout(() => requestAnimationFrame(wobble), 50);
      else requestAnimationFrame(wobble);
    };
    requestAnimationFrame(wobble);
  };
  const drawMark = (paths: string[]) => {
    const g = el("g", { class: "mark" });
    for (const d of paths) {
      if (look.halo) g.appendChild(el("path", { d, fill: "none", stroke: look.halo, "stroke-width": 7.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      g.appendChild(el("path", { d, fill: "none", stroke: color, "stroke-width": 3.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    }
    layer.appendChild(g);
    if (!reduced) {
      // Each stroke draws itself on, the way a pen would.
      for (const s of Array.from(g.querySelectorAll("path")) as SVGPathElement[]) {
        const len = s.getTotalLength?.() ?? 0; if (!len) continue;
        s.style.strokeDasharray = `${len}`; s.style.strokeDashoffset = `${len}`; s.getBoundingClientRect();
        s.style.transition = "stroke-dashoffset .45s ease-out"; s.style.strokeDashoffset = "0";
      }
    }
    markTimer = setTimeout(() => {
      if (mine !== drawGen) return;
      ringOn();
      if (reduced) { g.remove(); return; }
      g.style.transition = "opacity .5s"; g.style.opacity = "0";
      markTimer = setTimeout(() => g.remove(), 550);
    }, fadeMs(p.fadeMs));
  };
  const land = () => {
    if (mine !== drawGen) return;
    lastLanding = { x: cx, y: cy };
    if (strokes) drawMark(strokes); else ringOn();
    const side = cx > innerWidth / 2 ? -1 : 1;
    cap.textContent = (p.hold ? "Your turn: " : "") + p.caption + (p.exact ? "" : " (around here)");
    // Ring lettering and the text size picked in Settings; plain at the usual size is the caption as it always was.
    const cs = captionStyle(setting("point.lettering"), setting("display.textSize"));
    const box = p.clip ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };   // the words stay inside the window too
    const spot = captionPlace(cs, box, { cx, cy, rx }, side);
    cap.style.font = cs.font; cap.style.maxWidth = `${spot.maxWidth}px`;
    cap.style.left = `${spot.left}px`;
    cap.style.top = `${spot.top}px`;
    cap.classList.toggle("left", side < 0);
    cap.classList.toggle("white", setting("point.caption") === "white");
    cap.classList.add("on");
  };
  if (style === "ring") { land(); return; }   // a plain ring simply appears, as it used to
  if (reduced) { land(); return; }
  // The drop: it splits off the character (a hop from the last step's target skips that), arcs to the target stretched
  // the way it moves with a few tiny drops dropping behind, squashes on arrival, then the ring spreads from it.
  const to = { x: cx, y: cy };
  let hop = isHop(p.from, lastLanding), origin = p.from;
  if (hop && wentHome) { hop = false; origin = wentHome; }
  wentHome = null;
  const dist = Math.hypot(cx - origin.x, cy - origin.y);
  const dur = typeof p.flyMs === "number" && Number.isFinite(p.flyMs) ? Math.min(1600, Math.max(300, p.flyMs)) : flightMs(dist, setting("point.pace"));
  const drop = water.appendChild(el("ellipse", { cx: origin.x, cy: origin.y, rx: 0, ry: 0, fill: "url(#wg)" }));
  const neck = water.appendChild(el("circle", { cx: origin.x, cy: origin.y, r: 0, fill: "url(#wg)" }));
  const trail: { c: Element; r: number; life: number }[] = [];
  const shape = (x: number, y: number, r: number, along: number, across: number, angle: number) => {
    drop.setAttribute("cx", String(x)); drop.setAttribute("cy", String(y));
    drop.setAttribute("rx", String(r * along)); drop.setAttribute("ry", String(r * across));
    drop.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
  };
  const t0 = performance.now(), splitMs = hop ? 0 : SPLIT_MS;
  let prev = { x: origin.x, y: origin.y, t: t0 }, start = { x: origin.x, y: origin.y };
  const step = (now: number) => {
    if (mine !== drawGen) return;   // cleared or replaced while it flew
    const t = now - t0;
    if (t < splitMs) {
      const b = bud(origin, to, t / splitMs);
      shape(b.x, b.y, b.r * ks, 1, 1, 0);
      neck.setAttribute("cx", String(b.neck.x)); neck.setAttribute("cy", String(b.neck.y)); neck.setAttribute("r", String(b.neck.r));
      start = { x: b.x, y: b.y }; prev = { x: b.x, y: b.y, t: now };
      requestAnimationFrame(step); return;
    }
    neck.setAttribute("r", "0");
    const k = Math.min(1, (t - splitMs) / dur), e = easeInOut(k);
    if (k < 1) {
      const q = arcAt(start, to, e, hop), dt = Math.max(1, now - prev.t);
      const vx = ((q.x - prev.x) / dt) * 1000, vy = ((q.y - prev.y) / dt) * 1000, st = stretch(Math.hypot(vx, vy));
      shape(q.x, q.y, R, st.along, st.across, (Math.atan2(vy, vx) * 180) / Math.PI);
      if (Math.hypot(vx, vy) > 300 && trail.length < 40 && (Math.round(now / 16) % 2 === 0)) trail.push({ c: water.appendChild(el("circle", { cx: q.x, cy: q.y, r: 5, fill: "url(#wg)" })), r: 5, life: 1 });
      prev = { x: q.x, y: q.y, t: now };
    } else {
      // The squash on arrival, then the drop drains into the ring.
      const l = Math.min(1, (t - splitMs - dur) / LAND_MS), sq = Math.sin(l * Math.PI);
      shape(cx, cy, R * (1 - 0.6 * l), 1 + 0.55 * sq, 1 - 0.4 * sq, 0);
      if (l >= 1) { drop.remove(); land(); }
    }
    for (const d of trail) { d.life -= 0.06; d.c.setAttribute("r", String(Math.max(0, d.r * d.life))); }
    if (k < 1 || t - splitMs - dur < LAND_MS || trail.some((d) => d.life > 0)) requestAnimationFrame(step);
    else trail.forEach((d) => d.c.remove());
  };
  requestAnimationFrame(step);
}

// The settings in force (reactions), kept in step with every change (settingsStore.ts). The overlay only listens: the
// shell sends the settings with every change and with each celebration.
startSettings({ ask: false });
followLessMotion();
// The settings in force come with each pointer and each sketch (the shell sends them), so Less motion, the ring colour,
// the lettering and the pace reach them too.
void listen("overlay-point", (e) => { const p = e.payload as Point & { settings?: unknown }; takeSnapshot(p.settings); show(p); });
void listen("overlay-clear", () => clear());

// The person clicked the right thing: the ring turns green with a tick, and the water ring bursts into a splash of drops
// (none with reduced motion or with reactions turned off; the green ring and the tick show either way). Then the drop
// gathers and flies home to the character (`home`, where it is now), which ripples as it lands (the shell tells the dock).
function celebrate(rect: { x: number; y: number; w: number; h: number }, home: { x: number; y: number } | null) {
  const reduced = reducedMotion();
  drawGen += 1;   // a landing still on its way would cover the tick with the old caption
  const mine = drawGen;
  clearTimeout(timer); clearTimeout(markTimer);
  svg.querySelectorAll("path").forEach((a) => a.remove());
  svg.querySelectorAll("g.mark").forEach((g) => g.remove());
  svg.querySelectorAll("g.water").forEach((g) => g.remove());
  // The ring itself (not the dark edge under a high contrast one) turns green, and nothing pulses any more.
  const ring = svg.querySelector("ellipse[data-main]") ?? svg.querySelector("ellipse");
  svg.querySelectorAll("ellipse").forEach((e) => e.classList.remove("ring"));
  if (ring) { ring.setAttribute("opacity", "1"); ring.setAttribute("stroke", "#1e8a4c"); ring.setAttribute("stroke-dasharray", ""); ring.toggleAttribute("data-water", false); }
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, ty = rect.y - Math.max(rect.h / 2 + 10, 26) + rect.h / 2 - 2;
  svg.appendChild(el("path", { d: `M${cx - 9} ${ty - 14} l6 6 l12 -13`, fill: "none", stroke: "#1e8a4c", "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  cap.textContent = "That's it."; 
  wentHome = home;
  if (playful(reactionsOn(), reduced)) {
    const water = el("g", { class: "splash", filter: "url(#goo)" });
    svg.appendChild(water);
    const dots = burst(rect).map((d, i) => { const c = el("circle", { cx: d.x, cy: d.y, r: d.r + 2, fill: i % 3 ? "url(#wg)" : "#C6F432" }); (i % 3 ? water : svg).appendChild(c); return { c, d }; });
    const t0 = performance.now();
    const drop = home ? water.appendChild(el("circle", { cx, cy, r: 0, fill: "url(#wg)" })) : null;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 650), e = 1 - (1 - t) ** 3;
      for (const { c, d } of dots) { c.setAttribute("cx", String(d.x + d.dx * e)); c.setAttribute("cy", String(d.y + d.dy * e + 30 * t * t)); c.setAttribute("opacity", String(1 - t)); }
      // The drop gathers where the ring was, then arcs home and is gone as it reaches the character.
      const h = (now - t0 - HOME_DELAY_MS) / HOME_MS;
      if (drop && home && mine === drawGen) {
        if (h < 0) drop.setAttribute("r", String(DROP_R * Math.min(1, (now - t0) / HOME_DELAY_MS)));
        else if (h < 1) { const q = arcAt({ x: cx, y: cy }, home, easeInOut(h)); drop.setAttribute("cx", String(q.x)); drop.setAttribute("cy", String(q.y)); drop.setAttribute("r", String(DROP_R * (1 - 0.3 * h))); }
        else drop.remove();
      }
      if (t < 1 || (drop && h < 1 && mine === drawGen)) requestAnimationFrame(step); else { dots.forEach(({ c }) => c.remove()); water.remove(); }
    };
    requestAnimationFrame(step);
  }
}
void listen("overlay-celebrate", (e) => { const p = e.payload as { rect: { x: number; y: number; w: number; h: number }; home?: { x: number; y: number } | null; settings?: unknown }; takeSnapshot(p.settings); celebrate(p.rect, p.home ?? null); });


// The big celebration (proof passed on a fix, or the site went live): confetti from the character, once, then gone.
// It draws in its own layer and never clears anything else on the overlay. None with reactions off or reduced motion.
function party(o: { x: number; y: number }) {
  if (!playful(reactionsOn(), reducedMotion())) return;
  // The overlay is brought to the front for the confetti: a caption with no ring under it is never shown with it.
  if (!svg.querySelector("ellipse[data-main]")) cap.classList.remove("on");
  const layer = el("g", { class: "party" });
  svg.appendChild(layer);
  const bits = confetti(36, o.x > innerWidth / 2).map((p) => {
    const r = el("rect", { x: o.x, y: o.y, width: 7, height: 4, rx: 1, fill: p.color });
    layer.appendChild(r);
    return { r, p };
  });
  const t0 = performance.now();
  const step = (now: number) => {
    const t = (now - t0) / 1000;
    for (const { r, p } of bits) {
      const d = at(p, t);
      r.setAttribute("transform", `translate(${d.dx} ${d.dy}) rotate(${p.spin * t} ${o.x} ${o.y})`);
      r.setAttribute("opacity", String(Math.max(0, 1 - t / CONFETTI_S)));
    }
    if (t < CONFETTI_S) requestAnimationFrame(step); else layer.remove();
  };
  requestAnimationFrame(step);
}
void listen("overlay-party", (e) => { const p = e.payload as { x: number; y: number; settings?: unknown }; takeSnapshot(p.settings); party(p); });


// Draw it for me: the diagram as a hand drawn sketch on a soft dark card. Boxes and arrows are drawn as a pen would make
// them (the same every time), the broken place is circled and marked in red with its reason, and one line of caption sits
// underneath. Strokes draw themselves on, box by box and then arrow by arrow (all at once with reduced motion), and the
// whole thing fades by itself.
type Laid = { nodes: { id: string; label: string; x: number; y: number; w: number; h: number; broken: boolean }[]; edges: { from: string; to: string; label?: string; points: [number, number][]; broken: boolean }[]; width: number; height: number; caption: string; reason: string };
const RED = "#ff6b6b", INKC = "#f2efe6";
const HAND = "'Bradley Hand', 'Noteworthy', 'Marker Felt', 'Segoe Print', cursive";
/** How long the picture stays, as the shell sent it (How long Draw it for me stays in Settings): a time in ms, or null to keep
 *  it until it is closed. Nothing usable is the usual 15 seconds. */
function diagramMsOf(v: unknown): number | null {
  if (v === null) return null;
  return typeof v === "number" && Number.isFinite(v) ? Math.min(60_000, Math.max(5_000, v)) : 15_000;
}
function drawDiagram(d: Laid, dockX: number, ms: number | null) {
  clear();
  const reduced = reducedMotion();
  const pad = 26;
  const W = Math.max(d.width + pad * 2, 380);
  const perLine = Math.floor((W - pad * 2) / 8.6);   // letters that fit a line at the sizes used below
  const reasonLines = wrapLines(d.reason, perLine, 3), captionLines = wrapLines(d.caption, Math.floor(perLine * 1.1), 3);
  const below = 20 + reasonLines.length * 24 + 8 + captionLines.length * 21 + 14;
  const H = d.height + pad * 2 + below;
  const away = dockX > innerWidth / 2 ? -1 : 1;
  const left = Math.max(12, Math.min(innerWidth - W - 12, innerWidth / 2 - W / 2 + away * 60)), top = Math.max(12, Math.min(innerHeight - H - 12, innerHeight * 0.28));
  const g = el("g", { transform: `translate(${left} ${top})` });
  svg.appendChild(g);
  g.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, rx: 18, fill: "#17181d", opacity: 0.95 }));
  g.appendChild(el("path", { d: sketchRect(9, 9, W - 18, H - 18, "frame"), fill: "none", stroke: "#3a3d46", "stroke-width": 1.6, "stroke-linecap": "round" }));
  const body = el("g", { transform: `translate(${pad + (W - pad * 2 - d.width) / 2} ${pad})` });
  g.appendChild(body);
  const stroke = (dpath: string, color: string, width: number): SVGElement => el("path", { d: dpath, fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round" });
  const text = (x: number, y: number, t: string, size: number, color: string, anchor = "start", weight = 600): SVGElement => { const e = el("text", { x, y, "text-anchor": anchor, fill: color, "font-size": size, "font-weight": weight, "font-family": HAND }); e.textContent = t; return e; };
  const steps: SVGElement[][] = [[], []];
  for (const n of d.nodes) {
    const box = el("g", {});
    box.appendChild(stroke(sketchRect(n.x, n.y, n.w, n.h, `box:${n.id}`), n.broken ? RED : INKC, n.broken ? 3 : 2.2));
    box.appendChild(text(n.x + n.w / 2, n.y + n.h / 2 + 6, fitLabel(n.label, n.w, 18), 18, n.broken ? RED : INKC, "middle"));
    body.appendChild(box); steps[0].push(box);
  }
  for (const e of d.edges) {
    const [a, b] = e.points, col = e.broken ? RED : "#b8b5aa", line = el("g", {});
    line.appendChild(stroke(sketchLine(a[0], a[1], b[0], b[1], `edge:${e.from}>${e.to}`), col, e.broken ? 3.2 : 2.2));
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    line.appendChild(stroke(`M${b[0] - 13 * Math.cos(ang - 0.45)} ${b[1] - 13 * Math.sin(ang - 0.45)} L${b[0]} ${b[1]} L${b[0] - 13 * Math.cos(ang + 0.45)} ${b[1] - 13 * Math.sin(ang + 0.45)}`, col, e.broken ? 3.2 : 2.2));
    if (e.broken) {
      const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      line.appendChild(stroke(sketchEllipse(mx, my, 17, 17, `ring:${e.from}>${e.to}`), RED, 2.6));
      line.appendChild(text(mx, my + 9, "!", 28, RED, "middle", 900));
    }
    if (e.label) {
      // The words sit above the arrow, cut to fit the gap between the boxes, so they are never hidden behind one.
      const fit = Math.max(6, Math.floor(Math.abs(b[0] - a[0]) / 7));
      line.appendChild(text((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - (e.broken ? 26 : 14), e.label.length > fit ? e.label.slice(0, fit - 1) + "…" : e.label, 15, "#c9c6ba", "middle", 500));
    }
    body.appendChild(line); steps[1].push(line);
  }
  let ty = d.height + pad * 2 + 20;
  for (const l of reasonLines) { g.appendChild(text(pad, ty, l, 17, RED, "start", 700)); ty += 24; }
  ty += 8;
  for (const l of captionLines) { g.appendChild(text(pad, ty, l, 15, "#d8d5ca", "start", 500)); ty += 21; }
  if (!reduced) {
    // Each stroke draws itself on, one group after another.
    steps.forEach((group, gi) => group.forEach((x, k) => {
      const paths = Array.from(x.querySelectorAll("path")) as SVGPathElement[];
      x.setAttribute("opacity", "0");
      const t0 = 150 + gi * 700 + k * 220;
      setTimeout(() => {
        x.setAttribute("opacity", "1");
        for (const p of paths) { const len = p.getTotalLength?.() ?? 0; if (!len) continue; p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`; p.getBoundingClientRect(); p.style.transition = "stroke-dashoffset .55s ease-out"; p.style.strokeDashoffset = "0"; }
      }, t0);
    }));
  }
  // It fades after its time; one kept until closed stays until Close in Home or Stop everything (the shell clears it).
  if (ms !== null) timer = setTimeout(() => { if (reduced) { clear(); return; } g.style.transition = "opacity .6s"; g.style.opacity = "0"; timer = setTimeout(clear, 700); }, ms);
}
void listen("overlay-diagram", (e) => { const p = e.payload as { diagram: Laid; dockX: number; ms?: number | null; settings?: unknown }; takeSnapshot(p.settings); drawDiagram(p.diagram, p.dockX, diagramMsOf(p.ms)); });
