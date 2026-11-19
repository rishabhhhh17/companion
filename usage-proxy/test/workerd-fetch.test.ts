// M116 step 6, found on the first run under real `wrangler dev` (workerd): two ways of calling fetch that Bun accepts and
// Cloudflare's runtime refuses, so they passed every test here and would have failed on the real server.
//   1. `redirect: "error"` throws in workerd ("won't be implemented ... use manual"). The Google key fetch used it, so every
//      sign in with Google failed with keys_unavailable.
//   2. The global fetch called as a method of another object (`api.fetch(...)`) throws "Illegal invocation". Dodo's checkout and
//      portal calls did that, so checkout would have failed with nothing charged.
// workerdFetch below behaves like workerd on both points, and every outside call is checked against it.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGoogleVerifier } from "../src/google.ts";
import { createCheckout, createPortal } from "../src/dodo-api.ts";
import { claimsAt, keyPair, signIdToken } from "./google-stand-in.ts";

function workerdFetch(answer: (url: string) => Response) {
  const calls: { url: string; redirect?: string }[] = [];
  const f = function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
    if (init?.redirect === "error") throw new TypeError("Invalid redirect value, must be one of \"follow\" or \"manual\".");
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, ...(init?.redirect ? { redirect: init.redirect } : {}) });
    return Promise.resolve(answer(url));
  } as unknown as typeof fetch;
  return { f, calls };
}

describe("fetch the way Cloudflare's runtime allows it", () => {
  test("the Google key fetch works on a workerd shaped fetch, and never follows a redirect", async () => {
    const key = await keyPair("kid-workerd");
    const w = workerdFetch(() => Response.json({ keys: [key.jwk] }));
    const check = createGoogleVerifier({ clientId: "c", fetch: w.f });
    const r = await check(await signIdToken(key, claimsAt(Date.now(), { aud: "c" })));
    expect(r.ok).toBe(true);
    expect(w.calls.map((c) => c.redirect)).toEqual(["manual"]);
  });
  test("a redirect from the key address is not followed: the keys count as unavailable", async () => {
    const key = await keyPair("kid-workerd-2");
    const w = workerdFetch(() => new Response(null, { status: 302, headers: { location: "https://keys.evil.example/certs" } }));
    const check = createGoogleVerifier({ clientId: "c", fetch: w.f });
    const r = await check(await signIdToken(key, claimsAt(Date.now(), { aud: "c" })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("keys_unavailable");
    expect(w.calls.length).toBe(1);
  });
  test("Dodo's checkout and portal calls work on a workerd shaped fetch", async () => {
    const w = workerdFetch((u) => Response.json(u.endsWith("/checkouts") ? { checkout_url: "https://test.checkout.dodopayments.com/x" } : { link: "https://test.customer.dodopayments.com/y" }));
    const api = { base: "https://test.dodopayments.com", key: "made-up", fetch: w.f };
    const body = { product_cart: [{ product_id: "p", quantity: 1 }], customer: { email: "a@example.com" }, metadata: {}, return_url: "https://x.example/paid", cancel_url: "https://x.example/paid/cancelled", feature_flags: { allow_customer_editing_email: false } };
    expect(await createCheckout(api, body)).toBe("https://test.checkout.dodopayments.com/x");
    expect(await createPortal(api, "cus_1")).toBe("https://test.customer.dodopayments.com/y");
    expect(w.calls.length).toBe(2);
  });
  test("no server source asks fetch for redirect \"error\"", () => {
    const dir = join(import.meta.dir, "..", "src");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) expect(readFileSync(join(dir, f), "utf8")).not.toMatch(/redirect:\s*["']error["']/);
  });
});
