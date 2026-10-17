// Every model id Companion uses by default, in one place (T10: "keep model ids in config, not code"). The runner reads them
// here and the app's pages send the agent ones with each command. For testing, settings can switch them: COMPANION_MODEL for
// agent sessions, COMPANION_FAST_MODEL and COMPANION_VISION_MODEL for the two small lanes, COMPANION_AIM_MODEL for the
// experimental pointing lane (see engines.ts). Haiku 4.5 retires "not sooner than October 15, 2026": check before then.
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
// An unknown model is priced as the dearest one known, so a spending stop never trusts a guess that is too low.
const UNKNOWN_PRICE: Price = { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 };

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

type UsageLike = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null | undefined;
const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
/** What a reply cost by its token counts, at this model's list price (the long prompt card when its prompt is over the
 *  line). One request's usage at a time: the card is chosen per request. An estimate: always labelled as one where shown. */
export function estimateUsd(model: string, u: UsageLike): number {
  if (!u || typeof u !== "object") return 0;
  const r = ruleOf(model);
  const prompt = n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens);
  const p = r ? (r.long && prompt > r.long.over ? r.long.price : r.price) : UNKNOWN_PRICE;
  return (n(u.input_tokens) * p.in + n(u.output_tokens) * p.out + n(u.cache_read_input_tokens) * p.cacheRead + n(u.cache_creation_input_tokens) * p.cacheWrite) / 1e6;
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
