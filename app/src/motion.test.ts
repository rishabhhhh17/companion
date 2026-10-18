// Reduced motion everywhere (AGENTS.md, the bar 13; M11 wave 4 item 3). The Mac's Reduce motion setting reaches the pages
// as prefers-reduced-motion and the shell as NSWorkspace's accessibilityDisplayShouldReduceMotion. Each side reads it in
// one place, and everything that moves (the ring's pulse, the arrow's flight, the hand drawn marks, the character's trips
// and reactions, the island, the burst of dots and the confetti) checks it, along with the reactions setting where it is
// decoration. The pages need a real Mac to run, so they are read here as text.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { REDUCED, playful, reducedMotion, watchReducedMotion } from "./motion.ts";

const here = new URL("./", import.meta.url).pathname;
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const SOURCES = readdirSync(here).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")).sort();
const g = globalThis as { matchMedia?: unknown };

describe("the one helper the pages ask", () => {
  afterEach(() => { delete g.matchMedia; });
  test("reads the Mac's setting through prefers-reduced-motion", () => {
    expect(REDUCED).toBe("(prefers-reduced-motion: reduce)");
    g.matchMedia = (q: string) => ({ matches: q === REDUCED });
    expect(reducedMotion()).toBe(true);
    g.matchMedia = () => ({ matches: false });
    expect(reducedMotion()).toBe(false);
  });
  test("with no way to ask (a test, an old page) it is the usual motion, never a crash", () => {
    expect(reducedMotion()).toBe(false);
    g.matchMedia = () => { throw new Error("no"); };
    expect(reducedMotion()).toBe(false);
    expect(() => watchReducedMotion(() => {})()).not.toThrow();
  });
  test("tells a page when the setting changes, until the page stops listening", () => {
    let handler: (() => void) | null = null, matches = false;
    g.matchMedia = () => ({ get matches() { return matches; }, addEventListener: (_: string, h: () => void) => { handler = h; }, removeEventListener: () => { handler = null; } });
    const seen: boolean[] = [];
    const stop = watchReducedMotion((r) => seen.push(r));
    matches = true; handler!();
    matches = false; handler!();
    expect(seen).toEqual([true, false]);
    stop();
    expect(handler).toBeNull();
  });
  test("decoration that moves (confetti, the burst, a reaction) needs reactions on and the Mac not asking for less motion", () => {
    expect(playful(true, false)).toBe(true);
    expect(playful(false, false)).toBe(false);
    expect(playful(true, true)).toBe(false);
    expect(playful(false, true)).toBe(false);
  });
});

