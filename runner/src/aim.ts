// Pointing through Anthropic's Computer Use tool. The technique (declare the picture's own size to the tool, read the
// click coordinate it answers with) comes from Clicky's open source app, MIT licence, https://github.com/farzaa/clicky
// (leanring-buddy/ElementLocationDetector.swift); this code is written fresh for Companion. It runs only on the API key
// route and only when switched on (COMPANION_AIM=computer_use); it is NOT the default until the aim eval shows it is
// better. The picture is sent straight from memory with the person's own key; nothing is written to disk.
import type { Image, Ocr, Point, VisionLike } from "./lanes.ts";
import { MODELS } from "./models.ts";

export const API_URL = "https://api.anthropic.com/v1/messages";
const BETA = "computer-use-2025-11-24";
const MAX_OCR = 60;

type Req = { image: Image; question: string; ocr: Ocr[] };

/** What the model is shown. The picture's own size is declared, so no stretching and no rescaling afterwards. */
export function buildRequest(o: { model: string; image: Image; question: string; ocr: Ocr[] }): object {
  const words = o.ocr.slice(0, MAX_OCR);
  const list = words.length ? "\nText found on screen:\n" + words.map((w) => `${w.id}: ${w.text} [${w.box.join(",")}]`).join("\n") : "";
  return {
    model: o.model,
    max_tokens: 256,
    tools: [{ type: "computer_20251124", name: "computer", display_width_px: o.image.w, display_height_px: o.image.h }],
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: o.image.mediaType, data: o.image.base64 } },
      { type: "text", text: `The person asked, while looking at this screen: "${o.question}"\nFirst write one short plain instruction such as "Click Deploy". Then click the one element they should use. If nothing specific on the screen answers it, only say so in words and do not click.${list}` },
    ] }],
  };
}

const plain = (s: string, n: number) => s.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/** The tool use block's coordinate as a point in the picture. Confidence is worked out here, not reported by the model:
 *  high when on screen text sits right at the point, lower when nothing does. */
export function parseAnswer(json: unknown, img: Image, ocr: Ocr[]): Point | null {
  const blocks = (json as { content?: unknown })?.content;
  if (!Array.isArray(blocks) || !img.w || !img.h) return null;
  const use = blocks.find((b: any) => b?.type === "tool_use" && Array.isArray(b?.input?.coordinate) && b.input.coordinate.length === 2);
  const c = use?.input?.coordinate;
  if (!c || !c.every((n: unknown) => typeof n === "number" && Number.isFinite(n))) return null;
  const x = Math.min(img.w, Math.max(0, c[0])), y = Math.min(img.h, Math.max(0, c[1]));
  const near = ocr.map((w) => {
    const [bx, by, bw, bh] = w.box;
    const dx = Math.max(bx - x, 0, x - (bx + bw)), dy = Math.max(by - y, 0, y - (by + bh));
    return { w, d: Math.hypot(dx, dy) };
  }).filter((n) => n.d <= 40).sort((a, b) => a.d - b.d)[0];
  const said = blocks.filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join(" ");
  return {
    x, y, ocrId: near?.w.id, targetText: near ? plain(near.w.text, 80) : "",
    confidence: near ? 0.8 : 0.45, caption: plain(said, 120) || "Click here",
  };
}

export class ComputerUseVision implements VisionLike {
  constructor(private o: { apiKey: () => Promise<string | null>; model?: string; fetchFn?: typeof fetch; timeoutMs?: number }) {}
  async locate(req: Req, signal: AbortSignal): Promise<{ point: Point | null; costUsd: number }> {
    if (!req.image.w || !req.image.h) throw new Error("the picture's size is not known");
    const key = await this.o.apiKey();
    if (!key) throw new Error("no API key");
    if (signal.aborted) throw new Error("stopped");   // Stop came while the key was being fetched: nothing is sent
    const ac = new AbortController();
    const stop = () => ac.abort();
    if (signal.aborted) ac.abort(); else signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(() => ac.abort(), this.o.timeoutMs ?? 15_000);
    try {
      const res = await (this.o.fetchFn ?? fetch)(API_URL, {
        method: "POST", signal: ac.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": BETA },
        body: JSON.stringify(buildRequest({ model: this.o.model ?? MODELS.aim, image: req.image, question: plain(req.question, 300), ocr: req.ocr })),
      });
      if (!res.ok) throw new Error(`the pointing request was refused (${res.status})`);   // the body is never repeated: it could echo the key
      const json = await res.json();
      const u = (json as any)?.usage;
      const costUsd = u ? Math.round((((u.input_tokens ?? 0) * 3e-6) + ((u.output_tokens ?? 0) * 15e-6)) * 1e4) / 1e4 : 0.01;
      return { point: parseAnswer(json, req.image, req.ocr), costUsd };
    } finally { clearTimeout(timer); signal.removeEventListener("abort", stop); }
  }
}

/** Try the new lane; if it fails for any reason except the person stopping, use the old one. An answer of "nothing to
 *  point at" is an answer and is not asked twice. */
export function withFallback(primary: VisionLike, fallback: VisionLike): VisionLike {
  return {
    async locate(req, signal) {
      try { return await primary.locate(req, signal); }
      catch (e) { if (signal.aborted) throw e; return fallback.locate(req, signal); }
    },
  };
}
