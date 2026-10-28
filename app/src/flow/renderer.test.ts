// The thin renderer, tested without a screen: it falls back (returns null or says so) when WebGL is not there, a shader does
// not build or the context is lost, it stops asking for frames while the window is hidden, and with less motion it draws a
// still picture once and then sleeps. A fake context stands in for WebGL, so these check the loop and the fallbacks, not how
// the water looks (that needs a real Mac).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { WATER } from "../skins.ts";
import { FlowRenderer } from "./renderer.ts";

const g = globalThis as Record<string, unknown>;
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** A fake WebGL context: every call works and returns something, and shaders and programs report success unless told not to. */
function fakeGl(opts: { compiles?: boolean } = {}) {
  const calls: string[] = [];
  const gl = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => {
      if (name === "getShaderParameter") return () => opts.compiles !== false;
      if (name === "getProgramParameter") return () => opts.compiles !== false;
      if (name === "getAttribLocation") return () => 0;
      return (...a: unknown[]) => { calls.push(name); return a.length >= 0 ? {} : undefined; };
    },
  });
  return { gl: gl as unknown as WebGLRenderingContext, calls };
}
function fakeCanvas(gl: unknown) {
  const listeners = new Map<string, (e: Event) => void>();
  const asked: unknown[] = [];
  const canvas = {
    width: 0, height: 0,
    getContext: (_k: string, o?: unknown) => { asked.push(o); return gl as never; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 156, height: 111 }),
    addEventListener: (n: string, f: (e: Event) => void) => { listeners.set(n, f); },
    removeEventListener: (n: string) => { listeners.delete(n); },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, listeners, asked };
}

// A frame loop we drive by hand.
let pending: ((t: number) => void) | null = null, canceled = 0, hidden = false, visHandler: (() => void) | null = null, now = 0;
beforeEach(() => {
  pending = null; canceled = 0; hidden = false; visHandler = null; now = 0;
  g.requestAnimationFrame = (f: (t: number) => void) => { pending = f; return 1; };
  g.cancelAnimationFrame = () => { pending = null; canceled++; };
  g.document = { get hidden() { return hidden; }, addEventListener: (_n: string, f: () => void) => { visHandler = f; }, removeEventListener: () => { visHandler = null; } };
  g.window = { devicePixelRatio: 2 };
  g.Image = class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_v: string) { setTimeout(() => this.onload?.(), 0); } };
  g.performance = { now: () => now };
});
afterEach(() => { delete g.requestAnimationFrame; delete g.cancelAnimationFrame; delete g.document; delete g.window; delete g.Image; });

const make = (gl: unknown, over: { onReady?: () => void; onLost?: () => void } = {}) => {
  const c = fakeCanvas(gl);
  const r = FlowRenderer.create({ canvas: c.canvas, urlFor: (p) => `./x/${p}.png`, motion: WATER.motion, pose: "look", onReady: over.onReady ?? (() => {}), onLost: over.onLost ?? (() => {}) });
  return { r, ...c };
};
const tick = (ms: number) => { now += ms; const f = pending; pending = null; f?.(now); };
const loaded = () => new Promise((r) => setTimeout(r, 5));

describe("when WebGL is not there, the dock keeps the plain picture", () => {
  test("no context: no renderer", () => {
    expect(make(null).r).toBeNull();
  });
  test("asking for a context throws: no renderer, no crash", () => {
    const canvas = { getContext: () => { throw new Error("no"); } } as unknown as HTMLCanvasElement;
    expect(FlowRenderer.create({ canvas, urlFor: () => "", motion: WATER.motion, pose: "look", onReady: () => {}, onLost: () => {} })).toBeNull();
  });
  test("a shader that does not build: no renderer", () => {
    expect(make(fakeGl({ compiles: false }).gl).r).toBeNull();
  });
  test("the canvas is see through and its colours are premultiplied, so it floats on the desktop", () => {
    const m = make(fakeGl().gl);
    expect(m.r).not.toBeNull();
    expect(m.asked[0]).toMatchObject({ alpha: true, premultipliedAlpha: true });
    m.r!.dispose();
  });
  test("a lost context says so once, and stops drawing", async () => {
    let lost = 0;
    const m = make(fakeGl().gl, { onLost: () => { lost++; } });
    await loaded();
    m.listeners.get("webglcontextlost")!({ preventDefault: () => {} } as Event);
    expect(lost).toBe(1);
    expect(pending).toBeNull();
    m.listeners.get("webglcontextlost")?.({ preventDefault: () => {} } as Event);
    expect(lost).toBe(1);
  });
  test("a picture that cannot be loaded says so and the dock falls back", async () => {
    g.Image = class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_v: string) { setTimeout(() => this.onerror?.(), 0); } };
    let lost = 0;
    make(fakeGl().gl, { onLost: () => { lost++; } });
    await loaded();
    expect(lost).toBe(1);
  });
});

