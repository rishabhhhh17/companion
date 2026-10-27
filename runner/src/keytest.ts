// The check right after a key is saved (M15 wave 1, "a bad key is only found on the first task"). Anthropic's list of
// models answers any good key and costs nothing, so setup can say "Anthropic accepted your key" or why not, before the
// person's first fix. The key goes only to Anthropic, in its own header, and is never repeated or logged. Whether the
// account has credit is not something this can see: a fix without credit still says so plainly (reach.ts billing_error).
export const KEY_TEST_URL = "https://api.anthropic.com/v1/models?limit=1";
export type KeyTest = "works" | "refused" | "no_connection" | "unknown";

export async function testKey(key: string, fetchFn: typeof fetch = fetch, timeoutMs = 8_000): Promise<KeyTest> {
  if (!key) return "unknown";
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const res = await fetchFn(KEY_TEST_URL, { method: "GET", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: stop.signal });
    if (res.ok) return "works";
    return res.status === 401 || res.status === 403 ? "refused" : "unknown";
  } catch (e) {
    return stop.signal.aborted ? "unknown" : /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|network|unable to connect/i.test(String((e as Error)?.message ?? e)) ? "no_connection" : "unknown";
  } finally {
    clearTimeout(timer);
  }
}
