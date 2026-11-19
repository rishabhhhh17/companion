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
export type NotchEvent = "point" | "leave" | "clickHello" | "askKey" | "pressAction" | "clickNotch" | "esc" | "clickOutside" | "stop" | "expand" | "settings" | "close";

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
      // Founder round 1 (17 Nov 2026, "when I open the chat, I cannot close it fully"): its own Close, and a second click on
      // the notch (main.rs island_click), fold it back too. Pointing never opens the chat, so that click never meant to open.
      if (e === "esc" || e === "clickOutside" || e === "close" || e === "clickNotch") return "rest";
      if (e === "expand" || e === "settings") return "home";
      // A chat opened by a click is the person's: the pointer leaving never folds it (only Esc, a click elsewhere, Stop).
      return "opened";
    case "home":
      if (e === "esc" || e === "clickOutside" || e === "close") return "rest";
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
export type Bubble = { key: string; who: "squibby" | "you"; words: string; go?: "review" | "now";
  /** Feel round 2: the first bubble of a day's tasks carries that day's time line (when its first task was asked). */
  when?: { day: string; time: string };
  /** Feel round 2: a reply that failed gets a Fix it pill under it (it only opens Home on Now, where Fix it is). */
  fix?: true };

const sameFolder = (a: string, b: string): boolean => !!a && a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
/** When it was asked: the chat lists asks in that order (round 1: an ask that ended later never jumps over a newer one). */
const askedAt = (h: Pick<HistoryItem, "startedAt" | "endedAt">): number => { const t = Date.parse(h.startedAt ?? h.endedAt ?? ""); return Number.isFinite(t) ? t : 0; };

/** M112 (the founder's glitch, 16 Nov 2026): the longest project name the chat shows, in its top row and in the field's hint.
 *  A longer one is cut at a word where it can be, with an ellipsis, so it never wraps or runs past the shape. */
