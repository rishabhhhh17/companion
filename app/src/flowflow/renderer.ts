// The three.js side: scene, camera, the water material, the eyes and the drops. It only draws what the engine's snapshot says.
// If WebGL cannot start, create() returns null and the caller keeps the picture poses (the reduced fallback).
import {
  BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Points, Scene, ShaderMaterial,
  SphereGeometry, Vector4, WebGLRenderer, CustomBlending, OneFactor, OneMinusSrcAlphaFactor,
} from "three";
import { bodyGeometry, surfacePoint } from "./body.ts";
import type { Snapshot } from "./engine.ts";
import { MAX_DROPLETS } from "./particles.ts";
import { BODY_FRAGMENT, BODY_VERTEX, DROP_FRAGMENT, DROP_VERTEX } from "./shaders.ts";

/** The frame's height in world units: the body is about 1.7 of it at rest, so it fills most of the canvas. */
export const FRAME_HEIGHT = 2.2;
/** The unit sphere is shown at this size: its widest part is then about 0.84 either side of its centre, so it fits the frame with room to stretch. */
export const BODY_SCALE = 0.72;
/** Lifts or drops the body so its whole shape (from the flat base to the top) sits in the middle of the frame. */
const REST_Y = -0.15;
// The colours: aqua at the top of the water, ocean blue below.
const AQUA = new Color("#6fe3ff"), OCEAN = new Color("#1d72d8");

export class FlowflowRenderer {
  private gl: WebGLRenderer; private scene = new Scene(); private cam: OrthographicCamera;
  private body: Mesh; private bodyMat: ShaderMaterial;
  private eyes = new Group(); private eyeParts: { sclera: Mesh; pupil: Mesh; glint: Mesh; side: number }[] = [];
  private dropGeo = new BufferGeometry(); private dropMat: ShaderMaterial; private drops: Points;
  private dropPos = new Float32Array(MAX_DROPLETS * 3); private dropSize = new Float32Array(MAX_DROPLETS);
  private ripple = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
  private eyeGeo = new SphereGeometry(1, 20, 14);
  private tmp: [number, number, number] = [0, 0, 0];
  private disposed = false;
  halfW = 1.6; halfH = FRAME_HEIGHT / 2;
  private cssW = 0; private cssH = 0;

  /** Starts the renderer, or returns null when WebGL is not available (no throw: the caller falls back). */
  static create(canvas: HTMLCanvasElement): FlowflowRenderer | null {
    try { return new FlowflowRenderer(canvas); } catch { return null; }
  }

