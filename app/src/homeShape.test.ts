// Home grows out of the notch as one black shape (M66 Part 2 step 1): the geometry, the state machine and the timings.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  HEADROOM, NUDGE_H, NUDGE_W, OPEN_R, OVERLAP, REST_R, SEAM, SHOULDER_OPEN, SHOULDER_REST, bodyHeight, contentAtMs, foldMs, geomFrom, homeNext,
  islandHideAtMs, islandPanelAtMs, isOut, outline, pieceSizes, shapeRects, shapeTransforms, springMs, type HomeEvent, type HomeGeom, type HomePhase,
} from "./homeShape.ts";
import { NOTCH, OPEN_H_DELAY_MS } from "./islandSpring.ts";
import { DUR, EASE_OUT, EXIT_MS, bezierAt, springPath, springLinear } from "./motionTokens.ts";
import { TOKENS_CSS } from "./ui/cssFiles.ts";

// The 14 inch MacBook Pro: a 185 by 32 notch, the wide Home (688 by 480), the window as island.rs home_panel makes it.
const mbp14: HomeGeom = { kind: "notch", pw: 688 + 2 * HEADROOM, ph: 32 + 480 + HEADROOM, cx: 344 + HEADROOM, rest: { w: 185, h: 32 }, band: { w: 265, h: 32 }, body: { w: 688, minH: 480, maxH: 480, top: 32 } };
// A Mac without a notch: the 72 point pill hanging from the top of a 24 point menu bar, the tall Home (640, 300 to 640).
const air: HomeGeom = { kind: "pill", pw: 640 + 2 * HEADROOM, ph: 24 + 640 + HEADROOM, cx: 320 + HEADROOM, rest: { w: 72, h: 20 }, band: { w: 152, h: 24 }, body: { w: 640, minH: 300, maxH: 640, top: 24 } };
const edge: HomeGeom = { ...air, kind: "edge", rest: { w: 72, h: 5 }, band: { w: 152, h: 5 }, body: { ...air.body, top: 5 } };
const free: HomeGeom = { kind: "free", pw: 688 + 2 * HEADROOM, ph: 480 + 2 * HEADROOM, cx: 344 + HEADROOM, rest: { w: 0, h: 0 }, band: { w: 0, h: 0 }, body: { w: 688, minH: 480, maxH: 480, top: HEADROOM } };
const within = (r: number[], w: number, h: number) => r[0] >= -0.01 && r[1] >= -0.01 && r[0] + r[2] <= w + 0.01 && r[1] + r[3] <= h + 0.01;

