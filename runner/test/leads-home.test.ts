import { describe, expect, test } from "bun:test";
import { leadsHome, withLookup, type Verdict } from "../src/safety.ts";

// Launch check (15 Oct 2026): a name that looks public but leads to this Mac or a private network is refused.
const ok: Verdict = { decision: "allow", reason: "", undoable: true };
const answers = (m: Record<string, string[]>) => async (h: string) => { if (!(h in m)) throw new Error("no such name"); return m[h]; };

describe("a web address that leads home", () => {
  test("a public name that answers with this Mac or a private network is refused", async () => {
    const look = answers({ "evil.example.com": ["93.184.216.34", "127.0.0.1"], "lan.example.com": ["192.168.1.10"], "v6.example.com": ["::1"], "good.example.com": ["93.184.216.34"] });
    expect(await leadsHome("https://evil.example.com/x", look)).toContain("this Mac");
    expect(await leadsHome("https://lan.example.com/", look)).toBeTruthy();
    expect(await leadsHome("https://v6.example.com/", look)).toBeTruthy();
    expect(await leadsHome("https://good.example.com/", look)).toBeNull();
  });
  test("numbers, bad addresses and names that cannot be found are left to the other checks", async () => {
    const look = answers({});
    expect(await leadsHome("https://93.184.216.34/", look)).toBeNull();
    expect(await leadsHome("not a url", look)).toBeNull();
    expect(await leadsHome("https://nowhere.example.com/", look)).toBeNull();
  });
  test("only a web fetch is looked up, and a verdict already refused stays refused", async () => {
    const look = answers({ "evil.example.com": ["10.0.0.5"] });
    expect((await withLookup(ok, "WebFetch", { url: "https://evil.example.com" }, look)).decision).toBe("deny");
    expect((await withLookup(ok, "Read", { url: "https://evil.example.com" }, look)).decision).toBe("allow");
    const refused: Verdict = { decision: "deny", reason: "x", undoable: true };
    expect(await withLookup(refused, "WebFetch", { url: "https://good.example.com" }, look)).toBe(refused);
  });
  // Review of 31 Oct 2026: a name that made the fetch ask (it may carry data) was looked up before the card was answered, so
  // the name left this Mac even on a no. It is looked up only after a yes now.
  test("a fetch that asks is not looked up before the card is answered", async () => {
    let lookups = 0;
    const look = async () => { lookups++; return ["93.184.216.34"]; };
    const asks: Verdict = { decision: "ask", risk: "network", reason: "this web address looks like it carries data in it", undoable: false };
    expect(await withLookup(asks, "WebFetch", { url: "https://a1b2c3d4e5f6g7h8i9j0k1l2.evil.example/x" }, look)).toBe(asks);
    expect(lookups).toBe(0);
  });
  test("after a yes, the name is looked up, and one that leads home is still refused", () => {
    const src = require("node:fs").readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8") as string;
    const yes = src.indexOf("if (forTask && key && !s.abort.signal.aborted) s.taskAllowed.add(key);");
    const after = src.indexOf("await leadsHome(", src.indexOf('this.emit({ type: "approval.resolved"'));
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(yes);
  });
  test("the engine asks before every tool call, in tasks and in the look-only flows", () => {
    const src = require("node:fs").readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8") as string;
    expect(src).toContain("const base = await withLookup(evaluate(");
    expect(src).toContain("const v = await withLookup(evaluateReadOnly(");
  });
});
