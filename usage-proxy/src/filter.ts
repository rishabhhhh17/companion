// What the proxy will forward: only the messages paths, only the models Companion uses, a body of limited size, and max_tokens
// that cannot be raised, and no tools but two lists: the one Second Look sends (a web search with a small cap), and M100's
// fixing loop's own client tools, each exactly as the loop defines them (runner/src/engine/messages-loop/tools.ts), and those
// only while the server's own loop switch is on (LOOP_ON, off unless set, like PROXY_ON; M100 review). A client
// tool runs on the person's Mac, in its safety box, never here, so it costs nothing beyond tokens and reaches nothing from
// this server. No server tool other than that one search, ever. Everything else is refused here, before anything is sent to
// Anthropic. It also sets metadata.user_id (the opaque id) on message requests.
import { KNOWN_MODELS, MAX_SEARCHES, WEB_SEARCH_TOOL, canonicalModel } from "../../runner/src/models.ts";
import { isLoopToolList } from "../../runner/src/engine/messages-loop/tools.ts";
import { PRODUCT } from "./names.ts";

export const MAX_BODY_BYTES = 8_000_000;   // a long working session with a few screenshots is well under this
export const MAX_OUTPUT_TOKENS = 64_000;
/** Audit run 2, finding 3: only the messages path. count_tokens skipped the budget and still wrote rows on every call, and
 *  the app never calls it, so it is not forwarded. */
const PATHS = new Set(["/v1/messages"]);
/** Audit run 2, finding 6: the prompt's size in tokens, estimated from the body for the budget hold: about 3 bytes a token
 *  (on the high side for English and code, so the hold errs on the safe side), never more than the longest context. An
 *  image's base64 bytes are not text: each image counts IMAGE_TOKENS instead (well above what one screenshot costs). */
export const BYTES_PER_TOKEN = 3;
export const IMAGE_TOKENS = 5_000;
export const MAX_CONTEXT_TOKENS = 1_000_000;
/** Audit run 2, finding 6 (search re-attack): what a web search adds that the body does not carry. Anthropic bills each
 *  search (WEB_SEARCH_USD) and the results it brings back as input tokens of the same request. A result page's size is not
 *  known before the search runs, so each search the request allows is held at this many input tokens, a high guess (several
 *  full pages; the re-attacks assumed 6k to 8k). UNPROVEN until a real run measures what results cost. */
export const SEARCH_RESULT_TOKENS = 25_000;
/** Tools add a system prompt of their own on Anthropic's side (a few hundred tokens), billed as input but not in the body. */
export const TOOL_PROMPT_TOKENS = 1_000;

/** maxTokens: the longest answer the request allows, used to book a stream that was cut short. inputTokens: the prompt's
 *  estimated size (finding 6), held with the answer while the request runs, and sure to be billed. searches: the most web
 *  searches the request allows (0 without the search tool), and searchTokens the input their results may add on top
 *  (SEARCH_RESULT_TOKENS each): billed only if the model searches, so held but not counted as sure. cacheWrite: the request
 *  carries a cache marker, so its prompt may be billed at the cache write rate (1.25 times the input rate). */
export type Checked = { ok: true; model: string; stream: boolean; body: string; maxTokens: number; inputTokens: number; searches: number; searchTokens: number; cacheWrite: boolean } | { ok: false; status: number; message: string };
const no = (status: number, message: string): Checked => ({ ok: false, status, message });

/** The only tool a request may carry: Second Look's web search, exactly as runner/src/direct.ts sends it (the basic version,
 *  its name, and a cap from 1 to MAX_SEARCHES, nothing else), so a search can never run unbounded or reach further than that. */
