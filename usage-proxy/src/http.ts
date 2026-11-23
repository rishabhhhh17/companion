// Small helpers every route shares: the API's own error shape, and reading a body only up to a cap.
import { MAX_BODY_BYTES } from "./filter.ts";

export const error = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "error", error: { type, message } }), { status, headers: { "content-type": "application/json", ...headers } });

/** A JSON answer that no cache keeps. */
export const jsonNoStore = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The body as text, read only up to the cap: a body with no length that never ends is refused, not read to the end. Null when over. */
export async function readCapped(req: Request, cap = MAX_BODY_BYTES): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(total); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}