describe("the shape's geometry", () => {
  test("at rest it is exactly the notch, with the hardware's corner", () => {
    for (const g of [mbp14, air]) {
      const r = shapeRects(g, { phase: "closed", hover: false, bodyH: 0 });
      expect(r.band[2]).toBe(g.rest.w);
      const rr = Math.min(REST_R, g.rest.h / 2);   // the hardware's 11, or half a 20 point pill
      expect(r.body).toEqual([g.cx - g.rest.w / 2, g.rest.h - rr, g.rest.w, rr]);
      expect(r.body[1] + r.body[3]).toBe(g.rest.h);   // its bottom is the notch's bottom
    }
    expect(outline(mbp14, { phase: "closed", hover: false, bodyH: 0 }).r).toBe(REST_R);
    {
    }
    // The thin line on the top edge: a corner no bigger than half its height.
    expect(outline(edge, { phase: "closed", hover: false, bodyH: 0 }).r).toBe(2.5);
  });
  test("under the pointer it grows a little at once, around the same middle", () => {
    const a = outline(mbp14, { phase: "closed", hover: false, bodyH: 0 }), b = outline(mbp14, { phase: "closed", hover: true, bodyH: 0 });
    expect(b.w - a.w).toBe(NUDGE_W);
    expect((b.top + b.r) - (a.top + a.r)).toBe(NUDGE_H);
    expect([NUDGE_W, NUDGE_H]).toEqual([6, 2]);
  });
  test("open: the band stays in the menu bar row at the wings' width, and the body hangs under the menu bar line", () => {
    const r = shapeRects(mbp14, { phase: "open", hover: false, bodyH: 480 });
    expect(r.band).toEqual([mbp14.cx - 132.5, 0, 265, 32]);
    expect(r.body).toEqual([mbp14.cx - 344, 32, 688, 480]);
    // The window holds the open shape and its overshoot: HEADROOM each side and below.
    expect(within([r.body[0] - HEADROOM, 0, r.body[2] + 2 * HEADROOM, r.body[1] + r.body[3] + HEADROOM], mbp14.pw, mbp14.ph)).toBe(true);
    // An overshoot of four percent on the width still fits.
    expect(688 * 0.04 / 2).toBeLessThan(HEADROOM);
  });
  test("the corners and shoulders grow with the same motion, never a step", () => {
    const c = outline(mbp14, { phase: "closed", hover: false, bodyH: 0 }), o = outline(mbp14, { phase: "open", hover: false, bodyH: 480 });
    expect([c.r, o.r]).toEqual([REST_R, OPEN_R]);
    expect([c.sTop, o.sTop]).toEqual([SHOULDER_REST, SHOULDER_OPEN]);
    expect([c.sJoin, o.sJoin]).toEqual([0, SHOULDER_OPEN]);
    // The radii are uniform scales of a round piece, so they never stretch: each corner's scale is the same on x and y.
    const t = shapeTransforms(mbp14, { phase: "closed", hover: false, bodyH: 0 });
    expect(t.cornerL).toMatch(/scale\(0\.458\)$/);
    expect(t.topR).toMatch(/scale\(0\.5\)$/);
  });
  test("the tall Home's body follows its content between its least and its tallest", () => {
    expect([bodyHeight(air, 100), bodyHeight(air, 420), bodyHeight(air, 9999), bodyHeight(air, NaN)]).toEqual([300, 420, 640, 300]);
    expect(shapeRects(air, { phase: "open", hover: false, bodyH: 420 }).body[3]).toBe(420);
  });
  test("every piece is laid out at its largest and only ever scaled down", () => {
    for (const g of [mbp14, air, edge]) for (const phase of ["closed", "open"] as HomePhase[]) for (const hover of [false, true]) {
      const t = shapeTransforms(g, { phase, hover, bodyH: g.body.maxH });
      for (const [k, v] of Object.entries(t)) {
        if (typeof v !== "string") continue;
        for (const m of v.matchAll(/scale\(([\d.]+)(?:, ([\d.]+))?\)/g)) for (const x of [m[1], m[2]].filter(Boolean)) expect(Number(x), `${g.kind} ${phase} ${k}`).toBeLessThanOrEqual(1.0001);
      }
    }
    expect(pieceSizes(mbp14).mid).toEqual({ w: 688, h: 480 - OPEN_R });
  });
  test("without an island to grow from, the body only fades and settles in where it is", () => {
    const a = shapeTransforms(free, { phase: "closed", hover: false, bodyH: 480 }), b = shapeTransforms(free, { phase: "open", hover: false, bodyH: 480 });
    expect(a.band).toBe("scale(0)");
    expect([a.midX, a.midY, a.footY]).toEqual([b.midX, b.midY, b.footY]);
    expect([a.contentOpacity, b.contentOpacity]).toEqual([0, 1]);
  });
  test("the shell's payload is checked, and nonsense keeps what the page had", () => {
    expect(geomFrom(mbp14)).toEqual(mbp14);
    expect(geomFrom(free)).toEqual(free);
    expect(geomFrom(null)).toBeNull();
    expect(geomFrom({ ...mbp14, kind: "cloud" })).toBeNull();
    expect(geomFrom({ ...mbp14, pw: -1 })).toBeNull();
    expect(geomFrom({ ...mbp14, rest: { w: 0, h: 32 } })).toBeNull();
    expect(geomFrom({ ...mbp14, body: { ...mbp14.body, minH: 900 } })).toBeNull();
  });
});

describe("Home's state", () => {
  const run = (from: HomePhase, evs: HomeEvent[]) => evs.reduce(homeNext, from);
  test("open, settle, close, fold", () => {
    expect(run("closed", ["open"])).toBe("opening");
    expect(run("closed", ["open", "shown"])).toBe("open");
    expect(run("closed", ["open", "shown", "close"])).toBe("closing");
    expect(run("closed", ["open", "shown", "close", "folded"])).toBe("closed");
  });
  test("an open during a close starts again from where the shape is; a late fold never closes a reopened Home", () => {
    expect(run("closing", ["open"])).toBe("opening");
    expect(run("closing", ["open", "folded"])).toBe("opening");
    expect(run("open", ["open"])).toBe("open");
    expect(run("opening", ["close"])).toBe("closing");
  });
  test("a close or a fold with Home already closed changes nothing; Stop everything closes at once from anywhere", () => {
    expect(run("closed", ["close", "folded", "shown"])).toBe("closed");
    for (const p of ["closed", "opening", "open", "closing"] as HomePhase[]) expect(homeNext(p, "stop")).toBe("closed");
  });
  test("flipping open and closed twenty times always ends where the last word said", () => {
    let p: HomePhase = "closed";
    for (let i = 0; i < 20; i++) p = homeNext(p, i % 2 ? "close" : "open");
    expect(p).toBe("closing");
    expect(isOut(homeNext(p, "open"))).toBe(true);
  });
});

