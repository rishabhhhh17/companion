// The aim eval's command line, harness, and how one ask is run and scored (runner/scripts/eval-aim.ts renders the pages and
// calls these), kept here so the parts that decide whether anything is spent and how an answer counts are tested without
// rendering a page.
import { clickPoint, type Located } from "../../runner/src/lanes.ts";
import { isEvalStop, parseArgs, realHarness, type EvalArgs, type EvalHarness, type Lane } from "../lib/harness.ts";
import type { CaseMeter } from "../lib/budget.ts";
import { countOutcomes, endedByAStop, isClean, type CaseResult, type Results } from "../lib/results.ts";
import { scorePoint, type Element } from "./score.ts";

export type AimArgs = { args: EvalArgs; count: number; which: "basic" | "hard" | "all"; real: boolean; lane: Lane };

export const AIM_CAPS = { perCaseUsd: 0.05, totalUsd: 6 };
/** Flags that never take a value, so a number after one of them is the count. Every other flag (--total, --per-case,
 *  --set, --count, a model) takes the word after it, as parseArgs reads it, unless it was written --flag=value. */
const SWITCHES = new Set(["--spend", "--help", "-h", "--real"]);
const takesValue = (word: string | undefined) => !!word && word.startsWith("-") && !word.includes("=") && !SWITCHES.has(word);
const setting = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

/** The count of asks: --count n, or a number on its own (one that is not the value of the flag before it). `env`: the
 *  settings the app reads for these lanes (COMPANION_AIM=computer_use, COMPANION_VISION_MODEL, COMPANION_AIM_MODEL), as
 *  defaults that a flag overrides; the script passes process.env. */
export function parseAimArgs(argv: string[], env: Record<string, string | undefined> = {}): AimArgs {
  const rest: string[] = [];
  const bare: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i];
    if (/^\d+$/.test(w) && !takesValue(argv[i - 1])) bare.push(w); else rest.push(w);
  }
  const vision = setting(env.COMPANION_VISION_MODEL), aim = setting(env.COMPANION_AIM_MODEL);
  const args = parseArgs(rest, { ...AIM_CAPS, models: { ...(vision ? { vision } : {}), ...(aim ? { aim } : {}) } });
  if (bare.length > 1) throw new Error("Give the count of asks once, for example --count 6");
  const raw = "count" in args.extra ? args.extra.count : bare[0];
  let count = Infinity;
  if (raw !== undefined) {
    count = Number(raw);
    if (!/^\d+$/.test(raw) || count < 1) throw new Error("--count needs a whole number of asks above zero, for example --count 6");
  }
  const which = (args.extra.set ?? "all") as AimArgs["which"];
  if (!["basic", "hard", "all"].includes(which)) throw new Error("--set is basic, hard or all");
  const lane = (args.extra.lane ?? (env.COMPANION_AIM === "computer_use" ? "computer_use" : "default")) as Lane;
  if (!["default", "computer_use"].includes(lane)) throw new Error("--lane is default or computer_use");
  return { args, count, which, real: "real" in args.extra, lane };
}

/** No harness for a dry run (nothing can be spent). With --spend, the real one with the eval's caps, which refuses
 *  (CannotSpend) when there is no key in the Keychain item. */
export async function aimHarness(a: AimArgs, make: (caps: { perCaseUsd: number; totalUsd: number }) => Promise<EvalHarness> = (caps) => realHarness(caps)): Promise<EvalHarness | undefined> {
  return a.args.spend ? make({ perCaseUsd: a.args.perCaseUsd, totalUsd: a.args.totalUsd }) : undefined;
}

/** One ask: a rendered page, what is on it, the right answer (or answers) and the question. */
export type AimAsk = { id: string; page: string; png: string; els: Element[]; target: Element; targets: Element[]; question: string; set: "basic" | "hard" | "real" };

/** snapped, raw_only, missed and no_answer are answers and are scored; rendered is a dry run's; error is a lane that failed
 *  (counted apart, never a miss); refused and stopped are set by runSet when a stop ended the ask (never scored). */
export const AIM_OUTCOMES = ["snapped", "raw_only", "missed", "no_answer", "rendered", "error", "refused", "stopped", "not_started"];
const ANSWERED = ["snapped", "raw_only", "missed", "no_answer"];
const zero = { in: 0, cacheRead: 0, out: 0 };

/** Asks the pointing lane once and scores where the person would click. A refusal or a spending stop is thrown on (runSet
 *  fails the ask with its reason and ends the run): it is never "no answer". Any other failure is an error, not a miss. */
