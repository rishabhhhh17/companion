// Settings in two levels (M28, founder, 29 Oct 2026: "about 25 main choices, the rest behind Advanced, nothing deleted").
// The main Settings shows the choices a person actually makes: how Squibby looks and behaves, the notch, which groups are
// on, talking, keys, the daily spending limit, house rules, privacy, text size and updates. Every other setting (timings,
// per mode budgets, model picks, file formats, watch hours, pointer fine tuning) lives under Advanced, grouped as before,
// and search still finds every one of them. The Character hero's Lively, Calm and Still covers fun.reactions and
// character.motion, so those two rows are Advanced only.
export const MAIN: ReadonlySet<string> = new Set([
  // Squibby
  "character.name", "look.water", "look.theme", "look.size", "character.edge", "sound.on",
  // The notch
  "island.show", "island.showWork", "island.openForQuestions",
  // Groups
  "flow.on", "guide.on", "voice.on", "files.on",
  // Talking
  "talk.voice", "talk.speak", "talk.captions",
  // Keys and pointing
  "keys.hotkeys", "point.colour",
  // Money, rules and privacy
  "spend.dailyLimit", "rules.house", "memory.paused", "sharing.hide", "calls.quiet",
  // The Mac
  "display.textSize", "updates.daily",
]);
export const ADVANCED_PLACE = "advanced";

type Section = { id: string; title: string; keys: string[] };
/** The sections at one level: the main choices, or everything else (Advanced). A section with nothing left is left out. */
export function levelSections(sections: readonly Section[], advanced: boolean): Section[] {
  return sections.map((s) => ({ ...s, keys: s.keys.filter((k) => MAIN.has(k) !== advanced) })).filter((s) => s.keys.length > 0);
}
