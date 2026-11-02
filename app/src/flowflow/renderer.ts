// The three.js side: scene, camera, the water material, the eyes and the drops. It only draws what the engine's snapshot says.
// If WebGL cannot start, create() returns null and the caller keeps the picture poses (the reduced fallback).
import {
  BufferAttribute, BufferGeometry, Color, Mesh, OrthographicCamera, PlaneGeometry, Points, Scene, ShaderMaterial,
  Vector4, WebGLRenderer, CustomBlending, OneFactor, OneMinusSrcAlphaFactor,
} from "three";
import type { Liveliness } from "../lookfeel.ts";
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
/** Which way each surface lies from the drop (y up). */
const SIDE_NORMAL = { left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1], below: [0, -1] } as const;

export class FlowflowRenderer {
  private gl: WebGLRenderer; private scene = new Scene(); private cam: OrthographicCamera;
  private body: Mesh; private bodyMat: ShaderMaterial; private quad = new PlaneGeometry(2, 2);
  private dropGeo = new BufferGeometry(); private dropMat: ShaderMaterial; private drops: Points;
  private dropPos = new Float32Array(MAX_DROPLETS * 3); private dropSize = new Float32Array(MAX_DROPLETS);
  private disposed = false;
  halfW = 1.6; halfH = FRAME_HEIGHT / 2;
  private cssW = 0; private cssH = 0;
  /** M46: Gentle draws at most at 2x, to stay inside its battery budget ([verify] on a real Mac). */
  private gentle = false;

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
        uCloud: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uPour: { value: 0 }, uSurf: { value: new Vector4() }, uPress: { value: 0 }, uColA: { value: asWritten(AQUA) }, uColB: { value: asWritten(OCEAN) },
        uSway: { value: 0 }, uSwayTime: { value: 0 }, uAmber: { value: 0 }, uEnvBase: { value: new Color(0, 0, 0) },
      },
    });
    // One quad over the whole canvas: the drop and its eyes are worked out per pixel (shaders.ts).
    this.body = new Mesh(this.quad, this.bodyMat); this.body.frustumCulled = false; this.scene.add(this.body);
    // Droplets: round soft points, drawn with the same premultiplied blend.
    this.dropGeo.setAttribute("position", new BufferAttribute(this.dropPos, 3)); this.dropGeo.setAttribute("aSize", new BufferAttribute(this.dropSize, 1));
    this.dropMat = new ShaderMaterial({
      vertexShader: DROP_VERTEX, fragmentShader: DROP_FRAGMENT, transparent: true, depthWrite: false, depthTest: false,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, uniforms: { uPixels: { value: 60 }, uColA: { value: asWritten(AQUA) } },   // M46: as written, like the body
    });
    this.drops = new Points(this.dropGeo, this.dropMat); this.drops.frustumCulled = false; this.scene.add(this.drops);
  }

  /** The water's colours (M19, the water colour in Settings): its light and its deep. */
  setColours(light: string, deep: string): void {
    this.bodyMat.uniforms.uColA.value = asWritten(new Color(light)); this.bodyMat.uniforms.uColB.value = asWritten(new Color(deep));
    this.dropMat.uniforms.uColA.value = asWritten(new Color(light));
  }
  /** The page's sky behind the drop (--pond), so the rim reflects it (the audit, item 30). A colour three.js cannot read
   *  keeps the last one. */
  setEnvBase(css: string): void {
    const v = css.trim(); if (!v) return;
    try { this.bodyMat.uniforms.uEnvBase.value = asWritten(new Color(v)); } catch { /* not a colour three.js reads */ }
  }
  /** M46: the liveliness chosen (Gentle caps the pixel ratio). The caller measures again after a change. */
  setMode(m: Liveliness): void { this.gentle = m === "gentle"; }

  /** The canvas's size in CSS pixels, and the screen's pixel ratio (it can change when the window moves between screens). */
  setSize(cssW: number, cssH: number, dpr: number): void {
    if (this.disposed || !(cssW > 0) || !(cssH > 0)) return;
    this.cssW = cssW; this.cssH = cssH;
    this.gl.setPixelRatio(Math.min(this.gentle ? 2 : 3, Math.max(2, dpr || 1)));   // M29: always at least 2x, so the water is crisp, never soft
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
    // M46: the resting sway (point, side waves, base) only as much as the choice and the moment allow, on its own clock.
    u.uSway.value = s.sway; u.uSwayTime.value = s.swayTime;
    // Needs you: an amber core that pulses three times, then holds.
    u.uAmber.value = look.amber;
    (u.uPose.value as Vector4).set(pose.breath, pose.squash * BEND.squash, pose.lean * BEND.lean, look.expand + 0.03 * s.pulse);
    u.uMove.value = [pose.dirX, pose.dirY, pose.stretch * BEND.stretch];
    u.uPour.value = Math.min(1, Math.max(0, pose.stretch / MAX_STRETCH));   // M37b: the tail grows with how far it stretches
    (u.uEyes.value as Vector4).set(eyes.lx, eyes.ly, eyes.rx, eyes.ry);
    u.uOpen.value = Math.max(0, eyes.open);
    u.uCloud.value = look.cloud; u.uGlow.value = look.glow + 0.5 * s.pulse;
    // M37c: the surface it clings to, as a plane in the drop's own units (shaders.ts drop).
    const sf = s.surface, sv = u.uSurf.value as Vector4;
    if (!sf.side) sv.set(0, 0, 0, 0);
    else {
      const [nx, ny] = SIDE_NORMAL[sf.side];
      const cx = pose.x, cy = pose.y + s.float + REST_Y;
      // `at`: where the surface is across the canvas (from its left for a side, from its top otherwise), 0 to 1 or past it.
      const x = (sf.at - 0.5) * 2 * this.halfW, y = this.halfH - sf.at * 2 * this.halfH;
      const plane = nx !== 0 ? nx * x : ny * y;
      sv.set(nx, ny, (plane - (cx * nx + cy * ny)) / BODY_SCALE, sf.cling);
    }
    u.uPress.value = sf.press;
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
