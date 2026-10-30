// Settings as a few clear pages (M30, the founder, 29 Oct 2026, showing HeyClicky's settings: "see, it's so simple… I don't
// want to overcrowd my things"). A side list of pages with an icon each, in three short groups; each page is a title, one
// line saying what it is for, and one card of rows: a name, one short line, and the control on the right. Every visible
// setting not on a page lives under Advanced (settingsLevel.ts), and search still finds every one.
import type { IconName } from "./icons.tsx";
import type { FixedGroup } from "./settingsRows.ts";

export type PageId = "account" | "general" | "character" | "voice" | "shortcuts" | "powers" | "privacy" | "advanced" | "about";
export type Page = { icon: IconName; keys: readonly string[]; fixed: readonly FixedGroup[] };

export const PAGES: Readonly<Record<PageId, Page>> = {
  account: { icon: "person", keys: ["spend.dailyLimit"], fixed: ["key", "google"] },
  general: { icon: "sliders", keys: ["island.show", "island.showWork", "island.openForQuestions", "home.escStops", "sharing.hide", "calls.quiet", "display.textSize", "updates.daily"], fixed: [] },
  character: { icon: "drop", keys: ["character.name", "look.water", "look.size", "character.edge", "character.peek", "character.lively", "character.follow", "character.restLowPower", "sound.on"], fixed: [] },
  voice: { icon: "mic", keys: ["talk.dictate", "talk.speak", "talk.captions", "talk.voice"], fixed: [] },
  shortcuts: { icon: "keyboard", keys: ["keys.hotkeys"], fixed: [] },
  powers: { icon: "grid", keys: ["flow.on", "guide.on", "voice.on", "files.on"], fixed: [] },
  privacy: { icon: "lock", keys: ["memory.paused", "rules.house"], fixed: ["permissions", "kept"] },
  advanced: { icon: "more", keys: [], fixed: [] },
  about: { icon: "info", keys: [], fixed: ["practice", "made", "acknowledgements", "logs"] },
};
/** The side list: a first group with no heading, then Squibby's own pages, then the rest. */
export const PAGE_GROUPS: readonly { head: "" | "squibby" | "more"; pages: readonly PageId[] }[] = [
  { head: "", pages: ["account", "general"] },
  { head: "squibby", pages: ["character", "voice", "shortcuts", "powers"] },
  { head: "more", pages: ["privacy", "advanced", "about"] },
];
export const FIRST_PAGE: PageId = "general";
export const isPage = (id: string): id is PageId => Object.hasOwn(PAGES, id);
/** Every setting a page shows: the main level of Settings (settingsLevel.ts). */
export const PAGE_KEYS: readonly string[] = Object.values(PAGES).flatMap((p) => p.keys);
/** The page a setting is on, or Advanced. */
export const pageOf = (key: string): PageId => (Object.keys(PAGES) as PageId[]).find((p) => PAGES[p].keys.includes(key)) ?? "advanced";
