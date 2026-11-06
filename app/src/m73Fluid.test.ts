// M73 (fluid): the feel, read from the parts and their stylesheets as text, and the pure logic behind it
// (docs/milestones/M73-fluid.md). Only opacity, transform, a clip and colours move (the M66 lint holds that for every
// sheet); these pin what M73 itself promised: every press answers, rows rise in and never grow, the highlights move only
// by transform or a clip, old words stay for their exit, toasts stay inside Home, an empty list shows its example.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { glideClip, swapKeepsOld } from "./ui/partsLogic.ts";
import { workedFor } from "./homeRest.ts";
import { S } from "./strings.ts";
import { TOAST_MS, TOAST_SHORT_MS } from "./ui/parts.tsx";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const parts = read("./ui/parts.css"), shape = read("./ui/homeShape.css"), nowCss = read("./ui/homeNow.css"), fix = read("./ui/fix.css");
const rule = (css: string, sel: string) => new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[2] ?? "";

describe("1. every tappable part answers a press", () => {
  test("places, list rows and a row's action press in and come back on the press tokens", () => {
    expect(rule(parts, ".ui-place:active")).toContain("transform: scale(var(--press))");
    expect(rule(parts, "button.ui-mrow-main:active")).toContain("transform: scale(var(--press-row))");
    expect(rule(parts, ".ui-mrow-act:active")).toContain("transform: scale(var(--press))");
    for (const sel of [".ui-place", "button.ui-mrow-main", ".ui-mrow-act"]) expect(rule(parts, sel), sel).toContain("transform var(--dur-release) var(--ease-out)");
    for (const sel of [".ui-place:active", "button.ui-mrow-main:active", ".ui-mrow-act:active"]) expect(rule(parts, sel), sel).toContain("transition-duration: var(--dur-press)");
  });
});

describe("2. rows rise in, never from a smaller size, and the stagger stops at the fourth", () => {
  test("ui-row-in moves only opacity and a rise", () => {
    const k = /@keyframes ui-row-in \{([^}]*\})\s*\}/.exec(parts)?.[1] ?? "";
    expect(k).toContain("opacity: 0");
    expect(k).toContain("translate: 0 var(--rise-row)");
    expect(k).not.toMatch(/scale/);
    expect(rule(parts, ".ui-mrow")).toContain("animation: ui-row-in var(--dur-2) var(--ease-out) both");
  });
  test("24 ms apart for rows 2 and 3, and every row from the fourth with the fourth", () => {
    expect(rule(parts, ".ui-mrow:nth-child(2)")).toContain("animation-delay: var(--stagger-row)");
    expect(rule(parts, ".ui-mrow:nth-child(3)")).toContain("animation-delay: calc(var(--stagger-row) * 2)");
    expect(rule(parts, ".ui-mrow:nth-child(n + 4)")).toContain("animation-delay: calc(var(--stagger-row) * 3)");
  });
});

describe("4. Home opening: the lead first, the list 40 ms after", () => {
  test("only the list's opacity waits; it leaves with the content at once", () => {
    expect(shape).toContain(".home-stage[data-told] .home-frame .ui-mlist { opacity: var(--o-content); transition: opacity var(--dur-exit-menu) linear; }");
    expect(shape).toContain('.home-stage[data-told]:is([data-phase="opening"], [data-phase="open"]) .home-frame .ui-mlist { transition: opacity var(--dur-2) var(--ease-out) calc(var(--seq-notch-content-at) + var(--stagger-list)); }');
  });
});

describe("5. the sliding highlights move only by transform or a clip", () => {
  test("the side list's highlight: transform on the spring and a colour fade", () => {
    const r = rule(parts, ".side-list > .side-glide");
    expect(r).toContain("transform: translateY(var(--glide-y))");
    expect(r).toContain("transition: transform var(--dur-3) var(--ease-spring), background-color var(--dur-3) var(--ease-out)");
    expect(read("./homeSide.tsx")).toContain('aria-hidden="true" data-c={PLACE_COLOUR[on]}');
  });
  test("the tall row's highlight: a clip on the spring and a colour fade, its first place set without motion", () => {
    const r = rule(parts, ".ui-places-glide");
    expect(r).toContain("clip-path: inset(var(--glide-t) var(--glide-r) var(--glide-b) var(--glide-l) round var(--r-pill))");
    expect(r).toContain("transition: clip-path var(--dur-3) var(--ease-spring), background-color var(--dur-3) var(--ease-out)");
    expect(rule(parts, ".ui-places-glide[data-still]")).toContain("transition: none");
  });
  test("glideClip: the inset around the open place, in whole pixels, never negative", () => {
    expect(glideClip({ left: 40.4, top: 2, width: 80, height: 30 }, { width: 400, height: 34 })).toEqual({ t: 2, r: 280, b: 2, l: 40 });
    expect(glideClip({ left: -5, top: 0, width: 500, height: 40 }, { width: 400, height: 34 })).toEqual({ t: 0, r: 0, b: 0, l: 0 });
  });
});

