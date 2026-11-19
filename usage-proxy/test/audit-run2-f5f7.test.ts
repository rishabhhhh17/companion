// Audit run 2, findings 5 and 7 (both low). Run on a stand in wrangler, a fake of the Durable Object API and a stand in model on
// 127.0.0.1: no network beyond this machine, no real key, nothing deployed.
//
// Finding 5: in Dodo test mode anyone can pay with a free test card. With forwarding on, that test "payment" gave real Pro limits
// on Squibby's own Anthropic key. Two guards now: scripts/deploy.sh refuses PROXY_ON together with payments on Dodo's test
// address, and the proxy holds every paid plan to Free's limits while Dodo is in test mode (TEST_PAYERS names the few owners,
// such as the founder's own account, who keep their paid limits there).
//
// Finding 7: a reply that is not streamed was read and booked with nothing keeping the server running, so a client that went
// away could stop its booking. The whole forward, read, booking and let go is now kept alive with waitUntil.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle, ALWAYS_SECRETS, FORWARDING_SECRETS, PAYMENT_SECRETS, type Env } from "../src/worker.ts";
import { DurableStore } from "../src/store-do.ts";
import { issueToken } from "../src/accounts.ts";
import { createProxy } from "../src/proxy.ts";
import { MemoryStore } from "../src/store.ts";
import { newToken } from "../src/tokens.ts";
import { costOf } from "../src/usage.ts";
import { PLANS } from "../src/plans.ts";
import { FakeNamespace } from "./fake-do.ts";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "deploy.sh");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A stand in wrangler (the same shape as deploy.test.ts), run from a copy of the script beside the given wrangler.toml. */
function deploy(o: { secrets: string[]; provider?: string; base?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "squibby-f5-")); dirs.push(dir);
  const calls = join(dir, "calls.txt"), bin = join(dir, "wrangler");
  writeFileSync(join(dir, "names.json"), JSON.stringify(o.secrets.map((name) => ({ name, type: "secret_text" })), null, 2));
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> "${calls}"
case "$1 $2" in
  "deploy --dry-run")
    out=""; prev=""; for a in "$@"; do [ "$prev" = "--outdir" ] && out="$a"; prev="$a"; done
    echo "export class StoreObject {}" > "$out/entry.js"
    echo 'env.STORE (StoreObject)      Durable Object'
    echo 'env.PAYMENT_PROVIDER ("${o.provider ?? "none"}")      Environment Variable'
    exit 0 ;;
  "secret list") cat "${join(dir, "names.json")}"; exit 0 ;;
  "deploy ") echo "Uploaded"; exit 0 ;;
