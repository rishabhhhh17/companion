// Reduced motion everywhere (AGENTS.md, the bar 13; M11 wave 4 item 3). The Mac's Reduce motion setting reaches the pages
// as prefers-reduced-motion and the shell as NSWorkspace's accessibilityDisplayShouldReduceMotion. Each side reads it in
// one place, and everything that moves (the ring's pulse, the arrow's flight, the hand drawn marks, the character's trips
// and reactions, the island, the burst of dots and the confetti) checks it, along with the reactions setting where it is
// decoration. The pages need a real Mac to run, so they are read here as text.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { REDUCED, followLessMotion, lessMotion, playful, reducedMotion, watchReducedMotion } from "./motion.ts";
import { _resetForTests, takeSnapshot } from "./settingsStore.ts";
import { PRODUCT } from "./strings.ts";

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
    expect(show).toContain("if (reduced) {\n      parts.forEach((_, i) => paint(i, 1));");   // M28: the whole mark at once, faded in
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
    expect(dock).toContain("data-motion={motionFor(state, reduced)}");
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
  test(`every capture light (looking at the screen, listening) is still a mark with motion reduced, by the Mac or by ${PRODUCT}`, () => {
    // Rule 5: the light for the screen and the microphone must be on screen first. Looking's own light is its scan, which
    // stops with reduced motion, so a still ring must show it then, as listening's ring always does.
    const all = rules(read("./style.css"));
    // A still mark: a glow along the character's outline (M15: never a ring around a box), with nothing moving.
    const still = (r: Rule) => /drop-shadow\(/.test(r.decl.filter ?? "") && !r.decl.animation && !r.decl.transition;
    for (const state of ["checking", "listening"]) {
      const sel = `.character[data-state="${state}"]`;
      const always = all.filter((r) => r.sel === sel && r.media === "" && still(r));
      const mac = all.filter((r) => r.sel === sel && /prefers-reduced-motion:\s*reduce/.test(r.media) && still(r));
      const less = all.filter((r) => r.sel === `:root[data-less-motion] ${sel}` && r.media === "" && still(r));
      expect(always.length > 0 || (mac.length > 0 && less.length > 0), state).toBe(true);
    }
    // The usual look of looking is unchanged: its ring is only for reduced motion.
    expect(all.filter((r) => r.sel === '.character[data-state="checking"]' && r.media === "")).toEqual([]);
    // The rules that stop motion stop only motion, never a mark.
    for (const r of all.filter((x) => x.sel.startsWith(":root[data-less-motion] *"))) expect(Object.keys(r.decl).sort(), r.sel).toEqual(["animation", "transition"]);
    for (const r of all.filter((x) => /prefers-reduced-motion/.test(x.media) && x.sel.includes("[data-motion]"))) expect(Object.keys(r.decl).sort(), r.sel).toEqual(["animation", "transition"]);
  });
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
    expect(main).toMatch(/fn reduce_motion\(\) -> bool \{ home_set\(\)\.less_motion \|\| NSWorkspace::sharedWorkspace\(\)\.accessibilityDisplayShouldReduceMotion\(\) \}/);
    expect(main).toContain("roam_animate(app, mv, reduce_motion())");
  });
  // Until 19 Oct 2026 nothing in the shell animated a window. HeyClicky v1.0.53 parity: the island's downward grow and
  // Home's drop when it opens are a short motion, and both appear in place with reduced motion (island.rs decides).
  test("the shell's only window motion is the island's grow and Home's drop, and with reduced motion they appear in place", () => {
    const helper = main.slice(main.indexOf("fn set_frame_moving("), main.indexOf("\n}\n", main.indexOf("fn set_frame_moving(")));
    for (const [f, s] of all) {
      expect(s, f).not.toMatch(/setFrame_display_animate/);
      const outside = f === "main.rs" ? s.replace(helper, "") : s;
      expect(outside, f).not.toMatch(/\.animator\(\)|NSAnimationContext::run/);
    }
    // No motion asked: a motion of no length (it replaces one still running), and the frame set at once as well.
    expect(helper).toContain("setDuration(secs.unwrap_or(0.0))");
    expect(helper).toContain("if secs.is_none() { p.setFrame_display(f, true); if let Some(a) = alpha { p.setAlphaValue(a); } }");
    // Every motion passed to it comes from island.rs with the one reader of reduced motion; Home's resize is at once.
    const calls = [...main.matchAll(/set_frame_moving\(([^;]*)\)/g)].map((m) => m[1]).filter((c) => !c.startsWith("p: &NSPanel"));
    // The island, Home's resize and Home's drop; and since peeking (27 Oct 2026) the character's own window: at once for its
    // place and its trips, and a peek's motion only as peek.rs decides it, with the one reader of reduced motion.
    const dock = calls.filter((c) => c.includes("&DOCK_MOVES")).map((c) => c.replace(/\)$/, ""));
    expect(calls.length - dock.length).toBe(3);
    expect(dock.sort()).toEqual(["d, to_appkit(f, ph), None, None, &DOCK_MOVES", "d, to_appkit(f, ph), secs, None, &DOCK_MOVES", "d, to_appkit(r, ph), None, None, &DOCK_MOVES"]);
    expect(main).toContain("let secs = peek::motion(was, pose, calm, light);");
    expect(main).toContain("let calm = reduce_motion();");
    expect(calls).toContain("c, to_appkit(cf, ph), None, None, &CARD_MOVES");
    expect(main).toContain("island::retract_ms(from, f, reduce_motion())");
    expect(main).toContain("island::home_drop(from_appkit(c.frame(), ph), !was_open && island::animates_open(&src), reduce_motion())");
  });
});

