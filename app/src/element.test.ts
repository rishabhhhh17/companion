// The elements (the brand language, 1 Nov 2026): every group's colours, measured from ui/tokens.css itself, so a later
// creature's block, or a change to one value, fails here before it reaches a screen. Light on graphite at least 9.8 to 1 (it
// is the only element colour that may be words), ink on the base, the gradient's top and the gel's foot at least 7 to 1,
// white on the deep colour at least 4.5 to 1, and each gradient inside its own family of hues. Flow is the water chosen in
// Settings, so each water's own block for Flow is measured the same way. Then which room Home is and when its light may
// move.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ELEMENTS, ROOM_IDLE_MS, roomElement, roomStill } from "./element.ts";
import { WATERS } from "./lookfeel.ts";
import { TOKENS_CSS } from "./ui/cssFiles.ts";

type RGB = [number, number, number, number];
const css = TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
const block = (sel: string): Record<string, string> => {
  const at = css.indexOf(`\n${sel} {`);
  if (at < 0) return {};
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries(body.split(";").map((d) => d.trim()).filter((d) => d.startsWith("--")).map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()]; }));
};
const ROOT = block(":root"), DEEP = { ...ROOT, ...block(':root[data-theme="deep"]') };
const GATED = block(':root:not([data-theme="paper"]) [data-element]'), GEL = block("[data-element]");
const el = (e: string) => ({ ...ROOT, ...GEL, ...GATED, ...block(`[data-element="${e}"]`) });
/** Each water but Ocean (which is :root's and Flow's own values) has a block that lights Flow's room, and only Flow's. */
const OTHER_WATERS = WATERS.filter((w) => w !== "ocean");
const WATER_SEL = (w: string) => `:root[data-water="${w}"], :root[data-water="${w}"] [data-element="flow"]`;
/** An element's tokens with a water chosen: the water's block lights Flow; the other rooms keep their own, and take only its sea. */
const lit = (e: string, w: string) => {
  const wb = w === "ocean" ? {} : block(WATER_SEL(w));
  return e === "flow" ? { ...el(e), ...wb } : { ...el(e), "--w-sea": wb["--w-sea"] ?? ROOT["--w-sea"] };
};

