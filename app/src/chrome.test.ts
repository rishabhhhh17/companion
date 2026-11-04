// M65 step 2, the chrome: everything around Home in the Instrument look. The notch island and its panel (black in every
// theme, keepNight), the character on the screen edge (the faceless glass orb under Instrument, no bubbles, no face), the
// small character in the notch, its panel and the practice panel, Settings' sidebar and rows, toasts, menus and confirm
// steps. Friendly stays exactly as it was: every chrome rule is gated on the Instrument style or the orb character.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dockShows, dockWords, miniShows, orbMotion } from "./chromeLook.ts";
import { characterOf } from "./lookfeel.ts";
import { TOKENS_CSS } from "./ui/cssFiles.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const CHROME = () => read("./ui/chrome.css");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
type Rule = { sel: string; decl: [string, string][]; at: string | null };
function parse(css0: string, at: string | null = null): Rule[] {
  const css = code(css0);
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, close = open;
    for (; close < css.length; close++) { if (css[close] === "{") depth++; else if (css[close] === "}" && --depth === 0) break; }
    const head = css.slice(i, open).trim(), body = css.slice(open + 1, close);
    if (head.startsWith("@")) out.push(...parse(body, head));
    else out.push({ sel: head, at, decl: body.split(";").map((d) => { const c = d.indexOf(":"); return [d.slice(0, c).trim(), d.slice(c + 1).trim()] as [string, string]; }).filter(([k]) => k) });
    i = close + 1;
  }
  return out;
}

describe("the orb's words on the edge agree with its ring (M65 step 4)", () => {
  test("a question or an approval waiting says Needs you beside the amber ring, never Working", () => {
    expect(dockWords("orb", "working", 1, "Working")).toBe("Needs you");
    expect(dockWords("orb", "idle", 2, "Ready")).toBe("Needs you");
    expect(dockWords("orb", "working", 0, "Working")).toBe("Working");
    expect(dockWords("orb", "error", 1, "Something went wrong")).toBe("Something went wrong");   // a stop stays a stop
  });
  test("the friendly character's words are as before", () => {
    expect(dockWords("friendly", "working", 1, "Working")).toBe("Working");
  });
  test("the edge uses them, and its badge and ring count what is waiting", () => {
    const dock = read("./dock.tsx");
    expect(dock).toContain("ring={ringFor(state, waiting)}");
    expect(dock).toContain("dockWords(charLook, state, waiting, characterWords(m))");
  });
});

describe("which character a small place and the edge show", () => {
  test("the orb with Instrument (or picked), the friendly one with Friendly (or picked)", () => {
    expect(miniShows(characterOf("instrument", "match"), { live: true, failed: false })).toBe("visor");   // M68
    expect(miniShows(characterOf(undefined, undefined), { live: true, failed: false })).toBe("visor");   // a store from before M65
    expect(miniShows(characterOf("instrument", "orb"), { live: true, failed: false })).toBe("orb");
    expect(miniShows(characterOf("friendly", "match"), { live: true, failed: false })).toBe("live");
    expect(miniShows(characterOf("friendly", "orb"), { live: true, failed: false })).toBe("orb");
    expect(miniShows(characterOf("instrument", "friendly"), { live: false, failed: false })).toBe("picture");
    expect(miniShows("friendly", { live: true, failed: true })).toBe("picture");
  });
  test("a picture of a friendly pose asked for by name (Settings' How lively tiles) stays that picture", () => {
    expect(miniShows("orb", { live: true, failed: false, pose: true })).toBe("picture");
  });
  test("the edge: the orb never loads the live water, and the friendly one keeps its two ways", () => {
    expect(dockShows("orb", true, false)).toBe("orb");
    expect(dockShows("orb", false, false)).toBe("orb");
    expect(dockShows("friendly", true, false)).toBe("live");
    expect(dockShows("friendly", true, true)).toBe("picture");
    expect(dockShows("friendly", false, false)).toBe("picture");
  });
  test("the orb has none of the friendly one's cartoon moves (breathe, swirl, droop, nod, wince): its ring says the state", () => {
    for (const m of ["breathe", "swirl", "busy", "scan", "glow", "droop"]) expect(orbMotion("orb", m)).toBeUndefined();
    expect(orbMotion("friendly", "breathe")).toBe("breathe");
    expect(orbMotion("friendly", undefined)).toBeUndefined();
  });
});

