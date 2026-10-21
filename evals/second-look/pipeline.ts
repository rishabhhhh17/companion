// One Second Look case: the AI answer goes through the real engine (runner/src/secondlook.ts), whose maths check is code and
// always real. Dry: the model's look is a stand in that plays the case's expected answer. Spend: the real fast lane.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastLike } from "../../runner/src/lanes.ts";
import { secondLook } from "../../runner/src/secondlook.ts";
import type { CaseMeter } from "../lib/budget.ts";
import type { EvalHarness, ModelRole, TextAsk } from "../lib/harness.ts";
import type { CaseResult } from "../lib/results.ts";
import { classifyLook } from "./score.ts";

export const SET_DIR = import.meta.dir;
export type LookCase = { id: string; label: "seeded" | "clean"; kind: string; asked: string; answer: string; about: string[]; dry: unknown };
export const loadCases = (): LookCase[] => JSON.parse(readFileSync(join(import.meta.dir, "cases.json"), "utf8"));

export type LookContext = { mode: "dry" | "spend"; meter: CaseMeter; harness?: EvalHarness; models?: Partial<Record<ModelRole, string>>; ask?: TextAsk; signal?: AbortSignal };

export async function runLookCase(c: LookCase, ctx: LookContext): Promise<CaseResult> {
  const t0 = Date.now();
  const inner: TextAsk = ctx.ask ?? (ctx.mode === "dry" ? async () => ({ text: JSON.stringify(c.dry), costUsd: 0 }) : ctx.harness!.ask(ctx.models!.fast!));
  const ask = ctx.meter.ask(inner);
  const fast: FastLike = { run: (req, _onDelta, signal) => ask({ text: req.text, system: req.system ?? "" }, signal) };
  const notes: string[] = [];
  try {
    const r = await secondLook(c.answer, fast, ctx.signal ?? new AbortController().signal);
    const outcome = classifyLook(c, r);
    if (outcome === "caught_other") notes.push(`Flagged, but not the seeded mistake: ${r.items.map((i) => i.claim).join("; ")}`);
    if (outcome === "false_alarm") notes.push(`A clean answer was flagged: ${r.items.map((i) => `${i.claim} (${i.issue})`).join("; ")}`);
    if (outcome === "confidently_wrong") notes.push("It called an answer with a seeded mistake solid.");
    return { id: c.id, outcome, costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: Date.now() - t0, notes, detail: { label: c.label, kind: c.kind, verdict: r.verdict, items: r.items, cantTell: r.cantTell, byCode: r.items.some((i) => i.by === "recomputed") } };
  } catch (e) {
    return { id: c.id, outcome: "error", costUsd: ctx.meter.usd, turns: ctx.meter.turns, tokens: { ...ctx.meter.tokens }, ms: Date.now() - t0, notes: [String((e as Error).message)], detail: { label: c.label, kind: c.kind } };
  }
}
