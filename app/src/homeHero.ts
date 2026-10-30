// Home as one black panel that springs down out of the notch (27 Oct 2026, the founder: "this needs to be fun"). What its top
// says in big words, which round buttons it has, and when Undo and Stop show. Plain code, tested in homeHero.test.ts;
// card.tsx only draws what this decides. Fun comes from the motion, the size and the character, never from the words (rule 16).
import { activityNow, cardWorking, characterWords, costWords, formatUsd, receiptVerdict, type Model } from "./model.ts";
import type { Tone } from "./verdict.ts";
import { need, type Need, type Tab } from "./home.ts";
import { S } from "./strings.ts";

/** The places a round button at the top opens inside Home, each with a back arrow. Now is Home itself; Settings has its
 *  own window (the gear), so it is never one of them. */
export const HOME_PLACES: readonly Tab[] = ["did", "learn", "memory"];

/** A round button pressed twice goes back to Now, as the back arrow does. */
export const placeAfter = (open: Tab, pressed: Tab): Tab => (pressed === open ? "now" : pressed);

/** What the top of Home says: the job in big words and one short line under it. `tone` names the state for the page.
 *  detail: after a result, the verdict's own sentence (M45), drawn muted under the line. */
export type HeroTone = "idle" | "working" | "needsYou" | "done" | "notDone" | "partly" | "plain";
export type Hero = { headline: string; line: string; detail?: string; tone: HeroTone };

/** The verdict's tone as the page's (M45, mapped here once, never in a surface): only a proven fix is "done" (green). */
const HERO_TONE: Record<Tone, HeroTone> = { good: "done", bad: "notDone", mixed: "partly", plain: "plain", ask: "needsYou" };
/** A task's name as it starts a line: its first letter capital. */
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const folderLine = (project: string): string => {
  const name = project.split("/").filter(Boolean).at(-1);
  return name ? S.look.inFolder(name) : S.look.noFolder;
};

export function heroWords(m: Model, project: string, n: Need | null = need(m)): Hero {
  // A question waits for the person: it is the job now, and it is drawn just below.
  if (n?.question) return { headline: n.why, line: S.look.below, tone: "needsYou" };
  if (cardWorking(m)) {
    const label = m.task?.label || characterWords(m);
    const now = activityNow(m, 1)[0]?.words;
    return { headline: label, line: m.task ? (m.task.costUsd > 0 ? S.look.working(formatUsd(m.task.costUsd)) : S.look.workingFree) : now ?? characterWords(m), tone: "working" };
  }
  // Something else waits for a look (a problem found, Prompt help, the error explainer, a pointer): its own words.
  if (n) return { headline: n.why, line: characterWords(m), tone: "needsYou" };
  // An answer from Look it up or Rescue: its name, and that it is just below.
  if (m.research) return { headline: m.research.title, line: S.look.answerBelow, tone: "done" };
  if (m.rescue) return { headline: S.rescueTitle, line: S.look.answerBelow, tone: "done" };
  // A result: the verdict in big words, then what was asked and what it cost, then the verdict's own sentence (M45).
  if (m.receipt && m.task) {
    const v = receiptVerdict(m)!;
    const what = title(m.task.label || characterWords(m));
    return { headline: v.headline, line: S.look.doneLine(what, costWords(m.receipt.usdEstimate)), ...(v.line ? { detail: v.line } : {}), tone: HERO_TONE[v.tone] };
  }
  return { headline: S.look.idleHeadline, line: folderLine(project), tone: "idle" };
}

/** Undo shows only when the result offers it (the last task changed files, and no Undo put them back since, unless they
 *  were brought back), nothing is being undone, and a folder is open (M45: the verdict's offer, so an Undo of one task from
 *  "which task broke it" hides it too). */
export const undoCan = (m: Model, project: string): boolean => receiptVerdict(m)?.offer === "undo" && (!m.undo || broughtBackIdle(m)) && !!project;
/** Bring back left some files as the person changed them, and its line (with Put those back too) is still up: nothing runs,
 *  so Undo may show again. */
const broughtBackIdle = (m: Model): boolean => !!m.undo && m.undo.back === true && m.undo.stage === "done" && m.undo.putBack !== "confirm" && m.undo.putBack !== "working";

/** Bring the fix back shows after an Undo whose safety copy is known, with a folder open and nothing at work. While the
 *  Undo's own "Undone." line is up it may show too (that is where it belongs); never while another undo is asked or runs. */
export const bringBackCan = (m: Model, project: string): boolean =>
  receiptVerdict(m)?.offer === "bringBack" && (!m.undo || (m.undo.stage === "done" && !m.undo.back && m.undo.putBack !== "confirm" && m.undo.putBack !== "working")) && !!project && !cardWorking(m);

/** Stop shows only while something works (not while a finished task waits for an answer: nothing runs then). */
export const stopCan = (m: Model): boolean => cardWorking(m);

/** The gear: Settings in its own window. Until the app has that window (or if it cannot open it), Settings opens inside
 *  Home as before, so the gear never does nothing. */
export function openSettings(invoke: (cmd: string) => Promise<unknown>, inHome: () => void): Promise<void> {
  return invoke("open_settings_window").then(() => undefined, () => inHome());
}
