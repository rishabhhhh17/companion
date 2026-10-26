// Home in the notch (F18.1): the card, moved under the island and laid out in tabs. Which part of the old card lives on
// which tab, which tab opens by itself when something needs the person, when a click elsewhere may close Home, and the
// island's own words. Plain code, tested in home.test.ts; card.tsx and island.tsx only draw what this decides.
import { characterWords, stateLabel, visualState, waitsForAnswer, type CharacterState, type Model } from "./model.ts";
import { S } from "./strings.ts";
import { nameOf } from "./watch.ts";

export type Tab = "now" | "did" | "learn" | "memory" | "settings";
export const TABS: readonly Tab[] = ["now", "did", "learn", "memory", "settings"];
export const tabName = (t: Tab): string => S.homeTabs[t];
export const tabId = (t: Tab) => `home-tab-${t}`;
export const tabPanelId = (t: Tab) => `home-panel-${t}`;

// Every part of the old card, and the tab it now lives on. Now is everything the card showed while working. "every": shown
// between the tabs and the tab's panel whatever tab is open, because it is about Companion itself (the engine stopped, a
// notice, an error from something done on any tab) and must never be hidden on a tab the person is not looking at.
export type Panel =
  | "folder" | "ask" | "urgent" | "notes" | "about" | "diagram" | "promptHelp" | "drive" | "ship" | "research" | "rescue"
  | "task" | "proof" | "receipt" | "teach" | "browser" | "voice" | "point" | "everyday" | "bisect" | "errorHelp" | "secondLook" | "showMe" | "recap" | "toast"
  | "whatsNew" | "watch"
  | "history"
  | "practice" | "lessons" | "walk"
  | "memory"
  | "settings";
export type Place = Tab | "every";
export const PLACES: readonly Place[] = [...TABS, "every"];
export const PANEL_TAB: Record<Panel, Place> = {
  notes: "every",
  folder: "now", ask: "now", urgent: "now", about: "now", diagram: "now", promptHelp: "now", drive: "now", ship: "now",
  research: "now", rescue: "now", task: "now", proof: "now", receipt: "now", teach: "now", browser: "now", voice: "now", point: "now", everyday: "now",
  bisect: "now", errorHelp: "now", secondLook: "now", showMe: "now", recap: "now", toast: "now", whatsNew: "now", watch: "now",
  history: "did",
  practice: "learn", lessons: "learn", walk: "learn",
  memory: "memory",
  settings: "settings",
};
export const panelsIn = (t: Place): Panel[] => (Object.keys(PANEL_TAB) as Panel[]).filter((p) => PANEL_TAB[p] === t);

/** Where a part shows right now. Show me answers on Now, except during a lesson: then its pointer, and what it says when
 *  no pointer comes (Screen Recording is needed, it could not find that, the window changed, the click missed), belong
 *  under the lesson on Learn, as they were under the lesson on the old card. */
export function placeOf(p: Panel, m: Model): Place {
  if (p === "showMe" && m.walk) return "learn";
  return PANEL_TAB[p];
}
/** Does this part show on this tab? card.tsx draws each part only where this says. */
export function shownOn(p: Panel, tab: Tab, m: Model): boolean {
  const at = placeOf(p, m);
  return at === "every" || at === tab;
}

// ---- which tab opens by itself ----

/** Something on Home is waiting for the person: its tab, a key that changes when it is a new thing to look at, and why.
 *  `question`: it waits for the person's answer (a question, the loop card, a paused or new plan), so it is never hidden.
 *  `mustShow`: Prompt help or the error explainer, started by the person's own hotkey. Its panel is the light for reading
 *  another app's text (rule 5), holds the question asked before the first read, and shows the change before the keys that
 *  put it back work in every app, so it is always shown: never only marked, by the setting or while typing. */
export type Need = { key: string; tab: Tab; why: string; question?: boolean; mustShow?: boolean };

