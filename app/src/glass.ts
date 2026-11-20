// GLASS (the founder, 19 Nov 2026: "the liquid glass looks so very good. Also, the menu bar, I think you need to change it
// and make it better"). Plain decisions with no page, tested in glass.test.ts: the material (Glass, the usual, or Before),
// the one line greeting beside the notch, the menu bar popover's rows and its dot, and the contrast measure that keeps the
// glass words at 4.5 to 1 over a white wallpaper. Every word comes from strings.ts; every fact from the page's own model
// (never the lab's made up text or items).
import type { Model } from "./model.ts";
import { cardWorking } from "./model.ts";
import { helloFact } from "./notchHello.ts";
import { homeStatus } from "./homeHero.ts";
import { statusWords } from "./homeLayout.ts";
import type { PlanStatus, Usage } from "./plan.ts";
import { S } from "./strings.ts";

export { MATERIALS, materialOf, type Material } from "./lookfeel.ts";

export type DayPart = keyof typeof S.glass.part;
/** The part of the day by the Mac's own hour: morning 5 to 11, afternoon 12 to 16, evening the rest. */
export function partOfDay(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

const projectOf = (m: Model): string => m.task?.project ?? m.folder ?? "";
const nameOf = (project: string): string => project.split("/").filter(Boolean).at(-1) ?? "";
const working = (m: Model): boolean => cardWorking(m) && !!m.task;

/** The most of a task's own name the strip and the popover show (the GLASS review: a long name wrapped to three lines and
 *  pushed the popover down). Cut in words, never hidden by CSS: Home's page never hides overflow (bigger text). */
export const LABEL_MAX = 48;
/** `words` cut at the last whole word that fits in `max` characters, with an ellipsis; a single long word is cut inside. */
export function clipWords(words: string, max: number = LABEL_MAX): string {
  if (words.length <= max) return words;
  const room = words.slice(0, max - 1);
  const at = words[max - 1] === " " ? room.length : room.lastIndexOf(" ");
  return `${(at > 0 ? room.slice(0, at) : room).replace(/[\s,;:.]+$/, "")}…`;
}

export type Doing = { words: string; tone: "working" | "needsYou" | "calm" | "off" };
/** What Squibby is doing now, in a few words: starting, the work running by its own name, the one fact that needs the
 *  person (questions, changes to review, a failing check), or Nothing needs you. */
export function doingNow(m: Model, now: number, o: { whole?: boolean } = {}): Doing {
  // Until the engine has said hello (just opened, or it is down) nothing is known, so nothing is claimed.
  if (!m.runnerUp || !m.helloSeen) return { words: S.glass.starting, tone: "off" };
  // A question waiting comes before the work it holds up: the work is paused on the person's answer.
  if (m.approvals.length > 0) return { words: S.hello.questions(m.approvals.length), tone: "needsYou" };
  if (working(m)) return { words: S.glass.workingOn(o.whole ? m.task!.label : clipWords(m.task!.label)), tone: "working" };
  const fact = helloFact(m, now);
  // "Everything checked is fine" is good news, not a call: it reads as calm, and never lights the dot.
  if (fact && fact !== S.hello.allFine) return { words: fact, tone: "needsYou" };
  return { words: S.glass.nothing, tone: "calm" };
}

/** The greeting beside the notch: the part of the day, then what is true now. "Evening. Nothing needs you." */
export function glassGreeting(m: Model, now: number, hour: number): string {
  return `${S.glass.part[partOfDay(hour)]}. ${doingNow(m, now).words}.`;
}
/** The same greeting with the task's whole name: the strip's tooltip and what VoiceOver reads. */
export function glassGreetingWhole(m: Model, now: number, hour: number): string {
  return `${S.glass.part[partOfDay(hour)]}. ${doingNow(m, now, { whole: true }).words}.`;
}

/** The menu bar's dot: something needs the person (a question waiting, changes to review, a failing check). */
export const trayNeeds = (m: Model, now: number = Date.now()): boolean => doingNow(m, now).tone === "needsYou";

/** The popover's quick actions with a project open. Each says Home's own word for the tool it starts (TRAY_TOOL), and the
 *  shell starts exactly that tool (shell_traypop.rs tray_do): Check my project is Find the problem, Check before going live
 *  is the check before going live. With no project, Choose a project leads instead (trayView). */
export const TRAY_ACTIONS = ["check", "shipCheck", "open"] as const;
export type TrayAction = (typeof TRAY_ACTIONS)[number] | "pick";
export const TRAY_TOOL = { check: "check", shipCheck: "shipCheck" } as const satisfies Partial<Record<TrayAction, keyof typeof S.home.main>>;
/** The words on an action's button: Home's word for its tool, or the popover's own for Open. */
export function trayActionWord(a: TrayAction): string {
  if (a === "open") return S.glass.actions.open;
  if (a === "pick") return S.home.main.folder;
  return S.home.main[TRAY_TOOL[a]];
}

export type TrayView = {
  doing: Doing;
  project: { name: string; path: string } | null;
  check: { words: string; kind: string } | null;
  plan: string | null;
  dot: boolean;
  /** The top line with the task's whole name, for the tooltip and VoiceOver. */
  whole: string;
  /** The buttons in order; exactly one is filled. */
  actions: { id: TrayAction; primary: boolean }[];
  /** Where a press on the top line goes: Now (a question, the work running, a failing check), the review of changes, or
   *  nowhere (calm, or nothing known yet), when it is no button. */
  go: "now" | "review" | null;
};
/** The popover's rows. The plan line shows only while payments are on (the shell's plan status); hidden otherwise. */
export function trayView(m: Model, now: number, plan: PlanStatus, usage: Usage | null): TrayView {
  const doing = doingNow(m, now);
  const path = projectOf(m);
  const name = nameOf(path);
  let check: TrayView["check"] = null;
  if (name) {
    const s = homeStatus(m, path, now);
    const words = statusWords({ kind: s.kind, ago: s.ago, working: false });
    if (words && s.kind !== "unchecked" && s.kind !== "noProject") check = { words, kind: s.kind };
  }
  let planLine: string | null = null;
  if (plan.paymentsOn) {
    if (plan.plan === "pro") planLine = S.glass.planPro;
    else planLine = usage ? S.glass.planFree(Math.max(0, usage.limit - usage.used), usage.limit) : S.glass.planFreeOnly;
  }
  const actions: TrayView["actions"] = name
    ? TRAY_ACTIONS.map((id, i) => ({ id, primary: i === 0 }))
    : [{ id: "pick", primary: true }, { id: "open", primary: false }];
  const rv = m.review;
  const reviewing = m.approvals.length === 0 && !working(m) && !!rv && rv.stage !== "reviewed" && rv.count > 0;
  const go: TrayView["go"] = doing.tone === "working" ? "now" : doing.tone === "needsYou" ? (reviewing ? "review" : "now") : null;
  return { doing, project: name ? { name, path } : null, check, plan: planLine, dot: doing.tone === "needsYou", whole: doingNow(m, now, { whole: true }).words, actions, go };
}

// ---------- contrast (WCAG 2.x relative luminance), measured from tokens.css ----------
export type Rgba = { r: number; g: number; b: number; a: number };
/** "#RRGGBB", "#RGB" or "rgba(r, g, b, a)" / "rgb(r, g, b)". */
export function parseColour(s: string): Rgba {
  const t = s.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(t);
  if (!fn) throw new Error(`not a colour: ${s}`);
  const [r, g, b, a] = fn[1].split(",").map((x) => Number(x.trim()));
  return { r, g, b, a: a ?? 1 };
}
/** `top` drawn over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (f: number, b: number) => Math.round(f * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}
const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c: Rgba) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** The glass tokens as written in tokens.css (its :root block), for the contrast tests. */
export function glassTokens(css: string): { tint: string; ink: string; ink2: string; ink3: string; raised: string; focus: string } {
  const get = (k: string): string => {
    const m = new RegExp(`${k}:\\s*([^;]+);`).exec(css);
    if (!m) throw new Error(`no ${k} in tokens.css`);
    const v = m[1].trim();
    const ref = /^var\((--[\w-]+)\)$/.exec(v);
    return ref ? get(ref[1]) : v;
  };
  return { tint: get("--mat-tint"), ink: get("--mat-ink"), ink2: get("--mat-ink-2"), ink3: get("--mat-ink-3"), raised: get("--mat-raised"), focus: get("--mat-focus") };
}

/** The tabs' own keys (a real tablist, roving focus): the tab an arrow, Home or End moves to, or null for any other key.
 *  From a place that is not a tab (Settings) an arrow lands on the first. */
export function tabStep<T extends string>(list: readonly T[], current: string, key: string): T | null {
  if (list.length === 0) return null;
  const i = list.indexOf(current as T);
  switch (key) {
    case "ArrowRight": return i < 0 ? list[0] : list[(i + 1) % list.length];
    case "ArrowLeft": return i < 0 ? list[0] : list[(i - 1 + list.length) % list.length];
    case "Home": return list[0];
    case "End": return list[list.length - 1];
    default: return null;
  }
}
