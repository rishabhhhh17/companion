// The Show me how hard set: synthetic busy dashboards (made up products, local files, never a real website) with labelled
// targets, added to the aim eval. Checks the pages and asks are sound, that the scorer judges a point the way the Mac's
// accessibility lookup would, and (when the hidden browser is installed) that every target can be seen and clicked.
import { describe, expect, test } from "bun:test";
import { browserExecutable } from "../../runner/src/proof/browser.ts";
import { controlsIn, FIND_ELEMENTS, hardPages, hiddenBrowser, PAGE_NAMES, rightTargets, type Element } from "./hard.ts";
import { scorePoint } from "./score.ts";

const pages = hardPages();

describe("the pages and asks", () => {
  test("four dashboards, each in light and dark, five asks each: 40 asks", () => {
    expect(PAGE_NAMES.sort()).toEqual(["deploy-settings", "project-settings", "repo-page", "table-editor"]);
    expect(pages.length).toBe(8);
    expect(pages.reduce((n, p) => n + p.asks.length, 0)).toBe(40);
    expect(new Set(pages.map((p) => p.name)).size).toBe(8);
  });
  test("every target is labelled exactly once on its page, and so is every other control that answers the ask as well", () => {
    for (const p of pages) for (const a of p.asks) for (const id of rightTargets(a)) expect((p.html.match(new RegExp(`data-eval-target="${id}"`, "g")) ?? []).length, `${p.name}: ${id}`).toBe(1);
  });
  test("asks with more than one right answer list them all: two ways to add a column, the key box or Add another, the name box or Rename", () => {
    const also = Object.fromEntries(pages.filter((p) => !p.name.endsWith("-dark")).flatMap((p) => p.asks.filter((a) => a.also?.length).map((a) => [a.target, a.also])));
    expect(also).toEqual({ "add-column": ["insert-column"], "env-add": ["env-key"], rename: ["project-name"] });
  });
  // The words test: every control on the page that says the ask's key words is either a right answer to it, or one of the
  // decoys the ask is built around (the other Save button, the Edit buttons of other rows), counted here so none is missed.
  test("no control that says an ask's key words is left out by accident", () => {
    for (const p of pages.filter((x) => !x.name.endsWith("-dark"))) {
      const controls = controlsIn(p.html);
      for (const a of p.asks) {
        expect(a.key, `${p.name}: ${a.target} needs its key words`).toBeTruthy();
        const word = new RegExp(`\\b${a.key}\\b`, "i");
        const saying = controls.filter((c) => word.test(c.words));
        const others = saying.filter((c) => !c.id || !rightTargets(a).includes(c.id));
        expect(others.length, `${p.name}: ${a.target} ("${a.key}"): ${others.map((o) => o.words).join(" | ")}`).toBe(a.decoys ?? 0);
        expect(saying.length, `${p.name}: ${a.target}: the key words name the control`).toBeGreaterThan(0);
      }
    }
  });
  test("the words test sees inputs, labels for screen readers and placeholders, not only button text", () => {
    const c = controlsIn('<button data-eval-target="a">Add <span>column</span></button><input placeholder="Key, for example X" data-eval-target="k"><button aria-label="More for X">⋯</button><a href="#">Logs</a><select><option>One</option></select>');
    expect(c.map((x) => [x.id, x.words])).toEqual([["a", "Add column"], ["k", "Key, for example X"], [null, "More for X ⋯"], [null, "Logs"], [null, ""]]);
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
  test("where an ask has more than one right answer, a point on any of them is a hit", () => {
    const both = [els[1], els[0]];
    expect(scorePoint({ x: 110, y: 110 }, both, els)).toEqual({ raw: true, snapped: true });
    expect(scorePoint({ x: 110, y: 150 }, both, els)).toEqual({ raw: true, snapped: true });
    expect(scorePoint({ x: 250, y: 300 }, both, els)).toEqual({ raw: false, snapped: false });
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
        for (const a of p.asks) for (const id of rightTargets(a)) {
          const t = els.find((e) => e.id === id);
          expect(t, `${p.name}: ${id} is not found as a clickable control`).toBeDefined();
          expect(t!.x >= 0 && t!.y >= 0 && t!.x + t!.w <= 1280 && t!.y + t!.h <= 800, `${p.name}: ${id} is off screen`).toBe(true);
          expect(scorePoint({ x: t!.x + t!.w / 2, y: t!.y + t!.h / 2 }, t!, els).snapped, `${p.name}: ${id}`).toBe(true);
        }
        await ctx.close();
      }
    } finally { await browser.close(); }
  }, 60_000);
});
