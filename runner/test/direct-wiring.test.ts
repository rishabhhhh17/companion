import { afterEach, describe, expect, test } from "bun:test";
import { createEngine, createLanes, readSettings, MANAGED_NEEDS_OWN_CLAUDE } from "../src/engines.ts";
import { heldKey } from "../src/keychain.ts";
import { PRODUCT, PRODUCT_S } from "../src/names.ts";

// Which lanes the runner uses (F22 update, 22 Oct 2026). The default is unchanged until a real run proves the direct lanes.
const KEY = "sk-ant-api03-WIRING-0000000000000000";
const TOKEN = "cmp_" + "w".repeat(40);
const sse = (text: string) => [{ type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 1 } } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, { type: "message_delta", usage: { output_tokens: 3 } }, { type: "message_stop" }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
function spy() {
  const seen: { url: string; key: string | null }[] = [];
  const fetchFn = (async (url: any, init?: RequestInit) => { seen.push({ url: String(url), key: new Headers(init?.headers).get("x-api-key") }); return new Response(sse("hi"), { headers: { "content-type": "text/event-stream" } }); }) as unknown as typeof fetch;
  return { seen, fetchFn };
}
const sig = () => new AbortController().signal;
const was = process.env.COMPANION_KEY_SOURCE;
afterEach(() => { heldKey.set(null); if (was === undefined) delete process.env.COMPANION_KEY_SOURCE; else process.env.COMPANION_KEY_SOURCE = was; });

describe("settings", () => {
  test("Claude Code lanes stay the default; direct and managed are asked for by name", () => {
    expect(readSettings({}).lanes).toBe("claude_code");
    expect(readSettings({ COMPANION_LANES: "yes" }).lanes).toBe("claude_code");
    expect(readSettings({ COMPANION_LANES: "direct" }).lanes).toBe("direct");
    expect(readSettings({ COMPANION_ROUTE: "managed" }).route).toBe("managed");
    expect(readSettings({ COMPANION_ROUTE: "nonsense" }).route).toBe("api_key");
  });
  test("the usage server's address must be https", () => {
    expect(readSettings({ COMPANION_MANAGED_BASE: "https://usage.example.com" }).managedBase).toBe("https://usage.example.com");
    for (const bad of ["http://usage.example.com", "ftp://x", "not a url", "", "https://"]) expect(readSettings({ COMPANION_MANAGED_BASE: bad }).managedBase, bad).toBeUndefined();
  });
});

describe("the lanes each route gets", () => {
  test("by default nothing goes to the API directly (the Claude Code lanes answer)", async () => {
    process.env.COMPANION_KEY_SOURCE = "app"; heldKey.set(KEY);
    const s = spy();
    let asked = 0;
    const queryFn = (() => { asked++; return (async function* () { yield { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } }; yield { type: "result", subtype: "success", total_cost_usd: 0 }; })(); }) as never;
    const lanes = createLanes(readSettings({ COMPANION_CLAUDE_BIN: "/bin/ls" }), { queryFn, fetchFn: s.fetchFn });
    await lanes.fast.run({ text: "x", raw: true }, () => {}, sig());
    expect(asked).toBe(1);
    expect(s.seen.length).toBe(0);
  });
  test("COMPANION_LANES=direct: the person's own key, straight to Anthropic", async () => {
    const s = spy();
    const lanes = createLanes(readSettings({ COMPANION_LANES: "direct" }), { fetchFn: s.fetchFn, keyFn: async () => KEY });
    const out = await lanes.fast.run({ text: "x", raw: true }, () => {}, sig());
    expect(out.text).toBe("hi");
    expect(s.seen).toEqual([{ url: "https://api.anthropic.com/v1/messages", key: KEY }]);
  });
  test(`managed usage: the ${PRODUCT} sign in token, to ${PRODUCT_S} own server, for every light lane`, async () => {
    const s = spy();
    const lanes = createLanes(readSettings({ COMPANION_ROUTE: "managed", COMPANION_MANAGED_BASE: "https://usage.example.com" }), { fetchFn: s.fetchFn, keyFn: async () => TOKEN });
    await lanes.fast.run({ text: "x" }, () => {}, sig());
    expect(s.seen[0]).toEqual({ url: "https://usage.example.com/v1/messages", key: TOKEN });
    expect(typeof lanes.describe).toBe("function");
    expect(typeof lanes.look).toBe("function");
  });
  test("managed usage with no server address, or no sign in: not connected, nothing sent", async () => {
    const s = spy();
    const noBase = createLanes(readSettings({ COMPANION_ROUTE: "managed" }), { fetchFn: s.fetchFn, keyFn: async () => TOKEN });
    await expect(noBase.fast.run({ text: "x" }, () => {}, sig())).rejects.toThrow(/Not connected/);
    const noToken = createLanes(readSettings({ COMPANION_ROUTE: "managed", COMPANION_MANAGED_BASE: "https://usage.example.com" }), { fetchFn: s.fetchFn, keyFn: async () => null });
    await expect(noToken.fast.run({ text: "x" }, () => {}, sig())).rejects.toThrow(/Not connected/);
    expect(s.seen.length).toBe(0);
  });
  test("managed usage never uses the experimental pointing lane (it needs the person's own key)", async () => {
    const s = spy();
    const lanes = createLanes(readSettings({ COMPANION_ROUTE: "managed", COMPANION_MANAGED_BASE: "https://usage.example.com", COMPANION_AIM: "computer_use" }), { fetchFn: s.fetchFn, keyFn: async () => TOKEN });
    await lanes.vision.locate({ image: { base64: "A", mediaType: "image/png" }, question: "q", ocr: [] }, sig()).catch(() => {});
    expect(s.seen.every((x) => x.url.startsWith("https://usage.example.com"))).toBe(true);
  });
});

describe("the fix engine on managed usage", () => {
  test("refuses in plain words: fixing needs the person's own Claude until Anthropic agrees otherwise; the token never reaches Claude Code", async () => {
    let started = 0;
    const queryFn = (() => { started++; return (async function* () {})(); }) as never;
    const engine = createEngine(readSettings({ COMPANION_ROUTE: "managed", COMPANION_MANAGED_BASE: "https://usage.example.com", COMPANION_CLAUDE_BIN: "/bin/ls" }), { queryFn });
    const gen = engine.start({ prompt: "fix", project: "/tmp", model: "claude-sonnet-5-5" } as never);
    await expect(gen.next()).rejects.toThrow(MANAGED_NEEDS_OWN_CLAUDE);
    expect(started).toBe(0);
    expect(MANAGED_NEEDS_OWN_CLAUDE).toMatch(/your own Claude/);
  });
});
