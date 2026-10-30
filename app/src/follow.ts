// The water ring around the pointer (M37, the founder, 30 Oct 2026: "a water ring would be really cool that follows the
// pointer… make sure it is nice"). It replaces M20's trailing drop. A ring of Flowflow's water sits centred on the pointer's
// tip, open in the middle so it never covers what you point at. The shell's follow.rs moves its window with the pointer,
// with no spring, so it never trails; this page only draws: the ring stretches a little along the way it moves and small
// waves run round it, in the water colour chosen in Settings. No pointer, screen or keys reach this page, only how fast the
// ring moves and which water it is. M46 (F28): it draws only while the shell shows it (follow-show), nothing at all once it
// is put away (follow-hide), and outside Lively its small waves hold still (only the voice ripples it), so at rest it
// schedules nothing.
import { listen } from "./tauri.ts";
import { WATER_TINTS, waterOf } from "./lookfeel.ts";
import { followLessMotion, reducedMotion } from "./motion.ts";

/** How much the ring stretches at a speed (points a second): none when slow, gently more when fast, never more than a
 *  third, so it always reads as a ring. Zero for anything that is not a number. */
export function ringStretch(vx: number, vy: number): { x: number; y: number } {
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return { x: 0, y: 0 };
  const v = Math.hypot(vx, vy);
  if (v < 60) return { x: 0, y: 0 };
  const k = Math.min(0.35, v / 4000) / v;
  return { x: vx * k, y: -vy * k };   // the page's y points up
}

/** M39 (Wispr Flow and HeyClicky make listening visible where you look): how much the ring answers the voice now, from
 *  the microphone's level. Up fast as you speak, down gently between words, so it breathes with the voice, never flickers.
 *  A quiet room stays near still (below 0.02 counts as silence). */
export function voiceEnvelope(prev: number, level: number, dt: number): number {
  const target = Number.isFinite(level) ? Math.min(1, Math.max(0, (level - 0.02) * 2.2)) : 0;
  const k = 1 - Math.exp(-Math.max(0, dt) * (target > prev ? 28 : 7));
  return prev + (target - prev) * k;
}

/** "#59D2FF" as three numbers from 0 to 1. */
export const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] : [0.35, 0.82, 1];
};

/** At rest in Lively, one frame every this many milliseconds (20 a second): the waves still move, the GPU mostly sleeps. */
export const RESTING_FRAME_MS = 50;

/** M46: what the ring page does next. Hidden: nothing. Moving, pulsing or hearing a voice: the next refresh. At rest: in
 *  Lively a slow timer for its small waves; otherwise nothing (its waves hold still, so there is nothing new to draw). With
 *  Reduce motion or Less motion it is drawn still, a few times a second. */
export type RingNext = { kind: "none" } | { kind: "frame" } | { kind: "timer"; ms: number };
export function ringNext(o: { shown: boolean; reduced: boolean; lively: boolean; moving: boolean; pulsing: boolean; voice: boolean }): RingNext {
  if (!o.shown) return { kind: "none" };
  if (o.reduced) return o.lively ? { kind: "timer", ms: 250 } : { kind: "none" };
  if (o.moving || o.pulsing || o.voice) return { kind: "frame" };
  return o.lively ? { kind: "timer", ms: RESTING_FRAME_MS } : { kind: "none" };
}

