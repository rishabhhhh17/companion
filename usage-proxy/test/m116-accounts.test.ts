// M116 step 2: server accounts. Sign in works while forwarding is off, with a nonce the server made, signed and lets work once;
// the email is kept on the owner (never the name or picture); sign in tries are limited per address; GET /v1/me reads the
// plan and writes nothing; sign out stops one token or every token. Google is a stand in (test/google-stand-in.ts). Every
// test runs on both stores. No network, no real key.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createGoogleVerifier } from "../src/google.ts";
import { createProxy, type SafeEvent } from "../src/proxy.ts";
import { GOOGLE_SIGNIN_PATH, ME_PATH, NONCE_PATH, SIGNOUT_ALL_PATH, SIGNOUT_PATH } from "../src/account-routes.ts";
import { makeNonce, NONCE_TTL_MS } from "../src/nonce.ts";
import { createRateLimiter, SIGNIN_TRIES_PER_MINUTE } from "../src/ratelimit.ts";
import { hashToken } from "../src/tokens.ts";
import { handle as workerHandle, type Env } from "../src/worker.ts";
import { issueToken } from "../src/accounts.ts";
import { DurableStore } from "../src/store-do.ts";
import { FakeNamespace } from "./fake-do.ts";
import { claimsAt, googleKeys, keyPair, signIdToken, type Key } from "./google-stand-in.ts";
import { FakeDurableStore, TEST_STORES, type TestStore } from "./stores.ts";

const SECRET = "account-test-user-id-secret-0123456789abcdef";
const OTHER_SECRET = "another-servers-secret-0123456789abcdef00";
const OUR_KEY = "sk-ant-api03-OUR-KEY-MUST-NOT-LEAK-000000000";
const NOW = Date.UTC(2026, 10, 19, 9, 0, 0);
const IP = "203.0.113.5", IP2 = "198.51.100.7";
const EMAIL = "pat@example.com", NAME = "Pat Example", PICTURE = "https://lh3.googleusercontent.com/a/pat";

const realFetch = globalThis.fetch;
let networkCalls = 0;
beforeAll(() => { globalThis.fetch = (async () => { networkCalls++; throw new Error("no network in tests"); }) as unknown as typeof fetch; });
afterAll(() => { globalThis.fetch = realFetch; });

let GOOD: Key;
beforeAll(async () => { GOOD = await keyPair("kid-good"); });

/** Rows written so far: every put and delete in every Durable Object (0 for the in memory store, which a dump checks). */
const writesOf = (s: TestStore) => (s instanceof FakeDurableStore ? [...s.fake.objects.values()].reduce((n, o) => n + o.storage.writes, 0) : 0);
const errMessage = async (r: Response) => ((await r.json()) as { error: { message: string } }).error.message;