function toolsOk(tools: unknown, loopOn: boolean): boolean {
  if (tools === undefined) return true;
  if (!Array.isArray(tools)) return false;
  if (tools.length === 0) return true;
  if (isLoopToolList(tools)) return loopOn;   // M100: the fixing loop's own tools, unchanged, only while its switch is on
  if (tools.length !== 1) return false;
  const t = tools[0];
  if (!t || typeof t !== "object" || Array.isArray(t)) return false;
  const o = t as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(",");
  return keys === "max_uses,name,type" && o.type === WEB_SEARCH_TOOL && o.name === "web_search"
    && Number.isInteger(o.max_uses) && (o.max_uses as number) >= 1 && (o.max_uses as number) <= MAX_SEARCHES;
}
/** The request fields that may be sent, and only these: what Companion's lanes send (runner/src/direct.ts, the fixing loop) and
 *  the plain sampling settings. Anything else is refused: other ways of reaching tools that cost money or reach further
 *  (mcp_servers, container, tool_choice), fields that change the price of a reply (speed, service_tier, inference_geo; the
 *  price table counts the standard price only; audit run 2, finding 6 re-attack), and anything new Anthropic adds later. */
const FIELDS = new Set(["model", "max_tokens", "messages", "system", "stream", "metadata", "tools", "thinking", "output_config", "temperature", "top_p", "top_k", "stop_sequences"]);

/** Audit run 2, finding 6 re-attack: the estimate below can only price what the body carries. A document or image fetched from
 *  a link (source type url) or from the Files API (file) is billed in full but is a few bytes here, and a PDF is billed per
 *  page as an image plus its text, whatever its size in bytes. The runner sends neither (documents reach the model as text,
 *  images as base64 screenshots), so content blocks are a closed list: what the runner sends, and the model's own blocks sent
 *  back in later turns. An image must be base64 with an image media type. Anything else is refused. */
const MESSAGE_BLOCKS = new Set(["text", "image", "tool_result", "tool_use", "thinking", "redacted_thinking", "server_tool_use", "web_search_tool_result"]);
const RESULT_BLOCKS = new Set(["text", "image"]);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Images = { images: number; imageBytes: number };
function imageOk(b: Record<string, unknown>, seen: Images): boolean {
  const src = b.source;
  if (!isObj(src) || src.type !== "base64" || typeof src.media_type !== "string" || !src.media_type.startsWith("image/") || typeof src.data !== "string") return false;
  seen.images++; seen.imageBytes += src.data.length;
  return true;
}
/** A list of content blocks: every block's type from `allowed`, every image as imageOk says, a tool_result's own content a
 *  string or a list of RESULT_BLOCKS. Only images found here are priced as images (an image shape anywhere else is text). */
function blocksOk(content: unknown, allowed: Set<string>, seen: Images): boolean {
  if (typeof content === "string") return true;
  if (!Array.isArray(content)) return false;
  for (const b of content) {
    if (!isObj(b) || typeof b.type !== "string" || !allowed.has(b.type)) return false;
    if (b.type === "image" && !imageOk(b, seen)) return false;
    if (b.type === "tool_result" && b.content !== undefined && !blocksOk(b.content, RESULT_BLOCKS, seen)) return false;
  }
  return true;
}
function contentOk(j: Record<string, unknown>, seen: Images): boolean {
  if (j.system !== undefined && !blocksOk(j.system, new Set(["text"]), seen)) return false;
  if (!Array.isArray(j.messages)) return false;
  return j.messages.every((m) => isObj(m) && blocksOk(m.content, MESSAGE_BLOCKS, seen));
}

/** Audit run 2, finding 8: a prompt cache marker, as the runner sends it ({ type: "ephemeral" }), or with the 5 minute ttl
 *  spelled out. Any other ttl (1 hour writes cost more than the price table's 5 minute rate) or any other key is refused. */
function cacheControlOk(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return Object.keys(o).every((k) => k === "type" || k === "ttl") && o.type === "ephemeral" && (o.ttl === undefined || o.ttl === "5m");
}
/** One walk over the whole parsed body (no recursion, so a deeply nested body cannot overflow the stack): every cache_control
 *  at any depth must pass cacheControlOk. */
