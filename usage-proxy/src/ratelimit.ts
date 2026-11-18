// A small per address limit for sign in tries (M116). It lives in this server instance's memory and writes nothing to the
// store, so it costs no row writes. Cloudflare runs many instances, so it is a brake, not a hard wall; Cloudflare's own rate
// limiting binding would be shared, but whether the free plan has it is not settled yet ([verify] V9). The address is never
// logged or stored anywhere else.

/** Sign in tries allowed from one address in one minute. The next one is refused until the minute is over. */
export const SIGNIN_TRIES_PER_MINUTE = 10;
/** The most addresses remembered at once. Past it, finished windows are dropped first, then the oldest. */
export const MAX_KEYS = 10_000;

export type RateLimiter = ((key: string, now: number) => boolean) & { size(): number };

/** A fixed window counter: true while `key` has had fewer than `limit` tries in its current window (and counts this one). */
export function createRateLimiter(o: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const seen = new Map<string, { start: number; n: number }>(), maxKeys = o.maxKeys ?? MAX_KEYS;
  const allow = (key: string, now: number): boolean => {
    let w = seen.get(key);
    if (!w || now - w.start >= o.windowMs) {
      if (w) seen.delete(key);
      if (seen.size >= maxKeys) {
        for (const [k, v] of seen) if (now - v.start >= o.windowMs) seen.delete(k);
        for (const k of seen.keys()) { if (seen.size < maxKeys) break; seen.delete(k); }   // oldest first (insertion order)
      }
      w = { start: now, n: 0 };
      seen.set(key, w);
    }
    if (w.n >= o.limit) return false;
    w.n++;
    return true;
  };
  return Object.assign(allow, { size: () => seen.size });
}

/** The address a request came from, as Cloudflare tells it. Missing (a local run): one shared key. */
export const clientAddress = (req: Request): string => req.headers.get("cf-connecting-ip")?.trim() || "unknown";