describe("the pages use it", () => {
  const mini = read("./flowflowMini.tsx"), dock = read("./dock.tsx"), island = read("./island.tsx");
  test("the small character draws the faceless glass orb with its state ring, from the one Orb part", () => {
    expect(mini).toContain("miniShows(");
    expect(mini).toContain("glassOrbSvg(");
    expect(mini).toContain("ringOf(state)");
    expect(mini).toMatch(/<Orb src=/);
    expect(mini).toContain("poseUrl(poseFor(state))");   // the friendly picture is still there for Friendly
  });
  test("the edge uses the same orb: no live water, no soft water and no pictures when it shows", () => {
    expect(dock).toContain("dockShows(");
    expect(dock).toMatch(/<Orb src=\{orbSrc\} ring=\{ringFor\(state, waiting\)\} \/>/);
    expect(dock).toMatch(/off: shows !== "picture"/);
    expect(dock).toContain("orbMotion(charLook, stateMotion(s, r))");   // the state's motion goes through the orb's rule
    expect(dock).toContain("data-character={charLook}");
  });
  test("the island keeps the notch's black (keepNight) and takes only the style's corners", () => {
    expect(island).toContain("useLook({ keepNight: true })");
    expect(island).toMatch(/data-style=\{choiceOf\("look\.style", useSetting\("look\.style"\)\)\}/);
    for (const r of parse(CHROME())) if (/\.island/.test(r.sel)) for (const [k] of r.decl) expect(k, r.sel).not.toMatch(/^(--notch|background|color)/);
  });
  test("chrome.css is loaded by every page it styles", () => {
    for (const f of ["./dock.tsx", "./island.tsx", "./settingsPage.tsx", "./practicePanel.tsx"]) expect(read(f), f).toContain('import "./ui/chrome.css";');
  });
});

