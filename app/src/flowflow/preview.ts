// The dev preview (flowflow-preview.html): the character on three canvases at once (large, the dock's size and a small one),
// with the dials of the physics and the look, the states, and the real frame timing. Development only: it is not built into the app.
import { FlowflowController } from "./controller.ts";
import { DEFAULT_TUNING, TUNING_LIMITS, clampTuning, type Tuning } from "./physics.ts";
import type { CharacterState } from "../model.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvases: [string, number][] = [["big", 1], ["dock", 0.35], ["small", 0.35]];
let tuning: Tuning = { ...DEFAULT_TUNING };
const ctls: FlowflowController[] = [];
for (const [id, follow] of canvases) {
  const c = FlowflowController.create({ canvas: $(id), host: $(id).parentElement!, tuning, followRange: follow });
  if (c) ctls.push(c);
}
if (!ctls.length) $("stats").textContent = "WebGL is not available here, so the live character cannot run (the app falls back to its picture poses).";

const each = (f: (c: FlowflowController) => void) => ctls.forEach(f);
const states: [string, CharacterState][] = [["Idle", "idle"], ["Curious (listening)", "listening"], ["Working", "working"], ["Sleeping (off)", "off"]];
for (const [label, st] of states) { const b = document.createElement("button"); b.textContent = label; b.onclick = () => each((c) => c.setState(st)); $("states").append(b); }
// Success and error are one off events from the app: step away from the state first, so pressing again plays again.
for (const [label, st] of [["Success (done)", "done"], ["Error", "error"]] as [string, CharacterState][]) {
  const b = document.createElement("button"); b.textContent = label; b.onclick = () => each((c) => { c.setState("idle"); c.setState(st); }); $("states").append(b);
}
$("poke").onclick = () => each((c) => c.engine.touch(0.25, 0.15));
$("land").onclick = () => each((c) => c.engine.body.impulse("land", 1));
$("burst").onclick = () => each((c) => c.engine.body.impulse("burst", 1));

const dials = $("dials"); const outs = new Map<keyof Tuning, HTMLInputElement>();
for (const k of Object.keys(TUNING_LIMITS) as (keyof Tuning)[]) {
  const [lo, hi] = TUNING_LIMITS[k];
  const row = document.createElement("label"); const name = document.createElement("span"); name.textContent = ({ stiffness: "Stiffness", damping: "Damping", speed: "Speed", ripple: "Ripples", clarity: "Clarity" })[k];
  const r = document.createElement("input"); r.type = "range"; r.min = String(lo); r.max = String(hi); r.step = "0.01"; r.value = String(tuning[k]);
  const o = document.createElement("span"); o.textContent = tuning[k].toFixed(2);
  r.oninput = () => { tuning = clampTuning({ ...tuning, [k]: Number(r.value) }); o.textContent = tuning[k].toFixed(2); each((c) => c.setTuning(tuning)); };
  outs.set(k, r); row.append(name, r, o); dials.append(row);
}
$("reset").onclick = () => { tuning = { ...DEFAULT_TUNING }; for (const [k, r] of outs) { r.value = String(tuning[k]); (r.nextElementSibling as HTMLElement).textContent = tuning[k].toFixed(2); } each((c) => c.setTuning(tuning)); };
$("copy").onclick = () => { const t = JSON.stringify(tuning); void navigator.clipboard?.writeText(t); $("copy").textContent = "Copied"; setTimeout(() => ($("copy").textContent = "Copy values"), 1200); };
document.querySelectorAll<HTMLElement>("[data-bg]").forEach((b) => (b.onclick = () => { document.body.className = b.dataset.bg === "dark" ? "" : b.dataset.bg!; }));
($("reduced") as HTMLInputElement).onchange = (e) => each((c) => c.setReduced((e.target as HTMLInputElement).checked));

setInterval(() => {
  if (!ctls.length) return;
  const s = ctls[0].stats(), e = ctls[0].engine;
  $("stats").textContent = `measured here, on this screen: ${s.fps.toFixed(0)} frames a second over the last ${s.frames} drawn (a frame every ${s.intervalMs.toFixed(1)} ms; drawing one costs ${s.renderMs.toFixed(2)} ms of this page's time)\nstate: ${e.behavior.state}   drops alive: ${e.droplets.alive}   ripples alive: ${e.ripples.alive}   settled: ${e.body.settled}\n(the rate drops by design when it is idle or asleep: it spends little when nothing happens)`;
}, 500);
window.addEventListener("pagehide", () => each((c) => c.dispose()));
