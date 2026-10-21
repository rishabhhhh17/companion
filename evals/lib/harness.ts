// The one place the eval sets get Claude from, and the one switch that lets them spend.
//
// DRY is the default and spends nothing: every model is a stand in that plays back what the case data says (the known
// good fix, the labelled review answer, the reference explanation), so the whole pipeline (the runner, the proof ladder,
// the hidden checks, the scorer and the results file) runs for free. A dry run proves the eval's wiring and that every
// case can be solved and scored. It says nothing about how good Claude is.
//
// SPEND needs --spend on the command line, and then goes through realHarness() below and nothing else. It is built on the
// real run harness every script that spends the founder's key uses (runner/scripts/realrun-harness.ts), so the eval sets
// keep every rule CLAUDE.md sets for running real Claude Code: the SDK's bundled binary, the key read in code from the
// Keychain item named by COMPANION_KEYCHAIN_SERVICE (companion-dev by default) and never printed, a throwaway
// CLAUDE_CONFIG_DIR, a short plain environment, settingSources [], strictMcpConfig, CLAUDE_CODE_DISABLE_AUTO_MEMORY=1,
// CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1, never bypassPermissions, the system/init tool check, and the SpendMeter's per case and
// total stops. Every query is checked before it starts (guardQuery), is counted while it runs, and is aborted at a stop.
// What each request asks of its model (thinking, effort) comes only from runner/src/models.ts, through the app's own lane
// and engine builders: the eval sets keep no request rules of their own.
// Tested with stubbed queries in evals/lib/real.test.ts. NOT YET RUN AGAINST REAL CLAUDE.
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_URL, ComputerUseVision, withFallback } from "../../runner/src/aim.ts";
import { EngineStop, type Engine, type Usage } from "../../runner/src/engine.ts";
import { getApiKey, type KeychainRef } from "../../runner/src/keychain.ts";
import { FastLane, VisionLane, type VisionLike } from "../../runner/src/lanes.ts";
import { MODELS, canonicalModel, estimateUsd, requestProblems, usualModel } from "../../runner/src/models.ts";
import { release as releaseShotDrive } from "../../runner/src/ramdisk.ts";
import { SdkEngine, SessionTotals, resolveClaudeBinary } from "../../runner/src/sdkEngine.ts";
import {
  HarnessRefusal, SpendMeter, SpendStop, guardQuery, harnessEnv, hideKey, isHarnessStop, keychainRefFrom, makeThrowawayConfigDir,
  type Expect, type QueryFn,
} from "../../runner/scripts/realrun-harness.ts";

/** One text in, one text out, no tools: Explain's fast lane, and the model that grades Explain. */
export type TextAsk = (req: { text: string; system: string }, signal: AbortSignal) => Promise<{ text: string; costUsd: number; usage?: Usage }>;
export type Lane = "default" | "computer_use";

/** How a case was ended by a stop rather than finished: a refusal by the harness, or a spending stop. */
export type CaseStop = { kind: "refused" | "stopped"; reason: string };

/** What a real run needs from Claude. Every eval set asks for models through this and nothing else. */
export interface EvalHarness {
  readonly name: string;
  /** Agent sessions, run through Companion's runner, so every tool is judged by the same safety rules as the app. Each turn
   *  runs on the model the runner asks for (EngineOptions.model: the command's model, so Rescue's diagnosis gets its own). */
  agent(): Engine;
  /** The second model review, on the runner's reviewModel. The runner refuses every tool it asks for. */
  reviewer(): Engine;
  /** A single text call with its own system prompt and no tools: Explain and the grader. Sent exactly as the app sends
   *  Explain (its fast lane, raw), so its request shape is the fast lane's for that model (runner/src/models.ts). */
  ask(model: string): TextAsk;
  /** Show me how's pointing lane: the default vision lane on `model`, or the experimental Computer Use lane on `aimModel`
   *  (API key route only) falling back to the vision lane, as the app does. */
  vision(model: string, lane?: Lane, aimModel?: string): VisionLike;
  // The real harness only (a test's stand in may leave these out). runSet calls them around every case.
  /** A case starts: its own stop, under the run's total. The signal is aborted at the case's first refusal or stop. */
  startCase?(id: string, capUsd: number): AbortSignal;
  /** The case is over: what the harness counted, and every refusal and stop it saw (any one fails the case). */
  endCase?(): Promise<{ spentUsd: number; stops: CaseStop[] }>;
  /** Why no more case may start (the total stop was reached), or null. */
  stopped?(): string | null;
  /** Anything about to be printed or written, with the key hidden. */
  hide?(text: string): string;
  /** Removes the throwaway Claude Code folder and the in memory drive. */
  close?(): Promise<void>;
}

/** Spending was asked for but cannot happen (no key in the Keychain item, no bundled binary). Nothing was spent. */
export class CannotSpend extends Error {}

/** A refusal or a spending stop: the harness's (runner/scripts/realrun-harness.ts), or the eval's own per case cap
 *  (evals/lib/budget.ts, an EngineStop "error_max_budget_usd"). Never a quality result. */
