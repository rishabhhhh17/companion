// M68, the Visor (the founder's pick, 4 Nov 2026, option B in the characters lab): a glass orb with a dark band and light
// behind it. Written before the code (rule 17). The pose for each state, the setting that picks it, its drawing pinned to
// the lab's numbers, its motion (tokens only, transform and opacity only, never while hidden or with reduced motion), no
// face parts beyond the band, no WebGL on its path, and a fixed set of nodes whatever the state, so a change is a cross fade.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { glanceDue, ringFor, ringOf, visorMotion, visorPose, type VisorPose } from "./characters.ts";
import { characterOf, CHARACTER_CHOICES, lookAttrs } from "./lookfeel.ts";
import { shownValue } from "./settingsPages.ts";
import { dockShows, dockWords, miniShows, orbMotion } from "./chromeLook.ts";
import type { CharacterState } from "./model.ts";
import { VISOR_MS } from "./motionTokens.ts";
import { meterScales, VISOR_BAND, VISOR_GLASS, VISOR_GLASS_GRADIENT, VISOR_METER, VISOR_NEEDS, VISOR_REST, VISOR_SCAN, VISOR_SCAN_TRAVEL, VISOR_SMILE, VISOR_VIEWBOX, type Box } from "./visorArt.ts";
import { Visor } from "./ui/parts.tsx";
import { PARTS_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { S } from "./strings.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const STATES: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];

describe("which character: the setting (look.character)", () => {
  test("the Visor is the usual; a pick stays a pick (M71: the retired style no longer picks it)", () => {
    expect(CHARACTER_CHOICES).toEqual(["visor", "orb", "friendly"]);
    expect(characterOf("match")).toBe("visor");
    expect(characterOf("visor")).toBe("visor");
    expect(characterOf("orb")).toBe("orb");
    expect(characterOf("friendly")).toBe("friendly");
  });
  test("a store from before still loads: a saved orb stays the orb, an empty or odd store reads the usual", () => {
    expect(characterOf(undefined)).toBe("visor");
    for (const junk of [null, "", "Visor", "nonsense", 3, true]) expect(characterOf(junk), String(junk)).toBe("visor");
    expect(lookAttrs({ "look.style": "friendly" })["data-character"]).toBe("friendly");   // M71: a Friendly store keeps its water character
    expect(lookAttrs({})["data-character"]).toBe("visor");
  });
  test("the setting, its words and its help", () => {
    const reg = JSON.parse(read("../../protocol/settings.json")) as { settings: { key: string; options?: string[]; default?: unknown }[] };
    const def = reg.settings.find((s) => s.key === "look.character")!;
    expect(def.options).toEqual(["visor", "orb", "friendly", "match"]);
    expect(def.default).toBe("visor");
    const help = S.set["look.character"];
    expect(help.options).toEqual({ visor: "Visor", orb: "Glass orb", friendly: "Water", match: "Visor" });
    expect(help.help).toContain("Visor");
    expect(help.help).not.toMatch(/\u2014/);
  });
});

describe("the small places and the edge treat the Visor like the orb", () => {
  test("never the live water or the pictures, no cartoon moves, Needs you words beside an amber ring", () => {
    expect(miniShows("visor", { live: true, failed: false })).toBe("visor");
    expect(miniShows("visor", { live: true, failed: false, pose: true })).toBe("picture");
    expect(dockShows("visor", true, false)).toBe("visor");
    expect(orbMotion("visor", "breathe")).toBeUndefined();
    expect(dockWords("visor", "working", 1, "Working")).toBe("Needs you");
    expect(dockWords("visor", "working", 0, "Working")).toBe("Working");
  });
});

describe("the pose for each state (characters.ts visorPose)", () => {
  const P = (s: CharacterState, ring?: ReturnType<typeof ringOf>): VisorPose => visorPose(s, ring === undefined ? ringOf(s) : ring);
  test("the table of the plan", () => {
    expect(P("off")).toEqual({ lights: "none", tone: "light" });
    expect(P("idle")).toEqual({ lights: "rest", tone: "light" });
    for (const s of ["thinking", "working", "checking"] as const) expect(P(s), s).toEqual({ lights: "scan", tone: "light" });
    expect(P("listening")).toEqual({ lights: "meter", tone: "light" });
    expect(P("needsYou")).toEqual({ lights: "needs", tone: "needs" });
    expect(P("error")).toEqual({ lights: "rest", tone: "stop" });
    expect(P("done")).toEqual({ lights: "smile", tone: "light" });
  });
  test("the lights always agree with the ring: something waiting is amber whatever it does; a stop stays red", () => {
    expect(visorPose("working", ringFor("working", 1))).toEqual({ lights: "needs", tone: "needs" });
    expect(visorPose("idle", ringFor("idle", 2))).toEqual({ lights: "needs", tone: "needs" });
    expect(visorPose("error", ringFor("error", 3))).toEqual({ lights: "rest", tone: "stop" });
    expect(visorPose("off", ringFor("off", 3))).toEqual({ lights: "none", tone: "light" });
    // Home's ring, from its status line, wins over the state's own.
    expect(visorPose("idle", "proven")).toEqual({ lights: "smile", tone: "light" });
    expect(visorPose("done", null)).toEqual({ lights: "rest", tone: "light" });
    expect(visorPose("listening", null)).toEqual({ lights: "meter", tone: "light" });   // Home shows no ring while it listens
    expect(visorPose("listening", "needs")).toEqual({ lights: "needs", tone: "needs" });
  });
});

describe("its motion (characters.ts visorMotion)", () => {
  const on = { reduced: false, still: false, lively: "lively" as const, reacts: true };
  test("blink at rest, scan while working, a meter while listening, a lean when it needs you, one hop when proven", () => {
    expect(visorMotion(visorPose("idle", null), on)).toEqual({ blink: true, glance: true, scan: false, meter: false, lean: false, hop: false });
    expect(visorMotion(visorPose("working", "working"), on)).toMatchObject({ scan: true, blink: false, glance: false });
    expect(visorMotion(visorPose("listening", "working"), on)).toMatchObject({ meter: true, scan: false });
    expect(visorMotion(visorPose("needsYou", "needs"), on)).toMatchObject({ lean: true, blink: false });
    expect(visorMotion(visorPose("done", "proven"), on)).toMatchObject({ hop: true, blink: false });
    expect(Object.values(visorMotion(visorPose("error", "stop"), on)).some(Boolean)).toBe(false);
    expect(Object.values(visorMotion(visorPose("off", null), on)).some(Boolean)).toBe(false);
  });
  test("How lively: Still no blink and no glance, Gentle blinks, Lively blinks and glances; the state's own moves stay", () => {
    expect(visorMotion(visorPose("idle", null), { ...on, lively: "still" })).toMatchObject({ blink: false, glance: false });
    expect(visorMotion(visorPose("idle", null), { ...on, lively: "gentle" })).toMatchObject({ blink: true, glance: false });
    expect(visorMotion(visorPose("working", "working"), { ...on, lively: "still" }).scan).toBe(true);
  });
  test("the band alone in the notch never hops, even with reactions on (step 4 review); it still glances", () => {
    expect(visorMotion(visorPose("done", "proven"), { ...on, band: true }).hop).toBe(false);
    expect(visorMotion(visorPose("idle", null), { ...on, band: true }).glance).toBe(true);
    expect(read("./ui/parts.tsx")).toContain("visorMotion(pose, { reduced, still: !!still, lively, reacts, band: !!band })");
  });
  test("Reactions off: no glance and no hop", () => {
    expect(visorMotion(visorPose("idle", null), { ...on, reacts: false }).glance).toBe(false);
    expect(visorMotion(visorPose("done", "proven"), { ...on, reacts: false }).hop).toBe(false);
  });
  test("Reduce motion, Less motion, rest and a panel not on screen: nothing moves, only the still pose", () => {
    for (const s of STATES) for (const m of [{ ...on, reduced: true }, { ...on, still: true }]) expect(Object.values(visorMotion(visorPose(s, ringOf(s)), m)).some(Boolean), s).toBe(false);
  });
  test("a glance comes at most once every eight seconds, and never while the page is hidden", () => {
    expect(glanceDue(10_000, null, false)).toBe(true);
    expect(glanceDue(10_000, 5_000, false)).toBe(false);
    expect(glanceDue(13_001, 5_000, false)).toBe(true);
    expect(glanceDue(13_001, 5_000, true)).toBe(false);
    expect(VISOR_MS.glanceGap).toBe(8000);
  });
  test("the meter: a number in, a scale out, never flat and never past full", () => {
    expect(meterScales(0)).toEqual([0.25, 0.25, 0.25]);
    expect(meterScales(1)).toEqual([0.775, 1, 0.85]);
    expect(meterScales(5)).toEqual(meterScales(1));
    expect(meterScales(Number.NaN)).toEqual(meterScales(0));
  });
});

describe("the drawing, copied from the lab", () => {
  test("glass, band and lights at the lab's numbers", () => {
    expect(VISOR_VIEWBOX).toBe("12 12 76 76");
    expect(VISOR_GLASS).toEqual({ cx: 50, cy: 50, r: 38 });
    expect(VISOR_GLASS_GRADIENT).toEqual({ cx: "36%", cy: "30%", r: "75%", stops: [[0, "#E6F0FF"], [0.18, "#8DB6FF"], [0.55, "#2F64D6"], [1, "#0F2558"]] });
    expect(VISOR_BAND).toEqual({ x: 20, y: 40, w: 60, h: 18, rx: 9 });
    expect(VISOR_REST).toEqual([{ x: 36, y: 46, w: 8, h: 6, rx: 3 }, { x: 56, y: 46, w: 8, h: 6, rx: 3 }]);
    expect(VISOR_SCAN).toEqual({ x: 40, y: 47, w: 20, h: 4, rx: 2 });
    expect(VISOR_SCAN_TRAVEL).toBe(14);
    expect(VISOR_NEEDS).toEqual([{ x: 35, y: 44, w: 9, h: 10, rx: 4.5 }, { x: 56, y: 44, w: 9, h: 10, rx: 4.5 }]);
    expect(VISOR_SMILE).toEqual({ d: "M36 46 q14 9 28 0", width: 3.2 });
  });
  test("every light stays inside the band, the scan too at both ends", () => {
    const inside = (b: Box, dx = 0) => b.x + dx >= VISOR_BAND.x && b.x + b.w + dx <= VISOR_BAND.x + VISOR_BAND.w && b.y >= VISOR_BAND.y && b.y + b.h <= VISOR_BAND.y + VISOR_BAND.h;
    for (const b of [...VISOR_REST, ...VISOR_NEEDS, ...VISOR_METER]) expect(inside(b), JSON.stringify(b)).toBe(true);
    expect(inside(VISOR_SCAN, -VISOR_SCAN_TRAVEL) && inside(VISOR_SCAN, VISOR_SCAN_TRAVEL)).toBe(true);
  });
  test("its colours are tokens, fixed in every theme, copied from the lab; the art file holds only the glass", () => {
    const t = TOKENS_CSS();
    expect(t).toContain("--visor-band: rgba(6, 10, 24, .78);");
    expect(t).toContain("--visor-light: #9CC8FF;");
    expect(t).toContain("--visor-glow: rgba(130, 190, 255, .9);");
    expect(t).toContain("--visor-needs: #FFD27A;");
    expect(t).toContain("--visor-needs-glow: rgba(255, 190, 80, .9);");
    expect(t).toContain("--visor-stop: #FF8C86;");
    const hexes = [...read("./visorArt.ts").matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0]);
    expect(hexes.sort()).toEqual(VISOR_GLASS_GRADIENT.stops.map(([, c]) => c).sort());
  });
});

