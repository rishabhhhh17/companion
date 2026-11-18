// A stand in for Google sign in (M116): our own RSA key pair signs ID tokens, and a fake fetch serves its public half as
// Google's key set. Nothing here reaches the network.
export const CLIENT_ID = "1234-test.apps.googleusercontent.com";
const enc = new TextEncoder();
export const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? enc.encode(b) : b;
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function keyPair(kid: string) {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { kid, privateKey: kp.privateKey, jwk: { kty: "RSA", kid, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" } };
}
export type Key = Awaited<ReturnType<typeof keyPair>>;

/** The claims of a good ID token issued at `nowMs`, with `over` on top. */
export const claimsAt = (nowMs: number, over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com", aud: CLIENT_ID, azp: CLIENT_ID, sub: "109876543210", email: "pat@example.com", email_verified: true,
  name: "Pat Example", picture: "https://lh3.googleusercontent.com/a/pat", iat: Math.floor(nowMs / 1000) - 10, exp: Math.floor(nowMs / 1000) + 3600, ...over,
});

export async function signIdToken(key: Key, payload: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: "RS256", kid: key.kid, typ: "JWT" })), body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

/** Google's key set address, served from memory. */
export const googleKeys = (keys: () => Key[]) => (async () =>
  new Response(JSON.stringify({ keys: keys().map((k) => k.jwk) }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } })) as unknown as typeof fetch;