// ---- M11 area 4: Companion's own Motion setting (character.motion), inside Companion only ----
describe("Motion: Follow my Mac, or Less motion", () => {
  afterEach(() => { delete g.matchMedia; _resetForTests(); });
  const snap = (motion?: string) => takeSnapshot({ values: motion ? { "character.motion": motion } : {}, usual: {}, project: "", migrated: ["pageStorage.v1"], problems: [], changed: [] }, null);
  test("Follow my Mac is today's: only the Mac's own setting counts", () => {
    snap();
    expect(lessMotion()).toBe(false);
    expect(reducedMotion()).toBe(false);
    g.matchMedia = (q: string) => ({ matches: q === REDUCED });
    expect(reducedMotion()).toBe(true);
  });
  test(`Less motion means less motion everywhere in ${PRODUCT}, whatever the Mac says`, () => {
    snap("less");
    expect(lessMotion()).toBe(true);
    expect(reducedMotion()).toBe(true);
    g.matchMedia = () => ({ matches: false });
    expect(reducedMotion(), `the rest of the Mac is not changed, and ${PRODUCT} still moves less`).toBe(true);
    // So the character's state stops moving and decoration does not play.
    expect(playful(true, reducedMotion())).toBe(false);
  });
  test("a page watching is told when the setting changes, once per change, until it stops listening", () => {
    snap();
    const seen: boolean[] = [];
    const stop = watchReducedMotion((r) => seen.push(r));
    snap("less"); snap("less"); snap("followMac");
    expect(seen).toEqual([true, false]);
    stop();
    snap("less");
    expect(seen).toEqual([true, false]);
  });
  test("each page marks its root, so the stylesheets stop their own animations and transitions too", () => {
    const on = new Set<string>();
    const root = { toggleAttribute: (n: string, force: boolean) => { if (force) on.add(n); else on.delete(n); return force; } };
    snap();
    const stop = followLessMotion(root);
    expect(on.has("data-less-motion")).toBe(false);
    snap("less");
    expect(on.has("data-less-motion")).toBe(true);
    snap("followMac");
    expect(on.has("data-less-motion")).toBe(false);
    stop();
    snap("less");
    expect(on.has("data-less-motion"), "stopped").toBe(false);
    expect(() => followLessMotion(null)()).not.toThrow();
  });
  test("every page that moves follows it, and every stylesheet stops all motion under the mark", () => {
    for (const f of ["dock.tsx", "island.tsx", "card.tsx", "overlay.ts"]) expect(read(`./${f}`), f).toContain("followLessMotion();");
    const sheets = [read("./style.css"), read("../overlay.html")];
    for (const css of sheets) {
      // The rules that stop motion (the still marks under the same attribute, such as looking's ring, are tested above).
      const calm = rules(css).filter((r) => r.sel.startsWith(":root[data-less-motion] *"));
      expect(calm.map((r) => r.sel)).toEqual(expect.arrayContaining([":root[data-less-motion] *", ":root[data-less-motion] *::before", ":root[data-less-motion] *::after"]));
      for (const r of calm) { expect(r.decl.animation).toMatch(/^none\b/); expect(r.decl.transition).toMatch(/^none\b/); }
    }
  });
  test("the overlay takes the settings sent with each pointer and each sketch before it draws", () => {
    const o = read("./overlay.ts");
    expect(o).toMatch(/listen\("overlay-point", \(e\) => \{ const p = e\.payload as Point & \{ settings\?: unknown \}; takeSnapshot\(p\.settings\); show\(p\); \}\)/);
    expect(o).toMatch(/listen\("overlay-diagram", \(e\) => \{[^\n]*takeSnapshot\(p\.settings\);/);
  });
});

