// M116 step 6: the whole server run on this Mac. scripts/verify-dev.sh starts the Worker (through a stand in for `wrangler dev`
// here, see test/dev-stand-in-worker.ts), the stand in model and a stand in Google (scripts/stand-in-google.ts), then proves
// sign in, /v1/me, a metered request, a signed test webhook and sign out end to end. No account, no network beyond this Mac.
// The Worker reads Google's keys from the stand in only through the local only setting GOOGLE_KEYS_URL, and only when both the
// request and that address are this machine; a real deploy refuses the setting.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoogleVerifier, GOOGLE_JWKS_URL } from "../src/google.ts";
import { handle, DEV_ONLY_SETTINGS, type Env } from "../src/worker.ts";
import { GOOGLE_SIGNIN_PATH, NONCE_PATH } from "../src/account-routes.ts";
import { FakeNamespace } from "./fake-do.ts";
import { claimsAt, keyPair, signIdToken, type Key } from "./google-stand-in.ts";

const ROOT = join(import.meta.dir, "..");
const SECRET = "local-run-test-user-id-secret-0123456789abcdef";
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// Every fetch that is not to this machine is written down and answered 503, so nothing here can reach the network.
const realFetch = globalThis.fetch, realLog = console.log;
let outside: string[] = [];
const isLocal = (u: string) => { try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(u).hostname); } catch { return false; } };
beforeEach(() => {
  outside = [];
  console.log = () => {};   // the Worker's own short log lines; the run's log is checked by verify-dev.sh itself
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (isLocal(u)) return realFetch(input, init);
    outside.push(u);
    return new Response("not in tests", { status: 503 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; });

let KEY: Key;
let keysServer: ReturnType<typeof Bun.serve>;
let keysAsked = 0;
beforeAll(async () => {
  KEY = await keyPair("kid-local-run");
  keysServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() { keysAsked++; return Response.json({ keys: [KEY.jwk] }); } });
});
afterAll(() => keysServer.stop(true));

describe("the Google checker's key address", () => {
  test("by default it is Google's own address", async () => {
    const asked: string[] = [];
    const check = createGoogleVerifier({ clientId: "c", fetch: (async (u: string) => { asked.push(String(u)); return new Response("{}", { status: 503 }); }) as unknown as typeof fetch });
    await check(await signIdToken(KEY, claimsAt(Date.now(), { aud: "c" })));
    expect(asked).toEqual([GOOGLE_JWKS_URL]);
  });
  test("given one, it fetches the keys from that address instead", async () => {
    const asked: string[] = [];
    const check = createGoogleVerifier({ clientId: "c", jwksUrl: "http://127.0.0.1:9/certs", fetch: (async (u: string) => { asked.push(String(u)); return Response.json({ keys: [KEY.jwk] }); }) as unknown as typeof fetch });
    const r = await check(await signIdToken(KEY, claimsAt(Date.now(), { aud: "c" })));
    expect(r.ok).toBe(true);
    expect(asked).toEqual(["http://127.0.0.1:9/certs"]);
  });
});

describe("GOOGLE_KEYS_URL, the stand in Google for a local run", () => {
  let n = 0;
  // A fresh client id per world, so the Worker's kept checker (one per client id and key address) is never shared between tests.
  function world(over: Partial<Env> = {}) {
    const clientId = `local-run-${++n}.apps.googleusercontent.com`;
    const env: Env = { STORE: new FakeNamespace(), METADATA_USER_ID_SECRET: SECRET, GOOGLE_CLIENT_ID: clientId, GOOGLE_KEYS_URL: `http://127.0.0.1:${keysServer.port}/certs`, ...over };
    const send = (host: string, path: string, init: RequestInit = {}) => handle(new Request(`http://${host}${path}`, init), env, { waitUntil: () => {} });
    const signIn = async (host: string) => {
      const { nonce } = await (await send(host, NONCE_PATH)).json() as { nonce: string };
      const idToken = await signIdToken(KEY, claimsAt(Date.now(), { aud: clientId, azp: clientId, nonce }));
      return send(host, GOOGLE_SIGNIN_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
    };
    return { env, send, signIn };
  }
  test("on this machine, with a key address on this machine: sign in is checked against the stand in's keys", async () => {
    const before = keysAsked;
    const r = await world().signIn("127.0.0.1:8787");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { token: string }).token).toMatch(/^cmp_/);
    expect(keysAsked).toBeGreaterThan(before);
    expect(outside).toEqual([]);
  });
  test("on a real address the setting is ignored: Google's own keys are asked for, and the stand in's token is refused", async () => {
    const before = keysAsked;
    const r = await world().signIn("api.getsquibby.example");
    expect(r.status).not.toBe(200);
    expect(keysAsked).toBe(before);
    expect(outside).toEqual([GOOGLE_JWKS_URL]);
  });
  test("a key address that is not this machine is ignored too, even on a local run", async () => {
    for (const url of ["https://keys.evil.example/certs", "not an address", "file:///etc/passwd"]) {
      outside = [];
      const r = await world({ GOOGLE_KEYS_URL: url }).signIn("127.0.0.1:8787");
      expect(r.status).not.toBe(200);
      expect(outside).toEqual([GOOGLE_JWKS_URL]);
    }
  });
  test("it is a local only setting: a real deploy refuses it, and wrangler.toml never has it", () => {
    expect(DEV_ONLY_SETTINGS).toContain("GOOGLE_KEYS_URL");
    const settings = readFileSync(join(ROOT, "wrangler.toml"), "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(settings).not.toContain("GOOGLE_KEYS_URL");
    expect(readFileSync(join(ROOT, "scripts", "deploy.sh"), "utf8")).toMatch(/^DEV_ONLY="[^"]*\bGOOGLE_KEYS_URL\b[^"]*"/m);
  });
});

