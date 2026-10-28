// Home as one black panel that springs down out of the notch (27 Oct 2026, the founder: "this needs to be fun"). What its top
// says in big words, which round buttons it has, and when Undo and Stop show. Plain code, tested in homeHero.test.ts;
// card.tsx only draws what this decides. Fun comes from the motion, the size and the character, never from the words (rule 16).
import { activityNow, cardWorking, characterWords, formatUsd, receiptProofWords, type Model } from "./model.ts";
import { need, type Need, type Tab } from "./home.ts";
import { S } from "./strings.ts";

/** The places a round button at the top opens inside Home, each with a back arrow. Now is Home itself; Settings has its
 *  own window (the gear), so it is never one of them. */
export const HOME_PLACES: readonly Tab[] = ["did", "learn", "memory"];

/** A round button pressed twice goes back to Now, as the back arrow does. */
export const placeAfter = (open: Tab, pressed: Tab): Tab => (pressed === open ? "now" : pressed);

/** What the top of Home says: the job in big words and one short line under it. `tone` names the state for the page. */
export type Hero = { headline: string; line: string; tone: "idle" | "working" | "needsYou" | "done" | "notDone" };

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
  if (m.receipt && m.task) {
    const failed = m.receipt.proof === "failed";
    return { headline: m.task.label || characterWords(m), line: S.look.doneLine(receiptProofWords(m), formatUsd(m.receipt.usdEstimate)), tone: failed ? "notDone" : "done" };
  }
  return { headline: S.look.idleHeadline, line: folderLine(project), tone: "idle" };
}

/** Undo shows only when the last task changed files, nothing is being undone or was undone, and a folder is open: the same
 *  condition the old strip's Undo was pressable on. */
export const undoCan = (m: Model, project: string): boolean => !!(m.receipt && m.receipt.changed.length > 0 && !m.undo && project);

/** Stop shows only while something works (not while a finished task waits for an answer: nothing runs then). */
export const stopCan = (m: Model): boolean => cardWorking(m);

/** The gear: Settings in its own window. Until the app has that window (or if it cannot open it), Settings opens inside
 *  Home as before, so the gear never does nothing. */
export function openSettings(invoke: (cmd: string) => Promise<unknown>, inHome: () => void): Promise<void> {
  return invoke("open_settings_window").then(() => undefined, () => inHome());
}
