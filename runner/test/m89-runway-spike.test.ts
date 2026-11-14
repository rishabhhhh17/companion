// M89 spike (research feature 5, usage runway; complaints F1 to F9 in research-1113/user-needs.md): what the pinned Agent SDK
// (0.3.293) and its bundled Claude Code really report about usage limits. The SDK's own bundled binary runs against a stand
// in model on this Mac (a tiny server on 127.0.0.1 that answers like the Messages API, with the plan's rate limit headers),
// with a throwaway CLAUDE_CONFIG_DIR and HOME, a made up key that only ever goes to that server, no settings files, no
// connectors, no tools. Never a real model, never a credential file, never the Keychain. Findings, written to
// docs/research/technical_research.md section 20 (question 49):
//   1. API key route: no rate_limit_event, even when the answer carries every anthropic-ratelimit-unified header, and the
//      SDK's usage call says rate_limits_available false and subscription_type null. So nothing tells how much is left.
//   2. A request turned away (429 rate_limit_error) is seen: an api_retry system message (error "rate_limit", error_status
//      429, retry_delay_ms from retry-after) for each try, then a reply with error "rate_limit". runway.ts reads both.
//   3. Plan route: not run here (it needs a plan login, which tests never use). Seen once on a real Max plan (M91, 14 Nov
//      2026, approved by the founder; fixtures/real-run-1114): system/init (apiKeySource "none"), assistant, assistant,
//      rate_limit_event, result. The event comes on every turn, even with status "allowed"; it has no top level utilization;
//      the share per window (a fraction, 0 to 1) and its reset (seconds) are in rate_limit_info.unifiedWindows, which the
//      SDK's type does not name yet. The test at the end reads that real shape.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolveClaudeBinary } from "../src/sdkEngine.ts";
import { fromRateLimitEvent, fromRetry } from "../src/runway.ts";

let binary = "";
try { binary = resolveClaudeBinary(); } catch { binary = ""; }
const made: string[] = [];
const tmp = (l: string) => { const d = realpathSync(mkdtempSync(join(tmpdir(), `companion-test-m89-${l}-`))); made.push(d); return d; };
afterAll(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

type Mode = "warning" | "rejected";
const RESET = Math.floor(Date.UTC(2030, 0, 1, 15, 40) / 1000);
// The plan's rate limit headers, as named inside the bundled binary (found with `strings`, 14 Nov 2026).
const PLAN_HEADERS = (mode: Mode): Record<string, string> => ({
  "anthropic-ratelimit-unified-status": mode === "rejected" ? "rejected" : "allowed_warning",
  "anthropic-ratelimit-unified-reset": String(RESET),
  "anthropic-ratelimit-unified-representative-claim": "five_hour",
  "anthropic-ratelimit-unified-5h-utilization": "0.91",
  "anthropic-ratelimit-unified-5h-reset": String(RESET),
  "anthropic-ratelimit-unified-5h-surpassed-threshold": "0.9",
  "anthropic-ratelimit-unified-7d-utilization": "0.4",
  "anthropic-ratelimit-unified-7d-reset": String(RESET + 86_400),
  "anthropic-ratelimit-unified-overage-status": "rejected",
});
const sse = (model: string) => [
  ["message_start", { type: "message_start", message: { id: `msg_${Math.random().toString(36).slice(2)}`, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } }],
  ["message_stop", { type: "message_stop" }],
].map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`).join("");

let server: ReturnType<typeof Bun.serve> | null = null;
let mode: Mode = "warning";
const seen: string[] = [];
beforeAll(() => {
  if (!binary) return;
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const u = new URL(req.url);
    seen.push(`${req.method} ${u.pathname}`);
    const h = { ...PLAN_HEADERS(mode) };
    if (!u.pathname.endsWith("/v1/messages")) return new Response("{}", { headers: { "content-type": "application/json", ...h } });
    const body = (await req.json().catch(() => ({}))) as { model?: string };
    if (mode === "rejected") return new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "rate limited" } }), { status: 429, headers: { "content-type": "application/json", "retry-after": "1", ...h } });
    return new Response(sse(body.model ?? "stand-in"), { headers: { "content-type": "text/event-stream", ...h } });
  } });
});
afterAll(() => { server?.stop(true); });

async function run(m: Mode, retries: number) {
  mode = m;
  const env: Record<string, string> = {
    PATH: "/usr/bin:/bin", HOME: tmp("home"), CLAUDE_CONFIG_DIR: tmp("config"),
    // A made up key: it only ever reaches the stand in on 127.0.0.1.
    ANTHROPIC_API_KEY: "sk-ant-standin-not-a-real-key-000000", ANTHROPIC_BASE_URL: `http://127.0.0.1:${server!.port}`,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1", CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", CLAUDE_CODE_MAX_RETRIES: String(retries),
  };
  const q = query({ prompt: "say ok", options: { cwd: tmp("project"), pathToClaudeCodeExecutable: binary, env, settingSources: [], strictMcpConfig: true, mcpServers: {}, tools: [], permissionMode: "default", maxTurns: 1, model: "claude-haiku-4-5-20251001", persistSession: false } as never });
  const out: any[] = [];
  let usage: any = null;
  try {
    for await (const msg of q as AsyncIterable<any>) {
      out.push(msg);
      if (msg.type === "system" && msg.subtype === "init" && !usage) usage = await (q as any).usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }).catch((e: Error) => ({ error: e.message }));
    }
  } catch { /* an error result ends the stream with a throw; the messages before it are what is looked at */ }
  return { out, usage };
}

