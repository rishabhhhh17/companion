// Text size in Home (AGENTS.md, the bar 13). The Mac's own text size setting may not reach the pages, which run in a web
// view with their own sizes (M11 wave 4 plan, item 3, [verify] on a real Mac), so Settings has its own choice. Standard is
// the size Home always had; each step up makes every word in Home bigger, from one root size (style.css sizes everything
// in rem from the root, and `data-text` on the root picks it). Kept only in this Mac's page storage; delete everything
// removes it with the rest of the page storage. Only Home follows it: the island is the notch's size and the character's
// window is fixed. Plain code, tested in textsize.test.ts and a11y.test.ts.
export type TextSize = "standard" | "large" | "larger" | "largest";
export const TEXT_SIZES: readonly TextSize[] = ["standard", "large", "larger", "largest"];
export const TEXT_SIZE_DEFAULT: TextSize = "standard";
const KEY = "companion.textSize";

/** A saved value, or anything else, as one of the sizes; anything not one of them is Standard. */
export function textSizeFrom(v: unknown): TextSize {
  return (TEXT_SIZES as readonly unknown[]).includes(v) ? (v as TextSize) : TEXT_SIZE_DEFAULT;
}
export function textSize(): TextSize { try { return textSizeFrom(localStorage.getItem(KEY)); } catch { return TEXT_SIZE_DEFAULT; } }
export function setTextSize(s: TextSize): void { try { localStorage.setItem(KEY, s); } catch { /* storage may be unavailable */ } }

/** Puts the size on the page's root, which style.css sizes every word from. */
export function applyTextSize(s: TextSize, root: { dataset: Record<string, string | undefined> } = document.documentElement): void {
  root.dataset.text = s;
}
