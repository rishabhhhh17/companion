// Wide by default (M51 step 2; the founder, 1 Nov 2026: the tall panel "looks so vertical", HeyClicky's wide window "looks so
// much better"). Home is a landscape window: a list on the left with the places and the recent work, the work on the right,
// and the ask box along the bottom of the work. Settings keeps its own list on the left in place of Home's. The tall panel
// stays a choice (look.layout). The shell's side (the size, the character's clear zones) is tested in island.rs and
// docking.rs; these are the pages.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { layoutOf, moreBelow, sideFits, sideOn, sidePlaces, sideRecent, SIDE_RECENT_MAX, LAYOUT_DEFAULT } from "./homeLayout.ts";
import { S } from "./strings.ts";
import { PAGES } from "./settingsPages.ts";
import { TEXT_SIZES } from "./textsize.ts";
import { ALL_CSS, WIDE_CSS } from "./ui/cssFiles.ts";
import type { HistoryItem } from "./model.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const card = read("./card.tsx"), side = read("./homeSide.tsx");
const registry = JSON.parse(read("../../protocol/settings.json")) as { settings: { key: string; default: unknown; options?: string[]; applies: string[]; section: string }[] };
const item = (id: number, startedAt: string, label = `Task ${id}`): HistoryItem => ({ id, label, status: "done", usd: 0.1, startedAt, endedAt: startedAt, checkpoint: `cp_${id}`, changed: 1, proof: "passed" });

describe("the layout setting", () => {
  test("wide is the usual; tall is the panel from before; anything else is wide", () => {
    expect(LAYOUT_DEFAULT).toBe("wide");
    expect(layoutOf("wide")).toBe("wide");
    expect(layoutOf("tall")).toBe("tall");
    for (const junk of [undefined, null, "", "Tall", "narrow", 3]) expect(layoutOf(junk), String(junk)).toBe("wide");
  });
  test("it is in the registry for the shell and the pages, with its words, its help and a place in Settings", () => {
    const d = registry.settings.find((s) => s.key === "look.layout")!;
    expect(d).toMatchObject({ default: "wide", options: ["wide", "tall"], applies: ["shell", "pages"], section: "look" });
    const w = S.set["look.layout"];
    expect(w.label).toBe("Layout");
    expect(w.options).toEqual({ wide: "Wide", tall: "Tall" });
    for (const o of Object.values(w.options ?? {})) expect(o.length, o).toBeLessThanOrEqual(12);
    expect(w.also.length).toBeGreaterThan(2);
    for (const t of [w.label, w.help, S.short["look.layout"], ...w.also]) expect(t).not.toMatch(/[–—]/);
    // First on the Look page (M51 polish; it was in More options), with the theme and the water, chosen by its picture.
    expect(PAGES.look.groups[0].items[0]).toBe("look.layout");
  });
});

describe("the list on the left", () => {
  test("it shows in the wide Home once set up, on every place but Settings, which has its own list there", () => {
    for (const tab of ["now", "did", "learn", "memory"] as const) expect(sideOn({ layout: "wide", text: "standard", onboarded: true, tab }), tab).toBe(true);
    expect(sideOn({ layout: "wide", text: "standard", onboarded: true, tab: "settings" })).toBe(false);
    expect(sideOn({ layout: "wide", text: "standard", onboarded: false, tab: "now" })).toBe(false);
    expect(sideOn({ layout: "tall", text: "standard", onboarded: true, tab: "now" })).toBe(false);
  });
  test("it fits beside the work at the Standard and Large text sizes; larger text puts the places back in the top row", () => {
    expect(TEXT_SIZES.filter(sideFits)).toEqual(["standard", "large"]);
    expect(sideOn({ layout: "wide", text: "large", onboarded: true, tab: "now" })).toBe(true);
    for (const t of ["larger", "largest", "huge"] as const) expect(sideOn({ layout: "wide", text: t, onboarded: true, tab: "now" }), t).toBe(false);
  });
  test("the places, top to bottom: Now, Learn while guides are on, History, Memory (Settings sits at its foot)", () => {
    expect(sidePlaces({ learnOn: true })).toEqual(["now", "learn", "did", "memory"]);
    expect(sidePlaces({ learnOn: false })).toEqual(["now", "did", "memory"]);
  });
  // M51 polish (next to HeyClicky's list of about twelve one line rows): one line per task, so about ten fit.
  test("the recent work: the newest first, only tasks with a name, at most ten", () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i + 1, `2026-11-01T${String(i).padStart(2, "0")}:00:00Z`));
    const shown = sideRecent([...items, item(99, "2026-11-01T23:00:00Z", "  "), item(98, "2026-11-01T23:30:00Z", "Before: ")]);
    expect(SIDE_RECENT_MAX).toBe(10);
    expect(shown.map((i) => i.id)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(sideRecent([])).toEqual([]);
  });
});

