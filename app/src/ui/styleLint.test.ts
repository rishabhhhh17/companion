// The style lint (the overhaul spec, section 6): the design system stays one system. parts.css reads every colour, size,
// radius and duration from tokens.css; each part is defined once and only in parts.css; there is no gradient text and no
// banded --chrome anywhere; the silver is on the one main button only; titles are plain; one type face; the type scale
// has seven sizes; and no rule outside tokens.css is gated on the theme.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { ALL_CSS, FIX_CSS, HOME_NOW_CSS, PAGES_CSS, PARTS_CSS, STYLE_CSS, SYSTEM_CSS, TOKENS_CSS } from "./cssFiles.ts";

type Rule = { sel: string; body: string; decl: [string, string][]; at: string | null };
/** Every rule of a stylesheet, with the at-rule it sits in ("@media (...)", "@container ...", "@keyframes x"). */
function parse(css0: string, at: string | null = null): Rule[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@import [^;]+;$/gm, "");
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@")) out.push(...parse(body, head));
    else {
      const decl = body.split(";").map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()] as [string, string]; }).filter(([k]) => k);
      out.push({ sel: head, body, decl, at });
    }
    i = close + 1;
  }
  return out;
}
/** A stylesheet without its comments (a comment may name what is gone). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const sels = (r: Rule) => r.sel.split(",").map((s) => s.trim());
const parts = parse(PARTS_CSS()), style = parse(STYLE_CSS()), tokens = parse(TOKENS_CSS()), system = parse(SYSTEM_CSS());
// M69 step 4: the M69 stylesheets (the pages, Fix it and proof, Home now) are held to the same rules as the system.
const m69 = [...parse(PAGES_CSS()), ...parse(FIX_CSS()), ...parse(HOME_NOW_CSS())];
const all = [...tokens, ...parts, ...style, ...system, ...m69];
const PART_CLASS = /\.(btn|ui-[\w-]+|sb-[\w-]+)\b/;
const SYSTEM_COLOURS = /^(transparent|currentColor|CanvasText|Canvas|Highlight|HighlightText|ButtonText|ButtonFace)$/;
// M69 (the YC benchmark spec 1.1) adds three: the hero's display size, its smaller step (tall Home, review) and the short
// status tag's size. Ten names, and still no other.
const TYPE_SCALE = ["--t-caption", "--t-small", "--t-label", "--t-body", "--t-answer", "--t-display", "--t-verdict", "--t-hero", "--t-hero-sm", "--t-eyebrow"];

describe("parts.css reads every value from tokens.css", () => {
  test("no colour literal: no hex, rgb, hsl or named colour", () => {
    for (const r of parts) for (const [k, v] of r.decl) expect(literalIn(v), `${r.sel} { ${k}: ${v} }`).toBe(false);
  });
  test("no size or duration literal (only inside an @container or @media condition, which cannot read a token)", () => {
    for (const r of parts) for (const [k, v] of r.decl) expect(v, `${r.sel} { ${k}: ${v} }`).not.toMatch(/(^|[^\w.-])-?\d*\.?\d+(px|rem|em|ms|s|vh|vw|pt|ch)\b/);
  });
  test("every radius is a token (or none)", () => {
    for (const r of parts) for (const [k, v] of r.decl) if (/radius/.test(k)) expect(v, `${r.sel} { ${k}: ${v} }`).toMatch(/^((0|var\(--r-[\w-]+\))\s*)+$/);
  });
  test("every token parts.css reads is defined in tokens.css (only a part's own inline values, --n and --i, are not)", () => {
    const defined = new Set([...TOKENS_CSS().matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    for (const m of PARTS_CSS().matchAll(/var\((--[\w-]+)/g)) if (!["--n", "--i"].includes(m[1])) expect(defined.has(m[1]), m[1]).toBe(true);
  });
  test("the type scale has ten sizes, and parts.css uses no other", () => {
    // A style may set the sizes again (M65, Instrument), never add one: the names are still ten.
    const scale = [...new Set([...TOKENS_CSS().matchAll(/(--t-[\w-]+):/g)].map((m) => m[1]))];
    expect(scale.sort()).toEqual([...TYPE_SCALE].sort());
    for (const m of PARTS_CSS().matchAll(/var\((--t-[\w-]+)\)/g)) expect(TYPE_SCALE, m[1]).toContain(m[1]);
    for (const r of parts) for (const [k, v] of r.decl) if (k === "font-size") expect(v, r.sel).toMatch(/^var\(--t-[a-z]+\)$/);
  });
});

// A colour written as a value: a hex, or an rgb, hsl, hwb, lab, lch, oklch or color() function; and the named colours.
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklch|color)\(/i;
const NAMED_COLOUR = /^(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink)$/i;
const literalIn = (v: string) => COLOUR_LITERAL.test(v) || v.split(/[\s,()/]+/).some((w) => NAMED_COLOUR.test(w));

describe("no colour literal anywhere outside tokens.css (Hallmark rule 48)", () => {
  test("style.css and parts.css write no colour: every rule, keyframe, custom property and fallback reads a token", () => {
    const bad: string[] = [];
    for (const [file, rules] of [["parts.css", parts], ["style.css", style], ["pages.css, fix.css, homeNow.css", m69]] as const) {
      for (const r of rules) for (const [k, v] of r.decl) if (literalIn(v)) bad.push(`${file}: ${r.sel} { ${k}: ${v} }`);
    }
    expect(bad).toEqual([]);
  });
  test("the check really catches one (a hex, an rgba, a fallback and a name)", () => {
    for (const v of ["#000", "#ffffffe6", "rgba(0, 0, 0, .5)", "var(--skin-glow, #fff)", "0 0 0 1px white", "color-mix(in srgb, var(--water) 18%, #000000)"]) expect(literalIn(v), v).toBe(true);
    for (const v of ["var(--notch)", "transparent", "currentColor", "pre-wrap", "var(--silver)", "color-mix(in srgb, var(--water) 18%, var(--fr-sky))"]) expect(literalIn(v), v).toBe(false);
  });
  test("no page writes a colour of its own: the React pages and the pages that load the stylesheets", () => {
    const pages = readdirSync(new URL("../", import.meta.url).pathname).filter((f) => /\.tsx$/.test(f)).map((f) => `../${f}`).concat(["./parts.tsx"]);
    for (const f of pages) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8").replace(/&#\d+;/g, "");   // an HTML entity is a character, not a colour
      expect(src, f).not.toMatch(/["'`]#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
    }
    // The three windows built from the stylesheets have no style of their own. (follow.html and overlay.html are drawn
    // over other apps without the stylesheets; their few fixed colours are pinned by follow.test.ts and water.test.ts.)
    for (const f of ["card.html", "dock.html", "island.html"]) {
      const html = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
      expect(html, f).not.toMatch(/<style|style="/);
    }
  });
  test("the fixed colours are the same in every theme: Paper and More contrast redefine none of them", () => {
    const FIXED = /^--(notch|glow|mask|glass|fr|fl)-|^--notch$|^--glass$|^--shadow-drop-card$/;
    const fixed = tokens.filter((r) => r.sel === ":root" && !r.at).flatMap((r) => r.decl.map(([k]) => k)).filter((k) => FIXED.test(k));
    expect(fixed.length).toBeGreaterThan(60);
    for (const r of tokens.filter((x) => x.sel !== ":root" || x.at)) for (const [k] of r.decl) expect(FIXED.test(k), `${r.sel} redefines ${k}`).toBe(false);
  });
  test("the first run takes the theme's own page, words and marks, so it is the same place as Home in every theme", () => {
    const root = Object.fromEntries(tokens.find((r) => r.sel === ":root" && !r.at)!.decl);
    // It was Night's own values, colour for colour, until the review of 2 Nov 2026 found it #111 in every theme.
    for (const [fr, theme] of [["--fr-sky", "--bg"], ["--fr-fg", "--fg"], ["--fr-fg-2", "--fg-2"], ["--fr-bad", "--bad"], ["--fr-ok", "--ok"], ["--fr-amber", "--amber"], ["--fr-card", "--surface-1"], ["--fr-edge", "--line"]]) expect(root[fr], fr).toBe(`var(${theme})`);
    expect(root["--notch"]).toBe("#000000");
  });
});

describe("the Hallmark lint's floor, in our own words (31 Oct)", () => {
  const bySel = (rules: Rule[], sel: string) => rules.filter((r) => !r.at && sels(r).includes(sel));
  test("a disabled control is never a fade alone: its own fill or ink, the not allowed pointer, and the disabled attribute", () => {
    const DISABLED = /:disabled|\[data-disabled\]|\[aria-disabled/;
    for (const r of [...parts, ...style]) if (DISABLED.test(r.sel)) expect(r.decl.map(([k]) => k), r.sel).not.toContain("opacity");
    for (const s of [".btn:disabled", ".ui-switch:disabled", ".ui-pic:disabled", ".ui-field:disabled", ".ui-seg-opt:disabled", ".ui-stepper-btn:disabled", ".ui-stepper-value:disabled"]) {
      const body = bySel(parts, s).map((r) => r.body).join(";");
      expect(body, s).toMatch(/cursor: not-allowed/);
      expect(body, s).toMatch(/(color|background): var\(--(ink|fill)-disabled\)/);
    }
    for (const s of [".btn.primary:disabled", ".btn.quiet:disabled", ".btn.icon:not(.primary):disabled", ".ui-switch:disabled::after"]) expect(bySel(parts, s).map((r) => r.body).join(";"), s).toMatch(/var\(--(ink|fill)-disabled\)/);
    // The parts pass the attribute itself, so the browser keeps a disabled control out of reach.
    const tsx = readFileSync(new URL("./parts.tsx", import.meta.url), "utf8");
    for (const part of ["function Button(", "function Switch(", "function Segmented<", "function Stepper(", "function Field(", "function PictureChoice<"]) {
      const at = tsx.indexOf(part);
      expect(at, part).toBeGreaterThan(-1);
      expect(tsx.slice(at, tsx.indexOf("\n}\n", at)), part).toMatch(/ disabled=\{disabled/);
    }
  });
  test("the switch's knob moves and stretches by transform only, never by its width", () => {
    const knob = bySel(parts, ".ui-switch::after")[0];
    expect(knob.body).toContain("transition: transform var(--dur-2) var(--ease-out), background-color var(--dur-1) var(--ease-out)");
    expect(knob.body).not.toMatch(/transition:[^;]*width/);
    for (const r of parts) if (/\.ui-switch/.test(r.sel) && r.sel.includes("::after") && r.sel !== ".ui-switch::after") expect(r.decl.map(([k]) => k), r.sel).not.toContain("width");
    expect(bySel(parts, ".ui-switch:active:not(:disabled)::after")[0].body).toContain("transform: scaleX(var(--knob-stretch))");
    expect(TOKENS_CSS()).toContain("--knob-stretch: 1.25;");   // --knob-press over --knob: 20 over 16
  });
  test("pills are for controls: what the character says, the drop ring's word and the download bar take a card's corners", () => {
    for (const s of [".dock-label", ".drop-caption", ".fr-bar", ".fr-bar i"]) expect(bySel(style, s)[0].body, s).toMatch(/border-radius: var\(--r-(card|thumb)\)/);
    const PILL_OK = /^\.badge$|^\.island\.pill$|^\.fl-dot$/;   // the waiting count, the island's own pill shape, a step's button
    for (const r of style) if (/var\(--r-pill\)/.test(r.body)) for (const s of sels(r)) expect(PILL_OK.test(s), s).toBe(true);
  });
  test("the island page clips its overflow (overflow: clip), never hides it", () => {
    expect(bySel(style, "html.island-page")[0].body).toContain("overflow: clip;");
    for (const r of [...parts, ...style]) if (/(^|[\s,])(html|body)\b/.test(r.sel)) for (const [k, v] of r.decl) if (/^overflow(-x)?$/.test(k)) expect(v, r.sel).not.toBe("hidden");
  });
  test("display heads balance their lines", () => {
    for (const s of ["h2", ".headline", ".view-title", ".fr-title", ".fl-say h2"]) expect(bySel(style, s).map((r) => r.body).join(";"), s).toContain("text-wrap: balance");
  });
});

describe("each part is defined once, in parts.css only", () => {
  test("a selector has one rule block in parts.css (a narrow card or forced colours may add to it)", () => {
    const seen = new Map<string, number>();
    for (const r of parts.filter((x) => !x.at)) for (const s of sels(r)) seen.set(s, (seen.get(s) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([s]) => s)).toEqual([]);
  });
  test("no rule outside parts.css styles a part (.btn, .ui-*, .sb-*)", () => {
    for (const r of [...style, ...tokens]) expect(PART_CLASS.test(r.sel), r.sel).toBe(false);
  });
  test("every part the spec names has its class in parts.css", () => {
    const css = PARTS_CSS();
    for (const c of [".btn.primary {", ".btn.secondary {", ".btn.quiet {", ".btn.danger {", ".btn.icon {", ".ui-row {", ".ui-group-card {", ".ui-switch {", ".ui-seg {", ".ui-menu-btn {", ".ui-menu-list {",
      ".ui-stepper {", ".ui-field {", ".ui-pic {", ".ui-card {", ".ui-key {", ".ui-verdict {", ".ui-chip {", ".sb-item {", ".ui-sheet {", ".ui-toast {", ".ui-recent {"]) expect(css, c).toContain(`\n${c}`);
  });
});

describe("flat silver, plain titles (the overhaul spec, 2.2; the founder, 31 Oct)", () => {
  const PAGES = readdirSync(new URL("../", import.meta.url).pathname).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => `../${f}`).concat(["./parts.tsx"]);
  test("no banded --chrome, no gradient text, no transparent text fill, anywhere in the styles or the pages", () => {
    const css = code(ALL_CSS());
    expect(css).not.toMatch(/--chrome/);
    expect(css).not.toMatch(/background-clip:\s*text/);
    expect(css).not.toMatch(/text-fill-color:\s*transparent/);
    for (const f of PAGES) expect(readFileSync(new URL(f, import.meta.url), "utf8"), f).not.toMatch(/--chrome|backgroundClip|WebkitTextFillColor|background-clip/);
  });
  test("no gradient on a button, a switch or a title", () => {
    const BANNED = /\.btn|switch|\.ui-switch|\.ui-seg|title|headline|\bh1\b|\bh2\b|\.ip-go|\.ip-hi|\.ip-answer|\.ui-menu/;
    for (const r of all) if (BANNED.test(r.sel)) expect(r.body, r.sel).not.toMatch(/gradient\(/);
  });
  test("the silver is on the one main button only: never a switch, a knob, a menu, the ring or an approval", () => {
    for (const r of parts) if (/var\(--(main|silver)/.test(r.body)) for (const s of sels(r)) expect(s, s).toMatch(/^\.btn\.primary\b/);
    // Outside the parts, only the notch's own main button ("Add your key") is silver.
    for (const r of style) if (/var\(--(main|silver)|#E9ECF1/i.test(r.body)) for (const s of sels(r)) expect(s, s).toMatch(/^\.island-panel(\[data-size="compact"\])? \.ip-go\b/);
    expect(code(ALL_CSS())).not.toMatch(/--lime/);
  });
  test("headers are sentence case: nothing is made upper case but the short status tag, and no sidebar or nav item has a stripe on its edge", () => {
    // M69 correction 5 (rule 16): upper case only on the spec's short status tags (PROVEN, FIX THIS FIRST) and a card's
    // short label (LAST FIX), never on a header, a button or a sentence.
    for (const r of all) {
      if (!/^\.ui-(status|eyebrow|mtag)$/.test(r.sel)) expect(r.body, r.sel).not.toMatch(/text-transform:\s*uppercase/);
      if (/\.sb-|nav|side/.test(r.sel)) expect(r.body, r.sel).not.toMatch(/border-left/);
    }
  });
});

describe("one look, one face", () => {
  test("no rule outside tokens.css is gated on the theme, and none follows the Mac's light or dark", () => {
    for (const r of [...parts, ...style, ...m69]) expect(r.sel, r.sel).not.toContain("data-theme");
    for (const r of all) expect(r.at ?? "", r.sel).not.toMatch(/prefers-color-scheme/);
  });
  test("one type face: -apple-system, and the code face for commands and paths", () => {
    const toks = TOKENS_CSS();
    expect(/--font: ([^;]+);/.exec(toks)![1]).toBe("-apple-system, sans-serif");
    expect(/--font-code: ([^;]+);/.exec(toks)![1]).toBe("ui-monospace, Menlo, monospace");
    const css = code(ALL_CSS());
    expect(css).not.toMatch(/SF Pro|ui-rounded|--round\b|system-ui/);
    for (const r of [...parts, ...style]) for (const [k, v] of r.decl) {
      if (k === "font-family") expect(v, r.sel).toMatch(/^var\(--font(-code)?\)$/);
      if (k === "font" && v !== "inherit") expect(v, `${r.sel} { font: ${v} }`).toMatch(/var\(--font(-code)?\)$/);
    }
  });
});

describe("style.css only shrinks", () => {
  // The spec's target is under 600 lines. Home is rebuilt from the parts now (section 4, F28), and the M42 layer is gone;
  // what is left is the first run, the island's own black panel and the character. The ratchet only moves down.
  test("under 750 lines, and every remaining layer imports the design system first", () => {
    expect(STYLE_CSS().split("\n").length).toBeLessThan(750);
    expect(STYLE_CSS().startsWith('@import "./ui/tokens.css";\n@import "./ui/parts.css";\n')).toBe(true);
  });
});

// ---------- M71, black with colour (docs/milestones/M71-black-with-colour.md): the lint on every stylesheet ----------
// M71 part 2 (the clean up) widened M71_FILES from the files M71 touched to every stylesheet the app loads. Colour marks
// meaning on a tile, a dot, a tag or a button, never a surface; no gradient but the character's own art; no glow or halo;
// never a card inside a card; no colour value outside tokens.css (tokens.css is where the colours are, so it is only held
// to the room rule).
import { BLACK_CSS, NOTCH_CSS, LOOK_CSS, WIDE_CSS, HOME_CSS, HOME_FLOW_CSS } from "./cssFiles.ts";
const sheet = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
describe("M71: one black look, colour for meaning only", () => {
  const M71_FILES: [string, Rule[]][] = [["parts.css", parts], ["black.css", parse(BLACK_CSS())], ["notch.css", parse(NOTCH_CSS())],
    ["style.css", style], ["look.css", parse(LOOK_CSS())], ["wide.css", parse(WIDE_CSS())], ["home.css", parse(HOME_CSS())], ["homeFlow.css", parse(HOME_FLOW_CSS())],
    ["system.css", system], ["pages.css", parse(PAGES_CSS())], ["fix.css", parse(FIX_CSS())], ["homeNow.css", parse(HOME_NOW_CSS())],
    ["chrome.css", parse(sheet("./chrome.css"))], ["homeShape.css", parse(sheet("./homeShape.css"))]];
  test("the lint covers every stylesheet in the app", () => {
    const all = readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".css")).filter((f) => f !== "tokens.css");
    const covered = new Set(M71_FILES.map(([f]) => f));
    for (const f of all) expect(covered.has(f), f).toBe(true);
    expect(covered.has("style.css")).toBe(true);
  });
  /** What may keep its gradients and its light: the character's own art (the Visor, the glass orb, the water character
   *  and its waterline, Settings' preview of it), and the notch itself (the island and its marks, the shape that grows
   *  out of it), and their own keyframes. */
  const CHARACTER_ART = /\.ui-visor|\.ui-orb|\.home-orb|\.home-char|\.character|visor|flowflow|\.fl-|\.ch-water|\.waterline|companion-hero|\.mark\b|\.island-wing|\.island-mark|\.island-shape|\.hs\b|@keyframes (glow|pose-glow|island-)/;   // M72: the notch's own art, never its panel
  test("no gradient outside the character's own art", () => {
    const bad: string[] = [];
    // A mask that fades a scrolling strip's edge is no colour: it is left to the clean up, which decides about it.
    for (const [file, rules] of M71_FILES) for (const r of rules) for (const [k, v] of r.decl) if (!CHARACTER_ART.test(r.sel) && !CHARACTER_ART.test(r.at ?? "") && !/mask-image$/.test(k) && /gradient\(/.test(v)) bad.push(`${file}: ${r.sel} { ${k} }`);
    expect(bad).toEqual([]);
  });
  test("no glow or halo: no drop shadow, no glow or halo token, no blurred coloured shadow, outside the character's art", () => {
    const bad: string[] = [];
    for (const [file, rules] of M71_FILES) for (const r of rules) {
      if (CHARACTER_ART.test(r.sel) || CHARACTER_ART.test(r.at ?? "")) continue;
      for (const [k, v] of r.decl) {
        if (/drop-shadow\(|--[\w-]*(glow|halo)/.test(v)) bad.push(`${file}: ${r.sel} { ${k}: ${v} }`);
        // A shadow with a blur in a colour of meaning is a glow (a neutral float shadow token is not).
        if (/shadow/.test(k) && /var\(--(c|mc)-/.test(v) && !/^inset 0 (var\(--hair\)|0) 0 /.test(v)) bad.push(`${file}: ${r.sel} { ${k}: ${v} }`);
      }
    }
    expect(bad).toEqual([]);
  });
  test("no colour value outside tokens.css, and no rule keyed on the old rooms ([data-element]) in any stylesheet", () => {
    const bad: string[] = [];
    for (const r of parse(TOKENS_CSS())) if (/\[data-element/.test(r.sel)) bad.push(`tokens.css: ${r.sel}`);
    for (const [file, rules] of M71_FILES) for (const r of rules) {
      if (/\[data-element/.test(r.sel)) bad.push(`${file}: ${r.sel}`);
      for (const [k, v] of r.decl) if (literalIn(v)) bad.push(`${file}: ${r.sel} { ${k}: ${v} }`);
    }
    expect(bad).toEqual([]);
  });
  test("colour paints no surface bigger than a tile, a tag, a button or a featured card: a meaning colour only fills the M71 parts", () => {
    // (.sw-*: Settings' small pictures of the look itself.)
    const FILLS_OK = /\.ui-feature|\.ui-mtile|\.ui-mtag|\.ui-mdot|\.ui-mtag-dot|\.ui-place|\.ui-mrow-act|\.sb-item\[data-c\]|\.send|\.ask-token-dot|\.ui-place-dot|ip-act|\.sw-/;
    const bad: string[] = [];
    for (const [file, rules] of M71_FILES) for (const r of rules) for (const [k, v] of r.decl) {
      if (/^background(-color)?$/.test(k) && /var\(--(c-(?!mark)|mc)/.test(v) && !FILLS_OK.test(r.sel)) bad.push(`${file}: ${r.sel} { ${k}: ${v} }`);
    }
    expect(bad).toEqual([]);
  });
  test("never a card inside a card: the grouped list is never inside another card, and a card inside a card loses its fill", () => {
    const card = readFileSync(new URL("../card.tsx", import.meta.url), "utf8"), tsx = readFileSync(new URL("./parts.tsx", import.meta.url), "utf8");
    // Now's one list sits in the page, not in a panel or a card, and holds no list of its own. (M71 part 2: found by its
    // label, now that Learn, History and Memory have lists too; their sections are bare, never a card.)
    const at = card.indexOf("<ListGroup label={S.homeNow.listLabel}>"), end = card.indexOf("</ListGroup>", at);
    expect(at).toBeGreaterThan(-1);
    const inner = card.slice(at + 1, end);
    expect(inner).not.toMatch(/<ListGroup|className="panel|ui-card|now-card/);
    const before = card.slice(card.lastIndexOf("return (", at), at);
    expect(before).not.toMatch(/className="panel|ui-card/);
    // The parts themselves: a row is never a list, and no M71 rule styles a list inside a list.
    const row = tsx.slice(tsx.indexOf("export function ListRow("), tsx.indexOf("\n}\n", tsx.indexOf("export function ListRow(")));
    expect(row).not.toContain("<ListGroup");
    for (const [file, rules] of M71_FILES) for (const r of rules) expect(r.sel, file).not.toMatch(/\.ui-mlist\s+[^,]*\.ui-mlist|\.ui-mlist\s+[^,]*\.panel/);
    const nested = parse(BLACK_CSS()).find((r) => r.sel.startsWith(".home .view .panel .panel"))!;
    expect(nested.body).toMatch(/background: transparent/);
  });
});
