// The pointer: an arrow that flies from the character to the target, then a pulsing ring and a short caption.
// Plain page, no framework, no input: the panel it sits in ignores the mouse and never takes the keyboard.
import { listen } from "./tauri.ts";
import { burst, flightMs } from "./pointer.ts";

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
