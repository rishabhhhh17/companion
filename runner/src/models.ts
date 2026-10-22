// Every model id Companion uses by default, in one place (T10: "keep model ids in config, not code"). The runner reads them
// here and the app's pages send the agent ones with each command. For testing, settings can switch them: COMPANION_MODEL for
// agent sessions, COMPANION_FAST_MODEL and COMPANION_VISION_MODEL for the two small lanes, COMPANION_AIM_MODEL for the
// experimental pointing lane (see engines.ts). Haiku 4.5 retires "not sooner than October 15, 2026". Checked on 19 Oct 2026
// against Anthropic's model list as bundled with the Claude API notes (cached 6 Oct 2026, not the live list): Haiku 4.5 is
// still listed as active. Check the live list again before shipping; changing the fast default is the founder's call.
import { defaultOf } from "../../protocol/settings.ts";

export const MODELS = {
  // Agent sessions (Drive, Research, the practice fix). T10 names Opus 5.5 for planning; planning still uses this one today.
  agent: "claude-sonnet-5-5",
  // Rescue's diagnosis.
  diagnose: "claude-opus-5-5",
  // The second reviewer of risky changes (proof rung 7), when it is switched on.
  review: "claude-opus-5-5",
  // The fast lane: Prompt help, Explain, Draw it for me.
  fast: "claude-haiku-4-5-20251001",
  // The vision lane: Show me how.
  vision: "claude-sonnet-5-5",
  // The experimental pointing lane through the Computer Use tool (COMPANION_AIM=computer_use).
  aim: "claude-sonnet-5-5",
} as const;

// ---------- the choices a person can make in Settings ----------
// "Claude for tasks, plans and research" (model.work), "Claude for Rescue" (model.rescue) and "Claude for quick answers"
// (model.quick). A setting holds an option id, never a model id, so a model upgrade here never breaks a saved choice. Each
// option names the real smoke test case (runner/scripts/smoke-real.ts) that runs it in that job. An option other than the
// usual one is offered only once its case has passed in a real run; until then a saved choice of it still gets the usual
// model, and the Settings row is hidden while it would offer only one option.
export type ChoiceJob = "work" | "rescue" | "quick";
type Choice = { model: string; smoke: string };
export const MODEL_CHOICES: { work: Record<"recommended" | "careful", Choice>; rescue: Record<"careful" | "recommended", Choice>; quick: Record<"fast" | "recommended", Choice> } = {
  work: { recommended: { model: MODELS.agent, smoke: "main-engine-sonnet55" }, careful: { model: "claude-opus-5-5", smoke: "main-engine-opus55" } },
  rescue: { careful: { model: MODELS.diagnose, smoke: "rescue-opus55" }, recommended: { model: "claude-sonnet-5-5", smoke: "rescue-sonnet55" } },
  quick: { fast: { model: MODELS.fast, smoke: "fast-haiku45" }, recommended: { model: "claude-sonnet-5-5", smoke: "fast-sonnet55" } },
};
const SETTING_OF: Record<ChoiceJob, string> = { work: "model.work", rescue: "model.rescue", quick: "model.quick" };
/** The usual option, from the settings registry (today's model). */
const usualChoice = (job: ChoiceJob): string => String(defaultOf(SETTING_OF[job]));
/** The smoke cases that have passed in a real run (bun run scripts/smoke-real.ts --spend), added here by hand by whoever ran
 *  it, with the date in docs/decisions/T10-model-routing-three-lanes.md. These six passed on 21 Oct 2026 (smoke test, 13 of 13). */