export const isEvalStop = (e: unknown): boolean => isHarnessStop(e) || (e instanceof EngineStop && /^error_max_budget_usd\b/.test(e.message));
/** How a stop is recorded in a case's results. */
export function stopOf(e: unknown): CaseStop {
  return e instanceof HarnessRefusal ? { kind: "refused", reason: e.message } : { kind: "stopped", reason: (e as Error)?.message ?? String(e) };
}

/** Everything realHarness reads from the world. Tests replace each one (no Keychain, no Claude, no network); a real run
 *  leaves them all out. */
export type RealDeps = {
  readKey?: (ref: KeychainRef) => Promise<string | null>;
  keyRef?: KeychainRef;
  query?: QueryFn;
  claudeBinary?: () => string;
  tmpRoot?: string;
  parentEnv?: Record<string, string | undefined>;
  /** The pointing lane's only network call (the Messages API). */
  fetch?: typeof fetch;
  /** Where Claude Code keeps a copy of a picture it is sent: the in memory drive (runner/src/ramdisk.ts) unless replaced. */
  tmpDrive?: { ensure: () => Promise<string>; wipe: () => Promise<void> };
  releaseDrive?: () => Promise<void>;
};

const usd = (n: number) => `$${n.toFixed(2)}`;
const until = async (cond: () => boolean, ms: number) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await Bun.sleep(10); };

/** The real harness: --spend gets this and nothing else. Reads the key once, in code; refuses (CannotSpend) when there is
 *  none, before anything is started or written. */
