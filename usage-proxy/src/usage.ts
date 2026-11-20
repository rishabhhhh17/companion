// Reading how many tokens a reply used, and nothing else. The reply text is never kept: the sniffer looks only at the lines of a
// stream that carry "usage", and holds at most one unfinished line (capped) in a private field. M116: the data lines of the
// reply's own words (text deltas and block lines) are passed over as bytes, never decoded, so a long reply costs little CPU.
import { estimateUsd } from "../../runner/src/models.ts";

/** web_search_requests: Second Look's web searches (usage.server_tool_use.web_search_requests), each priced on top of the tokens. */
export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; web_search_requests: number };
const ZERO = (): Usage => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 });
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
const FIELDS = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"] as const;
const MAX_LINE = 64 * 1024;

/** Dollars at the app's own price table; a model the table does not know is priced at the dearest one. */
export const costOf = (model: string, u: Usage): number => estimateUsd(model, { ...u, server_tool_use: { web_search_requests: u.web_search_requests ?? 0 } });
/** The counts in one usage object of a reply. */
function read(out: Usage, u: any, keep: (a: number, b: number) => number): void {
  for (const f of FIELDS) out[f] = keep(out[f], num(u?.[f]));
  out.web_search_requests = keep(out.web_search_requests, num(u?.server_tool_use?.web_search_requests));
}

export function usageFromJson(text: string): Usage {
  const out = ZERO();
  try { const u = JSON.parse(text)?.usage; if (u) read(out, u, (_a, b) => b); } catch { /* not a reply */ }
  return out;
}

/** The events whose data lines are never read: the reply's own words and blocks (M116: the lighter reader, for Cloudflare's
 *  10 ms of CPU per request). Their lines are told apart by their first bytes and passed over, never decoded or parsed. */
const bytesOf = (t: string) => new TextEncoder().encode(t);
const SKIP_EVENTS = ["content_block_delta", "content_block_start", "content_block_stop", "ping"].map(bytesOf);
const EVENT = bytesOf("event:"), DATA = bytesOf("data:");
const NL = 10, CR = 13, SPACE = 32;
const dec = new TextDecoder();
/** Does bytes[from..to) start with `p`? */
function startsWith(b: Uint8Array, from: number, to: number, p: Uint8Array): boolean {
  if (to - from < p.length) return false;
  for (let k = 0; k < p.length; k++) if (b[from + k] !== p[k]) return false;
  return true;
}

export class UsageSniffer {
  #parts: Uint8Array[] = [];   // an unfinished line carried from one chunk to the next, only while it may still be read (capped)
  #len = 0;
  #skip = false;               // the rest of the current line is passed over: a skipped event's data, or a line past the cap
  #skipData = false;           // the current event is one whose data is never read
  #u = ZERO();
  #done = false;
  #failed = false;
  #started = false;
  #dataRead = 0;
  push(bytes: Uint8Array): void {
    let i = 0;
    while (i < bytes.length) {
      const j = bytes.indexOf(NL, i), end = j < 0 ? bytes.length : j;
      if (j >= 0 && this.#len === 0 && !this.#skip) { this.#lineBytes(bytes, i, end); i = j + 1; continue; }   // the usual case: a whole line in this chunk
      if (!this.#skip && end > i) {
        this.#parts.push(bytes.slice(i, end));   // a copy: the chunk itself goes on to the app
        this.#len += end - i;
        if (this.#len > MAX_LINE || this.#skippedData()) this.#drop(true);
      }
      if (j < 0) return;
      if (!this.#skip) { const line = this.#joined(); this.#lineBytes(line, 0, line.length); }
      this.#drop(false);
      i = j + 1;
    }
  }
  end(): void { if (!this.#skip && this.#len > 0) { const line = this.#joined(); this.#lineBytes(line, 0, line.length); } this.#drop(false); }
  usage(): Usage { return { ...this.#u }; }
  /** Did the reply reach its end (message_stop)? A stream cut short did not. */
  complete(): boolean { return this.#done; }
  /** Did Anthropic's message_start, which carries the prompt's own token counts, reach the proxy? Audit run 2, finding 6
   *  (re-attack round 3): a stream cut short before it never told us the prompt, so the prompt is booked from the estimate. */
  promptSeen(): boolean { return this.#started; }
  /** Did Anthropic itself end the reply with an error event (overloaded_error, api_error)? */
  failedUpstream(): boolean { return this.#failed; }
  /** How many data lines were decoded and looked at (a test holds this to the start, the last update, the stop and an error). */
  dataLinesRead(): number { return this.#dataRead; }
  /** Bytes of an unfinished line held right now. */
  heldBytes(): number { return this.#len; }
  #drop(skip: boolean): void { if (this.#len) { this.#parts = []; this.#len = 0; } this.#skip = skip; }
  /** A carried line that is a data line of an event whose data is never read, known from its first five bytes. */
  #skippedData(): boolean {
    if (!this.#skipData || this.#len < DATA.length) return false;
    const head = this.#parts.length === 1 ? this.#parts[0] : this.#joined();
    return startsWith(head, 0, head.length, DATA);
  }
  #joined(): Uint8Array {
    if (this.#parts.length === 1) return this.#parts[0];
    const out = new Uint8Array(this.#len); let o = 0;
    for (const p of this.#parts) { out.set(p, o); o += p.length; }
    return out;
  }
  /** One whole line, bytes[from..to), without its newline. */
  #lineBytes(b: Uint8Array, from: number, to: number): void {
    if (to > from && b[to - 1] === CR) to--;
    if (to === from) { this.#skipData = false; return; }   // a blank line ends the event
    if (startsWith(b, from, to, EVENT)) {
      let k = from + EVENT.length;
      while (k < to && b[k] === SPACE) k++;
      this.#skipData = SKIP_EVENTS.some((p) => to - k === p.length && startsWith(b, k, to, p));
      return;
    }
    if (this.#skipData || !startsWith(b, from, to, DATA)) return;
    this.#line(dec.decode(b.subarray(from, to)));
  }
  #line(line: string): void {
    this.#dataRead++;
    if (line.includes('"message_stop"')) this.#done = true;
    // An error event's own line starts with its type. Words in a reply are escaped inside a delta, so they never do.
    if (/^data:\s*\{\s*"type"\s*:\s*"error"/.test(line)) { try { if (JSON.parse(line.slice(5))?.type === "error") this.#failed = true; } catch { /* not one */ } }
    if (!line.includes('"usage"')) return;
    let e: any;
    try { e = JSON.parse(line.slice(5)); } catch { return; }
    const u = e?.type === "message_start" ? e.message?.usage : e?.type === "message_delta" ? e.usage : null;
    if (u) { read(this.#u, u, Math.max); if (e.type === "message_start") this.#started = true; }
  }
}
