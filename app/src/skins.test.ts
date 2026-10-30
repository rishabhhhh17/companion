// A character is a skin (skins.ts, docs/design/look.md). The chrome is black and white and never reads a skin; only the
// character's own glow and its flow do.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { POSES } from "./characters.ts";
import { SKIN, WATER, poseFile, skinColor, skinVars } from "./skins.ts";

import { ALL_CSS, PARTS_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
const here = new URL("./", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(here, p), "utf8");
const PAGES = readdirSync(here).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));

describe("the water skin", () => {
  test("it has an id, a folder of poses that exists with every pose in it, and one cool hue", () => {
    expect(WATER.id).toBe("water");
    expect(SKIN).toBe(WATER);
    const files = readdirSync(join(here, "..", "public", WATER.posesDir.replace(/^\.\//, ""))).map((f) => f.replace(/\.png$/, "")).sort();
    expect(files).toEqual([...POSES].sort());
    // Cool: from green-blue through blue to violet-blue, saturated enough to read as water.
    expect(WATER.hue.h).toBeGreaterThanOrEqual(170);
    expect(WATER.hue.h).toBeLessThanOrEqual(260);
    expect(WATER.hue.s).toBeGreaterThanOrEqual(60);
  });
  test("a pose's picture is found next to the page, by the skin's folder", () => {
    expect(poseFile(WATER, "look")).toBe("./characters/water/look.png");
  });
  test("its motion numbers are all real, positive and in sensible bounds (physics.test.ts checks what they do)", () => {
    for (const [k, v] of Object.entries(WATER.motion)) { expect(Number.isFinite(v), k).toBe(true); expect(v, k).toBeGreaterThan(0); }
    expect(WATER.motion.dissolveS).toBeGreaterThanOrEqual(0.15);
    expect(WATER.motion.dissolveS).toBeLessThanOrEqual(0.8);
    expect(WATER.motion.calmFadeS).toBeLessThanOrEqual(0.3);
    expect(WATER.motion.idleFps).toBeLessThan(WATER.motion.activeFps);
    expect(WATER.motion.activeFps).toBeLessThanOrEqual(60);
  });
  test("its colour is written as hsl and carries the hue, for the glow and the droplets", () => {
    expect(skinColor(WATER)).toBe(`hsl(${WATER.hue.h} ${WATER.hue.s}% ${WATER.hue.l}%)`);
    expect(skinColor(WATER, 0, 0.5)).toContain("/ 0.5)");
    expect(skinColor(WATER, 500)).toContain("100%");
  });
  test("it reaches the page only as custom properties on the character", () => {
    expect(Object.keys(skinVars(WATER)).sort()).toEqual(["--skin-glow", "--skin-glow-soft"]);
  });
});

describe("the chrome does not read a skin", () => {
  // The three stylesheets (ui/tokens.css, ui/parts.css, style.css), in the order the page applies them.
  const css = ALL_CSS();
  test("only the dock page, which draws the character, imports the skins", () => {
    // The flow code and the dock's hook read it; the card, the island, Settings, the first run and the pointer never do.
    const users = PAGES.filter((f) => /from "\.\/skins\.ts"|from "\.\.\/skins\.ts"/.test(read(f)));
    expect(users.sort()).toEqual(["characters.ts", "dock.tsx"].sort());
    for (const f of ["card.tsx", "island.tsx", "settingsPage.tsx", "onboarding.tsx", "overlay.ts", "dropRing.tsx", "icons.tsx"]) expect(read(f), f).not.toContain("skins.ts");
  });
  test("the hue is written once, in skins.ts, and never in the stylesheet", () => {
    expect(css).not.toContain(`hsl(${WATER.hue.h}`);
    // The glow rules take it from the character's own custom properties.
    expect(css).toContain("var(--skin-glow");
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const line of rules.split("\n").filter((l) => l.includes("--skin-glow"))) expect(line, line).toMatch(/\.character/);
  });
  test("the base tokens are neutral greys in Night and Paper (only the marks and the water carry a hue)", () => {
    const tokensCss = TOKENS_CSS();
    const night = /\n:root \{([^}]*)\}/.exec(tokensCss)![1];
    const paper = /:root\[data-theme="paper"\] \{([^}]*)\}/.exec(tokensCss)![1];
    const tokens = (block: string) => Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2]]));
    // How far a colour is from grey: the spread between its strongest and weakest channel (0 is grey, 1 is a pure colour).
    const sat = (hex: string) => {
      const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    // Semantic marks keep a colour (proven, needs you, not fixed), and so does the water ("Squibby is acting"). The silver is
    // a grey with the faintest cool cast; its dark edge is the only part of it past the line. Everything else is grey.
    const SEMANTIC = ["--amber", "--ok", "--bad", "--water", "--water-hi", "--water-deep", "--sea", "--sea-deep", "--silver-edge"];
    for (const [name, block] of [["Night", night], ["Paper", paper]] as const) {
      const t = tokens(block);
      for (const [k, v] of Object.entries(t)) if (!SEMANTIC.includes(k)) expect(sat(v), `${name} ${k}: ${v}`).toBeLessThan(0.04);
    }
    expect(Object.keys(tokens(night))).toEqual(expect.arrayContaining(["--bg", "--fg", "--fg-2", "--fg-3", "--surface-1", "--surface-2", "--surface-3", "--inset", "--silver"]));
    // Lime is gone (the overhaul spec, 2.1): its uses became --fg or --silver.
    expect(css).not.toMatch(/--lime/);
  });
  test("no orange anywhere in the stylesheet: the old accent is gone and amber stays a small mark", () => {
    expect(css).not.toMatch(/#ff9a2e/i);
    expect(css).not.toContain("--accent");
    // Where the waiting amber is used: the character's needs you glow, the island's mark, a tab's dot and a panel's headline dot,
    // and (M45) the small mark of a result that is only partly proven.
    // In the parts (M45 and the overhaul spec): a verdict that is partly proven or waits for an answer, a permission that is
    // not allowed, and a sidebar page that needs attention. In Settings (the spec, 3.10): the Plan card's mark when the Pro key
    // is not active (it needs you).
    const uses = css.split("\n").filter((l) => /var\(--amber(-line)?\)/.test(l) && !/^--|^:root|^@media/.test(l.trim()) && !l.trim().startsWith("/*"));
    for (const l of uses) expect(l, l).toMatch(/needsYou|\.tabdot|\.panel\.amber|data-tone="partly"|data-tone="mixed"|data-tone="ask"|data-kind="notAllowed"|\.sb-dot|\.plan-line\[data-mark="amber"\]|@keyframes (glow|pose-glow)|--amber-line: var\(--amber\)/);
  });
  test("the main button is flat silver: one fill, one edge of light, no band (the founder, 31 Oct: no random middle line)", () => {
    const parts = PARTS_CSS(), tokens = TOKENS_CSS();
    expect(parts).toMatch(/\n\.btn\.primary \{[^}]*background: var\(--main\); color: var\(--main-ink\); box-shadow: var\(--main-shadow\); \}/);
    expect(tokens).toMatch(/--main: var\(--silver\);/);
    expect(tokens).toMatch(/--silver: #E9ECF1;/);
    expect(tokens).toMatch(/--silver-ink: #0A0A0B;/);
    expect(tokens).toMatch(/--main-shadow: inset 0 1px 0 var\(--silver-lip\), 0 1px 0 var\(--silver-edge\);/);
    // Paper's main button is ink: silver on white reads as disabled.
    expect(/:root\[data-theme="paper"\] \{([^}]*)\}/.exec(tokens)![1]).toMatch(/--main: var\(--fg\);[^}]*--main-shadow: none;/);
    // The banded chrome is gone everywhere, and nothing else is ever silver.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/--chrome/);
    expect(code).not.toMatch(/background-clip: text/);
    expect(css).not.toContain("#C6F432");
  });

});
