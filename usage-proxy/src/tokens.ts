// Sign in tokens for managed usage (F22). The app gives Claude Code one of these as its "key"; only its hash is ever stored.
// A real Anthropic key is never accepted here: it would mean the app skipped the proxy.

const b64url = (b: Uint8Array): string => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** A new random token (30 random bytes, 40 characters) and its hash. Show the token once; keep only the hash. */
export async function newToken(): Promise<{ token: string; hash: string }> {
  const token = `cmp_${b64url(crypto.getRandomValues(new Uint8Array(30)))}`;
  return { token, hash: await hashToken(token) };
}

/** The token a request carries: Claude Code sends its key in x-api-key; a bearer header is accepted too. Only Companion tokens. */
export function tokenFromHeaders(h: Headers): string | null {
  const key = h.get("x-api-key");
  const bearer = /^Bearer (\S+)$/.exec(h.get("authorization") ?? "")?.[1];
  const t = key ?? bearer ?? null;
  return t && /^cmp_[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}
