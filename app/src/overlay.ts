// The pointer: an arrow that flies from the character to the target, then a pulsing ring and a short caption.
// Plain page, no framework, no input: the panel it sits in ignores the mouse and never takes the keyboard.
import { listen } from "./tauri.ts";
import { at, burst, confetti, CONFETTI_S, flightMs, RING_MS } from "./pointer.ts";
import { fitLabel, wrapLines } from "./layout.ts";
import { sketchEllipse, sketchLine, sketchRect } from "./sketch.ts";
import { fadeMs, markFor, markStrokes, ringRadii } from "./marks.ts";

// mark: a hand drawn ring, arrow, underline or box for a confirmed target (marks.ts); a guess never gets one. flyMs: how
// long the flight takes (a step of a multi step answer flies for its lead in). fadeMs: how long the mark stays (its line).
type Point = { clip?: { x: number; y: number; w: number; h: number } | null; rect: { x: number; y: number; w: number; h: number }; from: { x: number; y: number }; caption: string; exact: boolean; reduced?: boolean; hold?: boolean; mark?: string | null; flyMs?: number | null; fadeMs?: number | null };
const svg = document.getElementById("s")!;
const cap = document.getElementById("cap") as HTMLElement;
let timer: ReturnType<typeof setTimeout> | undefined;
let markTimer: ReturnType<typeof setTimeout> | undefined;
const NS = "http://www.w3.org/2000/svg";
const el = (name: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };


function clear() { svg.replaceChildren(); cap.classList.remove("on"); clearTimeout(timer); clearTimeout(markTimer); }

