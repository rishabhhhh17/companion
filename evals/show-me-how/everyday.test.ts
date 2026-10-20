// The Show me how everyday set: nine synthetic windows that imitate everyday apps (a mail client, a calendar, system
// settings, a file browser, a spreadsheet, a word processor, a slide editor, a design tool, a photo editor), made up
// content, local files only, with labelled targets, added to the aim eval. Checks the pages and asks are sound, that each
// is asked as a tutor for its app, and (when the hidden browser is installed) that every target can be seen and clicked.
import { describe, expect, test } from "bun:test";
import { browserExecutable } from "../../runner/src/proof/browser.ts";
import { appKind, tutorFor } from "../../runner/src/tutor.ts";
import { controlsIn, everydayPages, EVERYDAY_NAMES, FIND_ELEMENTS, hiddenBrowser, rightTargets, type Element } from "./hard.ts";
import { scorePoint } from "./score.ts";

const pages = everydayPages();

describe("the everyday pages and asks", () => {
  test("nine everyday app windows, 40 asks", () => {
    expect([...EVERYDAY_NAMES].sort()).toEqual(["calendar", "design", "document", "files", "mail", "photo", "settings", "slides", "spreadsheet"]);
    expect(pages.length).toBe(9);
    expect(pages.reduce((n, p) => n + p.asks.length, 0)).toBe(40);
    expect(new Set(pages.map((p) => p.name)).size).toBe(9);
  });
  test("each page names the everyday app it imitates, so it is asked as a tutor for that app", () => {
    for (const p of pages) {
      expect(appKind(p.app), p.name).toBe("everyday");
      expect(tutorFor(p.app, true)?.app, p.name).toBeTruthy();
    }
    expect(new Set(pages.map((p) => tutorFor(p.app, true)!.app))).toEqual(new Set(["Mail", "Calendar", "System Settings", "Finder", "Numbers", "Pages", "Keynote", "Figma", "Photoshop"]));
  });
  test("every target is labelled exactly once on its page", () => {
    for (const p of pages) for (const a of p.asks) for (const id of rightTargets(a)) expect((p.html.match(new RegExp(`data-eval-target="${id}"`, "g")) ?? []).length, `${p.name}: ${id}`).toBe(1);
  });
  // The words test, as in the hard set: every control that says an ask's key words is a right answer or a counted decoy.
  test("no control that says an ask's key words is left out by accident", () => {
    for (const p of pages) {
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
  test("the questions are everyday words: most never say the control's own name, and none talks about code", () => {
    let unnamed = 0;
    for (const p of pages) for (const a of p.asks) {
      expect(a.question, `${p.name}: ${a.target}`).not.toMatch(/project|code|deploy|terminal|repositor/i);
      if (!new RegExp(`\\b${a.key}\\b`, "i").test(a.question)) unnamed++;
    }
    expect(unnamed).toBeGreaterThanOrEqual(20);
  });
  test("some asks are built around a decoy that says the same words", () => {
    expect(pages.flatMap((p) => p.asks).filter((a) => (a.decoys ?? 0) > 0).length).toBeGreaterThanOrEqual(4);
  });
  test("every page has its styles inlined and points at nothing outside it", () => {
    for (const p of pages) {
      expect(p.html, p.name).not.toContain('rel="stylesheet"');
      expect(p.html, p.name).toContain("--accent");
      expect(/\b(src|href)="(https?:)?\/\//.test(p.html), p.name).toBe(false);
    }
  });
});

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
