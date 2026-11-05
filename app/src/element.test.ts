// The elements (the brand language, 1 Nov 2026): every group's colours, measured from ui/tokens.css itself, so a later
// creature's block, or a change to one value, fails here before it reaches a screen. Light on graphite at least 9.8 to 1 (it
// is the only element colour that may be words), ink on the base, the gradient's top and the gel's foot at least 7 to 1,
// white on the deep colour at least 4.5 to 1, and each gradient inside its own family of hues. Since 2 Nov 2026 the water
// chosen in Settings is the one accent (Flowflow, its pond, the main button, focus and the marks), measured for every water.
// Then which room Home is and when its light may move.
// M71 (black with colour, 5 Nov 2026): the rooms are retired. Home is black and sets no data-element; tokens.css keeps no
// [data-element] block. What stays here is what still holds: each water's block and the accent it gives (the water
// character, focus and what is picked in Settings), and element.ts's logic, which the dock and the island still read.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ROOM_IDLE_MS, roomElement, roomStill } from "./element.ts";
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

/** Each water but Ocean (which is :root's) has a block that gives Flowflow's pond its sea and its foot, and nothing else. */
const OTHER_WATERS = WATERS.filter((w) => w !== "ocean");
const WATER_SEL = (w: string) => `:root[data-water="${w}"]`;

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

describe("the water chosen in Settings is the one accent (2 Nov 2026), set once on the page's root", () => {
  // The one accent is the water chosen (2 Nov 2026, the review of the founder's midnight water: violet water beside blue
  // buttons, a teal line and an amber dot). This replaces the rule of earlier that day (the water coloured Flowflow and its
  // pond only, so its block held the sea and the foot alone): each water's block now also holds the accent's whole palette.
  const FLOW_SLOTS = Object.keys(ROOT).filter((k) => k.startsWith("--flow-")).sort();
  for (const w of OTHER_WATERS) {
    test(`${w} water: its block gives the pond a sea and a foot (deep enough for white words) and the whole accent`, () => {
      const wb = block(WATER_SEL(w));
      // M65: and the accent as a fill, white words on it (instrument.test.ts measures it).
      expect(Object.keys(wb).sort(), w).toEqual(["--acc", "--w-foot", "--w-sea", ...FLOW_SLOTS].sort());
      for (const k of ["--w-sea", "--w-foot"]) expect(ratio(WHITE, colour(wb[k], wb)), `${w} ${k}`).toBeGreaterThanOrEqual(3);
    });
  }
  for (const w of WATERS) {
    test(`${w} water as the accent: white reads on its deep, and focus and what is picked show on every surface`, () => {
      const t = { ...ROOT, ...(w === "ocean" ? {} : block(WATER_SEL(w))) };
      expect(ratio(WHITE, colour("var(--el-deep)", t)), `${w} white on deep`).toBeGreaterThanOrEqual(4.5);
      const BLACK = { ...ROOT, ...block(':root[data-theme="black"]') };
      for (const theme of [ROOT, DEEP, BLACK]) for (const s of ["--bg", "--surface-1", "--surface-2", "--surface-3"]) {
        expect(ratio(colour("var(--focus)", t), colour(theme[s], theme)), `${w} focus on ${s}`).toBeGreaterThanOrEqual(3);
        expect(ratio(colour("var(--pick)", t), colour(theme[s], theme)), `${w} accent on ${s}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
  test("each water but Ocean has one block on the page's root, and focus is the accent's, set once there", () => {
    const css0 = TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
    for (const w of OTHER_WATERS) expect(css0, w).toContain(`\n${WATER_SEL(w)} {`);
    expect(css0).not.toContain('[data-water="ocean"]');
    for (const sel of css0.matchAll(/\n([^{}\n]*\[data-water=[^{}]*)\{/g)) expect(sel[1].trim(), "a water block is the root's alone").toMatch(/^:root\[data-water="\w+"\]$/);
    expect(ROOT["--focus"]).toBe("var(--flow-focus)");
  });
  test("badges are one system in every room: a solid pill of the card colour with a little of its own colour, a dot before the words, no outline", () => {
    const look = readFileSync(new URL("./ui/look.css", import.meta.url), "utf8");
    expect(look).toMatch(/\.home \.stamp \{[^}]*border-color: transparent;[^}]*background: color-mix\(in srgb, currentColor var\(--stamp-fill-a\), var\(--surface-1\)\);/);
    expect(look).toMatch(/\.home \.stamp::before \{[^}]*background: currentColor;/);
    expect(look).toMatch(/\.home \.stamp\[data-stamp="needsYou"\] \{ background: color-mix\(in srgb, currentColor var\(--stamp-needs-a\), var\(--surface-1\)\); \}/);
    // No sticker: Needs you is no longer a bright solid pill with dark words.
    expect(TOKENS_CSS()).not.toContain("--needs-fill");
    const PAPER = { ...ROOT, ...block(':root[data-theme="paper"]') }, CALM = block(':root[data-colour="calm"]');
    const PAPER_CALM = { ...PAPER, ...CALM, ...block(':root[data-tone="light"][data-colour="calm"]') };
    for (const [name, th] of [["graphite", ROOT], ["deep", DEEP], ["paper", PAPER], ["graphite calm", { ...ROOT, ...CALM }], ["paper calm", PAPER_CALM]] as const) {
      const card = colour("var(--surface-1)", th);
      const room = name.startsWith("paper") ? th : { ...th, "--stamp-working": "var(--el-light)" };
      for (const [kind, ink, a] of [["working", "--stamp-working", "--stamp-fill-a"], ["proven", "--ok", "--stamp-fill-a"], ["new", "--fg-2", "--stamp-fill-a"], ["needsYou", "--amber", "--stamp-needs-a"]] as const) {
        const words = colour(`var(${ink})`, room);
        const p = parseFloat(th[a]) / 100;
        const fill = [0, 1, 2].map((k) => words[k] * p + card[k] * (1 - p)).concat(1) as RGB;
        expect(ratio(words, fill), `${name}: ${kind} words on its pill`).toBeGreaterThanOrEqual(4.5);
      }
    }
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
  test("M71: Home carries no room: no data-element, no room light, and no stylesheet keys a rule on one", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).not.toContain("data-element={room}");
    expect(card).not.toContain("<RoomLight");
    expect(TOKENS_CSS().replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("[data-element");
  });
});
