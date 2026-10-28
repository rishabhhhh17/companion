// Tiny droplets that leave the body, arc and come back to merge, and ripples that spread from a touch. Fixed pools of numbers:
// nothing is created or thrown away while it runs, and there is a hard cap on how many can exist at once.
export const MAX_DROPLETS = 8;
export const MAX_RIPPLES = 4;
const GRAVITY = 2.6;
const RIPPLE_SECONDS = 2.2;

export class Droplets {
  readonly x = new Float32Array(MAX_DROPLETS); readonly y = new Float32Array(MAX_DROPLETS);
  private vx = new Float32Array(MAX_DROPLETS); private vy = new Float32Array(MAX_DROPLETS);
  private age = new Float32Array(MAX_DROPLETS); private life = new Float32Array(MAX_DROPLETS);
  readonly size = new Float32Array(MAX_DROPLETS);
  private base = new Float32Array(MAX_DROPLETS);
  private next = 0;

  get alive(): number { let n = 0; for (let i = 0; i < MAX_DROPLETS; i++) if (this.life[i] > 0) n++; return n; }

  emit(x: number, y: number, vx: number, vy: number, size = 0.06): void {
    // A free slot if there is one, else the oldest drop is reused: the cap is never passed.
    let i = -1; for (let k = 0; k < MAX_DROPLETS; k++) if (this.life[k] <= 0) { i = k; break; }
    if (i < 0) { i = this.next; this.next = (this.next + 1) % MAX_DROPLETS; }
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.age[i] = 0; this.life[i] = 1.25; this.base[i] = size; this.size[i] = size;
  }

  /** Arc under gravity; in the last part of its life a drop is pulled back toward the body and shrinks into it (cx, cy). */
  update(dt: number, cx: number, cy: number): void {
    if (!(dt > 0)) return;
    for (let i = 0; i < MAX_DROPLETS; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.life[i] = 0; this.size[i] = 0; continue; }
      this.vy[i] -= GRAVITY * dt;
      if (t > 0.5) { const pull = (t - 0.5) * 14; this.vx[i] += (cx - this.x[i]) * pull * dt; this.vy[i] += (cy - this.y[i]) * pull * dt; this.vx[i] *= 1 - 3 * dt; this.vy[i] *= 1 - 3 * dt; }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.size[i] = this.base[i] * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
    }
  }
}

export class Ripples {
  private px = new Float32Array(MAX_RIPPLES); private py = new Float32Array(MAX_RIPPLES);
  private age = new Float32Array(MAX_RIPPLES).fill(RIPPLE_SECONDS); private amp = new Float32Array(MAX_RIPPLES);
  private next = 0;
  get alive(): number { let n = 0; for (let i = 0; i < MAX_RIPPLES; i++) if (this.age[i] < RIPPLE_SECONDS) n++; return n; }
  add(x: number, y: number, amp: number): void {
    if (!(amp > 0)) return;
    let i = -1; for (let k = 0; k < MAX_RIPPLES; k++) if (this.age[k] >= RIPPLE_SECONDS) { i = k; break; }
    if (i < 0) { i = this.next; this.next = (this.next + 1) % MAX_RIPPLES; }
    this.px[i] = x; this.py[i] = y; this.age[i] = 0; this.amp[i] = Math.min(2, amp);
  }
  update(dt: number): void { if (!(dt > 0)) return; for (let i = 0; i < MAX_RIPPLES; i++) if (this.age[i] < RIPPLE_SECONDS) this.age[i] += dt; }
  /** Four numbers per ripple for the shader: x, y, age (seconds) and strength (0 once it has died). */
  fill(out: Float32Array): void {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const live = this.age[i] < RIPPLE_SECONDS;
      out[i * 4] = this.px[i]; out[i * 4 + 1] = this.py[i]; out[i * 4 + 2] = this.age[i];
      out[i * 4 + 3] = live ? this.amp[i] * (1 - this.age[i] / RIPPLE_SECONDS) : 0;
    }
  }
}
