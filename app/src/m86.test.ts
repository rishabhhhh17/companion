// M86: the pages' side of Watch what changed (the replay on the review card and in the notch) and Label it (labels on
// leader lines over the screen). Pure, no engine. Written before layout.ts placeLabels, labelReveal.ts and replay.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { placeLabels, labelBounds, labelSize, type PlacedLabel } from "./layout.ts";
import { labelAsk, labelledLine, revealPlan, toneColour, LABEL_GAP_MS } from "./labelReveal.ts";
import { REPLAY_BOARD, replayOf, replayScene, replayStill, replayTimes } from "./replay.ts";
import { reviewReduce } from "./review.ts";
import { rng } from "./sketch.ts";
import { S } from "./strings.ts";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: PlacedLabel, W: number, H: number) => a.x >= 0 && a.y >= 0 && a.x + a.w <= W && a.y + a.h <= H;

describe("labels never overlap each other or leave the screen (layout.ts placeLabels)", () => {
  const screen = { w: 1440, h: 900 };
  test("a lone label sits to the right of its point, on its own line", () => {
    const [p] = placeLabels([{ x: 400, y: 300 }], [{ w: 120, h: 30 }], screen);
    expect(p.side).toBe("right");
    expect(p.x).toBeGreaterThan(400);
    expect(p.y + p.h / 2).toBeCloseTo(300, 0);
    expect(p.line[0]).toEqual([400, 300]);
    expect(p.line[1][0]).toBe(p.x);   // the leader line ends on the label's near edge
  });
  test("near the right edge it goes left; near the bottom it stays on the screen", () => {
    const [r] = placeLabels([{ x: 1420, y: 300 }], [{ w: 160, h: 30 }], screen);
    expect(r.side).toBe("left");
    expect(inside(r, screen.w, screen.h)).toBe(true);
    const [b] = placeLabels([{ x: 700, y: 895 }], [{ w: 160, h: 30 }], screen);
    expect(inside(b, screen.w, screen.h)).toBe(true);
  });
  test("a label that would land on another moves the least it can, up or down before sideways, and keeps the order", () => {
    const pts = [{ x: 300, y: 300 }, { x: 302, y: 306 }];
    const [a, b] = placeLabels(pts, [{ w: 140, h: 30 }, { w: 140, h: 30 }], screen);
    expect(overlaps(a, b)).toBe(false);
    expect(a.side).toBe("right");
    // The second is moved up or down (the same column), not sent across the screen.
    expect(Math.abs(b.x - a.x)).toBeLessThan(10);
    expect(b.y).toBeGreaterThan(a.y);   // kept below the first: the order holds
  });
  test("a label never covers another label's point", () => {
    const pts = [{ x: 300, y: 300 }, { x: 380, y: 300 }];
    const placed = placeLabels(pts, [{ w: 160, h: 30 }, { w: 160, h: 30 }], screen);
    for (const [i, l] of placed.entries()) for (const [j, p] of pts.entries()) if (i !== j) expect(overlaps(l, { x: p.x - 6, y: p.y - 6, w: 12, h: 12 }), `${i} on ${j}`).toBe(false);
  });
  test("many random screens of up to 8 labels: never an overlap, always on the screen, every line from its own point", () => {
    for (let n = 0; n < 400; n++) {
      const r = rng(`case${n}`);
      const W = [1280, 1440, 1512, 1920][n % 4], H = [800, 900, 982, 1080][n % 4];
      const k = 1 + Math.floor(r() * 8);
      // Points often bunched together, as on a settings page.
      const cx = r() * W, cy = r() * H;
      const pts = Array.from({ length: k }, () => ({ x: Math.min(W - 1, Math.max(1, n % 3 ? cx + (r() - 0.5) * 300 : r() * W)), y: Math.min(H - 1, Math.max(1, n % 3 ? cy + (r() - 0.5) * 200 : r() * H)) }));
      const sizes = pts.map(() => ({ w: 80 + Math.round(r() * 160), h: r() > 0.5 ? 30 : 50 }));
      const placed = placeLabels(pts, sizes, { w: W, h: H });
      expect(placed.length).toBe(k);
      for (const [i, a] of placed.entries()) {
        expect(inside(a, W, H), `case ${n} label ${i}`).toBe(true);
        expect(a.line[0]).toEqual([pts[i].x, pts[i].y]);
        for (const b of placed.slice(i + 1)) expect(overlaps(a, b), `case ${n}`).toBe(false);
      }
    }
  });
  test("with the thing's own box: the dot sits on its edge, the label past it, and no label covers any labelled thing", () => {
    // The fixture settings page (labels.png): the endpoint address, the signing secret, Test mode and the Reveal button.
    const things = [
      { x: 470, y: 262, box: { x: 284, y: 252, w: 290, h: 20 } }, { x: 360, y: 412, box: { x: 284, y: 402, w: 160, h: 20 } },
      { x: 320, y: 155, box: { x: 260, y: 140, w: 120, h: 30 } }, { x: 420, y: 566, box: { x: 284, y: 556, w: 230, h: 20 } },
      { x: 1135, y: 411, box: { x: 1080, y: 396, w: 110, h: 30 } },
    ];
    const sizes = things.map(() => ({ w: 200, h: 46 }));
    const placed = placeLabels(things, sizes, { w: 1280, h: 800 });
    for (const [i, l] of placed.entries()) {
      for (const t of things) expect(overlaps(l, t.box), `label ${i} over a thing`).toBe(false);
      const b = things[i].box;
      // The dot is on the thing's edge on the label's side, never in the middle of its words.
      const onEdge = (l.side === "right" && l.dot[0] === b.x + b.w) || (l.side === "left" && l.dot[0] === b.x) || (l.side === "below" && l.dot[1] === b.y + b.h) || (l.side === "above" && l.dot[1] === b.y);
      expect(onEdge, `label ${i} ${l.side} ${l.dot}`).toBe(true);
      expect(l.line[0]).toEqual(l.dot);
      expect(inside(l, 1280, 800)).toBe(true);
    }
    expect(placed[0].x).toBeGreaterThanOrEqual(284 + 290 + 28);
  });
  test("random screens with boxes: never over a label or a labelled thing, while there is room", () => {
    for (let n = 0; n < 200; n++) {
      const r = rng(`box${n}`);
      const W = 1440, H = 900, k = 1 + Math.floor(r() * 6);
      const things = Array.from({ length: k }, (_, i) => { const w = 40 + Math.round(r() * 200), h = 18 + Math.round(r() * 14); const x = 20 + Math.round(r() * (W - w - 40)), y = 40 + i * 140 + Math.round(r() * 60); return { x: x + w / 2, y: y + h / 2, box: { x, y, w, h } }; });
      const placed = placeLabels(things, things.map(() => ({ w: 160, h: 30 })), { w: W, h: H });
      for (const [i, a] of placed.entries()) {
        for (const t of things) expect(overlaps(a, t.box), `case ${n} label ${i}`).toBe(false);
        for (const b of placed.slice(i + 1)) expect(overlaps(a, b), `case ${n}`).toBe(false);
      }
    }
  });
  test("the labels are placed against the display the shell sent, not the page's old size", () => {
    expect(labelBounds({ w: 2560, h: 1440 }, { w: 1440, h: 900 })).toEqual({ w: 2560, h: 1440 });
    expect(labelBounds({}, { w: 1440, h: 900 })).toEqual({ w: 1440, h: 900 });
    expect(labelBounds({ w: 0, h: "x" }, { w: 1440, h: 900 })).toEqual({ w: 1440, h: 900 });
    const overlay = src("./overlay.ts");
    expect(overlay).toContain("labelBounds(p, { w: innerWidth, h: innerHeight })");
  });
  test("the same labels are placed the same way every time", () => {
    const pts = [{ x: 500, y: 200 }, { x: 510, y: 210 }, { x: 520, y: 220 }];
    const sizes = pts.map(() => ({ w: 150, h: 30 }));
    expect(placeLabels(pts, sizes, screen)).toEqual(placeLabels(pts, sizes, screen));
  });
  test("a label's size comes from its words: wider for more letters, taller with a note", () => {
    expect(labelSize("Keys").w).toBeLessThan(labelSize("Webhook signing").w);
    expect(labelSize("Keys", "Never put this in the browser.").h).toBeGreaterThan(labelSize("Keys").h);
    expect(labelSize("x".repeat(32), "y".repeat(100)).w).toBeLessThanOrEqual(260);
  });
});

