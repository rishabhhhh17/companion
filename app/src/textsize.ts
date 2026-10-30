// Text size in Home (AGENTS.md, the bar 13). The Mac's own text size setting may not reach the pages, which run in a web
// view with their own sizes (M11 wave 4 plan, item 3, [verify] on a real Mac), so Settings has its own choice. Standard is
// the size Home always had; each step up makes every word in Home bigger, from one root size (style.css sizes everything
// in rem from the root, and `data-text` on the root picks it). It is display.textSize in the settings registry (T16), kept by
// the shell in settings.json and read through settingsStore.ts (the page storage it was kept in before is read only until
// the one migration). Only Home follows it: the island is the notch's size and the character's window is fixed. Plain
// code, tested in textsize.test.ts and a11y.test.ts.
import { setting } from "./settingsStore.ts";
export type TextSize = "standard" | "large" | "larger" | "largest" | "huge";
export const TEXT_SIZES: readonly TextSize[] = ["standard", "large", "larger", "largest", "huge"];
export const TEXT_SIZE_DEFAULT: TextSize = "standard";

/** A saved value, or anything else, as one of the sizes; anything not one of them is Standard. */
export function textSizeFrom(v: unknown): TextSize {
  return (TEXT_SIZES as readonly unknown[]).includes(v) ? (v as TextSize) : TEXT_SIZE_DEFAULT;
}
export const textSize = (): TextSize => textSizeFrom(setting("display.textSize"));

/** Puts the size on the page's root, which style.css sizes every word from. */
export function applyTextSize(s: TextSize, root: { dataset: Record<string, string | undefined> } = document.documentElement): void {
  root.dataset.text = s;
}
