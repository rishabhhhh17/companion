// Settings' pages (the overhaul spec, 3.2 to 3.4; F28 and T17: one Settings, inside Home). Nine pages in the sidebar, each
// a title, one line and a few Groups of Rows; everything else is in More options, in a section per page and a closed topic
// per subject. Every visible setting in protocol/settings.json has exactly one place here (settingsPages.test.ts), and
// search finds every one (settingsSearch.ts). The parts of Settings that are not settings (the plan, the key, the
// permissions, the danger zone) are named `{ fixed }` and searched by their words in strings.ts (S.setFixed).
import type { IconName } from "./icons.tsx";

export type PageId = "account" | "general" | "look" | "fixing" | "flowflow" | "keys" | "privacy" | "about" | "more";
/** The parts that are not settings. Each is drawn by the page (settingsPage.tsx) and found by search. */
export type Fixed = "plan" | "key" | "setup" | "permissions" | "kept" | "danger" | "updates" | "replay" | "practice" | "made" | "logs" | "acknowledgements" | "google" | "preview";
export type Item = string | { fixed: Fixed };
/** A Group on a page: its anchor (#account.plan) is its id; its words are S.setGroupTitles[id] and S.setGroupFoot[id]. */
export type GroupDef = { id: string; items: readonly Item[] };
/** A closed topic in More options: its title and count show until it is opened. `parent`: the switch that must be on for
 *  its rows to work (they are dimmed, with why, while it is off). */
export type Topic = { id: string; items: readonly Item[]; parent?: string };
export type Page = { icon: IconName; groups: readonly GroupDef[]; more: readonly Topic[] };

const f = (fixed: Fixed): Item => ({ fixed });

