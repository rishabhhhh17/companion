// The Show me how hard set: synthetic busy dashboards (made up products, local files, never a real website) with labelled
// targets, added to the aim eval. Checks the pages and asks are sound, that the scorer judges a point the way the Mac's
// accessibility lookup would, and (when the hidden browser is installed) that every target can be seen and clicked.
import { describe, expect, test } from "bun:test";
import { browserExecutable } from "../../runner/src/proof/browser.ts";
import { FIND_ELEMENTS, hardPages, hiddenBrowser, PAGE_NAMES, type Element } from "./hard.ts";
import { scorePoint } from "./score.ts";

const pages = hardPages();

describe("the pages and asks", () => {
  test("four dashboards, each in light and dark, five asks each: 40 asks", () => {
    expect(PAGE_NAMES.sort()).toEqual(["deploy-settings", "project-settings", "repo-page", "table-editor"]);
    expect(pages.length).toBe(8);
    expect(pages.reduce((n, p) => n + p.asks.length, 0)).toBe(40);
    expect(new Set(pages.map((p) => p.name)).size).toBe(8);
  });
  test("every target is labelled exactly once on its page", () => {
    for (const p of pages) for (const a of p.asks) expect((p.html.match(new RegExp(`data-eval-target="${a.target}"`, "g")) ?? []).length, `${p.name}: ${a.target}`).toBe(1);
  });
  test("every page has its styles inlined and points at nothing outside it", () => {
    for (const p of pages) {
      expect(p.html, p.name).not.toContain('rel="stylesheet"');
      expect(p.html, p.name).toContain("--accent");
      expect(/\b(src|href)="(https?:)?\/\//.test(p.html), p.name).toBe(false);
    }
  });
  test("the dark pages are dark", () => {
    expect(pages.filter((p) => p.name.endsWith("-dark")).every((p) => p.html.includes('<body class="dark"'))).toBe(true);
  });
  test("the hard part is real: at least four targets share their words with another control, so only place and meaning tell them apart", () => {
    let shared = 0;
    for (const p of pages.filter((x) => !x.name.endsWith("-dark"))) for (const a of p.asks) {
      const m = new RegExp(`<(?:button|a)[^>]*data-eval-target="${a.target}"[^>]*>([^<]*)<`).exec(p.html);
      const words = (m?.[1] ?? "").replace(/[▾⑂]/g, "").trim();
      const all = [...p.html.matchAll(/<(?:button|a)[^>]*>([^<]*)</g)].map((x) => x[1].replace(/[▾⑂]/g, "").trim());
      if (!words || all.filter((w) => w === words).length > 1) shared++;
    }
    expect(shared).toBeGreaterThanOrEqual(4);
  });
});

describe("scoring a point", () => {
  const els: Element[] = [
    { t: "Edit", id: null, x: 100, y: 100, w: 40, h: 20 },
    { t: "Edit", id: "env-edit-stripe", x: 100, y: 140, w: 40, h: 20 },
    { t: "Environment Variables", id: null, x: 0, y: 0, w: 300, h: 400 },
  ];
  const target = els[1];
  test("a point on the labelled control is a raw hit and a snapped hit", () => {
    expect(scorePoint({ x: 110, y: 150 }, target, els)).toEqual({ raw: true, snapped: true });
  });
  test("a point on another control with the same words is a miss: identity counts, not words", () => {
    expect(scorePoint({ x: 110, y: 110 }, target, els)).toEqual({ raw: false, snapped: false });
  });
  test("the smallest control under the point is what the Mac would report", () => {
    expect(scorePoint({ x: 10, y: 10 }, els[2], els).snapped).toBe(true);
    expect(scorePoint({ x: 110, y: 150 }, els[2], els)).toEqual({ raw: true, snapped: false });
  });
  test("no point is a miss", () => { expect(scorePoint(null, target, els)).toEqual({ raw: false, snapped: false }); });
});

// The real render, in the hidden browser (headless: nothing appears on the screen). Skipped when it is not installed.
const exe = browserExecutable();
(exe ? describe : describe.skip)("rendered in the hidden browser, the way the aim eval renders them", () => {
  test("every target is on screen, big enough, and is itself what a click on its middle would reach", async () => {
    const browser = (await hiddenBrowser())!;
    try {
      for (const p of pages) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await page.setContent(p.html);
        const els: Element[] = await page.evaluate(`(${FIND_ELEMENTS})()`);
        for (const a of p.asks) {
          const t = els.find((e) => e.id === a.target);
          expect(t, `${p.name}: ${a.target} is not found as a clickable control`).toBeDefined();
          expect(t!.x >= 0 && t!.y >= 0 && t!.x + t!.w <= 1280 && t!.y + t!.h <= 800, `${p.name}: ${a.target} is off screen`).toBe(true);
          expect(scorePoint({ x: t!.x + t!.w / 2, y: t!.y + t!.h / 2 }, t!, els).snapped, `${p.name}: ${a.target}`).toBe(true);
        }
        await ctx.close();
      }
    } finally { await browser.close(); }
  }, 60_000);
});
