// The style lint (the overhaul spec, section 6): the design system stays one system. parts.css reads every colour, size,
// radius and duration from tokens.css; each part is defined once and only in parts.css; there is no gradient text and no
// banded --chrome anywhere; the silver is on the one main button only; titles are plain; one type face; the type scale
// has seven sizes; and no rule outside tokens.css is gated on the theme.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { ALL_CSS, PARTS_CSS, STYLE_CSS, TOKENS_CSS } from "./cssFiles.ts";

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
const parts = parse(PARTS_CSS()), style = parse(STYLE_CSS()), tokens = parse(TOKENS_CSS()), all = [...tokens, ...parts, ...style];
const PART_CLASS = /\.(btn|ui-[\w-]+|sb-[\w-]+)\b/;
const SYSTEM_COLOURS = /^(transparent|currentColor|CanvasText|Canvas|Highlight|HighlightText|ButtonText|ButtonFace)$/;
const TYPE_SCALE = ["--t-caption", "--t-small", "--t-label", "--t-body", "--t-answer", "--t-display", "--t-verdict"];

describe("parts.css reads every value from tokens.css", () => {
  test("no colour literal: no hex, rgb, hsl or named colour", () => {
    for (const r of parts) for (const [k, v] of r.decl) {
      expect(v, `${r.sel} { ${k}: ${v} }`).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklch|color)\(/i);
      for (const w of v.split(/[\s,()/]+/)) expect(/^(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink)$/i.test(w), `${r.sel} { ${k}: ${v} }`).toBe(false);
    }
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
  test("the type scale has seven sizes, and parts.css uses no other", () => {
    const scale = [...TOKENS_CSS().matchAll(/(--t-[\w-]+):/g)].map((m) => m[1]);
    expect(scale.sort()).toEqual([...TYPE_SCALE].sort());
    for (const m of PARTS_CSS().matchAll(/var\((--t-[\w-]+)\)/g)) expect(TYPE_SCALE, m[1]).toContain(m[1]);
    for (const r of parts) for (const [k, v] of r.decl) if (k === "font-size") expect(v, r.sel).toMatch(/^var\(--t-[a-z]+\)$/);
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
  test("headers are sentence case: nothing is made upper case, and no sidebar or nav item has a stripe on its edge", () => {
    for (const r of all) {
      expect(r.body, r.sel).not.toMatch(/text-transform:\s*uppercase/);
      if (/\.sb-|nav|side/.test(r.sel)) expect(r.body, r.sel).not.toMatch(/border-left/);
    }
  });
});

describe("one look, one face", () => {
  test("no rule outside tokens.css is gated on the theme, and none follows the Mac's light or dark", () => {
    for (const r of [...parts, ...style]) expect(r.sel, r.sel).not.toContain("data-theme");
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