export const PAGES: Readonly<Record<PageId, Page>> = {
  account: {
    icon: "person",
    groups: [
      { id: "account.plan", items: [f("plan")] },
      { id: "account.claude", items: [f("key")] },
      { id: "account.spending", items: ["spend.dailyLimit"] },
    ],
    more: [{ id: "more.account.spending", items: ["budget.task", "budget.plan", "budget.rescue", "budget.research", "model.work", "model.rescue", "model.quick"] }],
  },
  general: {
    icon: "sliders",
    groups: [
      { id: "general.setup", items: [f("setup")] },
      { id: "general.notch", items: ["island.show", "island.peekOnHover", "island.openForQuestions", "island.display", "home.escStops", "display.textSize"] },
      { id: "general.tools", items: ["guide.on", "secondLook.on", "files.on", "watch.on"] },
    ],
    more: [
      // What pointing at the notch opens (2 Nov 2026): Home, the usual, or the status line; beside how long it waits.
      { id: "more.general.notch", items: ["island.pointOpens", "island.showWork", "island.openDelay", "island.closeDelay", "island.followDelay", "panel.showWork", "panel.size"] },
      { id: "more.general.home", items: ["home.closeOnClickAway", "home.stepAside", "home.goToNeeds", "home.size"] },
      { id: "more.general.tools", items: ["flow.on", "drawIt.on", "groups.islandName", "groups.showUntried", "secondLook.searches"] },
      { id: "more.general.showme", parent: "guide.on", items: ["showme.allScreens", "showme.askWorked", "showme.waitForPage", "showme.everydayTutor", "showme.listen", "point.ringSeconds", "point.yourTurnSeconds", "point.colour", "point.fly", "point.style", "point.dropSize", "point.caption", "point.lettering", "point.guesses", "point.pace", "point.everyday", "point.everydayWhy", "point.fixWith", "drawIt.seconds", "teach.startWhereYouAre", "teach.yourTurn"] },
      { id: "more.general.files", parent: "files.on", items: ["drop.on", "drop.imageFormat", "drop.docFormat", "drop.audioFormat", "drop.videoFormat", "drop.resizeTo", "drop.quality", "drop.sampleRate", "drop.saveTo", "attach.docLimit"] },
      { id: "more.general.watch", items: ["watch.schedule", "watch.dailyHour", "watch.quiet", "watch.quietFrom", "watch.quietTo", "review.mode", "review.quietSeconds", "where.after", f("google")] },
    ],
  },
  // M51 polish (the founder, 1 Nov 2026: "as much customization as possible", "very unique"): Home's whole look on a page of
  // its own, one step from the sidebar, beside the water's colour, chosen by looking at pictures. It was three levels deep in
  // More options as words only.
  look: {
    icon: "image",
    groups: [
      { id: "look.home", items: ["look.layout", "look.theme", "look.colour", "look.water"] },
      { id: "look.details", items: ["look.light", "look.gloss", "look.corners", "look.density", "look.icons", "look.stamps"] },
    ],
    more: [],
  },
  fixing: {
    icon: "wrench",
    groups: [
      { id: "fixing.rules", items: ["rules.house", "check.install"] },
      { id: "fixing.checks", items: ["check.pageSize", "explain.mode"] },
      { id: "fixing.undo", items: ["undo.protectMyEdits"] },
    ],
    more: [
      { id: "more.fixing.run", items: ["work.maxTurns", "work.tries", "work.askOnAnyFailure", "work.tryAgain", "work.stopOnQuestion", "work.webSearch", "drive.maxSteps", "make.folder", "approval.waitMinutes", "pointat.editor", "explain.after"] },
      { id: "more.fixing.checks", items: ["check.mustSee", "check.press", "check.afterPress", "check.start", "check.skip", "check.time", "net.slow", "pictures.make", "pictures.keep", "rescue.readDeployLog", "rescue.readCiRun"] },
    ],
  },
  flowflow: {
    icon: "drop",
    groups: [
      { id: "flowflow.preview", items: [f("preview")] },
      { id: "flowflow.lively", items: ["character.lively"] },
      { id: "flowflow.look", items: ["look.size", "character.name"] },
      { id: "flowflow.place", items: ["character.edge", "character.dockWhen", "character.peek", "character.follow"] },
      { id: "flowflow.sound", items: ["sound.on"] },
    ],
    more: [{ id: "more.flowflow.motion", items: ["character.position", "character.sameEverywhere", "character.comeTo", "character.linger", "character.motion", "character.restLowPower", "character.overFullScreen", "character.peekIdle", "character.live", "fun.reactions", "sound.volume"] }],
  },
  keys: {
    icon: "keyboard",
    groups: [
      { id: "keys.keys", items: ["keys.hotkeys"] },
      { id: "keys.talking", items: ["voice.on", "talk.voice", "talk.speak", "talk.captions", "talk.dictate"] },
      // The overhaul spec (3.4): Prompt help split out of voice.on, so turning talking off no longer turns it off.
      { id: "keys.prompt", items: ["prompt.on"] },
    ],
    more: [
      { id: "more.keys.talking", parent: "voice.on", items: ["talk.speakReplies", "talk.autoSend", "talk.followUpByPointing", "talk.shortSteps", "talk.maxHold", "speak.alsoSay"] },
      { id: "more.keys.prompt", parent: "prompt.on", items: ["ph.style", "ph.useProjectInfo", "ph.handBack", "ph.appAnswers"] },
    ],
  },
  privacy: {
    icon: "lock",
    groups: [
      { id: "privacy.see", items: [f("permissions")] },
      { id: "privacy.sharing", items: ["sharing.hide", "calls.quiet"] },
      { id: "privacy.memory", items: ["memory.paused", f("kept")] },
      { id: "privacy.danger", items: [f("danger")] },
    ],
    more: [
      { id: "more.privacy.memory", items: ["memory.learnFromFiles", "memory.learnFromWords", "memory.rememberGoals", "memory.tellClaude", "memory.recallLength", "memory.toastSeconds", "task.offRecordByDefault"] },
      { id: "more.privacy.calls", items: ["calls.apps", "numbers.on"] },
    ],
  },
  about: {
    icon: "info",
    groups: [
      { id: "about.updates", items: ["updates.daily", f("updates")] },
      { id: "about.help", items: [f("replay"), f("practice"), f("made"), f("logs")] },
      { id: "about.legal", items: [f("acknowledgements")] },
    ],
    more: [],
  },
  more: { icon: "more", groups: [], more: [] },
};

/** The sidebar, in order: the seven pages (Look since M51), a hairline, then About and More options (the spec, 3.2). */
export const SIDEBAR: readonly PageId[] = ["account", "general", "look", "fixing", "flowflow", "keys", "privacy", "about", "more"];
/** The hairline sits before this page. */
export const HAIRLINE_BEFORE: PageId = "about";
export const FIRST_PAGE: PageId = "general";
export const isPage = (id: string): id is PageId => Object.hasOwn(PAGES, id);

