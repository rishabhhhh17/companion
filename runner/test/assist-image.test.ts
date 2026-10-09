import { describe, expect, test } from "bun:test";
import { AssistService, ImageStore } from "../src/lanes.ts";
import { parseCommand, serialize } from "../../protocol/index.ts";
import type { Event } from "../../protocol/index.ts";

function rig() {
  const events: Event[] = [], images = new ImageStore(), seen: any[] = [];
  const vision = { locate: async (req: any) => { seen.push(req); return { point: { x: 100, y: 50, targetText: "Deploy", confidence: 0.9, caption: "Click Deploy" }, costUsd: 0.01 }; } };
  const svc = new AssistService({ fast: { run: async () => ({ text: "", costUsd: 0 }) }, vision, images, emit: (e) => events.push(e) });
  const image = (o: Record<string, unknown> = {}) => svc.handle({ v: 1, id: "i", type: "assist.image", ref: "shot_1", mediaType: "image/jpeg", base64: "/9j/4AAQSkZJRg==", w: 1280, h: 800, ...o } as never);
  const locate = () => svc.handle({ v: 1, id: "l", type: "assist.locate", req: "r1", question: "Where do I deploy?", image: { ref: "shot_1", w: 1280, h: 800 } } as never);
  return { events, images, seen, image, locate };
}

describe("a screenshot sent from the Mac side", () => {
  test("the protocol accepts a jpeg or png and refuses anything else", () => {
    const base = { v: 1, id: "x", type: "assist.image", ref: "s", base64: "AAAA", w: 10, h: 10 };
    expect(parseCommand(serialize({ ...base, mediaType: "image/jpeg" } as never)).ok).toBe(true);
    expect(parseCommand(serialize({ ...base, mediaType: "image/gif" } as never)).ok).toBe(false);
  });
  test("it is kept for the question that follows, then dropped once used", async () => {
    const r = rig(); await r.image(); await r.locate();
    expect(r.seen[0].image).toMatchObject({ mediaType: "image/jpeg", w: 1280, h: 800 });
    expect((r.events.find((e) => e.type === "assist.point") as any).targetText).toBe("Deploy");
    expect(r.images.get("shot_1")).toBeUndefined();
  });
  test("text that is not picture data, a silly size or an oversize image is refused in plain words", async () => {
    for (const bad of [{ base64: "<script>" }, { w: 0 }, { h: 99999 }]) {
      const r = rig(); await r.image(bad);
      expect((r.events.at(-1) as any).type).toBe("assist.error"); expect(r.images.get("shot_1")).toBeUndefined();
    }
    const big = rig(); await big.image({ base64: "A".repeat(9 * 1024 * 1024) });
    expect((big.events.at(-1) as any).reason).toMatch(/too large/);
  });
  test("asking about a screenshot that was never sent, or that already expired, says so", async () => {
    const r = rig(); await r.locate();
    expect((r.events.at(-1) as any).reason).toMatch(/not found or has expired/);
  });
});
