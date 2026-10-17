// Every Claude call Companion makes must be a request the model it goes to accepts, for the default models and for the
// ones a tester can switch in (COMPANION_MODEL, COMPANION_FAST_MODEL, COMPANION_VISION_MODEL, COMPANION_AIM_MODEL).
// The facts are the Claude API notes of 17 Oct 2026 (model migration guide: Sonnet 5.5, Opus 5.5, Haiku 5.5). They live in
// one place, runner/src/models.ts; requestProblems() is the check, and every builder is held to it here. No call is made.
import { describe, expect, test } from "bun:test";
import { KNOWN_MODELS, MODELS, apiShape, computerToolFor, estimateUsd, requestProblems, thinkingFor } from "../src/models.ts";
import { buildFastOptions, buildVisionOptions } from "../src/lanes.ts";
import { buildSdkOptions } from "../src/sdkEngine.ts";
import { buildRequest } from "../src/aim.ts";

const UNKNOWN = "claude-something-new-9";
const EVERY = [...new Set([...KNOWN_MODELS, ...Object.values(MODELS), "claude-haiku-4-5-20251001", UNKNOWN])];
const sig = new AbortController().signal;
const sdkShape = (o: any) => ({ thinking: o.thinking, effort: o.effort, via: "sdk" as const });

describe("the check itself, against the documented 400s", () => {
  test("Sonnet 5.5 refuses thinking off as 'disabled'; 'between_tools' is its off switch, only at high effort or below, alone", () => {
    expect(requestProblems("claude-sonnet-5-5", { thinking: { type: "disabled" } })).not.toEqual([]);
    expect(requestProblems("claude-sonnet-5-5", { thinking: { type: "between_tools" }, effort: "high" })).toEqual([]);
    expect(requestProblems("claude-sonnet-5-5", { thinking: { type: "between_tools" }, effort: "xhigh" })).not.toEqual([]);
    expect(requestProblems("claude-sonnet-5-5", { thinking: { type: "between_tools", display: "summarized" } })).not.toEqual([]);
    expect(requestProblems("claude-haiku-5-5", { thinking: { type: "between_tools" } })).not.toEqual([]);
    // The pinned Agent SDK has no way to send it (its ThinkingConfig and flag mapping know only adaptive, enabled, disabled).
    expect(requestProblems("claude-sonnet-5-5", { thinking: { type: "between_tools" }, via: "sdk" })).not.toEqual([]);
  });
  test("Opus 5.5 refuses thinking off and a thinking budget at every effort; effort is the control", () => {
    for (const effort of [undefined, "low", "medium", "high"] as const) {
      expect(requestProblems("claude-opus-5-5", { thinking: { type: "disabled" }, effort })).not.toEqual([]);
      expect(requestProblems("claude-opus-5-5", { thinking: { type: "enabled", budget_tokens: 2000 }, effort })).not.toEqual([]);
    }
    expect(requestProblems("claude-opus-5-5", { thinking: { type: "adaptive" }, effort: "low" })).toEqual([]);
  });
  test("Haiku 5.5 takes thinking off only at high effort or below, and no thinking budget", () => {
    for (const effort of [undefined, "low", "medium", "high"] as const) expect(requestProblems("claude-haiku-5-5", { thinking: { type: "disabled" }, effort })).toEqual([]);
    for (const effort of ["xhigh", "max"] as const) expect(requestProblems("claude-haiku-5-5", { thinking: { type: "disabled" }, effort })).not.toEqual([]);
    expect(requestProblems("claude-haiku-5-5", { thinking: { type: "enabled", budget_tokens: 1024 } })).not.toEqual([]);
  });
  test("Haiku 4.5 takes no effort setting, and thinking off is fine", () => {
    expect(requestProblems("claude-haiku-4-5-20251001", { effort: "low" })).not.toEqual([]);
    expect(requestProblems("claude-haiku-4-5-20251001", { thinking: { type: "disabled" } })).toEqual([]);
  });
  test("forced tool choice is refused on Opus 5.5 and Sonnet 5.5, not on Haiku 5.5", () => {
    for (const m of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
      expect(requestProblems(m, { tool_choice: { type: "any" } })).not.toEqual([]);
      expect(requestProblems(m, { tool_choice: { type: "tool", name: "x" } })).not.toEqual([]);
      expect(requestProblems(m, { tool_choice: { type: "auto" } })).toEqual([]);
    }
    expect(requestProblems("claude-haiku-5-5", { tool_choice: { type: "any" } })).toEqual([]);
  });
  test("an assistant prefill is refused on the new family; Haiku 4.5 takes it", () => {
    for (const m of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) expect(requestProblems(m, { lastRole: "assistant" })).not.toEqual([]);
    expect(requestProblems("claude-haiku-4-5", { lastRole: "assistant" })).toEqual([]);
  });
  test("a non default temperature, top_p or top_k is refused on Sonnet 5.5 and Haiku 5.5", () => {
    for (const m of ["claude-sonnet-5-5", "claude-haiku-5-5"]) {
      expect(requestProblems(m, { temperature: 0 })).not.toEqual([]);
      expect(requestProblems(m, { top_p: 0.5 })).not.toEqual([]);
      expect(requestProblems(m, { top_k: 5 })).not.toEqual([]);
      expect(requestProblems(m, { temperature: 1 })).toEqual([]);
    }
    expect(requestProblems("claude-haiku-4-5", { temperature: 0 })).toEqual([]);
  });
  test("computer use on Sonnet 5.5 and Opus 5.5 is only the toolset: no name, no display size, no beta header", () => {
    const old = { type: "computer_20251124", name: "computer", display_width_px: 1280, display_height_px: 800 };
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5"]) {
      expect(requestProblems(m, { tools: [old], betas: ["computer-use-2025-11-24"] })).not.toEqual([]);
      expect(requestProblems(m, { tools: [{ type: "computer_toolset_20260801" }] })).toEqual([]);
      expect(requestProblems(m, { tools: [{ type: "computer_toolset_20260801", configs: { zoom: { enabled: false } } }] })).toEqual([]);
      expect(requestProblems(m, { tools: [{ type: "computer_toolset_20260801", name: "computer" }] })).not.toEqual([]);
      expect(requestProblems(m, { tools: [{ type: "computer_toolset_20260801", display_width_px: 1280 }] })).not.toEqual([]);
      expect(requestProblems(m, { tools: [{ type: "computer_toolset_20260801" }], betas: ["computer-use-2025-11-24"] })).not.toEqual([]);
      expect(requestProblems(m, { tools: [{ type: "computer_toolset_20260801" }, old] })).not.toEqual([]);
    }
  });
  test("a model the table does not know gets only the plain request: anything model specific is a problem", () => {
    expect(requestProblems(UNKNOWN, {})).toEqual([]);
    expect(requestProblems(UNKNOWN, { thinking: { type: "disabled" } })).not.toEqual([]);
    expect(requestProblems(UNKNOWN, { effort: "low" })).not.toEqual([]);
    expect(requestProblems(UNKNOWN, { tools: [{ type: "computer_toolset_20260801" }] })).not.toEqual([]);
  });
  test("a dated id and a long context suffix are the same model", () => {
    for (const id of ["claude-haiku-4-5-20251001", "claude-haiku-4-5"]) {
      expect(requestProblems(id, { effort: "low" })).toHaveLength(1);
      expect(requestProblems(id, { thinking: { type: "disabled" } })).toEqual([]);
    }
    expect(requestProblems("claude-sonnet-5-5[1m]", { thinking: { type: "disabled" } })).not.toEqual([]);
  });
});

