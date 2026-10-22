// Reading how many tokens a reply used, and nothing else. The reply text is never kept: the sniffer looks only at the lines of a
// stream that carry "usage", and holds at most one unfinished line (capped) in a private field.
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

export class UsageSniffer {
  #buf = "";
  #dec = new TextDecoder();
  #u = ZERO();
  #done = false;
  #skip = false;   // inside a line longer than the cap: ignore until its newline
  push(bytes: Uint8Array): void { this.#text(this.#dec.decode(bytes, { stream: true })); }
  end(): void { this.#text(this.#dec.decode()); if (this.#buf) this.#line(this.#buf); this.#buf = ""; }
  usage(): Usage { return { ...this.#u }; }
  /** Did the reply reach its end (message_stop)? A stream cut short did not. */
  complete(): boolean { return this.#done; }
  #text(t: string): void {
    this.#buf += t;
    let i: number;
    while ((i = this.#buf.indexOf("\n")) >= 0) {
      const line = this.#buf.slice(0, i); this.#buf = this.#buf.slice(i + 1);
      if (this.#skip) this.#skip = false; else this.#line(line);
    }
    if (this.#buf.length > MAX_LINE) { this.#buf = ""; this.#skip = true; }
  }
  #line(line: string): void {
    if (!line.startsWith("data:")) return;
    if (line.includes('"message_stop"')) this.#done = true;
    if (!line.includes('"usage"')) return;   // text deltas never get parsed, so their words are never held
    let e: any;
    try { e = JSON.parse(line.slice(5)); } catch { return; }
    const u = e?.type === "message_start" ? e.message?.usage : e?.type === "message_delta" ? e.usage : null;
    if (u) read(this.#u, u, Math.max);
  }
}
