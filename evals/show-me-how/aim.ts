// The aim eval's command line and harness (runner/scripts/eval-aim.ts), kept here so the parts that decide whether anything
// is spent are tested without rendering a page.
import { parseArgs, realHarness, type EvalArgs, type EvalHarness } from "../lib/harness.ts";

export type AimArgs = { args: EvalArgs; count: number; which: "basic" | "hard" | "all"; real: boolean; lane: "default" | "computer_use" };

export const AIM_CAPS = { perCaseUsd: 0.05, totalUsd: 6 };
/** Flags that never take a value, so a number after one of them is the count. Every other flag (--total, --per-case,
 *  --set, --count, a model) takes the word after it, as parseArgs reads it, unless it was written --flag=value. */
const SWITCHES = new Set(["--spend", "--help", "-h", "--real"]);
const takesValue = (word: string | undefined) => !!word && word.startsWith("-") && !word.includes("=") && !SWITCHES.has(word);

/** The count of asks: --count n, or a number on its own (one that is not the value of the flag before it). */
export function parseAimArgs(argv: string[]): AimArgs {
  const rest: string[] = [];
  const bare: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const w = argv[i];
    if (/^\d+$/.test(w) && !takesValue(argv[i - 1])) bare.push(w); else rest.push(w);
  }
  const args = parseArgs(rest, AIM_CAPS);
  if (bare.length > 1) throw new Error("Give the count of asks once, for example --count 6");
  const raw = "count" in args.extra ? args.extra.count : bare[0];
  let count = Infinity;
  if (raw !== undefined) {
    count = Number(raw);
    if (!/^\d+$/.test(raw) || count < 1) throw new Error("--count needs a whole number of asks above zero, for example --count 6");
  }
  const which = (args.extra.set ?? "all") as AimArgs["which"];
  if (!["basic", "hard", "all"].includes(which)) throw new Error("--set is basic, hard or all");
  const lane = (args.extra.lane ?? "default") as AimArgs["lane"];
  if (!["default", "computer_use"].includes(lane)) throw new Error("--lane is default or computer_use");
  return { args, count, which, real: "real" in args.extra, lane };
}

/** No harness for a dry run (nothing can be spent). With --spend, the real one, which refuses until it is plugged in. */
export async function aimHarness(a: AimArgs, real: () => Promise<EvalHarness> = realHarness): Promise<EvalHarness | undefined> {
  return a.args.spend ? real() : undefined;
}
