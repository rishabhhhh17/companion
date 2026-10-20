// "Is my site answering": one plain GET of the web address the person typed (F21). Only http and https, a time limit, no
// cookies, no body read or kept, at most 3 redirects, and every hop (the first address and each redirect) must be a public
// address, or this Mac itself when the person typed localhost. Nothing but the answer's number is kept. The fetch, the name
// lookup and the clock are injected, so the tests never reach the network.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { hostAllowed, isLocalName, parseTarget, resolvedAllowed } from "./watchaddress.ts";

export type CheckResult = { outcome: "ok" | "failing" | "unknown"; reason: string };
export type SiteResponse = { status: number; headers: { get(name: string): string | null }; body?: { cancel(): unknown } | null };
export type Fetcher = (url: string, init: { method: "GET"; redirect: "manual"; signal: AbortSignal; headers: Record<string, string>; credentials: "omit" }) => Promise<SiteResponse>;
export type SiteDeps = {
  fetch: Fetcher; lookup: (host: string) => Promise<string[]>;
  now?: () => number; sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The wait before the one second try after a failed answer. */
  retryMs?: number;
};
export const MAX_REDIRECTS = 3;
export const SITE_TIMEOUT_MS = 20_000;

export const realDeps = (): SiteDeps => ({
  fetch: (url, init) => fetch(url, init as RequestInit) as unknown as Promise<SiteResponse>,
  lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
});
const realSleep = (ms: number, signal: AbortSignal) => new Promise<void>((res) => { const t = setTimeout(res, ms); signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true }); });

const seconds = (ms: number) => (ms < 100 ? "under a tenth of a second" : `${(ms / 1000).toFixed(1)} seconds`);
const wording = (status: number): string =>
  status === 404 ? "The page was not found (404)." : status >= 500 ? `The site answered with an error on its side (${status}).` : `The site answered ${status}, which means the page is not working.`;

type Hop = { ok: true; status: number; location: string | null } | { ok: false; kind: "refused" | "down" | "stopped"; reason: string };

/** One answer, or why there is none. `local`: the person typed localhost, so this Mac itself may be visited. */
async function hop(url: string, local: boolean, d: SiteDeps, signal: AbortSignal, timedOut: () => boolean, limitMs: number): Promise<Hop> {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const why = hostAllowed(host, local);
  if (why) return { ok: false, kind: "refused", reason: why };
  if (!isIP(host) && !isLocalName(host)) {
    let addresses: string[];
    try { addresses = await d.lookup(host); } catch { return signal.aborted ? stoppedHop(timedOut, limitMs) : { ok: false, kind: "down", reason: "That address could not be found." }; }
    const bad = resolvedAllowed(addresses, local);
    if (bad) return { ok: false, kind: "refused", reason: bad };
  }
  try {
    const res = await d.fetch(url, { method: "GET", redirect: "manual", signal, credentials: "omit", headers: { "user-agent": "Companion-site-check (read only)", accept: "*/*" } });
    try { void res.body?.cancel(); } catch { /* the body is never read */ }
    return { ok: true, status: res.status, location: res.headers.get("location") };
  } catch {
    return signal.aborted ? stoppedHop(timedOut, limitMs) : { ok: false, kind: "down", reason: "I could not connect to the site." };
  }
}
const stoppedHop = (timedOut: () => boolean, limitMs: number): Hop => timedOut() ? { ok: false, kind: "down", reason: `The site did not answer within ${Math.round(limitMs / 1000)} seconds.` } : { ok: false, kind: "stopped", reason: "Stopped." };

async function once(target: string, d: SiteDeps, signal: AbortSignal, timedOut: () => boolean, limitMs: number): Promise<CheckResult | { stopped: true }> {
  const t0 = (d.now ?? Date.now)();
  const first = parseTarget(target);
  if (!first.ok) return { outcome: "unknown", reason: first.reason };
  let url = first.url, redirects = 0;
  for (;;) {
    const h = await hop(url, first.local, d, signal, timedOut, limitMs);
    if (!h.ok) return h.kind === "stopped" ? { stopped: true } : { outcome: "failing", reason: h.reason };
    if (h.status >= 300 && h.status < 400 && h.location) {
      if (++redirects > MAX_REDIRECTS) return { outcome: "failing", reason: `The address sent me around more than ${MAX_REDIRECTS} times, so I stopped.` };
      let next: URL;
      try { next = new URL(h.location, url); } catch { return { outcome: "failing", reason: "The address sent me somewhere that is not a web address." }; }
      if (next.protocol !== "http:" && next.protocol !== "https:") return { outcome: "failing", reason: "The address sent me somewhere that is not a web address." };
      if (next.username || next.password) return { outcome: "failing", reason: "The address sent me somewhere with a password in it, so I did not go." };
      url = next.toString();
      continue;
    }
    if (h.status < 400) return { outcome: "ok", reason: `The site answered ${h.status} in ${seconds((d.now ?? Date.now)() - t0)}.` };
    return { outcome: "failing", reason: wording(h.status) };
  }
}

/** Checks the address. null: it was stopped (Stop everything), which says nothing about the site. A failed answer is tried
 *  once more after a short wait, so one dropped connection is not an alert. */
export async function checkSite(target: string, deps: SiteDeps, o: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<CheckResult | null> {
  const limit = o.timeoutMs ?? SITE_TIMEOUT_MS;
  const ac = new AbortController();
  let late = false;
  const timer = setTimeout(() => { late = true; ac.abort(); }, limit);
  const stop = () => ac.abort();
  if (o.signal?.aborted) { clearTimeout(timer); return null; }
  o.signal?.addEventListener("abort", stop, { once: true });
  try {
    let r = await once(target, deps, ac.signal, () => late, limit);
    if ("stopped" in r) return null;
    if (r.outcome === "failing" && !late && !ac.signal.aborted && /could not connect|error on its side/.test(r.reason)) {
      await (deps.sleep ?? realSleep)(deps.retryMs ?? 3000, ac.signal);
      if (ac.signal.aborted && !late) return null;
      if (!late) { const again = await once(target, deps, ac.signal, () => late, limit); if (!("stopped" in again)) r = again; else if (!late) return null; }
    }
    return r;
  } finally { clearTimeout(timer); o.signal?.removeEventListener("abort", stop); }
}