describe("Home draws the wide layout", () => {
  test("Home says its layout, and draws the list only when sideOn says so", () => {
    expect(card).toContain('const layout = layoutOf(useSetting("look.layout"));');
    expect(card).toContain("const side = sideOn({ layout, text: textSizeFrom(useSetting(\"display.textSize\")), onboarded, tab: home.tab });");
    expect(card).toMatch(/<main className=\{`card home[^`]*`\}[^>]*data-layout=\{layout\}[^>]*data-side=\{side \? "" : undefined\}/);
    expect(card).toContain("{side && <HomeSide ");
    // The work is one column beside the list: the bar, the status, the ask box, the results.
    expect(card).toContain('<div className="work">');
  });
  test("the places are in the list, not twice: the top row has none while the list shows, and Now's recent fixes are not drawn twice", () => {
    expect(card).toContain("const places = side ? [] : barPlaces(");
    expect(card).toContain('{!side && home.tab === "settings" && <button className="back"');
    expect(card).toContain('{home.tab === "now" && show("ask") && mode === "rest" && !side && <RecentList ');
  });
  test("each place keeps its old id (focus.ts goes back to it), says which is open, and shows a waiting dot with words", () => {
    // Now has no id of its own, as before, so the keyboard goes back to the ask box on Now (card.tsx placeEl).
    expect(side).toContain('id={t === "now" ? undefined : tabId(t)}');
    expect(card).toContain('const placeEl = (t: Tab): HTMLElement | null => document.getElementById(tabId(t)) ?? (t === "now" ? box.current : null);');
    expect(side).toContain("selected={t === tab}");
    expect(side).toContain("attention={waits === t && t !== tab}");
    expect(side).toContain('aria-label={S.look.placesLabel}');
    expect(side).toContain("onClick={onSettings}");
    // A recent task opens its own receipt, says how it ended, and shows its mark in its tone.
    expect(side).toContain("onClick={() => onOpen(i)}");
    expect(side).toContain("aria-label={`${S.ui.openReceipt(name)}. ${v.headline}`}");
    expect(side).toContain("data-tone={tone}");
  });
});

describe("the wide look", () => {
  const css = WIDE_CSS().replace(/\/\*[\s\S]*?\*\//g, "");
  test("it is loaded after the rest, and its rules apply only to the wide Home with its list", () => {
    expect(card).toMatch(/import "\.\/ui\/look\.css";\nimport "\.\/ui\/wide\.css";/);
    expect(ALL_CSS()).toContain(WIDE_CSS());
    for (const head of css.split("}").map((r) => r.split("{")[0].trim()).filter((h) => h && !h.startsWith("@"))) {
      for (const sel of head.split(",")) expect(sel.trim(), sel).toMatch(/^\.home\[data-side\]|^\.home\[data-layout="wide"\] \.fr$|^\.work\b|^\.side-?/);
    }
  });
  test("the list on the left and the work on the right, the ask box along the bottom of the work", () => {
    expect(css).toMatch(/\.home\[data-side\] \.inner \{[^}]*display: grid;[^}]*grid-template-columns: var\(--w-side\) minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.home\[data-side\] \.side \{[^}]*position: sticky;[^}]*top: 0;[^}]*height: calc\(100vh - var\(--hair\)\);/);
    expect(css).toMatch(/\.home\[data-side\] \.work > \.askwrap \{[^}]*order: 1;[^}]*position: sticky;[^}]*bottom: 0;/);
    // Outside the wide Home the work column is no box at all, so the tall panel and Settings lay out as before.
    expect(css).toMatch(/(^|\n)\.work \{ display: contents; \}/);
  });
  test("the first run fills the wide Home's one height (480), so Continue is in view, instead of asking for its own 560", () => {
    expect(read("../src/style.css")).toMatch(/\n\.fr \{[^}]*min-height: calc\(560rem \/ 14\);/);
    expect(css).toMatch(/\.home\[data-layout="wide"\] \.fr \{ min-height: 0; \}/);
  });
  test("no colour, size or radius of its own: every one is a token", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i);
    for (const m of css.matchAll(/border-radius: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--r-[\w-]+\)$/);
    for (const m of css.matchAll(/font-size: ([^;]+);/g)) expect(m[1]).toMatch(/^var\(--t-[a-z]+\)$/);
  });
  test("the list is as wide as the words in it grow (rem), so Large text still fits beside the work", () => {
    expect(read("./ui/tokens.css")).toMatch(/--w-side: calc\(\d+rem \/ 14\);/);
    // At Standard 1rem is 14 points, at Large 16 (tokens.css). Home is 688 wide (island.rs HomeSize::WIDE), with a 1 point
    // edge each side: at Large the work keeps at least 440 points beside the list.
    const sideAt = (root: number) => Number(/--w-side: calc\((\d+)rem \/ 14\)/.exec(read("./ui/tokens.css"))![1]) * root / 14;
    expect(688 - 2 - sideAt(16)).toBeGreaterThanOrEqual(440);
    expect(688 - 2 - sideAt(14)).toBeGreaterThanOrEqual(480);
  });
});

// The fade over the work above the ask box (ui/wide.css) shows only while there is more work below to scroll to, so at
// rest, and at the end of the list, the last card reads in full (the review, 1 Nov 2026).
describe("the fade above the ask box shows only when there is more below", () => {
  test("more below: content past the bottom of the window, more than a rounding pixel", () => {
    expect(moreBelow({ scrollHeight: 479, clientHeight: 479, scrollTop: 0 })).toBe(false);
    expect(moreBelow({ scrollHeight: 480, clientHeight: 479, scrollTop: 0 })).toBe(false);
    expect(moreBelow({ scrollHeight: 525, clientHeight: 479, scrollTop: 0 })).toBe(true);
    expect(moreBelow({ scrollHeight: 525, clientHeight: 479, scrollTop: 30 })).toBe(true);
    expect(moreBelow({ scrollHeight: 525, clientHeight: 479, scrollTop: 46 })).toBe(false);
    expect(moreBelow({ scrollHeight: 525, clientHeight: 479, scrollTop: 45.5 })).toBe(false);
  });
  test("Home keeps data-more up to date, and the stylesheet shows the fade on it alone", () => {
    const card = readFileSync(new URL("./card.tsx", import.meta.url), "utf8");
    expect(card).toContain("useMoreBelow(root);");
    const wide = readFileSync(new URL("./ui/wide.css", import.meta.url), "utf8");
    expect(wide).toMatch(/\.home\[data-side\] \.work > \.askwrap::before \{[^}]*opacity: 0;/);
    expect(wide).toMatch(/\.home\[data-side\]\[data-more\] \.work > \.askwrap::before \{ opacity: 1; \}/);
  });
});
