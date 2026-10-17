// The results file every eval set writes: one JSON file per run, the same shape for every set, so runs can be compared
// (dry against spend, one model against another, before and after a prompt change).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Tokens } from "./budget.ts";

export const RESULTS_FORMAT = "companion-eval-results/1";

/** One case. outcome is the set's own word for how it went; the rest is the same everywhere. */
export type CaseResult = {
  id: string;
  outcome: string;
  costUsd: number;
  turns: number;
  tokens: Tokens;
  ms: number;
  /** Plain notes on what happened, for a person reading the file. */
  notes: string[];
  /** Anything else the set records about the case (where the problem was found, the proof verdict, the checks). */
  detail?: Record<string, unknown>;
};

export type Results = {
  format: typeof RESULTS_FORMAT;
  set: string;
  mode: "dry" | "spend";
  harness: string;
  startedAt: string;
  finishedAt: string;
  models: Record<string, string>;
  caps: { perCaseUsd: number; totalUsd: number };
  spentUsd: number;
  /** Why the run stopped before the end (the cumulative stop), or null. */
  stopped: string | null;
  cases: CaseResult[];
  summary: Record<string, unknown>;
};

/** What is wrong with a results file, in plain words; empty when it is fine. */
export function checkResults(r: unknown): string[] {
  const p: string[] = [];
  const o = r as Partial<Results> | null;
  if (!o || typeof o !== "object") return ["It is not a JSON object."];
  if (o.format !== RESULTS_FORMAT) p.push(`format should be ${RESULTS_FORMAT}.`);
  if (typeof o.set !== "string" || !o.set) p.push("set is missing.");
  if (o.mode !== "dry" && o.mode !== "spend") p.push("mode should be dry or spend.");
  for (const k of ["startedAt", "finishedAt"] as const) if (typeof o[k] !== "string" || Number.isNaN(Date.parse(o[k]!))) p.push(`${k} should be a time.`);
  if (!o.caps || !(o.caps.perCaseUsd > 0) || !(o.caps.totalUsd > 0)) p.push("caps should say the per case and total caps.");
  if (typeof o.spentUsd !== "number" || o.spentUsd < 0) p.push("spentUsd should be a number.");
  if (o.mode === "dry" && o.spentUsd !== 0) p.push("A dry run must spend nothing.");
  if (!Array.isArray(o.cases)) p.push("cases should be a list.");
  else {
    const ids = new Set<string>();
    for (const c of o.cases) {
      if (!c || typeof c.id !== "string" || typeof c.outcome !== "string") { p.push("Every case needs an id and an outcome."); continue; }
      if (ids.has(c.id)) p.push(`Case ${c.id} is there twice.`);
      ids.add(c.id);
      if (typeof c.costUsd !== "number" || typeof c.turns !== "number" || typeof c.ms !== "number" || !c.tokens || !Array.isArray(c.notes)) p.push(`Case ${c.id} is missing its cost, turns, tokens, time or notes.`);
    }
  }
  if (!o.summary || typeof o.summary !== "object") p.push("summary is missing.");
  return p;
}

const stamp = (d: Date) => d.toISOString().replace(/[:.]/g, "-");

/** Where a run's results go: the --out path; a spend run in the set's own results folder (kept); a dry run in a temporary folder. */
export function resultsPath(setDir: string, set: string, mode: "dry" | "spend", started: Date, out?: string): string {
  if (out) return out;
  return mode === "spend" ? join(setDir, "results", `${stamp(started)}-spend.json`) : join(tmpdir(), "companion-evals", `${set}-${stamp(started)}-dry.json`);
}

export function writeResults(path: string, r: Results): void {
  const problems = checkResults(r);
  if (problems.length) throw new Error(`The results are not in the right shape: ${problems.join(" ")}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(r, null, 2) + "\n");
}

export function readResults(path: string): Results {
  const r = JSON.parse(readFileSync(path, "utf8"));
  const problems = checkResults(r);
  if (problems.length) throw new Error(`${path}: ${problems.join(" ")}`);
  return r as Results;
}

/** Counts of each outcome, in a fixed order, for the summary and the printed line. */
export function countOutcomes(cases: CaseResult[], order: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of order) out[k] = 0;
  for (const c of cases) out[c.outcome] = (out[c.outcome] ?? 0) + 1;
  return out;
}