function colour(v0: string, t: Record<string, string>): RGB {
  const v = v0.trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return colour(t[ref[1]] ?? "", t);
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGB;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) { const p = rgb[1].split(",").map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/.exec(v);
  if (mix) { const a = colour(mix[1], t), b = colour(mix[3], t), p = Number(mix[2]) / 100; return [0, 1, 2, 3].map((k) => a[k] * p + b[k] * (1 - p)) as RGB; }
  throw new Error(`cannot read ${v0}`);
}
const over = (a: RGB, b: RGB): RGB => [0, 1, 2].map((k) => a[k] * a[3] + b[k] * (1 - a[3])).concat(1) as RGB;
const lum = (c: RGB) => { const f = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hue = ([r0, g0, b0]: RGB) => {
  const [r, g, b] = [r0, g0, b0].map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const WHITE: RGB = [255, 255, 255, 1];

describe("every element reads, in every dark theme", () => {
  test("there is a block for each element, each with the same slots", () => {
    const slots = Object.keys(block('[data-element="flow"]')).sort();
    expect(slots).toEqual(["--el-base", "--el-card", "--el-deep", "--el-foot", "--el-glow", "--el-grad-1", "--el-grad-2", "--el-grad-3", "--el-light", "--el-lit", "--el-shadow", "--el-sky", "--el-tint", "--el-wash"]);
    for (const e of ELEMENTS) expect(Object.keys(block(`[data-element="${e}"]`)).sort(), e).toEqual(slots);
    // The usual room on :root is Flow's, value for value, so a page with no data-element is the water's room.
    for (const k of slots) expect(ROOT[k], k).toBe(block('[data-element="flow"]')[k]);
  });
  for (const e of ELEMENTS) {
    test(`${e}: its light is words on graphite and Deep (9.8 to 1), ink reads on its body and its gel (7 to 1), white on its deep (4.5 to 1)`, () => {
      const t = el(e);
      // Where the light is words: the page, a card and a row under the pointer (9.8 to 1, the brand language's floor), and a
      // pressed fill (7 to 1).
      for (const theme of [ROOT, DEEP]) {
        for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(colour("var(--el-light)", t), colour(theme[s], theme)), `${e} light on ${s}`).toBeGreaterThanOrEqual(9.8);
        expect(ratio(colour("var(--el-light)", t), colour(theme["--surface-3"], theme)), `${e} light on --surface-3`).toBeGreaterThanOrEqual(7);
      }
      for (const f of ["--el-base", "--el-grad-1", "--el-lift"]) expect(ratio(colour("var(--el-ink)", t), colour(`var(${f})`, t)), `${e} ink on ${f}`).toBeGreaterThanOrEqual(7);
      expect(ratio(WHITE, colour("var(--el-deep)", t)), `${e} white on deep`).toBeGreaterThanOrEqual(4.5);
      // The selected row: the page's words and the light on the element's tint.
      expect(ratio(colour("var(--fg)", t), colour("var(--el-tint)", t)), `${e} words on its tint`).toBeGreaterThanOrEqual(7);
      expect(ratio(colour("var(--el-light)", t), colour("var(--el-tint)", t)), `${e} light on its tint`).toBeGreaterThanOrEqual(7);
    });
    test(`${e}: what is picked in Settings stands out (3 to 1) and its words read (4.5 to 1)`, () => {
      const t = el(e);
      const pick = colour("var(--pick)", t), wash = colour("var(--pick-wash)", t);
      for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(pick, colour(`var(${s})`, t)), `${e} accent on ${s}`).toBeGreaterThanOrEqual(3);
      expect(ratio(colour("var(--pick-ink)", t), pick), `${e} knob on the accent`).toBeGreaterThanOrEqual(3);
      expect(ratio(colour("var(--fg)", t), wash), `${e} words on the wash`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(pick, wash), `${e} edge on the wash`).toBeGreaterThanOrEqual(3);
    });
    test(`${e}: its gradient stays inside one family of hues (35 degrees at most), never a rainbow`, () => {
      const t = el(e);
      const a = hue(colour("var(--el-grad-1)", t)), b = hue(colour("var(--el-grad-3)", t));
      const d = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
      expect(d, `${e}: ${a.toFixed(0)} to ${b.toFixed(0)}`).toBeLessThanOrEqual(35);
    });
  }
  for (const w of OTHER_WATERS) {
    test(`Flow in ${w} water: the same slots, its light is words (9.8 to 1), ink reads on its body and gel (7 to 1), white on its deep (4.5 to 1), one family of hues`, () => {
      const wb = block(WATER_SEL(w));
      expect(Object.keys(wb).sort(), w).toEqual([...Object.keys(block('[data-element="flow"]')), "--w-sea"].sort());
      const t = lit("flow", w);
      for (const theme of [ROOT, DEEP]) {
        for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(colour("var(--el-light)", t), colour(theme[s], theme)), `${w} light on ${s}`).toBeGreaterThanOrEqual(9.8);
        expect(ratio(colour("var(--el-light)", t), colour(theme["--surface-3"], theme)), `${w} light on --surface-3`).toBeGreaterThanOrEqual(7);
      }
      for (const f of ["--el-base", "--el-grad-1", "--el-lift", "--gel-top"]) expect(ratio(colour("var(--el-ink)", t), colour(`var(${f})`, t)), `${w} ink on ${f}`).toBeGreaterThanOrEqual(7);
      expect(ratio(WHITE, colour("var(--el-deep)", t)), `${w} white on deep`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour("var(--fg)", t), colour("var(--el-tint)", t)), `${w} words on its tint`).toBeGreaterThanOrEqual(7);
      expect(ratio(colour("var(--el-light)", t), colour("var(--el-tint)", t)), `${w} light on its tint`).toBeGreaterThanOrEqual(7);
      const pick = colour("var(--pick)", t), wash = colour("var(--pick-wash)", t);
      for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(pick, colour(`var(${s})`, t)), `${w} accent on ${s}`).toBeGreaterThanOrEqual(3);
      expect(ratio(colour("var(--fg)", t), wash), `${w} words on the wash`).toBeGreaterThanOrEqual(4.5);
      const a = hue(colour("var(--el-grad-1)", t)), b = hue(colour("var(--el-grad-3)", t));
      expect(Math.min(Math.abs(a - b), 360 - Math.abs(a - b)), `${w}: ${a.toFixed(0)} to ${b.toFixed(0)}`).toBeLessThanOrEqual(35);
    });
  }
  test("second words in a lit room are a step lighter than the page's grey and still read on every surface (4.5 to 1)", () => {
    for (const e of ELEMENTS) for (const w of WATERS) {
      const t = lit(e, w);
      const fg2 = colour("var(--fg-2)", t);
      for (const theme of [ROOT, DEEP]) for (const s of ["--bg", "--surface-1", "--surface-2", "--surface-3"]) expect(ratio(fg2, colour(theme[s], theme)), `${e} in ${w}: second words on ${s}`).toBeGreaterThanOrEqual(4.5);
      expect(lum(fg2), `${e} in ${w}: lighter than the page's grey`).toBeGreaterThan(lum(colour(ROOT["--fg-2"], ROOT)));
      expect(lum(fg2), `${e} in ${w}: still under the first words`).toBeLessThan(lum(colour(ROOT["--fg"], ROOT)) * .8);
    }
  });
  test("the working badge is Flow's light in any room, and reads on the page, a card and a row (4.5 to 1)", () => {
    const t = el("flow");
    for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(colour("var(--stamp-working)", t), colour(`var(${s})`, t))).toBeGreaterThanOrEqual(4.5);
    expect(readFileSync(new URL("./itemMarks.tsx", import.meta.url), "utf8")).toContain('data-element={kind === "working" ? "flow" : undefined}');
  });
});

