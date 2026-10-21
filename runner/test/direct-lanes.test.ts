import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DirectFastLane, DirectVisionLane, type DirectAuth } from "../src/direct.ts";
import { DESCRIBE_SYSTEM, FAST_SYSTEM, VISION_SYSTEM, wrapUserText, type Image } from "../src/lanes.ts";
import { estimateUsd, MODELS } from "../src/models.ts";

// The light features straight on the Messages API (F22 update, 22 Oct 2026): the plain API can be company paid, Claude Code
// cannot. These lanes must answer exactly like the Claude Code lanes, never write a picture to disk, never leak the key, and
// name a failure the same way (reach.ts).
const KEY = "sk-ant-api03-TEST-KEY-0000000000000000";
const AUTH: DirectAuth = { key: KEY, base: "https://api.anthropic.com" };
type Seen = { url: string; headers: Headers; body: any };
const enc = new TextEncoder();
const sse = (events: unknown[]) => events.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const streamOf = (text: string, usage = { input_tokens: 100, output_tokens: 20 }) => sse([
  { type: "message_start", message: { usage: { input_tokens: usage.input_tokens, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "secret reasoning" } },
  { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
  ...text.match(/.{1,5}/gs)!.map((t) => ({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: t } })),
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: usage.output_tokens } },
  { type: "message_stop" },
]);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
function rig(answer: (s: Seen) => Response | Promise<Response>, auth: DirectAuth | null = AUTH) {
  const seen: Seen[] = [];
  const fetchFn = (async (url: any, init?: RequestInit) => { const s = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) }; seen.push(s); return answer(s); }) as unknown as typeof fetch;
  return { seen, deps: { auth: async () => auth, fetchFn } };
}
const sig = () => new AbortController().signal;
const IMG: Image = { base64: "AAAA", mediaType: "image/png", w: 800, h: 600 };

describe("the fast lane, direct", () => {
  test("a Prompt help request: the same system and wrapped text, streamed, the thinking never shown, cost from the tokens", async () => {
    const r = rig(() => new Response(streamOf("Improved prompt here."), { headers: { "content-type": "text/event-stream" } }));
    const deltas: string[] = [];
    const out = await new DirectFastLane({ ...r.deps, model: "claude-sonnet-5-5" }).run({ text: "make it better" }, (t) => deltas.push(t), sig());
    expect(out.text).toBe("Improved prompt here.");
    expect(deltas.join("")).toBe("Improved prompt here.");
    expect(deltas.join("")).not.toContain("secret reasoning");
    expect(out.costUsd).toBeCloseTo(estimateUsd("claude-sonnet-5-5", { input_tokens: 100, output_tokens: 20 }), 6);
    const s = r.seen[0];
    expect(s.url).toBe("https://api.anthropic.com/v1/messages");
    expect(s.headers.get("x-api-key")).toBe(KEY);
    expect(s.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(s.body.model).toBe("claude-sonnet-5-5");
    expect(s.body.system).toBe(FAST_SYSTEM);
    expect(s.body.stream).toBe(true);
    expect(s.body.messages).toEqual([{ role: "user", content: wrapUserText("make it better") }]);
    expect(s.body.max_tokens).toBeGreaterThan(0);
    expect(s.body.tools).toBeUndefined();
  });
  test("a raw request (Explain, Draw it) is sent as given, with its own instructions", async () => {
    const r = rig(() => new Response(streamOf('{"why":["a","b"]}'), { headers: { "content-type": "text/event-stream" } }));
    const out = await new DirectFastLane({ ...r.deps, model: "claude-sonnet-5-5" }).run({ text: "The change: x", system: "EXPLAIN SYSTEM", raw: true }, () => {}, sig());
    expect(out.text).toBe('{"why":["a","b"]}');
    expect(r.seen[0].body.system).toBe("EXPLAIN SYSTEM");
    expect(r.seen[0].body.messages[0].content).toBe("The change: x");
  });
  test("the model's thinking rules come from models.ts (apiShape), as the pointing lane does", async () => {
    const r = rig(() => new Response(streamOf("ok"), { headers: { "content-type": "text/event-stream" } }));
    await new DirectFastLane({ ...r.deps, model: "claude-haiku-4-5-20251001" }).run({ text: "x" }, () => {}, sig());
    expect(r.seen[0].body.thinking).toEqual({ type: "disabled" });
  });
  test("the usual fast model is today's when none is given", async () => {
    const r = rig(() => new Response(streamOf("ok"), { headers: { "content-type": "text/event-stream" } }));
    await new DirectFastLane(r.deps).run({ text: "x" }, () => {}, sig());
    expect(r.seen[0].body.model).toBe(MODELS.fast);
  });
  test("on managed usage the request goes to Companion's server with the sign in token, never an Anthropic key", async () => {
    const r = rig(() => new Response(streamOf("ok"), { headers: { "content-type": "text/event-stream" } }), { key: "cmp_" + "t".repeat(40), base: "https://usage.example.com" });
    await new DirectFastLane(r.deps).run({ text: "x" }, () => {}, sig());
    expect(r.seen[0].url).toBe("https://usage.example.com/v1/messages");
    expect(r.seen[0].headers.get("x-api-key")).toBe("cmp_" + "t".repeat(40));
  });
});

describe("the vision lane, direct", () => {
  test("Show me how: the pictures and question go as one message, the pointing system, and the targets come back", async () => {
    const r = rig(() => json({ content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: '{"targets":[{"x":100,"y":200,"screen":1,"ocrId":null,"targetText":"Deploy","confidence":0.9,"caption":"Click Deploy","mark":"ring"}],"lastStepWorked":"yes"}' }], usage: { input_tokens: 1500, output_tokens: 40 } }));
    const out = await new DirectVisionLane({ ...r.deps, model: "claude-sonnet-5-5" }).locate({ image: IMG, question: "Where is deploy?", ocr: [{ id: "t1", text: "Deploy", box: [90, 190, 120, 210] }] }, sig());
    expect(out.point).toMatchObject({ x: 100, y: 200, targetText: "Deploy", caption: "Click Deploy" });
    expect(out.lastStepWorked).toBe("yes");
    expect(out.costUsd).toBeCloseTo(estimateUsd("claude-sonnet-5-5", { input_tokens: 1500, output_tokens: 40 }), 6);
    const b = r.seen[0].body;
    expect(b.system).toBe(VISION_SYSTEM);
    expect(b.stream).toBeUndefined();
    expect(b.messages).toHaveLength(1);
    expect(b.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
    expect(b.messages[0].content.at(-1).text).toContain("Where is deploy?");
    expect(b.messages[0].content.at(-1).text).toContain("t1: Deploy");
  });
  test("no answer, or none, is no point and no failure", async () => {
    const r = rig(() => json({ content: [{ type: "text", text: '{"none":true}' }], usage: { input_tokens: 10, output_tokens: 2 } }));
    const out = await new DirectVisionLane(r.deps).locate({ image: IMG, question: "q", ocr: [] }, sig());
    expect(out.point).toBeNull();
  });
  test("pictures added to a request are described with the describe system; an empty answer is a failure", async () => {
    const r = rig(() => json({ content: [{ type: "text", text: "A red error that says 404." }], usage: { input_tokens: 10, output_tokens: 5 } }));
    const out = await new DirectVisionLane(r.deps).describe({ images: [{ mediaType: "image/png", base64: "BBBB" }], question: "fix this" }, sig());
    expect(out.text).toBe("A red error that says 404.");
    expect(r.seen[0].body.system).toBe(DESCRIBE_SYSTEM);
    const empty = rig(() => json({ content: [{ type: "text", text: "  " }], usage: {} }));
    await expect(new DirectVisionLane(empty.deps).describe({ images: [{ mediaType: "image/png", base64: "B" }], question: "q" }, sig())).rejects.toThrow(/nothing was said/);
  });
  test("an everyday look uses its own system and hands back the words", async () => {
    const r = rig(() => json({ content: [{ type: "text", text: '{"stuck":"x"}' }], usage: { input_tokens: 10, output_tokens: 5 } }));
    const out = await new DirectVisionLane(r.deps).ask({ image: IMG, question: "what now", ocr: [], system: "LOOK SYSTEM" }, sig());
    expect(out.text).toBe('{"stuck":"x"}');
    expect(r.seen[0].body.system).toBe("LOOK SYSTEM");
  });
});