describe("the timings", () => {
  test("the content arrives once the height is nearly all there, never before the shape", () => {
    const at = contentAtMs(), path = springPath(NOTCH.OPEN_H);
    expect(at).toBeGreaterThan(OPEN_H_DELAY_MS);
    expect(path[at - OPEN_H_DELAY_MS] ?? 1).toBeGreaterThan(0.98);
    expect(at).toBeLessThan(400);
  });
  // M66 step 5: the content's frame is laid out at its full height, a little higher and smaller (translateY(-6px) scale(.97)
  // from the top). At 80 percent of the height's travel its bottom row hung about 60 px below the black body.
  test("the content's bottom is inside the body the whole time it arrives", () => {
    const pH = springPath(NOTCH.OPEN_H), pW = springPath(NOTCH.OPEN_W);
    const at = (path: number[], ms: number) => (ms <= 0 ? 0 : path[Math.min(path.length - 1, Math.round(ms))]);
    for (const g of [mbp14, air]) for (const bodyH of [g.body.minH, g.body.maxH]) {
      const c = outline(g, { phase: "closed", hover: false, bodyH }), o = outline(g, { phase: "open", hover: false, bodyH });
      // The body's bottom: the foot's place (the height, OPEN_H after its delay) plus the corner's size (the width, OPEN_W).
      const bottom = (ms: number) => {
        const h = at(pH, ms - OPEN_H_DELAY_MS), w = at(pW, ms);
        return (c.top + c.hm) + h * ((o.top + o.hm) - (c.top + c.hm)) + c.r + w * (o.r - c.r);
      };
      const hy = g.body.top, hh = bodyHeight(g, bodyH);
      // The finding's own check, at the moment the content starts.
      const p = at(pH, contentAtMs() - OPEN_H_DELAY_MS);
      expect(p * (hh) + g.band.h, `${g.kind} ${bodyH}`).toBeGreaterThanOrEqual(hy - 6 + 0.97 * hh);
      // And on every millisecond of its arrival (--dur-2 on --ease-out, from a little higher and smaller).
      for (let t = 0; t <= DUR[2]; t++) {
        const q = bezierAt(EASE_OUT, t / DUR[2]);
        const frameBottom = hy - 6 * (1 - q) + hh * (0.97 + 0.03 * q);
        expect(frameBottom, `${g.kind} ${bodyH} at ${t} ms`).toBeLessThanOrEqual(bottom(contentAtMs() + t) + 0.5);
      }
    }
  });
  test("a close is said folded once the content has left and CLOSE has rested, or after the reduced motion fade", () => {
    expect(foldMs(false)).toBe(EXIT_MS.menu + springMs(NOTCH.CLOSE) + 80);
    expect(foldMs(true)).toBe(DUR[1] + 80);
    expect(springMs(NOTCH.CLOSE)).toBeLessThan(800);
  });
  test("tokens.css carries each curve and its length, generated from the springs here", () => {
    const tokens = TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
    const raw = (name: string) => new RegExp(`${name}: ([^;]+);`).exec(tokens)?.[1]?.trim();
    for (const [name, css] of [["hover", "HOVER"], ["open-w", "OPEN_W"], ["open-h", "OPEN_H"], ["close", "CLOSE"], ["work", "WORK"]] as const) {
      expect(raw(`--ease-notch-${name}`), name).toBe(springLinear(NOTCH[css], 40));
      expect(raw(`--dur-notch-${name}`), name).toBe(`${springMs(NOTCH[css])}ms`);
    }
    expect(raw("--seq-notch-height-at")).toBe(`${OPEN_H_DELAY_MS}ms`);
    expect(raw("--seq-notch-content-at")).toBe(`${contentAtMs()}ms`);
    expect(raw("--seq-island-panel-at")).toBe(`${islandPanelAtMs()}ms`);
    expect(raw("--seq-island-hide-at")).toBe(`${islandHideAtMs()}ms`);
  });
  test("the island's hover panel waits for its shape: WORK is 92 percent there; the island hides once OPEN_W is 99 percent there", () => {
    const work = springPath(NOTCH.WORK), w = springPath(NOTCH.OPEN_W);
    // M70 step 4: at 80 percent the panel's bottom row was cut by the shape's edge for a frame or two.
    expect(work[islandPanelAtMs()] ?? 1).toBeGreaterThan(0.91);
    expect(islandPanelAtMs()).toBeLessThan(DUR[2]);
    expect(w[islandHideAtMs()] ?? 1).toBeGreaterThan(0.985);
    expect(islandHideAtMs()).toBeLessThan(springMs(NOTCH.OPEN_W));
  });
});