describe("the founder's fixes (1 Nov 2026), with the review's (a sunset, one badge system, a clean band, a calm step)", () => {
  test("the sun's room is a sunset, never olive or mud: its wide dim colours fall from coral to rose to violet", () => {
    // Dim yellow reads olive and dim orange or red reads brown (the review saw oxblood cards). The sky, the floor, a card's
    // tint, its light and the selected row fill wide dim areas, so Guide's sit from violet round through rose to coral (260
    // to 30 degrees); its gold stays in the bright parts (beams, gem, gel).
    const t = el("guide");
    for (const k of ["--el-sky", "--el-foot", "--el-card", "--el-lit", "--el-tint"]) {
      const h = hue(colour(`var(${k})`, t));
      expect(h >= 260 || h <= 30, `${k} at ${h.toFixed(0)} degrees`).toBe(true);
    }
    const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8");
    expect(look).toMatch(/\.home\[data-element="guide"\] \.room-rays \{[^}]*opacity: 1;/);
  });
  test("Flowflow's water is lit by the room it is in: a deep sea in the room's light with the chosen water in it, never grey and never sun coloured", () => {
    expect(GEL["--sea-room"]).toBe("color-mix(in srgb, var(--el-foot) 80%, var(--w-sea))");
    for (const e of ELEMENTS) for (const w of WATERS) {
      const [r, g, b] = colour("var(--sea-room)", { ...GEL, ...lit(e, w) });
      // Never grey: a water and a room of opposite colours are not mixed half and half.
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${e} in ${w}: the sea is a colour`).toBeGreaterThanOrEqual(45);
      // Never a pool of sun (the founder): no sea is gold or orange.
      const h = hue([r, g, b, 1]);
      expect(h > 20 && h < 90, `${e} in ${w}: the sea at ${h.toFixed(0)} degrees`).toBe(false);
    }
  });
  test("badges are one system in every room: a solid pill of the card colour with a little of its own colour, a dot before the words, no outline", () => {
    const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8");
    expect(look).toMatch(/\.home \.stamp \{[^}]*border-color: transparent;[^}]*background: color-mix\(in srgb, currentColor var\(--stamp-fill-a\), var\(--surface-1\)\);/);
    expect(look).toMatch(/\.home \.stamp::before \{[^}]*background: currentColor;/);
    expect(look).toMatch(/\.home \.stamp\[data-stamp="needsYou"\] \{ background: color-mix\(in srgb, currentColor var\(--stamp-needs-a\), var\(--surface-1\)\); \}/);
    // No sticker: Needs you is no longer a bright solid pill with dark words.
    expect(TOKENS_CSS()).not.toContain("--needs-fill");
    const PAPER = { ...ROOT, ...block(':root[data-theme="paper"]') }, CALM = block(':root[data-colour="calm"]');
    const PAPER_CALM = { ...PAPER, ...CALM, ...block(':root[data-theme="paper"][data-colour="calm"]') };
    for (const [name, th] of [["graphite", ROOT], ["deep", DEEP], ["paper", PAPER], ["graphite calm", { ...ROOT, ...CALM }], ["paper calm", PAPER_CALM]] as const) {
      const card = colour("var(--surface-1)", th);
      const room = name.startsWith("paper") ? th : { ...th, ...GATED, "--stamp-working": "var(--el-light)" };
      for (const [kind, ink, a] of [["working", "--stamp-working", "--stamp-fill-a"], ["proven", "--ok", "--stamp-fill-a"], ["new", "--fg-2", "--stamp-fill-a"], ["needsYou", "--amber", "--stamp-needs-a"]] as const) {
        const words = colour(`var(${ink})`, room);
        const p = parseFloat(th[a]) / 100;
        const fill = [0, 1, 2].map((k) => words[k] * p + card[k] * (1 - p)).concat(1) as RGB;
        expect(ratio(words, fill), `${name}: ${kind} words on its pill`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  test("the band under the ask box is the floor's own colour, so it cannot be seen at rest", () => {
    const wide = readFileSync(new URL("./ui/wide.css", import.meta.url), "utf8");
    expect(wide).toContain("--band: color-mix(in srgb, var(--el-foot) calc(var(--room-floor-a) * var(--room-show)), var(--room-base));");
    // Solid, so nothing ghosts through it, and it needs no backdrop blur (unverified in WKWebView).
    expect(wide).toMatch(/\.askwrap::after \{[^}]*background: var\(--band\); pointer-events: none; \}/);
    const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8");
    // The floor is flat along the bottom third, at the same strength, where the ask box and its band sit.
    expect(look).toMatch(/\.room-floor \{[^}]*var\(--el-foot\) var\(--room-floor-a\), transparent\) 64%, color-mix\(in srgb, var\(--el-foot\) var\(--room-floor-a\), transparent\) 100%/);
    // Nothing else in the room reaches that third, so the band's top edge cannot be seen: the wash ends by 72 percent, the
    // glow's box stops 26 percent above the bottom, and the rays' mask is clear by 82 percent of their box (90 percent tall,
    // starting 30 percent above the top, so about 68 percent down Home).
    expect(look).toMatch(/\.room-mid \{[^}]*transparent 72%\); \}/);
    expect(look).toMatch(/\.room-glow \{ inset: 12% -18% 26% 30%;/);
    expect(look).toMatch(/\.room-rays \{[^}]*inset: -30% -20% 10% -20%;[^}]*mask-image: linear-gradient\(180deg, #000 0, #000 30%, transparent 82%\);/);
  });
  test("Calm turns every colour level down a step from Vivid, and Paper stays clean", () => {
    const calm = block(':root[data-colour="calm"]');
    const levels = ["--room-sky-a", "--room-wash-a", "--room-mid-a", "--room-glow-a", "--room-floor-a", "--rays-a", "--rays-work-a", "--motes-a", "--card-tint-a", "--card-lit-a", "--card-halo-a", "--gel-gloss-a", "--gel-glow-a", "--sea-see-a", "--stamp-fill-a", "--stamp-needs-a"];
    for (const k of levels) expect(parseFloat(calm[k]), k).toBeLessThan(parseFloat(ROOT[k]));
    // Calm is a quiet Home, not a dimmer Vivid: no rays and no motes at rest, plain cards, no halo.
    for (const k of ["--rays-a", "--motes-a", "--card-tint-a", "--card-halo-a"]) expect(parseFloat(calm[k]), k).toBe(0);
    const paper = block(':root[data-theme="paper"]');
    expect(paper["--room-show"]).toBe("0");
    expect(paper["--card-tint-a"]).toBe("0%");
    expect(paper["--card-halo-a"]).toBe("0%");
    expect(paper["--el-text"]).toBe("var(--fg)");
  });
});

describe("the water chosen in Settings lights Flow's room, and only Flow's (the review, 1 Nov 2026)", () => {
  test("each water but Ocean has one block, for the page and for Flow's room only; no other room reads it", () => {
    const css0 = TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
    for (const w of OTHER_WATERS) expect(css0, w).toContain(`\n${WATER_SEL(w)} {`);
    expect(css0).not.toContain('[data-water="ocean"]');
    for (const sel of css0.matchAll(/\n([^{}\n]*\[data-water=[^{}]*)\{/g)) expect(sel[1].trim(), "a water block names Flow's room only").toMatch(/^:root\[data-water="\w+"\], :root\[data-water="\w+"\] \[data-element="flow"\]$/);
    for (const e of ELEMENTS) expect(JSON.stringify(block(`[data-element="${e}"]`)), e).not.toContain("--water");
    expect(JSON.stringify(GATED)).not.toContain("--water");
  });
  test("the room's stylesheet reads the water itself in one place: Flowflow's own halo", () => {
    const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const from = look.indexOf("\n.room {");
    const room = look.slice(from);
    const uses = room.split("\n").filter((l) => l.includes("var(--water)"));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatch(/^\.home \.home-pond \.ch-char::before \{/);
  });
  test("focus stays neutral in every room: no element token sets the focus ring", () => {
    for (const e of ELEMENTS) expect(Object.keys(el(e)).filter((k) => k === "--focus" && el(e)[k] !== ROOT["--focus"])).toEqual([]);
  });
});

describe("which room Home is, and when its light may move", () => {
  test("Flow's water is the usual room; Learn is Guide's; what you are doing right now wins", () => {
    for (const tab of ["now", "did", "memory", "settings"] as const) expect(roomElement({ tab, active: null }), tab).toBe("flow");
    expect(roomElement({ tab: "now", active: "flow" })).toBe("flow");
    expect(roomElement({ tab: "learn", active: null })).toBe("guide");
    // A practice or a lesson running makes Now Guide's room too.
    expect(roomElement({ tab: "now", active: "guide" })).toBe("guide");
    expect(roomElement({ tab: "did", active: "guide" })).toBe("flow");
    // Holding the talk keys, or Prompt help reading the words you picked, is Voice's room on any place but Settings.
    for (const tab of ["now", "learn", "did", "memory"] as const) {
      expect(roomElement({ tab, active: "voice" }), tab).toBe("voice");
      expect(roomElement({ tab, active: "prompt" }), tab).toBe("voice");
      // A file dragged over Home is Files' room.
      expect(roomElement({ tab, active: "files" }), tab).toBe("files");
    }
    // Settings keeps its own room, so the accents on the page you are changing never flicker.
    expect(roomElement({ tab: "settings", active: "voice" })).toBe("flow");
    expect(roomElement({ tab: "settings", active: "files" })).toBe("flow");
  });
  test("the light holds still when Home is closed or hidden, and after ten seconds with no touch", () => {
    expect(ROOM_IDLE_MS).toBe(10_000);
    expect(roomStill({ open: true, hidden: false, sinceTouch: 0 })).toBe(false);
    expect(roomStill({ open: true, hidden: false, sinceTouch: 9_999 })).toBe(false);
    expect(roomStill({ open: true, hidden: false, sinceTouch: 10_000 })).toBe(true);
    expect(roomStill({ open: false, hidden: false, sinceTouch: 0 })).toBe(true);
    expect(roomStill({ open: true, hidden: true, sinceTouch: 0 })).toBe(true);
  });
  test("Home carries the room and its stillness; the stylesheet pauses the light on data-still and drifts it slowly", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("const room = roomElement({ tab: home.tab, active: activeGroup(m, dragging) });");
    expect(card).toContain('data-element={room} data-still={roomIsStill ? "" : undefined}');
    expect(card).toContain("<RoomLight />");
    const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8");
    expect(look).toContain(".home[data-still] .room > * { animation-play-state: paused; }");
    expect(look).toMatch(/\.room-glow \{[^}]*animation: room-breathe 36s/);
    // Only transforms and opacity move per frame; the light's colours fade once when the room changes.
    expect(look).toMatch(/@keyframes room-breathe \{ from \{ transform:[^}]*\} to \{ transform:[^}]*\} \}/);
    expect(TOKENS_CSS()).toContain('@property --el-glow { syntax: "<color>"; inherits: true;');
  });
});