describe("labels are revealed one after another (labelReveal.ts)", () => {
  test("in their order, about 90 ms apart, each with a short fade and slide", () => {
    expect(LABEL_GAP_MS).toBe(90);
    expect(revealPlan(3, false)).toEqual([{ index: 0, delayMs: 0, motion: true }, { index: 1, delayMs: 90, motion: true }, { index: 2, delayMs: 180, motion: true }]);
  });
  test("with Reduce Motion, all at once and with no motion", () => {
    expect(revealPlan(3, true)).toEqual([0, 1, 2].map((index) => ({ index, delayMs: 0, motion: false })));
  });
  test("each tone has its meaning colour: info blue, look here orange, risk red", () => {
    expect(toneColour("info")).toBe("blue");
    expect(toneColour("look")).toBe("orange");
    expect(toneColour("risk")).toBe("red");
  });
  test("a question asks for labels when it says so", () => {
    for (const q of ["label this", "Label these settings", "what are these settings?", "which of these do I need for Stripe webhooks?", "what are all these options"]) expect(labelAsk(q), q).toBe(true);
    for (const q of ["where do I click to deploy?", "how do I save this form?", "fix the failing test", ""]) expect(labelAsk(q), q).toBe(false);
    // A question about where to click is Show me's own pointing, even with "which of these" or "what are these" in it.
    for (const q of ["which of these do I click to deploy?", "what are these buttons, which one saves?", "which of those do I press to publish?", "what do these do and where do I tap to save?"]) expect(labelAsk(q), q).toBe(false);
  });
  test("while the labels are up, Home says how they go: Esc only when Esc clears the screen (home.escStops)", () => {
    expect(labelledLine(3, true)).toBe(S.m86.labelled(3));
    expect(labelledLine(3, true)).toContain("Esc");
    expect(labelledLine(1, false)).toBe(S.m86.labelledNoEsc(1));
    expect(labelledLine(1, false)).not.toContain("Esc");
  });
});