export const SMOKE_PASSED: readonly string[] = ["main-engine-sonnet55", "main-engine-opus55", "rescue-opus55", "rescue-sonnet55", "fast-haiku45", "fast-sonnet55"];
const choicesOf = (job: ChoiceJob): Record<string, Choice> => MODEL_CHOICES[job] as Record<string, Choice>;
/** The options Settings may offer for a job, in the registry's order: the usual one always, any other once its case passed. */
export function offeredChoices(job: ChoiceJob, passed: readonly string[] = SMOKE_PASSED): string[] {
  return Object.entries(choicesOf(job)).filter(([id, c]) => id === usualChoice(job) || passed.includes(c.smoke)).map(([id]) => id);
}
/** The model for a saved option: its own when it is offered, otherwise (not offered yet, or not an option at all) the
 *  usual option's, which is today's model. Never a guess from the value itself. */
export function modelForChoice(job: ChoiceJob, option: unknown, passed: readonly string[] = SMOKE_PASSED): string {
  const all = choicesOf(job);
  const id = typeof option === "string" && Object.hasOwn(all, option) && offeredChoices(job, passed).includes(option) ? option : usualChoice(job);
  return all[id].model;
}
/** The usual option's model for a job (today's model): what a cost figure written for that job was set against. */
export function usualModel(job: ChoiceJob): string {
  return choicesOf(job)[usualChoice(job)].model;
}

// ---------- what each model accepts ----------
// From the Claude API notes of 17 Oct 2026 (the model migration guide's sections on Sonnet 5.5, Opus 5.5 and Haiku 5.5, and
// the models table). Every request Companion builds is checked against this in runner/test/model-shapes.test.ts, for the
// default models and for every id a tester can switch in. A model that is not in the table gets the plain request only (no
// thinking setting, no effort, no computer use): the model's own defaults are the one shape that is always accepted.
// UNPROVEN until a real run: these are the documented rules, not yet seen against the live API (docs/milestones/M11-real-run-checklist.md).

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly string[] = ["low", "medium", "high", "xhigh", "max"];
const UP_TO_HIGH: readonly string[] = ["low", "medium", "high"];
/** What the request says about thinking, in the Agent SDK's own words (its ThinkingConfig and `effort` options). */
export type SdkThinking = { thinking?: { type: "adaptive" } | { type: "disabled" }; effort?: Effort };
/** quick: one turn short answers where speed is the product (Prompt help, Explain, Draw it, Show me how, pointing).
 *  agent: working sessions with tools (Drive, Rescue, Research, the reviewer). */
export type Purpose = "quick" | "agent";
/** Dollars per million tokens. cacheWrite is the five minute rate. */
type Price = { in: number; out: number; cacheRead: number; cacheWrite: number };

type Rule = {
  /** How thinking can be turned off. never: not at all (effort is the only control). between_tools: only with that value,
   *  never "disabled". up_to_high: "disabled" at effort high or below. always: "disabled" at any setting. */
  off: "never" | "between_tools" | "up_to_high" | "always";
  budget: boolean;          // takes {type: "enabled", budget_tokens}
  adaptive: boolean;        // takes {type: "adaptive"}
  effort: Effort | null;    // its default effort; null when it takes no effort setting at all
  forcedTools: boolean;     // takes tool_choice "any" or "tool"
  prefill: boolean;         // takes a last assistant turn
  sampling: boolean;        // takes a non default temperature, top_p or top_k
  /** The computer use tool shapes it takes on the Claude API, as far as the notes say. Companion only ever sends the toolset. */
  computer: string[];
  price: Price;
  /** A second rate card for long prompts: above `over` prompt tokens (input, cache reads and cache writes together), the
   *  whole request is priced at `price`. */
  long?: { over: number; price: Price };
  quick: SdkThinking;
  agent: SdkThinking;
};

