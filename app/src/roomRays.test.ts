// M66 fix 19: the rays of light jumped when a job started or stopped. Working changed their loop from 22 to 14 seconds
// mid run (a running animation given a new length jumps to a new place in it) and their brightness in one frame. Now the
// rays keep one loop always; working shows a second, brighter layer of the same rays, faded in and out by opacity only.
import { describe, expect, test } from "bun:test";
import { LOOK_CSS as lookCss, TOKENS_CSS as tokensCss } from "./ui/cssFiles.ts";

const LOOK_CSS = lookCss(), TOKENS_CSS = tokensCss();

const rules = (css: string, sel: RegExp) => [...css.replace(/\/\*[^]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((r) => sel.test(r.sel));

describe("the rays never jump when work starts or stops", () => {
  test("nothing changes the rays' loop length or brightness by state", () => {
    for (const r of rules(LOOK_CSS, /data-tone="working"\][^,]*\.room-rays/)) {
      expect(r.body).not.toMatch(/animation(-duration)?\s*:/);
      expect(r.body).not.toMatch(/--rays-now\s*:/);
    }
    expect(TOKENS_CSS).not.toContain("--loop-rays-work");
  });
  test("working shows a second, brighter layer of the same rays, by opacity only", () => {
    const layer = rules(LOOK_CSS, /^\.room-rays::after$/)[0];
    expect(layer).toBeDefined();
    expect(layer.body).toContain("--rays-now: var(--rays-work-a)");
    expect(layer.body).toContain("opacity: 0");
    expect(layer.body).toMatch(/transition: opacity var\(--seq-rays\) var\(--ease-out\)/);
    const on = rules(LOOK_CSS, /data-tone="working"\] \.room-rays::after$/)[0];
    expect(on.body.trim()).toBe("opacity: 1;");
    // The same gradient draws both, so the bright layer lies exactly on the rays it brightens.
    expect(rules(LOOK_CSS, /^\.room-rays, \.room-rays::after$/)[0].body).toContain("repeating-conic-gradient(from 168deg at 64% -30%");
    // Guide's sunbeam has its own shape and no working layer.
    expect(rules(LOOK_CSS, /data-element="guide"\] \.room-rays::after$/)[0].body).toContain("display: none");
  });
});
