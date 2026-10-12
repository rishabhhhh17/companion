// The pointer: an arrow that flies from the character to the target, then a pulsing ring and a short caption.
// Plain page, no framework, no input: the panel it sits in ignores the mouse and never takes the keyboard.
import { listen } from "./tauri.ts";
import { at, burst, confetti, CONFETTI_S, flightMs } from "./pointer.ts";

type Point = { rect: { x: number; y: number; w: number; h: number }; from: { x: number; y: number }; caption: string; exact: boolean; reduced?: boolean; hold?: boolean };
const svg = document.getElementById("s")!;
const cap = document.getElementById("cap") as HTMLElement;
let timer: ReturnType<typeof setTimeout> | undefined;
const NS = "http://www.w3.org/2000/svg";
const el = (name: string, attrs: Record<string, string | number>) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };


function clear() { svg.replaceChildren(); cap.classList.remove("on"); clearTimeout(timer); }

function show(p: Point) {
  clear();
  const reduced = p.reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cx = p.rect.x + p.rect.w / 2, cy = p.rect.y + p.rect.h / 2;
  const rx = Math.max(p.rect.w / 2 + 10, 26), ry = Math.max(p.rect.h / 2 + 10, 26);
  const color = p.exact ? "#ff9a2e" : "#ffb020";
  const ring = el("ellipse", { cx, cy, rx, ry, fill: "none", stroke: color, "stroke-width": p.exact ? 4 : 3, "stroke-dasharray": p.exact ? "" : "8 6", class: "ring", opacity: reduced ? 1 : 0 });
  svg.appendChild(ring);
  const arrow = el("path", { d: "M0 0 L-14 -26 L0 -18 L14 -26 Z", fill: color, stroke: "#111", "stroke-width": 2, "stroke-linejoin": "round" });
  const place = (x: number, y: number, angle: number) => arrow.setAttribute("transform", `translate(${x} ${y}) rotate(${angle})`);
  svg.appendChild(arrow);
  const land = () => {
    ring.setAttribute("opacity", "1"); place(cx, cy - ry - 4, 0);
    const side = cx > innerWidth / 2 ? -1 : 1;
    cap.textContent = (p.hold ? "Your turn: " : "") + p.caption + (p.exact ? "" : " (around here)");
    cap.style.left = `${Math.max(8, Math.min(innerWidth - 320, side > 0 ? cx + rx + 12 : cx - rx - 12 - 300))}px`;
    cap.style.top = `${Math.max(8, Math.min(innerHeight - 60, cy - 18))}px`;
    cap.classList.add("on");
    // A ring that waits for the person's click stays until they click, press Do it for me, or close it.
    if (!p.hold) timer = setTimeout(clear, 10_000);
  };
  if (reduced) { land(); return; }
  const dx = cx - p.from.x, dy = cy - p.from.y, dist = Math.hypot(dx, dy), dur = flightMs(dist);
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
  clearTimeout(timer);
  svg.querySelectorAll("path").forEach((a) => a.remove());
  const ring = svg.querySelector("ellipse");
  if (ring) { ring.setAttribute("stroke", "#1e8a4c"); ring.setAttribute("stroke-dasharray", ""); ring.classList.remove("ring"); }
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


// Draw it for me: the diagram as plain boxes and arrows on a soft dark card, the broken place in red with a short reason,
// a one line caption under it. Boxes appear in order, then the arrows (none of that with reduced motion). It leaves by itself.
type Laid = { nodes: { id: string; label: string; x: number; y: number; w: number; h: number; broken: boolean }[]; edges: { from: string; to: string; label?: string; points: [number, number][]; broken: boolean }[]; width: number; height: number; caption: string; reason: string };
const RED = "#e5484d";
function drawDiagram(d: Laid, dockX: number) {
  clear();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad = 22, titleH = 0, below = 74;
  const W = d.width + pad * 2, H = d.height + pad * 2 + below + titleH;
  const away = dockX > innerWidth / 2 ? -1 : 1;
  const left = Math.max(12, Math.min(innerWidth - W - 12, innerWidth / 2 - W / 2 + away * 60)), top = Math.max(12, Math.min(innerHeight - H - 12, innerHeight * 0.28));
  const g = el("g", { transform: `translate(${left} ${top})` });
  svg.appendChild(g);
  g.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, rx: 16, fill: "#14161b", opacity: 0.94, stroke: "#2c2f36", "stroke-width": 1 }));
  const body = el("g", { transform: `translate(${pad} ${pad})` });
  g.appendChild(body);
  const stage: SVGElement[][] = [[], []];
  for (const e of d.edges) {
    const [a, b] = e.points, col = e.broken ? RED : "#8e8e93";
    const line = el("g", {});
    line.appendChild(el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, "stroke-width": e.broken ? 4 : 2.5, "stroke-linecap": "round", ...(e.broken ? { "stroke-dasharray": "7 5" } : {}) }));
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    line.appendChild(el("path", { d: "M0 0 L-11 -6 L-11 6 Z", fill: col, transform: `translate(${b[0]} ${b[1]}) rotate(${(ang * 180) / Math.PI})` }));
    if (e.broken) { line.appendChild(el("circle", { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, r: 11, fill: RED })); const x = el("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 + 5, "text-anchor": "middle", fill: "#fff", "font-size": 15, "font-weight": 800, "font-family": "-apple-system,sans-serif" }); x.textContent = "!"; line.appendChild(x); }
    if (e.label) {
      // The words sit above the arrow and are cut to fit the gap between the two boxes, so they are never hidden behind one.
      const fit = Math.max(6, Math.floor(Math.abs(b[0] - a[0]) / 6.6));
      const t = el("text", { x: (a[0] + b[0]) / 2, y: Math.min(a[1], b[1]) - 12, "text-anchor": "middle", fill: "#b4b4b9", "font-size": 11.5, "font-family": "-apple-system,sans-serif" });
      t.textContent = e.label.length > fit ? e.label.slice(0, fit - 1) + "…" : e.label; line.appendChild(t);
    }
    body.appendChild(line); stage[1].push(line);
  }
  for (const n of d.nodes) {
    const box = el("g", {});
    box.appendChild(el("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 10, fill: n.broken ? "#3a1a1c" : "#1f232a", stroke: n.broken ? RED : "#3a3f48", "stroke-width": n.broken ? 3 : 1.5 }));
    const t = el("text", { x: n.x + n.w / 2, y: n.y + n.h / 2 + 5, "text-anchor": "middle", fill: "#f2f2f2", "font-size": 14, "font-weight": 600, "font-family": "-apple-system,sans-serif" });
    t.textContent = n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label; box.appendChild(t);
    body.appendChild(box); stage[0].push(box);
  }
  const reason = el("text", { x: pad, y: d.height + pad * 2 + 16, fill: "#ff8a8d", "font-size": 14, "font-weight": 700, "font-family": "-apple-system,sans-serif" }); reason.textContent = d.reason; g.appendChild(reason);
  const cap = el("text", { x: pad, y: d.height + pad * 2 + 40, fill: "#d6d6da", "font-size": 13, "font-family": "-apple-system,sans-serif" }); cap.textContent = d.caption; g.appendChild(cap);
  if (!reduced) {
    for (const [i, group] of stage.entries()) group.forEach((x, k) => { x.setAttribute("opacity", "0"); x.style.transition = "opacity .35s"; setTimeout(() => x.setAttribute("opacity", "1"), 120 + i * 450 + k * 160); });
  }
  timer = setTimeout(() => { g.style.transition = "opacity .5s"; g.style.opacity = "0"; setTimeout(clear, 600); }, 15_000);
}
void listen("overlay-diagram", (e) => { const p = e.payload as { diagram: Laid; dockX: number }; drawDiagram(p.diagram, p.dockX); });
