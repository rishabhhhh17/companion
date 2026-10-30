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
  test("the engine asks before every tool call, in tasks and in the look-only flows", () => {
    const src = require("node:fs").readFileSync(new URL("../src/agent.ts", import.meta.url), "utf8") as string;
    expect(src).toContain("const base = await withLookup(evaluate(");
    expect(src).toContain("const v = await withLookup(evaluateReadOnly(");
  });
});