const TOOLSET = "computer_toolset_20260801";
// Short answers: adaptive thinking at low effort on the models that cannot turn thinking off through the SDK (the notes'
// preferred route for Sonnet 5.5 too: the pinned Agent SDK 0.3.293 has no way to send "between_tools"). Working sessions:
// effort stated as the notes advise ("medium" for agentic coding), never left to a default that differs by model.
const QUICK_ADAPTIVE: SdkThinking = { thinking: { type: "adaptive" }, effort: "low" };
const RULES: Record<string, Rule> = {
  "claude-opus-5-5": { off: "never", budget: false, adaptive: true, effort: "medium", forcedTools: false, prefill: false, sampling: false, computer: [TOOLSET], price: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 }, quick: QUICK_ADAPTIVE, agent: { effort: "medium" } },
  "claude-sonnet-5-5": { off: "between_tools", budget: false, adaptive: true, effort: "high", forcedTools: false, prefill: false, sampling: false, computer: [TOOLSET], price: { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 }, quick: QUICK_ADAPTIVE, agent: { effort: "medium" } },
  // Haiku 5.5 takes "disabled" at high effort or below, but the notes say to use effort as the lever, and the bundled Claude
  // Code marks it as refusing thinking off (read from its model table, not run), so short answers use adaptive at low effort.
  // Two rate cards, chosen by prompt length: a prompt over 100K tokens costs five times as much, in and out.
  "claude-haiku-5-5": { off: "up_to_high", budget: false, adaptive: true, effort: "medium", forcedTools: true, prefill: false, sampling: false, computer: [TOOLSET], price: { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, long: { over: 100_000, price: { in: 0.5, out: 2.5, cacheRead: 0.05, cacheWrite: 0.625 } }, quick: QUICK_ADAPTIVE, agent: { effort: "medium" } },
  "claude-haiku-4-5": { off: "always", budget: true, adaptive: false, effort: null, forcedTools: true, prefill: true, sampling: true, computer: ["computer_20250124"], price: { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 }, quick: { thinking: { type: "disabled" } }, agent: {} },
  // The previous generation, for testers who switch to them. Their own defaults for working sessions are kept.
  "claude-opus-5": { off: "up_to_high", budget: false, adaptive: true, effort: "high", forcedTools: true, prefill: false, sampling: false, computer: [TOOLSET, "computer_20251124"], price: { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 }, quick: QUICK_ADAPTIVE, agent: {} },
  "claude-sonnet-5": { off: "up_to_high", budget: false, adaptive: true, effort: "high", forcedTools: true, prefill: false, sampling: false, computer: ["computer_20251124"], price: { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 }, quick: QUICK_ADAPTIVE, agent: {} },
};
/** Every model id the table knows (the dated Haiku 4.5 id and a "[1m]" suffix are the same models). */
export const KNOWN_MODELS = Object.keys(RULES);
// An unknown model is priced at the dearest current list price, so a spending stop never trusts a guess that is too low:
// Claude Fable 5.1 and Mythos 5.1, $10 in and $50 out per million tokens (the Claude API notes' model table, cached 6 Oct
// 2026). Their cache read is $0.25; $1 is kept here, and the cache write at the five minute rate of 1.25 times the input,
// both on the high side on purpose. Before 20 Oct 2026 (audit A36) this was Opus 5's $5 and $25, half the dearest price, so
// a tester's switch to an unlisted model could overshoot a spending stop up to two times.
const UNKNOWN_PRICE: Price = { in: 10, out: 50, cacheRead: 1, cacheWrite: 12.5 };

/** A model's list price in dollars per million tokens (in and out), or null for a model the table does not know. */
export function listPrice(model: string): { in: number; out: number } | null {
  const r = ruleOf(model);
  return r ? { in: r.price.in, out: r.price.out } : null;
}

/** How many times dearer `model` is than `base` at list price: the larger of the input and output ratios, so a figure scaled
 *  by it to say "at most" never comes out low. A model the table does not know is priced as the dearest one known. */
export function priceRatio(model: string, base: string): number {
  const p = ruleOf(model)?.price ?? UNKNOWN_PRICE, b = ruleOf(base)?.price ?? UNKNOWN_PRICE;
  return Math.max(p.in / b.in, p.out / b.out);
}

