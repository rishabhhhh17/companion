// Pointing through Anthropic's computer use tools. The technique (show the picture, read the click coordinate the model
// answers with) comes from Clicky's open source app, MIT licence, https://github.com/farzaa/clicky
// (leanring-buddy/ElementLocationDetector.swift); this code is written fresh for Companion. It runs only on the API key
// route and only when switched on (COMPANION_AIM=computer_use); it is NOT the default until the aim eval shows it is
// better. The picture is sent straight from memory with the person's own key; nothing is written to disk.
// Since 17 Oct 2026 it sends the computer toolset (computer_toolset_20260801): on the Claude API it is the only computer use
// shape Sonnet 5.5 and Opus 5.5 take (the older computer_20251124 tool returns 400). The toolset takes no name and no display
// size, needs no beta header, and answers with one tool_use block per action, named for the action (left_click, screenshot,
// ...) and carrying toolset_name "computer"; every result sent back echoes it. UNPROVEN until a real run on a key.
import type { Image, Ocr, Point, VisionLike } from "./lanes.ts";
import { MODELS, apiShape, computerToolFor, estimateUsd } from "./models.ts";
import { TUTOR_EXAMPLE, tutorLines, type Tutor } from "./tutor.ts";
import { PRODUCT } from "./names.ts";

export const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_OCR = 60;
/** The largest side the toolset takes as it is: it takes no display size and the API does not scale the picture for it. */
export const MAX_SIDE = 2000;
/** The model may first ask to see the screen; it is shown the same picture once, and that is all. */
const MAX_ROUNDS = 2;
// The toolset's actions that name a place on the screen. Every other action is answered "not available": nothing is pressed.
const POINTING = new Set(["left_click", "right_click", "middle_click", "double_click", "triple_click", "mouse_move", "left_mouse_down", "left_mouse_up"]);

type Req = { image: Image; question: string; ocr: Ocr[]; screens?: { image: Image; label: string }[]; tutor?: Tutor };
type Block = { type?: string; id?: string; name?: string; input?: { coordinate?: unknown; action?: unknown }; toolset_name?: string; text?: string };

/** What the model is shown: the picture, its size in words (the toolset takes no display size), the question and the on
 *  screen text. Zoom is turned off: Companion has one picture and cannot show a part of it closer. */
export function buildRequest(o: { model: string; image: Image; question: string; ocr: Ocr[]; tutor?: Tutor }): { model: string; messages: unknown[] } & Record<string, unknown> {
  const words = o.ocr.slice(0, MAX_OCR);
  const list = words.length ? "\nText found on screen:\n" + words.map((w) => `${w.id}: ${w.text} [${w.box.join(",")}]`).join("\n") : "";
  return {
    model: o.model,
    // Thinking counts toward this, so it leaves room for the thinking as well as the one click.
    max_tokens: 4096,
    // As little thinking as the model allows (adaptive at low effort on the 5.5 models; models.ts).
    ...apiShape(o.model, "quick"),
    tools: [{ type: "computer_toolset_20260801", configs: { zoom: { enabled: false } } }],
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: o.image.mediaType, data: o.image.base64 } },
      { type: "text", text: `This is the person's screen, ${o.image.w} x ${o.image.h} pixels; give coordinates in this picture. The person asked, while looking at it: "${o.question}"\nFirst write one short plain instruction such as ${o.tutor ? TUTOR_EXAMPLE : '"Click Deploy"'}. Then click the one element they should use. If nothing specific on the screen answers it, only say so in words and do not click.${o.tutor ? `\n${tutorLines(o.tutor)}` : ""}${list}` },
    ] }],
  };
}

const isComputerCall = (b: Block) => b?.type === "tool_use" && (b.toolset_name === "computer" || b.name === "computer");
// The toolset names the action in the block's name; the older single tool named it in input.action.
const actionOf = (b: Block) => (b.name === "computer" ? String(b.input?.action ?? "") : String(b.name ?? ""));
const validCoord = (c: unknown): c is [number, number] => Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === "number" && Number.isFinite(x));

const plain = (s: string, n: number) => s.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

const textOf = (blocks: unknown): string => (Array.isArray(blocks) ? blocks.filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join(" ") : "");

/** The tool use block's coordinate as a point in the picture. Confidence is worked out here, not reported by the model:
 *  high when on screen text sits right at the point, lower when nothing does. `before`: what the model wrote in an earlier
 *  round (beside its request to see the screen), the caption when this round has no words of its own. */
export function parseAnswer(json: unknown, img: Image, ocr: Ocr[], before = ""): Point | null {
  const j = json as { content?: unknown; stop_reason?: unknown } | null;
  const blocks = j?.content;
  if (!Array.isArray(blocks) || !img.w || !img.h || j?.stop_reason === "refusal") return null;
  // Several calls can come in one turn; the first that names a place is the point (a screenshot call beside it is not).
  const use = (blocks as Block[]).find((b) => isComputerCall(b) && POINTING.has(actionOf(b)) && validCoord(b.input?.coordinate));
  const c = use?.input?.coordinate;
  if (!validCoord(c)) return null;
  const x = Math.min(img.w, Math.max(0, c[0])), y = Math.min(img.h, Math.max(0, c[1]));
  const near = ocr.map((w) => {
    const [bx, by, bw, bh] = w.box;
    const dx = Math.max(bx - x, 0, x - (bx + bw)), dy = Math.max(by - y, 0, y - (by + bh));
    return { w, d: Math.hypot(dx, dy) };
  }).filter((n) => n.d <= 40).sort((a, b) => a.d - b.d)[0];
  return {
    x, y, ocrId: near?.w.id, targetText: near ? plain(near.w.text, 80) : "",
    confidence: near ? 0.8 : 0.45, caption: plain(textOf(blocks), 120) || plain(before, 120) || "Click here",
  };
}

