// M97 review fix: a sheet opened from Settings (Get Pro, house rules, keys, the lists) drew underneath Settings' list of
// pages and its top row, and every line was cut on the left. The page's fade at its foot is a CSS mask, and a mask clips
// everything inside it, the fixed sheet layer too. While a sheet is open the mask is lifted, and in the wide Settings the
// sheet is as wide as the page column it covers, so it never sits under the list on the left.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const LOOK = () => read("./ui/look.css");

/** Every declaration block whose selector list contains `sel` (whitespace squashed). */
function blocks(css: string, sel: RegExp): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (sel.test(m[1]!.replace(/\s+/g, " "))) out.push(m[2]!);
  return out;
}

describe("M97: a sheet opened in Settings is never clipped or covered", () => {
  test("the page's fade mask is lifted while a sheet is open inside it", () => {
    const b = blocks(LOOK(), /\.settings-content:has\(\.ui-sheet-layer\)/);
    expect(b.length).toBeGreaterThan(0);
    const all = b.join(";");
    expect(all).toMatch(/(^|[;\s])mask-image:\s*none/);
    expect(all).toMatch(/-webkit-mask-image:\s*none/);
  });

  test("in the wide Settings a sheet covers the page column, not the list of pages", () => {
    const b = blocks(LOOK(), /\[data-layout="wide"\]\[data-view="settings"\] \.settings-frame/).join(";");
    expect(b).toMatch(/--w-sheet:\s*calc\(100% - var\(--w-side\)\)/);
  });
});
