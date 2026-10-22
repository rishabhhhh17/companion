// The Computer Use pointing lane: the technique (send the picture, read the click coordinate) is from Clicky's open source
// code (MIT, see THIRD_PARTY_NOTICES.md); the code is ours. Since 17 Oct 2026 it uses the computer toolset
// (computer_toolset_20260801), the only computer use shape Sonnet 5.5 and Opus 5.5 take on the Claude API. The answers
// below are recorded shapes from the Claude API notes (member tool_use blocks named for the action, with toolset_name).
// Tested against a fake server: no real call is made.
import { describe, expect, test } from "bun:test";
import { ComputerUseVision, buildRequest, parseAnswer, withFallback, API_URL } from "../src/aim.ts";
import { PRODUCT } from "../src/names.ts";

const MODEL = "claude-sonnet-5-5";
const img = { base64: "AAAA", mediaType: "image/jpeg", w: 1280, h: 800 };
const ocr = [{ id: "t1", text: "Deploy", box: [600, 300, 80, 24] }, { id: "t2", text: "Settings", box: [100, 40, 90, 20] }];
const click = (coord: number[], name = "left_click", id = "toolu_c1") => ({ type: "tool_use", id, name, input: { coordinate: coord }, toolset_name: "computer" });
const shot = (id = "toolu_s1") => ({ type: "tool_use", id, name: "screenshot", input: {}, toolset_name: "computer" });
const thinking = { type: "thinking", thinking: "", signature: "c2ln" };
const reply = (blocks: unknown[], stop = "tool_use", usage = { input_tokens: 1500, output_tokens: 40 }) => ({ id: "msg_1", type: "message", role: "assistant", model: MODEL, content: blocks, stop_reason: stop, usage });
const answer = (coord: number[] | null, text = "Click Deploy") => reply([thinking, { type: "text", text }, ...(coord ? [click(coord)] : [])], coord ? "tool_use" : "end_turn");
const fake = (...bodies: { body: unknown; status?: number }[]) => {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const r = bodies[Math.min(calls.length - 1, bodies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
};
const ok = (body: unknown) => ({ body });
const ac = () => new AbortController().signal;

describe("the request", () => {
  test("it uses the computer toolset: one entry with no name and no display size, zoom turned off", () => {
    const b = buildRequest({ model: MODEL, image: img, question: "Where is deploy?", ocr }) as any;
    expect(b.tools).toEqual([{ type: "computer_toolset_20260801", configs: { zoom: { enabled: false } } }]);
    expect(JSON.stringify(b)).not.toContain("computer_20251124");
    expect(JSON.stringify(b.tools)).not.toMatch(/display_(width|height)_px|"name"/);
    expect(b.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(b.messages[0].content[1].text).toContain("Where is deploy?");
    expect(b.messages[0].content[1].text).toContain("t1: Deploy");
    expect(b.messages[0].content[1].text).toContain("1280 x 800");
  });
  test("it thinks as little as the model allows, with room left for the thinking, and never forces a tool", () => {
    const b = buildRequest({ model: MODEL, image: img, question: "q", ocr: [] }) as any;
    expect(b.output_config).toEqual({ effort: "low" });
    expect(b.thinking?.type).not.toBe("disabled");
    expect(b.tool_choice).toBeUndefined();
    expect(b.max_tokens).toBeGreaterThanOrEqual(2048);
    expect(b.temperature).toBeUndefined();
  });
  test("a long list of on screen words is cut, and no key ever goes in the body", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, text: `word ${i}`, box: [0, 0, 1, 1] }));
    const text = JSON.stringify(buildRequest({ model: "m", image: img, question: "q", ocr: many }));
    expect(text.split("word ").length - 1).toBeLessThanOrEqual(61);
    expect(text).not.toMatch(/sk-ant|x-api-key/);
  });
});

