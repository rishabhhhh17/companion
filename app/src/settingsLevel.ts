// Settings in two levels (M28, founder, 29 Oct 2026: "about 25 main choices, the rest behind Advanced, nothing deleted").
// The main Settings shows the choices a person actually makes: how Squibby looks and behaves, the notch, which groups are
// on, talking, keys, the daily spending limit, house rules, privacy, text size and updates. Every other setting (timings,
// per mode budgets, model picks, file formats, watch hours, pointer fine tuning) lives under Advanced, grouped as before,
// and search still finds every one of them. M46: the Character hero's Still, Gentle and Lively write character.lively
// only. fun.reactions and character.motion (Less motion) stay under Advanced, reachable and found by search; the hero no
// longer covers them. M47 decides their final place.
import { PAGE_KEYS } from "./settingsPages.ts";
export const MAIN: ReadonlySet<string> = new Set(PAGE_KEYS);   // M30: exactly what the pages show (settingsPages.ts)
export const ADVANCED_PLACE = "advanced";

type Section = { id: string; title: string; keys: string[] };
/** The sections at one level: the main choices, or everything else (Advanced). A section with nothing left is left out. */
export function levelSections(sections: readonly Section[], advanced: boolean): Section[] {
  return sections.map((s) => ({ ...s, keys: s.keys.filter((k) => MAIN.has(k) !== advanced) })).filter((s) => s.keys.length > 0);
}
