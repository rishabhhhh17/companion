// M96, the notch HeyClicky style: small, then it opens out (docs/milestones/M96-heyclicky-notch.md). The founder, 15 Nov 2026,
// on the real M93 hover: "I don't like how it looks, just see how HeyClicky does it", then "it starts small and then when we
// go to settings then it opens up", and "yeah" to the mock. Plain decisions, tested in m96Notch.test.ts; notchChat.tsx and
// card.tsx only draw them.
//
// Three states. At rest: only the hardware notch, nothing drawn. Pointing at the notch: one row grows out of it (the face,
// the hello, one pill; islandPanel.tsx). Opened: a click on the face or the hello, or the ask key, opens Home as a small chat
// out of the notch (island.rs HomeSize::CHAT). Esc, a click elsewhere and Stop everything fold it back; Settings and the
// expand button open it out to all of Home. The chat takes the keys only when the person clicks into its field or pressed
// the ask key (rule 9); at rest and while pointing nothing takes them.
import type { HistoryItem, Model } from "./model.ts";
import { shortClock } from "./clock.ts";
import { S } from "./strings.ts";

// ---------- the size (island.rs HomeSize::CHAT, PANEL_R_NOTCH; pinned on both sides) ----------

/** About 460 by 300 with the notch's own row: 266 under it. Its bottom corners are Home's own shape's (homeShape.ts
 *  OPEN_R, 24): the mock's 26 would need a second corner drawing in the shape, for 2 points. */
export const CHAT = { w: 460, h: 266 } as const;

// ---------- which state shows when ----------

export type NotchView = "rest" | "pointing" | "opened" | "home";
export type NotchEvent = "point" | "leave" | "clickHello" | "askKey" | "pressAction" | "clickNotch" | "esc" | "clickOutside" | "stop" | "expand" | "settings";

/** What shows now, from what the shell says: Home is up (and whether as the small chat), or the pointer rests on the notch. */
export function notchView(s: { pointing: boolean; homeOpen: boolean; chat: boolean }): NotchView {
  if (s.homeOpen) return s.chat ? "opened" : "home";
  return s.pointing ? "pointing" : "rest";
}

/** What an event leads to (the shell's own rules, island.rs and main.rs, written once here so they can be read and tested
 *  together). `smallChat`: the island.smallChat setting (off, the greeting and the ask key open all of Home as before). */
export function notchNext(v: NotchView, e: NotchEvent, o: { smallChat: boolean } = { smallChat: true }): NotchView {
  // Stop everything puts everything away at once: Home (and so the chat) closes and the notch is bare again.
  if (e === "stop") return "rest";
  const small: NotchView = o.smallChat ? "opened" : "home";
  switch (v) {
    case "rest":
      if (e === "point") return "pointing";
      if (e === "askKey") return small;
      if (e === "clickNotch") return "home";
      return "rest";
    case "pointing":
      if (e === "leave" || e === "esc" || e === "clickOutside") return "rest";
      if (e === "clickHello" || e === "askKey") return small;
      // The pill opens Home at its place (island_go); a click on the notch's own row opens Home, as always.
      if (e === "pressAction" || e === "clickNotch") return "home";
      return "pointing";
    case "opened":
      if (e === "esc" || e === "clickOutside") return "rest";
      if (e === "expand" || e === "settings") return "home";
      // A chat opened by a click is the person's: the pointer leaving never folds it (only Esc, a click elsewhere, Stop).
      return "opened";
    case "home":
      if (e === "esc" || e === "clickOutside") return "rest";
      return "home";
  }
}

/** Whether the page may take the keyboard: never at rest or while pointing (the island is a panel that cannot take it);
 *  in the chat or Home only after a click into them, or when the ask key opened them (it always took the keys). */
export const takesKeys = (v: NotchView, how: { clickedIn: boolean; askKey: boolean }): boolean =>
  (v === "opened" || v === "home") && (how.clickedIn || how.askKey);

// ---------- the recent news, as chat bubbles ----------

/** `go`: where a press on the bubble opens all of Home (the changes to review, or Now for Claude Code waiting and a failed
 *  check, where Home's own Fix it and the AI tool's question are). Pressing one only opens out: it never starts anything. */
export type Bubble = { key: string; who: "squibby" | "you"; words: string; go?: "review" | "now" };

const sameFolder = (a: string, b: string): boolean => !!a && a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
const timeOf = (h: Pick<HistoryItem, "startedAt" | "endedAt">): number => { const t = Date.parse(h.endedAt ?? h.startedAt ?? ""); return Number.isFinite(t) ? t : 0; };

const projectName = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
/** The field's hint, naming the project an ask goes to (Return starts a task there). */
export const chatAsk = (project: string): string => { const n = projectName(project); return n ? S.m96.chat.askAbout(n) : S.m96.chat.ask; };
/** The project's name for the top row, or "" with none. */
export const chatProject = projectName;