const WALK_NEEDS = ["step", "already", "asking", "help"];
const PRACTICE_NEEDS = ["start", "found", "failed", "blocked", "done"];
const SHOWME_NEEDS = ["needs_permission", "pointing", "pointing_roughly", "your_turn_miss", "window_changed", "error", "not_sure"];
// Show me during a lesson: the pointer is the lesson's own step, but these say why no pointer came, so they are new.
const SHOWME_PROBLEMS = ["needs_permission", "your_turn_miss", "window_changed", "error", "not_sure"];
const EVERYDAY_NEEDS = ["found", "none", "fixed", "still", "ask"];
const VOICE_NEEDS = ["needs_model", "needs_mic", "mic_refused", "blocked", "error"];
// Prompt help and the error explainer start from a hotkey and answer on Now: each step there, a refusal included.
const PH_NEEDS = ["reading", "consent", "ready", "needs_accessibility", "nothing_to_read", "error", "refused"];
const EH_NEEDS = ["reading", "consent", "ready", "unexplained", "needs_accessibility", "nothing_selected", "refused", "error"];
const SL_NEEDS = ["reading", "consent", "ready", "failed", "off", "needs_accessibility", "nothing_selected", "refused", "error"];

/** The most important thing waiting for the person, if any. A question to answer comes first. */
export function need(m: Model): Need | null {
  if (m.approvals.length) return { key: `approval:${m.approvals[0].id}`, tab: "now", why: S.needsYouTitle, question: true };
  if (m.agentsAsk) return { key: "agents", tab: "now", why: S.agentsTitle, question: true };
  if (m.stuck) return { key: `stuck:${m.stuck.index}:${m.stuck.title}`, tab: "now", why: S.stuckTitle, question: true };
  if (m.paused) return { key: `paused:${m.paused.reason}`, tab: "now", why: S.pausedTitle, question: true };
  if (m.plan) return { key: `plan:${m.plan.agent}:${m.plan.steps.length}`, tab: "now", why: S.planTitle, question: true };
  // The last task ended on a question to the person: its words and the box to answer in are under its receipt, on Now.
  if (waitsForAnswer(m)) return { key: `asks:${m.receipt?.checkpoint ?? ""}`, tab: "now", why: S.receiptAsks, question: true };
  if (m.walk && m.showme && SHOWME_PROBLEMS.includes(m.showme.stage)) return { key: `showme:${m.showme.req ?? ""}:${m.showme.stage}`, tab: "learn", why: S.showMe };
  if (m.walk && WALK_NEEDS.includes(m.walk.stage)) return { key: `walk:${m.walk.id}:${m.walk.index}:${m.walk.stage}`, tab: "learn", why: S.lessonsTitle };
  if (m.practice && PRACTICE_NEEDS.includes(m.practice.stage)) return { key: `practice:${m.practice.project}:${m.practice.stage}`, tab: "learn", why: S.practiceTitle };
  if (m.ph && PH_NEEDS.includes(m.ph.stage)) return { key: `ph:${m.ph.stage}`, tab: "now", why: S.phTitle, mustShow: true };
  if (m.eh && EH_NEEDS.includes(m.eh.stage)) return { key: `eh:${m.eh.req ?? ""}:${m.eh.stage}`, tab: "now", why: S.ehTitle, mustShow: true };
  if (m.sl && SL_NEEDS.includes(m.sl.stage)) return { key: `sl:${m.sl.req ?? ""}:${m.sl.stage}`, tab: "now", why: S.slTitle, mustShow: true };
  if (m.point?.stage === "found") return { key: `point:${m.point.label ?? ""}`, tab: "now", why: S.pointTitle };
  // An everyday look's answer (everyday.ts): what is wrong, whether it is fixed, or Did that work?
  if (m.everyday && EVERYDAY_NEEDS.includes(m.everyday.stage)) return { key: `everyday:${m.everyday.req ?? ""}:${m.everyday.stage}`, tab: "now", why: S.everydayTitle };
  // A pointer during a lesson belongs to the lesson, which is on Learn (its problems are above).
  if (!m.walk && m.showme && SHOWME_NEEDS.includes(m.showme.stage)) return { key: `showme:${m.showme.req ?? ""}:${m.showme.stage}`, tab: "now", why: S.showMe };
  if (m.voice && VOICE_NEEDS.includes(m.voice.stage)) return { key: `voice:${m.voice.stage}`, tab: "now", why: S.voiceTitle };
  return null;
}