/** "claude-haiku-4-5-20251001" -> "claude-haiku-4-5"; "claude-sonnet-5-5[1m]" -> "claude-sonnet-5-5". */
export function canonicalModel(id: string): string {
  return String(id ?? "").trim().toLowerCase().replace(/\[1m\]$/, "").replace(/-\d{8}$/, "");
}
const ruleOf = (id: string): Rule | undefined => (Object.hasOwn(RULES, canonicalModel(id)) ? RULES[canonicalModel(id)] : undefined);

/** The thinking and effort options for the Agent SDK, for this model and job. Spread into the query options. */
export function thinkingFor(model: string, purpose: Purpose): SdkThinking {
  const r = ruleOf(model);
  if (!r) return {};
  const s = r[purpose];
  return { ...(s.thinking ? { thinking: { ...s.thinking } } : {}), ...(s.effort ? { effort: s.effort } : {}) };
}

/** The same, spelled for a direct Messages API body (effort goes in output_config). */
export function apiShape(model: string, purpose: Purpose): { thinking?: SdkThinking["thinking"]; output_config?: { effort: Effort } } {
  const s = thinkingFor(model, purpose);
  return { ...(s.thinking ? { thinking: s.thinking } : {}), ...(s.effort ? { output_config: { effort: s.effort } } : {}) };
}

/** The computer use tool type to send to this model on the Claude API, or null when Companion knows none it takes. Only the
 *  toolset is ever sent (the older single tool returns 400 on Sonnet 5.5 and Opus 5.5). */
export function computerToolFor(model: string): typeof TOOLSET | null {
  return ruleOf(model)?.computer.includes(TOOLSET) ? TOOLSET : null;
}

// ---------- web search (Second Look only) ----------
// The web search server tool on the Messages API, for Second Look's checks on the plain API lanes (M14). Source: Anthropic's
// web search tool page, platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, "Usage and pricing", read on
// 22 Oct 2026: "$10 USD per 1,000 searches, plus standard token costs for search-generated content"; a search that fails
// is not billed; the count is usage.server_tool_use.web_search_requests. The results a search brings back are counted as
// input tokens, so they are already in the token cost. UNPROVEN until a real run (check the live page again before shipping).
/** Dollars for one web search. */
export const WEB_SEARCH_USD = 0.01;
/** The tool Companion sends: the basic web search, called directly by the model. The page names it for every current model
 *  (Haiku 4.5 included); the newer versions run searches from inside code execution (dynamic filtering), which Second Look
 *  does not need. The usage proxy forwards only this (usage-proxy/src/filter.ts). */
export const WEB_SEARCH_TOOL = "web_search_20250305";
/** The most searches one Second Look check may make, whatever is saved: the settings registry's top for secondLook.searches,
 *  and what the usage proxy allows. */
export const MAX_SEARCHES = 5;

type UsageLike = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } | null } | null | undefined;
const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
/** How many web searches a reply made (whole searches only). */
export const searchesOf = (u: UsageLike): number => Math.floor(n(u && typeof u === "object" ? u.server_tool_use?.web_search_requests : 0));
/** What a reply cost by its token counts, at this model's list price (the long prompt card when its prompt is over the
 *  line), plus its web searches. One request's usage at a time: the card is chosen per request. An estimate: always
 *  labelled as one where shown. */
export function estimateUsd(model: string, u: UsageLike): number {
  if (!u || typeof u !== "object") return 0;
  const r = ruleOf(model);
  const prompt = n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
  const p = r ? (r.long && prompt > r.long.over ? r.long.price : r.price) : UNKNOWN_PRICE;
  return (n(u.input_tokens) * p.in + n(u.output_tokens) * p.out + n(u.cache_read_input_tokens) * p.cacheRead + n(u.cache_creation_input_tokens) * p.cacheWrite) / 1e6 + searchesOf(u) * WEB_SEARCH_USD;
}

/** A request, in the parts that decide whether a model accepts it. via "sdk": sent through the pinned Agent SDK, which can
 *  only pass the thinking types adaptive, enabled and disabled. */