describe.skipIf(!binary)("the spike: what the bundled Claude Code reports about usage, against a stand in model", () => {
  test("the API key route, with the plan's headers on every answer: no rate_limit_event, and the usage call says none apply", async () => {
    const { out, usage } = await run("warning", 0);
    const init = out.find((m) => m.type === "system" && m.subtype === "init");
    expect(init.apiKeySource).toBe("ANTHROPIC_API_KEY");
    expect(init.tools).toEqual([]);
    expect(init.mcp_servers ?? []).toEqual([]);
    expect(out.some((m) => m.type === "rate_limit_event")).toBe(false);
    expect(usage).toMatchObject({ rate_limits_available: false, rate_limits: null, subscription_type: null });
    expect(out.find((m) => m.type === "result")).toMatchObject({ subtype: "success", is_error: false, result: "ok" });
    expect(seen.length).toBeGreaterThan(0);
  }, 60_000);
  test("a request turned away (429): api_retry says rate_limit and its wait, then the reply's error says rate_limit; runway.ts reads it", async () => {
    const { out } = await run("rejected", 1);
    const retry = out.find((m) => m.type === "system" && m.subtype === "api_retry");
    expect(retry).toMatchObject({ error: "rate_limit", error_status: 429, attempt: 1, max_retries: 1 });
    expect(retry.retry_delay_ms).toBeGreaterThan(0);
    expect(fromRetry(retry)).toMatchObject({ state: "out", source: "limit_hit" });
    expect(out.find((m) => m.type === "assistant" && m.error)).toMatchObject({ error: "rate_limit" });
    expect(out.some((m) => m.type === "rate_limit_event")).toBe(false);
    const result = out.find((m) => m.type === "result");
    expect(result?.is_error).toBe(true);
  }, 60_000);
});

describe("the plan route's event, in the shape a real Max plan sent it on 14 Nov 2026 (no plan login is ever used in tests)", () => {
  test("rate_limit_event with status allowed and unifiedWindows: the window closest to its limit, its share and its reset", () => {
    const real = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "real-run-1114", "plan-route-say-ok.json"), "utf8"));
    expect(real.init).toMatchObject({ apiKeySource: "none", tools: [], mcp_servers: [] });
    expect(real.rate_limit_event.rate_limit_info.utilization).toBeUndefined();
    expect(fromRateLimitEvent(real.rate_limit_event)).toEqual({ state: "ok", source: "plan", usedPct: 46, resetsAt: new Date(1794888000 * 1000).toISOString(), window: "seven_day" });
    expect(existsSync(join(import.meta.dir, "..", "node_modules", "@anthropic-ai", "claude-agent-sdk", "sdk.d.ts"))).toBe(true);
  });
  test("the older shape the SDK's type names (a top level utilization) is still read", () => {
    expect(fromRateLimitEvent({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", utilization: 0.91, resetsAt: RESET, rateLimitType: "five_hour", overageStatus: "rejected" }, uuid: "u", session_id: "s" }))
      .toEqual({ state: "near", source: "plan", usedPct: 91, resetsAt: new Date(RESET * 1000).toISOString(), window: "five_hour" });
  });
});
