// Settings' rows at each text size, worked out from the real numbers (review, 31 Oct): the window island.rs gives Home
// while Settings is open, Home's edge and padding, the sidebar and its gap (style.css), the card's edge and the row's
// stacking point (ui/parts.css). At Standard text every row keeps its control on the right, beside its words; only the
// biggest sizes stack. The pages need a real Mac to draw, so this reads the stylesheets as text.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PARTS_CSS, STYLE_CSS, TOKENS_CSS } from "./ui/cssFiles.ts";
import { TEXT_SIZES, type TextSize } from "./textsize.ts";

const rust = readFileSync(new URL("../src-tauri/src/island.rs", import.meta.url), "utf8");
const tokens = TOKENS_CSS(), parts = PARTS_CSS(), style = STYLE_CSS();
const px = (re: RegExp, s: string) => { const m = re.exec(s); expect(m, String(re)).toBeTruthy(); return Number(m![1]); };
const space = (n: number) => px(new RegExp(`--space-${n}: (\\d+)px;`), tokens);
const root = (t: TextSize) => (t === "standard" ? 14 : px(new RegExp(`:root\\[data-text="${t}"\\] \\{ font-size: (\\d+)px; \\}`), tokens));

describe("Settings' rows keep their controls beside their words at the usual text sizes", () => {
  // The window: with_settings makes Home at least the Large width.
  const win = px(/pub const LARGE: HomeSize = HomeSize \{ w: (\d+)\.0/, rust);
  test("the numbers the sum reads are the ones the code uses", () => {
    expect(rust).toContain("HomeSize { w: base.w.max(HomeSize::LARGE.w), min_h: SETTINGS_H, max_h: SETTINGS_H }");
    expect(style).toContain(".home { display: flex; flex-direction: column; height: 100vh; overflow-y: auto; background: var(--bg); color: var(--fg); border: 1px solid var(--line);");
    expect(style).toContain(".inner { flex: none; padding: var(--space-3) var(--space-6) var(--space-5); }");
    expect(style).toContain(".home { container: home / inline-size; }");
    expect(parts).toContain(".ui-group-card { container: group / inline-size;");
    expect(parts).toMatch(/\.ui-group-card \{[^}]*border: var\(--hair\) solid var\(--line\);/);
    expect(tokens).toContain("--hair: 1px;");
  });
  // Home's content box (its edge is 1 on each side), then the page's padding, then the sidebar and its gap unless Home's
  // own fold puts the sidebar on top, then the column's cap, then the card's edge: what a row's container query measures.
  const column = (t: TextSize) => {
    const r = root(t);
    const home = win - 2;
    const fold = px(/@container home \(width < (\d+)rem\) \{ \.settings-frame/, style) * r;
    const side = px(/\.settings-frame \{[^}]*grid-template-columns: (\d+)px minmax\(0, 1fr\)/, style);
    expect(style).toMatch(/\.settings-frame \{[^}]*column-gap: var\(--space-6\)/);
    const cap = px(/\.settings-content \{[^}]*max-width: (\d+)px/, style);
    const inner = home - 2 * space(6);
    const content = home < fold ? inner : inner - side - space(6);
    return Math.min(cap, content) - 2;
  };
  const stackBelow = (t: TextSize) => px(/@container group \(width < (\d+)rem\)/, parts) * root(t);
  test("Standard: the content column is 420, and a row stacks only under a narrower card", () => {
    expect(column("standard")).toBe(420);
    expect(stackBelow("standard")).toBeLessThan(column("standard"));
    // Room to spare, so a pixel of rounding never flips every row.
    expect(column("standard") - stackBelow("standard")).toBeGreaterThanOrEqual(16);
  });
  test("Standard and Large keep side by side rows; the biggest size stacks them", () => {
    const stacked = Object.fromEntries(TEXT_SIZES.map((t) => [t, column(t) < stackBelow(t)]));
    expect(stacked.standard).toBe(false);
    expect(stacked.large).toBe(false);
    expect(stacked.huge).toBe(true);
  });
  test("a row is a wrapping line whose words keep a floor, so a long control drops under them, never crushes them", () => {
    expect(parts).toMatch(/\.ui-row \{[^}]*display: flex; flex-wrap: wrap;/);
    expect(parts).toMatch(/\.ui-row-text \{[^}]*flex: 1 1 var\(--w-row-label\);/);
    expect(parts).toMatch(/\.ui-row-control \{[^}]*flex: 0 1 auto;[^}]*margin-inline-start: auto;/);
    expect(tokens).toContain("--w-row-label: 12rem;");
    // Words break between words, never one letter per line.
    expect(parts).toMatch(/\.ui-row-label \{[^}]*overflow-wrap: break-word;/);
    expect(parts).toMatch(/\.ui-row-desc \{[^}]*overflow-wrap: break-word;/);
    expect(parts).not.toMatch(/\.(btn|ui-seg-opt|ui-menu-value|ui-row-label|ui-row-desc) \{[^}]*overflow-wrap: anywhere/);
    // The space left for a control beside the words at Standard: the card, less the row's padding, the words' floor and the gap.
    const room = column("standard") - 2 * space(4) - 12 * 14 - space(4);
    expect(room).toBeGreaterThanOrEqual(200);
  });
  test("the changed dot sits in the row's padding, out of the flow, so a label never moves when its setting changes", () => {
    const dot = /\.ui-row-dot \{([^}]*)\}/.exec(parts)![1];
    expect(dot).toContain("position: absolute;");
    expect(dot).toContain("inset-inline-start: calc(var(--icon-md) * -1);");
    expect(dot).toContain("margin: 0;");
    expect(dot).not.toMatch(/margin:[^;]*\* -1/);
  });
});