export async function realHarness(caps: { perCaseUsd: number; totalUsd: number }, deps: RealDeps = {}): Promise<EvalHarness> {
  const ref = deps.keyRef ?? keychainRefFrom(process.env);
  const key = await (deps.readKey ?? getApiKey)(ref);
  if (!key) throw new CannotSpend(`No API key in the Keychain item "${ref.service}" (account "${ref.account}"). Add it there from Terminal (docs/milestones/M11-real-run-checklist.md, step 1), then run this again. Nothing was spent.`);
  let claudeBinary: string;
  try { claudeBinary = (deps.claudeBinary ?? (() => resolveClaudeBinary()))(); }
  catch (e) { throw new CannotSpend(`${hideKey((e as Error).message, key)}. Install the runner's packages first (cd runner && bun install). Nothing was spent.`); }
  // The SDK's own query, from the runner's pinned package (this folder has no packages of its own).
  const real = deps.query ?? ((await import(Bun.resolveSync("@anthropic-ai/claude-agent-sdk", join(import.meta.dir, "..", "..", "runner")))).query as QueryFn);
  const configDir = makeThrowawayConfigDir(deps.tmpRoot ?? tmpdir());
  let env: Record<string, string>;
  try { env = harnessEnv({ apiKey: key, configDir, parent: deps.parentEnv ?? process.env }); }
  catch (e) { rmSync(configDir, { recursive: true, force: true }); throw e; }
  const meter = new SpendMeter(caps.perCaseUsd, caps.totalUsd);
  const sessions = new Map<string, number>();
  const totals = new SessionTotals();
  const send = deps.fetch ?? fetch;
  type Running = { id: string; ac: AbortController; stops: CaseStop[]; active: number };
  let current: Running | null = null;
  let totalStop: string | null = null;
  let seq = 0;
  let usedDrive = false;
  const hide = (s: string) => hideKey(s, key);

  // The first refusal or stop ends the case at once: its signal aborts every query in flight, and nothing new starts.
  const stopCase = (e: Error) => {
    const c = current;
    if (!c) return;
    const s = stopOf(e);
    s.reason = hide(s.reason);
    if (!c.stops.some((x) => x.reason === s.reason)) c.stops.push(s);
    if (e instanceof SpendStop && e.scope === "total") totalStop ??= e.message;
    if (!c.ac.signal.aborted) c.ac.abort();
  };
  const refuse = (e: Error): never => { stopCase(e); throw e; };

  /** The SDK's query, guarded for the case running now. Outside a case nothing is sent. */
  const guarded = (tools: Expect["tools"], model?: string): QueryFn => (params) => {
    const c = current;
    if (!c) throw new HarnessRefusal("Not started: no eval case is running");
    const it = guardQuery(real, { meter, sessions, signal: c.ac.signal, label: `${c.id}-${++seq}`, onRefusal: stopCase, expect: { tools, model, claudeBinary, configDirs: [configDir] } })(params);
    // Counted while it runs, so the case's end waits for it to be booked before the next case starts.
    return (async function* () { c.active++; try { yield* it; } finally { c.active--; } })();
  };

  /** The pointing lane's own network call: only the Messages API, only a request its model takes (models.ts), never after a
   *  stop or with no room left, and metered from each answer's usage. */
  const meteredFetch = (aimModel: string) => (async (url: string, init: RequestInit) => {
    const c = current;
    if (!c || c.ac.signal.aborted) throw new HarnessRefusal("Not started: the case was already stopped");
    if (url !== API_URL) refuse(new HarnessRefusal("Not started: only the Messages API may be called"));
    let body: Record<string, any>;
    try { body = JSON.parse(String(init.body)); } catch { return refuse(new HarnessRefusal("Not started: the pointing request is not readable")); }
    const headers = (init.headers ?? {}) as Record<string, string>;
    const problems = requestProblems(String(body.model), { thinking: body.thinking, effort: body.output_config?.effort, tools: body.tools, tool_choice: body.tool_choice, temperature: body.temperature, top_p: body.top_p, top_k: body.top_k, lastRole: body.messages?.at(-1)?.role, betas: String(headers["anthropic-beta"] ?? "").split(",").filter(Boolean), via: "api" });
    if (canonicalModel(String(body.model)) !== canonicalModel(aimModel)) problems.push(`the model is ${String(body.model)}, not ${aimModel}`);
    if (problems.length) refuse(new HarnessRefusal(`Not started: ${problems.join("; ")}`));
    meter.assertRoom();   // a stop is told to stopCase before it is thrown
    const res = await send(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, c.ac.signal]) : c.ac.signal });
    const answer = await res.clone().json().catch(() => null) as { usage?: Parameters<typeof estimateUsd>[1] } | null;
    meter.settle(`${c.id}-aim-${++seq}`, estimateUsd(String(body.model), answer?.usage));
    return res;
  }) as unknown as typeof fetch;

  const engine = () => new SdkEngine({ claudeBinary, env, totals, queryFn: guarded("agent") as never });
  return {
    name: `real run harness (runner/scripts/realrun-harness.ts; key from the Keychain item "${ref.service}")`,
    agent: engine,
    reviewer: engine,
    ask: (model) => (req, signal) => new FastLane({ claudeBinary, env, model, queryFn: guarded([], model) as never }).run({ ...req, raw: true }, () => {}, signal),
    vision(model, lane = "default", aimModel = MODELS.aim) {
      if (!deps.tmpDrive) usedDrive = true;
      const classic = new VisionLane({ claudeBinary, env, model, queryFn: guarded([], model) as never, ...(deps.tmpDrive ? { tmpDrive: deps.tmpDrive } : {}) });
      if (lane !== "computer_use") return classic;
      return withFallback(new ComputerUseVision({ apiKey: async () => key, model: aimModel, fetchFn: meteredFetch(aimModel) }), classic);
    },
    startCase(id, capUsd) {
      if (current) current.ac.abort();
      meter.startCase(id, capUsd);
      current = { id, ac: new AbortController(), stops: [], active: 0 };
      meter.onStop = stopCase;
      return current.ac.signal;
    },
    async endCase() {
      const c = current;
      if (!c) return { spentUsd: 0, stops: [] };
      // Anything of this case still running ends now, and is counted before the next case starts.
      c.ac.abort();
      await until(() => c.active === 0, 10_000);
      const spentUsd = meter.caseSpent;
      if (meter.totalSpent >= caps.totalUsd) totalStop ??= `the total spending stop of ${usd(caps.totalUsd)} was reached (spent about ${usd(meter.totalSpent)})`;
      meter.onStop = undefined;
      current = null;
      return { spentUsd, stops: c.stops.map((s) => ({ ...s })) };
    },
    stopped: () => totalStop,
    hide,
    async close() {
      current?.ac.abort();
      current = null;
      meter.onStop = undefined;
      rmSync(configDir, { recursive: true, force: true });
      if (usedDrive) await (deps.releaseDrive ?? releaseShotDrive)().catch(() => {});
    },
  };
}

/** The models a set uses by default: the app's own defaults (runner/src/models.ts), so an eval measures what ships. aim is
 *  the experimental pointing lane's (--lane computer_use). */
export const DEFAULT_MODELS = { agent: MODELS.agent, diagnose: MODELS.diagnose, review: MODELS.review, fast: usualModel("quick"), vision: MODELS.vision, aim: MODELS.aim, grader: MODELS.agent } as const;
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

/** Reads the command line every set shares. A cap that is not a positive number is refused, never guessed. `models`: a
 *  set's own defaults where they differ from the app's (the aim eval reads the app's settings for its lane). */
export function parseArgs(argv: string[], defaults: { perCaseUsd: number; totalUsd: number; models?: Partial<Record<ModelRole, string>> }): EvalArgs {
  const a: EvalArgs = { spend: false, only: [], perCaseUsd: defaults.perCaseUsd, totalUsd: defaults.totalUsd, models: { ...DEFAULT_MODELS, ...(defaults.models ?? {}) }, extra: {}, help: false };
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
  --spend            really call Claude, through the real run harness (the key from the companion-dev Keychain item)
  --only a,b         run only these case ids
  --per-case 0.6     the most one case may spend, in dollars
  --total 8          stop starting new cases once this much has been spent, in dollars
  --out file.json    where the results file goes (dry: a temporary folder; spend: this set's results folder)
  --agent-model id, --review-model id, --fast-model id, --vision-model id, --aim-model id, --grader-model id, --diagnose-model id`;
