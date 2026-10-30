// Rules about how Flowflow is built, checked on the source: no pictures in the live drawing, everything it starts is stopped,
// the preview stays out of the app, and the dock only draws it when asked.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));

describe("the live drawing", () => {
  test("uses no picture, gif or video file anywhere", () => {
    for (const f of sources) expect(read(f), f).not.toMatch(/\.(png|jpe?g|gif|webp|svg|mp4|webm)\b/i);
  });
  test("the physics, behaviour, face, particles and engine know nothing of the page or the GPU", () => {
    for (const f of ["physics.ts", "behavior.ts", "face.ts", "particles.ts", "engine.ts"]) {
      expect(read(f), f).not.toMatch(/from "three"|document\.|window\.|requestAnimationFrame|HTMLElement|WebGL/);
    }
  });
  test("makes no object per frame inside its hot paths that it could keep (no new arrays or objects in step, update or render)", () => {
    const hot = (src: string, name: string) => { const i = src.indexOf(name), j = src.indexOf("\n  }\n", i); return src.slice(i, j); };
    expect(hot(read("physics.ts"), "private step(h")).not.toMatch(/new \w+\(|\[\s*\]|\{\s*\w+:/);
    expect(hot(read("particles.ts"), "update(dt: number, cx")).not.toMatch(/new \w+\(/);
  });
});

describe("it cleans up after itself", () => {
  const c = read("controller.ts");
  test("every listener goes through the one helper that removes it again", () => {
    expect((c.match(/addEventListener\(/g) ?? []).length).toBeLessThanOrEqual(3);   // the helper itself and the media query pair
    expect(c).toContain("this.cleanups.push(() => t.removeEventListener(type, fn, o))");
  });
  test("dispose stops the loop, removes listeners and observers, and frees the GPU, once", () => {
    const d = c.slice(c.indexOf("dispose(): void"));
    for (const need of ["this.stop()", "this.cleanups", "this.ro?.disconnect()", "this.io?.disconnect()", "this.renderer.dispose()", "if (this.disposed) return"]) expect(d).toContain(need);
    expect(read("renderer.ts")).toMatch(/forceContextLoss\(\)/);
  });
  test("the loop rests when the page is hidden or the character is not on screen", () => {
    expect(c).toContain("document.hidden"); expect(c).toContain("IntersectionObserver"); expect(c).toContain("visibilitychange");
  });
  test("a long gap (a suspended page) is not simulated as time that passed", () => { expect(c).toMatch(/gap > RESUME_GAP_MS \? 0/); });
  test("the pointer is listened to, never taken: no preventDefault and no capture", () => {
    for (const line of c.split("\n").filter((l) => l.includes("preventDefault()"))) expect(line).toContain("webglcontextlost");   // the only one: keeping a lost GPU context from being dropped silently
    expect(c).not.toMatch(/setPointerCapture|stopPropagation/);
  });
});

describe("how it reaches the app", () => {
  test("the dock draws it only when character.live is on, and keeps the pictures as the fallback", () => {
    const dock = readFileSync(join(dir, "..", "dock.tsx"), "utf8");
    expect(dock).toContain('useSetting("character.live") === true'); expect(dock).toContain("liveOn && !liveFailed"); expect(dock).toContain("poseUrl(pose)");
    expect(dock).toContain('import("./flowflow/view.tsx")'); expect(dock).not.toMatch(/^import (?!type ).* from "\.\/flowflow\//m);   // loaded on demand only: nothing of it is fetched while the setting is off (a type import is erased)
  });
  test("the preview page is not part of the built app", () => {
    const vite = readFileSync(join(dir, "..", "..", "vite.config.ts"), "utf8");
    expect(vite).not.toContain("flowflow-preview");
  });
  test("a canvas that cannot start gives null instead of throwing, so the pictures stay", () => {
    expect(read("renderer.ts")).toMatch(/try \{ return new FlowflowRenderer\(canvas\); \} catch \{ return null; \}/);
    expect(read("view.tsx")).toContain("onFallback");
  });
});

// M46 (F28): the resting sway is the only motion at rest, scaled by the choice, on its own clock.
describe("how lively reaches the drawing (M46)", () => {
  test("the point sway, the side waves and the base spread all multiply uSway and run on uSwayTime", () => {
    const sh = read("shaders.ts");
    const body = sh.slice(sh.indexOf("float body(vec3 p){"), sh.indexOf("return d * 0.8;"));
    const sway = body.split("\n").filter((l) => /sways like poured liquid|slow waves running up|base spreads and gathers/.test(l));
    expect(sway.length).toBe(3);
    for (const l of sway) { expect(l).toContain("calmed * uSway"); expect(l).toContain("uSwayTime"); expect(l).not.toContain("uTime"); }
    expect(sh).toContain("uniform float uSway;"); expect(sh).toContain("uniform float uSwayTime;");
  });
  test("the renderer sets the sway from the snapshot, draws drops in the body's colour space, and caps Gentle at 2x", () => {
    const r = read("renderer.ts");
    expect(r).toContain("u.uSway.value = s.sway; u.uSwayTime.value = s.swayTime;");
    expect(r).toContain("uColA: { value: asWritten(AQUA) } }");
    expect(r).toContain("this.dropMat.uniforms.uColA.value = asWritten(new Color(light));");
    expect(r).toContain("Math.min(this.gentle ? 2 : 3,");
  });
  test("the idle tricks are gone from the engine", () => {
    const e = read("engine.ts");
    for (const gone of ["IDLE_ACTS", "HOP_EVERY", "idleLife", "pickAct", "playAct", "idleDone"]) expect(e, gone).not.toContain(gone);
  });
});

// M46: the old CSS motions are for the pictures only. The live drawing (the dock's button with data-live) never takes an
// animation or a tilt from the stylesheet: it moves itself, and holds still at rest unless Gentle or Lively is chosen.
describe("the live drawing takes no CSS motion (M46)", () => {
  const css = readFileSync(join(dir, "..", "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: { sel: string; body: string; media: string }[] = [];
  { let i = 0, media = "";
    const walk = (text: string, m: string) => { let k = 0; while (k < text.length) { const open = text.indexOf("{", k); if (open < 0) break; let depth = 0, close = open; for (; close < text.length; close++) { if (text[close] === "{") depth++; else if (text[close] === "}" && --depth === 0) break; } const head = text.slice(k, open).trim(), body = text.slice(open + 1, close); if (head.startsWith("@media")) walk(body, head); else if (!head.startsWith("@")) for (const sel of head.split(",")) rules.push({ sel: sel.trim(), body, media: m }); k = close + 1; } };
    walk(css, media); void i; }
  test("no animation or rotate rule can match .character[data-live]", () => {
    const moving = rules.filter((r) => !/prefers-reduced-motion/.test(r.media) && /^(:root\[[^\]]+\] )?\.character(?![\w-])/.test(r.sel) && !r.sel.includes(":not([data-live])")
      && (/(^|;)\s*animation(-name)?:(?!\s*none)/.test(r.body) || /(^|;)\s*rotate:(?!\s*none)/.test(r.body)));
    expect(moving.map((r) => r.sel)).toEqual([]);
  });
  test("the dock marks the live drawing, and gives it no data-motion", () => {
    const dock = readFileSync(join(dir, "..", "dock.tsx"), "utf8");
    expect(dock).toContain('data-live={live ? "on" : undefined}');
    expect(dock).toContain("data-motion={live ? undefined : motionFor(state, reduced)}");
  });
});