describe("the overlay draws labels only from the shell's checked data", () => {
  const overlay = src("./overlay.ts");
  test("drawn on overlay-labels, placed by placeLabels, revealed by revealPlan, in meaning colours from the tokens", () => {
    expect(overlay).toContain('void listen("overlay-labels"');
    const f = overlay.slice(overlay.indexOf("function drawLabels("), overlay.indexOf('void listen("overlay-labels"'));
    expect(f).toContain("placeLabels(");
    expect(f).toContain("revealPlan(");
    expect(f).toContain("toneColour(");
    expect(f).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);   // no colour of its own: the tokens' meaning colours only
    expect(f).toContain("textContent");   // words as text, never markup
    expect(f).not.toContain("innerHTML");
    expect(overlay).toContain('import "./ui/tokens.css";');
  });
  test("card.tsx asks for labels with the label mode, and hands the engine's answer to the shell to check and draw", () => {
    const card = src("./card.tsx");
    // Never for a walkthrough's next step (steps) or a look after a click (settle): those always point.
    expect(card).toContain('mode = mode ?? (steps.length === 0 && !settle && labelAsk(question) ? "label" : undefined);');
    expect(card).toContain('labelledLine(n, setting("home.escStops") !== false)');
    // The labels' line has Close, like every other Show me end, and a voice Show me ends with the labels.
    expect(card).toMatch(/\["error", "needs_permission", "opened", "window_changed", "not_sure", "labelled"\]\.includes\(m\.showme\.stage\)/);
    expect(src("./speech.ts")).toMatch(/const SHOWME_ENDS = \[[^\]]*"labelled"/);
    expect(card).toContain('invoke("showme_labels", { req: ev.req, labels: ev.labels })');
  });
});

