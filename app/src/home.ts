// Home in the notch (F18.1): the card, moved under the island and laid out in tabs. Which part of the old card lives on
// which tab, which tab opens by itself when something needs the person, when a click elsewhere may close Home, and the
// island's own words. Plain code, tested in home.test.ts; card.tsx and island.tsx only draw what this decides.
import { characterWords, stateLabel, visualState, type Model } from "./model.ts";
import { S } from "./strings.ts";

export type Tab = "now" | "did" | "learn" | "memory" | "settings";
export const TABS: readonly Tab[] = ["now", "did", "learn", "memory", "settings"];
export const tabName = (t: Tab): string => S.homeTabs[t];
export const tabId = (t: Tab) => `home-tab-${t}`;
export const tabPanelId = (t: Tab) => `home-panel-${t}`;

// Every part of the old card, and the tab it now lives on. Now is everything the card showed while working.
export type Panel =
  | "folder" | "ask" | "urgent" | "notes" | "about" | "diagram" | "promptHelp" | "drive" | "ship" | "research" | "rescue"
  | "task" | "proof" | "receipt" | "teach" | "browser" | "voice" | "point" | "bisect" | "errorHelp" | "showMe" | "recap" | "toast"
  | "history"
  | "practice" | "lessons" | "walk"
  | "memory"
  | "settings";
export const PANEL_TAB: Record<Panel, Tab> = {
  folder: "now", ask: "now", urgent: "now", notes: "now", about: "now", diagram: "now", promptHelp: "now", drive: "now", ship: "now",
  research: "now", rescue: "now", task: "now", proof: "now", receipt: "now", teach: "now", browser: "now", voice: "now", point: "now",
  bisect: "now", errorHelp: "now", showMe: "now", recap: "now", toast: "now",
  history: "did",
  practice: "learn", lessons: "learn", walk: "learn",
  memory: "memory",
  settings: "settings",
};
export const panelsIn = (t: Tab): Panel[] => (Object.keys(PANEL_TAB) as Panel[]).filter((p) => PANEL_TAB[p] === t);

// ---- which tab opens by itself ----

/** Something on Home is waiting for the person: its tab, a key that changes when it is a new thing to look at, and why. */
export type Need = { key: string; tab: Tab; why: string };

const WALK_NEEDS = ["step", "already", "asking", "help"];
const PRACTICE_NEEDS = ["start", "found", "failed", "blocked", "done"];
const SHOWME_NEEDS = ["needs_permission", "pointing", "pointing_roughly", "your_turn_miss", "window_changed", "error", "not_sure"];
const VOICE_NEEDS = ["needs_model", "needs_mic", "mic_refused", "blocked", "error"];
// Prompt help and the error explainer start from a hotkey and answer on Now: each step there, a refusal included.
const PH_NEEDS = ["reading", "consent", "ready", "needs_accessibility", "nothing_to_read", "error", "refused"];
const EH_NEEDS = ["reading", "consent", "ready", "unexplained", "needs_accessibility", "nothing_selected", "refused", "error"];

/** The most important thing waiting for the person, if any. A question to answer comes first. */
export function need(m: Model): Need | null {
  if (m.approvals.length) return { key: `approval:${m.approvals[0].id}`, tab: "now", why: S.needsYouTitle };
  if (m.agentsAsk) return { key: "agents", tab: "now", why: S.agentsTitle };
  if (m.stuck) return { key: `stuck:${m.stuck.index}:${m.stuck.title}`, tab: "now", why: S.stuckTitle };
  if (m.paused) return { key: `paused:${m.paused.reason}`, tab: "now", why: S.pausedTitle };
  if (m.plan) return { key: `plan:${m.plan.agent}:${m.plan.steps.length}`, tab: "now", why: S.planTitle };
  if (m.walk && WALK_NEEDS.includes(m.walk.stage)) return { key: `walk:${m.walk.id}:${m.walk.index}:${m.walk.stage}`, tab: "learn", why: S.lessonsTitle };
  if (m.practice && PRACTICE_NEEDS.includes(m.practice.stage)) return { key: `practice:${m.practice.project}:${m.practice.stage}`, tab: "learn", why: S.practiceTitle };
  if (m.ph && PH_NEEDS.includes(m.ph.stage)) return { key: `ph:${m.ph.stage}`, tab: "now", why: S.phTitle };
  if (m.eh && EH_NEEDS.includes(m.eh.stage)) return { key: `eh:${m.eh.req ?? ""}:${m.eh.stage}`, tab: "now", why: S.ehTitle };
  if (m.point?.stage === "found") return { key: `point:${m.point.label ?? ""}`, tab: "now", why: S.pointTitle };
  // A pointer during a lesson belongs to the lesson, which is on Learn.
  if (!m.walk && m.showme && SHOWME_NEEDS.includes(m.showme.stage)) return { key: `showme:${m.showme.req ?? ""}:${m.showme.stage}`, tab: "now", why: S.showMe };
  if (m.voice && VOICE_NEEDS.includes(m.voice.stage)) return { key: `voice:${m.voice.stage}`, tab: "now", why: S.voiceTitle };
  return null;
}