export const RING_VERTEX = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
export const RING_FRAGMENT = `
precision highp float;
uniform vec2 uRes; uniform float uT; uniform float uW; uniform vec2 uVel; uniform float uPulse; uniform float uVoice; uniform vec3 uA, uB;
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xy) - t.x, p.z); return length(q) - t.y; }
float ring(vec3 p){
  float sp = length(uVel); vec2 d = sp > 1e-4 ? uVel / sp : vec2(1.0, 0.0);
  float along = dot(p.xy, d); vec2 perp = p.xy - along * d;
  p.xy = along * d / (1.0 + sp) + perp * (1.0 + 0.5 * sp);
  float a = atan(p.y, p.x);
  float wave = 0.005 * sin(a * 3.0 + uW * 2.6) + 0.0035 * sin(a * 5.0 - uW * 3.4) + 0.028 * sp * sin(a * 2.0 + uT * 6.0);   // small waves (on uW, still outside Lively): it stays a round ring
  wave += uVoice * (0.018 * sin(a * 6.0 - uT * 9.0) + 0.01 * sin(a * 9.0 + uT * 13.0));   // M39: speaking, the water ripples with the voice
  float tube = 0.06 + 0.01 * sin(a * 4.0 - uW * 2.0) + 0.015 * uPulse + 0.02 * uVoice;   // M41: finer (the founder: "the ring needs to be smaller")
  return sdTorus(p, vec2(0.34 + 0.04 * uPulse + wave, tube));
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.001, 0.0); return normalize(vec3(ring(p+e.xyy)-ring(p-e.xyy), ring(p+e.yxy)-ring(p-e.yxy), ring(p+e.yyx)-ring(p-e.yyx))); }
float box(vec3 d, vec3 c, vec2 sz, float soft){ vec3 z = normalize(c); vec3 x = normalize(cross(vec3(0.0,1.0,0.0), z)); vec3 y = cross(z, x);
  float t = dot(d, z); if (t <= 0.0) return 0.0; vec2 q = vec2(dot(d, x), dot(d, y)) / t; vec2 a = abs(q) - sz; return 1.0 - smoothstep(-soft, soft, max(a.x, a.y)); }
vec3 env(vec3 d){
  vec3 c = vec3(0.012, 0.013, 0.016) + vec3(0.04) * smoothstep(-0.2, 0.9, d.y);
  c += vec3(1.0) * 3.2 * box(d, vec3(-0.55, 0.75, 0.55), vec2(0.42, 0.30), 0.05);
  c += vec3(0.92, 0.96, 1.0) * 2.2 * box(d, vec3(0.95, 0.15, 0.25), vec2(0.04, 0.55), 0.015);
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, 2.4), rd = normalize(vec3(uv * 0.75, -1.0));
  float t = 0.0, mind = 1e9, tBest = 0.0;
  for (int i = 0; i < 64; i++){ float d = ring(ro + rd*t); if (d < mind) { mind = d; tBest = t; } if (d < 0.0005) break; t += d; if (t > 5.0) break; }
  float cover = 1.0 - smoothstep(0.0, 1.6 / uRes.y, mind);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 p = ro + rd*tBest, n = nrm(p), v = -rd, r = reflect(rd, n);
  float ndv = clamp(dot(n, v), 0.0, 1.0), fres = pow(1.0 - ndv, 4.0);
  vec3 rf = refract(rd, n, 0.75);
  vec3 inside = mix(uB * 1.1, uA * 1.05, smoothstep(-0.7, 0.7, p.y + rf.y * 0.5)) + env(rf) * 0.25;
  inside += uA * 0.8 * pow(1.0 - ndv, 2.2);
  vec3 col = mix(inside, env(r), 0.05 + 0.85 * fres);
  col += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.55, 0.75, 0.55))), 0.0), 90.0) * 3.0;
  col += uA * 0.35 * uVoice;   // and glows a little while it listens
  col = col / (1.0 + col * 0.18);
  gl_FragColor = vec4(col * cover, cover);
}`;