describe("every builder sends a shape its model accepts, for every model id", () => {
  for (const model of EVERY) {
    test(`fast lane on ${model}`, () => {
      expect(requestProblems(model, sdkShape(buildFastOptions({ claudeBinary: "/x", env: {}, model, signal: sig })))).toEqual([]);
    });
    test(`vision lane on ${model}`, () => {
      expect(requestProblems(model, sdkShape(buildVisionOptions({ claudeBinary: "/x", env: {}, model, signal: sig })))).toEqual([]);
    });
    test(`agent session and planning on ${model}`, () => {
      for (const planOnly of [false, true]) {
        const o = buildSdkOptions({ project: "/tmp", model, budgetUsd: 1, claudeBinary: "/x", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: sig, planOnly });
        expect(requestProblems(model, sdkShape(o))).toEqual([]);
      }
    });
    if (computerToolFor(model)) test(`pointing lane request on ${model}`, () => {
      const b = buildRequest({ model, image: { base64: "AAAA", mediaType: "image/png", w: 1280, h: 800 }, question: "q", ocr: [] }) as any;
      const last = b.messages[b.messages.length - 1];
      expect(requestProblems(model, { thinking: b.thinking, effort: b.output_config?.effort, tools: b.tools, tool_choice: b.tool_choice, temperature: b.temperature, top_p: b.top_p, top_k: b.top_k, lastRole: last.role, via: "api" })).toEqual([]);
    });
  }
});

