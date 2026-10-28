import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createGoogleVerifier, GOOGLE_JWKS_URL, maxAgeOf } from "../src/google.ts";
import { createProxy, GOOGLE_SIGNIN_PATH, type SafeEvent } from "../src/proxy.ts";
import { MemoryStore } from "../src/store.ts";
import { hashToken } from "../src/tokens.ts";

// Google is a stand in: our own RSA key pair signs the tokens, and a fake fetch serves its public half as the key set.
// The real fetch is replaced with one that fails the test, so nothing here can reach the network.
const CLIENT_ID = "1234-test.apps.googleusercontent.com";
const NOW = Date.UTC(2026, 9, 29, 9, 0, 0), NOW_S = NOW / 1000;
const SECRET = "operator-secret-for-tests-0123456789abcdef";
const enc = new TextEncoder();
const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? enc.encode(b) : b;
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const realFetch = globalThis.fetch;
let networkCalls = 0;
beforeAll(() => { globalThis.fetch = (async () => { networkCalls++; throw new Error("no network in tests"); }) as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = realFetch; });

async function keyPair(kid: string) {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { kid, privateKey: kp.privateKey, jwk: { kty: "RSA", kid, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" } };
}
type Key = Awaited<ReturnType<typeof keyPair>>;
let GOOD: Key, OTHER: Key;
beforeAll(async () => { GOOD = await keyPair("kid-good"); OTHER = await keyPair("kid-other"); });

const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com", aud: CLIENT_ID, azp: CLIENT_ID, sub: "109876543210", email: "pat@example.com", email_verified: true,
  name: "Pat Example", picture: "https://lh3.googleusercontent.com/a/pat", iat: NOW_S - 10, exp: NOW_S + 3600, ...over,
});
async function sign(payload: Record<string, unknown>, o: { key?: Key; header?: Record<string, unknown> } = {}) {
  const key = o.key ?? GOOD;
  const head = b64url(JSON.stringify(o.header ?? { alg: "RS256", kid: key.kid, typ: "JWT" })), body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

/** A stand in for Google's key set address: counts fetches, serves the keys given, with a max-age. */
function google(keys: () => Key[], maxAge = 3600) {
  const g = { fetches: 0, urls: [] as string[] };
  const f = (async (url: string | URL | Request) => {
    g.fetches++; g.urls.push(String(url));
    return new Response(JSON.stringify({ keys: keys().map((k) => k.jwk) }), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}, must-revalidate` } });
  }) as unknown as typeof fetch;
  return { g, fetch: f };
}

function rig(o: { enabled?: boolean; secret?: string | null; clock?: { t: number }; keys?: () => Key[]; noGoogle?: boolean } = {}) {
  const clock = o.clock ?? { t: NOW };
  const { g, fetch: gf } = google(o.keys ?? (() => [GOOD]));
  const store = new MemoryStore(), events: SafeEvent[] = [];
  let forwarded = 0;
  const verify = createGoogleVerifier({ clientId: CLIENT_ID, fetch: gf, now: () => clock.t });
  const handle = createProxy({
    store, anthropicKey: "sk-ant-api03-OUR-KEY-0000000000", userIdSecret: o.secret === null ? undefined : (o.secret ?? SECRET), enabled: () => o.enabled ?? true,
    now: () => clock.t, log: (e) => events.push(e), fetch: (async () => { forwarded++; return new Response("{}"); }) as unknown as typeof fetch,
    ...(o.noGoogle ? {} : { googleSignIn: verify }),
  });
  const signIn = (body: unknown) => handle(new Request(`https://proxy.example${GOOGLE_SIGNIN_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { store, events, g, signIn, verify, clock, handle, forwarded: () => forwarded };
}

describe("checking a Google ID token", () => {
  test("a good token gives the owner id google:<sub>, never the email, plus name, email and picture", async () => {
    const r = await rig().verify(await sign(claims()));
    expect(r).toEqual({ ok: true, identity: { ownerId: "google:109876543210", sub: "109876543210", email: "pat@example.com", name: "Pat Example", picture: "https://lh3.googleusercontent.com/a/pat" } });
  });
  test("the short issuer form is accepted too", async () => {
    expect((await rig().verify(await sign(claims({ iss: "accounts.google.com" })))).ok).toBe(true);
  });
  const refused: [string, () => Promise<string>, string][] = [
    ["wrong audience", () => sign(claims({ aud: "someone-else.apps.googleusercontent.com" })), "bad_audience"],
    ["audience as a list", () => sign(claims({ aud: [CLIENT_ID] })), "bad_audience"],
    ["wrong issuer", () => sign(claims({ iss: "https://evil.example" })), "bad_issuer"],
    ["expired (past the 60 s allowance)", () => sign(claims({ exp: NOW_S - 61 })), "expired"],
    ["no expiry", () => sign(claims({ exp: undefined })), "expired"],
    ["issued in the future (past the 60 s allowance)", () => sign(claims({ iat: NOW_S + 120 })), "issued_in_future"],
    ["email not verified", () => sign(claims({ email_verified: false })), "email_not_verified"],
    ["email_verified missing", () => sign(claims({ email_verified: undefined })), "email_not_verified"],
    ["no subject", () => sign(claims({ sub: "" })), "no_subject"],
    ["signed by a key Google does not have (unknown kid)", () => sign(claims(), { key: OTHER }), "unknown_kid"],
    ["no kid", () => sign(claims(), { header: { alg: "RS256" } }), "unknown_kid"],
    ["signed by another key under Google's kid (bad signature)", () => sign(claims(), { key: OTHER, header: { alg: "RS256", kid: "kid-good" } }), "bad_signature"],
    ["alg none, no signature", async () => `${b64url(JSON.stringify({ alg: "none", kid: "kid-good" }))}.${b64url(JSON.stringify(claims()))}.`, "malformed"],
    ["alg none with a signature part", async () => `${b64url(JSON.stringify({ alg: "none", kid: "kid-good" }))}.${b64url(JSON.stringify(claims()))}.AAAA`, "bad_alg"],
    ["HS256", async () => {
      const head = b64url(JSON.stringify({ alg: "HS256", kid: "kid-good" })), body = b64url(JSON.stringify(claims()));
      const k = await crypto.subtle.importKey("raw", enc.encode(JSON.stringify(GOOD.jwk)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return `${head}.${body}.${b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${head}.${body}`))))}`;
    }, "bad_alg"],
    ["a changed payload under a good signature", async () => { const [h, , s] = (await sign(claims())).split("."); return `${h}.${b64url(JSON.stringify(claims({ sub: "someone-else" })))}.${s}`; }, "bad_signature"],
    ["not a JWT", async () => "hello", "malformed"],
  ];
  for (const [name, make, reason] of refused) {
    test(`refused: ${name}`, async () => { expect(await rig().verify(await make())).toEqual({ ok: false, reason: reason as never }); });
  }
  test("expiry and issue time allow 60 seconds of clock difference, not more", async () => {
    const v = rig().verify;
    expect((await v(await sign(claims({ exp: NOW_S - 30 })))).ok).toBe(true);
    expect((await v(await sign(claims({ iat: NOW_S + 30 })))).ok).toBe(true);
  });
  test("a verifier with no client id refuses everything", async () => {
    const { fetch: gf } = google(() => [GOOD]);
    expect(await createGoogleVerifier({ clientId: "", fetch: gf, now: () => NOW })(await sign(claims()))).toEqual({ ok: false, reason: "not_configured" });
  });
  test("Google's key set is fetched from Google's address once and kept for its max-age", async () => {
    const clock = { t: NOW };
    const r = rig({ clock });
    for (let i = 0; i < 3; i++) expect((await r.verify(await sign(claims()))).ok).toBe(true);
    expect(r.g.fetches).toBe(1);
    expect(r.g.urls).toEqual([GOOGLE_JWKS_URL]);
    clock.t = NOW + 3599_000;
    await r.verify(await sign(claims({ iat: clock.t / 1000, exp: clock.t / 1000 + 3600 })));
    expect(r.g.fetches).toBe(1);
    clock.t = NOW + 3601_000;
    expect((await r.verify(await sign(claims({ iat: clock.t / 1000, exp: clock.t / 1000 + 3600 })))).ok).toBe(true);
    expect(r.g.fetches).toBe(2);
  });
  test("an unknown kid fetches again at most once a minute, so a rotated key is picked up but junk cannot hammer Google", async () => {
    const clock = { t: NOW };
    let set = [GOOD];
    const r = rig({ clock, keys: () => set });
    expect((await r.verify(await sign(claims()))).ok).toBe(true);
    set = [GOOD, OTHER];   // Google rotates in a new key
    expect(await r.verify(await sign(claims(), { key: OTHER }))).toEqual({ ok: false, reason: "unknown_kid" });   // too soon to fetch again
    expect(r.g.fetches).toBe(1);
    clock.t = NOW + 61_000;
    expect((await r.verify(await sign(claims({ iat: clock.t / 1000, exp: clock.t / 1000 + 600 }), { key: OTHER }))).ok).toBe(true);
    expect(r.g.fetches).toBe(2);
  });
  test("when Google's keys cannot be fetched, the answer says so and nothing is accepted", async () => {
    const v = createGoogleVerifier({ clientId: CLIENT_ID, fetch: (async () => new Response("down", { status: 500 })) as unknown as typeof fetch, now: () => NOW });
    expect(await v(await sign(claims()))).toEqual({ ok: false, reason: "keys_unavailable" });
  });
  test("max-age is read from cache-control", () => {
    expect(maxAgeOf("public, max-age=19777, must-revalidate, no-transform")).toBe(19777);
    expect(maxAgeOf(null)).toBe(null);
  });
});

describe("the sign in route", () => {
  test("a good Google token signs in and gives a working sign in token on the free plan", async () => {
    const r = rig();
    const res = await r.signIn({ idToken: await sign(claims()) });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toEqual({ token: expect.stringMatching(/^cmp_/), plan: "free", email: "pat@example.com", name: "Pat Example", picture: "https://lh3.googleusercontent.com/a/pat" });
    expect(await r.store.userByTokenHash(await hashToken(body.token as string))).toEqual({ id: "google:109876543210", plan: "free", status: "active" });
    expect(r.events).toEqual([{ kind: "signin", userId: "google:109876543210" }]);
    expect(r.forwarded()).toBe(0);
  });
  test("signing in again keeps the plan the person already has", async () => {
    const r = rig();
    r.store.addUser("some-hash", { id: "google:109876543210", plan: "pro", status: "active" });
    const body = await (await r.signIn({ idToken: await sign(claims()) })).json() as Record<string, unknown>;
    expect(body.plan).toBe("pro");
    expect((await r.store.userByTokenHash(await hashToken(body.token as string)))?.plan).toBe("pro");
  });
  test("a suspended owner is refused with 403 and given nothing", async () => {
    const r = rig();
    await r.store.suspendOwner("google:109876543210", { at: NOW });
    const before = JSON.stringify(r.store.dump());
    const res = await r.signIn({ idToken: await sign(claims()) });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toMatch(/paused/i);
    expect(JSON.stringify(r.store.dump())).toBe(before);
  });
  test("a bad token is 401 and stores nothing", async () => {
    const r = rig();
    for (const t of [await sign(claims({ aud: "x" })), await sign(claims(), { key: OTHER })]) {
      const res = await r.signIn({ idToken: t });
      expect(res.status).toBe(401);
    }
    expect(await r.store.listOwnerIds()).toEqual([]);
  });
  test("a bad body is 400", async () => {
    const r = rig();
    for (const b of ["not json", {}, { idToken: 5 }, { idToken: "" }, [1], "null"]) expect((await r.signIn(b)).status).toBe(400);
    expect((await r.signIn({ idToken: "x".repeat(20_000) })).status).toBe(400);   // over the size limit
  });
  test("with the switch off, sign in is refused like every other request", async () => {
    const r = rig({ enabled: false });
    const res = await r.signIn({ idToken: await sign(claims()) });
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).toMatch(/not switched on/);
    expect(r.g.fetches).toBe(0);
    expect(await r.store.listOwnerIds()).toEqual([]);
  });
  test("without the user id secret, sign in is refused like every other request", async () => {
    const r = rig({ secret: null });
    expect((await r.signIn({ idToken: await sign(claims()) })).status).toBe(503);
    expect(await r.store.listOwnerIds()).toEqual([]);
  });
  test("with no Google client set up, the route answers 503", async () => {
    const r = rig({ noGoogle: true });
    expect((await r.signIn({ idToken: await sign(claims()) })).status).toBe(503);
  });
  test("no ID token, email or name is ever in a log event or an error", async () => {
    const r = rig();
    const t = await sign(claims({ aud: "x" }));
    const res = await r.signIn({ idToken: t });
    const text = JSON.stringify(await res.json()) + JSON.stringify(r.events);
    for (const s of [t, "pat@example.com", "Pat Example"]) expect(text).not.toContain(s);
    await r.signIn({ idToken: await sign(claims()) });
    const logged = JSON.stringify(r.events);
    for (const s of ["pat@example.com", "Pat Example"]) expect(logged).not.toContain(s);
  });
  test("no network was used by any test here", () => { expect(networkCalls).toBe(0); });
});