describe("the part (ui/parts.tsx Visor)", () => {
  const html = (s: CharacterState, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(Visor, { state: s, ring: ringOf(s), ...extra }));
  test("inside the same ring span as the orb, so the M65 ring is untouched", () => {
    expect(html("working")).toMatch(/^<span class="ui-orb ui-visor" data-ring="working"/);
    expect(html("idle")).not.toContain("data-ring=");
    expect(html("needsYou")).toContain('data-pose="needs" data-tone="needs"');
  });
  test("no face parts beyond the visor: no mouth, eyes, brows, bubbles, water; nothing but the glass, the band and its lights", () => {
    for (const s of STATES) {
      const h = html(s);
      expect(h, s).not.toMatch(/mouth|eye|brow|bubble|water|<canvas|<img|<ellipse/i);
      const kinds = [...h.matchAll(/<(\w+)[\s>]/g)].map((m) => m[1]);
      for (const k of kinds) expect(["span", "svg", "defs", "radialGradient", "stop", "circle", "rect", "path", "g"], `${s}: ${k}`).toContain(k);
    }
  });
  test("every pose stays mounted: twenty quick state changes never add or take away a node, they cross fade", () => {
    const count = (h: string) => (h.match(/<[a-zA-Z]/g) ?? []).length;
    const first = count(html("idle"));
    for (let i = 0; i < 20; i++) {
      const s = STATES[(i * 7) % STATES.length];
      expect(count(html(s, { ring: ringFor(s, i % 3 === 0 ? 1 : 0) })), s).toBe(first);
    }
    expect(count(renderToStaticMarkup(createElement(Visor, { state: "listening", ring: "working", level: 0.6 })))).toBe(first);
  });
  test("the band alone for the notch's wing: the same lights, a smaller box", () => {
    const band = renderToStaticMarkup(createElement(Visor, { state: "working", ring: "working", band: true }));
    expect(band).toContain('viewBox="20 40 60 18"');
    expect(band).toContain('data-band=""');
  });
  test("a level, when one reaches the page, sets the meter bars by transform only", () => {
    const h = renderToStaticMarkup(createElement(Visor, { state: "listening", ring: "working", level: 1 }));
    expect(h).toContain('data-level=""');
    expect(h).toContain("transform:scaleY(1)");
    expect(h).not.toMatch(/style="[^"]*(height|width|top|left)/);
  });
  test("it pauses while the page is hidden and plays the hop once, never on a loop", () => {
    const src = read("./ui/parts.tsx");
    const part = src.slice(src.indexOf("export function Visor"), src.indexOf("\n}\n", src.indexOf("export function Visor")));
    expect(part).toContain("visibilitychange");
    expect(part).toContain("document.hidden");
    expect(part).toContain("onAnimationEnd");
  });
  test("the lean and the hop move the whole part, so the ring rides with the glass and never slips out of it", () => {
    const src = read("./ui/parts.tsx");
    const part = src.slice(src.indexOf("export function Visor"), src.indexOf("\n}\n", src.indexOf("export function Visor")));
    // The animation end is heard on the span (the hop runs there, and the blink and glance bubble up to it).
    expect(part).toMatch(/<span className="ui-orb ui-visor"[^>]*onAnimationEnd=\{ended\}/);
    expect(part).not.toMatch(/<svg[^>]*onAnimationEnd/);
    expect(part).toContain('e.animationName === "visor-blink"');
  });
});