// ---- the tabs ----

/** needKey: the need last acted on. What VoiceOver hears about a need, and the tab it is on, is Home's one live line
 *  (a11y.ts `liveLine`), since focus does not move there. */
export type HomeState = { tab: Tab; needKey: string };
export const homeStart = (): HomeState => ({ tab: "now", needKey: "" });
// typing: the person is typing in Home right now, so a need on another tab marks that tab and is said, but does not move them.
// markOnly: When something needs me is set to only mark the tab (home.goToNeeds), so the same, except for a question
// waiting for an answer, which still opens its tab: it is never hidden. Neither ever holds back a need that must show.
export type HomeAction = { type: "pick"; tab: Tab } | { type: "need"; need: Need | null; typing?: boolean; markOnly?: boolean } | { type: "opened"; keyboard: boolean };
type NeedAction = Extract<HomeAction, { type: "need" }>;
/** A need on another tab that stays there: the person is typing, or the setting asks to only mark it (not a question).
 *  Never Prompt help or the error explainer (`mustShow`). */
const onlyMarked = (s: HomeState, a: NeedAction): boolean => !!a.need && !a.need.mustShow && a.need.key !== s.needKey && a.need.tab !== s.tab && (!!a.typing || (!!a.markOnly && !a.need.question));

/** Is the person typing in Home: a text box, a list or editable text has the keyboard, in a window that has it? */
export function typing(active: { tag: string; editable: boolean } | null, windowHasFocus: boolean): boolean {
  return windowHasFocus && !!active && (active.editable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tag));
}

export function homeReduce(s: HomeState, a: HomeAction): HomeState {
  switch (a.type) {
    // The person's own choice. Focus moves to the tab, so VoiceOver reads it there.
    case "pick": return { ...s, tab: a.tab };
    case "need": {
      const key = a.need?.key ?? "";
      if (key === s.needKey) return s;   // the same thing as before: never pulls the person back to it
      if (!a.need) return { ...s, needKey: "" };
      if (a.need.tab === s.tab) return { ...s, needKey: key };
      if (onlyMarked(s, a)) return { ...s, needKey: key };
      return { tab: a.need.tab, needKey: key };
    }
    // The ask box hotkeys open Home ready to type, and the box is on Now. A click keeps the tab the person left it on.
    case "opened": return a.keyboard && s.tab !== "now" ? { ...s, tab: "now" } : s;
  }
}

/** What is said out loud (with Speak to me on) when a new need only marked its tab because of the setting: the same words
 *  VoiceOver hears on Home's live line (a11y.ts). Nothing when the setting is Go to it, as today. */
export function markedLine(s: HomeState, a: NeedAction): string | null {
  return a.markOnly && a.need && onlyMarked(s, a) ? S.homeWaiting(tabName(a.need.tab), a.need.why) : null;
}

/** May the Prompt help result's keys be armed (ph_ready)? They work in every app for a while, so only while Home is on
 *  screen (`shown`, the shell's "opened" and "closed") with its panel, and the change it would put back, on the tab that is
 *  open: one press never puts back a rewrite that was not shown. */
export function phArmable(m: Model, tab: Tab, shown: boolean): boolean {
  return shown && m.ph?.stage === "ready" && !!m.ph.text && shownOn("promptHelp", tab, m);
}

/** The tabs pattern: arrows move along the tabs and wrap, Home and End jump to the ends. The places are a list down the side,
 *  so Up and Down move as Left and Right do. */
export function tabKey(t: Tab, key: string): Tab | null {
  const i = TABS.indexOf(t), n = TABS.length;
  switch (key) {
    case "ArrowRight": case "ArrowDown": return TABS[(i + 1) % n];
    case "ArrowLeft": case "ArrowUp": return TABS[(i - 1 + n) % n];
    case "Home": return TABS[0];
    case "End": return TABS[n - 1];
    default: return null;
  }
}

// ---- a click elsewhere ----