describe("reading the answer", () => {
  test("the action is the block's name: a left_click member call is the point, after a thinking block", () => {
    expect(parseAnswer(reply([thinking, click([640, 312])]), img, ocr)).toMatchObject({ x: 640, y: 312, ocrId: "t1" });
  });
  test("several calls in one turn: the click is taken, a screenshot call beside it is not a point", () => {
    expect(parseAnswer(reply([shot(), click([620, 310], "double_click")]), img, ocr)).toMatchObject({ x: 620, y: 310 });
    expect(parseAnswer(reply([shot()]), img, ocr)).toBeNull();
  });
  test("an action that is not about a place, or a call from another tool, is not a point", () => {
    expect(parseAnswer(reply([{ type: "tool_use", id: "t", name: "type", input: { text: "hi" }, toolset_name: "computer" }]), img, ocr)).toBeNull();
    expect(parseAnswer(reply([{ type: "tool_use", id: "t", name: "left_click", input: { coordinate: [5, 5] }, toolset_name: "browser" }]), img, ocr)).toBeNull();
  });
  test("a refusal is no point", () => {
    expect(parseAnswer({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } }, img, ocr)).toBeNull();
  });
  test("the click coordinate becomes a point in the picture, and the words before it become the caption", () => {
    const p = parseAnswer(answer([640, 312]), img, ocr);
    expect(p).toMatchObject({ x: 640, y: 312, caption: "Click Deploy", targetText: "Deploy", ocrId: "t1" });
  });
  test("a point beside on screen text is trusted more than one beside nothing", () => {
    expect(parseAnswer(answer([640, 312]), img, ocr)!.confidence).toBeGreaterThan(0.7);
    const lonely = parseAnswer(answer([900, 700]), img, ocr)!;
    expect(lonely.confidence).toBeLessThan(0.5); expect(lonely.confidence).toBeGreaterThanOrEqual(0.4);
    expect(lonely.ocrId).toBeUndefined();
  });
  test("a coordinate a little outside the picture is pulled in, not trusted off screen", () => {
    const p = parseAnswer(answer([1300, -5]), img, [])!;
    expect(p.x).toBe(1280); expect(p.y).toBe(0);
  });
  test("no tool use, junk, or non numbers mean no point", () => {
    expect(parseAnswer(answer(null, "no specific element"), img, ocr)).toBeNull();
    expect(parseAnswer({ content: [{ type: "tool_use", name: "left_click", toolset_name: "computer", input: { coordinate: ["a", 1] } }] }, img, ocr)).toBeNull();
    expect(parseAnswer({ content: "nope" } as never, img, ocr)).toBeNull();
    expect(parseAnswer(null as never, img, ocr)).toBeNull();
  });
  test("the caption is plain, short, and never carries markup", () => {
    const p = parseAnswer(answer([640, 312], "<b>Click</b> Deploy " + "x".repeat(400)), img, ocr)!;
    expect(p.caption.length).toBeLessThanOrEqual(120); expect(p.caption).not.toMatch(/[<>]/);
  });
});

