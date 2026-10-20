// Everyday stuck moments: the hero key works in any app, not only in a project. With no project, or with an app in front
// that is not a code tool, the key looks at the screen once (Show me's own look: light first, secrets covered, nothing
// kept), names the problem in two plain sentences, walks the person through the fix in that app (anywhere mode, the usual
// pointing rules, Your turn, Do it for me only for plain labelled buttons), looks again only on a press, and says fixed
// only when that look saw the error gone. Plain code, tested in everyday.test.ts; card.tsx draws what this decides.
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
 *  A browser keeps the project check, since the project's own page or its builder is often what is in front, and so does
 *  a practice copy (practice: its own Find is what the key is for, whatever app is in front). */
export type HeroRoute = "project" | "screen" | "noProject";
export function heroRoute(o: { everyday: unknown; project: string; front: unknown; practice?: boolean }): HeroRoute {
  if (o.everyday === false) return o.project ? "project" : "noProject";
  if (!o.project) return "screen";
  if (o.practice) return "project";
  return o.front === "other" ? "screen" : "project";
}

/** looking: the first look is on its way. found: a problem is named. none: nothing looked wrong. checking: a look again.
 *  fixed: that look saw it gone. still: it is still there. ask: the look could not tell, so the person is asked.
 *  saidWorks: the person said it works (never called fixed, since nothing saw it). */
export type EverydayStage = "looking" | "found" | "none" | "checking" | "fixed" | "still" | "ask" | "saidWorks";
export type Everyday = {
  stage: EverydayStage; req?: string; problem: string; kind?: string; code?: string; why: string[];
  question?: { text: string; options: string[]; correct: number }; fixes?: string[]; fromTable?: boolean; prev?: EverydayStage;
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
        const was = { ...e, prev: undefined, req: ev.req as string };
        if (ev.gone === "yes") return { ...was, stage: "fixed" };
        if (ev.gone === "no") return { ...was, stage: "still", problem: said || e.problem, ...(typeof ev.code === "string" ? { code: ev.code } : {}) };
        return { ...was, stage: "ask" };
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
/** What the walkthrough is for, with the problem named, so a look again knows what it was fixing (a code like #REF!). */
export const everydayGoal = (problem: string): string => `Fix this problem on my screen: ${problem}`;
/** The look again: the goal, what was done so far, and the next step if it is not gone yet (anywhere.ts nextQuestion). */
export const checkQuestion = (w: Walk): string => nextQuestion(w);

/** Show you why, like Explain: two lines and the check question (the usual), the lines only, or nothing (point.everydayWhy). */
export function whyShown(e: Everyday, setting: unknown): Explain | null {
  if (setting === "off" || e.why.length === 0) return null;
  return { checkpoint: "everyday", bullets: e.why.slice(0, 2), ...(setting !== "reasons" && e.question ? { question: e.question } : {}) };
}