/** May a click in another app close Home? Never with Close Home when I click another app turned off (`on`,
 *  home.closeOnClickAway). Not while it shows something the person is in the middle of: a question, a lesson, a pointer on
 *  the screen, Prompt help or the error explainer, the microphone, a "are you sure", or the first run (which sends people
 *  to other apps to get a key or sign in). */
export function closesOnClickAway(m: Model, onboarding: boolean, on = true): boolean {
  if (!on || onboarding || need(m)) return false;
  if (m.walk || m.practice || m.showme || m.teach || m.ph || m.eh || m.sl || m.voice) return false;
  if (m.point?.stage === "checking" || m.diagram?.stage === "asking") return false;
  if (m.undo?.stage === "confirm" || m.bisect?.undoStage === "confirm") return false;
  return true;
}

/** May Home step aside for what it just opened (a link in the browser, the email for Report a problem, Finder showing the
 *  support log), so that is not under Home? Only with Step aside for what Home opens on (home.stepAside), and never while
 *  something on Home waits for the person: the same rule as a click elsewhere, whatever Close Home when I click another
 *  app says. A lesson's link is part of its step, so the lesson keeps Home there. */
export function stepsAside(m: Model, onboarding: boolean, on: boolean): boolean {
  return on && closesOnClickAway(m, onboarding, true);
}

// ---- the island ----
// The fun island (founder, 27 Oct 2026: "it does not always have to show Ready there"): idle, the island is the bare notch,
// with no words at all. While something happens it grows short wings either side of the notch: a tiny Flowflow on the
// left and one small live mark on the right. A sentence shows only while the pointer rests on it, and only when there is
// something real to say. Plain code, tested in island.test.ts; island.tsx only draws what this decides.

export const ISLAND_LINE_MAX = 64;
const cut = (t: string) => (t.length <= ISLAND_LINE_MAX ? t : `${t.slice(0, ISLAND_LINE_MAX - 1).trimEnd()}…`);
const waiting = (m: Model) => !!need(m) && need(m)!.tab === "now" && (m.approvals.length > 0 || !!m.agentsAsk || !!m.stuck || !!m.paused || !!m.plan);

/** The small live mark on the right wing. dots: thinking. arc: working or looking. bars: listening (the microphone's light,
 *  rule 5). amber: something waits for the person. tick: just done (it draws itself). red: something went wrong. */
export type WingMark = "dots" | "arc" | "bars" | "amber" | "tick" | "red";
export type Wings = { state: CharacterState; mark: WingMark };
const MARK: Partial<Record<CharacterState, WingMark>> = { thinking: "dots", working: "arc", checking: "arc", listening: "bars", needsYou: "amber", done: "tick", error: "red" };

/** The wings beside the notch, or null for the bare notch. Listening and looking at the screen come first: they are the
 *  lights that show before the microphone or the screen is touched (rule 5), so nothing else ever covers them. Then a
 *  question waiting, then the character's own state, then a failing watch (F21). `marked`: When something needs me only
 *  marks the tab (home.goToNeeds), so anything that needs the person shows the amber mark too. With the engine stopped,
 *  none: the line says so when the pointer rests on it. */
export function islandWings(m: Model, marked = false): Wings | null {
  if (!m.runnerUp) return null;
  const v = visualState(m);
  if (v === "listening" || v === "checking") return { state: v, mark: MARK[v]! };
  if (waiting(m) || (marked && need(m))) return { state: "needsYou", mark: "amber" };
  const mark = MARK[v];
  if (mark) return { state: v, mark };
  if (failingWatch(m)) return { state: "error", mark: "red" };
  return null;
}

/** Are the wings out at all? The island page tells the app, which sizes the window (island.rs). */
export function islandAlert(m: Model, marked = false): boolean { return islandWings(m, marked) !== null; }

/** How long the green tick stays after something is done before the wings tuck back into the bare notch. */
export const DONE_WINGS_MS = 4000;
/** The wings as they show at `now`: a done tick that has shown for DONE_WINGS_MS is put away. `doneSince`: when the tick
 *  first showed (null when it is not showing). Every other state keeps its wings for as long as it lasts. */