export const CHAT_NAME_MAX = 28;
const shorten = (n: string, max = CHAT_NAME_MAX): string => {
  if (n.length <= max) return n;
  const cut = n.slice(0, max - 1), sp = cut.lastIndexOf(" ");
  return `${(sp >= max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
};
/** M112 review: the top row has more room than the field's hint (shot 3f), so it keeps more of the name; a longer one still
 *  wraps inside the row at a bigger text size, never cut by the window. */
export const CHAT_ROW_MAX = 40;
/** The project's whole name, or "" with none: the top row's tooltip and what VoiceOver says, so the full name can always
 *  be read (M112 review: it was the shortened one). */
export const chatProject = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
/** The name as the top row shows it: up to CHAT_ROW_MAX letters. */
export const chatRowProject = (project: string): string => shorten(chatProject(project), CHAT_ROW_MAX);
/** Round 2 (the top row grew to three lines with a long name): the longest shortening of the name, up to CHAT_ROW_MAX
 *  letters, that `fits` the room the row has left, or "" when not even a few letters fit (its full name stays in the
 *  tooltip and for VoiceOver). The row stays one line without cutting words off at bigger text sizes: the room is
 *  measured at the text size in force. */
export const ROW_PROJECT_MIN = 4;
export const fitRowProject = (project: string, fits: (shown: string) => boolean): string => {
  const name = chatProject(project);
  for (let k = Math.min(CHAT_ROW_MAX, name.length); k >= ROW_PROJECT_MIN; k--) { const s = shorten(name, k); if (fits(s)) return s; }
  return "";
};
/** The name shortened to CHAT_NAME_MAX letters, for the field's hint and Squibby's own words. */
export const chatShortProject = (project: string): string => shorten(chatProject(project));
const projectName = chatShortProject;
/** The field's hint, naming the project an ask goes to (Return starts a task there). */
export const chatAsk = (project: string): string => { const n = projectName(project); return n ? S.m96.chat.askAbout(n) : S.m96.chat.ask; };
/** The field's spoken name: the same, with the whole name. */
export const chatAskFull = (project: string): string => { const n = chatProject(project); return n ? S.m96.chat.askAbout(n) : S.m96.chat.ask; };

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

/** How many of the latest tasks the chat shows (each is two bubbles: what was asked, and what came of it). Feel round 2
 *  (19 Nov 2026): it showed only the newest and left empty dots above it. Now the recent thread, oldest at the top,
 *  scrolled to the newest at the foot, as a chat is. */
export const CHAT_TASKS = 6;
/** The most bubbles at once. Tasks are cut whole: the newest task always shows, with what waits; an older one only while
 *  all of it fits. The list scrolls; older work is in Home's History. */
export const CHAT_MAX = 14;
/** Feel round 3: a quiet time line goes over an ask asked more than this long after the one before it. */
export const CHAT_GAP_MS = 30 * 60_000;

/** The task at work, if it still runs: started and not yet answered by its receipt or its History row (round 1: the chat
 *  said Working on it under a task that had finished, and said its ask twice). */
function liveTask(m: Model): Model["task"] {
  const t = m.task;
  if (!t || m.receipt) return null;
  if (t.checkpoint && m.history.some((h) => h.checkpoint === t.checkpoint && h.status !== "running")) return null;
  return t;
}
/** One task's bubbles share a key with its History row (by its checkpoint when it has one), so the words do not animate in
 *  again when the task at work becomes that row. */
const keyOf = (id: string | number, checkpoint?: string | null): string => (checkpoint ? `cp:${checkpoint}` : String(id));

/** The finished tasks the chat may show, oldest asked first. */
function chatRows(m: Model, project: string, live: Model["task"]): HistoryItem[] {
  return (project ? m.history : []).filter((h) => h.status !== "running" && !(live?.checkpoint && h.checkpoint === live.checkpoint))
    .slice().sort((a, b) => askedAt(a) - askedAt(b)).slice(-CHAT_TASKS);
}

/** The day and the clock of a time, as the chat's time line says it. */
function whenOf(t: number, now: number): { day: string; time: string } {
  const d = new Date(t), today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  const day = days <= 0 ? S.m96.chat.today : days === 1 ? S.m96.chat.yesterday : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { day, time: shortClock(d) };
}

/** The tasks shown and their bubbles: the newest task always, older ones only while all their bubbles fit with `tail`. */
function chatTasks(m: Model, project: string, tail: number): { rows: HistoryItem[]; live: Model["task"]; bubbles: Bubble[] } {
  const C = S.m96.chat;
  const t = liveTask(m);
  const live = t && (!t.project || sameFolder(t.project, project)) ? t : null;
  const groups: { row: HistoryItem | null; b: Bubble[] }[] = chatRows(m, project, live).map((h) => {
    const k = keyOf(h.id, h.checkpoint), b: Bubble[] = [];
    if (h.label.trim()) b.push({ key: `you:${k}`, who: "you", words: h.label.trim() });
    const failed = h.status !== "done" && h.status !== "interrupted" && h.status !== "stopped" && !h.undone && !!h.failedCheck;
    b.push({ key: `sq:${k}`, who: "squibby", words: outcome(h), ...(failed ? { go: "now" as const, fix: true as const } : {}) });
    return { row: h, b };
  });
  if (live) {
    const k = keyOf(`live:${live.agent}`, live.checkpoint), b: Bubble[] = [];
    if (live.label.trim()) b.push({ key: `you:${k}`, who: "you", words: live.label.trim() });
    b.push({ key: `sq:${k}`, who: "squibby", words: C.working });
    groups.push({ row: null, b });
  }
  const kept: typeof groups = [];
  let n = tail;
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (kept.length > 0 && n + g.b.length > CHAT_MAX) break;
    kept.unshift(g); n += g.b.length;
  }
  return { rows: kept.flatMap((g) => (g.row ? [g.row] : [])), live, bubbles: kept.flatMap((g) => g.b) };
}

/** The recent news, oldest first, as chat bubbles: the person's asks in their own words, and Squibby's plain answer for each
 *  (from History), the task at work now, then what waits (Claude Code, changes to review), then a hint the ask box gave (a
 *  word is needed, the mic's keys). Only this project's, but a task at work in another project is named, so the chat's Stop
 *  and its greyed Send have a reason. With nothing to say, one line that invites a question. */
export function chatBubbles(m: Model, project: string, o: { hint?: string | null; now?: number } = {}): Bubble[] {
  const C = S.m96.chat;
  if (!m.runnerUp) return [{ key: "off", who: "squibby", words: C.off }];
  if (m.connected === "none") return [{ key: "ready", who: "squibby", words: C.notReady }];
  const tail: Bubble[] = [];
  const t = liveTask(m);
  // A task at work in another folder: the one Home shows (m.task), or one the engine runs there (m.away, with its agent busy).
  const away = Object.entries(m.away ?? {}).find(([a, p]) => ["thinking", "working", "checking"].includes(m.agents[a] ?? "") && !sameFolder(p, project));
  const elsewhere = t?.project && !sameFolder(t.project, project) ? { agent: t.agent, project: t.project } : away ? { agent: away[0], project: away[1] } : null;
  if (elsewhere) tail.push({ key: `elsewhere:${elsewhere.agent}`, who: "squibby", words: C.workingIn(chatShortProject(elsewhere.project)), go: "now" });
  if (m.claudeWaiting && sameFolder(m.claudeWaiting.project, project)) tail.push({ key: "claude", who: "squibby", words: C.claude, go: "now" });
  const rv = m.review;
  if (rv && rv.stage !== "reviewed" && rv.count > 0 && sameFolder(rv.project, project)) tail.push({ key: `review:${rv.batch}`, who: "squibby", words: C.review(rv.count), go: "review" });
  if (o.hint) tail.push({ key: "hint", who: "squibby", words: o.hint });
  const shown = chatTasks(m, project, tail.length);
  // Feel round 2: each day's tasks under their own time line, from when the first of them was asked (never the time the
  // chat was opened). Feel round 3 (19 Nov 2026): also wherever more than CHAT_GAP_MS passed since the ask before, so an
  // hour old answer never reads as if it came just before the newest one.
  if (o.now !== undefined) {
    let lastDay = "", lastAt = 0;
    for (const r of shown.rows) {
      const t = askedAt(r);
      if (!t) continue;
      const w = whenOf(t, o.now), first = shown.bubbles.find((b) => b.key === `you:${keyOf(r.id, r.checkpoint)}` || b.key === `sq:${keyOf(r.id, r.checkpoint)}`);
      if (first && (w.day !== lastDay || t - lastAt > CHAT_GAP_MS)) first.when = w;
      lastDay = w.day; lastAt = t;
    }
  }
  const out = [...shown.bubbles, ...tail];
  if (out.length === 0) out.push({ key: "empty", who: "squibby", words: C.empty(projectName(project)) });
  return out;
}

/** The small time line over the bubbles: the day ("Today", "Yesterday", or the date) and the clock of the oldest task shown
 *  (it sits over that task's ask), or now for the task at work alone; null when there is none. */
export function chatWhen(m: Model, project: string, now: number, o: { hint?: string | null } = {}): { day: string; time: string } | null {
  const tail = chatBubbles(m, project, o).filter((b) => !b.key.startsWith("you:") && !b.key.startsWith("sq:")).length;
  const shown = chatTasks(m, project, tail);
  // Feel round 2: when the oldest task shown was asked, not when it ended.
  const first = shown.rows.map(askedAt).find((x) => x > 0);
  const t = first ?? (shown.live || m.task ? now : 0);
  if (!t) return null;
  return whenOf(t, now);
}

/** May a click elsewhere fold the small chat? Always with Close Home when I click another app on (`on`): nothing in the chat
 *  waits for a tap, since chatHolds opens it out to all of Home for anything that does. Only words being typed in its field
 *  (`typing`, the field has the keys) keep it. */
export const chatClosesAway = (on: boolean, typing: boolean): boolean => on && !typing;

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