describe("scripts/stand-in-google.ts", () => {
  test("on this machine only: it serves its key set and signs an ID token for the nonce and client id it is given", async () => {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const p = Bun.spawn(["bun", join(ROOT, "scripts", "stand-in-google.ts"), String(port)], { stdout: "pipe", stderr: "pipe" });
    try {
      let certs: Response | null = null;
      for (let i = 0; i < 50 && !certs; i++) { try { certs = await realFetch(`http://127.0.0.1:${port}/certs`); } catch { await Bun.sleep(100); } }
      expect(certs?.status).toBe(200);
      const keys = (await certs!.json()) as { keys: { kty: string; kid: string; n: string; e: string }[] };
      expect(keys.keys.length).toBe(1);
      expect(JSON.stringify(keys)).not.toMatch(/"d"|"p"|"q"/);   // the public half only
      const r = await realFetch(`http://127.0.0.1:${port}/id-token`, { method: "POST", body: JSON.stringify({ nonce: "n-123", clientId: "the-client" }) });
      const { idToken, sub } = (await r.json()) as { idToken: string; sub: string };
      const check = createGoogleVerifier({ clientId: "the-client", fetch: (async () => Response.json(keys)) as unknown as typeof fetch });
      const c = await check(idToken);
      expect(c.ok).toBe(true);
      if (c.ok) { expect(c.identity.nonce).toBe("n-123"); expect(c.identity.ownerId).toBe(`google:${sub}`); expect(c.identity.email).toMatch(/@example\.com$/); }
      expect((await realFetch(`http://127.0.0.1:${port}/id-token`, { method: "POST", body: "{}" })).status).toBe(400);
    } finally { p.kill(); }
  });
});

describe("scripts/verify-dev.sh, the whole server on this Mac, on a stand in for wrangler dev", () => {
  // Runs the script on a stand in for `wrangler dev`. `before` is shell run by that stand in first, with its output in the
  // server's log, so a test can make the "server" print something it never should.
  function run(before = "") {
    const dir = mkdtempSync(join(tmpdir(), "squibby-m116-dev-")); dirs.push(dir);
    const bin = join(dir, "wrangler");
    writeFileSync(bin, `#!/bin/sh\n[ "$1" = "dev" ] || exit 9\n${before}\nshift; while [ $# -gt 0 ]; do [ "$1" = "--port" ] && port="$2"; shift; done\nexec bun "${join(ROOT, "test", "dev-stand-in-worker.ts")}" --port "$port"\n`);
    chmodSync(bin, 0o755);
    const base = 20000 + Math.floor(Math.random() * 15000);
    const ports = { MODEL_PORT: String(base), GOOGLE_PORT: String(base + 1), WORKER_PORT: String(base + 2) };
    const out = join(dir, "out");
    const p = Bun.spawnSync(["sh", join(ROOT, "scripts", "verify-dev.sh")], { env: { ...process.env, WRANGLER: bin, SQUIBBY_DIST: out, ...ports }, cwd: ROOT });
    return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), out };
  }
  test("sign in, /v1/me, a metered request, a signed test webhook and sign out, each proven; nothing private in the logs", () => {
    const { code, text, out } = run();
    for (const line of [
      "PASS: sign in with the stand in Google gave a sign in token on the free plan",
      "PASS: the same nonce a second time was refused",
      "PASS: /v1/me answered the free plan",
      "PASS: one metered request",
      "PASS: /v1/me shows today's use above 0",
      "PASS: a signed test webhook turned Pro on",
      "PASS: an unsigned webhook was refused and changed nothing",
      "PASS: after sign out the token is refused",
      "PASS: no sign in token, ID token, email, key or secret in the server's log",
      "PASS: the whole server works on this Mac.",
    ]) expect(text).toContain(line);
    expect(code).toBe(0);
    expect(existsSync(join(ROOT, ".dev.vars"))).toBe(false);   // the made up settings are removed after the run
    // What the script printed holds no token or ID token either.
    expect(text).not.toMatch(/cmp_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}/);
    // The run's files hold no token and no ID token: only logs and short answers stay in the output folder.
    for (const f of readdirSync(out)) expect(readFileSync(join(out, f), "utf8")).not.toMatch(/cmp_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}/);
  }, 60000);
  test("S6 review: a server log holding a made up secret of the run fails it (the user id secret and the webhook secret too)", () => {
    for (const name of ["METADATA_USER_ID_SECRET", "DODO_WEBHOOK_SECRET", "ANTHROPIC_API_KEY"]) {
      const { code, text } = run(`grep '^${name}=' .dev.vars | cut -d= -f2-`);
      expect(text).toContain("the server's log holds something private");
      expect(text).not.toContain("PASS: the whole server works on this Mac.");
      expect(code).not.toBe(0);
      expect(existsSync(join(ROOT, ".dev.vars"))).toBe(false);
    }
  }, 120000);
  test("S6 review: no sign in token or ID token is ever an argument of a command (others on this Mac can see those)", () => {
    const script = readFileSync(join(ROOT, "scripts", "verify-dev.sh"), "utf8");
    for (const line of script.split("\n").filter((l) => !l.trim().startsWith("#") && /\bcurl\b|\bbun\b/.test(l))) {
      // Only printf (built into the shell) may hold one, and only to the left of the pipe into the command.
      for (const cmd of line.split("|").filter((c) => !/^\s*(\w+=\$\()?printf\b/.test(c))) {
        expect(cmd).not.toMatch(/\$\{?(TOKEN|ID_TOKEN|SECOND)\b/);
      }
    }
  });
});