function show(p: Point) {
  clear();
  // A ring that waits for the person's click stays until they click, press Do it for me, or close it. Any other goes ten
  // seconds after this draw was ordered, the flight included, so it never outlives the shell's watch of its window (rule 22).
  if (!p.hold) timer = setTimeout(clear, RING_MS);
  const reduced = p.reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
  const { rx, ry } = ringRadii(p.rect);
  const color = p.exact ? "#ff9a2e" : "#ffb020";
  // The ring and arrow are drawn only inside the window they were confirmed in (nothing lands on a different app).
  let layer: Element = svg;
  if (p.clip) {
    const id = "winclip", cp = el("clipPath", { id });
    cp.appendChild(el("rect", { x: p.clip.x, y: p.clip.y, width: p.clip.w, height: p.clip.h }));
    svg.appendChild(cp);
    layer = el("g", { "clip-path": `url(#${id})` });
    svg.appendChild(layer);
  }
  // A confirmed target may ask for a hand drawn mark; it is drawn on landing, stays while its line is said or read, then
  // fades and the steady ring takes over. Every point of it is inside the window (marks.ts), and the clip above holds too.
  const kind = markFor(p.mark, p.exact);
  const strokes = kind ? markStrokes(kind, p.rect, p.clip ?? null, p.caption, { x: 0, y: 0, w: innerWidth, h: innerHeight }) : null;
  const ring = el("ellipse", { cx, cy, rx, ry, fill: "none", stroke: color, "stroke-width": p.exact ? 4 : 3, "stroke-dasharray": p.exact ? "" : "8 6", class: "ring", opacity: reduced && !strokes ? 1 : 0 });
  layer.appendChild(ring);
  const arrow = el("path", { d: "M0 0 L-14 -26 L0 -18 L14 -26 Z", fill: color, stroke: "#111", "stroke-width": 2, "stroke-linejoin": "round" });
  const place = (x: number, y: number, angle: number) => arrow.setAttribute("transform", `translate(${x} ${y}) rotate(${angle})`);
  layer.appendChild(arrow);
  const drawMark = (paths: string[]) => {
    const g = el("g", { class: "mark" });
    for (const d of paths) g.appendChild(el("path", { d, fill: "none", stroke: color, "stroke-width": 3.4, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    layer.appendChild(g);
    if (kind === "arrow") arrow.remove();   // the drawn arrow points at it; the flying one would be a second arrow
    if (!reduced) {
      // Each stroke draws itself on, the way a pen would.
      for (const s of Array.from(g.querySelectorAll("path")) as SVGPathElement[]) {
        const len = s.getTotalLength?.() ?? 0; if (!len) continue;
        s.style.strokeDasharray = `${len}`; s.style.strokeDashoffset = `${len}`; s.getBoundingClientRect();
        s.style.transition = "stroke-dashoffset .45s ease-out"; s.style.strokeDashoffset = "0";
      }
    }
    markTimer = setTimeout(() => {
      ring.setAttribute("opacity", "1");
      if (reduced) { g.remove(); return; }
      g.style.transition = "opacity .5s"; g.style.opacity = "0";
      markTimer = setTimeout(() => g.remove(), 550);
    }, fadeMs(p.fadeMs));
  };
  const land = () => {
    if (strokes) drawMark(strokes); else ring.setAttribute("opacity", "1");
    place(cx, cy - ry - 4, 0);
    const side = cx > innerWidth / 2 ? -1 : 1;
    cap.textContent = (p.hold ? "Your turn: " : "") + p.caption + (p.exact ? "" : " (around here)");
    const box = p.clip ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };   // the words stay inside the window too
    cap.style.left = `${Math.max(box.x + 8, Math.min(box.x + box.w - 320, side > 0 ? cx + rx + 12 : cx - rx - 12 - 300))}px`;
    cap.style.top = `${Math.max(box.y + 8, Math.min(box.y + box.h - 60, cy - 18))}px`;
    cap.classList.add("on");
  };
  if (reduced) { land(); return; }
  const dx = cx - p.from.x, dy = cy - p.from.y, dist = Math.hypot(dx, dy);
  const dur = typeof p.flyMs === "number" && Number.isFinite(p.flyMs) ? Math.min(1600, Math.max(300, p.flyMs)) : flightMs(dist);
  const bend = Math.min(80, dist / 4), mx = (p.from.x + cx) / 2, my = (p.from.y + cy) / 2 - bend;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = (1 - e) ** 2 * p.from.x + 2 * (1 - e) * e * mx + e ** 2 * cx, y = (1 - e) ** 2 * p.from.y + 2 * (1 - e) * e * my + e ** 2 * (cy - ry - 4);
    const ax = 2 * (1 - e) * (mx - p.from.x) + 2 * e * (cx - mx), ay = 2 * (1 - e) * (my - p.from.y) + 2 * e * ((cy - ry - 4) - my);
    place(x, y, (Math.atan2(ay, ax) * 180) / Math.PI + 90);
    if (t < 1) requestAnimationFrame(step); else land();
  };
  requestAnimationFrame(step);
}

void listen("overlay-point", (e) => show(e.payload as Point));
void listen("overlay-clear", () => clear());

// The person clicked the right thing: the ring turns green with a tick, and a short burst of dots (none with reduced motion).
function celebrate(rect: { x: number; y: number; w: number; h: number }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  clearTimeout(timer); clearTimeout(markTimer);
  svg.querySelectorAll("path").forEach((a) => a.remove());
  svg.querySelectorAll("g.mark").forEach((g) => g.remove());
  const ring = svg.querySelector("ellipse");
  if (ring) { ring.setAttribute("opacity", "1"); ring.setAttribute("stroke", "#1e8a4c"); ring.setAttribute("stroke-dasharray", ""); ring.classList.remove("ring"); }
  const cx = rect.x + rect.w / 2, ty = rect.y - Math.max(rect.h / 2 + 10, 26) + rect.h / 2 - 2;
  svg.appendChild(el("path", { d: `M${cx - 9} ${ty - 14} l6 6 l12 -13`, fill: "none", stroke: "#1e8a4c", "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  cap.textContent = "That's it."; 
  if (!reduced) {
    const dots = burst(rect).map((d, i) => { const c = el("circle", { cx: d.x, cy: d.y, r: d.r, fill: i % 2 ? "#ff9a2e" : "#1e8a4c" }); svg.appendChild(c); return { c, d }; });
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 650), e = 1 - (1 - t) ** 3;
      for (const { c, d } of dots) { c.setAttribute("cx", String(d.x + d.dx * e)); c.setAttribute("cy", String(d.y + d.dy * e)); c.setAttribute("opacity", String(1 - t)); }
      if (t < 1) requestAnimationFrame(step); else dots.forEach(({ c }) => c.remove());
    };
    requestAnimationFrame(step);
  }
}
void listen("overlay-celebrate", (e) => celebrate((e.payload as { rect: { x: number; y: number; w: number; h: number } }).rect));


// The big celebration (proof passed on a fix, or the site went live): confetti from the character, once, then gone.
// It draws in its own layer and never clears anything else on the overlay.
function party(o: { x: number; y: number }) {
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
void listen("overlay-party", (e) => party(e.payload as { x: number; y: number }));


// Draw it for me: the diagram as a hand drawn sketch on a soft dark card. Boxes and arrows are drawn as a pen would make
// them (the same every time), the broken place is circled and marked in red with its reason, and one line of caption sits
// underneath. Strokes draw themselves on, box by box and then arrow by arrow (all at once with reduced motion), and the
// whole thing fades by itself.
type Laid = { nodes: { id: string; label: string; x: number; y: number; w: number; h: number; broken: boolean }[]; edges: { from: string; to: string; label?: string; points: [number, number][]; broken: boolean }[]; width: number; height: number; caption: string; reason: string };
const RED = "#ff6b6b", INKC = "#f2efe6";
const HAND = "'Bradley Hand', 'Noteworthy', 'Marker Felt', 'Segoe Print', cursive";
function drawDiagram(d: Laid, dockX: number) {
  clear();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  timer = setTimeout(() => { g.style.transition = "opacity .6s"; g.style.opacity = "0"; timer = setTimeout(clear, 700); }, 15_000);
}
void listen("overlay-diagram", (e) => { const p = e.payload as { diagram: Laid; dockX: number }; drawDiagram(p.diagram, p.dockX); });