describe("Settings scrolls its page only, and a child row says one line (review, 31 Oct)", () => {
  test("with Settings open the bar and the sidebar stay put: the content column is the one scroller", () => {
    expect(style).toContain('.home[data-view="settings"] .inner, .home[data-view="settings"] .view { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }');
    expect(style).toContain('.home[data-view="settings"] .settings-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }');
    expect(style).toMatch(/\.home\[data-view="settings"\] \.settings-frame \{[^}]*grid-template-rows: minmax\(0, 1fr\);/);
    // Folded (big text), the sidebar sits on top and the page under it still scrolls on its own.
    expect(style).toMatch(/@container home \(width < 44rem\) \{[^\n]*\.home\[data-view="settings"\] \.settings-frame \{ grid-template-rows: auto minmax\(0, 1fr\); \}/);
    // The page jumps to its top in its own column (settingsPage.tsx already scrolls it).
    expect(readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8")).toContain("content.current?.scrollTo({ top: 0 })");
    // Home's window is one fixed height while Settings is open, so the column has a height to scroll in.
    expect(rust).toContain("pub const SETTINGS_H: f64 = 640.0;");
  });
  test("folded (big text), the sidebar is one scrolling strip, so it leaves the page most of the fixed 640 tall window", () => {
    // Stacked as a column the sidebar took about 406 of 640 at Huge and left 3 to 4 lines of any page (review, 1 Nov).
    const folded = /@container home \(width < 44rem\) \{([^\n]*)\}/.exec(parts);
    expect(folded, "the folded block").toBeTruthy();
    const block = folded![1];
    expect(block).toMatch(/\.sb-list \{[^}]*display: flex;[^}]*overflow-x: auto;/);
    expect(block).toMatch(/\.sb-item \{[^}]*width: auto;[^}]*flex: none;/);
    expect(block).toMatch(/\.sb-sep \{[^}]*display: none;/);
    // One row of tabs under the search box: the sidebar is two controls tall, not eleven.
    expect(block).not.toMatch(/\.sb-list \{[^}]*display: grid/);
  });
  test("while its parent is off, a child row's description is the Turn on line, not a second note under its own words", () => {
    const page = readFileSync(new URL("./settingsPage.tsx", import.meta.url), "utf8");
    expect(page).toContain('const line = parentOff ? parentOff : d.key === "spend.dailyLimit"');
    const notes = page.slice(page.indexOf("  const notes = ["), page.indexOf("].filter(", page.indexOf("  const notes = [")));
    expect(notes).not.toContain("parentOff");
    for (const r of ["description={parentOff || micLine(v) || undefined}", "description={parentOff || S.voiceLanguageHelp}", "description={parentOff || voiceLine(v) || soundLine(v.sound) || undefined}"]) expect(page, r).toContain(r);
  });
});
