import { describe, expect, test } from "bun:test";
import { KEY_TEST_URL, testKey } from "../src/keytest.ts";

// The check right after a key is saved (M15 wave 1): Anthropic's list of models answers any good key and costs nothing, so a
// wrong key is found in setup, not on the first fix. The key goes only to Anthropic, in its header, and is never repeated.
const KEY = "sk-ant-api03-TESTKEY-0000000000000000000000000000";
type Seen = { url: string; headers: Record<string, string>; method: string };
const answer = (status: number, seen?: Seen[]) => (async (url: string, init: RequestInit) => {
  seen?.push({ url, headers: init.headers as Record<string, string>, method: init.method ?? "GET" });
  return new Response("{}", { status });
}) as unknown as typeof fetch;

describe("testing a saved key", () => {
  test("a good key: Anthropic answered, with the key only in its own header, on the free list of models", async () => {
    const seen: Seen[] = [];
    expect(await testKey(KEY, answer(200, seen))).toBe("works");
    expect(seen.length).toBe(1);
    expect(seen[0].url).toBe(KEY_TEST_URL);
    expect(KEY_TEST_URL).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers["x-api-key"]).toBe(KEY);
    expect(seen[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(seen[0].url).not.toContain(KEY);
  });
  test("Anthropic refused it", async () => {
    expect(await testKey(KEY, answer(401))).toBe("refused");
    expect(await testKey(KEY, answer(403))).toBe("refused");
  });
  test("no answer at all is a connection problem, never a bad key", async () => {
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await testKey(KEY, down)).toBe("no_connection");
  });
  test("anything else (Anthropic busy, an odd answer) is unknown, so nothing is claimed", async () => {
    for (const s of [429, 500, 529, 404]) expect(await testKey(KEY, answer(s))).toBe("unknown");
  });
  test("it gives up after a few seconds instead of hanging setup", async () => {
    const never = ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await testKey(KEY, never, 20)).toBe("unknown");
  });
  test("no key: nothing is sent", async () => {
    const seen: Seen[] = [];
    expect(await testKey("", answer(200, seen))).toBe("unknown");
    expect(seen.length).toBe(0);
  });
});
