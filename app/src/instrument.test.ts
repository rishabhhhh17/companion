// M65, the grown up look (4 Nov 2026, the founder: the look is "too childish"; he picked look A, Instrument, from the lab).
// Instrument is the usual style; Friendly, the look from before, stays a choice and looks exactly as it did. These tests pin
// the foundation: the two settings, the attributes on the page, the tokens of the Instrument style in every theme (sizes,
// corners, motion and colour, with their contrast), the new parts, and the faceless orb's state ring.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { characterOf, CHARACTER_CHOICES, FIXED_LOOK, lookAttrs, THEMES, WATERS, type Water } from "./lookfeel.ts";
import { ringFor, ringOf, type Ring } from "./characters.ts";
import { glassOrbSvg, ORB_STOPS, paletteOf, poseSvg } from "./orbArt.ts";
import type { CharacterState } from "./model.ts";
import { PAGES, placeOf } from "./settingsPages.ts";
import { S } from "./strings.ts";
import { ALL_CSS, LOOK_CSS, PARTS_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { MOTION_SPRING, springLinear } from "./motionTokens.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = JSON.parse(read("../../protocol/settings.json")) as { settings: { key: string; kind: string; default: unknown; options?: string[]; applies: string[]; section: string; live: boolean; store: string }[] };
const def = (k: string) => registry.settings.find((s) => s.key === k);

// ---------- reading the stylesheets ----------
type Block = { sel: string; media: string | null; decl: Record<string, string> };
function blocks(css0: string, media: string | null = null): Block[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Block[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@media")) out.push(...blocks(body, head));
    else if (!head.startsWith("@")) {
      const decl: Record<string, string> = {};
      for (const d of body.split(";")) { const c = d.indexOf(":"); if (c > 0) decl[d.slice(0, c).trim()] = d.slice(c + 1).trim(); }
      out.push({ sel: head, media, decl });
    }
    i = close + 1;
  }
  return out;
}
const tok = blocks(TOKENS_CSS());
const MORE = /prefers-contrast: more/;
const block = (sel: string, media: RegExp | null = null) => tok.find((b) => b.sel === sel && (media ? media.test(b.media ?? "") : !b.media))?.decl ?? {};
const root = block(":root");
const IS = ':root[data-style="instrument"]';
const themeSel = (t: string | null) => (t && t !== "graphite" ? `:root[data-theme="${t}"]` : null);
/** A theme's tokens in a style, in the order the page's cascade gives them, with the water chosen set on the page. */
function tokensOf(style: "instrument" | "friendly", theme: string | null, more = false, water: Water = "ocean"): Record<string, string> {
  const th = themeSel(theme);
  const waterBlock = water === "ocean" ? {} : block(`:root[data-water="${water}"]`);
  if (style === "friendly") return { ...root, ...(more ? block(":root", MORE) : {}), ...(th ? block(th) : {}), ...(th && more ? block(th, MORE) : {}), ...waterBlock };
  return {
    ...root, ...(more ? block(":root", MORE) : {}), ...block(IS), ...(more ? block(IS, MORE) : {}),
    ...(th ? block(th) : {}), ...(th && more ? block(th, MORE) : {}), ...waterBlock,
    ...block(`${IS}[data-tone]`), ...(th ? block(`${IS}[data-theme="${theme}"]`) : {}),
  };
}
type RGBA = [number, number, number, number];
function colour(v0: string, t: Record<string, string>): RGBA {
  const v = v0.trim();
  const vr = /^var\((--[\w-]+)\)$/.exec(v);
  if (vr) return colour(t[vr[1]] ?? "", t);
  if (v === "transparent") return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((k) => parseInt(hex[1].slice(k, k + 2), 16)).concat(1) as RGBA;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) { const p = rgb[1].split(",").map((x) => Number(x.trim())); return [p[0], p[1], p[2], p[3] ?? 1]; }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(v);
  if (mix) { const a = colour(mix[1], t), b = colour(mix[3], t), p = Number(mix[2]) / 100; return [0, 1, 2, 3].map((k) => a[k] * p + b[k] * (1 - p)) as RGBA; }
  throw new Error(`a colour this test cannot read: ${v0}`);
}
const over = (top: RGBA, under: RGBA): RGBA => [0, 1, 2].map((k) => top[k] * top[3] + under[k] * (1 - top[3])).concat(1) as RGBA;
const lum = (c: RGBA) => { const f = (x: number) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
// M69: words drawn in an ink with opacity (Instrument's one ink, spec 1.2) are measured as they show, over what is under them.
const ratio = (a0: RGBA, b: RGBA) => { const a = a0[3] < 1 && b[3] === 1 ? over(a0, b) : a0; const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const px = (v: string) => { const rem = /^calc\((\d+(?:\.\d+)?)rem \/ 14\)$/.exec(v); return rem ? Number(rem[1]) : parseFloat(v); };
const ms = (v: string) => parseFloat(v);
const parts = blocks(PARTS_CSS());
const part = (sel: string) => parts.find((b) => b.sel === sel && !b.media)?.decl ?? {};
const ALL_THEMES = ["graphite", "paper", "deep", "black"] as const;

describe("the style and the character are real settings, and a store from before still loads", () => {
  test("both stay in the registry for the pages, live; M71 retires the style (hidden) and makes the Visor the usual", () => {
    expect(def("look.style")).toMatchObject({ section: "look", kind: "choice", default: "instrument", options: ["instrument", "friendly"], applies: ["pages"], store: "settings", live: true, hidden: true });
    expect(def("look.character")).toMatchObject({ section: "look", kind: "choice", default: "visor", options: [...CHARACTER_CHOICES, "match"], applies: ["pages"], store: "settings", live: true });
    expect(FIXED_LOOK["data-style"]).toBe("instrument");
  });
  test("a store saved before M65 or M71 reads the one black look, whatever it saved; a Friendly store keeps its water character", () => {
    const before = { "look.theme": "night", "look.density": "compact", "look.icons": "colour", "look.stamps": false, "look.gloss": "on", "look.corners": "crisp", "look.light": "moving", "look.colour": "vivid", "look.style": "friendly" };
    expect(lookAttrs(before)).toEqual({ ...FIXED_LOOK, "data-colours": "colourful", "data-character": "friendly" });   // M71: the founder was told the water stays
    expect(lookAttrs({ ...before, "look.style": "instrument" })).toEqual({ ...FIXED_LOOK, "data-colours": "colourful", "data-character": "visor" });
  });
  test("the Visor unless another is picked, and the face, bubbles and water are the water character's only", () => {
    expect(characterOf(undefined)).toBe("visor");   // M68: the Visor; M71: the usual whatever the retired style says
    expect(characterOf("match")).toBe("visor");
    expect(characterOf("friendly")).toBe("friendly");
    expect(characterOf("nonsense")).toBe("visor");
    expect(characterOf("orb")).toBe("orb");   // a store that picked the orb keeps it
    // The orb is the lab's quiet glass (M65 step 4, the critics: the reused friendly body read as a candy marble): one
    // round body lit from the top left, a shade at its foot and a fine dark rim. No face, no bubbles, no light ring inside
    // the rim, no crescent, no sparkles, no big white glint.
    for (const w of WATERS) {
      const svg = glassOrbSvg(w);
      expect(svg, w).not.toMatch(/class="eye"|class="bubble/);
      expect(svg.match(/class="orb"/g)?.length, w).toBe(1);
      expect(svg, w).not.toContain(paletteOf(w).ink);
      expect(svg, w).not.toMatch(/<ellipse|<path|ring\)|clip-path|filter=/);
      expect(svg.match(/<circle/g)?.length, w).toBe(3);   // the body, its foot's shade, the rim
      const stops = ORB_STOPS[w];
      for (const c of stops) expect(svg, w).toContain(c);
      // Its middle (the 38 percent stop) is a deep tone, never a light cyan: no lighter than Ocean's.
      expect(lum(colour(stops[2], {})), w).toBeLessThanOrEqual(lum(colour(ORB_STOPS.ocean[2], {})) + 0.02);
    }
    expect(ORB_STOPS.ocean).toEqual(["#FFFFFF", "#CFE3FF", "#6FA8FF", "#2559C8", "#13306F"]);
    expect(poseSvg("look")).toMatch(/class="eye"/);
  });
  test("both sit first on the Look page, with their words, and the Look page stays at ten", () => {
    // M71: Colour and Character lead the Look page; the style is retired (hidden, still loads).
    expect(PAGES.look.groups[0].items.slice(0, 2)).toEqual(["look.colour", "look.character"]);
    expect(placeOf("look.style")).toBeNull();
    for (const k of ["look.character"] as const) {
      expect(placeOf(k), k).toMatchObject({ page: "look", more: false });
      const w = S.set[k] as { label: string; help: string; also: readonly string[]; options: Record<string, string> };
      for (const o of def(k)!.options!) expect(w.options[o], `${k} ${o}`).toBeTruthy();
      for (const t of [w.label, w.help, S.short[k]]) expect(t, k).not.toMatch(/[–—]/);
      for (const sentence of w.help.split(/(?<=[.!?:])\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(25);
    }
    expect(S.set["look.style"].options).toEqual({ instrument: "Instrument", friendly: "Friendly" });
    expect(S.set["look.character"].options).toEqual({ visor: "Visor", orb: "Glass orb", friendly: "Water", match: "Visor" });
    expect(PAGES.look.groups.flatMap((g) => g.items)).toHaveLength(4);
  });
  test("Home and Settings set both on their root; the notch keeps its own look", () => {
    const hook = read("./useLook.ts");
    expect(hook).toContain('const character = storedSetting("look.character"), style = storedSetting("look.style");');
    // M72 (finding 2): the style goes through too, so the root agrees with the drawn character.
    expect(hook).toContain('{ "look.colour": colour, "look.character": character, "look.style": style }');
    expect(read("./island.tsx")).toContain("useLook({ keepNight: true });");
  });
});

describe("Friendly is exactly the look from before", () => {
  test("no rule matches the Friendly style, so a Friendly page has :root's own tokens", () => {
    expect(ALL_CSS()).not.toContain('[data-style="friendly"]');
    expect(ALL_CSS()).not.toMatch(/\[data-character=/);
  });
  test("the tokens added for M65 hold the values the parts read before", () => {
    expect(root["--r-main"]).toBe("var(--r-pill)");
    expect(root["--r-chip"]).toBe("var(--r-pill)");
    expect(root["--r-badge"]).toBe("var(--r-pill)");
    expect(root["--tag-bg"]).toBe("transparent");
    expect(root["--tag-edge"]).toBe("var(--line-strong)");
    expect(root["--seg-thumb"]).toBe("var(--pick-wash)");
    expect(root["--seg-thumb-edge"]).toBe("var(--pick)");
    expect(root["--tick-fill"]).toBe("var(--water)");
    // And the parts read them where they read the old values.
    expect(part(".btn.primary")["border-radius"]).toBe("var(--r-main)");
    expect(part('.btn.quiet[aria-pressed="true"]')["border-radius"]).toBe("var(--r-main)");
    expect(part(".ui-chip")["border-radius"]).toBe("var(--r-chip)");
    expect(part(".ui-tag")).toMatchObject({ border: "var(--hair) solid var(--tag-edge)", background: "var(--tag-bg)" });
    expect(LOOK_CSS()).not.toMatch(/\.home \.btn:not\(\.primary[^{]*\{[^}]*var\(--r-pill\)/);
  });
  test("Friendly's sizes, corners and motion are the ones it had", () => {
    expect(root).toMatchObject({ "--t-display": "calc(22rem / 14)", "--t-body": "calc(13rem / 14)", "--r-control": "8px", "--r-card": "12px", "--h-md": "32px", "--h-lg": "40px", "--dur-1": "120ms", "--dur-3": "240ms" });
    // M66: one motion table for both looks; the spring settles and never passes 1 (motionTokens.ts MOTION_SPRING).
    expect(root["--ease-spring"]).toBe(springLinear(MOTION_SPRING));
  });
});

describe("Instrument's sizes, corners and motion (the lab's look A)", () => {
  const ins = tokensOf("instrument", null);
  test("the Mac's own face, 13 px body, a 17 px semibold headline with a little negative tracking", () => {
    expect(ins["--font"]).toBe("-apple-system, sans-serif");
    expect(px(ins["--t-body"])).toBe(13);
    expect(px(ins["--t-display"])).toBe(17);
    expect(ins["--w-bold"]).toBe("600");
    expect(parseFloat(ins["--track-display"])).toBeLessThan(0);
    expect(parseFloat(ins["--track-display"])).toBeGreaterThan(-0.02);
  });
  test("6 px button corners on 28 px rectangle buttons, 8 to 10 px card corners, small tags", () => {
    expect(ins["--r-control"]).toBe("6px");
    expect(ins["--r-main"]).toBe("var(--r-control)");
    expect(ins["--h-md"]).toBe("28px");
    expect(ins["--h-lg"]).toBe("28px");
    expect(px(ins["--r-card"])).toBeGreaterThanOrEqual(8);
    expect(px(ins["--r-card"])).toBeLessThanOrEqual(10);
    for (const k of ["--r-key", "--r-thumb", "--r-tile", "--r-stamp"]) expect(px(ins[k]), k).toBeLessThanOrEqual(4);
  });
  test("Compact and Crisp still work on top of it, and no target goes under 24 points", () => {
    const c = { ...ins, ...block(':root[data-density="compact"]'), ...block(`${IS}[data-density="compact"]`) };
    for (const k of ["--h-md", "--h-lg", "--h-row", "--h-bar", "--h-ask"]) {
      expect(px(c[k]), k).toBeLessThanOrEqual(px(ins[k]));
      expect(px(c[k]), k).toBeGreaterThanOrEqual(24);
    }
    const crisp = block(`${IS}[data-corners="crisp"]`);
    for (const [k, v] of Object.entries(crisp)) expect(px(v), k).toBeLessThanOrEqual(px(ins[k]) / 2);
    expect(Object.keys(crisp).sort()).toEqual(Object.keys(block(':root[data-corners="crisp"]')).sort());
  });
  test("motion is the one table both looks share (M66), and the spring settles with no overshoot", () => {
    for (const k of ["--dur-1", "--dur-2", "--dur-3", "--dur-4", "--dur-enter", "--dur-move", "--dur-hover", "--ease-out", "--ease-exit", "--ease-spring"]) expect(ins[k], k).toBe(root[k]);
    expect([ms(ins["--dur-1"]), ms(ins["--dur-2"]), ms(ins["--dur-3"]), ms(ins["--dur-4"])]).toEqual([120, 200, 240, 320]);
    const pts = /^linear\((.+)\)$/.exec(ins["--ease-spring"])![1].split(",").map(Number);
    expect(pts[0]).toBe(0);
    expect(pts.at(-1)).toBe(1);
    for (let i = 1; i < pts.length; i++) expect(pts[i], `point ${i}`).toBeGreaterThanOrEqual(pts[i - 1]);
    expect(Math.max(...pts)).toBe(1);
    expect(pts[1], "it answers at once, never an ease in").toBeGreaterThan(0.05);
  });
  test("the Graphite page is the lab's #161618 family, and Black is the look", () => {
    expect(ins).toMatchObject({ "--bg": "#161618", "--surface-1": "#1D1D20", "--surface-2": "#26262A" });
    expect(tokensOf("instrument", "black")["--bg"]).toBe("var(--surface-0)");   // M71: the black look's surface 0
    expect(tokensOf("instrument", "black")["--surface-0"]).toBe("#000000");
    // M72: the White (paper) and Deep blocks are gone with the themes M71 retired.
  });
  test("buttons: the main one filled with the accent, the others a hairline edge with no gloss, in every theme", () => {
    for (const t of ALL_THEMES) {
      const k = tokensOf("instrument", t);
      expect(k["--main"], t).toBe("var(--acc)");
      expect(k["--main-ink"], t).toBe("var(--acc-ink)");
      // M69 (spec 1.6): a key, a faint glass line on top and the accent's deep step as its 2 point edge; no gloss, no glow.
      expect(k["--main-shadow"], t).toBe("inset 0 1px 0 rgba(255, 255, 255, .22), inset 0 -2px 0 var(--acc-deep)");
      expect(k["--main-shadow-press"], t).toBe("inset 0 -1px 0 var(--acc-deep)");
      expect(k["--keycap"], t).toBe("transparent");
      expect(k["--keycap-ring"], t).toBe("var(--line-strong)");
      for (const g of ["--gel-lip", "--gel-gloss", "--gel-glow"]) expect(k[g], `${t} ${g}`).toBe("transparent");
    }
    // M71: the rooms are retired, so Instrument keeps no [data-element] block for the gel.
    expect(TOKENS_CSS()).not.toContain(`${IS} [data-element]`);
  });
});

describe("Instrument's colour: only where it means something, and readable in every theme with every water", () => {
  for (const t of ALL_THEMES) for (const more of [false, true]) {
    const name = `${t}${more ? ", more contrast" : ""}`;
    test(`${name}: words read on every surface, and the accent fill carries white words and stands out on the page`, () => {
      for (const w of WATERS) {
        const k = tokensOf("instrument", t, more, w);
        const c = (v: string) => colour(v, k);
        for (const s of ["--bg", "--surface-1", "--surface-2", "--surface-3", "--inset"]) for (const f of ["--fg", "--fg-2"]) expect(ratio(c(`var(${f})`), c(`var(${s})`)), `${w} ${f} on ${s}`).toBeGreaterThanOrEqual(4.5);
        for (const f of ["--acc", "--acc-hover", "--acc-press"]) expect(ratio(c("var(--acc-ink)"), c(`var(${f})`)), `${w} white on ${f}`).toBeGreaterThanOrEqual(4.5);
        for (const s of ["--bg", "--surface-1"]) expect(ratio(c("var(--acc)"), c(`var(${s})`)), `${w} the accent on ${s}`).toBeGreaterThanOrEqual(3);
        // The second words in Home's room are the page's own grey, never tinted (and still 4.5 to 1).
        for (const s of ["--bg", "--surface-1", "--surface-2"]) expect(ratio(c("var(--fg-2-room)"), c(`var(${s})`)), `${w} room words on ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    test(`${name}: the orb's ring, the status line, a stop tag and a file's counts read on the page and a card`, () => {
      const k = tokensOf("instrument", t, more);
      const c = (v: string) => colour(v, k);
      for (const s of ["--bg", "--surface-1"]) {
        const under = c(`var(${s})`);
        for (const r of ["--ring-stop", "--ring-needs", "--ring-proven", "--ring-working"]) expect(ratio(c(`var(${r})`), under), `${r} on ${s}`).toBeGreaterThanOrEqual(3);
        for (const tone of ["needs", "proven", "stop", "working"]) {
          const words = part(`.ui-status[data-tone="${tone}"]`).color;
          expect(ratio(c(words), under), `status ${tone} on ${s}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(ratio(c(part(".ui-status").color), under), `status plain on ${s}`).toBeGreaterThanOrEqual(4.5);
        for (const sel of [".ui-file-plus", ".ui-file-minus", ".ui-file-dir", ".ui-file-diff", ".ui-foot"]) expect(ratio(c(part(sel).color), under), `${sel} on ${s}`).toBeGreaterThanOrEqual(4.5);
        const stop = part('.ui-tag[data-tone="stop"]');
        expect(ratio(c(stop.color), over(c(stop.background), under)), `a stop tag on ${s}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(c(part(".ui-tag").color), over(c(part(".ui-tag").background), under)), `a tag on ${s}`).toBeGreaterThanOrEqual(4.5);
      }
      // A picked segmented option is found by its edge (3 to 1 on its track), not by a tint alone.
      expect(ratio(over(c("var(--seg-thumb-edge)"), c("var(--inset)")), c("var(--inset)")), "the picked option's edge").toBeGreaterThanOrEqual(3);
    });
  }
  test("Friendly's themes are measured the same way, with the accent fill too", () => {
    for (const t of ALL_THEMES) for (const w of WATERS) {
      const k = tokensOf("friendly", t, false, w);
      expect(ratio(colour("var(--acc-ink)", k), colour("var(--acc)", k)), `${t} ${w}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(THEMES).toEqual(["black", "paper", "graphite", "deep"]);
  });
});

describe("the faceless orb's ring says the state, in a meaning's colour", () => {
  const STATES: CharacterState[] = ["off", "idle", "listening", "thinking", "working", "checking", "needsYou", "done", "error"];
  test("each state has its ring: none at rest or off, the accent while working, amber needs you, green proven, red stop", () => {
    const want: Record<CharacterState, Ring | null> = { off: null, idle: null, listening: "working", thinking: "working", working: "working", checking: "working", needsYou: "needs", done: "proven", error: "stop" };
    // A question or an approval waiting turns the ring amber whatever the agent is doing (M65 step 4: the dock showed a
    // working ring beside a count of questions waiting).
    for (const s of STATES) expect(ringFor(s, 1), s).toBe(s === "off" ? null : s === "error" ? "stop" : "needs");
    for (const s of STATES) expect(ringFor(s, 0), s).toBe(want[s]);
    for (const s of STATES) expect(ringOf(s), s).toBe(want[s]);
  });
  test("each ring is a token, and each token is its meaning's own colour", () => {
    const RING_TOKEN: Record<Ring, [string, string]> = { stop: ["--ring-stop", "var(--bad)"], needs: ["--ring-needs", "var(--amber)"], proven: ["--ring-proven", "var(--ok)"], working: ["--ring-working", "var(--focus)"] };
    for (const [r, [token, meaning]] of Object.entries(RING_TOKEN)) {
      expect(part(`.ui-orb[data-ring="${r}"]`)["outline-color"], r).toBe(`var(${token})`);
      expect(root[token], r).toBe(meaning);
    }
    // At rest there is no ring: the outline is there, transparent, so a state change fades it in.
    expect(part(".ui-orb")).toMatchObject({ outline: "var(--orb-ring) solid transparent", "outline-offset": "var(--orb-gap)", width: "var(--orb)", height: "var(--orb)" });
    expect(root["--orb"]).toBe("40px");
    // A 2 point ring 2 points out from the orb (M65 step 4: the 1.5 point accent ring vanished against the blue orb). Working
    // is the focus colour, the accent's light step on a dark page and its deep step on White, so it parts from the orb.
    expect(root["--orb-ring"]).toBe("2px");
    expect(root["--orb-gap"]).toBe("2px");
    expect(parts.filter((b) => b.sel.startsWith(".ui-orb[data-ring=")).map((b) => b.sel).sort()).toEqual(Object.keys(RING_TOKEN).map((r) => `.ui-orb[data-ring="${r}"]`).sort());
  });
  test("the orb is a picture beside words: hidden from VoiceOver, its ring set from the state", () => {
    const tsx = read("./ui/parts.tsx");
    expect(tsx).toContain('<span className="ui-orb" data-ring={ring ?? undefined} aria-hidden="true">');
    expect(S.ui.status).toEqual({ needs: "Needs you", proven: "Proven", notChecked: "Not checked yet", working: "Working", stop: "Not fixed yet", fixFirst: "Fix this first" });
    expect(S.ui.fileDiff(12, 3)).toBe("12 lines added, 3 lines taken away");
    expect(S.ui.fileDiff(0, 1)).toBe("1 line taken away");
  });
});
