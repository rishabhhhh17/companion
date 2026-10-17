// The one place the eval sets get Claude from, and the one switch that lets them spend.
//
// DRY is the default and spends nothing: every model is a stand in that plays back what the case data says (the known
// good fix, the labelled review answer, the reference explanation), so the whole pipeline (the runner, the proof ladder,
// the hidden checks, the scorer and the results file) runs for free. A dry run proves the eval's wiring and that every
// case can be solved and scored. It says nothing about how good Claude is.
//
// SPEND needs --spend on the command line AND the real run harness. That harness is the real-key work (M11 wave 3, part
// A.3: the bundled binary, the key read from the Keychain in code, a throwaway CLAUDE_CONFIG_DIR, settingSources [],
// strictMcpConfig, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1, CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 and a check that system/init lists
// only the expected tools). It plugs in at realHarness() below and nowhere else. Until it does, --spend refuses.
import type { Engine, Usage } from "../../runner/src/engine.ts";
import { buildFastOptions, type VisionLike } from "../../runner/src/lanes.ts";
import { MODELS } from "../../runner/src/models.ts";

/** One text in, one text out, no tools: Explain's fast lane, and the model that grades Explain. */
export type TextAsk = (req: { text: string; system: string }, signal: AbortSignal) => Promise<{ text: string; costUsd: number; usage?: Usage }>;

/** What a real run needs from Claude. Every eval set asks for models through this and nothing else. */
export interface EvalHarness {
  readonly name: string;
  /** Agent sessions, run through Companion's runner, so every tool is judged by the same safety rules as the app. Each turn
   *  runs on the model the runner asks for (EngineOptions.model: the command's model, so Rescue's diagnosis gets its own). */
  agent(): Engine;
  /** The second model review, on the runner's reviewModel. The runner refuses every tool it asks for. */
  reviewer(): Engine;
  /** A single text call with its own system prompt and no tools: Explain and the grader. The real harness sends it with
   *  askOptions() below and nothing else: on the fast lane's models (Haiku 4.5, Haiku 5.5) that is exactly the app's fast
   *  lane request (runner/src/lanes.ts buildFastOptions, raw: true, as runner/src/main.ts wires Explain), so Explain is
   *  measured as it ships. The fast lane turns thinking off, which Sonnet 5.5 and Opus 5.5 refuse with a 400 (wave 3
   *  plan, part A); on those models (the grader's default) askOptions leaves thinking at the model's default and asks
   *  for low effort instead. */
  ask(model: string): TextAsk;
  /** Show me how's pointing lane: the default vision lane, or the experimental Computer Use one (API key route only). The
   *  app's vision lane also turns thinking off, so a paid aim eval on Sonnet 5.5 (its default) waits for the part A.1 fix
   *  in the runner; the aim eval on Haiku 5.5 does not. */
  vision(model: string, lane?: "default" | "computer_use"): VisionLike;
}

/** Models that refuse thinking: {type: "disabled"} at every effort level the fast lane could use (checked against the
 *  current Claude API notes on 17 Oct 2026, wave 3 plan part A). Haiku 4.5 and Haiku 5.5 (at its default effort) accept it. */
export const REFUSES_THINKING_OFF = /^claude-(sonnet-5-5|opus-5-5|fable-5)/;

/** The request for one text call: the app's fast lane request, except that a model which refuses thinking turned off
 *  keeps its default thinking and is asked for low effort (the only control Opus 5.5 has; Sonnet 5.5 accepts it too). */
export function askOptions(c: { claudeBinary: string; env: Record<string, string>; model: string; system: string; signal: AbortSignal }) {
  const app = buildFastOptions(c);
  if (!REFUSES_THINKING_OFF.test(c.model)) return app;
  const { thinking: _off, ...rest } = app;
  return { ...rest, effort: "low" as const };
}

export class HarnessMissing extends Error {}

export const HARNESS_MISSING =
  "Spending is not possible from this branch yet. The real run harness (M11 wave 3, part A.3, the real-key work) plugs in at " +
  "evals/lib/harness.ts realHarness(). Until then only the dry run works: run the same command without --spend.";

/** The real harness. The real-key branch replaces the body of this function with its harness; nothing else changes. */
export async function realHarness(): Promise<EvalHarness> {
  throw new HarnessMissing(HARNESS_MISSING);
}

/** The models a set uses by default: the app's own defaults (runner/src/models.ts), so an eval measures what ships. */
export const DEFAULT_MODELS = { agent: MODELS.agent, diagnose: MODELS.diagnose, review: MODELS.review, fast: MODELS.fast, vision: MODELS.vision, grader: MODELS.agent } as const;
export type ModelRole = keyof typeof DEFAULT_MODELS;

export type EvalArgs = {
  spend: boolean;
  only: string[];
  perCaseUsd: number;
  totalUsd: number;
  out?: string;
  models: Record<ModelRole, string>;
  /** Any --name value or --name=value the set reads for itself (flow, on-stuck, set). */
  extra: Record<string, string>;
  help: boolean;
};

const ROLES = Object.keys(DEFAULT_MODELS) as ModelRole[];

/** Reads the command line every set shares. A cap that is not a positive number is refused, never guessed. */
export function parseArgs(argv: string[], defaults: { perCaseUsd: number; totalUsd: number }): EvalArgs {
  const a: EvalArgs = { spend: false, only: [], perCaseUsd: defaults.perCaseUsd, totalUsd: defaults.totalUsd, models: { ...DEFAULT_MODELS }, extra: {}, help: false };
  const money = (flag: string, v: string | undefined): number => {
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) throw new Error(`${flag} needs a dollar amount above zero, for example ${flag} 0.5`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const [flag, inline] = raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, undefined];
    const value = () => inline ?? argv[++i];
    if (flag === "--spend") {
      // A switch only. "--spend=false" must never be read as a yes, so any value after it is refused.
      if (inline !== undefined) throw new Error("Use --spend on its own, with nothing after it. Leave it out for a dry run.");
      a.spend = true;
    }
    else if (flag === "--help" || flag === "-h") a.help = true;
    else if (flag === "--only") a.only = String(value() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (flag === "--per-case") a.perCaseUsd = money(flag, value());
    else if (flag === "--total") a.totalUsd = money(flag, value());
    else if (flag === "--out") a.out = value();
    else if (flag.startsWith("--") && flag.endsWith("-model") && ROLES.includes(flag.slice(2, -6) as ModelRole)) {
      const m = value();
      if (!m) throw new Error(`${flag} needs a model id`);
      a.models[flag.slice(2, -6) as ModelRole] = m;
    } else if (flag.startsWith("--")) {
      // A set's own flag: --name value, --name=value, or --name alone (a switch, when the next word is another flag).
      a.extra[flag.slice(2)] = inline ?? (argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? "" : argv[++i]);
    }
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (a.perCaseUsd > a.totalUsd) throw new Error("--per-case cannot be more than --total");
  return a;
}

export const COMMON_HELP = `
  (no flag)          DRY: stand ins play the case data back, nothing is spent
  --spend            really call Claude (needs the real run harness; refused until it is plugged in)
  --only a,b         run only these case ids
  --per-case 0.6     the most one case may spend, in dollars
  --total 8          stop starting new cases once this much has been spent, in dollars
  --out file.json    where the results file goes (dry: a temporary folder; spend: this set's results folder)
  --agent-model id, --review-model id, --fast-model id, --vision-model id, --grader-model id, --diagnose-model id`;