esac
exit 9
`);
  chmodSync(bin, 0o755);
  mkdirSync(join(dir, "proj", "scripts"), { recursive: true });
  const script = join(dir, "proj", "scripts", "deploy.sh");
  copyFileSync(SCRIPT, script);
  writeFileSync(join(dir, "proj", "wrangler.toml"), `name = "x"\nmain = "src/entry.ts"\n[vars]\nPAYMENT_PROVIDER = "${o.provider ?? "none"}"\n${o.base ? `DODO_API_BASE = "${o.base}"\n` : ""}`);
  return (args: string[]) => {
    const p = Bun.spawnSync(["sh", script, ...args], { env: { PATH: `${dir}:/usr/bin:/bin`, WRANGLER: bin, SQUIBBY_DIST: join(dir, "dist"), HOME: dir } });
    const c = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : [];
    return { code: p.exitCode, text: p.stdout.toString() + p.stderr.toString(), deploys: c.filter((x) => x.startsWith("deploy") && !x.includes("--dry-run")) };
  };
}
const TEST_BASE = "https://test.dodopayments.com", LIVE_BASE = "https://live.dodopayments.com";
const ALL_ON = [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS, ...PAYMENT_SECRETS];

describe("finding 5: scripts/deploy.sh never deploys forwarding with test mode payments", () => {
  test("PROXY_ON with PAYMENTS_ON on Dodo's test address (set, or the default) is refused and nothing is deployed", () => {
    for (const base of [TEST_BASE, undefined]) {
      const r = deploy({ secrets: [...ALL_ON, "PAYMENTS_ON"], base })(["--apply"]);
      expect(r.code).toBe(1);
      expect(r.text).toContain("test mode");
      expect(r.text).toContain("Nothing was deployed");
      expect(r.deploys).toEqual([]);
    }
  });
  test("PROXY_ON with PAYMENT_PROVIDER dodo on the test address is refused too (the webhook takes test events)", () => {
    const r = deploy({ secrets: ALL_ON, provider: "dodo", base: TEST_BASE })(["--apply"]);
    expect(r.code).toBe(1);
    expect(r.deploys).toEqual([]);
  });
  test("each alone still deploys, and both together on the live address with --live-payments", () => {
    expect(deploy({ secrets: [...ALWAYS_SECRETS, "PROXY_ON", ...FORWARDING_SECRETS], base: TEST_BASE })(["--apply"]).code).toBe(0);
    expect(deploy({ secrets: [...ALWAYS_SECRETS, "PAYMENTS_ON", ...PAYMENT_SECRETS], base: TEST_BASE })(["--apply"]).code).toBe(0);
    const live = deploy({ secrets: [...ALL_ON, "PAYMENTS_ON"], base: LIVE_BASE })(["--apply", "--live-payments"]);
    expect(live.code).toBe(0);
    expect(live.deploys).toEqual(["deploy"]);
  });
  test("a dry run still builds and deploys nothing, whatever the switches", () => {
    const r = deploy({ secrets: [...ALL_ON, "PAYMENTS_ON"], base: TEST_BASE })([]);
    expect(r.code).toBe(0);
    expect(r.deploys).toEqual([]);
  });
});

// The Worker, end to end, with a stand in model.
const KEY = "sk-ant-api03-STAND-IN-KEY-000000000000000000";
const SECRET = "f5-test-user-id-secret-0123456789abcdef0123";
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const MODEL = "claude-sonnet-5-5";
let server: ReturnType<typeof Bun.serve>;
let forwarded = 0;
beforeAll(() => {
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    await req.text(); forwarded++;
    return Response.json({ id: "m", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 10, output_tokens: 10 } });
  } });
});
afterAll(() => server.stop(true));

/** Already spent today: past Free's day limit, well inside Pro's. */
const SPENT_TODAY = (PLANS.free.dailyUsd + PLANS.pro.dailyUsd) / 2;

async function proAsk(over: Partial<Env>, owner = "google:42") {
  const fake = new FakeNamespace();
  const env: Env = { STORE: fake, PROXY_ON: "on", ANTHROPIC_API_KEY: KEY, METADATA_USER_ID_SECRET: SECRET, UPSTREAM_BASE: `http://127.0.0.1:${server.port}`, ...over };
  const store = new DurableStore(fake, () => NOW);
  // The state a test mode subscription.active leaves: the owner's plan is pro.
  const t = await issueToken(store, owner, "pro"); if (!t.ok) throw new Error("setup");
  // Today's spend so far, booked the way a finished request books it.
  const id = "earlier";
  const s = await store.start(owner, { max: 4, usd: 0, now: NOW, limits: PLANS.pro, id, need: 0 });
  if (!s.ok) throw new Error("setup");
  await store.finish(owner, { id, now: NOW, record: { userId: owner, model: MODEL, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }, usd: SPENT_TODAY, at: NOW, complete: true } });
  const waits: Promise<unknown>[] = [];
  const body = JSON.stringify({ model: MODEL, max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
  const r = await handle(new Request("https://usage.example/v1/messages", { method: "POST", headers: { "x-api-key": t.token, "content-type": "application/json" }, body }), env, { waitUntil: (p) => { waits.push(p); } }, () => NOW);
  await Promise.all(waits);
  return r;
}

describe("finding 5: while Dodo is in test mode, a paid plan has Free's limits", () => {
  test("a Pro owner on the test address (set, or the default) is held to Free: with more spent today than Free allows, refused and nothing sent", async () => {
    for (const base of [TEST_BASE, undefined]) {
      forwarded = 0;
      const r = await proAsk({ PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", ...(base ? { DODO_API_BASE: base } : {}) });
      expect(r.status).toBe(402);
      expect(forwarded).toBe(0);
    }
  });
  test("an owner named in TEST_PAYERS keeps Pro's limits in test mode; one not named does not", async () => {
    const env = { PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: TEST_BASE, TEST_PAYERS: " google:7 , google:42 " };
    forwarded = 0;
    expect((await proAsk(env, "google:42")).status).toBe(200);
    expect(forwarded).toBe(1);
    expect((await proAsk(env, "google:99")).status).toBe(402);
  });
  test("on the live address a Pro owner has Pro's limits", async () => {
    forwarded = 0;
    const r = await proAsk({ PAYMENTS_ON: "on", PAYMENT_PROVIDER: "dodo", DODO_API_BASE: LIVE_BASE });
    expect(r.status).toBe(200);
    expect(forwarded).toBe(1);
  });
});

describe("finding 7: a reply that is not streamed is booked under waitUntil", () => {
  test("the forward, read and booking are kept alive with waitUntil, so a handler nobody waits for still books", async () => {
    const store = new MemoryStore();
    const t = await newToken();
    await store.addUser(t.hash, { id: "u1", plan: "free", status: "active" });
    let send: (s: string) => void = () => {};
    const reply = new Promise<string>((r) => { send = r; });
    const upstream = (async () => {
      const text = await reply;
      return new Response(text, { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const waits: Promise<unknown>[] = [];
    const proxy = createProxy({ store, anthropicKey: KEY, userIdSecret: SECRET, enabled: () => true, fetch: upstream, now: () => NOW, waitUntil: (p) => { waits.push(p); } });
    // The client sends and goes away: nobody waits for this handler's answer.
    void proxy(new Request("https://proxy.example/v1/messages", { method: "POST", headers: { "x-api-key": t.token, "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 100, messages: [{ role: "user", content: "hi" }] }) }));
    for (let i = 0; i < 50 && waits.length === 0; i++) await new Promise((r) => setTimeout(r, 1));
    // Before the reply has come back, the server has already been told to keep running.
    expect(waits.length).toBeGreaterThan(0);
    send(JSON.stringify({ id: "m", content: [], usage: { input_tokens: 1000, output_tokens: 500 } }));
    await Promise.all(waits);
    // What waitUntil covered includes the booking.
    expect(store.records.length).toBe(1);
    expect(store.records[0].usd).toBeCloseTo(costOf(MODEL, { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 }), 10);
  });
});