export type RequestParts = {
  thinking?: Record<string, unknown> | null; effort?: string | null; tool_choice?: { type?: string; name?: string } | null;
  temperature?: number; top_p?: number; top_k?: number; lastRole?: "user" | "assistant"; tools?: unknown[]; betas?: string[]; via?: "sdk" | "api";
};

/** Every reason this model would refuse the request (an empty list: it is accepted, as far as the notes say). */
export function requestProblems(model: string, q: RequestParts): string[] {
  const r = ruleOf(model);
  const out: string[] = [];
  const effort = q.effort ?? undefined;
  const t = q.thinking ?? undefined;
  if (effort !== undefined) {
    if (!r) out.push(`${model} is not in Companion's model table, so no effort is sent to it`);
    else if (r.effort === null) out.push(`${model} takes no effort setting`);
    else if (!EFFORTS.includes(effort)) out.push(`"${effort}" is not an effort level`);
  }
  const atOrBelowHigh = UP_TO_HIGH.includes(effort ?? r?.effort ?? "high");
  if (t !== undefined) {
    const type = String((t as { type?: unknown }).type);
    const extra = Object.keys(t).filter((k) => k !== "type");
    if (!r) out.push(`${model} is not in Companion's model table, so no thinking setting is sent to it`);
    else if (type === "disabled") {
      if (r.off === "never" || r.off === "between_tools") out.push(`${model} refuses thinking type "disabled"${r.off === "between_tools" ? ' (its off switch is "between_tools")' : ""}`);
      else if (r.off === "up_to_high" && !atOrBelowHigh) out.push(`${model} takes thinking off only at effort high or below`);
      if (extra.length) out.push(`thinking "disabled" takes no other field (${extra.join(", ")})`);
    } else if (type === "between_tools") {
      if (q.via === "sdk") out.push('the pinned Agent SDK cannot send thinking "between_tools"');
      if (r.off !== "between_tools") out.push(`${model} refuses thinking type "between_tools"`);
      else if (!atOrBelowHigh) out.push(`${model} takes "between_tools" only at effort high or below`);
      if (extra.length) out.push(`thinking "between_tools" takes no other field (${extra.join(", ")})`);
    } else if (type === "enabled") {
      if (!r.budget) out.push(`${model} refuses a thinking budget (type "enabled")`);
    } else if (type === "adaptive") {
      if (!r.adaptive) out.push(`${model} does not take adaptive thinking`);
      if (extra.some((k) => k !== "display" && k !== "block_binding")) out.push("adaptive thinking takes only display and block_binding");
    } else out.push(`"${type}" is not a thinking type`);
  }
  const choice = q.tool_choice?.type;
  if ((choice === "any" || choice === "tool") && !r?.forcedTools) out.push(`${model} refuses tool_choice "${choice}"`);
  const sampled = (q.temperature !== undefined && q.temperature !== 1) || q.top_p !== undefined || q.top_k !== undefined;
  if (sampled && !r?.sampling) out.push(`${model} refuses a non default temperature, top_p or top_k`);
  if (q.lastRole === "assistant" && !r?.prefill) out.push(`${model} refuses an assistant prefill (the last turn must be the user's)`);
  const tools = (q.tools ?? []) as Record<string, unknown>[];
  const computers = tools.filter((x) => x && typeof x === "object" && (String(x.type).startsWith("computer_") || x.name === "computer"));
  for (const c of computers) {
    const type = String(c.type);
    if (!r || !r.computer.includes(type)) out.push(`${model} is not known to take computer use as "${type}"`);
    if (type === TOOLSET) {
      const bad = Object.keys(c).filter((k) => k !== "type" && k !== "configs");
      if (bad.length) out.push(`the computer toolset takes no ${bad.join(", ")}`);
      if (computers.length > 1) out.push("the computer toolset cannot share a request with another computer tool");
      if ((q.betas ?? []).some((b) => /^computer-use-/.test(b))) out.push("the computer toolset needs no beta header");
    }
  }
  return out;
}