describe("the shape chosen for each model", () => {
  test("short answers (fast and vision lanes): thinking off where the model allows it, else adaptive at low effort", () => {
    expect(thinkingFor("claude-haiku-4-5-20251001", "quick")).toEqual({ thinking: { type: "disabled" } });
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]) expect(thinkingFor(m, "quick")).toEqual({ thinking: { type: "adaptive" }, effort: "low" });
    expect(thinkingFor(UNKNOWN, "quick")).toEqual({});
  });
  test("working sessions: medium effort, stated, on the 5.5 models; nothing extra on Haiku 4.5 or an unknown model", () => {
    for (const m of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]) expect(thinkingFor(m, "agent")).toEqual({ effort: "medium" });
    expect(thinkingFor("claude-haiku-4-5-20251001", "agent")).toEqual({});
    expect(thinkingFor(UNKNOWN, "agent")).toEqual({});
  });
  test("the lanes and the engine use it", () => {
    const fast: any = buildFastOptions({ claudeBinary: "/x", env: {}, model: MODELS.fast, signal: sig });
    expect(fast.thinking).toEqual({ type: "disabled" }); expect(fast.effort).toBeUndefined();
    const vision: any = buildVisionOptions({ claudeBinary: "/x", env: {}, model: MODELS.vision, signal: sig });
    expect(vision.thinking).toEqual({ type: "adaptive" }); expect(vision.effort).toBe("low");
    const agent: any = buildSdkOptions({ project: "/tmp", model: MODELS.agent, budgetUsd: 1, claudeBinary: "/x", env: {}, authorize: async () => ({ allow: true, reason: "" }), signal: sig });
    expect(agent.effort).toBe("medium"); expect(agent.thinking).toBeUndefined();
  });
  test("the raw API shape spells effort as output_config", () => {
    expect(apiShape("claude-sonnet-5-5", "quick")).toEqual({ thinking: { type: "adaptive" }, output_config: { effort: "low" } });
    expect(apiShape("claude-haiku-4-5", "quick")).toEqual({ thinking: { type: "disabled" } });
    expect(apiShape(UNKNOWN, "quick")).toEqual({});
  });
});

describe("cost estimates use each model's own price", () => {
  const u = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
  test("per million tokens in and out", () => {
    expect(estimateUsd("claude-sonnet-5-5", u)).toBeCloseTo(12, 6);
    expect(estimateUsd("claude-opus-5-5", u)).toBeCloseTo(24, 6);
    expect(estimateUsd("claude-haiku-4-5-20251001", u)).toBeCloseTo(6, 6);
  });
  test("Haiku 5.5 has two rate cards: a prompt over 100K tokens is priced at the higher one", () => {
    // $0.10 / $0.50 a million at 100K prompt tokens or fewer; $0.50 / $2.50 above (cache reads 0.1x, cache writes 1.25x the input rate).
    expect(estimateUsd("claude-haiku-5-5", { input_tokens: 100_000, output_tokens: 1_000_000 })).toBeCloseTo(0.01 + 0.5, 6);
    expect(estimateUsd("claude-haiku-5-5", { input_tokens: 150_000, output_tokens: 1_000 })).toBeCloseTo(0.075 + 0.0025, 6);
    // The prompt is everything sent in, cached or not.
    expect(estimateUsd("claude-haiku-5-5", { input_tokens: 10_000, cache_read_input_tokens: 95_000 })).toBeCloseTo(0.005 + 0.00475, 6);
    expect(estimateUsd("claude-haiku-5-5", { input_tokens: 1_000, cache_creation_input_tokens: 120_000 })).toBeCloseTo(0.0005 + 0.075, 6);
    expect(estimateUsd("claude-haiku-5-5", u)).toBeCloseTo(3, 6);
    // Haiku 4.5 is one price at any length.
    expect(estimateUsd("claude-haiku-4-5", { input_tokens: 150_000 })).toBeCloseTo(0.15, 6);
  });
  test("cache reads and writes are priced as such", () => {
    expect(estimateUsd("claude-sonnet-5-5", { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2, 6);
    expect(estimateUsd("claude-sonnet-5-5", { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(2.5, 6);
  });
  test("an unknown model is priced high rather than low, so a spending stop never trusts a guess", () => {
    expect(estimateUsd(UNKNOWN, u)).toBeGreaterThanOrEqual(estimateUsd("claude-opus-5-5", u));
  });
  test("missing or odd usage counts as nothing", () => {
    expect(estimateUsd("claude-sonnet-5-5", undefined)).toBe(0);
    expect(estimateUsd("claude-sonnet-5-5", { input_tokens: -5, output_tokens: Number.NaN } as never)).toBe(0);
  });
});
