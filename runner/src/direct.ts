// The light features (Prompt help, Explain, Draw it for me, the error explainer, Show me how, pictures added to a request and
// the everyday looks) straight on the Messages API, with no Claude Code process. F22, updated 22 Oct 2026: the plain API can be
// company paid (managed usage) where Claude Code cannot. The prompts, the parsing and the names of failures are the same as
// the Claude Code lanes in lanes.ts. Nothing is written to disk: a picture goes from memory into the request and is gone, so
// the in memory drive that Claude Code needs is not needed here. [verify] on a real run before it becomes the default.
import { MAX_SEARCHES, MODELS, WEB_SEARCH_TOOL, apiShape, estimateUsd, searchesOf } from "./models.ts";
import { DESCRIBE_SYSTEM, FAST_SYSTEM, buildDescribeMessages, buildVisionMessages, parseLastStep, parseTargetsText, visionSystem, wrapUserText, type DescribeReq, type FastLike, type FastOut, type FastReq, type Image, type Located, type LocateReq, type LookReq, type VisionLike } from "./lanes.ts";
import { outOfReach, reachMessage, stoppedMessage } from "./reach.ts";
import { clip, redact } from "./redact.ts";

/** Where a request goes and what it carries: Anthropic with the person's own key, or Companion's usage server with the person's
 *  Companion sign in token (managed usage). */
export type DirectAuth = { key: string; base: string };
export type DirectDeps = { auth: () => Promise<DirectAuth | null>; fetchFn?: typeof fetch; model?: string };
export const NOT_CONNECTED_DIRECT = "Not connected: add your API key, or sign in to Companion.";

const VERSION = "2023-06-01";
const MAX_TOKENS = 4096;
// The API's error types, as the Claude Code lanes name them (reach.ts), so the card says the same thing either way.
const KIND: Record<string, string> = {
  authentication_error: "authentication_failed", permission_error: "authentication_failed", billing_error: "billing_error", rate_limit_error: "rate_limit",
  invalid_request_error: "invalid_request", request_too_large: "invalid_request", not_found_error: "model_not_found", overloaded_error: "overloaded", api_error: "server_error",
};
type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } };
type Source = { url: string; title: string };
/** sources: the pages a web search brought back (only an http or https address and its title; never the page itself). */
type Sent = { text: string; usage: Usage; sources: Source[] };
const round = (n: number) => Math.round(n * 1e6) / 1e6;
/** What an error may say: hidden secrets, never the key, at most 200 characters. */
const clean = (text: string, key: string) => clip(redact(String(text).split(key).join("[key]")).replace(/\s+/g, " ").trim(), 200) || "no details";
const stopped = () => new Error("stopped");

/** A promise that also ends when Stop is pressed, whatever the network does. */
function untilStop<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(stopped());
    const on = () => reject(stopped());
    signal.addEventListener("abort", on, { once: true });
    p.then((v) => { signal.removeEventListener("abort", on); resolve(v); }, (e) => { signal.removeEventListener("abort", on); reject(e); });
  });
}

function failure(status: number, type: string, message: string, key: string): Error {
  const kind = KIND[type] ?? (status === 401 || status === 403 ? "authentication_failed" : status === 402 ? "billing_error" : status === 429 ? "rate_limit" : "unknown");
  const detail = clean(message || `HTTP ${status}`, key);
  const why = outOfReach({ status, kind });
  return new Error(why ? reachMessage(why, detail) : stoppedMessage(kind, detail));
}

