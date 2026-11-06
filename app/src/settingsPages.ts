// Settings' pages (the overhaul spec, 3.2 to 3.4; F28 and T17: one Settings, inside Home). Nine pages in the sidebar, each
// a title, one line and a few Groups of Rows; everything else is in More options, in a section per page and a closed topic
// per subject. Every visible setting in protocol/settings.json has exactly one place here (settingsPages.test.ts), and
// search finds every one (settingsSearch.ts). The parts of Settings that are not settings (the plan, the key, the
// permissions, the danger zone) are named `{ fixed }` and searched by their words in strings.ts (S.setFixed).
import type { IconName } from "./icons.tsx";
import type { Colour } from "./meaning.ts";

export type PageId = "account" | "general" | "look" | "fixing" | "flowflow" | "keys" | "privacy" | "about" | "more";
/** The parts that are not settings. Each is drawn by the page (settingsPage.tsx) and found by search. */
export type Fixed = "plan" | "key" | "setup" | "permissions" | "kept" | "danger" | "updates" | "replay" | "practice" | "made" | "logs" | "acknowledgements" | "google" | "preview" | "usedOften" | "reviewKeep" | "doneSignal";
export type Item = string | { fixed: Fixed };
/** A Group on a page: its anchor (#account.plan) is its id; its words are S.setGroupTitles[id] and S.setGroupFoot[id]. */
export type GroupDef = { id: string; items: readonly Item[] };
/** A closed topic in More options: its title and count show until it is opened. `parent`: the switch that must be on for
 *  its rows to work (they are dimmed, with why, while it is off). */
export type Topic = { id: string; items: readonly Item[]; parent?: string };
export type Page = { icon: IconName; groups: readonly GroupDef[]; more: readonly Topic[] };

const f = (fixed: Fixed): Item => ({ fixed });

/** M71: each section's tile in Settings' side list, the Mac's own Settings style: a colour for the sections with their own
 *  subject (Account and Privacy blue, Fixing green, Character purple, Keys and voice teal), grey for the rest. */
