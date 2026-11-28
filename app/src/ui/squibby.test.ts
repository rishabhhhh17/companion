// M125: the rulebook for ui/squibby.css, the website's look in the app (look.material "squibby", the usual). The black
// look's lints (styleLint, motionLint) forbid gradients and every face but the system's; the site's sky, its paper and its
// fonts need both. So this file holds squibby.css to its own rules, as strict where they can be the same.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const CSS = read("./squibby.css");
const TOKENS = read("./tokens.css");
const body = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const tokenBlock = (() => { const i = TOKENS.indexOf(':root[data-brand="squibby"] {'); return TOKENS.slice(i, TOKENS.indexOf("\n}\n", i)); })();
const tokenValue = (name: string): string => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(tokenBlock);
  if (!m) throw new Error(`no ${name}`);
  const v = m[1].trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? tokenValue(ref[1]) : v;
};

// Contrast, as WCAG measures it, for #rrggbb on #rrggbb.
const lum = (hex: string) => {
  const c = hex.replace("#", "").match(/../g)!.map((h) => parseInt(h, 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("squibby.css: the website's look, held to its own rules", () => {
  test("every rule hangs off the squibby brand, so Glass and Before are untouched", () => {
    const rules = body.replace(/:root(?=\[data-brand="squibby"\])/g, "").replace(/@font-face\s*\{[^}]*\}/g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "").replace(/@media[^{]+\{/g, "");
    for (const m of rules.matchAll(/([^{}]+)\{[^}]*\}/g)) {
      const sel = m[1].trim();
      if (!sel) continue;
      for (const s of sel.split(/,(?![^(]*\))/)) expect(s.trim(), s).toMatch(/^\[data-brand="squibby"\]/);
    }
  });
  test("no colour written here: every colour is a token from tokens.css", () => {
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|color)\(/i);
    for (const [, name] of body.matchAll(/var\((--sq-[\w-]+)\)/g)) expect(tokenBlock, name).toContain(`${name}:`);
  });
  test("fonts are the site's own files inside the app; nothing is fetched", () => {
    expect(body).not.toMatch(/https?:\/\//);
    const urls = [...body.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(4);
    for (const u of urls) {
      expect(u).toMatch(/^\.\/fonts\/[\w-]+\.woff2$/);
      expect(existsSync(new URL(u, import.meta.url)), u).toBe(true);
    }
  });
  test("gradients only cut the paper's and the ticket's shapes, never a fill or a title", () => {
    for (const m of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) for (const d of m[2].split(";")) {
      if (!/gradient\(/.test(d)) continue;
      const prop = d.split(":")[0].trim();
      expect(["-webkit-mask", "mask", "-webkit-mask-image", "mask-image", "background"], `${m[1].trim()} ${prop}`).toContain(prop);
      if (prop === "background") expect(m[1], "only the pixel layer paints with a pattern").toMatch(/data-landed\]::before/);
    }
  });
  test("all glass: no black header, the ask box follows the work with no band, fade or border, in both layouts", () => {
    expect(body).toMatch(/\.gl-top \{ position: relative !important; background: transparent; box-shadow: none; \}/);
    expect(body).toMatch(/\.gl-top::before \{ display: none; \}/);
    // As strong as the tall layout's sticky rule (system.css), which beat the first try on the real Mac.
    expect(body).toMatch(/:root\[data-brand="squibby"\] \.home \.work > \.askwrap \{ position: static !important;[^}]*background: transparent !important; \}/);
    expect(body).toMatch(/\.askwrap::after \{ display: none !important; \}/);
    expect(body).not.toMatch(/backdrop-filter/);
  });
  test("motion is opacity only, with token times, and reduce motion turns it off", () => {
    for (const [, frames] of body.matchAll(/@keyframes[^{]+\{([\s\S]*?\})\s*\}/g)) for (const [, decl] of frames.matchAll(/\{([^}]*)\}/g)) for (const d of decl.split(";").map((x) => x.trim()).filter(Boolean)) expect(d.split(":")[0].trim(), d).toBe("opacity");
    for (const [, v] of body.matchAll(/(?:animation|transition)(?:-duration)?:\s*([^;]+);/g)) expect(v.replace(/var\([^)]*\)/g, ""), v).not.toMatch(/\d+m?s\b|cubic-bezier|steps\(/);
    expect(body).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
  test("the words read: measured contrast on the receipt's paper and on the white ticket", () => {
    const paper = tokenValue("--sq-paper");
    expect(ratio(tokenValue("--sq-ink"), paper)).toBeGreaterThanOrEqual(7);
    expect(ratio(tokenValue("--sq-ink-2"), paper)).toBeGreaterThanOrEqual(7);
    expect(ratio(tokenValue("--sq-ink-3"), paper)).toBeGreaterThanOrEqual(4.5);
    for (const t of ["--sq-proven", "--sq-caught", "--sq-review", "--sq-link", "--sq-working"]) expect(ratio(tokenValue(t), paper), t).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tokenValue("--acc-ink"), tokenValue("--acc")), "ink on the white ticket").toBeGreaterThanOrEqual(7);
    expect(ratio(tokenValue("--sq-paper"), tokenValue("--sq-ink")), "the ink ticket on paper").toBeGreaterThanOrEqual(7);
  });
  test("the glass stays the glass: no sky, no tint, no surface or word colour is changed outside the receipt", () => {
    // Only the glass's tint and the notch fade change (Liquid Glass does the dark); no surface or word colour.
    expect(tokenBlock.match(/--mat-[\w-]+(?=:)/g)).toEqual(["--mat-tint", "--mat-fade-h"]);
    expect(tokenBlock).not.toMatch(/--(surface-|bg:|fg)/);
    expect(body.replace(/\.panel\.receipt[^{]*\{[^}]*\}/g, "")).not.toMatch(/--(fg|surface|mat-)[\w-]*:/);
    expect(body).not.toMatch(/\.card\.home\b|\.gl-tab\b|\.ui-mlist|\.setup/);
  });
  test("the root's data-material is only ever a structure (glass or classic); squibby rides on data-brand", () => {
    // 28 Nov 2026, the first real Mac look: useLook wrote "squibby" into data-material, so no glass layout rule matched and
    // Home showed only a giant character. Every writer of data-material goes through structureOf.
    const hook = read("../useLook.ts");
    expect(hook).toContain('setAttribute("data-material", structureOf(m))');
    expect(hook).not.toMatch(/setAttribute\("data-material", materialOf\(/);
    for (const f of ["../card.tsx", "../trayPanel.tsx", "../lookfeel.ts", "../island.tsx", "../dock.tsx"]) {
      let src = ""; try { src = read(f); } catch { continue; }
      for (const m of src.matchAll(/setAttribute\("data-material",\s*([^)]+\)?)/g)) expect(m[1], f).toMatch(/^structureOf\(/);
    }
  });
  test("it is the usual material, and the setting still offers Glass and Before", () => {
    const reg = JSON.parse(read("../../../protocol/settings.json")).settings.find((s: { key: string }) => s.key === "look.material");
    expect(reg.default).toBe("squibby");
    expect(reg.options).toEqual(["squibby", "glass", "classic"]);
    expect(read("../card.tsx")).toContain('import "./ui/squibby.css";');
    expect(read("../trayPanel.tsx")).toContain('import "./ui/squibby.css";');
  });
});