/** An error from the pointing lane that still cost money (an earlier round was answered and billed): withFallback adds
 *  it to the answer that replaces this one, so the day's spending is not under-counted. */
export class LaneError extends Error {
  constructor(message: string, public readonly costUsd: number) { super(message); }
}
const costOf = (e: unknown): number => (e instanceof LaneError && Number.isFinite(e.costUsd) && e.costUsd > 0 ? e.costUsd : 0);

/** One result for every call in the turn, each echoing toolset_name. A screenshot gets the same picture again; anything else
 *  is answered "not available", because nothing on the person's screen is ever pressed or typed from here. */
function resultsFor(calls: Block[], img: Image) {
  return calls.map((c) => c.name === "screenshot"
    ? { type: "tool_result", tool_use_id: c.id, toolset_name: "computer", content: [{ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } }] }
    : { type: "tool_result", tool_use_id: c.id, toolset_name: "computer", is_error: true, content: [{ type: "text", text: "Not available here: nothing on the screen is pressed. Answer by clicking the one element the person should use." }] });
}

// A 400 whose message says the model does not take this tool type. Only this fact is kept from the body, never its words.
const REFUSED_TOOL = /does not support tool types|computer_toolset/i;

export class ComputerUseVision implements VisionLike {
  // Set when the model refused the toolset: for the rest of this run nothing more is sent, and the ordinary lane answers.
  private refused = false;
  constructor(private o: { apiKey: () => Promise<string | null>; model?: string; fetchFn?: typeof fetch; timeoutMs?: number }) {}
  async locate(req: Req, signal: AbortSignal): Promise<{ point: Point | null; costUsd: number }> {
    const model = this.o.model ?? MODELS.aim;
    if (this.refused) throw new Error("this model does not take the computer use toolset");
    if (!computerToolFor(model)) throw new Error(`${PRODUCT} knows no computer use toolset for this model`);
    if (!req.image.w || !req.image.h) throw new Error("the picture's size is not known");
    if (req.image.w > MAX_SIDE || req.image.h > MAX_SIDE) throw new Error("the picture is too large for the computer use toolset");
    // One picture only; with more than one screen the ordinary lane answers instead (withFallback).
    if ((req.screens?.length ?? 0) > 1) throw new Error("this lane takes one picture only");
    const key = await this.o.apiKey();
    if (!key) throw new Error("no API key");
    if (signal.aborted) throw new Error("stopped");   // Stop came while the key was being fetched: nothing is sent
    const ac = new AbortController();
    const stop = () => ac.abort();
    if (signal.aborted) ac.abort(); else signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(() => ac.abort(), this.o.timeoutMs ?? 20_000);
    const body = buildRequest({ model, image: req.image, question: plain(req.question, 300), ocr: req.ocr, ...(req.tutor ? { tutor: req.tutor } : {}) });
    let cost = 0, said = "";
    const rounded = () => Math.round(cost * 1e6) / 1e6;
    try {
      for (let round = 1; ; round++) {
        const res = await (this.o.fetchFn ?? fetch)(API_URL, {
          method: "POST", signal: ac.signal,
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify(body),
        });
        // The body is never repeated: it could echo the key.
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 400 && REFUSED_TOOL.test(text)) { this.refused = true; throw new Error(`the model refused the computer use toolset (${res.status})`); }
          throw new Error(`the pointing request was refused (${res.status})`);
        }
        const json = await res.json() as { content?: Block[]; usage?: Parameters<typeof estimateUsd>[1] };
        cost += json?.usage ? estimateUsd(model, json.usage) : 0.01;
        const point = parseAnswer(json, req.image, req.ocr, said);
        said = [said, textOf(json?.content)].filter(Boolean).join(" ");
        const calls = Array.isArray(json?.content) ? json.content.filter((b) => b?.type === "tool_use") : [];
        // A click, words only, a refusal, or the last round: that is the answer. Only a request to see the screen gets a reply.
        if (point || round >= MAX_ROUNDS || !calls.some((c) => isComputerCall(c) && actionOf(c) === "screenshot")) return { point, costUsd: rounded() };
        // Passed back exactly as it came (thinking blocks included), then one result per call: the history only grows.
        body.messages = [...body.messages, { role: "assistant", content: json.content }, { role: "user", content: resultsFor(calls, req.image) }];
      }
    } catch (e) {
      // A later round failed (refused, overloaded, the network, the time limit): the rounds before it were still billed.
      if (cost > 0) throw new LaneError((e as Error)?.message ?? String(e), rounded());
      throw e;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", stop); }
  }
}

/** Try the new lane; if it fails for any reason except the person stopping, use the old one. An answer of "nothing to
 *  point at" is an answer and is not asked twice. What the failed try had already cost is added to the answer. */
export function withFallback(primary: VisionLike, fallback: VisionLike): VisionLike {
  return {
    async locate(req, signal) {
      try { return await primary.locate(req, signal); }
      catch (e) {
        if (signal.aborted) throw e;
        const r = await fallback.locate(req, signal);
        const spent = costOf(e);
        return spent ? { ...r, costUsd: Math.round((r.costUsd + spent) * 1e6) / 1e6 } : r;
      }
    },
  };
}
