// The drop that follows the pointer (M20, Follow my pointer: A drop of water; the shell's follow.rs moves its window). It
// only listens: the shell sends how fast the drop goes and which water it is, and the drop stretches along the way it goes
// (water.ts stretch) in the water's colours (lookfeel.ts). No pointer, screen or keys reach this page.
import { listen } from "./tauri.ts";
import { WATER_TINTS, waterOf } from "./lookfeel.ts";
import { followLessMotion } from "./motion.ts";

/** How the drop looks at a speed (points a second). M29 (the founder: "I don't want bulgy water"): it keeps its crisp
 *  droplet shape at every speed, never squashed or stretched; moving fast it only turns so its point trails behind. */
export function dropLook(vx: number, vy: number): { angle: number; sx: number; sy: number } {
  const v = Number.isFinite(vx) && Number.isFinite(vy) ? Math.hypot(vx, vy) : 0;
  if (v < 250) return { angle: 0, sx: 1, sy: 1 };
  // The drop is drawn pointing up; turn it so it streams behind the way it moves.
  return { angle: (Math.atan2(vy, vx) * 180) / Math.PI - 90, sx: 1, sy: 1 };
}

const el = typeof document === "undefined" ? null : document.getElementById("d");
if (el) {
  followLessMotion();
  void listen("follow-move", (e) => {
    const p = (e.payload ?? {}) as { vx?: number; vy?: number; water?: unknown };
    const l = dropLook(Number(p.vx), Number(p.vy)), t = WATER_TINTS[waterOf(p.water)];
    const st = (document.documentElement as HTMLElement).style;
    st.setProperty("--a", `${l.angle}deg`); st.setProperty("--sx", String(l.sx)); st.setProperty("--sy", String(l.sy));
    st.setProperty("--mid", t.mid); st.setProperty("--deep", t.deep);
  });
}
