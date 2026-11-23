// A stand in for Google sign in, on this Mac only (M116 step 6), for checking the whole server under `wrangler dev` without a
// Google account, a Google client or the network. It makes its own RSA key pair when it starts and keeps it in memory only.
// Usage: bun scripts/stand-in-google.ts [port]   (default 8789)
//   GET  /certs      its public key set, shaped like Google's (the Worker reads it through the local only GOOGLE_KEYS_URL)
//   POST /id-token   {"nonce", "clientId"}: an ID token for one made up person, signed with its key, with that nonce and audience
// It never logs a token or a request.
import { claimsAt, keyPair, signIdToken } from "../test/google-stand-in.ts";

const port = Number(process.argv[2] ?? 8789);
const SUB = "100000000000000000006";
const key = await keyPair("stand-in-google-key");
const text = (s: unknown, max = 256) => (typeof s === "string" && s.length > 0 && s.length <= max ? s : null);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/certs")
      return Response.json({ keys: [key.jwk] }, { headers: { "cache-control": "public, max-age=3600" } });
    if (req.method === "POST" && url.pathname === "/id-token") {
      let body: Record<string, unknown> = {};
      try { body = (await req.json()) as Record<string, unknown>; } catch { /* answered below */ }
      const nonce = text(body?.nonce), clientId = text(body?.clientId);
      if (!nonce || !clientId) return Response.json({ error: "Send {\"nonce\", \"clientId\"}." }, { status: 400 });
      const claims = claimsAt(Date.now(), { aud: clientId, azp: clientId, sub: SUB, email: "stand-in-person@example.com", name: "Stand In Person", nonce });
      return Response.json({ idToken: await signIdToken(key, claims), sub: SUB });
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  },
});
console.log(`The stand in Google is listening on http://127.0.0.1:${port}.`);