describe("the frame loop", () => {
  test("the first frame says it is ready (the plain picture can go), once", async () => {
    let ready = 0;
    const m = make(fakeGl().gl, { onReady: () => { ready++; } });
    await loaded();
    tick(16); tick(16); tick(16);
    expect(ready).toBe(1);
    m.r!.dispose();
  });
  test("it sizes the canvas for the screen's density, up to twice", async () => {
    const m = make(fakeGl().gl);
    expect([m.canvas.width, m.canvas.height]).toEqual([312, 222]);
    m.r!.dispose();
  });
  test("full motion keeps breathing: a frame is always asked for next", async () => {
    const m = make(fakeGl().gl);
    await loaded();
    for (let i = 0; i < 10; i++) { tick(16); expect(pending, `frame ${i}`).not.toBeNull(); }
    m.r!.dispose();
  });
  test("while the window is hidden it asks for nothing, and it comes back when shown", async () => {
    const m = make(fakeGl().gl);
    await loaded();
    tick(16);
    expect(pending).not.toBeNull();
    hidden = true; visHandler!();
    expect(pending).toBeNull();
    expect(canceled).toBeGreaterThan(0);
    m.r!.poke(50, 40);   // something touches it while hidden: still no frame
    expect(pending).toBeNull();
    hidden = false; visHandler!();
    expect(pending).not.toBeNull();
    m.r!.dispose();
  });
  test("with less motion it draws the still picture once and then sleeps until something changes", async () => {
    const m = make(fakeGl().gl);
    await loaded();
    m.r!.setMotion("calm");
    for (let i = 0; i < 5; i++) tick(16);
    expect(pending, "asleep").toBeNull();
    m.r!.poke(50, 40);   // a touch does nothing with less motion, and wakes nothing that needs frames
    tick(16); tick(16);
    expect(pending).toBeNull();
    m.r!.setPose("idea");   // a plain crossfade does need frames
    await loaded();
    expect(pending).not.toBeNull();
    for (let i = 0; i < 40; i++) tick(16);
    expect(pending, "asleep again once the crossfade is over").toBeNull();
    expect(m.r!.state.visible()).toBe("idea");
    m.r!.dispose();
  });
  test("a quiet breath draws at the slow rate: frames between are skipped", async () => {
    const m = make(fakeGl().gl);
    await loaded();
    tick(16);
    for (let i = 0; i < 400; i++) tick(16);   // let any push settle
    const drawsBefore = (m.r as unknown as { lastDrawn: number }).lastDrawn;
    tick(8);
    expect((m.r as unknown as { lastDrawn: number }).lastDrawn, "too soon to draw again").toBe(drawsBefore);
    tick(40);
    expect((m.r as unknown as { lastDrawn: number }).lastDrawn).toBeGreaterThan(drawsBefore);
    m.r!.dispose();
  });
  test("disposed, it asks for nothing more", async () => {
    const m = make(fakeGl().gl);
    await loaded();
    tick(16);
    m.r!.dispose();
    expect(pending).toBeNull();
    m.r!.wake();
    expect(pending).toBeNull();
  });
});

describe("what it is allowed to do", () => {
  const src = read("./renderer.ts") + read("./useFlow.ts") + read("./shaders.ts");
  test("no network: only the app's own pictures, no fetch, no request, no address", () => {
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
  });
  test("the dock page falls back to the plain picture and keeps the picture's own rules", () => {
    const dock = read("../dock.tsx");
    expect(dock).toContain("useFlow(");
    expect(dock).toMatch(/\{!flow\.failed && <canvas ref=\{flow\.canvasRef\} className="flow" aria-hidden="true" \/>\}/);
    expect(dock).toMatch(/<img className=\{`pose\$\{flow\.ready \? " flow-ready" : ""\}`\} src=\{poseUrl\(pose\)\} alt=""/);
    // Less motion (the Mac's or this app's own Motion setting) reaches the water as calm.
    expect(dock).toContain("calm: reduced");
  });
  test("the canvas takes no clicks, so the button under it keeps the drag and the click", () => {
    const css = read("../style.css");
    expect(css).toMatch(/\.character \.flow \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.drops \{[^}]*pointer-events: none/);
  });
});