describe("the page draws it from a data attribute and the shell's sizes", () => {
  const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
  const stage = readFileSync(new URL("./homeStage.tsx", import.meta.url), "utf8");
  test("the state is a React data attribute on the stage, never a class added by hand", () => {
    expect(stage).toContain("data-phase={phase}");
    expect(card).toContain("<HomeStage stage={homeStage}>");
    expect(card).not.toContain('classList.add("springing")');
    expect(card).not.toContain('classList.add("closing")');
  });
  test("Home is told which tab to show in the same update that opens it", () => {
    const at = card.indexOf('listen("opened"');
    const body = card.slice(at, card.indexOf('listen("closed"', at));
    expect(body.indexOf('homeDispatch({ type: "opened"')).toBeGreaterThan(-1);
    expect(body.indexOf('homeDispatch({ type: "opened"')).toBeLessThan(body.indexOf("stageOpen.current("));
  });
  const css = readFileSync(new URL("./ui/homeShape.css", import.meta.url), "utf8");
  test("M66 step 5: there is only one black shape; the content's frame has no fill or foot of its own", () => {
    expect(css).toMatch(/\.home-stage\[data-told\] \.home-frame \{[^}]*background: transparent; border-radius: 0;/);
    expect(css).not.toMatch(/\.home-stage\[data-told\] \.home-frame \{[^}]*background: var\(--notch\)/);
    // Before the measures come (or if they were lost), a closed Home draws nothing over the screen.
    expect(css).toContain('.home-stage:not([data-told]):is([data-phase="closed"], [data-phase="closing"]) .home-frame { visibility: hidden; }');
  });
  test("M66 step 5: the content arrives on --dur-2 once the shape is there, and leaves first and fast; the shape waits for it", () => {
    expect(css).toContain('.home-stage[data-told]:is([data-phase="opening"], [data-phase="open"]) .home-frame { transition: opacity var(--dur-2) var(--ease-out) var(--seq-notch-content-at), transform var(--dur-2) var(--ease-out) var(--seq-notch-content-at); }');
    expect(css).toMatch(/\.home-stage\[data-told\] \.home-frame \{[^}]*transition: opacity var\(--dur-exit-menu\) linear, transform var\(--dur-exit-menu\) var\(--ease-exit\); \}/);
    expect(css).toContain('.home-stage[data-phase="closing"] :is(.hs > i, .hs > span, .hs > span > i) { transition-delay: var(--dur-exit-menu); }');
    // The pieces stay drawn until the delayed fold has ended.
    expect(css).toContain(".home-stage .hs { position: absolute; inset: 0; pointer-events: none; visibility: hidden; transition: visibility 0s linear calc(var(--dur-exit-menu) + var(--dur-notch-close)); }");
  });
  test("M66 step 5: the foot overlaps the middle by a point, so no hairline shows between them while the height moves", () => {
    expect(SEAM).toBe(1);
    expect(css).toContain(".hs-foot-y > i { box-shadow: 0 -1px 0 var(--notch); }");
    // The foot's bottom, its pieces and the shape's rects are unchanged: only a point of black reaches up into the middle.
    expect(pieceSizes(mbp14).strip.h).toBe(OPEN_R);
    expect(shapeRects(mbp14, { phase: "open", hover: false, bodyH: 480 }).body).toEqual([mbp14.cx - 344, 32, 688, 480]);
    // The overlap is scaled with the foot's corner: a whole point once the corner is open (it runs on OPEN_W, ahead of the
    // height), a little less in the first frames of the height's motion.
    const open = shapeTransforms(mbp14, { phase: "open", hover: false, bodyH: 480 });
    expect(open.strip).toMatch(/scale\([\d.]+, 1\)$/);
    expect(open.cornerL).toMatch(/scale\(1\)$/);
  });
  test("M66 step 6 (F18): once open, a new content height or width takes the shape at once, in step with the content's frame", () => {
    // The frame (--hh, --hw) changes in one frame; the shape must too, or content is drawn over the desktop while the body
    // glides, and Home would resize with motion, which F18 rules out. Only the opening grows.
    expect(css).toContain('.home-stage[data-phase="open"] :is(.hs > i, .hs > span, .hs > span > i) { transition: none; }');
    expect(css).not.toMatch(/\[data-phase="open"\] \.hs > span \{ transition: transform/);
    expect(css).not.toMatch(/:is\(\[data-phase="opening"\], \[data-phase="open"\]\) \.hs > i/);
    expect(css).toContain('.home-stage[data-phase="opening"] .hs > i, .home-stage[data-phase="opening"] .hs > span > i { transition: transform var(--dur-notch-open-w) var(--ease-notch-open-w); }');
  });
  test("M66 step 5: the island hides once Home's band is all but out, never while Home's band is narrower", () => {
    expect(css).toContain(".island[data-home] .island-shape { visibility: hidden; transition: visibility 0s linear var(--seq-island-hide-at); }");
  });
  test("a close ends on the page's own transitionend, with a timer only as a backstop, and the shell is told", () => {
    expect(stage).toContain('invoke("home_folded")');
    expect(stage).toContain("foldMs(reducedMotion())");
    expect(stage).toContain("onTransitionEnd={onEnd}");
  });
});