/** What Squibby says about one finished task, from its history row only. */
export function outcome(h: HistoryItem): string {
  const C = S.m96.chat;
  if (h.undone && !h.back) return C.undone;
  if (h.status === "interrupted" || h.status === "stopped") return C.stopped;
  // Only proof says done (rule 14), as the receipt says it: passed, partly checked, failed, or not checked yet.
  if (h.status === "done") return h.proof === "passed" ? C.proven(h.changed) : h.proof === "partial" ? C.partial : h.proof === "failed" ? C.checksFailed : C.unchecked(h.changed);
  if (h.status === "running") return C.working;
  return h.failedCheck ? C.failedCheck(h.failedCheck) : C.notDone;
}

/** How many of the latest tasks the chat shows (each is two bubbles: what was asked, and what came of it). */
export const CHAT_TASKS = 2;
/** The most bubbles at once (what fits the chat at the usual text size under its time line): the newest stay. */
export const CHAT_MAX = 3;

/** The recent news, oldest first, as chat bubbles: the person's asks in their own words, and Squibby's plain answer for each
 *  (from History), the task at work now, then what waits (Claude Code, changes to review), then a hint the ask box gave (a
 *  word is needed, the mic's keys). Only this project's. With nothing to say, one line that invites a question. */
export function chatBubbles(m: Model, project: string, o: { hint?: string | null } = {}): Bubble[] {
  const C = S.m96.chat;
  const out: Bubble[] = [];
  if (!m.runnerUp) return [{ key: "off", who: "squibby", words: C.off }];
  if (m.connected === "none") return [{ key: "ready", who: "squibby", words: C.notReady }];
  const live = m.task && (!m.task.project || sameFolder(m.task.project, project)) ? m.task : null;
  const rows = (project ? m.history : []).filter((h) => h.status !== "running").slice().sort((a, b) => timeOf(a) - timeOf(b)).slice(-CHAT_TASKS);
  for (const h of rows) {
    if (h.label.trim()) out.push({ key: `you:${h.id}`, who: "you", words: h.label.trim() });
    const failed = h.status !== "done" && h.status !== "interrupted" && h.status !== "stopped" && !h.undone && !!h.failedCheck;
    out.push({ key: `sq:${h.id}`, who: "squibby", words: outcome(h), ...(failed ? { go: "now" as const } : {}) });
  }
  if (live) {
    if (live.label.trim()) out.push({ key: `you:live:${live.agent}`, who: "you", words: live.label.trim() });
    out.push({ key: `sq:live:${live.agent}`, who: "squibby", words: C.working });
  }
  if (m.claudeWaiting && sameFolder(m.claudeWaiting.project, project)) out.push({ key: "claude", who: "squibby", words: C.claude, go: "now" });
  const rv = m.review;
  if (rv && rv.stage !== "reviewed" && rv.count > 0 && sameFolder(rv.project, project)) out.push({ key: `review:${rv.batch}`, who: "squibby", words: C.review(rv.count), go: "review" });
  if (o.hint) out.push({ key: "hint", who: "squibby", words: o.hint });
  if (out.length === 0) out.push({ key: "empty", who: "squibby", words: C.empty(projectName(project)) });
  return out.slice(-CHAT_MAX);
}

/** The small time line over the bubbles: the day ("Today", "Yesterday", or the date) and the clock of the newest task, or
 *  null when there is none. */
export function chatWhen(m: Model, project: string, now: number): { day: string; time: string } | null {
  const rows = (project ? m.history : []).filter((h) => h.status !== "running").map(timeOf).filter((t) => t > 0).sort((a, b) => a - b).slice(-1);
  const t = rows[0] ?? (m.task ? now : 0);
  if (!t) return null;
  const d = new Date(t), today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  const day = days <= 0 ? S.m96.chat.today : days === 1 ? S.m96.chat.yesterday : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { day, time: shortClock(d) };
}

// ---------- when the small chat opens out by itself ----------

export type ChatLocal = { onboarded: boolean; vague: boolean; noProject: boolean; handoff: boolean;
  /** Files attached or dropped (Home's chips: the chat has none, and Return would send them unseen). */
  attached: number;
  /** A notice arrived while the chat showed (one from before it opened does not throw it open). */
  freshNotice: boolean;
  /** A result arrived while the chat showed: its receipt, Undo and See proof are Home's. */
  freshResult: boolean };
/** Whether the small chat can hold what is going on. Anything that needs the person's answer or choice on a card of its
 *  own (a question to allow, a plan, a stuck fix, a pause, a sign in, a lesson, the vague ask's choices, which folder, the
 *  hand off, the first run) opens the chat out to all of Home at once, so nothing waits where it cannot be seen. So does
 *  what only Home draws (the M96 review): hold to talk's panel (listening, a model to download, the microphone refused),
 *  a notice or an error, files attached, and a new result with its receipt. The task at work stays in the chat, with its
 *  own Stop (notchChat.tsx). */
export function chatHolds(m: Model, l: ChatLocal): boolean {
  if (!l.onboarded || l.vague || l.noProject || l.handoff) return false;
  if (m.voice || m.error || l.freshNotice || l.attached > 0 || l.freshResult) return false;
  if (m.approvals.length > 0 || m.plan || m.stuck || m.paused || m.costPause || m.signIn || (m.walk && m.walk.stage !== "done" && m.walk.stage !== "stopped")) return false;
  return true;
}