const cv = typeof document === "undefined" ? null : (document.getElementById("d") as HTMLCanvasElement | null);
if (cv) {
  followLessMotion();
  const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  let vel = { x: 0, y: 0 }, aim = { x: 0, y: 0 }, pulse = 0, voice = 0, heard: number | null = null, colours: [number[], number[]] = [rgb(WATER_TINTS.ocean.mid), rgb(WATER_TINTS.ocean.deep)];
  // M46: nothing is drawn until the shell shows the ring, and only Lively keeps its small waves moving at rest.
  let shown = false, lively = false;
  const still = () => reducedMotion() || document.documentElement.hasAttribute("data-less-motion");
  let raf = 0, timer: number | null = null;
  const halt = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (timer !== null) { window.clearTimeout(timer); timer = null; } };
  let wake = (): void => {};
  if (gl) {
    const sh = (kind: number, src: string) => { const o = gl.createShader(kind)!; gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, RING_VERTEX)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, RING_FRAGMENT)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(pr, n);
    gl.uniform2f(u("uRes"), cv.width, cv.height);
    const t0 = performance.now(); let last = t0, waves = 0;
    const frame = (now: number) => {
      raf = 0; timer = null;
      if (!shown) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const k = 1 - Math.exp(-dt * 14);   // the stretch eases in and out; the ring's place itself never lags
      vel = { x: vel.x + (aim.x - vel.x) * k, y: vel.y + (aim.y - vel.y) * k };
      pulse *= Math.exp(-dt * 5);
      voice = voiceEnvelope(voice, heard ?? 0, dt);
      const calm = still();
      if (lively && !calm) waves += dt;   // the small waves' own clock: it stands still outside Lively
      gl.uniform1f(u("uT"), calm ? 0 : (now - t0) / 1000); gl.uniform1f(u("uW"), waves); gl.uniform2f(u("uVel"), calm ? 0 : vel.x, calm ? 0 : vel.y); gl.uniform1f(u("uPulse"), calm ? 0 : pulse); gl.uniform1f(u("uVoice"), calm ? 0 : voice);
      gl.uniform3fv(u("uA"), colours[0]); gl.uniform3fv(u("uB"), colours[1]);
      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      next();
    };
    // With Reduce motion or Less motion the ring is drawn still. Battery: every refresh only while it moves, pulses or
    // hears a voice; at rest in Lively its small waves need no more than 20 frames a second; otherwise nothing at all.
    const next = (): void => {
      const reduced = still();
      const n = ringNext({ shown, reduced, lively, moving: Math.hypot(vel.x, vel.y) >= 0.002 || Math.hypot(aim.x, aim.y) >= 0.002, pulsing: pulse >= 0.01, voice: heard !== null || voice >= 0.01 });
      if (n.kind === "frame" && !reduced) raf = requestAnimationFrame(frame);
      else if (n.kind === "timer") timer = window.setTimeout(() => frame(performance.now()), n.ms);
    };
    // Something changed (it showed, moved, heard a voice, or has a line to say): draw now, then carry on by next().
    wake = () => {
      if (!shown || raf) return;
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
      const reduced = still();
      if (reduced) { frame(performance.now()); return; }   // drawn still, at once
      raf = requestAnimationFrame(frame);
    };
  }
  const livelyOf = (p: { lively?: unknown }) => { if (p.lively !== undefined) lively = p.lively === "lively"; };
  // M46: the shell put the ring away: nothing is scheduled, nothing drawn, until it shows again.
  void listen("follow-hide", () => { shown = false; halt(); });
  void listen("follow-show", (e) => {
    const p = (e.payload ?? {}) as { water?: unknown; lively?: unknown };
    const t = WATER_TINTS[waterOf(p.water)];
    colours = [rgb(t.mid), rgb(t.deep)]; livelyOf(p);
    shown = true; wake();
  });
  void listen("follow-move", (e) => {
    const p = (e.payload ?? {}) as { vx?: number; vy?: number; water?: unknown; lively?: unknown };
    aim = ringStretch(Number(p.vx), Number(p.vy));
    const t = WATER_TINTS[waterOf(p.water)];
    colours = [rgb(t.mid), rgb(t.deep)]; livelyOf(p);
    wake();
  });
  // M39: while a voice key is held, how loud the microphone is (only a number; null when it closes).
  void listen("follow-voice", (e) => { const l = (e.payload as { level?: unknown } | null)?.level; heard = typeof l === "number" && Number.isFinite(l) ? l : null; wake(); });
  // M33: a short line beside the pointer (the shell widens the window to the right for it). The ring pulses once as it shows.
  const say = document.getElementById("say");
  void listen("follow-say", (e) => {
    const text = String((e.payload as { text?: unknown } | null)?.text ?? "");
    if (say) say.textContent = text;
    if (text) { document.documentElement.setAttribute("data-saying", ""); pulse = 1; } else document.documentElement.removeAttribute("data-saying");
    wake();
  });
}