/** One request. With onText the reply is streamed and only its text is handed on (never the thinking). */
async function send(d: DirectDeps, model: string, body: Record<string, unknown>, signal: AbortSignal, onText?: (t: string) => void): Promise<Sent> {
  if (signal.aborted) throw stopped();
  const auth = await d.auth();
  if (signal.aborted) throw stopped();
  if (!auth) throw new Error(NOT_CONNECTED_DIRECT);
  const stream = !!onText;
  let res: Response;
  try {
    res = await untilStop((d.fetchFn ?? fetch)(`${auth.base.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": auth.key, "anthropic-version": VERSION },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, ...apiShape(model, "quick"), ...body, ...(stream ? { stream: true } : {}) }),
      signal,
    }), signal);
  } catch (e) {
    if (signal.aborted) throw stopped();
    const text = String((e as Error)?.message ?? e);
    throw new Error(reachMessage(outOfReach({ status: null, text }) ?? "no_connection", clean(text, auth.key)));
  }
  if (!res.ok) {
    let type = "", message = "";
    try { const j: any = await res.json(); type = String(j?.error?.type ?? ""); message = String(j?.error?.message ?? ""); } catch { /* no body */ }
    throw failure(res.status, type, message, auth.key);
  }
  if (!stream || !res.body) {
    const j: any = await untilStop(res.json(), signal);
    const blocks: any[] = Array.isArray(j?.content) ? j.content : [];
    // With a web search, the answer is the text after the last search's results (before it, the model only says what it
    // will look up). A failed search's result is one error object, not a list: it brings back no page.
    const last = blocks.map((b) => b?.type).lastIndexOf("web_search_tool_result");
    const text = blocks.slice(last + 1).filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("");
    const sources: Source[] = [];
    for (const b of blocks) {
      if (b?.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content) {
        const url = typeof r?.url === "string" ? r.url.trim() : "";
        if (r?.type === "web_search_result" && /^https?:\/\//i.test(url) && url.length <= 2000 && !sources.some((x) => x.url === url)) sources.push({ url, title: clip(String(r.title ?? "").replace(/\s+/g, " ").trim(), 160) || url });
      }
    }
    return { text, usage: j?.usage ?? {}, sources };
  }
  // The stream: only the lines that carry the reply's text or its token counts are read.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  const usage: Usage = {};
  const textBlocks = new Set<number>();
  const line = (l: string) => {
    if (!l.startsWith("data:")) return;
    let e: any;
    try { e = JSON.parse(l.slice(5)); } catch { return; }
    if (e?.type === "message_start" && e.message?.usage) Object.assign(usage, e.message.usage);
    else if (e?.type === "content_block_start" && e.content_block?.type === "text") textBlocks.add(e.index);
    else if (e?.type === "content_block_delta" && e.delta?.type === "text_delta" && (textBlocks.has(e.index) || !textBlocks.size)) { text += e.delta.text; onText!(e.delta.text); }
    else if (e?.type === "message_delta" && e.usage) Object.assign(usage, e.usage);
    else if (e?.type === "error") throw failure(529, String(e.error?.type ?? ""), String(e.error?.message ?? ""), auth.key);
  };
  try {
    for (;;) {
      const { value, done } = await untilStop(reader.read(), signal);
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i).trimEnd()); buf = buf.slice(i + 1); }
    }
    if (buf) line(buf.trimEnd());
  } catch (e) { void reader.cancel().catch(() => {}); throw e; }
  return { text, usage, sources: [] };
}

/** Prompt help, Explain, Draw it for me, the error explainer and Second Look, straight on the API. Second Look alone may ask
 *  for a web search (req.search): the basic search tool with a cap of at most MAX_SEARCHES, sent whole rather than streamed
 *  so the pages it found can be read; each search is priced in the cost (models.ts). */
export class DirectFastLane implements FastLike {
  readonly canSearch = true;
  constructor(private o: DirectDeps) {}
  async run(req: FastReq, onDelta: (t: string) => void, signal: AbortSignal): Promise<FastOut> {
    const model = this.o.model ?? MODELS.fast;
    // No Claude Code here, so text starting with "/" is just text; Prompt help still wraps what the person typed.
    const content = req.raw ? req.text : wrapUserText(req.text) + (req.extra ? `\n\n${req.extra}` : "");
    const uses = Math.min(MAX_SEARCHES, Math.floor(Number(req.search?.maxUses ?? 0)) || 0);
    const tools = uses >= 1 ? { tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: uses }] } : {};
    const r = await send(this.o, model, { system: req.system ?? FAST_SYSTEM, messages: [{ role: "user", content }], ...tools }, signal, uses >= 1 ? undefined : onDelta);
    const out: FastOut = { text: r.text, costUsd: round(estimateUsd(model, r.usage)) };
    return uses >= 1 ? { ...out, searches: searchesOf(r.usage), sources: r.sources } : out;
  }
}

const userContent = async (gen: AsyncGenerator<{ message: { content: unknown } }>) => { for await (const m of gen) return m.message.content; return []; };

/** Show me how, pictures added to a request and the everyday looks, straight on the API. */
export class DirectVisionLane implements VisionLike {
  constructor(private o: DirectDeps) {}
  private get model() { return this.o.model ?? MODELS.vision; }
  async locate(req: LocateReq, signal: AbortSignal): Promise<Located> {
    if (signal.aborted) throw stopped();
    const content = await userContent(buildVisionMessages(req.image, req.question, req.ocr, req.screens) as never);
    const r = await send(this.o, this.model, { system: visionSystem(req.tutor), messages: [{ role: "user", content }] }, signal);
    const pictures: Image[] = req.screens && req.screens.length > 1 ? req.screens.map((s) => s.image) : [req.image];
    const targets = r.text ? parseTargetsText(r.text, pictures) : [];
    const last = r.text ? parseLastStep(r.text) : undefined;
    return { point: targets[0] ?? null, targets, costUsd: round(estimateUsd(this.model, r.usage)), ...(last ? { lastStepWorked: last } : {}) };
  }
  async describe(req: DescribeReq, signal: AbortSignal): Promise<{ text: string; costUsd: number }> {
    if (signal.aborted) throw stopped();
    const content = await userContent(buildDescribeMessages(req.images, req.question) as never);
    const r = await send(this.o, this.model, { system: DESCRIBE_SYSTEM, messages: [{ role: "user", content }] }, signal);
    if (!r.text.trim()) throw new Error("nothing was said about the picture");
    return { text: r.text.trim(), costUsd: round(estimateUsd(this.model, r.usage)) };
  }
  async ask(req: LookReq, signal: AbortSignal): Promise<{ text: string; costUsd: number }> {
    if (signal.aborted) throw stopped();
    const content = await userContent(buildVisionMessages(req.image, req.question, req.ocr, req.screens) as never);
    const r = await send(this.o, this.model, { system: req.system, messages: [{ role: "user", content }] }, signal);
    if (!r.text.trim()) throw new Error("nothing was said about the screen");
    return { text: r.text, costUsd: round(estimateUsd(this.model, r.usage)) };
  }
}
