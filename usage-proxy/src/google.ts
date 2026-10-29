// Checking a Google ID token (M21 part A), so a person can sign in with Google and get a sign in token for managed usage.
// The token is a JWT signed with RS256 by one of Google's keys. It is checked here with Web Crypto only, no library:
//   - the header says RS256 and names a key (kid) that is in Google's published key set (JWKS); nothing else is accepted
//     ("none" and HS256 are refused before anything is read);
//   - the signature matches that key;
//   - the issuer is Google, the audience is our own client id, it has not expired and was not issued in the future
//     (60 seconds of clock difference allowed either way), and Google says the email is verified.
// The person is "google:" + the token's `sub`, never the email (an email can change hands; `sub` cannot).
// Google's key set is fetched from GOOGLE_JWKS_URL and kept for as long as Google's cache-control max-age says. The fetch and
// the clock are passed in, so the tests use their own key pair and never touch the network.
// Nothing here logs. The ID token, email and name are never put in an error.

export const GOOGLE_CLIENT_ID_SETTING = "GOOGLE_CLIENT_ID";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;
/** Seconds of clock difference allowed between Google and this server. */
export const CLOCK_SKEW_SEC = 60;
/** An ID token longer than this is refused unread. Google's are around 1 to 2 KB. */
export const MAX_ID_TOKEN_CHARS = 8192;
/** Used when Google's answer has no max-age. */
const DEFAULT_JWKS_MAX_AGE_SEC = 3600;
/** An unknown key id makes us fetch the key set again (Google may have just rotated), but at most this often. */
const MIN_REFETCH_SEC = 60;

export type GoogleIdentity = { ownerId: string; sub: string; email: string; name?: string; picture?: string };
export type GoogleCheck = { ok: true; identity: GoogleIdentity } | { ok: false; reason: GoogleRefusal };
export type GoogleRefusal =
  | "malformed" | "bad_alg" | "unknown_kid" | "bad_signature" | "bad_issuer" | "bad_audience" | "expired" | "issued_in_future"
  | "email_not_verified" | "no_subject" | "keys_unavailable" | "not_configured";

export type GoogleVerifierDeps = {
  /** Our OAuth client id (the setting GOOGLE_CLIENT_ID). Empty means every token is refused. */
  clientId: string;
  fetch?: typeof fetch;
  now?: () => number;
};

type Jwk = { kty?: unknown; kid?: unknown; n?: unknown; e?: unknown; alg?: unknown; use?: unknown };

const B64URL = /^[A-Za-z0-9_-]*$/;
function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!B64URL.test(s)) throw new Error("not base64url");
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b64urlBytes(s)));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch { return null; }
}
/** The max-age in a cache-control header, in seconds, or null. */
export function maxAgeOf(cacheControl: string | null): number | null {
  const m = /(?:^|[\s,])max-age=(\d+)/i.exec(cacheControl ?? "");
  return m ? Number(m[1]) : null;
}
const str = (v: unknown, max = 512): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);

/** A function that checks one Google ID token. It keeps Google's key set between calls. */
export function createGoogleVerifier(d: GoogleVerifierDeps): (idToken: unknown) => Promise<GoogleCheck> {
  const doFetch = d.fetch ?? fetch, now = d.now ?? Date.now;
  let keys = new Map<string, CryptoKey>(), fetchedAt = -Infinity, expiresAt = -Infinity;

  async function loadKeys(): Promise<boolean> {
    try {
      const res = await doFetch(GOOGLE_JWKS_URL, { redirect: "error" });
      if (!res.ok) return false;
      const body = await res.json() as { keys?: unknown };
      if (!Array.isArray(body?.keys)) return false;
      const next = new Map<string, CryptoKey>();
      for (const k of body.keys as Jwk[]) {
        if (k?.kty !== "RSA" || typeof k.kid !== "string" || typeof k.n !== "string" || typeof k.e !== "string") continue;
        if (k.alg !== undefined && k.alg !== "RS256") continue;
        if (k.use !== undefined && k.use !== "sig") continue;
        try {
          next.set(k.kid, await crypto.subtle.importKey("jwk", { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true },
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
        } catch { /* a key we cannot read is skipped */ }
      }
      const t = now();
      keys = next; fetchedAt = t;
      expiresAt = t + (maxAgeOf(res.headers.get("cache-control")) ?? DEFAULT_JWKS_MAX_AGE_SEC) * 1000;
      return true;
    } catch { return false; }
  }

  async function keyFor(kid: string): Promise<CryptoKey | "unknown" | "unavailable"> {
    if (now() >= expiresAt && !(await loadKeys()) && keys.size === 0) return "unavailable";
    let key = keys.get(kid);
    if (!key && now() - fetchedAt >= MIN_REFETCH_SEC * 1000) { await loadKeys(); key = keys.get(kid); }
    return key ?? "unknown";
  }

  return async (idToken) => {
    const no = (reason: GoogleRefusal): GoogleCheck => ({ ok: false, reason });
    if (!d.clientId) return no("not_configured");
    if (typeof idToken !== "string" || idToken.length > MAX_ID_TOKEN_CHARS) return no("malformed");
    const parts = idToken.split(".");
    if (parts.length !== 3 || parts.some((p) => p.length === 0 || !B64URL.test(p))) return no("malformed");
    const header = b64urlJson(parts[0]), claims = b64urlJson(parts[1]);
    if (!header || !claims) return no("malformed");
    if (header.alg !== "RS256") return no("bad_alg");
    if (typeof header.kid !== "string" || header.kid.length === 0) return no("unknown_kid");

    const key = await keyFor(header.kid);
    if (key === "unavailable") return no("keys_unavailable");
    if (key === "unknown") return no("unknown_kid");
    let good = false;
    try {
      good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    } catch { good = false; }
    if (!good) return no("bad_signature");

    if (typeof claims.iss !== "string" || !(GOOGLE_ISSUERS as readonly string[]).includes(claims.iss)) return no("bad_issuer");
    if (claims.aud !== d.clientId) return no("bad_audience");
    const nowSec = now() / 1000;
    if (typeof claims.exp !== "number" || nowSec >= claims.exp + CLOCK_SKEW_SEC) return no("expired");
    if (typeof claims.iat !== "number" || claims.iat > nowSec + CLOCK_SKEW_SEC) return no("issued_in_future");
    if (claims.email_verified !== true && claims.email_verified !== "true") return no("email_not_verified");
    const sub = str(claims.sub, 255), email = str(claims.email, 320);
    if (!sub) return no("no_subject");
    if (!email) return no("email_not_verified");
    const name = str(claims.name), picture = str(claims.picture, 2048);
    return { ok: true, identity: { ownerId: `google:${sub}`, sub, email, ...(name ? { name } : {}), ...(picture ? { picture } : {}) } };
  };
}