describe("chrome.css", () => {
  const rules = parse(CHROME());
  test("every rule is gated on Instrument or the orb, so Friendly is exactly as it was", () => {
    expect(rules.length).toBeGreaterThan(5);
    for (const r of rules) for (const s of r.sel.split(",")) expect(s, s).toMatch(/data-style="instrument"|data-character="(orb|visor)"/);
  });
  test("it writes no colour: every one is a token", () => {
    const LIT = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black|red|blue|green|gray|grey)\b/i;
    for (const r of rules) for (const [k, v] of r.decl) expect(LIT.test(v), `${r.sel} { ${k}: ${v} }`).toBe(false);
  });
  test("no size or duration literal, and every corner is a token", () => {
    for (const r of rules) for (const [k, v] of r.decl) {
      expect(v, `${r.sel} { ${k}: ${v} }`).not.toMatch(/(^|[^\w.-])-?\d*\.?\d+(px|rem|em|ms|s|vh|vw|pt)\b/);
      if (/radius/.test(k) || /^--r-/.test(k)) expect(v, `${r.sel} { ${k}: ${v} }`).toMatch(/^((0|var\(--r-[\w-]+\))\s*)+$/);
    }
  });
  test("every token it reads is defined in tokens.css", () => {
    const defined = new Set([...TOKENS_CSS().matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    for (const m of code(CHROME()).matchAll(/var\((--[\w-]+)/g)) expect(defined.has(m[1]), m[1]).toBe(true);
  });
  test("never gated on the theme, never on the Mac's light or dark", () => {
    for (const r of rules) { expect(r.sel).not.toContain("data-theme"); expect(r.at ?? "").not.toMatch(/prefers-color-scheme/); }
  });
  test("Settings' open page in Instrument: a plain neutral fill, no stripe of light, no glow, no tint", () => {
    const open = rules.filter((r) => /data-style="instrument"/.test(r.sel) && /\.settings-side \.sb-item\[aria-current="page"\]/.test(r.sel));
    const decl = Object.fromEntries(open.flatMap((r) => r.decl.map(([k, v]) => [`${r.sel.includes("::after") ? "after:" : ""}${k}`, v])));
    expect(decl.background).toBe("var(--surface-2)");
    expect(decl["box-shadow"]).toBe("none");
    expect(decl["after:display"]).toBe("none");
  });
  test("the orb on the edge and in the notch is sized from tokens, and fits the edge's window (the button is 132 by 94)", () => {
    const edge = /--orb-edge:\s*(\d+)px/.exec(TOKENS_CSS());
    expect(edge).not.toBeNull();
    expect(Number(edge![1])).toBeLessThanOrEqual(94 - 2 * 4);   // its ring and gap stay inside the button
    expect(code(CHROME())).toMatch(/\.character\[data-character="orb"\][^{]*\{[^}]*--orb:\s*var\(--orb-edge\)/);
  });
  test("the count waiting on the orb is amber with dark words, like the ring it sits on (M65 step 4)", () => {
    const badge = rules.find((r) => r.sel.split(",").map((x) => x.trim()).includes('.character[data-character="orb"] .badge'))!;
    expect(badge.sel).toContain('.character[data-character="visor"] .badge');   // M68: the Visor's too
    const d = Object.fromEntries(badge.decl);
    expect(d.background).toBe("var(--amber)");
    expect(d.color).toBe("var(--amber-ink)");
  });
  test("motion stays in the style's own range: only tokens, and no loop on the orb", () => {
    for (const r of rules) for (const [k, v] of r.decl) if (/^(animation|transition)/.test(k)) expect(v, r.sel).not.toMatch(/infinite/);
  });
});

// M65 step 4: three critics read the Instrument shots. What they found on Home is fixed here, every rule gated on the
// Instrument style (so Friendly is as it was) and read from tokens.
describe("Home in Instrument, after the critics", () => {
  const rules = parse(CHROME());
  const IS = ':root[data-style="instrument"]';
  const decl = (sel: string) => Object.fromEntries(rules.filter((r) => r.sel.split(",").map((s) => s.trim()).includes(sel)).flatMap((r) => r.decl));
  const tokens = TOKENS_CSS();
  test("cards are flat: the page's first step and a hairline, no tinted glow, halo or wash", () => {
    for (const sel of [`${IS} .home .view .panel:not(.bare):not(.amber)`, `${IS} .home .ui-group-card`]) {
      expect(decl(sel).background, sel).toBe("var(--surface-1)");
      expect(decl(sel)["box-shadow"], sel).toBe("var(--card-flat)");
    }
    expect(decl(`${IS} .home .view .panel.job::after`).display).toBe("none");   // no breathing blue rim
    expect(tokens).toMatch(/:root\[data-style="instrument"\]\[data-tone\] \{[^}]*--card-halo-a: 0%;[^}]*--card-tint-a: 0%;[^}]*--card-lit-a: 0%;/);
    expect(tokens).toMatch(/:root\[data-style="instrument"\] \.home\[data-element\] \{[^}]*--el-shadow: rgba\(0, 0, 0, \.35\)/);
    expect(tokens).toMatch(/:root\[data-style="instrument"\]\[data-theme="paper"\] \.home\[data-element\] \{[^}]*--el-shadow: rgba\(0, 0, 0, \.08\)/);
  });
  test("the ask box is a quiet field: a neutral edge at rest and in focus, no accent frame and no glow (Home focuses it on every open)", () => {
    // M65 step 6: a control's edge at rest (3 to 1 on the page and the field, measured in lookChoices.test.ts). M69 (spec
    // 1.6): pinned at the bottom it floats, with one soft neutral shadow, the same at rest and in focus: never a glow.
    expect(decl(`${IS} .home .askwrap .ask`)).toMatchObject({ "border-color": "var(--ask-edge)", "box-shadow": "var(--ask-shadow-float)" });
    expect(decl(`${IS} .home .askwrap .ask:hover`)).toMatchObject({ "border-color": "var(--ask-hover-edge)" });
    expect(decl(`${IS} .home .askwrap .ask:focus-within`)).toMatchObject({ "border-color": "var(--ask-focus-edge)", "box-shadow": "var(--ask-shadow-float)" });
  });
  test("a screen's title is one size: the folded hero keeps the 17 point headline", () => {
    expect(decl(`${IS} .home[data-side] .hero[data-compact] .headline`)).toMatchObject({ "font-size": "var(--t-display)", "line-height": "var(--lh-display)" });
  });
  test("a card's own title is the card size, never a second page title", () => {
    expect(decl(`${IS} .home .ui-verdict[data-size="card"] .ui-verdict-words`)).toMatchObject({ "font-size": "var(--t-label)", "line-height": "var(--lh-label)" });
  });
  test("the project's name and Settings' back arrow line up with the page's left edge", () => {
    expect(decl(`${IS} .home .bar > .ui-menu .ui-menu-btn`)).toMatchObject({ "padding-inline": "0" });
    expect(decl(`${IS} .home .bar > .back`)).toMatchObject({ "margin-inline-start": "calc(var(--space-3) * -1)", "margin-inline-end": "calc(var(--space-2) * -1)" });
  });
  test("a result's Undo comes after what changed, and nothing fades over the card's foot", () => {
    expect(decl(`${IS} .home .panel.receipt`)).toMatchObject({ display: "flex", "flex-direction": "column" });
    expect(decl(`${IS} .home .panel.receipt > .result-actions`).order).toBe("1");
    expect(decl(`${IS} .home .panel.receipt > .changes ~ *`).order).toBe("2");
    expect(decl(`${IS} .home[data-side] .work > .askwrap::before`).display).toBe("none");
  });
  test("Home's list marks the open place in the accent's tint (M69, the mockups), Settings' in a plain grey row; no stripe, no glow", () => {
    expect(decl(`${IS} .home[data-side] .side .sb-item[aria-current="page"]`)).toMatchObject({ background: "var(--acc-tint)", color: "var(--acc-text)", "box-shadow": "none" });
    expect(decl(`${IS} .home[data-view="settings"] .settings-side .sb-item[aria-current="page"]`)).toMatchObject({ background: "var(--surface-2)", "box-shadow": "none" });
    expect(decl(`${IS} .home[data-side] .side .sb-item[aria-current="page"]::after`).display).toBe("none");
  });
  test("dividers inside a card are inset on both sides", () => {
    expect(decl(`${IS} .ui-row + .ui-row::before`).right).toBe("var(--space-4)");
  });
  test("History's review mark is the size of a task's tile, and the side list's waiting dot is a solid fill", () => {
    expect(decl(`${IS} .hist-review-mark`)).toMatchObject({ "min-width": "var(--tile-lg)", "min-height": "var(--tile-lg)" });
    expect(decl(`${IS} .hist-list + .line.muted`)["padding-inline-start"]).toBe("calc(var(--tile-lg) + var(--space-3))");
    expect(decl(`${IS} .home[data-side] .side-work .stamp[data-dot][data-stamp="notFixed"]`)).toMatchObject({ background: "currentColor", "box-shadow": "none" });
    expect(decl(`${IS} .home[data-side] .side-review .tile`)).toMatchObject({ background: "none", "box-shadow": "none" });
  });
});

describe("fixes for every look (M65 step 4)", () => {
  const style = read("./style.css"), look = read("./ui/look.css");
  test("the notch's question card fits its panel: its padding is inside its width", () => {
    expect(style).toMatch(/\.island-panel \.ip-job \{[^}]*box-sizing: border-box;/);
  });
  test("History's file names use the one code face, never the browser's own monospace", () => {
    expect(look).toMatch(/\.hist-files \{[^}]*font-family: var\(--font-code\);/);
  });
});

describe("the faceless characters have no listening halo (M68 step 3)", () => {
  test("the friendly character's listening glow is turned off on the orb and the Visor, which say it with their ring", () => {
    const rules = parse(CHROME());
    for (const c of ["orb", "visor"]) {
      const r = rules.find((x) => x.sel.split(",").some((s) => s.trim() === `.character[data-character="${c}"][data-state="listening"]`));
      expect(r, c).toBeDefined();
      expect(r!.decl).toContainEqual(["filter", "none"]);
    }
  });
});
