// M69, the system (docs/milestones/M69-full-fledged.md, items 2 and 4; the YC benchmark spec sections 1 and 3): the type
// scale's display steps, one ink at opacity steps for White and Graphite, the status tag, the key style buttons, the floating
// ask box, and one layout grammar for every look and both layouts. Friendly keeps working: the same grammar, its own colours.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { barContext, barKeyChord, shortPath } from "./homeLayout.ts";
import { barPlaces } from "./homeHero.ts";
import { KEY_USUAL } from "./keys.ts";
import { WATERS, WATER_TINTS, type Water } from "./lookfeel.ts";
import { S } from "./strings.ts";
import { ALL_CSS, PARTS_CSS, SYSTEM_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx");

// ---------- reading the stylesheets (as instrument.test.ts does) ----------
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
const IS = ':root[data-style="instrument"]';
function tokensOf(style: "instrument" | "friendly", theme: string, more = false, water: Water = "ocean"): Record<string, string> {
  const th = theme !== "graphite" ? `:root[data-theme="${theme}"]` : null;
  const w = { "--water": WATER_TINTS[water].mid, ...(water === "ocean" ? {} : block(`:root[data-water="${water}"]`)) };
  const base = { ...block(":root"), ...(more ? block(":root", MORE) : {}) };
  if (style === "friendly") return { ...base, ...(th ? block(th) : {}), ...(th && more ? block(th, MORE) : {}), ...w };
  return { ...base, ...block(IS), ...(more ? block(IS, MORE) : {}), ...(th ? block(th) : {}), ...(th && more ? block(th, MORE) : {}), ...w, ...block(`${IS}[data-tone]`), ...(th ? block(`${IS}[data-theme="${theme}"]`) : {}) };
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
/** Words over what is under them, as they show (an ink with opacity is laid over first). */
const ratio = (words: RGBA, under: RGBA) => { const a = over(words, under); const [x, y] = [lum(a), lum(under)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------- M71, black with colour: every colour's forms, measured (docs/milestones/M71-black-with-colour.md) ----------
/** A colour at a percent over what is under it, as color-mix(in srgb, c p%, transparent) shows over a surface. */
const softOver = (c: RGBA, p: number, under: RGBA): RGBA => over([c[0], c[1], c[2], p], under);
const M71_COLOURS = ["blue", "purple", "orange", "pink", "green", "red", "teal", "grey"] as const;
describe("M71: each meaning colour reads on black, as words, as a tag and under a white mark", () => {
  const t = tokensOf("instrument", "black");
  const s0 = colour("var(--surface-0)", t), s1 = colour("var(--surface-1)", t), s2 = colour("var(--surface-2)", t);
  test("the surfaces and the words are the plan's: pure black, #121214, #1A1A1D; the second words 7 to 1 on a card", () => {
    expect(t["--surface-0"]).toBe("#000000");
    expect(t["--surface-1"]).toBe("#121214");
    expect(t["--surface-2"]).toBe("#1A1A1D");
    expect(t["--bg"]).toBe("var(--surface-0)");
    expect(ratio(colour("var(--fg)", t), s1)).toBeGreaterThanOrEqual(15);
    expect(ratio(colour("var(--fg-2)", t), s1)).toBeGreaterThanOrEqual(7);
    for (const under of [s0, s1, s2]) expect(ratio(colour("var(--fg-3)", t), under)).toBeGreaterThanOrEqual(4.5);
  });
  for (const c of M71_COLOURS) test(`${c}: its text form 4.5 to 1 on surface 0, surface 1 and its own soft fill; a white mark 3 to 1 on its tile`, () => {
    const solid = colour(`var(--c-${c})`, t), text = colour(`var(--c-${c}-text)`, t), tile = colour(`var(--c-${c}-tile)`, t), mark = colour("var(--c-mark)", t);
    for (const [name, under] of [["surface 0", s0], ["surface 1", s1], ["soft on surface 0", softOver(solid, 0.18, s0)], ["soft on surface 1", softOver(solid, 0.18, s1)]] as const) {
      expect(ratio(text, under), `${c} text on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(mark, tile), `white on the ${c} tile`).toBeGreaterThanOrEqual(3);
    // A dot or a tile is found on black and on a card (a mark, 3 to 1, WCAG 1.4.11).
    for (const under of [s0, s1]) expect(ratio(tile, under), `${c} tile`).toBeGreaterThanOrEqual(3);
    // Each form is the colour's own: soft and text are mixed from the solid in tokens.css, never a second hue.
    expect(t[`--c-${c}-soft`]).toBe(`color-mix(in srgb, var(--c-${c}) 18%, transparent)`);
    expect(t[`--c-${c}-text`]).toBe(`color-mix(in srgb, var(--c-${c}) 70%, #FFFFFF)`);
  });
  test("the main button's white words read at 4.5 to 1 on the M71 blue, and it is the accent", () => {
    expect(ratio(colour("#FFFFFF", t), colour("var(--c-blue-strong)", t))).toBeGreaterThanOrEqual(4.5);
    expect(t["--acc"]).toBe("var(--c-blue-strong)");
    expect(ratio(colour("var(--acc-ink)", t), colour("var(--acc)", t))).toBeGreaterThanOrEqual(4.5);
  });
  test("the plan's values, Apple's dark mode set", () => {
    expect([t["--c-blue"], t["--c-purple"], t["--c-orange"], t["--c-pink"], t["--c-green"], t["--c-red"], t["--c-teal"], t["--c-grey"]])
      .toEqual(["#0A84FF", "#BF5AF2", "#FF9F0A", "#FF375F", "#30D158", "#FF453A", "#64D2FF", "#8E8E93"]);
  });
});

const LOOKS: [string, "instrument" | "friendly", string][] = [
  ["Instrument, Graphite", "instrument", "graphite"], ["Instrument, White", "instrument", "paper"], ["Instrument, Black", "instrument", "black"], ["Instrument, Deep", "instrument", "deep"],
  ["Friendly, Night", "friendly", "graphite"], ["Friendly, White", "friendly", "paper"], ["Friendly, Black", "friendly", "black"], ["Friendly, Deep", "friendly", "deep"],
];

describe("the visual system's colours: readable in every look, every theme and every water", () => {
  for (const [name, style, theme] of LOOKS) for (const more of [false, true]) {
    test(`${name}${more ? ", more contrast" : ""}: the hero's soft words, every status tag, the accent's tint and the round send`, () => {
      for (const w of WATERS) {
        const k = tokensOf(style, theme, more, w);
        const c = (v: string) => colour(v, k);
        const page = c("var(--bg)"), card = c("var(--surface-1)");
        expect(ratio(c("var(--hero-soft)"), page), `${w} the hero's second tone on the page`).toBeGreaterThanOrEqual(4.5);
        for (const [words, tint] of [["--ok", "--ok-tint"], ["--amber", "--warn-tint"], ["--bad", "--danger-tint"], ["--fg-2", "--neutral-tint"], ["--status-working", "--acc-tint"]]) {
          const fill = over(c(`var(${tint})`), page);
          expect(ratio(c(`var(${words})`), fill), `${w} ${words} on ${tint}`).toBeGreaterThanOrEqual(4.5);
        }
        // The open place in the list and the project's token in the ask box (on the card).
        expect(ratio(c("var(--acc-text)"), over(c("var(--acc-tint)"), card)), `${w} the accent's words on its tint`).toBeGreaterThanOrEqual(4.5);
        // The round send is the ask box's main action: its arrow on its fill.
        expect(ratio(c("var(--main-ink)"), c("var(--main)")), `${w} the send arrow`).toBeGreaterThanOrEqual(4.5);
        // The example chips and the context line are the second words on the card and the page.
        for (const s of [page, card]) expect(ratio(c("var(--fg-2)"), s), `${w} second words`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("Instrument: every grey is one ink at a step of opacity (spec 1.2)", () => {
  const steps = (t: Record<string, string>, ink: string) => {
    for (const [k, a] of [["--fg", ".92"], ["--fg-2", ".62"], ["--line", ".09"], ["--line-strong", ".14"]]) expect(t[k], k).toBe(`rgba(${ink}, ${a})`);
  };
  test("Graphite: the warm off white ink", () => steps(tokensOf("instrument", "graphite"), "233, 235, 223"));

  test("the hero's soft tone is the faintest step that still reads 4.5 to 1 (the spec's .42 is too faint to read)", () => {
    expect(tokensOf("instrument", "graphite")["--hero-soft"]).toBe("rgba(233, 235, 223, .52)");
  });
  test("Friendly keeps its own greys (only the grammar is shared)", () => {
    expect(tokensOf("friendly", "graphite")["--fg"]).toBe("#FAFAFA");
  });
});

describe("type, tags, keys and elevation (spec 1.1, 1.6, 1.7)", () => {
  const root = block(":root");
  test("the hero is 28 on 32 at weight 500 with tight tracking, 22 on 27 in the tall Home; the tag 11 on 14, 600, open", () => {
    expect(root).toMatchObject({ "--t-hero": "calc(28rem / 14)", "--lh-hero": "calc(32rem / 14)", "--w-hero": "500", "--track-hero": "-0.022em" });
    expect(root).toMatchObject({ "--t-hero-sm": "calc(22rem / 14)", "--lh-hero-sm": "calc(27rem / 14)", "--track-hero-sm": "-0.02em" });
    expect(root).toMatchObject({ "--t-eyebrow": "calc(11rem / 14)", "--lh-eyebrow": "calc(14rem / 14)", "--w-eyebrow": "600", "--track-eyebrow": ".06em" });
    // No weight over 600 anywhere (spec 1.1).
    for (const m of ALL_CSS().matchAll(/font-weight:\s*(\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(600);
  });
  test("the status tag is a pill with a word, upper case only there and on a card's short label (rule 16)", () => {
    const parts = blocks(PARTS_CSS());
    const status = parts.find((b) => b.sel === ".ui-status")!.decl;
    expect(status).toMatchObject({ "border-radius": "var(--r-pill)", "text-transform": "uppercase", "letter-spacing": "var(--track-eyebrow)", background: "var(--neutral-tint)" });
    for (const [tone, tint] of [["needs", "--warn-tint"], ["proven", "--ok-tint"], ["stop", "--danger-tint"], ["working", "--acc-tint"]]) {
      expect(parts.find((b) => b.sel === `.ui-status[data-tone="${tone}"]`)!.decl.background, tone).toBe(`var(${tint})`);
    }
    const upper = blocks(ALL_CSS()).filter((b) => /text-transform:\s*uppercase/.test(Object.entries(b.decl).map(([k, v]) => `${k}: ${v}`).join(";")));
    // M71: the meaning tag (ui/parts.tsx Tag) is the same short status tag, in its meaning's colour.
    expect(upper.map((b) => b.sel).sort()).toEqual([".ui-eyebrow", ".ui-mtag", ".ui-status"]);
    // The words in a tag are short: the status words are one to three words.
    for (const w of Object.values(S.ui.status)) expect(w.split(" ").length, w).toBeLessThanOrEqual(3);
  });
  test("buttons are keys: a 2 point bottom edge at rest, 1 when pressed, drawn inside so nothing moves; quiet ones have none", () => {
    const parts = blocks(PARTS_CSS());
    const rule = (sel: string) => parts.find((b) => b.sel === sel && !b.media)!.decl;
    expect(rule(".btn")["box-shadow"]).toBe("var(--btn-key)");
    expect(rule(".btn:active:not(:disabled)")).toMatchObject({ "box-shadow": "var(--btn-key-press)", transform: "scale(var(--press))" });
    expect(rule(".btn.quiet")["box-shadow"]).toBe("none");
    expect(rule(".btn.icon:not(.primary)")["box-shadow"]).toBe("none");
    expect(root["--btn-key"]).toBe("inset 0 -1px 0 var(--line-strong)");
    // The main button in Instrument: a glass line on top and the accent's deep edge (instrument.test.ts pins the values).
    expect(block(`${IS}[data-tone]`)["--main-shadow"]).toContain("inset 0 -2px 0 var(--acc-deep)");
  });
  test("the ask box floats with one soft shadow; hairlines elsewhere", () => {
    expect(root["--ask-shadow-float"]).toBe("var(--shadow-float)");
    expect(root["--shadow-float"]).toMatch(/^0 1px 2px rgba\(0, 0, 0, \.\d+\), 0 4px 14px rgba\(0, 0, 0, \.\d+\)$/);
    expect(SYSTEM_CSS()).toMatch(/\.home \.askwrap \.ask \{[^}]*border-radius: var\(--r-ask\);[^}]*box-shadow: var\(--ask-shadow-float\);/);
  });
});

describe("system.css: one grammar for every look", () => {
  const sys = SYSTEM_CSS();
  const rules = blocks(sys);
  test("no rule reads a look attribute, so Friendly and Instrument get the same layout", () => {
    for (const r of rules) expect(r.sel, r.sel).not.toMatch(/data-(style|theme|tone|colour|character|water)/);
  });
  test("no colour, size or time of its own: every value is a token (a share of the window is allowed)", () => {
    for (const r of rules) for (const [k, v] of Object.entries(r.decl)) {
      expect(v, `${r.sel} { ${k} }`).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
      expect(v, `${r.sel} { ${k} }`).not.toMatch(/(^|[^\w.-])-?\d*\.?\d+(px|rem|em|ms|s)\b/);
    }
  });
  test("Home loads it last, after every other look", () => {
    expect(card).toContain('import "./ui/homeFlow.css";\nimport "./ui/system.css";\n');
  });
});

describe("one layout grammar (spec 3)", () => {
  test("the top bar: the status dot, the project's name, one line of context, then the Fix it key", () => {
    const bar = card.slice(card.indexOf('<header className="bar">'), card.indexOf("</header>"));
    const at = (s: string) => bar.indexOf(s);
    // M71: the project chip, its dot the project's own state (meaning.ts statusDot), then the folder menu inside it.
    expect(at("<Dot colour={statusDot(status.kind)} />")).toBeGreaterThan(0);
    expect(at("<Dot colour={statusDot(status.kind)} />")).toBeLessThan(at("<Menu id={linkId}"));
    expect(at("<Menu id={linkId}")).toBeLessThan(at('className="bar-meta"'));
    expect(at('className="bar-meta"')).toBeLessThan(at('className="bar-key"'));
    expect(at('className="bar-key"')).toBeLessThan(at("<PlacesBox"));
  });
  test("the context line leads with the footer's words, names the kind only when the folder says it, then the folder", () => {
    const P = "/Users/demo/Projects/my-shop";
    const foot = { start: "Checked just now", end: "Undo is ready" };
    expect(barContext({ project: P, foot, about: { project: P, origin: "lovable" } })).toEqual(["Checked just now", "Undo is ready", "Lovable project", "~/Projects/my-shop"]);
    expect(barContext({ project: P, foot: null, about: { project: P, origin: "unknown" } })).toEqual(["~/Projects/my-shop"]);
    // Another folder's report never names this one's kind.
    expect(barContext({ project: P, foot: null, about: { project: "/Users/demo/other", origin: "bolt" } })).toEqual(["~/Projects/my-shop"]);
    expect(barContext({ project: "", foot, about: null })).toEqual([]);
    // M69 step 3: the tall Home keeps only the kind (else the folder) before the key, so it never truncates to "Lovable…".
    expect(barContext({ project: P, foot: null, about: { project: P, origin: "lovable" }, tall: true })).toEqual(["Lovable project"]);
    expect(barContext({ project: P, foot: null, about: null, tall: true })).toEqual(["~/Projects/my-shop"]);
    expect(barContext({ project: P, foot, about: null, tall: true })).toEqual(["~/Projects/my-shop"]);
    expect(shortPath("/Users/demo")).toBe("~");
    expect(shortPath("/Volumes/Work/site")).toBe("/Volumes/Work/site");
    // Honest words (M57): a kind of project, never who changed what.
    for (const w of Object.values(S.look.origin)) expect(w).toMatch(/^(Lovable|Bolt|Replit) project$/);
  });
  test("the key hint is Fix it's key in use, hidden when unbound; no other key, and no new default (F28's four)", () => {
    const keys = { using: { ...KEY_USUAL } };
    expect(barKeyChord(keys)).toBe(KEY_USUAL.problem);
    expect(barKeyChord({ using: { ...KEY_USUAL, problem: null } })).toBeNull();
    expect(card).toContain('{home.tab === "now" && barKey && <span className="bar-key">');
    // F28's four (Fix it, Hold to talk, Prompt help, Stop everything) and Prompt help's use a suggestion: unchanged by M69.
    expect(Object.entries(KEY_USUAL).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(["accept", "problem", "read", "stop", "talk"]);
    expect(card).not.toMatch(/Cmd\+Enter|meta.*Enter.*global/);
  });
  test("Settings is always the last place: the tall row ends with it, the wide list keeps it at its foot", () => {
    for (const practiceDone of [false, true]) expect(barPlaces({ practiceDone }).at(-1)).toBe("settings");
    expect(read("./homeSide.tsx")).toMatch(/className="side-foot"/);
  });
  test("the ask box is pinned at the bottom of the work in both layouts", () => {
    const sys = SYSTEM_CSS();
    expect(sys).toMatch(/\.home:not\(\[data-side\]\):not\(\[data-view="settings"\]\) \.work > \.askwrap \{ order: 1; position: sticky; bottom: 0;[^}]*margin-top: auto;/);
    expect(sys).toMatch(/\.home\[data-side\] \.work > \.askwrap \{ margin-top: auto; \}/);
    // The light behind Home off (the usual) no longer lifts it up under the work.
    expect(block(':root[data-light="off"]')["--ask-push"]).toBe("auto");
  });
  test("its row: the project's token, the example chips, the microphone, then the round send", () => {
    const row = card.slice(card.indexOf('<div className="ask-row">'), card.indexOf("</div>", card.indexOf('className="send"')));
    const at = (s: string) => row.indexOf(s);
    for (const s of ['className="ask-token"', 'className="ask-chip"', 'className="ask-mic"', 'className="send"']) expect(at(s), s).toBeGreaterThan(0);
    expect(at('className="ask-token"')).toBeLessThan(at('className="ask-chip"'));
    expect(at('className="ask-chip"')).toBeLessThan(at('className="ask-mic"'));
    expect(at('className="ask-mic"')).toBeLessThan(at('className="send"'));
    expect(S.home.ask).toBe("What are you stuck on?");
  });
  test("More ways to ask never covers the hero or the ask box: in the flow, under it, capped, jobs over a divider", () => {
    const sys = SYSTEM_CSS();
    expect(sys).toMatch(/\.home \.askwrap details\.more \{ position: static;/);
    expect(sys).toMatch(/\.home \.askwrap details\.more > \.more-pop \{ position: static; max-height: 34vh;/);
    expect(ALL_CSS().replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/details\.more > \.more-pop \{[^}]*position: absolute/);
  });
  test("the footer line lives in the top bar in every look, never under the ask box", () => {
    expect(card).not.toContain("<FootLine");
    expect(card).toContain('<p className="bar-meta" title={barLine.join(" · ")}>{barLine.join(" · ")}</p>');
  });
});
