// M88 (d), spoken status: with voice on (the Voice group and its Speak tool, groups.ts), one short fixed line out loud for
// the moments the person picks in Settings (speak.status, none picked as usual): a fix passed its checks, their AI tool is
// waiting on them, a review says not safe yet, and Watch what changed said beat by beat as it draws. The research's feature
// 9 (synthesis.md section 3; yc-companies.md: Agent FM's spoken updates, "your fix passed its checks" as a cheap win).
// Every line goes through the existing spoken replies path (shell_speech.rs speak), which says nothing during a call
// (presentation.rs), while hold to talk listens or into a Mac whose sound is off, shows the words on screen while it speaks
// (talk.captions) and is silenced by Stop everything. The status lines are fixed words only (strings.ts), never anything from
// a task or a review; the replay's beats are its own checked sentences (replay.ts replayOf), and the shell still refuses
// anything secret looking. Each moment is said once; a moment that goes away may be said again later.
import { lineMs } from "./sequence.ts";
import type { Model } from "./model.ts";
import { replayTimes, type ReplayView } from "./replay.ts";
import { S } from "./strings.ts";

export const STATUS_MOMENTS = ["fixPassed", "toolWaiting", "notSafe", "replay"] as const;
export type StatusMoment = (typeof STATUS_MOMENTS)[number];

/** The moments chosen in Settings, as a clean list (anything else is dropped). */
export const momentsOf = (v: unknown): StatusMoment[] => (Array.isArray(v) ? STATUS_MOMENTS.filter((m) => v.includes(m)) : []);
/** Whether a moment is said at all: voice on and the moment chosen. */
export const statusSays = (moment: StatusMoment, chosen: unknown, voiceOn: boolean): boolean => voiceOn && momentsOf(chosen).includes(moment);

export type StatusLine = { key: string; text: string; moment: StatusMoment };
/** The status lines for what is on Home now, for the open project, each with a key so it is said once. */
export function statusLines(m: Model, project: string, chosen: unknown): StatusLine[] {
  const on = momentsOf(chosen), out: StatusLine[] = [];
  const here = (p: unknown) => typeof p === "string" && p.replace(/\/+$/, "") === project.replace(/\/+$/, "");
  // A fix passed its checks: the task really ended done, its proof passed, and it was not put back.
  const r = m.receipt;
  if (on.includes("fixPassed") && r?.checkpoint && r.proof === "passed" && !r.undone && m.task && m.agents[m.task.agent] === "done") {
    out.push({ key: `status:fix:${project}:${r.checkpoint}`, text: S.m88.status.fixPassed, moment: "fixPassed" });
  }
  // The person's AI tool is waiting on them (today only Claude Code has the waiting hook, M80).
  if (on.includes("toolWaiting") && m.claudeWaiting && here(m.claudeWaiting.project)) {
    out.push({ key: `status:waiting:${project}`, text: S.m88.status.toolWaiting(S.doneSignal.tool.claude), moment: "toolWaiting" });
  }
  // A review says not safe yet.
  const rv = m.review;
  if (on.includes("notSafe") && rv && here(rv.project) && rv.result?.rating === "stop") {
    out.push({ key: `status:review:${project}:${rv.batch}`, text: S.m88.status.notSafe, moment: "notSafe" });
  }
  return out;
}

/** The lines to say now, in order, and what counts as said from now on: the keys on Home now, so a moment that went away
 *  (the tool stopped waiting) can be said again when it comes back. Every new line is said (the page joins them into one
 *  utterance, since a new line cuts off the one before), so none is ever marked said without being said. `quiet`: voice
 *  off, or Stop everything just now: nothing is said and everything on Home counts as said, so nothing already there is
 *  ever said late. */
export function nextStatus(lines: StatusLine[], said: ReadonlySet<string>, quiet: boolean): { say: StatusLine[]; said: Set<string> } {
  const now = new Set(lines.map((l) => l.key));
  if (quiet) return { say: [], said: now };
  return { say: lines.filter((l) => !said.has(l.key)), said: now };
}

/** What the lines are about: the open project and the moments chosen. When it changes (a moment newly chosen, another
 *  project opened, or the page just opened), what is already on Home counts as said, so only what comes after is said. */
export const statusContext = (project: string, chosen: unknown): string => `${project.replace(/\/+$/, "")}|${momentsOf(chosen).join(",")}`;
export type StatusState = { said: Set<string>; ctx: string };
export function statusStep(lines: StatusLine[], prev: StatusState, ctx: string, quiet: boolean): { say: StatusLine[]; state: StatusState } {
  const n = nextStatus(lines, prev.said, quiet || prev.ctx !== ctx);
  return { say: n.say, state: { said: n.said, ctx } };
}

/** Watch what changed, said out loud: each beat starts when the last one's words have been said at the voice's speed, and
 *  never sooner than the drawing alone would take, so the pen and the voice keep together. */
export function spokenReplayTimes(r: ReplayView, speed: unknown, voiceSpeed: number): { at: number; dur: number }[] {
  let at = 0;
  return replayTimes(r, speed).map((t, i) => {
    const dur = Math.max(t.dur, lineMs(r.beats[i].say, true, voiceSpeed));
    const out = { at, dur };
    at += dur;
    return out;
  });
}