for (const kind of TEST_STORES) describe(kind.name, () => {

function rig(o: { enabled?: boolean; anthropicKey?: string; secret?: string | null; payments?: boolean; loop?: boolean } = {}) {
  const clock = { t: NOW };
  const store = kind.make(), events: SafeEvent[] = [];
  let forwarded = 0;
  const limiter = createRateLimiter({ limit: SIGNIN_TRIES_PER_MINUTE, windowMs: 60_000 });
  const handle = createProxy({
    store, anthropicKey: o.anthropicKey ?? "", userIdSecret: o.secret === null ? undefined : (o.secret ?? SECRET),
    enabled: () => o.enabled ?? false, loopOn: () => o.loop === true, paymentsOn: () => o.payments === true,
    now: () => clock.t, log: (e) => events.push(e),
    fetch: (async () => { forwarded++; return new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch,
    googleSignIn: createGoogleVerifier({ clientId: "1234-test.apps.googleusercontent.com", fetch: googleKeys(() => [GOOD]), now: () => clock.t }),
    signinLimit: (ip) => limiter(ip, clock.t),
  });
  const send = (path: string, init: RequestInit & { ip?: string } = {}) =>
    handle(new Request(`https://api.example${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), "cf-connecting-ip": init.ip ?? IP } }));
  const nonce = async () => ((await (await send(NONCE_PATH)).json()) as { nonce: string }).nonce;
  const idToken = async (over: Record<string, unknown> = {}) => signIdToken(GOOD, claimsAt(clock.t, { nonce: await nonce(), ...over }));
  const signIn = (idTok: string, ip = IP) => send(GOOGLE_SIGNIN_PATH, { method: "POST", ip, headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: idTok }) });
  const signedIn = async (over: Record<string, unknown> = {}) => {
    const r = await signIn(await idToken(over));
    if (r.status !== 200) throw new Error(`sign in failed: ${r.status}`);
    return ((await r.json()) as { token: string }).token;
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const me = (token: string) => send(ME_PATH, { headers: bearer(token) });
  const signOut = (token: string) => send(SIGNOUT_PATH, { method: "POST", headers: bearer(token) });
  const signOutAll = (token: string) => send(SIGNOUT_ALL_PATH, { method: "POST", headers: bearer(token) });
  const ask = (token: string) => send("/v1/messages", { method: "POST", headers: { "x-api-key": token, "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 100, messages: [{ role: "user", content: "hi" }] }) });
  return { clock, store, events, send, nonce, idToken, signIn, signedIn, me, signOut, signOutAll, ask, forwarded: () => forwarded };
}
type Rig = ReturnType<typeof rig>;
const unchanged = async (r: Rig, step: () => Promise<unknown>) => {
  const before = JSON.stringify(r.store.dump()), w = writesOf(r.store);
  await step();
  expect(JSON.stringify(r.store.dump())).toBe(before);
  expect(writesOf(r.store)).toBe(w);
};

describe("sign in while forwarding is off", () => {
  test("sign in works with PROXY_ON off and no Anthropic key; model requests are still refused then", async () => {
    const r = rig({ enabled: false, anthropicKey: "" });
    const res = await r.signIn(await r.idToken());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ token: expect.stringMatching(/^cmp_/), plan: "free", email: EMAIL, name: NAME, picture: PICTURE });
    const ask = await r.ask(body.token as string);
    expect(ask.status).toBe(503);
    expect(r.forwarded()).toBe(0);
    // Switched on but still with no Anthropic key: sign in works, model requests are refused.
    const on = rig({ enabled: true, anthropicKey: "" });
    const t = await on.signedIn();
    expect((await on.ask(t)).status).toBe(503);
    expect(on.forwarded()).toBe(0);
  });
  test("without METADATA_USER_ID_SECRET there is no nonce and no sign in, and nothing is stored", async () => {
    const r = rig({ secret: null });
    expect((await r.send(NONCE_PATH)).status).toBe(503);
    const res = await r.signIn(await signIdToken(GOOD, claimsAt(NOW, { nonce: await makeNonce(SECRET, NOW) })));
    expect(res.status).toBe(503);
    expect(await r.store.listOwnerIds()).toEqual([]);
  });
});

describe("the sign in nonce", () => {
  test("GET /v1/signin/nonce answers a fresh nonce each time, not cached, and writes nothing", async () => {
    const r = rig();
    await unchanged(r, async () => {
      const a = await r.send(NONCE_PATH), b = await r.send(NONCE_PATH);
      expect(a.status).toBe(200);
      expect(a.headers.get("cache-control")).toBe("no-store");
      const na = ((await a.json()) as { nonce: string }).nonce, nb = ((await b.json()) as { nonce: string }).nonce;
      expect(na).toMatch(/^[A-Za-z0-9._-]{40,200}$/);
      expect(na).not.toBe(nb);
    });
  });
  test("a nonce the server did not sign is refused, and nothing is stored", async () => {
    const r = rig();
    const real = await r.nonce();
    const parts = real.split(".");
    const forged = [
      await makeNonce(OTHER_SECRET, NOW),                         // signed by someone else's key
      [...parts.slice(0, -1), parts.at(-1)!.replace(/^./, (c) => (c === "A" ? "B" : "A"))].join("."),   // changed signature
      [parts[0], parts[1], String(NOW + 1), ...parts.slice(3)].join("."),   // changed time under the old signature
      "made-up-by-the-app-0123456789abcdefghijklmnop",
      "",
    ];
    for (const n of forged) {
      const res = await r.signIn(await signIdToken(GOOD, claimsAt(NOW, { nonce: n })));
      expect(res.status).toBe(401);
      expect(await errMessage(res)).toMatch(/sign in did not work/i);
    }
    const none = await r.signIn(await signIdToken(GOOD, claimsAt(NOW)));   // no nonce claim at all
    expect(none.status).toBe(401);
    expect(await r.store.listOwnerIds()).toEqual([]);
  });
  test("a nonce older than 10 minutes is refused; one just inside works", async () => {
    const r = rig();
    const old = await r.nonce();
    r.clock.t = NOW + NONCE_TTL_MS + 1000;
    expect((await r.signIn(await signIdToken(GOOD, claimsAt(r.clock.t, { nonce: old })))).status).toBe(401);
    const r2 = rig();
    const fresh = await r2.nonce();
    r2.clock.t = NOW + NONCE_TTL_MS - 1000;
    expect((await r2.signIn(await signIdToken(GOOD, claimsAt(r2.clock.t, { nonce: fresh })))).status).toBe(200);
  });
  test("a nonce made for later than now is refused", async () => {
    const r = rig();
    expect((await r.signIn(await signIdToken(GOOD, claimsAt(NOW, { nonce: await makeNonce(SECRET, NOW + 5 * 60_000) })))).status).toBe(401);
  });
  test("a nonce used before is refused: the same ID token twice, or a new ID token with the same nonce", async () => {
    const r = rig();
    const n = await r.nonce();
    const first = await signIdToken(GOOD, claimsAt(NOW, { nonce: n }));
    expect((await r.signIn(first)).status).toBe(200);
    const before = JSON.stringify(r.store.dump());
    expect((await r.signIn(first)).status).toBe(401);
    r.clock.t = NOW + 30_000;
    expect((await r.signIn(await signIdToken(GOOD, claimsAt(r.clock.t, { nonce: n })))).status).toBe(401);
    expect(JSON.stringify(r.store.dump())).toBe(before);   // no second token was issued
    // A fresh nonce still signs the same person in.
    expect((await r.signIn(await r.idToken())).status).toBe(200);
  });
});

describe("what sign in keeps", () => {
  test("the email is stored on the owner; the name, picture, ID token and nonce are not", async () => {
    const r = rig();
    const idTok = await r.idToken();
    const nonce = JSON.parse(atob(idTok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).nonce as string;
    const res = await r.signIn(idTok);
    const token = ((await res.json()) as { token: string }).token;
    const kept = JSON.stringify(r.store.dump());
    expect(kept).toContain(EMAIL);
    for (const s of [NAME, PICTURE, idTok, nonce, token]) expect(kept).not.toContain(s);
    expect(((await (await r.me(token)).json()) as { email: string }).email).toBe(EMAIL);
  });
  test("a changed Google email replaces the old one on the owner", async () => {
    const r = rig();
    await r.signedIn();
    const t = await r.signedIn({ email: "pat.new@example.com" });
    const kept = JSON.stringify(r.store.dump());
    expect(kept).toContain("pat.new@example.com");
    expect(kept).not.toContain(EMAIL);
    expect(((await (await r.me(t)).json()) as { email: string }).email).toBe("pat.new@example.com");
  });
  test("signing in on a second Mac keeps the plan the account has", async () => {
    const r = rig();
    await r.signedIn();
    await r.store.setOwnerPlan!("google:109876543210", { plan: "pro", status: "active" });
    const res = await r.signIn(await r.idToken());
    expect(((await res.json()) as { plan: string }).plan).toBe("pro");
  });
});

describe("the sign in rate limit", () => {
  test(`refuses the ${SIGNIN_TRIES_PER_MINUTE + 1}th try a minute from one address, and only that address`, async () => {
    const r = rig();
    for (let i = 0; i < SIGNIN_TRIES_PER_MINUTE; i++) expect((await r.signIn("not-a-token")).status).toBe(401);
    const good = await r.idToken();
    const res = await r.signIn(good);
    expect(res.status).toBe(429);
    expect(await errMessage(res)).toMatch(/Too many sign in tries/);
    expect(await r.store.listOwnerIds()).toEqual([]);
    expect((await r.signIn(await r.idToken(), IP2)).status).toBe(200);   // another address is not touched
    r.clock.t = NOW + 61_000;
    expect((await r.signIn(await r.idToken())).status).toBe(200);        // a minute later, the first one may try again
  });
  test("the refusal is logged by its reason only, never with the address", async () => {
    const r = rig();
    for (let i = 0; i <= SIGNIN_TRIES_PER_MINUTE; i++) await r.signIn("x");
    expect(r.events.some((e) => e.reason === "signin_rate_limit")).toBe(true);
    expect(JSON.stringify(r.events)).not.toContain(IP);
  });
  test("the limiter forgets old addresses, so it cannot grow without end", () => {
    const lim = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) lim(`10.0.${i >> 8}.${i & 255}`, NOW);
    expect(lim.size()).toBeLessThanOrEqual(100);
    expect(lim("10.9.9.9", NOW + 5000)).toBe(true);
  });
});

describe("GET /v1/me", () => {
  const owner = "google:109876543210";
  const iso = (ms: number) => new Date(ms).toISOString();
  test("free: the plan, the status, the email, use as a share of the limit, and the switches", async () => {
    const r = rig({ payments: true, loop: false });
    const t = await r.signedIn();
    r.store.setSpent(owner, NOW, { day: 0.1, month: 0.5 });
    const res = await r.me(t);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      plan: "free", status: "free", until: null, renewsOn: null, email: EMAIL,
      use: { today: 0.5, month: 0.25, todayResetsAt: iso(Date.UTC(2026, 10, 20)), monthResetsAt: iso(Date.UTC(2026, 11, 1)) },
      switches: { payments: true, fixing: false },
    });
  });
  test("use never shows more than all of it", async () => {
    const r = rig();
    const t = await r.signedIn();
    r.store.setSpent(owner, NOW, { day: 9, month: 9 });
    const body = (await (await r.me(t)).json()) as { use: { today: number; month: number } };
    expect([body.use.today, body.use.month]).toEqual([1, 1]);
  });
  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["active Pro, with its renew date", { plan: "pro", status: "active", renewsOn: NOW + 30 * 86400_000 }, { plan: "pro", status: "active", until: null, renewsOn: iso(NOW + 30 * 86400_000) }],
    ["past due, kept until its end", { plan: "pro", status: "past_due", until: NOW + 3 * 86400_000 }, { plan: "pro", status: "past_due", until: iso(NOW + 3 * 86400_000), renewsOn: null }],
    ["on hold: Free with the payment failed status", { plan: "free", status: "on_hold" }, { plan: "free", status: "on_hold", until: null, renewsOn: null }],
    ["cancelling, Pro until the period ends", { plan: "pro", status: "cancelling", until: NOW + 10 * 86400_000 }, { plan: "pro", status: "cancelling", until: iso(NOW + 10 * 86400_000), renewsOn: null }],
    ["past due whose end has passed: Free", { plan: "pro", status: "past_due", until: NOW - 1000 }, { plan: "free", status: "free", until: null, renewsOn: null }],
    ["cancelling whose end has passed: Free", { plan: "pro", status: "cancelling", until: NOW - 1000 }, { plan: "free", status: "free", until: null, renewsOn: null }],
  ];
  for (const [name, plan, want] of cases) {
    test(`${name}, and writes nothing`, async () => {
      const r = rig();
      const t = await r.signedIn();
      await r.store.setOwnerPlan!(owner, plan as never);
      await unchanged(r, async () => {
        for (let i = 0; i < 3; i++) {
          const res = await r.me(t);
          expect(res.status).toBe(200);
          expect(await res.json()).toMatchObject(want);
        }
      });
    });
  }
  test("free writes nothing either, and works while forwarding is off", async () => {
    const r = rig({ enabled: false });
    const t = await r.signedIn();
    await unchanged(r, async () => { expect((await r.me(t)).status).toBe(200); });
  });
  test("no token or an unknown one is 401; a paused account is 403; nothing is written", async () => {
    const r = rig();
    const t = await r.signedIn();
    await unchanged(r, async () => {
      expect((await r.send(ME_PATH)).status).toBe(401);
      expect((await r.me("cmp_unknownunknownunknownunknown00")).status).toBe(401);
    });
    await r.store.suspendOwner(owner, { at: NOW });
    const res = await r.me(t);
    expect(res.status).toBe(403);
    expect(await errMessage(res)).toMatch(/paused/);
  });
  test("the token works in x-api-key too, as on model requests", async () => {
    const r = rig();
    const t = await r.signedIn();
    expect((await r.send(ME_PATH, { headers: { "x-api-key": t } })).status).toBe(200);
  });
});

describe("signing out", () => {
  test("sign out stops only that token; a stopped token gets 401 everywhere", async () => {
    const r = rig({ enabled: true, anthropicKey: OUR_KEY });
    const mac1 = await r.signedIn(), mac2 = await r.signedIn();
    const res = await r.signOut(mac1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stopped: 1 });
    expect((await r.me(mac1)).status).toBe(401);
    expect((await r.ask(mac1)).status).toBe(401);
    expect((await r.signOut(mac1)).status).toBe(401);
    expect((await r.me(mac2)).status).toBe(200);
    expect((await r.ask(mac2)).status).toBe(200);
    expect(JSON.stringify(r.store.dump())).not.toContain(await hashToken(mac1));   // its hash is gone, not just marked
  });
  test("sign out on all Macs stops every token of the owner, and no one else's", async () => {
    const r = rig();
    const a = await r.signedIn(), b = await r.signedIn(), c = await r.signedIn();
    const other = await r.signedIn({ sub: "5555", email: "sam@example.com" });
    const res = await r.signOutAll(b);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stopped: 3 });
    for (const t of [a, b, c]) expect((await r.me(t)).status).toBe(401);
    expect((await r.me(other)).status).toBe(200);
    expect((await r.signOutAll(a)).status).toBe(401);
    // The account itself stays: signing in again works and keeps the email.
    const again = await r.signedIn();
    expect(((await (await r.me(again)).json()) as { email: string }).email).toBe(EMAIL);
  });
  test("sign out on all keeps the plan a payment gave the account", async () => {
    const r = rig();
    const t = await r.signedIn();
    await r.store.setOwnerPlan!("google:109876543210", { plan: "pro", status: "active" });
    await r.signOutAll(t);
    const again = await r.signedIn();
    expect(((await (await r.me(again)).json()) as { plan: string }).plan).toBe("pro");
  });
  test("S2 review: after a suspend and a restore, an old revoked token cannot sign out the new ones; it only forgets itself", async () => {
    const r = rig({ enabled: true, anthropicKey: OUR_KEY });
    const owner = "google:109876543210";
    const old1 = await r.signedIn(), old2 = await r.signedIn();
    await r.store.suspendOwner(owner, { at: NOW });
    expect(await r.store.restoreOwner(owner, { at: NOW + 1000 })).toBe(true);
    const fresh = await r.signedIn();
    const all = await r.signOutAll(old1);
    expect(all.status).toBe(401);
    expect((await r.me(fresh)).status).toBe(200);
    expect((await r.ask(fresh)).status).toBe(200);
    expect(JSON.stringify(r.store.dump())).not.toContain(await hashToken(old1));   // the old token forgot itself
    expect(JSON.stringify(r.store.dump())).toContain(await hashToken(fresh));
    const one = await r.signOut(old2);
    expect(one.status).toBe(401);
    expect(JSON.stringify(r.store.dump())).not.toContain(await hashToken(old2));
    expect((await r.me(fresh)).status).toBe(200);
  });
  test("S2 review: while paused, sign out on all Macs forgets only the calling token", async () => {
    const r = rig();
    const owner = "google:109876543210";
    const a = await r.signedIn(), b = await r.signedIn();
    await r.store.suspendOwner(owner, { at: NOW });
    const res = await r.signOutAll(a);
    expect(res.status).toBe(403);
    expect(await errMessage(res)).toMatch(/paused/);
    expect(JSON.stringify(r.store.dump())).not.toContain(await hashToken(a));
    expect(JSON.stringify(r.store.dump())).toContain(await hashToken(b));
  });
  test("sign out needs POST", async () => {
    const r = rig();
    const t = await r.signedIn();
    expect((await r.send(SIGNOUT_PATH, { headers: { authorization: `Bearer ${t}` } })).status).not.toBe(200);
    expect((await r.me(t)).status).toBe(200);
  });
});

describe("S2 review: the sign in reply shows the plan /v1/me shows", () => {
  const owner = "google:109876543210";
  const cases: [string, Parameters<NonNullable<TestStore["setOwnerPlan"]>>[1], string][] = [
    ["active Pro", { plan: "pro", status: "active", renewsOn: NOW + 30 * 86400_000 }, "pro"],
    ["past due, still kept", { plan: "pro", status: "past_due", until: NOW + 86400_000 }, "pro"],
    ["past due whose end has passed", { plan: "pro", status: "past_due", until: NOW - 1000 }, "free"],
    ["cancelling whose end has passed", { plan: "pro", status: "cancelling", until: NOW - 1000 }, "free"],
  ];
  for (const [name, plan, want] of cases) test(name, async () => {
    const r = rig();
    await r.signedIn();
    await r.store.setOwnerPlan!(owner, plan);
    const res = await r.signIn(await r.idToken());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; plan: string };
    expect(body.plan).toBe(want);
    expect(((await (await r.me(body.token)).json()) as { plan: string }).plan).toBe(want);
  });
});

describe("S2 review: a store failure on an account route says nothing about Claude", () => {
  test("sign in, /v1/me and sign out answer the account sentence", async () => {
    const r = rig();
    const t = await r.signedIn();
    const idTok = await r.idToken();
    const boom = async () => { throw new Error("store hiccup"); };
    for (const step of ["account", "userByTokenHash", "planOfOwner", "signIn", "dropToken", "dropAllTokens"] as const) (r.store as any)[step] = boom;
    for (const res of [await r.signIn(idTok), await r.me(t), await r.signOut(t), await r.signOutAll(t)]) {
      expect(res.status).toBe(503);
      const msg = await errMessage(res);
      expect(msg).toMatch(/account could not be reached/);
      expect(msg).not.toMatch(/Claude/);
      expect(msg).not.toMatch(/store hiccup/);
    }
    expect(r.events.filter((e) => e.reason === "store_failed").length).toBe(4);
  });
});

describe("logs and answers", () => {
  test("no email, name, picture, token, ID token, nonce, address or key in any log line or error, across every account route", async () => {
    const r = rig({ enabled: true, anthropicKey: OUR_KEY });
    const answers: string[] = [];
    const keep = async (res: Response) => { answers.push(await res.clone().text()); return res; };
    const idTok = await r.idToken();
    const res = await keep(await r.signIn(idTok));
    const token = ((await res.json()) as { token: string }).token;
    await keep(await r.signIn(idTok));                                // used nonce
    await keep(await r.signIn(await signIdToken(GOOD, claimsAt(NOW, { nonce: "forged" }))));
    await keep(await r.me(token));
    await keep(await r.signOut(token));
    await keep(await r.me(token));
    const t2 = await r.signedIn();
    await keep(await r.signOutAll(t2));
    for (let i = 0; i <= SIGNIN_TRIES_PER_MINUTE; i++) await keep(await r.signIn("x"));
    const logged = JSON.stringify(r.events);
    for (const s of [EMAIL, NAME, PICTURE, token, t2, idTok, IP, OUR_KEY, SECRET]) expect(logged).not.toContain(s);
    const errors = answers.filter((a) => a.includes('"error"')).join("\n");
    for (const s of [EMAIL, NAME, token, t2, idTok, IP, OUR_KEY, SECRET]) expect(errors).not.toContain(s);
    expect(r.events.some((e) => e.kind === "signout")).toBe(true);
  });
});

});   // each store

describe("the Worker serves the account routes ahead of the switch", () => {
  const OPERATOR = "operator-key-for-account-tests-0123456789ab";
  const env = (over: Partial<Env> = {}): Env => ({ STORE: new FakeNamespace(), METADATA_USER_ID_SECRET: SECRET, OPERATOR_KEY: OPERATOR, ...over });
  const send = (e: Env, path: string, init: RequestInit = {}) => workerHandle(new Request(`https://api.example${path}`, init), e, { waitUntil: () => {} }, () => NOW);
  test("with PROXY_ON unset and no Anthropic key: a nonce, /v1/me and sign out all answer; a model request is refused", async () => {
    const e = env();
    expect((await send(e, NONCE_PATH)).status).toBe(200);
    const t = await issueToken(new DurableStore(e.STORE, () => NOW), "google:42", "free");
    if (!t.ok) throw new Error("setup");
    const me = await send(e, ME_PATH, { headers: { authorization: `Bearer ${t.token}` } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { switches: unknown }).switches).toEqual({ payments: false, fixing: false });
    const ask = await send(e, "/v1/messages", { method: "POST", headers: { "x-api-key": t.token }, body: "{}" });
    expect(ask.status).toBe(503);
    expect((await send(e, SIGNOUT_PATH, { method: "POST", headers: { authorization: `Bearer ${t.token}` } })).status).toBe(200);
  });
  test("the switches come from PAYMENTS_ON and LOOP_ON", async () => {
    const e = env({ PAYMENTS_ON: "on", LOOP_ON: "1" });
    const t = await issueToken(new DurableStore(e.STORE, () => NOW), "google:42", "free");
    if (!t.ok) throw new Error("setup");
    const me = await send(e, ME_PATH, { headers: { authorization: `Bearer ${t.token}` } });
    expect(((await me.json()) as { switches: unknown }).switches).toEqual({ payments: true, fixing: true });
  });
  test("with no Google client set up, sign in says it is not set up (not that forwarding is off)", async () => {
    const r = await send(env(), GOOGLE_SIGNIN_PATH, { method: "POST", body: JSON.stringify({ idToken: "x" }) });
    expect(r.status).toBe(503);
    expect(await errMessage(r)).toMatch(/not set up/);
  });
  test("S2 review: a store that answers 500 gives the account routes their own sentence, with no Claude words", async () => {
    const broken = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(JSON.stringify({ error: "failed" }), { status: 500 }) }) };
    const e = env({ STORE: broken as unknown as Env["STORE"] });
    const auth = { authorization: "Bearer cmp_some-token-that-cannot-be-looked-up-000" };
    for (const res of [await send(e, ME_PATH, { headers: auth }), await send(e, SIGNOUT_PATH, { method: "POST", headers: auth }), await send(e, SIGNOUT_ALL_PATH, { method: "POST", headers: auth })]) {
      expect(res.status).toBe(503);
      const msg = await errMessage(res);
      expect(msg).toMatch(/account could not be reached/);
      expect(msg).not.toMatch(/Claude/);
    }
  });
  test("no network was used by any test here", () => { expect(networkCalls).toBe(0); });
});
