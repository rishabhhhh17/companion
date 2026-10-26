// The thin part: owns the canvas, the WebGL program and the pose textures, and runs the frame loop over a FlowState
// (physics.ts). It decides nothing about motion. If WebGL is not there, a shader will not build or the context is lost,
// it says so and the dock goes back to the plain picture (useFlow.ts). No network: the pictures are the app's own files.
import { skinColor, type Skin, type SkinMotion } from "../skins.ts";
import { FlowState, frameGap, type Motion } from "./physics.ts";
import { FRAGMENT, INSET, MESH, VERTEX } from "./shaders.ts";

export type FlowOptions = {
  canvas: HTMLCanvasElement;
  /** Where a pose's picture is. */
  urlFor: (pose: string) => string;
  motion: SkinMotion;
  /** The page-sized canvas the droplets are drawn on (a plain 2D canvas on top, taking no clicks), and the skin they are tinted with. */
  dropCanvas?: HTMLCanvasElement | null;
  skin?: Skin;
  pose: string;
  /** The first frame is on the canvas (the plain picture can go). */
  onReady: () => void;
  /** The context was lost or something failed after the start: use the plain picture. */
  onLost: () => void;
};

type Tex = WebGLTexture;

export class FlowRenderer {
  readonly state: FlowState;
  motion: Motion = "full";
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private count = 0;
  private tex = new Map<string, Tex>();
  private loading = new Map<string, Promise<Tex | null>>();
  private wanted: string;
  private raf = 0;
  private last = 0;
  private lastDrawn = -Infinity;
  private dirty = true;
  private dead = false;
  private ready = false;
  private dpr = 0;
  private hadDrops = false;
  private onVisible = () => { if (document.hidden) this.halt(); else this.wake(); };
  private onContextLost = (e: Event) => { e.preventDefault(); this.fail(); };

