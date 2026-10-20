// Everyday stuck moments: the hero key works in any app, not only in a project. With no project, or with an app in front
// that is not a code tool, the key looks at the screen once (Show me's own look: light first, secrets covered, nothing
// kept), names the problem in two plain sentences, walks the person through the fix in that app (anywhere mode, the usual
// pointing rules, Your turn, Do it for me only for plain labelled buttons), looks again only on a press, and says fixed
// only when the error the first look read on the screen is no longer read and the look agrees; a look's own yes is only a
// guess, so the person is asked. Plain code, tested in everyday.test.ts; card.tsx draws what this decides.
import { nextQuestion, type Walk } from "./anywhere.ts";
import type { Explain } from "./model.ts";

/** The kind of app in front when the key was pressed: all the shell tells the page (everyday.rs), never its id. */
export type Front = "code" | "browser" | "other" | "own" | "unknown";
const FRONTS: readonly string[] = ["code", "browser", "other", "own", "unknown"];
export const frontOf = (payload: unknown): Front => {
  const f = (payload as { front?: unknown } | null)?.front;
  return typeof f === "string" && FRONTS.includes(f) ? (f as Front) : "unknown";
};

/** project: check the project as before. screen: the everyday look. noProject: today's "choose your folder first".
 *  With a project chosen, a browser keeps the project check, since the project's own page or its builder (Lovable, Bolt)
 *  is often what is in front; a check that finds nothing offers Look at my screen. A practice copy keeps it too (its own
 *  Find is what the key is for, whatever app is in front). */
export type HeroRoute = "project" | "screen" | "noProject";
export function heroRoute(o: { everyday: unknown; project: string; front: unknown; practice?: boolean }): HeroRoute {
  if (o.everyday === false) return o.project ? "project" : "noProject";
  if (!o.project) return "screen";
  if (o.practice) return "project";
  return o.front === "other" ? "screen" : "project";
}

/** looking: the first look is on its way. found: a problem is named. none: nothing looked wrong. checking: a look again.
 *  fixed: the error the first look read is no longer read, and the look agrees. still: it is still there. ask: the person
 *  is asked (ask says why: "looks", only the look thinks it is gone; "stillRead", the code is still read though the look
 *  thinks it is gone; none, the look could not tell). saidWorks: the person said it works (never called fixed).
 *  code: the spreadsheet error code the first look read on the screen; a look again carries it back (before). */
export type EverydayStage = "looking" | "found" | "none" | "checking" | "fixed" | "still" | "ask" | "saidWorks";
export type Everyday = {
  stage: EverydayStage; req?: string; problem: string; kind?: string; code?: string; why: string[];
  question?: { text: string; options: string[]; correct: number }; fixes?: string[]; fromTable?: boolean; prev?: EverydayStage;
  ask?: "looks" | "stillRead";
};
const WAITING: readonly EverydayStage[] = ["looking", "checking"];
const SHOWME_FAILED = ["error", "needs_permission", "window_changed"];
type Ev = Record<string, any> & { type?: string };
const words = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3) : []);
const back = (e: Everyday): Everyday | null => (e.stage === "checking" ? { ...e, stage: e.prev ?? "found", prev: undefined } : null);