function walk(root: unknown, seen: { cache: boolean }): boolean {
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) { for (const x of v) stack.push(x); continue; }
    const o = v as Record<string, unknown>;
    if (Object.hasOwn(o, "cache_control")) { if (!cacheControlOk(o.cache_control)) return false; seen.cache = true; }
    for (const k in o) if (Object.hasOwn(o, k)) stack.push(o[k]);
  }
  return true;
}

/** What the server's settings allow. loopOn: the fixing loop's tools may go through (the LOOP_ON switch). Absent: off. */
export type FilterOptions = { loopOn?: boolean };

/** `userId` is the opaque id for metadata.user_id (see userid.ts). Whatever `metadata` the client sent is always removed first, so a
 *  client never chooses its own id or borrows another's. */
export function checkRequest(method: string, path: string, raw: string, userId?: string, o: FilterOptions = {}): Checked {
  if (method !== "POST" || !PATHS.has(path)) return no(404, `This address is not available through ${PRODUCT}.`);
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return no(413, "That request is too big to send.");
  let j: any;
  try { j = JSON.parse(raw); } catch { return no(400, "The request could not be read."); }
  if (!j || typeof j !== "object" || Array.isArray(j)) return no(400, "The request could not be read.");
  if (typeof j.model !== "string" || !KNOWN_MODELS.includes(canonicalModel(j.model))) return no(400, `That model is not available through ${PRODUCT}.`);
  const seen: Images = { images: 0, imageBytes: 0 }, marks = { cache: false };
  if (!toolsOk(j.tools, o.loopOn === true) || Object.keys(j).some((f) => !FIELDS.has(f)) || !contentOk(j, seen) || !walk(j, marks))
    return no(400, `That kind of request is not available through ${PRODUCT}.`);
  delete j.metadata;
  if (userId) j.metadata = { user_id: userId };
  if (!Number.isInteger(j.max_tokens) || j.max_tokens < 1) return no(400, "The request did not say how long the answer may be.");
  if (j.max_tokens > MAX_OUTPUT_TOKENS) j.max_tokens = MAX_OUTPUT_TOKENS;
  const tools = Array.isArray(j.tools) && j.tools.length > 0;
  // toolsOk let through either the loop's own client tools or the one search tool with its max_uses checked: only that one
  // reaches anything on Anthropic's side that is billed beyond tokens.
  const searches = tools && j.tools.length === 1 && j.tools[0].type === WEB_SEARCH_TOOL ? (j.tools[0].max_uses as number) : 0;
  // Audit run 2, finding 6 (re-attack round 2): the estimate is taken from the body that is sent, never from the one the client
  // wrote. Parsing and writing the body again can make it far longer (a number written 1e20, 4 bytes, goes out as
  // 100000000000000000000, 21 bytes), so the bytes the client sent can be a quarter of what Anthropic bills. The size limit is
  // checked again on the sent body for the same reason. An image's data is a plain string both times (base64 has nothing to
  // escape), so taking its length off cannot take off more than its own bytes.
  const body = JSON.stringify(j);
  const sentBytes = new TextEncoder().encode(body).length;
  if (sentBytes > MAX_BODY_BYTES) return no(413, "That request is too big to send.");
  const inputTokens = Math.min(MAX_CONTEXT_TOKENS, Math.ceil(Math.max(0, sentBytes - seen.imageBytes) / BYTES_PER_TOKEN) + seen.images * IMAGE_TOKENS + (tools ? TOOL_PROMPT_TOKENS : 0));
  const searchTokens = Math.min(MAX_CONTEXT_TOKENS - inputTokens, searches * SEARCH_RESULT_TOKENS);
  return { ok: true, model: canonicalModel(j.model), stream: j.stream === true, body, maxTokens: j.max_tokens, inputTokens, searches, searchTokens, cacheWrite: marks.cache };
}
