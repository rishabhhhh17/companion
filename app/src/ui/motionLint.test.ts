// The motion lint (M66 Part 1): the rules of the one motion system, read from the stylesheets and the pages as text.
// - Every time and curve a stylesheet moves on is a token from tokens.css; the scripts take theirs from motionTokens.ts.
// - Only opacity and transform move (clip-path, or a stroke drawing on, for a reveal; a colour may fade). Never a size, a
//   position, a radius, a shadow, a blur or a custom property, which lay out or repaint every frame. What still breaks
//   this is listed below by name with the fix that removes it, and the list may only shrink.
// - Every part that comes and goes has an exit, shorter than its enter, on --ease-exit.
// - Reduce motion and Less motion keep a short plain fade of opacity and colour, and nothing else.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { DUR, EXIT_MS } from "../motionTokens.ts";

const here = (p: string) => new URL(p, import.meta.url);
const read = (p: string) => readFileSync(here(p), "utf8");
/** Every stylesheet a page loads, except tokens.css (the only place numbers live). */
const SHEETS: Record<string, string> = Object.fromEntries([
  ...readdirSync(here("./").pathname).filter((f) => f.endsWith(".css") && f !== "tokens.css").map((f) => [`ui/${f}`, read(`./${f}`)]),
  ["style.css", read("../style.css")],
]);
const TOKENS = read("./tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { file: string; sel: string; decl: [string, string][]; at: string | null };
function parse(file: string, css0: string, at: string | null = null): Rule[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@import [^;]+;$/gm, "");
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@")) out.push(...parse(file, body, head));
    else out.push({ file, sel: head, at, decl: body.split(";").map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()] as [string, string]; }).filter(([k]) => k) });
    i = close + 1;
  }
  return out;
}
const RULES = Object.entries(SHEETS).flatMap(([f, css]) => parse(f, css));
const MOTION_DECL = /^(transition|animation)(-[a-z-]+)?$/;
/** Split at top level commas (not inside a function's brackets). */
function commas(v: string): string[] {
  const out: string[] = []; let depth = 0, from = 0;
  for (let i = 0; i < v.length; i++) { if (v[i] === "(") depth++; else if (v[i] === ")") depth--; else if (v[i] === "," && depth === 0) { out.push(v.slice(from, i).trim()); from = i + 1; } }
  out.push(v.slice(from).trim());
  return out.filter(Boolean);
}
/** A value with every var(...) taken out (nested ones too), so what is left is what the rule wrote itself. */
const withoutVars = (v: string) => { let s = v, last = ""; while (s !== last) { last = s; s = s.replace(/var\(--[\w-]+(?:,\s*[^()]*)?\)/g, "T"); } return s; };
const TIME = /(^|[\s,(*/+-])\d*\.?\d+(ms|s)\b/;
const CURVE = /\b(ease|ease-in|ease-out|ease-in-out|cubic-bezier|steps|step-start|step-end)\b/;
/** A token's value in ms, following var() to the token it names. */
function tokenMs(name: string): number {
  const v = new RegExp(`${name}: ([^;]+);`).exec(TOKENS)?.[1]?.trim() ?? "";
  const alias = /^var\((--[\w-]+)\)$/.exec(v);
  if (alias) return tokenMs(alias[1]);
  const m = /^(\d*\.?\d+)(ms|s)$/.exec(v);
  if (!m) throw new Error(`${name} is not a duration: ${v}`);
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
}

describe("every time and curve is a token", () => {
  test("no stylesheet but tokens.css writes a duration, a delay or a curve of its own", () => {
    const bad: string[] = [];
    for (const r of RULES) for (const [k, v] of r.decl) {
      if (!MOTION_DECL.test(k)) continue;
      const own = withoutVars(v).replace(/(^|[\s,])0s\b/g, "$1");
      if (TIME.test(own) || CURVE.test(own)) bad.push(`${r.file}: ${r.sel} { ${k}: ${v} }`);
    }
    expect(bad).toEqual([]);
  });
  test("the check really catches one", () => {
    const own = (v: string) => { const s = withoutVars(v).replace(/(^|[\s,])0s\b/g, "$1"); return TIME.test(s) || CURVE.test(s); };
    for (const v of ["opacity 120ms var(--ease-out)", "x var(--dur-1) ease-in-out", "x var(--dur-1) cubic-bezier(.2, 1, .3, 1)", "x .6s", "spin var(--loop-spin) linear 200ms"]) expect(own(v), v).toBe(true);
    for (const v of ["opacity var(--dur-1) var(--ease-out)", "spin var(--loop-spin) linear infinite", "visibility 0s linear var(--dur-1)", "x calc(var(--stagger) * 2)", "fl-fill var(--beat, var(--loop-beat)) linear both"]) expect(own(v), v).toBe(false);
  });
  test("every token a motion reads is defined in tokens.css", () => {
    const defined = new Set([...TOKENS.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    for (const r of RULES) for (const [k, v] of r.decl) if (MOTION_DECL.test(k)) for (const m of v.matchAll(/var\((--(?:dur|ease|seq|loop|stagger)[\w-]*)/g)) expect(defined.has(m[1]), `${r.sel}: ${m[1]}`).toBe(true);
  });
  test("the scripts take their times and curves from motionTokens.ts, never their own", () => {
    const src = readdirSync(here("../").pathname).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts") && f !== "motionTokens.ts");
    const bad: string[] = [];
    for (const f of src) {
      const code = read(`../${f}`).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      if (/cubic-bezier\(/.test(code)) bad.push(`${f}: a curve`);
      for (const line of code.split("\n")) if (/\.style\.(transition|animation)\s*=|transition:\s*["'`]|easing:/.test(line) && /["'`][^"'`]*\d*\.?\d+m?s\b[^"'`]*["'`]/.test(line.replace(/\$\{[^}]*\}/g, ""))) bad.push(`${f}: ${line.trim().slice(0, 120)}`);
    }
    expect(bad).toEqual([]);
  });
});

// The properties that may move: the compositor's (opacity and the transforms), clip-path and a stroke drawing on (reveals),
// visibility (flipped at an end), and a colour fading, which repaints the element only, never lays out.
const MAY_MOVE = new Set(["opacity", "transform", "translate", "scale", "rotate", "clip-path", "visibility", "stroke-dashoffset",
  "color", "background-color", "border-color", "outline-color", "fill", "stroke", "fill-opacity"]);
/** Still breaking the rule, each with the fix in docs/milestones/M66-smooth-and-flowy.md that removes it. Only shrinks. */
const STILL_MOVING_PAINT: Record<string, string> = {
  "style.css: .fr > .fr-tank transition height": "the first run's water rising: one absolute layer, nothing else lays out (Tier 3)",
  "ui/look.css: @keyframes marker-in background-size": "the marker drawing under words (Tier 3, item 18)",
  "style.css: @keyframes glow filter": "the pictures' needs you glow, Friendly only (Tier 3, item 18)",
  "style.css: @keyframes pose-glow filter": "the pictures' needs you glow, Friendly only (Tier 3, item 18)",
  "style.css: @keyframes island-glow filter": "the notch's done tick, redrawn with the notch shape (Part 2)",
  "style.css: @keyframes fr-fall top": "the first run's drop falling (Tier 3, item 18)",
  "style.css: @keyframes island-needsYou-pulse box-shadow": "needs you becomes one nudge of the notch, no loop (Part 2)",
  "style.css: @keyframes island-needsYou-pulse background": "needs you becomes one nudge of the notch, no loop (Part 2)",
};
function movedProps(): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of RULES) {
    if (r.at?.startsWith("@keyframes")) {
      for (const [k] of r.decl) if (!MAY_MOVE.has(k)) out.set(`${r.file}: ${r.at} ${k}`, r.sel);
      continue;
    }
    for (const [k, v] of r.decl) {
      const w = v.replace(/\s*!important$/, "");
      const props = k === "transition" ? commas(w).map((p) => p.split(/\s+/)[0]) : k === "transition-property" ? commas(w) : [];
      for (const p of props) if (p !== "none" && !MAY_MOVE.has(p)) out.set(`${r.file}: ${r.sel} transition ${p}`, r.sel);
    }
  }
  return out;
}

describe("only opacity and transform move", () => {
  test("no transition or keyframe moves a size, a position, a radius, a shadow, a blur or a custom property (the list only shrinks)", () => {
    // Under reduced motion the shared rule lists the fades it keeps; that is a list of what may move, not a motion.
    const found = [...movedProps().keys()].sort();
    expect(found).toEqual(Object.keys(STILL_MOVING_PAINT).sort());
  });
  test("nothing transitions everything, and nothing transitions a custom property (a room change, Flowflow's size)", () => {
    for (const r of RULES) for (const [k, v] of r.decl) if (/^transition(-property)?$/.test(k)) {
      expect(v, `${r.sel}`).not.toMatch(/(^|[\s,])all\b/);
      expect(v, `${r.sel}`).not.toMatch(/(^|[\s,])--[\w-]+\s/);
    }
    expect(TOKENS).not.toContain("@property --char");
  });
  test("the check really catches one", () => {
    const rules = parse("x.css", ".a { transition: width var(--dur-1) var(--ease-out), opacity var(--dur-1) var(--ease-out); } @keyframes k { to { box-shadow: 0 0 1px; opacity: 0; } }");
    const props = rules.flatMap((r) => r.at ? r.decl.map(([k]) => k) : commas(r.decl[0][1]).map((p) => p.split(/\s+/)[0])).filter((p) => !MAY_MOVE.has(p));
    expect(props).toEqual(["width", "box-shadow"]);
  });
});

/** The parts that come and go: where each comes in, and where it leaves. */
const COMES_AND_GOES = [
  { name: "a menu's list", enter: [".ui-menu-list", "ui-menu-in", "--dur-1"], exit: [".ui-menu-list[data-leaving]", "ui-menu-out", "--dur-exit-menu"] },
  { name: "a row's restore menu", enter: [".ui-pop", "ui-menu-in", "--dur-1"], exit: [".ui-pop[data-leaving]", "ui-menu-out", "--dur-exit-menu"] },
  { name: "a sheet", enter: [".ui-sheet", "ui-sheet-in", "--dur-3"], exit: [".ui-sheet-layer[data-leaving] .ui-sheet", "ui-sheet-out", "--dur-exit-sheet"] },
  { name: "its scrim", enter: [".ui-scrim", "ui-fade-in", "--dur-2"], exit: [".ui-sheet-layer[data-leaving] .ui-scrim", "ui-fade-out", "--dur-1"] },
  { name: "a toast", enter: [".ui-toast", "ui-toast-in", "--dur-2"], exit: [".ui-toast[data-leaving]", "ui-toast-out", "--dur-exit-toast"] },
] as const;
const ruleFor = (sel: string) => RULES.filter((r) => !r.at && r.sel.split(",").map((s) => s.trim()).includes(sel));
const animOf = (sel: string) => ruleFor(sel).flatMap((r) => r.decl.filter(([k]) => k === "animation").map(([, v]) => v)).join(", ");

describe("every enter has an exit", () => {
  for (const p of COMES_AND_GOES) test(`${p.name}: comes in on --ease-out, leaves quicker on --ease-exit`, () => {
    const enter = animOf(p.enter[0]), exit = animOf(p.exit[0]);
    expect(enter, p.enter[0]).toContain(`${p.enter[1]} var(${p.enter[2]}) var(--ease-out)`);
    expect(exit, p.exit[0]).toContain(`${p.exit[1]} var(${p.exit[2]}) var(--ease-exit)`);
    expect(tokenMs(p.exit[2]), p.name).toBeLessThan(tokenMs(p.enter[2]));
  });
  test("Home's content (M66): arrives on --ease-out once the shape is all but there, leaves first, quicker, then the shape folds", () => {
    const sheet = SHEETS["ui/homeShape.css"];
    expect(sheet).toContain('.home-stage[data-told]:is([data-phase="opening"], [data-phase="open"]) .home-frame { transition: opacity var(--dur-2) var(--ease-out) var(--seq-notch-content-at), transform var(--dur-2) var(--ease-out) var(--seq-notch-content-at); }');
    expect(sheet).toMatch(/\.home-stage\[data-told\] \.home-frame \{[^}]*transition: opacity var\(--dur-exit-menu\) linear, transform var\(--dur-exit-menu\) var\(--ease-exit\); \}/);
    expect(tokenMs("--dur-exit-menu")).toBeLessThan(tokenMs("--dur-2"));
    // The shape folds back on the CLOSE spring, which never passes its target (islandSpring.test.ts).
    expect(sheet).toContain(".hs > i, .hs > span, .hs > span > i { transition: transform var(--dur-notch-close) var(--ease-notch-close); }");
  });
  test("the notch's hover panel fades out on the exit curve, quicker than it came", () => {
    const hidden = ruleFor(".island-panel")[0].decl.find(([k]) => k === "transition")![1];
    const shown = ruleFor(".island-panel[data-shown]")[0].decl.find(([k]) => k === "transition")![1];
    expect(hidden).toContain("opacity var(--dur-exit-menu) linear");
    expect(hidden).toContain("scale var(--dur-exit-menu) var(--ease-exit)");
    expect(shown).toContain("opacity var(--dur-2) var(--ease-out)");
  });
  test("the parts keep what leaves in the page until its exit has played (ui/parts.tsx)", () => {
    const tsx = read("./parts.tsx");
    expect(tsx).toContain('const shownList = usePresence(open, "menu");');
    expect(tsx).toContain('const pop = usePresence(menu, "menu");');
    expect(tsx).toContain('<div className="ui-sheet-layer" data-leaving={leaving || undefined}>');
    expect(tsx).toContain('<div className="ui-toast" role="status" data-leaving={leaving || undefined}');
    expect(tsx).toContain("export const exitMs = (kind: ExitKind): number => (reducedMotion() ? 0 : EXIT_MS[kind]);");
    expect(EXIT_MS).toEqual({ menu: 100, toast: 140, sheet: 180, scrim: DUR[1] });
  });
});

describe("reduced motion keeps a plain fade, and nothing else", () => {
  const style = SHEETS["style.css"];
  const FADE = "animation: none !important; transition-property: opacity, color, background-color, border-color, outline-color, fill, stroke !important; transition-duration: var(--dur-1) !important; transition-timing-function: linear !important; transition-delay: 0s !important;";
  test("the Mac's Reduce motion and Squibby's Less motion: no movement, a 120 ms linear fade of opacity and colour", () => {
    expect(style).toContain(`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { ${FADE} } }`);
    expect(style).toContain(`:root[data-less-motion] *, :root[data-less-motion] *::before, :root[data-less-motion] *::after { ${FADE} }`);
    expect(style).not.toMatch(/\*::after \{ animation: none !important; transition: none !important; \}/);
    for (const p of ["opacity", "color", "background-color"]) expect(MAY_MOVE.has(p)).toBe(true);
  });
  test("what comes in still fades in, in both; what leaves goes at once (ui/parts.tsx exitMs)", () => {
    const parts = SHEETS["ui/parts.css"], list = ".ui-menu-list, .ui-pop, .ui-scrim, .ui-sheet, .ui-toast", home = ".home .view .panel";
    expect(parts).toContain(`@media (prefers-reduced-motion: reduce) { :is(${list}) { animation: ui-fade-in var(--dur-1) linear both !important; } }`);
    expect(parts).toContain(`${list.split(", ").map((x) => `:root[data-less-motion] ${x}`).join(", ")} { animation: ui-fade-in var(--dur-1) linear both !important; }`);
    expect(style).toContain(`@media (prefers-reduced-motion: reduce) { :is(${home}) { animation: ui-fade-in var(--dur-1) linear both !important; }`);
    expect(style).toContain(`:root[data-less-motion] :is(${home}) { animation: ui-fade-in var(--dur-1) linear both !important; }`);
    for (const p of COMES_AND_GOES) expect(`${list}, ${home}`, p.name).toContain(p.enter[0]);
  });
  test("the notch keeps its fades too: only its animations stop", () => {
    expect(style).toContain("@media (prefers-reduced-motion: reduce) { .island *, .island *::before, .island *::after { animation: none !important; } }");
  });
});
