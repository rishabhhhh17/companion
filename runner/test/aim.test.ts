// The Computer Use pointing lane: the technique (declare the picture's size, read the click coordinate) is from Clicky's
// open source code (MIT, see THIRD_PARTY_NOTICES.md); the code is ours. Tested against a fake server: no real call is made.
import { describe, expect, test } from "bun:test";
import { ComputerUseVision, buildRequest, parseAnswer, withFallback, API_URL } from "../src/aim.ts";

const img = { base64: "AAAA", mediaType: "image/jpeg", w: 1280, h: 800 };
const ocr = [{ id: "t1", text: "Deploy", box: [600, 300, 80, 24] }, { id: "t2", text: "Settings", box: [100, 40, 90, 20] }];
const answer = (coord: number[] | null, text = "Click Deploy") => ({ content: [{ type: "text", text }, ...(coord ? [{ type: "tool_use", name: "computer", input: { action: "left_click", coordinate: coord } }] : [])], usage: { input_tokens: 1500, output_tokens: 40 } });
const fake = (body: unknown, status = 200) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  return { f, calls };
};
const ac = () => new AbortController().signal;

describe("the request", () => {
  test("it declares the picture's own size and uses the Computer Use tool", () => {
    const b = buildRequest({ model: "m", image: img, question: "Where is deploy?", ocr }) as any;
    expect(b.tools).toEqual([{ type: "computer_20251124", name: "computer", display_width_px: 1280, display_height_px: 800 }]);
    expect(b.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(b.messages[0].content[1].text).toContain("Where is deploy?");
    expect(b.messages[0].content[1].text).toContain("t1: Deploy");
    expect(b.max_tokens).toBeLessThanOrEqual(300);
  });
  test("a long list of on screen words is cut, and no key ever goes in the body", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, text: `word ${i}`, box: [0, 0, 1, 1] }));
    const text = JSON.stringify(buildRequest({ model: "m", image: img, question: "q", ocr: many }));
    expect(text.split("word ").length - 1).toBeLessThanOrEqual(61);
    expect(text).not.toMatch(/sk-ant|x-api-key/);
  });
});

describe("reading the answer", () => {
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
    expect(parseAnswer({ content: [{ type: "tool_use", name: "computer", input: { coordinate: ["a", 1] } }] }, img, ocr)).toBeNull();
    expect(parseAnswer({ content: "nope" } as never, img, ocr)).toBeNull();
    expect(parseAnswer(null as never, img, ocr)).toBeNull();
  });
  test("the caption is plain, short, and never carries markup", () => {
    const p = parseAnswer(answer([640, 312], "<b>Click</b> Deploy " + "x".repeat(400)), img, ocr)!;
    expect(p.caption.length).toBeLessThanOrEqual(120); expect(p.caption).not.toMatch(/[<>]/);
  });
});

describe("the lane", () => {
  test("it asks Anthropic with the person's key, the beta header, and nothing else leaves", async () => {
    const s = fake(answer([640, 312]));
    const lane = new ComputerUseVision({ apiKey: async () => "sk-ant-api03-test", fetchFn: s.f, model: "m" });
    const r = await lane.locate({ image: img, question: "q", ocr }, ac());
    expect(r.point).toMatchObject({ x: 640, y: 312 });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].url).toBe(API_URL);
    const h = s.calls[0].init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-ant-api03-test"); expect(h["anthropic-beta"]).toBe("computer-use-2025-11-24"); expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(r.costUsd).toBeGreaterThan(0);
  });
  test("no key, a missing picture size, or a refused request is an error (so the old lane can step in)", async () => {
    await expect(new ComputerUseVision({ apiKey: async () => null, fetchFn: fake({}).f }).locate({ image: img, question: "q", ocr }, ac())).rejects.toThrow(/key/i);
    await expect(new ComputerUseVision({ apiKey: async () => "k", fetchFn: fake({}).f }).locate({ image: { base64: "A", mediaType: "image/jpeg" }, question: "q", ocr }, ac())).rejects.toThrow(/size/i);
    await expect(new ComputerUseVision({ apiKey: async () => "sk-ant-api03-secretvalue", fetchFn: fake({ error: { message: "bad sk-ant-api03-secretvalue" } }, 400).f }).locate({ image: img, question: "q", ocr }, ac())).rejects.toThrow(/400/);
  });
  test("an error never contains the key", async () => {
    try { await new ComputerUseVision({ apiKey: async () => "sk-ant-api03-secretvalue", fetchFn: fake({ error: { message: "bad sk-ant-api03-secretvalue" } }, 401).f }).locate({ image: img, question: "q", ocr }, ac()); throw new Error("should have failed"); }
    catch (e) { expect(String((e as Error).message)).not.toContain("secretvalue"); }
  });
  test("stopping ends the request", async () => {
    const c = new AbortController();
    const slow = (async (_u: string, init: RequestInit) => new Promise((_, no) => { init.signal!.addEventListener("abort", () => no(new Error("aborted"))); })) as unknown as typeof fetch;
    const p = new ComputerUseVision({ apiKey: async () => "k", fetchFn: slow }).locate({ image: img, question: "q", ocr }, c.signal);
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