describe("6. old words stay for their exit", () => {
  test("only when the words changed, and never with Reduce motion or Less motion", () => {
    expect(swapKeepsOld("a", "b", false)).toBe(true);
    expect(swapKeepsOld("a", "a", false)).toBe(false);
    expect(swapKeepsOld("a", "b", true)).toBe(false);
  });
  test("the old leave on the exit curve quicker than the new come in, which rise and never scale", () => {
    // The old are mostly gone before the new start (40 ms later), so two headlines never read over each other.
    expect(rule(parts, ".ui-swap-old")).toContain("animation: ui-swap-out var(--dur-exit-menu) linear both");
    expect(rule(parts, ".ui-swap-new")).toContain("animation: ui-swap-in var(--dur-2) var(--ease-out) var(--stagger-list) both");
    expect(parts).toContain("@keyframes ui-swap-in { from { opacity: 0; translate: 0 var(--rise-words); } }");
    const tsx = read("./ui/parts.tsx");
    expect(tsx).toContain('copy.setAttribute("aria-hidden", "true");');
    expect(tsx).toContain('for (const e of copy.querySelectorAll("[id]")) e.removeAttribute("id");');
    // The headline and its line on Now use it.
    const card = read("./card.tsx");
    expect(card).toContain("<Swap k={`h:${leadHeadline}`}>");
    expect(card).toContain("<Swap k={`l:${heroLine}`}>");
  });
  test("a tag, a dot and a tile fade their colour", () => {
    expect(rule(parts, ".ui-mtag")).toContain("transition: background-color var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out)");
    for (const sel of [".ui-mdot", ".ui-mtag-dot", ".ui-mtile"]) expect(rule(parts, sel), sel).toContain("transition: background-color var(--dur-2) var(--ease-out)");
  });
});

describe("7 and 12. toasts inside Home", () => {
  test("a toast with nothing to press goes after 4 s, one with Undo after 10 s, and none runs out while hidden", () => {
    expect([TOAST_SHORT_MS, TOAST_MS]).toEqual([4000, 10_000]);
    const tsx = read("./ui/parts.tsx");
    expect(tsx).toContain("ms = action ? TOAST_MS : TOAST_SHORT_MS");
    expect(tsx).toContain('document.addEventListener("visibilitychange", seen);');
  });
  test("Home's content frame holds its toasts (contain: layout paint makes it their frame, so none floats over the desktop)", () => {
    expect(shape).toMatch(/\.home-stage\[data-told\] \.home-frame \{[^}]*contain: layout paint;/);
  });
  test("after Keep: Kept, with Undo that asks first in History", () => {
    const card = read("./card.tsx");
    expect(S.homeNow.kept).toBe("Kept");
    expect(card).toContain('onAction={() => { const cp = kept.checkpoint; setKept(null); dispatch({ type: "ui.undoAsked", checkpoint: cp }); pickTab("did"); }}');
  });
});

describe("8. the ask box's list", () => {
  test("drawn as a listbox the box points at, floating above the box, rising in", () => {
    const card = read("./card.tsx");
    expect(card).toContain('<ul className="ask-pal" role="listbox" id={palId} aria-label={S.look.palLabel}>');
    expect(card).toContain("aria-activedescendant={palOn ? `${palId}-${palAt}` : undefined}");
    expect(card).toContain("if (palOn && askMode !== \"showme\" && palAt > 0) { runPal(palRows[palAt]); return; }");
    expect(rule(nowCss, ".home .ask-pal")).toContain("animation: ui-row-in var(--dur-2) var(--ease-out) both");
  });
});

describe("10. Fix it progress", () => {
  test("the step line grows only by transform, from the step the engine is on", () => {
    expect(rule(fix, ".job .run-line::after")).toContain("transform: scaleX(var(--run))");
    expect(read("./card.tsx")).toContain('"--run": String(Math.max(0, Math.min(1, (rl.at - 1) / Math.max(1, rl.of))))');
  });
  test("Worked for: only from the engine's own start and end of that task", () => {
    const items = [{ checkpoint: "cp_1", startedAt: "2026-11-06T10:00:00Z", endedAt: "2026-11-06T10:00:14Z" }, { checkpoint: "cp_2", startedAt: "2026-11-06T10:00:00Z", endedAt: "2026-11-06T10:02:05Z" }, { checkpoint: "cp_3", startedAt: "2026-11-06T10:00:00Z", endedAt: null }];
    expect(workedFor(items, "cp_1")).toBe("Worked for 14 s");
    expect(workedFor(items, "cp_2")).toBe("Worked for 2 min 5 s");
    expect(workedFor(items, "cp_3")).toBeNull();
    expect(workedFor(items, "cp_9")).toBeNull();
    expect(workedFor(items, null)).toBeNull();
  });
});

describe("15. an empty list shows its example", () => {
  test("History's example row is faint and hidden from VoiceOver; its words are plain", () => {
    expect(rule(parts, ".ui-mrow[data-ghost]")).toContain("opacity: var(--ghost)");
    expect(read("./ui/parts.tsx")).toContain("data-ghost={ghost || undefined} aria-hidden={ghost || undefined}");
    expect(read("./card.tsx")).toContain("example={{ colour: MEANING_COLOUR.proven, icon: \"tick\", ...S.screens.historyExample }}");
    for (const w of Object.values(S.screens.historyExample)) expect(w).not.toMatch(/—|!/);
  });
});