  private constructor(canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power", depth: false, stencil: false });
    if (!this.gl.getContext()) throw new Error("no webgl");
    this.gl.setClearColor(0x000000, 0);
    this.cam = new OrthographicCamera(-1.6, 1.6, FRAME_HEIGHT / 2, -FRAME_HEIGHT / 2, 0.1, 10); this.cam.position.z = 5;
    this.bodyMat = new ShaderMaterial({
      vertexShader: BODY_VERTEX, fragmentShader: BODY_FRAGMENT, transparent: true, depthWrite: false, depthTest: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, // premultiplied alpha
      uniforms: {
        uTime: { value: 0 }, uShape: { value: [0, 0, 0] }, uMove: { value: new Vector4(0, 0, 0, 0) }, uWobble: { value: new Vector4() }, uContact: { value: new Vector4() },
        uRipple: { value: this.ripple }, uRippleGain: { value: 1 }, uNoise: { value: 0.035 },
        uCloud: { value: 0 }, uGlow: { value: 0 }, uClarity: { value: 0.5 }, uRefract: { value: 0.5 }, uRough: { value: 0.1 }, uColA: { value: AQUA }, uColB: { value: OCEAN },
      },
    });
    this.body = new Mesh(bodyGeometry(), this.bodyMat); this.body.frustumCulled = false; this.body.scale.setScalar(BODY_SCALE); this.scene.add(this.body);
    // Eyes: a white of the eye, a dark pupil and a tiny light, for each side. Drawn over the water.
    const eyeGeo = this.eyeGeo;
    for (const side of [-1, 1]) {
      const sclera = new Mesh(eyeGeo, new MeshBasicMaterial({ color: 0xf4fbff, transparent: true, depthTest: false }));
      const pupil = new Mesh(eyeGeo, new MeshBasicMaterial({ color: 0x0b2a55, transparent: true, depthTest: false }));
      const glint = new Mesh(eyeGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }));
      for (const m of [sclera, pupil, glint]) { m.renderOrder = 3; m.frustumCulled = false; }
      pupil.renderOrder = 4; glint.renderOrder = 5;
      const g = new Group(); g.add(sclera, pupil, glint); this.eyes.add(g); this.eyeParts.push({ sclera, pupil, glint, side });
    }
    this.scene.add(this.eyes);
    // Droplets: round soft points, drawn with the same premultiplied blend.
    this.dropGeo.setAttribute("position", new BufferAttribute(this.dropPos, 3)); this.dropGeo.setAttribute("aSize", new BufferAttribute(this.dropSize, 1));
    this.dropMat = new ShaderMaterial({
      vertexShader: DROP_VERTEX, fragmentShader: DROP_FRAGMENT, transparent: true, depthWrite: false, depthTest: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, uniforms: { uPixels: { value: 60 }, uColA: { value: AQUA } },
    });
    this.drops = new Points(this.dropGeo, this.dropMat); this.drops.frustumCulled = false; this.scene.add(this.drops);
  }

  /** The water's colours (M19, the water colour in Settings): its light and its deep. */
  setColours(light: string, deep: string): void {
    this.bodyMat.uniforms.uColA.value = new Color(light); this.bodyMat.uniforms.uColB.value = new Color(deep);
    this.dropMat.uniforms.uColA.value = new Color(light);
  }

  /** The canvas's size in CSS pixels, and the screen's pixel ratio (it can change when the window moves between screens). */
  setSize(cssW: number, cssH: number, dpr: number): void {
    if (this.disposed || !(cssW > 0) || !(cssH > 0)) return;
    this.cssW = cssW; this.cssH = cssH;
    this.gl.setPixelRatio(Math.min(2, Math.max(1, dpr || 1))); this.gl.setSize(cssW, cssH, false);
    this.halfH = FRAME_HEIGHT / 2; this.halfW = this.halfH * (cssW / cssH);
    this.cam.left = -this.halfW; this.cam.right = this.halfW; this.cam.top = this.halfH; this.cam.bottom = -this.halfH; this.cam.updateProjectionMatrix();
    (this.dropMat.uniforms.uPixels as { value: number }).value = (cssH / FRAME_HEIGHT) * this.gl.getPixelRatio();
  }
  get size(): { w: number; h: number } { return { w: this.cssW, h: this.cssH }; }

  /** World units of a point in the canvas (CSS pixels from its top left). */
  toWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px / Math.max(1, this.cssW) - 0.5) * 2 * this.halfW, y: (0.5 - py / Math.max(1, this.cssH)) * 2 * this.halfH };
  }

  /** Draw one frame of the snapshot. */
  render(s: Snapshot): void {
    if (this.disposed) return;
    const { pose, look, tuning } = s, u = this.bodyMat.uniforms;
    const cx = pose.x, cy = pose.y + s.float + REST_Y;
    this.body.position.set(cx, cy, 0);
    u.uTime.value = s.time;
    u.uShape.value = [pose.breath, look.expand, pose.squash];
    (u.uMove.value as Vector4).set(pose.dirX, pose.dirY, pose.stretch, pose.lean);
    (u.uWobble.value as Vector4).set(pose.wobble2 * look.wobbleGain, pose.wobble3 * look.wobbleGain, 0.6, 1.9);
    (u.uContact.value as Vector4).set(pose.contactX / BODY_SCALE, (pose.contactY - REST_Y) / BODY_SCALE, pose.contact, 0);
    s.ripples.fill(this.rippleData);
    for (let i = 0; i < 4; i++) this.ripple[i].set((this.rippleData[i * 4] - pose.x) / BODY_SCALE, (this.rippleData[i * 4 + 1] - pose.y - REST_Y) / BODY_SCALE, this.rippleData[i * 4 + 2], this.rippleData[i * 4 + 3]);
    u.uRippleGain.value = tuning.ripple * look.rippleGain;
    u.uCloud.value = look.cloud; u.uGlow.value = look.glow; u.uClarity.value = tuning.clarity;
    u.uNoise.value = 0.03 * (1 - 0.5 * look.cloud);
    this.placeEyes(s, cx, cy);
    for (let i = 0; i < MAX_DROPLETS; i++) { this.dropPos[i * 3] = s.droplets.x[i]; this.dropPos[i * 3 + 1] = s.droplets.y[i]; this.dropPos[i * 3 + 2] = 0; this.dropSize[i] = s.droplets.size[i]; }
    this.dropGeo.attributes.position.needsUpdate = true; this.dropGeo.attributes.aSize.needsUpdate = true;
    this.gl.render(this.scene, this.cam);
  }
  private rippleData = new Float32Array(16);

  private placeEyes(s: Snapshot, cx: number, cy: number): void {
    const { pose, look, eyes } = s;
    for (const e of this.eyeParts) {
      const gx = e.side < 0 ? eyes.lx : eyes.rx, gy = e.side < 0 ? eyes.ly : eyes.ry;
      // The eye sits on the front of the body at a fixed spot of the sphere, so it rides wherever the body is bent.
      const sx = e.side * 0.36, sy = 0.2, sz = Math.sqrt(Math.max(0.05, 1 - sx * sx - sy * sy));
      const p = surfacePoint(sx, sy, sz, pose, pose.breath, look.expand, this.tmp);
      const open = Math.max(0, eyes.open), w = 0.205 * BODY_SCALE, h = 0.24 * BODY_SCALE * Math.max(0.07, open);
      const group = e.sclera.parent!; group.position.set(cx + p[0] * BODY_SCALE, cy + p[1] * BODY_SCALE, 1);
      e.sclera.scale.set(w, h, 0.05);
      const shut = open < 0.14;   // closed: a thin dark line
      (e.sclera.material as MeshBasicMaterial).color.set(shut ? 0x0b2a55 : 0xf4fbff);
      const pr = 0.115 * BODY_SCALE, travel = 0.075 * BODY_SCALE;
      e.pupil.visible = !shut; e.glint.visible = !shut;
      e.pupil.position.set(gx * travel, gy * travel * 1.1, 0.02); e.pupil.scale.set(pr, pr * Math.min(1, open * 1.1 + 0.1), 0.05);
      e.glint.position.set(gx * travel + 0.04 * BODY_SCALE, gy * travel * 1.1 + 0.045 * BODY_SCALE, 0.04); e.glint.scale.set(0.032 * BODY_SCALE, 0.032 * BODY_SCALE, 0.03);
    }
  }

  /** Release the GPU and the canvas context. */
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.body.geometry.dispose(); this.bodyMat.dispose(); this.dropGeo.dispose(); this.dropMat.dispose();
    this.eyeGeo.dispose();
    for (const e of this.eyeParts) { (e.sclera.material as MeshBasicMaterial).dispose(); (e.pupil.material as MeshBasicMaterial).dispose(); (e.glint.material as MeshBasicMaterial).dispose(); }
    this.gl.dispose(); this.gl.forceContextLoss();
  }
}