/** One row that owns more than one key: At rest writes Tuck into the edge and Stick to the edge (the spec, 3.4). */
export const ROW_OWNS: Readonly<Record<string, readonly string[]>> = { "character.peek": ["character.peek", "character.stick"] };
/** Child rows on a page: indented under their parent switch, and dimmed with why while it is off. */
export const CHILD_OF: Readonly<Record<string, string>> = { "talk.voice": "voice.on", "talk.speak": "voice.on", "talk.captions": "voice.on", "talk.dictate": "voice.on" };
/** Options kept in the registry but not offered. A value already set to one still works. Night is the theme from before
 *  M51: Graphite replaced it, so it is kept only so a saved "night" checks out (it reads as Graphite, OPTION_ALIASES). Deep,
 *  hidden until it had a full, tested look (T17), is offered since M51. */
export const HIDDEN_OPTIONS: Readonly<Record<string, readonly string[]>> = { "look.theme": ["night"] };
/** A saved value that reads as another option. A row shows and compares the option it reads as, so a saved "night" shows
 *  Graphite picked and is not marked as changed. */
export const OPTION_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = { "look.theme": { night: "graphite" } };
export const shownValue = (key: string, v: unknown): unknown => (typeof v === "string" && OPTION_ALIASES[key]?.[v]) || v;

const keysOf = (items: readonly Item[]): string[] => items.flatMap((i) => (typeof i === "string" ? [...(ROW_OWNS[i] ?? [i])] : []));
/** Every setting key on a page's main level. */
export const mainKeys = (p: PageId): string[] => PAGES[p].groups.flatMap((g) => keysOf(g.items));
/** Every setting key in a page's section of More options. */
export const moreKeys = (p: PageId): string[] => PAGES[p].more.flatMap((t) => keysOf(t.items));
/** The main level of Settings: every key a page shows before More. */
export const MAIN: ReadonlySet<string> = new Set(SIDEBAR.flatMap(mainKeys));
/** The owner pages of More options, in the sidebar's order (a page with nothing more has no section). */
export const MORE_SECTIONS: readonly PageId[] = SIDEBAR.filter((p) => PAGES[p].more.length > 0);

export type Place = { page: PageId; group: string; more: boolean; topic?: string };
/** Where a setting key, a fixed part, a group or a page lives. A key in no place (a new one) belongs to More's last
 *  section, so it can never go missing. */
export function placeOf(what: string): Place | null {
  if (isPage(what)) return { page: what, group: "", more: what === "more" };
  for (const p of SIDEBAR) {
    for (const g of PAGES[p].groups) {
      if (g.id === what) return { page: p, group: g.id, more: false };
      if (g.items.some((i) => (typeof i === "string" ? (ROW_OWNS[i] ?? [i]).includes(what) : i.fixed === what))) return { page: p, group: g.id, more: false };
    }
    for (const t of PAGES[p].more) {
      if (t.id === what || t.items.some((i) => (typeof i === "string" ? (ROW_OWNS[i] ?? [i]).includes(what) : i.fixed === what))) return { page: "more", group: t.id, more: true, topic: t.id };
    }
  }
  return null;
}
/** The anchor a row carries on its page, so a search result or a deep link can scroll to it and flash it. */
export const rowAnchor = (key: string): string => `set-${key.replace(/\./g, "-")}`;

// At rest (the spec, 3.4): one Segmented control for two keys. Show: not tucked. Half: tucked with half in view. Hidden:
// tucked fully past the edge.
export type AtRest = "show" | "half" | "hidden";
export const AT_REST: readonly AtRest[] = ["show", "half", "hidden"];
export const atRestOf = (peek: unknown, stick: unknown): AtRest => (peek !== true ? "show" : stick === false ? "hidden" : "half");
/** What At rest writes: Show only turns tucking off (Stick to the edge keeps its value for next time). */
export const atRestWrites = (v: AtRest): [string, boolean][] =>
  v === "show" ? [["character.peek", false]] : [["character.peek", true], ["character.stick", v === "half"]];