// ---- the tabs ----

/** said: the last tab shown by itself, for VoiceOver (focus does not move there). needKey: the need last acted on. */
export type HomeState = { tab: Tab; needKey: string; said: string };
export const homeStart = (): HomeState => ({ tab: "now", needKey: "", said: "" });
// typing: the person is typing in Home right now, so a need on another tab marks that tab and is said, but does not move them.
export type HomeAction = { type: "pick"; tab: Tab } | { type: "need"; need: Need | null; typing?: boolean } | { type: "opened"; keyboard: boolean };

/** Is the person typing in Home: a text box, a list or editable text has the keyboard, in a window that has it? */
export function typing(active: { tag: string; editable: boolean } | null, windowHasFocus: boolean): boolean {
  return windowHasFocus && !!active && (active.editable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tag));
}

export function homeReduce(s: HomeState, a: HomeAction): HomeState {
  switch (a.type) {
    // The person's own choice. Focus moves to the tab, so VoiceOver reads it there; the old announcement goes.
    case "pick": return { ...s, tab: a.tab, said: "" };
    case "need": {
      const key = a.need?.key ?? "";
      if (key === s.needKey) return s;   // the same thing as before: never pulls the person back to it
      if (!a.need) return { ...s, needKey: "" };
      if (a.need.tab === s.tab) return { ...s, needKey: key };
      if (a.typing) return { ...s, needKey: key, said: S.homeWaiting(tabName(a.need.tab), a.need.why) };
      return { tab: a.need.tab, needKey: key, said: S.homeShown(tabName(a.need.tab), a.need.why) };
    }
    // The ask box hotkeys open Home ready to type, and the box is on Now. A click keeps the tab the person left it on.
    case "opened": return a.keyboard && s.tab !== "now" ? { ...s, tab: "now", said: "" } : s;
  }
}

/** The tabs pattern: arrows move along the tabs and wrap, Home and End jump to the ends. */
export function tabKey(t: Tab, key: string): Tab | null {
  const i = TABS.indexOf(t), n = TABS.length;
  switch (key) {
    case "ArrowRight": return TABS[(i + 1) % n];
    case "ArrowLeft": return TABS[(i - 1 + n) % n];
    case "Home": return TABS[0];
    case "End": return TABS[n - 1];
    default: return null;
  }
}

// ---- a click elsewhere ----

/** May a click in another app close Home? Not while it shows something the person is in the middle of: a question, a
 *  lesson, a pointer on the screen, Prompt help or the error explainer, the microphone, a "are you sure", or the first run
 *  (which sends people to other apps to get a key or sign in). */
export function closesOnClickAway(m: Model, onboarding: boolean): boolean {
  if (onboarding || need(m)) return false;
  if (m.walk || m.practice || m.showme || m.teach || m.ph || m.eh || m.voice) return false;
  if (m.point?.stage === "checking" || m.diagram?.stage === "asking") return false;
  if (m.undo?.stage === "confirm" || m.bisect?.undoStage === "confirm") return false;
  return true;
}

// ---- the island ----

export const ISLAND_LINE_MAX = 64;
const cut = (t: string) => (t.length <= ISLAND_LINE_MAX ? t : `${t.slice(0, ISLAND_LINE_MAX - 1).trimEnd()}…`);
const waiting = (m: Model) => !!need(m) && need(m)!.tab === "now" && (m.approvals.length > 0 || !!m.agentsAsk || !!m.stuck || !!m.paused || !!m.plan);

/** A mark beside the notch (the island a little wider) only when the person should look: a question waits, Companion is
 *  listening, or something just finished. Never just because work is going on. */
export function islandAlert(m: Model): boolean {
  if (!m.runnerUp) return false;
  if (waiting(m)) return true;
  const v = visualState(m);
  return v === "needsYou" || v === "listening" || v === "done";
}

/** The pill's one word, short enough for it. */
export function islandWord(m: Model): string {
  if (waiting(m)) return stateLabel("needsYou");
  const v = visualState(m);
  return v === "error" ? S.islandWordError : stateLabel(v);
}

/** The one line shown when the pointer is on the island. */
export function islandLine(m: Model): string {
  if (!m.runnerUp) return S.islandOff;
  if (m.voice?.stage === "listening") return S.islandListening;
  if (m.approvals.length) return cut(S.islandNeedsYou(m.approvals[0].title));
  const n = need(m);
  if (waiting(m) && n) return cut(S.islandNeedsYou(n.why));
  // The task's name only while the task itself is what is busy or just done: listening, looking at the screen or a
  // finished ring also show as busy or done, and the last task's name would be wrong for them.
  const v = visualState(m), label = m.task?.label?.trim() ?? "", own = v === m.character;
  if (v === "needsYou") return cut(S.islandNeedsYou(n?.why ?? stateLabel("needsYou")));
  if (v === "done") return cut(own && label ? S.islandDone(label) : stateLabel("done"));
  if (v === "thinking" || v === "working" || v === "checking") return cut(own && label ? S.islandWorkingOn(label) : characterWords(m));
  if (v === "error") return cut(stateLabel("error"));
  return S.islandReady;
}