describe("the lane", () => {
  test("it asks Anthropic with the person's key and no beta header, and nothing else leaves", async () => {
    const s = fake(ok(answer([640, 312])));
    const lane = new ComputerUseVision({ apiKey: async () => "sk-ant-api03-test", fetchFn: s.f, model: MODEL });
    const r = await lane.locate({ image: img, question: "q", ocr }, ac());
    expect(r.point).toMatchObject({ x: 640, y: 312 });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].url).toBe(API_URL);
    const h = s.calls[0].init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-ant-api03-test"); expect(h["anthropic-beta"]).toBeUndefined(); expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(s.calls[0].body.model).toBe(MODEL);
    expect(r.costUsd).toBeCloseTo(1500 * 2e-6 + 40 * 10e-6, 6);   // Sonnet 5.5's price
  });
  test("when it first asks for a screenshot, it is given the same picture once (toolset_name echoed), and its click is read", async () => {
    const first = reply([thinking, shot("toolu_s1"), { type: "tool_use", id: "toolu_k1", name: "key", input: { text: "cmd+space" }, toolset_name: "computer" }]);
    const s = fake(ok(first), ok(answer([640, 312])));
    const r = await new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }).locate({ image: img, question: "q", ocr }, ac());
    expect(r.point).toMatchObject({ x: 640, y: 312 });
    expect(s.calls).toHaveLength(2);
    const msgs = s.calls[1].body.messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[1]).toEqual({ role: "assistant", content: first.content });   // passed back exactly as it came, thinking block included
    expect(msgs[2].role).toBe("user");
    const [res1, res2] = msgs[2].content;
    expect(res1).toMatchObject({ type: "tool_result", tool_use_id: "toolu_s1", toolset_name: "computer" });
    expect(res1.content[0]).toMatchObject({ type: "image", source: { data: "AAAA" } });
    expect(res2).toMatchObject({ type: "tool_result", tool_use_id: "toolu_k1", toolset_name: "computer", is_error: true });   // nothing is ever pressed
    expect(r.costUsd).toBeCloseTo(2 * (1500 * 2e-6 + 40 * 10e-6), 6);
  });
  test("the instruction written beside the screenshot request is kept when the click comes with no words", async () => {
    const first = reply([thinking, { type: "text", text: "Click Deploy" }, shot("toolu_s1")]);
    const s = fake(ok(first), ok(reply([click([640, 312])])));
    const r = await new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }).locate({ image: img, question: "q", ocr }, ac());
    expect(r.point?.caption).toBe("Click Deploy");
  });
  test("a second round that fails keeps what the first round cost: the error carries it, and the fallback adds it", async () => {
    const roundOne = 1500 * 2e-6 + 40 * 10e-6;
    for (const second of [{ body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, status: 529 }, { body: { type: "error", error: { type: "invalid_request_error", message: "bad" } }, status: 400 }]) {
      const s = fake(ok(reply([shot()])), second);
      let caught: any;
      try { await new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }).locate({ image: img, question: "q", ocr }, ac()); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.costUsd).toBeCloseTo(roundOne, 6);
      const s2 = fake(ok(reply([shot()])), second);
      const lane = withFallback(new ComputerUseVision({ apiKey: async () => "k", fetchFn: s2.f, model: MODEL }), { locate: async () => ({ point: { x: 1, y: 2, targetText: "a", confidence: 0.9, caption: "c" }, costUsd: 0.01 }) });
      const r = await lane.locate({ image: img, question: "q", ocr }, ac());
      expect(r.point?.x).toBe(1);
      expect(r.costUsd).toBeCloseTo(0.01 + roundOne, 6);
    }
  });
  test("a second round that never answers (the time limit) keeps the first round's cost too", async () => {
    let n = 0;
    const f = (async (_u: string, init: RequestInit) => {
      if (++n === 1) return new Response(JSON.stringify(reply([shot()])), { status: 200 });
      return new Promise((_, no) => init.signal!.addEventListener("abort", () => no(new Error("aborted"))));
    }) as unknown as typeof fetch;
    let caught: any;
    try { await new ComputerUseVision({ apiKey: async () => "k", fetchFn: f, model: MODEL, timeoutMs: 50 }).locate({ image: img, question: "q", ocr }, ac()); } catch (e) { caught = e; }
    expect(caught?.costUsd).toBeCloseTo(1500 * 2e-6 + 40 * 10e-6, 6);
  });
  test("two rounds at most: a second screenshot request is no point, not a third call", async () => {
    const s = fake(ok(reply([shot()])), ok(reply([shot("toolu_s2")])));
    const r = await new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }).locate({ image: img, question: "q", ocr }, ac());
    expect(r.point).toBeNull(); expect(s.calls).toHaveLength(2);
  });
  test("a refusal is an answer of no point, and the other lane is not asked", async () => {
    const s = fake(ok({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" }, usage: { input_tokens: 1500, output_tokens: 0 } }));
    const r = await new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }).locate({ image: img, question: "q", ocr }, ac());
    expect(r.point).toBeNull(); expect(s.calls).toHaveLength(1);
  });
  test("no key, a missing picture size, or a refused request is an error (so the old lane can step in)", async () => {
    await expect(new ComputerUseVision({ apiKey: async () => null, fetchFn: fake(ok({})).f }).locate({ image: img, question: "q", ocr }, ac())).rejects.toThrow(/key/i);
    await expect(new ComputerUseVision({ apiKey: async () => "k", fetchFn: fake(ok({})).f }).locate({ image: { base64: "A", mediaType: "image/jpeg" }, question: "q", ocr }, ac())).rejects.toThrow(/size/i);
    await expect(new ComputerUseVision({ apiKey: async () => "sk-ant-api03-secretvalue", fetchFn: fake({ body: { error: { message: "bad sk-ant-api03-secretvalue" } }, status: 400 }).f }).locate({ image: img, question: "q", ocr }, ac())).rejects.toThrow(/400/);
  });
  test("an error never contains the key", async () => {
    try { await new ComputerUseVision({ apiKey: async () => "sk-ant-api03-secretvalue", fetchFn: fake({ body: { error: { message: "bad sk-ant-api03-secretvalue" } }, status: 401 }).f }).locate({ image: img, question: "q", ocr }, ac()); throw new Error("should have failed"); }
    catch (e) { expect(String((e as Error).message)).not.toContain("secretvalue"); }
  });
  test("a 400 that names the computer use type it refused: a plain error, no body repeated, and the lane stops asking for this run", async () => {
    const refused = { type: "error", error: { type: "invalid_request_error", message: "'claude-sonnet-5-5' does not support tool types: computer_toolset_20260801. Did you mean one of: computer_20251124? sk-ant-api03-secretvalue" } };
    const s = fake({ body: refused, status: 400 });
    const lane = new ComputerUseVision({ apiKey: async () => "sk-ant-api03-secretvalue", fetchFn: s.f, model: MODEL });
    let msg = "";
    try { await lane.locate({ image: img, question: "q", ocr }, ac()); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/computer use/i); expect(msg).not.toMatch(/secretvalue|Did you mean/);
    await expect(lane.locate({ image: img, question: "q", ocr }, ac())).rejects.toThrow(/computer use/i);
    expect(s.calls).toHaveLength(1);   // the second question was not sent at all
  });
  test(`a model ${PRODUCT} knows no toolset for, or a picture larger than the toolset takes, is refused before anything is sent`, async () => {
    const s = fake(ok(answer([1, 1])));
    await expect(new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: "claude-haiku-4-5-20251001" }).locate({ image: img, question: "q", ocr }, ac())).rejects.toThrow();
    await expect(new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }).locate({ image: { ...img, w: 2560, h: 1600 }, question: "q", ocr }, ac())).rejects.toThrow(/large/i);
    expect(s.calls).toHaveLength(0);
  });
  test("stopping ends the request", async () => {
    const c = new AbortController();
    const slow = (async (_u: string, init: RequestInit) => new Promise((_, no) => { init.signal!.addEventListener("abort", () => no(new Error("aborted"))); })) as unknown as typeof fetch;
    const p = new ComputerUseVision({ apiKey: async () => "k", fetchFn: slow, model: MODEL }).locate({ image: img, question: "q", ocr }, c.signal);
    c.abort();
    await expect(p).rejects.toThrow();
  });
});