// M70 step 4: Home growing on from the small panel, and the one shape without seams.
describe("growing on from the small panel (M70 step 4)", () => {
  const from = { w: 400, h: 32 + 88 };
  const pW = springPath(NOTCH.OPEN_W);
  const at = (path: number[], ms: number) => (ms <= 0 ? 0 : path[Math.min(path.length - 1, Math.round(ms))]);
  test("the band never narrows while the shape opens from the panel, then the notch and its wings once open", () => {
    for (const g of [mbp14, air]) {
      const c = outline(g, { phase: "closed", hover: false, bodyH: 480, from }), o = outline(g, { phase: "opening", hover: false, bodyH: 480, from });
      expect(o.bw, g.kind).toBeGreaterThanOrEqual(c.bw);
      // Each piece of the band moves from one to the other on one curve, so with an end no narrower, no frame is narrower.
      for (let ms = 0; ms <= 600; ms += 4) { const w = c.bw + at(pW, ms) * (o.bw - c.bw); expect(w).toBeGreaterThanOrEqual(c.bw - 0.001); }
      expect(outline(g, { phase: "open", hover: false, bodyH: 480, from }).bw).toBe(g.band.w);
      // From the bare notch, as before.
      expect(outline(g, { phase: "opening", hover: false, bodyH: 480 }).bw).toBe(g.band.w);
    }
    const css = readFileSync(new URL("./ui/homeShape.css", import.meta.url), "utf8");
    expect(css).toContain('.home-stage[data-phase="open"][data-from] :is(.hs-band, .hs-top, .hs-join) { transition: transform var(--dur-notch-close) var(--ease-notch-close); }');
  });
  test("the island's words fade out as Home's shape covers them, and Home's arrive as before: no clip, no repaint", () => {
    const css = readFileSync(new URL("./ui/homeShape.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain("clip-path");
    const notch = readFileSync(new URL("./ui/notch.css", import.meta.url), "utf8");
    expect(notch).toContain(".island[data-home] .island-panel[data-shown] { opacity: 0; scale: 1; transition: opacity var(--dur-exit-menu) linear calc(var(--seq-island-hide-at) - var(--dur-exit-menu)); }");
    expect(islandHideAtMs()).toBeGreaterThan(EXIT_MS.menu);
  });
  test("pieces that meet overlap by a point where both are black: the strip under the corners, the shoulders toward the band", () => {
    expect(OVERLAP).toBe(1);
    const t = shapeTransforms(mbp14, { phase: "open", hover: false, bodyH: 480 });
    // The strip starts a point inside the left corner and is two points wider than the gap between the corners.
    expect(t.strip).toBe(`translate(${-(344 - OPEN_R) - 1}px, 0px) scale(1, 1)`);
    expect(t.topL.startsWith(`translate(${-132.5 - SHOULDER_OPEN + 1}px, 0px)`)).toBe(true);
    expect(t.topR.startsWith(`translate(${132.5 - 1}px, 0px)`)).toBe(true);
    // Collapsed on the panel there are no shoulders, so nothing moves out past the panel's side.
    const p = shapeTransforms(mbp14, { phase: "closed", hover: false, bodyH: 480, from });
    expect(p.topL).toMatch(/scale\(0\)$/);
  });
});

describe("White Home is readable on the black shape (M70 step 4)", () => {
  test("in the White look Home's page has its own fill inside the shape, with the shape's round foot", () => {
    const css = readFileSync(new URL("./ui/homeShape.css", import.meta.url), "utf8");
    expect(css).toContain(':root[data-theme="paper"] .home-stage[data-told] .home-frame > .card.home { background: var(--bg); border-radius: 0 0 24px 24px; }');
    expect(OPEN_R).toBe(24);
  });
});