// A line that moves something is guarded when it, or a block it is inside, checks the setting, or an earlier line of a
// block it is inside returns early when motion is reduced.
const MOVES = /requestAnimationFrame\(|\.style\.transition\s*=|\.style\.animation\s*=|\.animate\(/;
const GUARD = /\breduced\b|reducedMotion\(\)|playful\(/;
function unguarded(src: string): string[] {
  const lines = src.split("\n"), out: string[] = [];
  lines.forEach((line, n) => {
    if (!MOVES.test(line) || GUARD.test(line)) return;
    let depth = 0, ok = false;
    for (let k = n - 1; k >= 0 && !ok; k--) {
      const l = lines[k].replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
      depth += (l.match(/\}/g) ?? []).length - (l.match(/\{/g) ?? []).length;
      if (depth < 0) { ok = GUARD.test(l); depth = 0; }   // a block this line is inside
      else if (depth === 0 && /^\s*if \(/.test(l) && GUARD.test(l) && /\breturn\b/.test(l)) ok = true;   // returns early
      if (/^(export )?(async )?function\b/.test(lines[k])) break;   // the top of the function it is in
    }
    if (!ok) out.push(`${n + 1}: ${line.trim()}`);
  });
  return out;
}

describe("every page that moves something checks the setting", () => {
  test("the guard check catches motion with no check, and passes motion behind one", () => {
    expect(unguarded("function a() {\n  requestAnimationFrame(step);\n}")).toHaveLength(1);
    expect(unguarded("function a() {\n  if (x) {\n    el.style.transition = \"opacity .5s\";\n  }\n}")).toHaveLength(1);
    expect(unguarded("function a() {\n  if (reduced) { done(); return; }\n  requestAnimationFrame(step);\n}")).toEqual([]);
    expect(unguarded("function a() {\n  if (!reduced) {\n    for (const s of x) {\n      s.style.transition = \"x\";\n    }\n  }\n}")).toEqual([]);
    expect(unguarded("function a() {\n  if (!reduced) { y(); }\n  el.style.transition = \"x\";\n}"), "a closed block before it is not a guard").toHaveLength(1);
  });
  test("only the helper reads the setting; every other page asks it", () => {
    const readers = SOURCES.filter((f) => /prefers-reduced-motion|matchMedia\(/.test(read(`./${f}`)));
    expect(readers).toEqual(["motion.ts"]);
  });
  test("every page that moves something imports the helper and checks it before each move", () => {
    const movers = SOURCES.filter((f) => MOVES.test(read(`./${f}`)));
    expect(movers).toEqual(expect.arrayContaining(["dock.tsx", "overlay.ts"]));
    for (const f of movers) {
      const src = read(`./${f}`);
      expect(src, f).toMatch(/from "\.\/motion\.ts";/);
      expect(unguarded(src), f).toEqual([]);
    }
  });
  test("the arrow's flight and the hand drawn marks: none with reduced motion, the ring is simply there", () => {
    const o = read("./overlay.ts");
    const show = o.slice(o.indexOf("function show("), o.indexOf('void listen("overlay-point"'));
    expect(show).toContain("const reduced = p.reduced ?? reducedMotion();");
    expect(show).toContain("if (reduced) { land(); return; }");
    expect(show).toContain("if (!reduced) {");
  });
  test("the burst of dots and the confetti follow the reactions setting and reduced motion", () => {
    const o = read("./overlay.ts");
    const party = o.slice(o.indexOf("function party("), o.indexOf('void listen("overlay-party"'));
    expect(party.split("\n")[1].trim()).toBe("if (!playful(reactionsOn(), reducedMotion())) return;");
    const burst = o.slice(o.indexOf("function celebrate("), o.indexOf('void listen("overlay-celebrate"'));
    expect(burst).toContain("if (playful(reactionsOn(), reduced)) {");
    expect(o).toMatch(/import \{ reactionsOn \} from "\.\/reactions\.ts";/);
  });
  test("the character's reactions and its call for confetti: none with reactions off or reduced motion", () => {
    const dock = read("./dock.tsx");
    const handler = dock.slice(dock.indexOf('listen("runner-event"'), dock.indexOf("return () => { off.then((f) => f()); };"));
    expect(handler.split("\n")[1].trim()).toBe("if (!playful(reactionsOn(), reducedMotion())) return;");
    expect(handler.indexOf("playful(")).toBeLessThan(handler.indexOf('invoke("celebrate")'));
    expect(handler).toContain('invoke("quiet_now")');
    expect(dock).toContain("useState(reducedMotion)");
    expect(dock).toContain("watchReducedMotion(setReduced)");
    expect(dock).toContain("data-motion={motionFor(visualState(m), reduced)}");
  });
});

type Rule = { sel: string; decl: Record<string, string>; media: string };
function rules(css0: string, media = ""): Rule[] {
  const css = css0.replace(/\/\*[\s\S]*?\*\//g, ""), out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@media")) out.push(...rules(body, head));
    else if (!head.startsWith("@")) {
      const decl: Record<string, string> = {};
      for (const d of body.split(";")) { const c = d.indexOf(":"); if (c > 0) decl[d.slice(0, c).trim()] = d.slice(c + 1).trim(); }
      for (const sel of head.split(",")) out.push({ sel: sel.trim(), decl, media });
    }
    i = close + 1;
  }
  return out;
}
const parts = (sel: string): string[] => sel.match(/\.[\w-]+|\[[\w-]+|#[\w-]+|^[a-z]+/g) ?? [];
/** Rules that move something, each with the reduced motion rule that stops it, or null. */
function motionCover(css: string): { sel: string; prop: string; by: string | null }[] {
  const all = rules(css);
  const calm = all.filter((r) => /prefers-reduced-motion:\s*reduce/.test(r.media));
  const out: { sel: string; prop: string; by: string | null }[] = [];
  for (const r of all.filter((x) => !/prefers-reduced-motion/.test(x.media))) {
    for (const prop of ["animation", "transition"]) {
      const v = r.decl[prop] ?? r.decl[`${prop}-name`] ?? r.decl[`${prop}-property`];
      if (!v || /^none\b/.test(v)) continue;
      const by = calm.find((c) => /^none\b/.test(c.decl[prop] ?? "") && parts(c.sel).every((p) => parts(r.sel).includes(p)));
      out.push({ sel: r.sel, prop, by: by?.sel ?? null });
    }
  }
  return out;
}

describe("every animation and transition in the stylesheets stops with reduced motion", () => {
  test("the check finds one with no guard", () => {
    expect(motionCover(".a { transition: opacity .2s }")).toEqual([{ sel: ".a", prop: "transition", by: null }]);
    expect(motionCover(".a[data-x=\"1\"] { animation: s 1s } @media (prefers-reduced-motion: reduce) { .a[data-x] { animation: none } }")[0].by).toBe(".a[data-x]");
    expect(motionCover(".a { animation: s 1s } @media (prefers-reduced-motion: reduce) { .a { transition: none } }")[0].by, "the wrong property is no guard").toBeNull();
  });
  const sheets: [string, string][] = [["style.css", read("./style.css")], ...readdirSync(new URL("../", import.meta.url).pathname).filter((f) => f.endsWith(".html")).map((f) => [f, [...read(`../${f}`).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")] as [string, string])];
  test("the pages with their own styles are read too", () => {
    expect(sheets.map(([f]) => f)).toEqual(expect.arrayContaining(["style.css", "overlay.html", "card.html", "dock.html", "island.html"]));
  });
  for (const [f, css] of sheets) {
    test(`${f}: each one has a reduced motion rule that stops it`, () => {
      const c = motionCover(css);
      expect(c.filter((x) => !x.by), JSON.stringify(c)).toEqual([]);
    });
  }
  test("the character's states, reactions and named trips are among them", () => {
    const c = motionCover(read("./style.css")).map((x) => x.sel);
    for (const s of ['.character[data-motion="breathe"]', '.character[data-react="party"]', '.character[data-roam="travel"]', '.character[data-roam="surface"]']) expect(c, s).toContain(s);
    const o = motionCover(sheets.find(([f]) => f === "overlay.html")![1]).map((x) => x.sel);
    expect(o).toEqual(expect.arrayContaining([".ring", ".cap"]));
  });
});

describe("the shell reads the Mac's setting once, and the island never animates", () => {
  const rs = readdirSync(new URL("../src-tauri/src/", import.meta.url).pathname).filter((f) => f.endsWith(".rs"));
  const all = rs.map((f) => [f, read(`../src-tauri/src/${f}`)] as const);
  const main = read("../src-tauri/src/main.rs");
  test("one reader of the setting, and the character's trips take it", () => {
    // A Rust test that names it in quotes (to check this very rule) does not count.
    const calls = all.flatMap(([f, s]) => [...s.matchAll(/(?<!")accessibilityDisplayShouldReduceMotion\(\)/g)].map(() => f));
    expect(calls).toEqual(["main.rs"]);
    expect(main).toMatch(/fn reduce_motion\(\) -> bool \{ NSWorkspace::sharedWorkspace\(\)\.accessibilityDisplayShouldReduceMotion\(\) \}/);
    expect(main).toContain("roam_animate(app, mv, reduce_motion())");
  });
  test("nothing in the shell animates a window: the island opens and closes in place, Home drops down in place", () => {
    for (const [f, s] of all) expect(s, f).not.toMatch(/setFrame_display_animate|\.animator\(\)|NSAnimationContext/);
    const place = main.slice(main.indexOf("fn place_island("), main.indexOf("\n}\n", main.indexOf("fn place_island(")));
    expect(place).toContain("setFrame_display(");
  });
});