describe("falling back", () => {
  const ok = { point: { x: 1, y: 2, targetText: "a", confidence: 0.9, caption: "c" }, costUsd: 0.01 };
  test("when the new lane fails, the old one answers", async () => {
    let old = 0;
    const lane = withFallback({ locate: async () => { throw new Error("400"); } }, { locate: async () => { old++; return ok; } });
    expect((await lane.locate({ image: img, question: "q", ocr }, ac())).point?.x).toBe(1); expect(old).toBe(1);
  });
  test("when the new lane answers, even 'nothing to point at', the old one is not asked (no double cost)", async () => {
    let old = 0;
    const lane = withFallback({ locate: async () => ({ point: null, costUsd: 0.01 }) }, { locate: async () => { old++; return ok; } });
    expect((await lane.locate({ image: img, question: "q", ocr }, ac())).point).toBeNull(); expect(old).toBe(0);
  });
  test("a model that refuses the toolset falls back to the ordinary lane", async () => {
    let old = 0;
    const s = fake({ body: { type: "error", error: { type: "invalid_request_error", message: "'x' does not support tool types: computer_toolset_20260801." } }, status: 400 });
    const lane = withFallback(new ComputerUseVision({ apiKey: async () => "k", fetchFn: s.f, model: MODEL }), { locate: async () => { old++; return ok; } });
    expect((await lane.locate({ image: img, question: "q", ocr }, ac())).point?.x).toBe(1); expect(old).toBe(1);
  });
  test("stopping is not a failure to fall back from", async () => {
    const c = new AbortController(); c.abort();
    let old = 0;
    const lane = withFallback({ locate: async () => { throw new Error("aborted"); } }, { locate: async () => { old++; return ok; } });
    await expect(lane.locate({ image: img, question: "q", ocr }, c.signal)).rejects.toThrow();
    expect(old).toBe(0);
  });
});

import { readSettings } from "../src/engines.ts";
describe("switching it on", () => {
  test("it is off unless asked for by name", () => {
    expect(readSettings({}).aim).toBe("default");
    expect(readSettings({ COMPANION_AIM: "yes" }).aim).toBe("default");
    expect(readSettings({ COMPANION_AIM: "computer_use" }).aim).toBe("computer_use");
    expect(readSettings({ COMPANION_AIM_MODEL: "m" }).aimModel).toBe("m");
  });
});
