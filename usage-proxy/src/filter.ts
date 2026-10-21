// What the proxy will forward: only the messages paths, only the models Companion uses, a body of limited size, and max_tokens
// that cannot be raised. Everything else is refused here, before anything is sent to Anthropic.
import { KNOWN_MODELS, canonicalModel } from "../../runner/src/models.ts";

export const MAX_BODY_BYTES = 8_000_000;   // a long working session with a few screenshots is well under this
export const MAX_OUTPUT_TOKENS = 64_000;
const PATHS = new Set(["/v1/messages", "/v1/messages/count_tokens"]);

export type Checked = { ok: true; model: string; stream: boolean; body: string; free: boolean } | { ok: false; status: number; message: string };
const no = (status: number, message: string): Checked => ({ ok: false, status, message });

export function checkRequest(method: string, path: string, raw: string): Checked {
  if (method !== "POST" || !PATHS.has(path)) return no(404, "This address is not available through Companion.");
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return no(413, "That request is too big to send.");
  let j: any;
  try { j = JSON.parse(raw); } catch { return no(400, "The request could not be read."); }
  if (!j || typeof j !== "object" || Array.isArray(j)) return no(400, "The request could not be read.");
  if (typeof j.model !== "string" || !KNOWN_MODELS.includes(canonicalModel(j.model))) return no(400, "That model is not available through Companion.");
  const free = path === "/v1/messages/count_tokens";
  if (!free) {
    if (!Number.isInteger(j.max_tokens) || j.max_tokens < 1) return no(400, "The request did not say how long the answer may be.");
    if (j.max_tokens > MAX_OUTPUT_TOKENS) j.max_tokens = MAX_OUTPUT_TOKENS;
  }
  return { ok: true, model: canonicalModel(j.model), stream: j.stream === true, body: JSON.stringify(j), free };
}