/** The everyday state after an event. showReq: the Show me look waiting now (its own req), the only one whose answer counts. */
export function everydayReduce(e: Everyday | null, ev: Ev, showReq: string | undefined): Everyday | null {
  switch (ev.type) {
    case "ui.everydayLook":
      if (ev.mode === "recheck") return e && !WAITING.includes(e.stage) ? { ...e, stage: "checking", prev: e.stage } : e;
      return { stage: "looking", problem: "", why: [] };
    case "ui.everydayClosed": case "app.stop_everything": return null;
    case "ui.everydaySaid": return e?.stage === "ask" ? { ...e, stage: ev.worked === true ? "saidWorks" : "still" } : e;
    case "assist.error": {
      const req = String(ev.req ?? "");
      return e && WAITING.includes(e.stage) && showReq && (req === showReq || req.startsWith(`${showReq}-`)) && ev.reason !== "cancelled" ? back(e) : e;
    }
    case "assist.problem": {
      if (!e || !WAITING.includes(e.stage) || !showReq || ev.req !== showReq) return e;
      const said = typeof ev.problem === "string" && ev.problem.trim() ? ev.problem.trim() : "";
      if (ev.mode === "recheck") {
        if (e.stage !== "checking") return e;
        const was: Everyday = { ...e, prev: undefined, ask: undefined, req: ev.req as string };
        if (ev.gone === "yes") return { ...was, stage: "fixed" };
        if (ev.gone === "no") {
          // The table's label only over the table's own words (the engine says which), never over Claude's.
          const fixes = words(ev.fixes);
          return { ...was, stage: "still", problem: said || e.problem, fromTable: ev.fromTable === true ? true : undefined, ...(typeof ev.code === "string" ? { code: ev.code } : {}), ...(fixes.length ? { fixes } : {}) };
        }
        if (ev.gone === "looks") return { ...was, stage: "ask", ask: "looks" };
        return { ...was, stage: "ask", ...(typeof ev.code === "string" ? { ask: "stillRead" as const, code: ev.code } : {}) };
      }
      if (e.stage !== "looking") return e;
      if (ev.found !== true || !said) return { stage: "none", problem: "", why: [], req: ev.req };
      const q = ev.question && typeof ev.question.text === "string" && Array.isArray(ev.question.options) && Number.isInteger(ev.question.correct) ? { text: ev.question.text, options: words(ev.question.options), correct: ev.question.correct as number } : undefined;
      return {
        stage: "found", req: ev.req, problem: said, why: words(ev.why).slice(0, 2), ...(typeof ev.kind === "string" ? { kind: ev.kind } : {}), ...(typeof ev.code === "string" ? { code: ev.code } : {}),
        ...(q && q.correct >= 0 && q.correct < q.options.length ? { question: q } : {}), ...(words(ev.fixes).length ? { fixes: words(ev.fixes) } : {}), ...(ev.fromTable === true ? { fromTable: true } : {}),
      };
    }
    default: return e;
  }
}

/** After the whole model has taken an event: a look still waiting whose Show me went away (closed, Stop, the engine
 *  restarted) or failed before asking (no permission, hidden, the window changed) waits no more. The Show me panel says why. */
export function everydaySettle(e: Everyday | null, showBefore: { stage: string } | null, showNow: { stage: string } | null): Everyday | null {
  if (!e || !WAITING.includes(e.stage)) return e;
  if ((showBefore && !showNow) || (showNow && SHOWME_FAILED.includes(showNow.stage))) return back(e);
  return e;
}

/** What the first look asks; the engine wraps it as the person's notes (runner/src/everyday.ts). */
export const EVERYDAY_ASK = "Find the problem on my screen and the first steps to fix it.";
/** Show me the steps: the same first look, naming the problem already found, since no step was shown for it yet. */
export const everydayStepsAsk = (problem: string): string => `Show me the first steps to fix this problem on my screen: ${problem}`;
/** What the walkthrough is for, with the problem named, so a look again knows what it was fixing (a code like #REF!). */
export const everydayGoal = (problem: string): string => `Fix this problem on my screen: ${problem}`;
/** The look again: the goal, what was done so far, and the next step if it is not gone yet (anywhere.ts nextQuestion). */
export const checkQuestion = (w: Walk): string => nextQuestion(w);

/** The next look of a walkthrough after a step: a look again ("recheck") only for the everyday walkthrough itself (started
 *  by the key's look or a look again) while its problem is open. An ordinary Show me question asked meanwhile never is. */
export function nextLookMode(everydayWalk: boolean, e: Everyday | null): "recheck" | undefined {
  return everydayWalk && !!e && (e.stage === "found" || e.stage === "still") ? "recheck" : undefined;
}

/** The panel's main button while the problem is open: Show me the steps (a fresh everyday look, never a look again) while
 *  no step was shown for it yet, otherwise Check it is fixed. walking: a walkthrough is on. triedSteps: steps shown so far. */
export function mainAction(e: Everyday | null, walking: boolean, triedSteps: number): "steps" | "check" | null {
  if (!e || (e.stage !== "found" && e.stage !== "still")) return null;
  return e.stage === "found" && !walking && triedSteps === 0 ? "steps" : "check";
}

/** Show you why, like Explain: two lines and the check question (the usual), the lines only, or nothing (point.everydayWhy). */
export function whyShown(e: Everyday, setting: unknown): Explain | null {
  if (setting === "off" || e.why.length === 0) return null;
  return { checkpoint: "everyday", bullets: e.why.slice(0, 2), ...(setting !== "reasons" && e.question ? { question: e.question } : {}) };
}