const REPLAY = {
  beats: [
    { say: "Your AI changed 2 files, in the pages and the server code.", draw: "count" },
    { say: "In the pages: Checkout.tsx.", draw: "file", ref: "src/pages/Checkout.tsx" },
    { say: "The tests did not pass, exit 1.", draw: "check", ref: "The tests" },
    { say: "In the server code: pay.ts.", draw: "part", ref: "server" },
    { say: "It is worth a look before you keep it.", draw: "verdict" },
  ],
  by: "rules", files: [{ file: "src/pages/Checkout.tsx", kind: "modified", part: "pages" }, { file: "src/api/pay.ts", kind: "added", part: "server" }], count: 2, more: 0,
  checks: [{ label: "The build", status: "passed", exit: 0 }, { label: "The tests", status: "failed", exit: 1 }],
};

describe("Watch what changed (replay.ts)", () => {
  test("a replay that keeps to its sheet is kept; one that draws something outside it is dropped whole", () => {
    expect(replayOf(REPLAY)).toEqual(REPLAY as never);
    expect(replayOf({ ...REPLAY, beats: [...REPLAY.beats.slice(0, 2), { say: "A helper changed.", draw: "file", ref: "src/x.ts" }] })).toBeUndefined();
    expect(replayOf({ ...REPLAY, beats: REPLAY.beats.slice(0, 2) })).toBeUndefined();
    // A screenshot beat is not drawn (the board cannot show the picture yet), and the verdict is last and once.
    expect(replayOf({ ...REPLAY, beats: [...REPLAY.beats.slice(0, 4), { say: "Your page opened.", draw: "shot" }, REPLAY.beats[4]] })).toBeUndefined();
    expect(replayOf({ ...REPLAY, beats: [REPLAY.beats[4], ...REPLAY.beats.slice(1, 4)] })).toBeUndefined();
    expect(replayOf({ ...REPLAY, beats: [REPLAY.beats[0], REPLAY.beats[4], REPLAY.beats[2], REPLAY.beats[4]] })).toBeUndefined();
    expect(replayOf(null)).toBeUndefined();
  });
  test("each beat draws exactly one thing, inside the board, the same every time", () => {
    const r = replayOf(REPLAY)!;
    const scene = replayScene(r, "worth_a_look");
    expect(scene.marks.map((m) => m.beat)).toEqual([0, 1, 2, 3, 4]);
    for (const m of scene.marks) {
      expect(m.d.length).toBeGreaterThan(0);
      for (const n of m.d.match(/-?\d+(\.\d+)?/g)!.map(Number)) { expect(n).toBeGreaterThanOrEqual(-4); expect(n).toBeLessThanOrEqual(REPLAY_BOARD.w + 4); }
    }
    expect(replayScene(r, "worth_a_look")).toEqual(scene);
    expect(replayScene(r, "stop").marks[4].colour).toBe("red");
    expect(replayScene(r, "safe").marks[4].colour).toBe("green");
    // The colours are meanings: a failed check red, the verdict by the rating's meaning.
    expect(scene.marks[2].colour).toBe("red");
    expect(scene.marks[4].colour).toBe("orange");
    // The base shows each file by its own name, and the more count when there are more.
    expect(scene.rows.map((x) => x.name)).toEqual(["Checkout.tsx", "pay.ts"]);
    // The opening names both parts, so it draws round every row, not only the first part's.
    const rowsTop = Math.min(...scene.rows.map((x) => x.y)), rowsBottom = Math.max(...scene.rows.map((x) => x.y + x.h));
    const ys = scene.marks[0].d.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeLessThanOrEqual(rowsTop);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(rowsBottom);
    // No grey box for a picture the board cannot show.
    expect("shot" in scene).toBe(false);
  });
  test("the board fills the card's width (320 to 640), drawn at one to one so its words stay their size", () => {
    const r = replayOf(REPLAY)!;
    const wide = replayScene(r, "worth_a_look", 600);
    expect(wide.width).toBe(600);
    expect(Math.max(...wide.chips.map((c) => c.x + c.w))).toBeLessThanOrEqual(600 - 8);
    expect(wide.rows[0].w).toBeGreaterThan(replayScene(r, "worth_a_look").rows[0].w);
    expect(replayScene(r, "worth_a_look", 2000).width).toBe(640);
    expect(replayScene(r, "worth_a_look", 100).width).toBe(320);
    for (const m of wide.marks) for (const n of m.d.match(/-?\d+(\.\d+)?/g)!.map(Number)) expect(n).toBeLessThanOrEqual(604);
  });
  test("the model's replay that follows the result takes the rules' place on the card's own review only", () => {
    const base = reviewReduce(null, { type: "review.batch", project: "/p", batch: "rv_86aa01bc2d", files: [{ file: "src/pages/Checkout.tsx", kind: "modified" }, { file: "src/api/pay.ts", kind: "added" }], count: 2, capped: false, secretFiles: [] });
    const reviewed = reviewReduce(base, { type: "review.result", project: "/p", batch: "rv_86aa01bc2d", ok: true, rating: "worth_a_look", touches: [], summary: "x", notes: [], reasons: [], files: [{ file: "src/pages/Checkout.tsx", kind: "modified" }, { file: "src/api/pay.ts", kind: "added" }], count: 2, capped: false, secretFiles: [], checks: "failed", sendBack: "x", lane: "none", usdEstimate: 0, replay: REPLAY })!;
    expect(reviewed.result?.replay?.by).toBe("rules");
    const byModel = { ...REPLAY, by: "model", beats: [{ say: "Your AI changed the checkout page and a route.", draw: "count" }, ...REPLAY.beats.slice(1)] };
    const after = reviewReduce(reviewed, { type: "review.replay", project: "/p", batch: "rv_86aa01bc2d", replay: byModel })!;
    expect(after.result?.replay?.by).toBe("model");
    expect(after.result?.rating).toBe(reviewed.result?.rating);
    expect(reviewReduce(reviewed, { type: "review.replay", project: "/p", batch: "rv_other", replay: byModel })).toBe(reviewed);
    expect(reviewReduce(reviewed, { type: "review.replay", project: "/p", batch: "rv_86aa01bc2d", replay: { ...byModel, beats: byModel.beats.slice(0, 2) } })).toBe(reviewed);
  });
  test("each beat lasts its words at 2.6 words a second, at the chosen speed", () => {
    const r = replayOf(REPLAY)!;
    const normal = replayTimes(r, "normal");
    expect(normal[0].at).toBe(0);
    const words = REPLAY.beats[0].say.split(/\s+/).length;
    expect(normal[0].dur).toBe(Math.round(Math.max(1400, (words / 2.6) * 1000)));
    for (let i = 1; i < normal.length; i++) expect(normal[i].at).toBe(normal[i - 1].at + normal[i - 1].dur);
    const slow = replayTimes(r, "slow"), fast = replayTimes(r, "fast");
    expect(slow[1].dur).toBeGreaterThan(normal[1].dur);
    expect(fast[1].dur).toBeLessThan(normal[1].dur);
  });
  test("Reduce Motion: a still picture with every beat drawn, by the Mac's setting or the person's own choice", () => {
    expect(replayStill("followMac", true)).toBe(true);
    expect(replayStill("followMac", false)).toBe(false);
    expect(replayStill("still", false)).toBe(true);
    expect(replayStill("moving", true)).toBe(false);
  });
  test("it plays on Home's review card, behind replay.show; the notch keeps its clear pass or fail tile", () => {
    const card = src("./reviewCard.tsx"), island = src("./islandPanel.tsx");
    expect(card).toContain("<ReplayView");
    expect(card).toContain('useSetting("replay.show") !== false');
    // A thumbnail too small to read replaced the tile that says the checks failed: the notch shows the tile only.
    expect(island).not.toContain("<ReplayView");
    expect(island).not.toContain("ReplayView");
  });
  test("the words are in strings.ts", () => {
    expect(S.m86.watch).toBeTruthy();
    expect(S.m86.watchAgain).toBeTruthy();
    expect(S.m86.byModel).toBeTruthy();
    for (const v of Object.values(S.m86.parts)) expect(v).toBeTruthy();
  });
});