export const PAGE_COLOUR: Readonly<Record<PageId, Colour>> = { account: "blue", general: "grey", look: "grey", fixing: "green", flowflow: "purple", keys: "teal", privacy: "blue", about: "grey", more: "grey" };
export const PAGES: Readonly<Record<PageId, Page>> = {
  account: {
    icon: "person",
    groups: [
      { id: "account.plan", items: [f("plan")] },
      // M74: the warning before the limit, and the most one task may spend (it stops there; Carry on goes on), beside it.
      { id: "account.spending", items: ["spend.dailyLimit", "spend.warnAt", "spend.pauseAt", "budget.task"] },
      // M68: what to call you, only for the hello in the notch (you.name).
      { id: "account.you", items: ["you.name"] },
    ],
    more: [
      { id: "more.account.spending", items: ["budget.plan", "budget.rescue", "budget.research", "model.work", "model.rescue", "model.quick"] },
      // M69 (F29): Squibby pays and picks the model, so nobody needs a key. Your own key stays only as a developer tool, here.
      { id: "more.account.developer", items: [f("key")] },
      // M58 (feature 9): the first run's optional answer, which AI you build with. It only picks a tip; Not set forgets it.
      { id: "more.account.you", items: ["you.buildsWith"] },
    ],
  },
  general: {
    icon: "sliders",
    groups: [
      { id: "general.setup", items: [f("setup")] },
      // M74: a standing Mac change, so the switch asks first (settingsPage.tsx OpenAtLogin).
      { id: "general.start", items: ["app.openAtLogin"] },
      { id: "general.notch", items: ["island.show", "island.peekOnHover", "island.openForQuestions", "island.display", "home.escStops"] },
      { id: "general.tools", items: ["guide.on", "secondLook.on", "files.on", "watch.on"] },
    ],
    more: [
      // What pointing at the notch opens (2 Nov 2026): Home, the usual, or the status line; beside how long it waits.
      { id: "more.general.notch", items: ["island.pointOpens", "island.showWork", "island.wings", "island.showStep", "island.hello", "island.openDelay", "island.closeDelay", "island.followDelay", "island.haptics", "panel.showWork", "panel.size"] },
      // M74: quiet hours for the notch's review dot and lines (Home still shows everything).
      { id: "more.general.quiet", items: ["quiet.on", "quiet.from", "quiet.to"] },
      { id: "more.general.home", items: ["home.closeOnClickAway", "home.stepAside", "home.goToNeeds", "home.size", "home.followFrontApp", "home.usedOftenFirst", f("usedOften")] },
      { id: "more.general.tools", items: ["flow.on", "drawIt.on", "groups.islandName", "groups.showUntried", "secondLook.searches"] },
      { id: "more.general.showme", parent: "guide.on", items: ["showme.allScreens", "showme.askWorked", "showme.waitForPage", "showme.everydayTutor", "showme.listen", "point.ringSeconds", "point.yourTurnSeconds", "point.colour", "point.fly", "point.style", "point.dropSize", "point.caption", "point.lettering", "point.guesses", "point.pace", "point.everyday", "point.everydayWhy", "point.fixWith", "drawIt.seconds", "teach.startWhereYouAre", "teach.yourTurn"] },
      { id: "more.general.files", parent: "files.on", items: ["drop.on", "drop.imageFormat", "drop.docFormat", "drop.audioFormat", "drop.videoFormat", "drop.resizeTo", "drop.quality", "drop.sampleRate", "drop.saveTo", "attach.docLimit"] },
      { id: "more.general.watch", items: ["watch.schedule", "watch.dailyHour", "watch.quiet", "watch.quietFrom", "watch.quietTo", "where.after", f("google")] },
    ],
  },
  // M71 (the founder, 5 Nov 2026: "black with accents of different color", "I don't want to do this again and again"): the
  // look is one black look, so the page offers four things: Colour, Character, Layout and Text size. The retired look keys
  // stay in the registry, hidden, so a stored value still loads; nothing offers or reads them.
  look: {
    icon: "image",
    groups: [
      { id: "look.home", items: ["look.colour", "look.character", "look.layout", "display.textSize"] },
    ],
    more: [],
  },
  fixing: {
    icon: "wrench",
    groups: [
      // M57 UI 12: the review of changes to the project, first on the page about fixing, where people look for it.
      // M74: how strict and the key warning beside the mode, and this project's own choice (a project setting).
      { id: "fixing.review", items: ["review.mode", "review.modeHere", "review.strictness", "review.keyWarning"] },
      // M75 (roadmap 19): when Claude Code or Codex says it is done, one row per tool, beside the review it starts.
      { id: "fixing.done", items: [f("doneSignal")] },
      { id: "fixing.tries", items: ["work.tries"] },
      { id: "fixing.rules", items: ["rules.house", "check.install"] },
      { id: "fixing.checks", items: ["check.pageSize", "explain.mode"] },
      { id: "fixing.undo", items: ["undo.protectMyEdits"] },
    ],
    more: [
      { id: "more.fixing.review", items: ["review.quietSeconds", "review.autoQuietSeconds", "review.ignore", "review.stopKinds", "review.whenNothing", "review.maxFiles", "review.keepDays"] },
      { id: "more.fixing.run", items: ["work.maxTurns", "work.askOnAnyFailure", "work.tryAgain", "work.stopOnQuestion", "work.webSearch", "drive.maxSteps", "make.folder", "approval.waitMinutes", "pointat.editor", "explain.after", "ask.choices"] },
      { id: "more.fixing.checks", items: ["check.mustSee", "check.press", "check.afterPress", "check.start", "check.skip", "check.time", "net.slow", "pictures.make", "pictures.keep", "rescue.readDeployLog", "rescue.readCiRun", "check.privatePages"] },
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
    more: [{ id: "more.flowflow.motion", items: ["character.position", "character.sameEverywhere", "character.comeTo", "character.linger", "character.motion", "character.restLowPower", "character.overFullScreen", "character.peekIdle", "character.live", "character.reacts", "fun.reactions", "sound.volume"] }],
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
      // M74: what leaves this Mac for Claude, and how long safety copies and review history are kept.
      { id: "privacy.claude", items: ["privacy.neverSend", "review.send"] },
      { id: "privacy.copies", items: ["undo.keepSize", "undo.keepAge", f("reviewKeep")] },
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
      { id: "about.updates", items: [f("updates"), "updates.daily"] },   // M69 step 3: what is true now first, then the switch
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
export const CHILD_OF: Readonly<Record<string, string>> = { "talk.voice": "voice.on", "talk.speak": "voice.on", "talk.captions": "voice.on", "talk.dictate": "voice.on", "quiet.from": "quiet.on", "quiet.to": "quiet.on" };
/** Options kept in the registry but not offered. A value already set to one still works. Night is the theme from before
 *  M51: Graphite replaced it, so it is kept only so a saved "night" checks out (it reads as Graphite, OPTION_ALIASES). Deep,
 *  hidden until it had a full, tested look (T17), is offered since M51. M71: Colour's Vivid reads as Colourful, and the
 *  Character's Match the look (the style is retired) reads as the Visor. */
export const HIDDEN_OPTIONS: Readonly<Record<string, readonly string[]>> = { "look.theme": ["night"], "look.colour": ["vivid"], "look.character": ["match"] };
/** A saved value that reads as another option. A row shows and compares the option it reads as, so a saved "night" shows
 *  Graphite picked and is not marked as changed. */
export const OPTION_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = { "look.theme": { night: "graphite" }, "look.colour": { vivid: "colourful" }, "look.character": { match: "visor" } };
export const shownValue = (key: string, v: unknown, style?: unknown): unknown =>
  // M71: a stored "match" under the retired Friendly style shows as the water character it draws (lookfeel.ts characterOf).
  key === "look.character" && (v === "match" || v === undefined) && style === "friendly" ? "friendly"
    : (typeof v === "string" && OPTION_ALIASES[key]?.[v]) || v;

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
