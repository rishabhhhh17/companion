// Dev only: the real renderer frozen at chosen moments (at rest, starting to move, moving fast, turning), to judge the
// liquid look without having to catch it mid-motion. Not built into the app.
import { FlowflowRenderer } from "../src/flowflow/renderer.ts";
import { Droplets } from "../src/flowflow/particles.ts";
import { LOOKS } from "../src/flowflow/behavior.ts";
import { DEFAULT_TUNING } from "../src/flowflow/physics.ts";

const poses: [string, { dirX: number; dirY: number; stretch: number; lean: number; squash: number }][] = [
  ["rest", { dirX: 1, dirY: 0, stretch: 0, lean: 0, squash: 0 }],
  ["starts moving right", { dirX: 1, dirY: 0, stretch: 0.05, lean: -0.08, squash: 0 }],
  ["fast right", { dirX: 1, dirY: 0, stretch: 0.12, lean: -0.15, squash: 0 }],
  ["fast up-left", { dirX: -0.7, dirY: 0.7, stretch: 0.12, lean: 0.1, squash: 0 }],
  ["lands", { dirX: 0, dirY: -1, stretch: 0.0, lean: 0, squash: 0.12 }],
];
const row = document.getElementById("row")!;
for (const [name, p] of poses) {
  const fig = document.createElement("figure"); const c = document.createElement("canvas"); const cap = document.createElement("figcaption");
  cap.textContent = name; fig.append(c, cap); row.append(fig);
  const r = FlowflowRenderer.create(c)!; r.setSize(220, 220, devicePixelRatio);
  const t0 = performance.now();
  const frame = () => {
    r.render({
      pose: { x: 0, y: 0, ...p, wobble2: 0, wobble3: 0, breath: 0, contactX: 0, contactY: 0, contact: 0, speed: 0 },
      look: LOOKS.idle, eyes: { lx: 0, ly: 0, rx: 0, ry: 0, open: 1 }, state: "idle", tuning: { ...DEFAULT_TUNING }, time: (performance.now() - t0) / 1000,
      float: 0, droplets: new Droplets(), ripples: { fill() {}, alive: 0 },
    } as never);
    requestAnimationFrame(frame);
  };
  frame();
}
