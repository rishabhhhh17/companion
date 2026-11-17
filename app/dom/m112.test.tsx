// M112, rendered: the founder's glitch (the chat and Home's ask box at once) stays fixed with the tall Home, the character's
// habitat is on the page's root, a second habitat switches it at run time with no page code, and the places are living
// glyphs, never coloured squares.
import { describe, expect, test } from "bun:test";
import { applyHabitat, FLOWFLOW, type Habitat } from "../src/habitat.ts";
import { emit, renderHome, settle } from "./render.tsx";

const TALL = { settings: { "you.name": "Rishabh", "look.layout": "tall" } };
const opened = (o: Record<string, unknown> = {}) => emit("opened", { keyboard: false, instant: true, ...o });

describe("the glitch, in the tall Home", () => {
  test("the chat opens at the top of Home, never scrolled to what is hidden under it", async () => {
    await renderHome(TALL);
    await opened();
    const home = document.querySelector<HTMLElement>("main.home")!;
    await emit("closed", {});
    home.scrollTop = 400;
    await opened({ chat: true });
    await settle(30);
    expect(home.hasAttribute("data-chat")).toBe(true);
    expect(home.scrollTop).toBe(0);
    // The chat is drawn; Home's own ask box stays in the page (its words are kept) but outside the chat.
    expect(document.querySelector(".notch-chat")).toBeTruthy();
    expect(document.querySelector(".notch-chat .askwrap")).toBeNull();
  });
});

describe("the habitat on the page", () => {
  test("Home's root carries Flowflow's habitat and its switches", async () => {
    await renderHome(TALL);
    const r = document.documentElement.dataset;
    expect(r.habitat).toBe("flowflow");
    expect(r.glyphNucleus).toBe("on");
  });
  test("a second habitat switches the root at run time, and the page itself is untouched", async () => {
    await renderHome(TALL);
    const before = document.querySelector("main.home")!.outerHTML;
    const plain: Habitat = { id: "plain-test", character: "test-character", glyphs: { nucleus: false }, emptyArt: "none", notch: { photophore: false, breathe: false } };
    applyHabitat(document.documentElement, plain);
    expect(document.documentElement.dataset.habitat).toBe("plain-test");
    // M112 review: every switch differs from Flowflow's, and each is on the root for the rule that reads it.
    expect(document.documentElement.dataset).toMatchObject({ glyphNucleus: "off", notchPhotophore: "off", notchBreathe: "off" });
    expect(document.querySelector("main.home")!.outerHTML).toBe(before);
    applyHabitat(document.documentElement, FLOWFLOW);
  });
  test("the places are living glyphs in one stroke, never coloured tiles", async () => {
    const { render } = await import("@testing-library/react");
    const { PlaceButton } = await import("../src/ui/parts.tsx");
    const { container } = render(<div>{(["now", "learn", "did", "memory"] as const).map((p) => <PlaceButton key={p} place={p} label={p} on={p === "now"} onClick={() => {}} />)}</div>);
    const places = [...container.querySelectorAll(".ui-place")];
    expect(places.length).toBe(4);
    for (const p of places) {
      expect(p.querySelector(".ui-mtile")).toBeNull();
      expect(p.querySelector(".ui-place-glyph svg.ic")).toBeTruthy();
    }
    // Now's cell has its nucleus, drawn to be filled as the habitat says.
    expect(places[0].querySelector(".hg-n")).toBeTruthy();
  });
});

// M112 review: the switches change the page. The habitat's own rules (style.css, notch.css) read them, so a glyph's nucleus
// is an outline and the pill has no light of its own under a habitat that says so.
describe("a habitat's switches change what is drawn", () => {
  test("nucleus off: the place glyph's nucleus is not filled; photophore off: the pill draws no light", async () => {
    const { readFileSync } = await import("node:fs");
    const { render } = await import("@testing-library/react");
    const { PlaceButton } = await import("../src/ui/parts.tsx");
    const rule = (file: string, re: RegExp) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").match(re)![0];
    const style = document.createElement("style");
    style.textContent = [
      rule("../src/style.css", /\.ic \.hg-n \{[^}]*\}/), rule("../src/style.css", /:root\[data-glyph-nucleus="off"\] \.ic \.hg-n \{[^}]*\}/),
      ".ic .hg-n { --hab-nucleus-a: .45; }",
    ].join("\n");
    document.head.append(style);
    try {
      // Each drawn fresh under its habitat (the test DOM keeps a computed style once read).
      const fill = () => { const { container, unmount } = render(<PlaceButton place="now" label="Now" on onClick={() => {}} />); const v = getComputedStyle(container.querySelector<SVGElement>(".hg-n")!).getPropertyValue("fill-opacity"); unmount(); return v; };
      applyHabitat(document.documentElement, FLOWFLOW);
      const on = fill();
      applyHabitat(document.documentElement, { ...FLOWFLOW, id: "plain-test", glyphs: { nucleus: false }, notch: { photophore: false, breathe: false } });
      const off = fill();
      expect(off).toBe("0");
      expect(on).not.toBe(off);
      const photophoreOff = rule("../src/ui/notch.css", /:root:not\(\[data-notch-photophore="on"\]\) \.island-panel button\.nb-pill::before \{[^}]*\}/);
      expect(photophoreOff).toMatch(/content: none/);
      expect(document.documentElement.matches(':root:not([data-notch-photophore="on"])')).toBe(true);
    } finally {
      style.remove();
      applyHabitat(document.documentElement, FLOWFLOW);
    }
  });
});