export async function runAimAsk(a: AimAsk, ctx: { mode: "dry" | "spend"; harness?: EvalHarness; meter: CaseMeter; signal: AbortSignal }, o: { model: string; lane: Lane; aimModel: string }): Promise<CaseResult> {
  const where = { set: a.set, page: a.page, target: { t: a.target.t, x: Math.round(a.target.x), y: Math.round(a.target.y) } };
  if (ctx.mode === "dry") return { id: a.id, outcome: "rendered", costUsd: 0, turns: 0, tokens: zero, ms: 0, notes: [], detail: where };
  const t0 = Date.now();
  const vision = ctx.meter.vision(ctx.harness!.vision(o.model, o.lane, o.aimModel));
  let r: Located;
  try { r = await vision.locate({ image: { base64: a.png, mediaType: "image/png", w: 1280, h: 800 }, question: a.question, ocr: [] }, ctx.signal); }
  catch (e) {
    if (isEvalStop(e) || ctx.signal.aborted) throw e;
    return { id: a.id, outcome: "error", costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: zero, ms: Date.now() - t0, notes: [`The lane failed, so this ask has no answer to score: ${(e as Error)?.message ?? String(e)}`], detail: where };
  }
  // Scored on where the person would click: the last target of an answer with several (the ones before it are "look here").
  const hit = clickPoint(r);
  const s = scorePoint(hit, a.targets, a.els);
  const outcome = !hit ? "no_answer" : s.snapped ? "snapped" : s.raw ? "raw_only" : "missed";
  return { id: a.id, outcome, costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: zero, ms: Date.now() - t0, notes: outcome === "snapped" || !hit ? [] : [`wanted "${a.target.t}" at (${Math.round(a.target.x)},${Math.round(a.target.y)}); got (${Math.round(hit.x)},${Math.round(hit.y)}) "${hit.targetText}"`], detail: { ...where, hit: hit ? { x: Math.round(hit.x), y: Math.round(hit.y), text: hit.targetText } : null } };
}

/** The rates, over the asks that got an answer (a point, or "nothing to point at"). Errors and stops are counted apart. */
export function summarizeAim(cases: CaseResult[]) {
  const asked = cases.filter((c) => ANSWERED.includes(c.outcome) && !endedByAStop(c));
  const ms = asked.map((c) => c.ms).sort((a, b) => a - b);
  const by = (set: string) => { const xs = asked.filter((c) => c.detail?.set === set); return { asked: xs.length, snapped: xs.filter((c) => c.outcome === "snapped").length, raw: xs.filter((c) => c.outcome === "snapped" || c.outcome === "raw_only").length }; };
  return { counts: countOutcomes(cases, AIM_OUTCOMES), rendered: cases.length, asked: asked.length, basic: by("basic"), hard: by("hard"), real: by("real"), medianMs: ms[Math.floor(ms.length / 2)] ?? 0, slowestMs: ms.at(-1) ?? 0, costUsd: Math.round(cases.reduce((s, c) => s + c.costUsd, 0) * 1e6) / 1e6 };
}

/** What a spend run prints: no score at all when a stop ended it (a stop is never a 0% hit rate), else the rates, with
 *  every lane error listed apart from the misses. */
export function aimReport(r: Results, real: boolean): string[] {
  const s = r.summary as ReturnType<typeof summarizeAim>;
  if (!isClean(r)) return [`\nStopped after ${s.asked} answered asks, so nothing is scored: ${r.stopped ?? r.cases.find(endedByAStop)?.notes[0] ?? "the run was stopped"}`, `cost so far: $${s.costUsd.toFixed(2)}`];
  const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "none");
  const lines = [`\nasked: ${s.asked}${s.counts.error ? `; errors (not scored): ${s.counts.error}` : ""}`,
    `snapped hit rate: basic ${pct(s.basic.snapped, s.basic.asked)}, hard ${pct(s.hard.snapped, s.hard.asked)}${real ? `, public sites ${pct(s.real.snapped, s.real.asked)}` : ""}`,
    `raw hit rate: basic ${pct(s.basic.raw, s.basic.asked)}, hard ${pct(s.hard.raw, s.hard.asked)}${real ? `, public sites ${pct(s.real.raw, s.real.asked)}` : ""}`,
    `no answer: ${s.counts.no_answer}`, `median time: ${s.medianMs} ms; slowest: ${s.slowestMs} ms`, `cost: $${s.costUsd.toFixed(2)}`];
  for (const c of r.cases) if (c.outcome === "error") lines.push(`  error (not scored): ${c.id}: ${c.notes[0] ?? ""}`);
  return lines;
}