describe("failures, Stop, and what is never kept", () => {
  const fast = (answer: (s: Seen) => Response | Promise<Response>) => new DirectFastLane(rig(answer).deps).run({ text: "x" }, () => {}, sig());
  test("each failed request is named the way the Claude Code lanes name it (reach.ts), never with the key", async () => {
    const cases: [number, string, RegExp][] = [
      [401, "authentication_error", /^claude_stopped:authentication_failed:/],
      [402, "billing_error", /^claude_stopped:billing_error:/],
      [429, "rate_limit_error", /^claude_stopped:rate_limit:/],
      [400, "invalid_request_error", /^claude_stopped:invalid_request:/],
      [529, "overloaded_error", /^claude_busy:/],
      [500, "api_error", /^claude_busy:/],
    ];
    for (const [status, type, want] of cases) {
      const err = await fast(() => json({ type: "error", error: { type, message: `bad ${KEY}` } }, status)).then(() => null, (e) => e as Error);
      expect(err?.message, `${status}`).toMatch(want);
      expect(err?.message).not.toContain(KEY);
    }
  });
  test("a dropped connection is named as one", async () => {
    const err = await fast(() => { throw new TypeError("fetch failed: ECONNREFUSED"); }).then(() => null, (e) => e as Error);
    expect(err?.message).toMatch(/^no_connection:/);
  });
  test("no sign in: nothing is sent, and the message says how to connect", async () => {
    const r = rig(() => json({}), null);
    await expect(new DirectFastLane(r.deps).run({ text: "x" }, () => {}, sig())).rejects.toThrow(/Not connected/);
    expect(r.seen.length).toBe(0);
  });
  test("Stop before sending sends nothing; Stop while waiting ends the request", async () => {
    const r = rig(() => json({}));
    const ac = new AbortController(); ac.abort();
    await expect(new DirectVisionLane(r.deps).locate({ image: IMG, question: "q", ocr: [] }, ac.signal)).rejects.toThrow(/stopped/);
    expect(r.seen.length).toBe(0);
    const slow = rig((s) => new Promise<Response>(() => {}));
    const ac2 = new AbortController();
    const p = new DirectFastLane(slow.deps).run({ text: "x" }, () => {}, ac2.signal);
    setTimeout(() => ac2.abort(), 10);
    await expect(p).rejects.toThrow(/stopped/);
  });
  test("the direct lanes never write a picture or a reply to disk: no file system, no in memory drive, no saved conversation", () => {
    const src = readFileSync(new URL("../src/direct.ts", import.meta.url), "utf8");
    for (const banned of ["node:fs", "writeFile", "ramdisk", "persistSession", "console.log", "claude-agent-sdk"]) expect(src, banned).not.toContain(banned);
  });
});