  /** A renderer on this canvas, or null when WebGL cannot be had here. */
  static create(o: FlowOptions): FlowRenderer | null {
    try {
      const gl = o.canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true, depth: false, stencil: false });
      if (!gl) return null;
      const prog = build(gl);
      return prog ? new FlowRenderer(o, gl, prog) : null;
    } catch { return null; }
  }

  private constructor(private o: FlowOptions, gl: WebGLRenderingContext, prog: WebGLProgram) {
    this.gl = gl; this.prog = prog;
    this.state = new FlowState(o.motion, o.pose);
    this.wanted = o.pose;
    gl.useProgram(prog);
    for (const n of ["t", "sq", "wobble", "bob", "bobHz", "lagGain", "lag", "rip", "A", "B", "mixv", "calm", "shimmer"]) this.loc[n] = gl.getUniformLocation(prog, n);
    // The grid of points over the picture, and the triangles between them.
    const { cols, rows } = MESH, v: number[] = [], ix: number[] = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) v.push(i / cols, j / rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i; ix.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
    this.count = ix.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // the textures are premultiplied, so is the canvas
    gl.clearColor(0, 0, 0, 0);
    o.canvas.addEventListener("webglcontextlost", this.onContextLost);
    document.addEventListener("visibilitychange", this.onVisible);
    this.fit();
    void this.load(o.pose).then((t) => {
      if (this.dead) return;
      if (!t) { this.fail(); return; }
      this.wake();
    });
  }

  // ---- what the dock tells it ----

  setMotion(m: Motion): void { if (m !== this.motion) { this.motion = m; this.wake(); } }
  setState(s: string): void { this.state.setState(s); this.wake(); }

  /** The pose to show. It is loaded first if need be; only the newest request counts. */
  setPose(pose: string): void {
    this.wanted = pose;
    void this.load(pose).then((t) => {
      if (this.dead || !t || this.wanted !== pose) return;
      this.state.setPose(pose, this.motion);
      this.wake();
    });
  }

  /** A click or touch at a point of the page (client pixels). */
  poke(clientX: number, clientY: number, strength = 1): void {
    const r = this.o.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    // From the canvas to across the picture, which sits INSET in from each edge.
    const x = ((clientX - r.left) / r.width - INSET) / (1 - 2 * INSET);
    const y = ((clientY - r.top) / r.height - INSET) / (1 - 2 * INSET);
    this.state.poke(x, y, strength);
    this.wake();
  }

  /** The same, at a point across the picture (0 to 1 each way) rather than of the page. */
  touchAt(x: number, y: number, strength = 1): void { this.state.poke(x, y, strength); this.wake(); }

  /** How fast the window is moving, pixels per second. */
  velocity(vx: number, vy: number): void { this.state.setVelocity(vx, vy); this.wake(); }

  /** Droplets and a wide ripple, thrown from this point of the page. */
  big(originX: number, originY: number): void { this.state.big(this.motion, originX, originY); this.wake(); }

  dispose(): void {
    this.dead = true;
    this.halt();
    this.o.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    document.removeEventListener("visibilitychange", this.onVisible);
    try { for (const t of this.tex.values()) this.gl.deleteTexture(t); } catch { /* the context may already be gone */ }
    this.tex.clear();
  }

  // ---- the loop ----

  /** Make sure a frame is coming (a no op while one is, while the window is hidden, or after dispose). */
  wake(): void {
    this.dirty = true;
    if (this.raf || this.dead || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private halt(): void { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.dead || document.hidden) return;
    const gap = frameGap(this.state, this.motion, this.o.motion);
    // Nothing can change and nothing new was asked for: stay asleep until something calls wake().
    if (this.ready && !this.dirty && gap === Infinity) return;
    // Quiet breathing draws at the slow rate; the frames between are skipped.
    if (this.ready && !this.dirty && now - this.lastDrawn < gap * 1000 - 2) { this.raf = requestAnimationFrame(this.frame); return; }
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.state.step(dt, this.motion);
    if (this.draw()) {
      this.dirty = false;
      this.lastDrawn = now;
      if (!this.ready) { this.ready = true; this.o.onReady(); }
    }
    if (frameGap(this.state, this.motion, this.o.motion) !== Infinity || !this.ready) this.raf = requestAnimationFrame(this.frame);
  };

  // ---- drawing ----

  private fit(): void {
    const cv = this.o.canvas, dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (dpr === this.dpr && cv.width > 0) return;
    this.dpr = dpr;
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round((r.width || 156) * dpr)), h = Math.max(1, Math.round((r.height || 112) * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }

  private draw(): boolean {
    const a = this.tex.get(this.state.from), b = this.tex.get(this.state.to);
    if (!a || !b) return false;
    this.fit();
    const gl = this.gl, u = this.state.uniforms(this.motion), L = this.loc;
    gl.viewport(0, 0, this.o.canvas.width, this.o.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(L.t, u.t); gl.uniform1f(L.sq, u.sq); gl.uniform1f(L.wobble, u.wobble); gl.uniform1f(L.bob, u.bob); gl.uniform1f(L.bobHz, u.bobHz);
    gl.uniform1f(L.lagGain, this.o.motion.lagGain); gl.uniform2f(L.lag, u.lagX, u.lagY);
    gl.uniform4f(L.rip, u.rip[0], u.rip[1], u.rip[2], u.rip[3]);
    gl.uniform1f(L.mixv, u.mix); gl.uniform1f(L.calm, u.calm); gl.uniform1f(L.shimmer, u.shimmer);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a); gl.uniform1i(L.A, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b); gl.uniform1i(L.B, 1);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    this.drawDrops();
    return true;
  }

  /** The droplets, on their own 2D canvas that covers the page: a few soft round dots in the skin's hue. */
  private drawDrops(): void {
    const cv = this.o.dropCanvas, skin = this.o.skin;
    const list = this.state.drops.list;
    if (!cv || !skin || (list.length === 0 && !this.hadDrops)) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const d of list) {
      const g = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0.5, d.x, d.y, d.r);
      g.addColorStop(0, skinColor(skin, 30, d.life));
      g.addColorStop(1, skinColor(skin, 0, d.life * 0.75));
      c.fillStyle = g;
      c.beginPath(); c.arc(d.x, d.y, d.r, 0, Math.PI * 2); c.fill();
    }
    this.hadDrops = list.length > 0;
  }

  private load(pose: string): Promise<Tex | null> {
    const have = this.tex.get(pose);
    if (have) return Promise.resolve(have);
    const going = this.loading.get(pose);
    if (going) return going;
    const p = new Promise<Tex | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (this.dead) { resolve(null); return; }
        try {
          const gl = this.gl, tx = gl.createTexture();
          if (!tx) { resolve(null); return; }
          gl.bindTexture(gl.TEXTURE_2D, tx);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
          this.tex.set(pose, tx);
          resolve(tx);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = this.o.urlFor(pose);
    });
    this.loading.set(pose, p);
    return p;
  }

  private fail(): void {
    if (this.dead) return;
    this.dispose();
    this.o.onLost();
  }
}

function build(gl: WebGLRenderingContext): WebGLProgram | null {
  const sh = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = sh(gl.VERTEX_SHADER, VERTEX), fs = sh(gl.FRAGMENT_SHADER, FRAGMENT);
  const p = gl.createProgram();
  if (!vs || !fs || !p) return null;
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}