export function wingsAt(w: Wings | null, doneSince: number | null, now: number): Wings | null {
  if (w?.mark === "tick" && doneSince !== null && now - doneSince >= DONE_WINGS_MS) return null;
  return w;
}

/** What the island draws in each of its sizes (the app's island.rs Mode words). Rest and wings never show a sentence;
 *  resting the pointer on the bare notch shows Flowflow peeking, and a line only when there is one. */
export type IslandMode = "rest" | "wings" | "peek" | "wingsPeek";
export const ISLAND_MODES: readonly IslandMode[] = ["rest", "wings", "peek", "wingsPeek"];
export function islandParts(mode: IslandMode, line: string): { wings: boolean; face: boolean; line: boolean } {
  return { wings: mode === "wings" || mode === "wingsPeek", face: mode === "peek", line: (mode === "peek" || mode === "wingsPeek") && line !== "" };
}

/** The first watch whose failing alert is still going (F21): the island shows its red mark and says so in one plain line
 *  under the pointer. Nothing pops up, and nothing takes the keyboard. null when none. */
export function failingWatch(m: Model): { project: string; kind: string; target?: string; reason: string } | null {
  if (!m.runnerUp) return null;
  const id = Object.keys(m.watchAlerts).find((k) => m.watches[k]?.state === "failing" || !m.watches[k]);
  return id ? m.watchAlerts[id] : null;
}

/** The character's state as it is drawn. With When something needs me set to only mark the tab (`markTab`) and no island
 *  (island.show off), the character carries the island's mark: anything that needs the person shows as Needs you. Its own
 *  lights (listening, looking at the screen) and an error are never covered by it. Otherwise exactly `visualState`. */
export function characterShows(m: Model, markTab: boolean, islandShown: boolean): CharacterState {
  const v = visualState(m);
  if (!markTab || islandShown || !m.runnerUp || !need(m)) return v;
  return v === "listening" || v === "checking" || v === "error" ? v : "needsYou";
}

/** The one line shown when the pointer rests on the island, or "" when there is nothing real to say: then the island shows
 *  only Flowflow peeking, never "Ready". `update`: the version a check found ready to install (the shell's "update-ready").
 *  With nothing else going on it says what is next: connect Claude first (Not connected yet), then the update waiting. */
export function islandLine(m: Model, o: { update?: string | null; group?: string | null } = {}): string {
  const line = islandLineBase(m, o);
  // With Show the working group on the island (groups.islandName) and a group at work, its name starts the line (F20 item 5).
  return line && o.group && m.runnerUp ? cut(S.groups.islandGroup(o.group, line)) : line;
}
function islandLineBase(m: Model, o: { update?: string | null }): string {
  if (!m.runnerUp) return S.islandOff;
  if (m.voice?.stage === "listening") return S.islandListening;
  if (m.approvals.length) return cut(S.islandNeedsYou(m.approvals[0].title));
  const n = need(m);
  if (waiting(m) && n) return cut(S.islandNeedsYou(n.why));
  // The task's name only while the task itself is what is busy or just done: listening, looking at the screen or a
  // finished ring also show as busy or done, and the last task's name would be wrong for them.
  const v = visualState(m), label = m.task?.label?.trim() ?? "", own = v === m.character;
  // With no reason the island knows (Home's own panels are not in its model), plain Needs you, never the word twice.
  if (v === "needsYou") return cut(n ? S.islandNeedsYou(n.why) : stateLabel("needsYou"));
  if (v === "done") return cut(own && label ? S.islandDone(label) : stateLabel("done"));
  if (v === "thinking" || v === "working" || v === "checking") return cut(own && label ? S.islandWorkingOn(label) : characterWords(m));
  if (v === "error") return cut(stateLabel("error"));
  const fw = failingWatch(m);
  if (fw) return cut(S.watch.islandFailing(nameOf(fw as never)));
  if (m.connected === "none") return S.islandNotConnected;
  if (o.update) return cut(S.islandUpdate(o.update));
  return "";
}

/** The island's name for VoiceOver: what it is, and its state in words, even while nothing is written on it. */
export const islandName = (line: string): string => `${S.islandOpen}. ${line || S.islandQuiet}`;
