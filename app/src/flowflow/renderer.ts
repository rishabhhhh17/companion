// The three.js side: scene, camera, the water material, the eyes and the drops. It only draws what the engine's snapshot says.
// If WebGL cannot start, create() returns null and the caller keeps the picture poses (the reduced fallback).
import {
  BufferAttribute, BufferGeometry, Color, Mesh, OrthographicCamera, PlaneGeometry, Points, Scene, ShaderMaterial,
  Vector4, WebGLRenderer, CustomBlending, OneFactor, OneMinusSrcAlphaFactor,
} from "three";
import type { Snapshot } from "./engine.ts";
import { MAX_DROPLETS } from "./particles.ts";
import { MAX_STRETCH } from "./physics.ts";
import { BODY_FRAGMENT, BODY_VERTEX, DROP_FRAGMENT, DROP_VERTEX } from "./shaders.ts";

/** The frame's height in world units: the body is about 1.7 of it at rest, so it fills most of the canvas. */
export const FRAME_HEIGHT = 2.2;
/** The drop is drawn at this size (M37): its widest part is then about 0.69 either side of its centre and it stands about
 *  1.5 tall, so it fits the frame with room to lean and settle. */
export const BODY_SCALE = 0.8;
/** M37: how much of the physics' bend the drop shows. It leans, stretches and settles like liquid; it never wobbles into lumps. */
const BEND = { stretch: 0.5, squash: 0.6, lean: 0.7 };   // M37b: more give, now that it pours like liquid (shaders.ts drop)
/** Lifts or drops the body so its whole shape (from the flat base to the top) sits in the middle of the frame. */
const REST_Y = -0.15;
// The colours: aqua at the top of the water, ocean blue below.
const AQUA = new Color("#6fe3ff"), OCEAN = new Color("#1d72d8");
/** M37: the drop's shader writes colour straight out, so it is given the colours as written (sRGB), not three.js's linear copy. */
const asWritten = (c: Color): Color => c.clone().convertLinearToSRGB();

export class FlowflowRenderer {
  private gl: WebGLRenderer; private scene = new Scene(); private cam: OrthographicCamera;
  private body: Mesh; private bodyMat: ShaderMaterial; private quad = new PlaneGeometry(2, 2);
  private dropGeo = new BufferGeometry(); private dropMat: ShaderMaterial; private drops: Points;
  private dropPos = new Float32Array(MAX_DROPLETS * 3); private dropSize = new Float32Array(MAX_DROPLETS);
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
        uHalf: { value: [1.6, FRAME_HEIGHT / 2] }, uCenter: { value: [0, 0] }, uScale: { value: BODY_SCALE }, uPx: { value: 0.01 },
        uPose: { value: new Vector4() }, uMove: { value: [1, 0, 0] }, uEyes: { value: new Vector4() }, uOpen: { value: 1 },
        uCloud: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uPour: { value: 0 }, uColA: { value: asWritten(AQUA) }, uColB: { value: asWritten(OCEAN) },
      },
    });
    // One quad over the whole canvas: the drop and its eyes are worked out per pixel (shaders.ts).
    this.body = new Mesh(this.quad, this.bodyMat); this.body.frustumCulled = false; this.scene.add(this.body);
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
    this.bodyMat.uniforms.uColA.value = asWritten(new Color(light)); this.bodyMat.uniforms.uColB.value = asWritten(new Color(deep));
    this.dropMat.uniforms.uColA.value = new Color(light);
  }

  /** The canvas's size in CSS pixels, and the screen's pixel ratio (it can change when the window moves between screens). */
  setSize(cssW: number, cssH: number, dpr: number): void {
    if (this.disposed || !(cssW > 0) || !(cssH > 0)) return;
    this.cssW = cssW; this.cssH = cssH;
    this.gl.setPixelRatio(Math.min(3, Math.max(2, dpr || 1)));   // M29: always at least 2x, so the water is crisp, never soft
    this.gl.setSize(cssW, cssH, false);   // M37: this call had slipped into the comment above, so the canvas was drawn small and stretched
    this.halfH = FRAME_HEIGHT / 2; this.halfW = this.halfH * (cssW / cssH);
    this.cam.left = -this.halfW; this.cam.right = this.halfW; this.cam.top = this.halfH; this.cam.bottom = -this.halfH; this.cam.updateProjectionMatrix();
    (this.dropMat.uniforms.uPixels as { value: number }).value = (cssH / FRAME_HEIGHT) * this.gl.getPixelRatio();
    const u = this.bodyMat.uniforms;
    u.uHalf.value = [this.halfW, this.halfH];
    u.uPx.value = (2 * this.halfH) / (cssH * this.gl.getPixelRatio()) / BODY_SCALE;
  }
  get size(): { w: number; h: number } { return { w: this.cssW, h: this.cssH }; }

  /** World units of a point in the canvas (CSS pixels from its top left). */
  toWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px / Math.max(1, this.cssW) - 0.5) * 2 * this.halfW, y: (0.5 - py / Math.max(1, this.cssH)) * 2 * this.halfH };
  }

  /** Draw one frame of the snapshot. */
  render(s: Snapshot): void {
    if (this.disposed) return;
    const { pose, look, eyes } = s, u = this.bodyMat.uniforms;
    u.uCenter.value = [pose.x, pose.y + s.float + REST_Y];
    u.uTime.value = s.time;
    (u.uPose.value as Vector4).set(pose.breath, pose.squash * BEND.squash, pose.lean * BEND.lean, look.expand);
    u.uMove.value = [pose.dirX, pose.dirY, pose.stretch * BEND.stretch];
    u.uPour.value = Math.min(1, Math.max(0, pose.stretch / MAX_STRETCH));   // M37b: the tail grows with how far it stretches
    (u.uEyes.value as Vector4).set(eyes.lx, eyes.ly, eyes.rx, eyes.ry);
    u.uOpen.value = Math.max(0, eyes.open);
    u.uCloud.value = look.cloud; u.uGlow.value = look.glow;
    for (let i = 0; i < MAX_DROPLETS; i++) { this.dropPos[i * 3] = s.droplets.x[i]; this.dropPos[i * 3 + 1] = s.droplets.y[i]; this.dropPos[i * 3 + 2] = 0; this.dropSize[i] = s.droplets.size[i]; }
    this.dropGeo.attributes.position.needsUpdate = true; this.dropGeo.attributes.aSize.needsUpdate = true;
    this.gl.render(this.scene, this.cam);
  }

  /** Release the GPU and the canvas context. */
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.quad.dispose(); this.bodyMat.dispose(); this.dropGeo.dispose(); this.dropMat.dispose();
    this.gl.dispose(); this.gl.forceContextLoss();
  }
}