describe("its stylesheet", () => {
  const css = PARTS_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
  const visorRules = css.split("}").filter((r) => /ui-visor|visor-/.test(r)).join("}");
  test("its times are tokens matching motionTokens.ts, and it loops only what says a state; the hop and the glance play once", () => {
    const tok = (n: string) => new RegExp(`${n}: ([\\d.]+)(ms|s);`).exec(TOKENS_CSS());
    const ms = (n: string) => { const m = tok(n)!; return Number(m[1]) * (m[2] === "s" ? 1000 : 1); };
    expect(ms("--loop-visor-blink")).toBe(VISOR_MS.blink);
    expect(ms("--loop-visor-scan")).toBe(VISOR_MS.scan);
    expect(ms("--loop-visor-lean")).toBe(VISOR_MS.lean);
    expect(ms("--loop-visor-pulse")).toBe(VISOR_MS.pulse);
    expect(ms("--dur-visor-hop")).toBe(VISOR_MS.hop);
    expect(ms("--dur-visor-glance")).toBe(VISOR_MS.glance);
    expect(VISOR_MS).toMatchObject({ blink: 4600, scan: 1300, lean: 2600, hop: 840, glance: 2400 });
    // The hop and the glance play once, the lean twice on arriving at needs you, the blink three times and then rests (re
    // armed by something new): only what says a working state (the scan, the listening pulse) loops.
    const runs: Record<string, string> = { "visor-hop": "1", "visor-glance": "1", "visor-lean": "2", "visor-blink": "3" };
    for (const m of visorRules.matchAll(/animation: (visor-[\w-]+)[^;]*;/g)) {
      const n = runs[m[1]];
      expect(m[0].includes("infinite"), m[0]).toBe(n === undefined);
      if (n) expect(m[0], m[0]).toMatch(new RegExp(`\\) ${n}( both)?;$`));
    }
    expect(Object.keys(runs).every((k) => visorRules.includes(`animation: ${k} `))).toBe(true);
    expect(visorRules).toContain("animation: visor-scan var(--loop-visor-scan) var(--ease-loop) infinite alternate");
  });
  test("the glow is never animated, and the keyframes move only transform and opacity", () => {
    for (const k of css.matchAll(/@keyframes visor-[\w-]+ \{([\s\S]*?\}\s*)\}/g)) expect(k[1], k[0]).not.toMatch(/filter|box-shadow|width|height|fill/);
  });
  test("the ring moves with the lean and the hop: both run on the outer span, never on the glass alone", () => {
    expect(visorRules).toMatch(/\.ui-visor\[data-lean\] \{[^}]*animation: visor-lean/);
    expect(visorRules).toMatch(/\.ui-visor\[data-hop\] \{[^}]*animation: visor-hop/);
    expect(visorRules).not.toMatch(/\.visor-body \{[^}]*animation/);
    expect(TOKENS_CSS()).toContain("--visor-hop-up: -5.3%;");
  });
  test("a hidden page, rest and still pause or stop every loop", () => {
    expect(visorRules).toMatch(/\.ui-visor\[data-paused\] \*[^{]*\{ animation-play-state: paused !important; /);
    expect(visorRules).toMatch(/\.ui-visor\[data-still\] \*[^{]*\{ animation: none !important; /);
  });
});

describe("no WebGL on the visor's path", () => {
  test("the part, its art and its pose import nothing that draws with WebGL, and mount no canvas", () => {
    const seen = new Set<string>();
    const walk = (url: URL) => {
      if (seen.has(url.pathname)) return;
      seen.add(url.pathname);
      const src = readFileSync(url, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, url.pathname).not.toMatch(/getContext\(["']webgl|WebGL2?RenderingContext|<canvas/);
      for (const m of src.matchAll(/(?:from|import\() ?"([^"]+)"/g)) expect(m[1], url.pathname).not.toMatch(/^three|flowflow\/|(^|\/)flow\//);
      for (const m of src.matchAll(/^import [^;]*?from "(\.\.?\/[^"]+\.tsx?)";/gm)) walk(new URL(m[1], url));
    };
    walk(new URL("./ui/parts.tsx", import.meta.url));
    walk(new URL("./visorArt.ts", import.meta.url));
    expect(seen.size).toBeGreaterThan(3);
  });
});

// M71 (5 Nov 2026): the style is retired, but a store that had the Friendly style with "match" had the water character, and
// the founder was told it stays. So "match" (or nothing chosen) reads the retired style once: Friendly keeps the water.
describe("a stored Friendly look keeps its water character", () => {
  test("match or nothing chosen, with the retired Friendly style, is the water character", () => {
    expect(characterOf("match", "friendly")).toBe("friendly");
    expect(characterOf(undefined, "friendly")).toBe("friendly");
    expect(characterOf("match", "instrument")).toBe("visor");
    expect(characterOf("match")).toBe("visor");
  });
  test("an explicit choice always wins over the retired style", () => {
    expect(characterOf("visor", "friendly")).toBe("visor");
    expect(characterOf("orb", "friendly")).toBe("orb");
    expect(characterOf("friendly", "instrument")).toBe("friendly");
  });
  test("every place that draws the character, and Settings, read the retired style the same way", () => {
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
    // M72: through the one character in force, which reads what is actually stored (m72Character.test.ts).
    expect(read("./homeCharacter.tsx")).toContain("useCharacter()");
    expect(read("./flowflowMini.tsx")).toContain("useCharacter()");
    expect(read("./settingsStore.ts")).toContain('characterOf(storedSetting("look.character", st), storedSetting("look.style", st))');
    expect(read("./lookfeel.ts")).toContain('characterOf(values["look.character"], values["look.style"])');
    expect(shownValue("look.character", "match", "friendly")).toBe("friendly");
    expect(shownValue("look.character", "match")).toBe("visor");
  });
});
