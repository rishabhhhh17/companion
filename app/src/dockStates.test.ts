// M66: the character on the edge never jumps when its word comes and goes, keeps its states mounted and cross fades them,
// and shows a thinking glyph at itself (dockStates.ts, dock.tsx, style.css).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { labelShows, posesKept, POSES_KEPT, thinkingShows } from "./dockStates.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const dock = read("./dock.tsx"), style = read("./style.css");
/** The declarations of the first rule whose selector is exactly `sel` (style.css). */
const rule = (sel: string): string => {
  const m = new RegExp(`(^|\\n|\\} )${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{`).exec(style);
  const at = m ? m.index + m[1].length : -1;
  expect(at, sel).toBeGreaterThan(-1);
  return style.slice(style.indexOf("{", at) + 1, style.indexOf("}", at));
};

describe("the word under the character", () => {
  test("shows when there is something to say, and never while the drop ring is open", () => {
    expect(labelShows("idle", 0, false)).toBe(false);
    expect(labelShows("idle", 2, false)).toBe(true);
    for (const s of ["working", "thinking", "checking", "needsYou", "done", "error", "listening", "off"] as const) expect(labelShows(s, 0, false), s).toBe(true);
    expect(labelShows("working", 1, true)).toBe(false);
  });
  test("is always on the page as the live region: it never toggles into the layout (the 14 px jump)", () => {
    // It used to switch to the screen reader only class at rest, which took it out of the flex column and moved the character.
    expect(dock).not.toContain('`dock-label${state === "idle" && !waiting ? " sr" : ""}`');
    expect(dock).toMatch(/<div className="dock-label" data-shown=\{labelShows\(state, waiting, drop\.s\.menu\?\.at === "dock"\) \? "" : undefined\} role="status" aria-live="polite">/);
    const base = rule(".dock-label");
    expect(base).toContain("position: absolute");
    expect(base).toContain("opacity: 0");
    // Placed under the character's button (94 px tall, centred in the window) by a fixed offset, so nothing reflows.
    expect(base).toContain("top: calc(50% + 94px / 2 + var(--space-2))");
    expect(base).toContain("transition: opacity var(--dur-1) var(--ease-exit), transform var(--dur-1) var(--ease-exit)");
    const shown = rule(".dock-label[data-shown]");
    expect(shown).toContain("opacity: 1");
    expect(shown).toContain("transition: opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out)");
    // The drop ring hides it through the same fade, never display: none.
    expect(style).not.toContain('.dock[data-drop="menu"] .dock-label { display: none; }');
  });
  test("the character's column holds only the character, so the button sits in the same place in every state", () => {
    expect(rule(".dock")).toContain("justify-content: center");
    // Nothing else in the column takes room: the drop canvases are fixed, the word and the glyph are absolute.
    expect(rule(".drops")).toContain("position: fixed");
    expect(rule(".think-glyph")).toContain("position: absolute");
  });
});

describe("states stay mounted and cross fade", () => {
  test("every pose shown stays on the page, the one in force last", () => {
    let k: string[] = [];
    k = posesKept(k, "rest"); expect(k).toEqual(["rest"]);
    k = posesKept(k, "work"); expect(k).toEqual(["rest", "work"]);
    k = posesKept(k, "rest"); expect(k).toEqual(["rest", "work"]);   // back to rest: the same picture fades back in
  });
  test("never more than POSES_KEPT, dropping the oldest that is not in force", () => {
    let k: string[] = [];
    for (const p of ["a", "b", "c", "d", "e", "f", "g"]) k = posesKept(k, p);
    expect(k.length).toBe(POSES_KEPT);
    expect(k).not.toContain("a");
    expect(k.at(-1)).toBe("g");
    expect(posesKept(["a"], "a", 1)).toEqual(["a"]);
  });
  test("the pictures are stacked and cross faded by opacity, never by swapping one picture's source", () => {
    expect(dock).not.toContain('<img className={`pose${flow.ready ? " flow-ready" : ""}`} src={poseUrl(pose)}');
    expect(dock).toContain("posesKept(");
    expect(dock).toMatch(/data-on=\{p === pose \? "" : undefined\}/);
    const base = rule(".character .pose-stack .pose");
    expect(base).toContain("opacity: 0");
    expect(base).toContain("transition: opacity var(--dur-1) var(--ease-exit)");
    expect(rule(".character .pose-stack .pose[data-on]")).toContain("transition: opacity var(--dur-2) var(--ease-out)");
  });
});

describe("thinking shows at the character", () => {
  test("only while it thinks", () => {
    expect(thinkingShows("thinking")).toBe(true);
    for (const s of ["idle", "working", "checking", "needsYou", "done", "error", "listening", "off"] as const) expect(thinkingShows(s), s).toBe(false);
  });
  test("a small arc that turns at a steady speed, always on the page, faded in and out", () => {
    expect(dock).toMatch(/<span className="think-glyph" data-on=\{thinkingShows\(state\) \? "" : undefined\} aria-hidden="true" \/>/);
    const base = rule(".think-glyph");
    expect(base).toContain("opacity: 0");
    expect(base).toContain("animation: think-turn var(--loop-spin) linear infinite");
    expect(base).toContain("transition: opacity var(--dur-1) var(--ease-exit)");
    expect(rule(".think-glyph[data-on]")).toContain("transition: opacity var(--dur-2) var(--ease-out)");
    // Turning only while it shows: a hidden glyph costs nothing.
    expect(base).toContain("animation-play-state: paused");
    expect(rule(".think-glyph[data-on]")).toContain("animation-play-state: running");
    expect(style).toContain("@keyframes think-turn { to { transform: rotate(360deg); } }");
  });
});
